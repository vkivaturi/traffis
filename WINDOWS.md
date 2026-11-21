# Traffis on Windows — Dependencies, Build & Run

This guide covers setting up, running, and packaging the Traffis Tauri desktop app on **Windows 10/11 (x64)**. For the general (cross-platform) guide see [README.md](README.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 1. Dependencies

| Dependency | Version | Why it is needed | Install |
| :--- | :--- | :--- | :--- |
| **Eclipse SUMO** | 1.20+ | Traffic physics engine (`sumo.exe`, `netconvert.exe`) | Installer from [eclipse.dev/sumo](https://eclipse.dev/sumo/) |
| **Python** | 3.12+ | FastAPI + TraCI backend | `winget install Python.Python.3.12` (or newer) |
| **Node.js + npm** | 20+ | Vite/React frontend and the Tauri CLI | `winget install OpenJS.NodeJS.LTS` |
| **Rust (MSVC toolchain)** | stable | Compiles the Tauri desktop shell | `winget install Rustlang.Rustup` |
| **Visual Studio 2022 Build Tools** ("Desktop development with C++") | 17.x | MSVC linker + Windows SDK required by Rust on Windows | See below |
| **Microsoft Edge WebView2 Runtime** | any | Native WebView that hosts the UI | Preinstalled on Windows 11 / current Windows 10; otherwise [download](https://developer.microsoft.com/microsoft-edge/webview2/) |

### Installing the Visual Studio Build Tools

Run from an **elevated (Administrator) PowerShell** and accept the UAC prompt:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--passive --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

> Exit code `1602` means the installer was cancelled (usually a declined or timed-out UAC prompt) — re-run and approve it.

### After installing Rust

`rustup` adds `%USERPROFILE%\.cargo\bin` to your **user** PATH, but already-open terminals (and terminals embedded in an already-running editor/IDE) keep the old PATH. Either fully restart the editor / open a new terminal window, or patch the current session:

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo --version   # should print a version
```

Make sure the MSVC toolchain is the default:

```powershell
rustup default stable-x86_64-pc-windows-msvc
```

### SUMO_HOME

The app looks for SUMO in this order:

1. The `SUMO_HOME` environment variable (the SUMO installer usually sets it, e.g. `C:\Program Files (x86)\Eclipse\Sumo` or `C:\Program Files (x86)\SUMO`).
2. `C:\Program Files (x86)\Eclipse\Sumo`
3. `C:\Program Files\Eclipse\Sumo`

`SUMO_HOME` must contain `bin\sumo.exe`. If none is found, the in-app **Desktop Environment Setup** modal lets you browse to the folder.

---

## 2. PowerShell Execution Policy

By default, PowerShell refuses to run `npm.ps1`:

```
npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system.
```

Fix it once for your user (no admin required):

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Alternatively, call `npm.cmd` instead of `npm`, or use Command Prompt (`cmd.exe`).

---

## 3. One-Time Project Setup

From the repository root (`C:\...\traffis`):

```powershell
# Python backend virtual environment
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..

# Frontend + Tauri CLI
npm --prefix frontend install
```

> There is **no `package.json` at the repository root** — running `npm install` there fails with `ENOENT`. Always target `frontend/` (via `--prefix frontend` or by `cd frontend`).

The SUMO road networks (`*.net.xml`) are compiled automatically by `backend/run.py` on first start. To rebuild them manually (e.g. after editing `.nod.xml` / `.edg.xml` / `.con.xml`):

```powershell
.\backend\.venv\Scripts\python.exe backend\sumo_config\build_network.py
```

---

## 4. Run in Development Mode

From the repository root:

```powershell
npm --prefix frontend run tauri dev
```

(or `cd frontend; npm run tauri dev`)

What happens:

1. Vite starts the dev server on `http://localhost:5173`.
2. Cargo compiles the Rust shell (the **first build takes a few minutes**; subsequent launches take about a second) and opens the **Traffis** window.
3. The shell auto-detects `backend\.venv\Scripts\python.exe` and `SUMO_HOME`, validates them, picks a free `127.0.0.1` port, and spawns `backend\run.py`, which launches `sumo.exe`.
4. Closing the window stops the Python backend and SUMO.

> Two `python.exe` processes for one backend is normal on Windows — the venv `python.exe` is a small launcher that starts the real interpreter.

---

## 5. Build a Windows Installer

```powershell
npm --prefix frontend run tauri build
```

Outputs (under `src-tauri\target\release\`):

| Artifact | Path |
| :--- | :--- |
| Executable | `traffis-desktop.exe` |
| MSI installer (WiX) | `bundle\msi\Traffis_<version>_x64_en-US.msi` |
| NSIS setup | `bundle\nsis\Traffis_<version>_x64-setup.exe` |

Tauri downloads the WiX / NSIS tooling automatically on the first bundle build (network access required).

> End users still need **Python (with `backend/requirements.txt` installed)** and **Eclipse SUMO** on their machine; the app prompts for both paths on first launch.

---

## 6. Saved Settings

Paths chosen in the setup modal (or via the **Paths** header button) are stored in:

```
%APPDATA%\com.traffis.desktop\settings.json
```

Delete this file to force auto-detection / the setup modal on the next launch.

---

## 7. Verification

```powershell
npm --prefix frontend run lint
npm --prefix frontend run build
cargo check --manifest-path src-tauri/Cargo.toml
.\backend\.venv\Scripts\python.exe -c "import sys; sys.path.insert(0, 'backend'); from app.main import app; print(app.title)"
```

---

## 8. Troubleshooting

| Symptom | Cause / Fix |
| :--- | :--- |
| `npm.ps1 cannot be loaded because running scripts is disabled` | PowerShell execution policy — see [§2](#2-powershell-execution-policy). |
| `npm error enoent Could not read package.json` | Ran npm in the repo root; use `npm --prefix frontend ...`. |
| `failed to run 'cargo metadata' ... program not found` | Terminal has a stale PATH from before Rust was installed — restart the editor/terminal or prepend `%USERPROFILE%\.cargo\bin` (see [§1](#after-installing-rust)). |
| `linker 'link.exe' not found` | Visual Studio Build Tools (C++ workload) missing — install as in [§1](#installing-the-visual-studio-build-tools). |
| Winget Build Tools install fails with exit code `1602` | UAC prompt was declined/timed out — re-run from an elevated PowerShell. |
| Setup modal: *missing required packages (fastapi, uvicorn, traci)* | Point **Python Executable Path** to `backend\.venv\Scripts\python.exe` and install `backend\requirements.txt`. |
| Setup modal: *`sumo.exe` binary was not found* | Point **SUMO_HOME** at the SUMO install root containing `bin\sumo.exe`. |
| Stray `sumo.exe` after a crash | `taskkill /IM sumo.exe /F` |

