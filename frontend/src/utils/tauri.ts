import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

export interface DesktopStatus {
  python_path: string;
  sumo_home: string;
  detected_python: string | null;
  detected_sumo_home: string | null;
  backend_port: number | null;
  backend_running: boolean;
  backend_error: string | null;
  needs_setup: boolean;
}

let activeBackendPort: number | null = null;

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function setBackendPort(port: number | null): void {
  activeBackendPort = port;
}

export function getBackendPort(): number | null {
  return activeBackendPort;
}

export function apiUrl(path: string, explicitPort?: number | null): string {
  const port = explicitPort ?? activeBackendPort;
  if (port) {
    return `http://127.0.0.1:${port}${path}`;
  }
  return path;
}

export function wsUrl(explicitPort?: number | null): string {
  const port = explicitPort ?? activeBackendPort;
  if (port) {
    return `ws://127.0.0.1:${port}/ws`;
  }
  const isSecure = window.location.protocol === 'https:';
  const wsProto = isSecure ? 'wss:' : 'ws:';
  return `${wsProto}//${window.location.host}/ws`;
}

export async function getDesktopStatus(): Promise<DesktopStatus> {
  return invoke<DesktopStatus>('get_desktop_status');
}

export async function saveAndStartBackend(
  pythonPath: string,
  sumoHome: string
): Promise<DesktopStatus> {
  return invoke<DesktopStatus>('save_and_start_backend', {
    pythonPath,
    sumoHome,
  });
}

export async function stopBackend(): Promise<void> {
  return invoke<void>('stop_backend');
}

export async function pickPythonExecutable(): Promise<string | null> {
  const selected = await open({
    title: 'Select Python Executable',
    multiple: false,
    directory: false,
  });
  return typeof selected === 'string' ? selected : null;
}

export async function pickSumoHomeFolder(): Promise<string | null> {
  const selected = await open({
    title: 'Select SUMO_HOME Directory',
    multiple: false,
    directory: true,
  });
  return typeof selected === 'string' ? selected : null;
}

