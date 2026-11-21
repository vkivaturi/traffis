# Traffis Desktop Development & Build Guide

Traffis is a **Rust + Tauri v2** desktop application that runs a local **Python 3.12 FastAPI + Eclipse SUMO** backend and renders a **React 19 + TypeScript HTML5 Canvas** interface in the OS native WebView.

> The previous browser/Docker/AWS EC2 deployment model is archived on the `release/v1-browser` branch.

---

## Architecture Summary

| Component | Runtime Role |
| :--- | :--- |
| **Tauri Shell (`src-tauri/`)** | Native desktop window, settings persistence (`settings.json`), native file/folder pickers, and Python backend process lifecycle management. |
| **Python Backend (`backend/`)** | Spawned by Tauri on an ephemeral loopback port (`127.0.0.1:<port>`). Runs FastAPI REST (`/api/*`), WebSocket (`/ws`), and TraCI. |
| **Eclipse SUMO** | Local `sumo` and `netconvert` binaries managed by the Python backend via `SUMO_HOME`. |
| **Frontend UI (`frontend/`)** | Vite + React 19 + TypeScript SPA loaded inside Tauri's WebView (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux). |

---

## Prerequisites

1. **Eclipse SUMO 1.20+**
   - **macOS (Official Framework)**: Installs to `/Library/Frameworks/EclipseSUMO.framework/Versions/Current/EclipseSUMO/share/sumo`
   - **macOS (Homebrew)**: `brew install sumo` → `/opt/homebrew/share/sumo`
   - **Linux (Ubuntu/Debian)**: `sudo apt-get install -y sumo sumo-tools` → `/usr/share/sumo`
   - **Windows**: Install from [eclipse.dev/sumo](https://eclipse.dev/sumo/) → `C:\Program Files (x86)\Eclipse\Sumo`
2. **Python 3.12+**
3. **Node.js 20+** and **npm**
4. **Rust & Cargo** (`rustc`, `cargo`) plus platform WebView build tools:
   - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
   - **Windows**: Microsoft C++ Build Tools & WebView2
   - **Linux**: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`

---

## Initial Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/vkivaturi/traffis.git
   cd traffis
   ```

2. **Create the Python virtual environment and install dependencies**:
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install --upgrade pip
   pip install -r requirements.txt
   cd ..
   ```

3. **Install Frontend & Tauri CLI packages**:
   ```bash
   cd frontend
   npm install
   cd ..
   ```

---

## Running in Development Mode

From the repository root (`/Users/vijay/Projects/traffis`):

```bash
npm --prefix frontend run tauri dev
```

What happens automatically:
1. Tauri starts the Vite dev server in `frontend/` on `http://localhost:5173`.
2. Tauri compiles and launches the native desktop window.
3. On startup, Rust checks saved settings (or auto-detects `backend/.venv/bin/python` and `SUMO_HOME`), validates `fastapi`/`uvicorn`/`traci` and the `sumo` binary, picks a free port on `127.0.0.1`, and spawns `backend/run.py`.
4. If Python or `SUMO_HOME` cannot be auto-detected, the **Desktop Environment Setup** modal opens so you can enter or browse for the paths.
5. Closing the app window automatically terminates the Python backend and SUMO processes.

---

## Building a Native Desktop Bundle

To build an optimized desktop executable/installer for your current OS:

```bash
npm --prefix frontend run tauri build
```

This runs `npm run build` in `frontend/` (`tsc -b && vite build`) and bundles the compiled assets with the Rust binary into `src-tauri/target/release/bundle/`.

> **Current assumption:** End users are expected to have Python (with `backend/requirements.txt`) and Eclipse SUMO installed locally. The app prompts for and saves their installation paths on first run.

---

## Configuration & Environment Variables

### Saved Desktop Settings (`settings.json`)
Stored automatically in the OS app config directory by Tauri (`app_config_dir()/settings.json`):
```json
{
  "python_path": "/path/to/backend/.venv/bin/python",
  "sumo_home": "/Library/Frameworks/EclipseSUMO.framework/Versions/Current/EclipseSUMO/share/sumo"
}
```
You can update these anytime from the **Paths** button in the top navigation bar.

### Backend Process Environment Variables
Set automatically by Tauri when spawning `backend/run.py`:

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `TRAFFIS_HOST` | `127.0.0.1` | Loopback interface binding |
| `TRAFFIS_PORT` | Ephemeral free port | Dynamic TCP port assigned by Tauri |
| `SUMO_HOME` | Configured `sumo_home` | Path to Eclipse SUMO `share/sumo` directory |

---

## Verification Commands

```bash
# Frontend lint (Oxlint) & production build
npm --prefix frontend run lint
npm --prefix frontend run build

# Rust / Tauri compilation check
cargo check --manifest-path src-tauri/Cargo.toml

# Backend smoke import check
backend/.venv/bin/python -c "import sys; sys.path.insert(0, 'backend'); from app.main import app; print(app.title)"
```
