# Traffis Frontend

React 19 + TypeScript + Vite UI for the **Traffis** Tauri v2 desktop application.

## Scripts

Run from the repository root (`npm --prefix frontend run <script>`) or inside `frontend/`:

- `npm run dev` — Start Vite dev server on `http://localhost:5173`
- `npm run build` — Typecheck (`tsc -b`) and build production bundle to `frontend/dist/`
- `npm run lint` — Run Oxlint static analysis
- `npm run tauri dev` — Launch the full Tauri desktop app (Vite + Rust shell + Python/SUMO backend)
- `npm run tauri build` — Build the native desktop bundle

## Desktop Integration

- `src/utils/tauri.ts` wraps Tauri IPC commands (`get_desktop_status`, `save_and_start_backend`, `stop_backend`), native file/folder pickers (`@tauri-apps/plugin-dialog`), and dynamic `127.0.0.1:<port>` API/WebSocket URLs.
- `src/components/DesktopSetupModal.tsx` prompts for local Python and `SUMO_HOME` paths when needed.
