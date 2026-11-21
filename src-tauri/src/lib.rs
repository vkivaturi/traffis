use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, RunEvent};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn background_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DesktopPaths {
    pub python_path: String,
    pub sumo_home: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DesktopStatus {
    pub python_path: String,
    pub sumo_home: String,
    pub detected_python: Option<String>,
    pub detected_sumo_home: Option<String>,
    pub backend_port: Option<u16>,
    pub backend_running: bool,
    pub backend_error: Option<String>,
    pub needs_setup: bool,
}

pub struct BackendState {
    child: Mutex<Option<Child>>,
    port: Mutex<Option<u16>>,
    last_error: Mutex<Option<String>>,
    paths: Mutex<DesktopPaths>,
}

impl Default for BackendState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            port: Mutex::new(None),
            last_error: Mutex::new(None),
            paths: Mutex::new(DesktopPaths::default()),
        }
    }
}

fn config_file_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("settings.json"))
}

fn load_saved_paths(app: &AppHandle) -> DesktopPaths {
    if let Some(path) = config_file_path(app) {
        if let Ok(contents) = fs::read_to_string(path) {
            if let Ok(parsed) = serde_json::from_str::<DesktopPaths>(&contents) {
                return parsed;
            }
        }
    }
    DesktopPaths::default()
}

fn save_paths_to_disk(app: &AppHandle, paths: &DesktopPaths) -> Result<(), String> {
    let path = config_file_path(app).ok_or("Could not resolve app config directory")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(paths)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write settings: {e}"))
}

fn find_backend_dir(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("backend"));
        if let Some(parent) = cwd.parent() {
            candidates.push(parent.join("backend"));
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        for ancestor in exe.ancestors().take(6) {
            candidates.push(ancestor.join("backend"));
        }
    }

    if let Ok(res_dir) = app.path().resource_dir() {
        candidates.push(res_dir.join("backend"));
    }

    let manifest_parent = Path::new(env!("CARGO_MANIFEST_DIR")).parent();
    if let Some(root) = manifest_parent {
        candidates.push(root.join("backend"));
    }

    candidates
        .into_iter()
        .find(|dir| dir.join("run.py").is_file())
}

fn detect_python(backend_dir: Option<&Path>) -> Option<String> {
    if let Some(bdir) = backend_dir {
        let venv_candidates = [
            bdir.join(".venv").join("bin").join("python"),
            bdir.join(".venv").join("bin").join("python3"),
            bdir.join(".venv").join("Scripts").join("python.exe"),
        ];
        for c in venv_candidates {
            if c.is_file() {
                return Some(c.to_string_lossy().to_string());
            }
        }
    }

    let which_cmd = if cfg!(windows) { "where" } else { "which" };
    for bin in ["python3", "python"] {
        if let Ok(output) = background_command(which_cmd).arg(bin).output() {
            if output.status.success() {
                if let Some(first_line) = String::from_utf8_lossy(&output.stdout).lines().next() {
                    let trimmed = first_line.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    }
    None
}

fn detect_sumo_home() -> Option<String> {
    if let Ok(env_home) = std::env::var("SUMO_HOME") {
        if !env_home.is_empty() && Path::new(&env_home).exists() {
            return Some(env_home);
        }
    }

    let candidates = [
        "/Library/Frameworks/EclipseSUMO.framework/Versions/Current/EclipseSUMO/share/sumo",
        "/opt/homebrew/share/sumo",
        "/usr/local/share/sumo",
        "/usr/share/sumo",
        r"C:\Program Files (x86)\Eclipse\Sumo",
        r"C:\Program Files\Eclipse\Sumo",
    ];

    for c in candidates {
        if Path::new(c).exists() {
            return Some(c.to_string());
        }
    }
    None
}

fn validate_python(python_path: &str) -> Result<(), String> {
    let trimmed = python_path.trim();
    if trimmed.is_empty() {
        return Err("Python path is empty.".to_string());
    }

    let ver = background_command(trimmed)
        .arg("--version")
        .output()
        .map_err(|e| format!("Could not execute Python at '{trimmed}': {e}"))?;
    if !ver.status.success() {
        return Err(format!("Python at '{trimmed}' exited with an error."));
    }

    let deps = background_command(trimmed)
        .args(["-c", "import fastapi, uvicorn, traci"])
        .output()
        .map_err(|e| format!("Failed to check Python dependencies: {e}"))?;
    if !deps.status.success() {
        let stderr = String::from_utf8_lossy(&deps.stderr);
        return Err(format!(
            "Python at '{trimmed}' is missing required packages (fastapi, uvicorn, traci). \
             Point to your backend .venv Python or install backend/requirements.txt.\n{stderr}"
        ));
    }

    Ok(())
}

fn validate_sumo_home(sumo_home: &str) -> Result<(), String> {
    let trimmed = sumo_home.trim();
    if trimmed.is_empty() {
        return Err("SUMO_HOME path is empty.".to_string());
    }
    let home_path = Path::new(trimmed);
    if !home_path.exists() {
        return Err(format!("SUMO_HOME directory does not exist: '{trimmed}'"));
    }

    let bin_name = if cfg!(windows) { "sumo.exe" } else { "sumo" };
    let candidates = [
        home_path.join("bin").join(bin_name),
        home_path.join("..").join("..").join("bin").join(bin_name),
        PathBuf::from("/Library/Frameworks/EclipseSUMO.framework/Versions/Current/EclipseSUMO/bin")
            .join(bin_name),
        PathBuf::from("/opt/homebrew/bin").join(bin_name),
        PathBuf::from("/usr/local/bin").join(bin_name),
    ];

    let found_bin = candidates.iter().any(|p| p.is_file()) || {
        let which_cmd = if cfg!(windows) { "where" } else { "which" };
        background_command(which_cmd)
            .arg("sumo")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    };

    if !found_bin {
        return Err(format!(
            "SUMO_HOME '{trimmed}' exists, but the '{bin_name}' binary was not found."
        ));
    }

    Ok(())
}

fn pick_free_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind local port: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to read local port: {e}"))?
        .port();
    Ok(port)
}

fn check_health(port: u16) -> bool {
    if let Ok(mut stream) = TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().unwrap(),
        Duration::from_millis(250),
    ) {
        let _ = stream.set_read_timeout(Some(Duration::from_millis(400)));
        let req = format!("GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
        if stream.write_all(req.as_bytes()).is_ok() {
            let mut buf = [0u8; 256];
            if let Ok(n) = stream.read(&mut buf) {
                let resp = String::from_utf8_lossy(&buf[..n]);
                return resp.starts_with("HTTP/1.1 200") || resp.starts_with("HTTP/1.0 200");
            }
        }
    }
    false
}

fn stop_backend_process(state: &BackendState) {
    if let Ok(mut guard) = state.child.lock() {
        if let Some(mut child) = guard.take() {
            #[cfg(windows)]
            {
                let pid = child.id();
                let _ = background_command("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .output();
            }
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    if let Ok(mut p) = state.port.lock() {
        *p = None;
    }
}

fn start_backend_process(
    app: &AppHandle,
    python_path: &str,
    sumo_home: &str,
) -> Result<u16, String> {
    let state = app.state::<BackendState>();
    stop_backend_process(&state);

    validate_python(python_path)?;
    validate_sumo_home(sumo_home)?;

    let backend_dir = find_backend_dir(app)
        .ok_or_else(|| "Could not locate backend/run.py relative to the app.".to_string())?;
    let port = pick_free_port()?;

    let mut child = background_command(python_path.trim())
        .arg("run.py")
        .current_dir(&backend_dir)
        .env("TRAFFIS_HOST", "127.0.0.1")
        .env("TRAFFIS_PORT", port.to_string())
        .env("SUMO_HOME", sumo_home.trim())
        .env("PYTHONUNBUFFERED", "1")
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Python backend: {e}"))?;

    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        if let Ok(Some(status)) = child.try_wait() {
            let mut err_msg = String::new();
            if let Some(mut stderr) = child.stderr.take() {
                let _ = stderr.read_to_string(&mut err_msg);
            }
            return Err(format!(
                "Python backend exited early ({status}).\n{}",
                err_msg.trim()
            ));
        }

        if check_health(port) {
            if let Ok(mut guard) = state.child.lock() {
                *guard = Some(child);
            }
            if let Ok(mut p) = state.port.lock() {
                *p = Some(port);
            }
            if let Ok(mut err) = state.last_error.lock() {
                *err = None;
            }
            return Ok(port);
        }

        thread::sleep(Duration::from_millis(200));
    }

    let _ = child.kill();
    let _ = child.wait();
    Err("Timed out waiting for Python backend (/api/health) to become ready.".to_string())
}

#[tauri::command]
fn get_desktop_status(app: AppHandle) -> DesktopStatus {
    let state = app.state::<BackendState>();
    let backend_dir = find_backend_dir(&app);
    let detected_python = detect_python(backend_dir.as_deref());
    let detected_sumo_home = detect_sumo_home();

    let paths = state.paths.lock().map(|p| p.clone()).unwrap_or_default();
    let port = state.port.lock().ok().and_then(|p| *p);
    let last_error = state.last_error.lock().ok().and_then(|e| e.clone());

    let running = port.map(check_health).unwrap_or(false);

    DesktopStatus {
        python_path: paths.python_path,
        sumo_home: paths.sumo_home,
        detected_python,
        detected_sumo_home,
        backend_port: port,
        backend_running: running,
        backend_error: last_error,
        needs_setup: !running,
    }
}

#[tauri::command]
fn save_and_start_backend(
    app: AppHandle,
    python_path: String,
    sumo_home: String,
) -> Result<DesktopStatus, String> {
    let paths = DesktopPaths {
        python_path: python_path.trim().to_string(),
        sumo_home: sumo_home.trim().to_string(),
    };

    let state = app.state::<BackendState>();
    if let Ok(mut guard) = state.paths.lock() {
        *guard = paths.clone();
    }

    match start_backend_process(&app, &paths.python_path, &paths.sumo_home) {
        Ok(_) => {
            save_paths_to_disk(&app, &paths)?;
            Ok(get_desktop_status(app))
        }
        Err(err) => {
            if let Ok(mut e) = state.last_error.lock() {
                *e = Some(err.clone());
            }
            Err(err)
        }
    }
}

#[tauri::command]
fn stop_backend(app: AppHandle) {
    let state = app.state::<BackendState>();
    stop_backend_process(&state);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(BackendState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            let state = handle.state::<BackendState>();
            let saved = load_saved_paths(&handle);
            let backend_dir = find_backend_dir(&handle);

            let python_path = if !saved.python_path.is_empty() {
                saved.python_path
            } else {
                detect_python(backend_dir.as_deref()).unwrap_or_default()
            };

            let sumo_home = if !saved.sumo_home.is_empty() {
                saved.sumo_home
            } else {
                detect_sumo_home().unwrap_or_default()
            };

            if let Ok(mut guard) = state.paths.lock() {
                guard.python_path = python_path.clone();
                guard.sumo_home = sumo_home.clone();
            }

            if !python_path.is_empty() && !sumo_home.is_empty() {
                if let Err(err) = start_backend_process(&handle, &python_path, &sumo_home) {
                    if let Ok(mut e) = state.last_error.lock() {
                        *e = Some(err);
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_desktop_status,
            save_and_start_backend,
            stop_backend
        ])
        .build(tauri::generate_context!())
        .expect("error while building Traffis desktop application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                let state = app_handle.state::<BackendState>();
                stop_backend_process(&state);
            }
        });
}

