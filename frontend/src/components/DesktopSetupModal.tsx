import React, { useState } from 'react';
import { FolderOpen, Terminal, Play, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import {
  type DesktopStatus,
  pickPythonExecutable,
  pickSumoHomeFolder,
  saveAndStartBackend,
} from '../utils/tauri';

interface DesktopSetupModalProps {
  isOpen: boolean;
  status: DesktopStatus | null;
  onSuccess: (updated: DesktopStatus) => void;
  onClose?: () => void;
}

export const DesktopSetupModal: React.FC<DesktopSetupModalProps> = ({
  isOpen,
  status,
  onSuccess,
  onClose,
}) => {
  const [pythonPath, setPythonPath] = useState(
    () => status?.python_path || status?.detected_python || ''
  );
  const [sumoHome, setSumoHome] = useState(
    () => status?.sumo_home || status?.detected_sumo_home || ''
  );
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(() => status?.backend_error || null);

  if (!isOpen) return null;

  const canClose = !!status?.backend_running && !!onClose;

  const handleBrowsePython = async () => {
    try {
      const picked = await pickPythonExecutable();
      if (picked) setPythonPath(picked);
    } catch (e) {
      console.warn('File picker cancelled or failed:', e);
    }
  };

  const handleBrowseSumo = async () => {
    try {
      const picked = await pickSumoHomeFolder();
      if (picked) setSumoHome(picked);
    } catch (e) {
      console.warn('Folder picker cancelled or failed:', e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsStarting(true);
    try {
      const updated = await saveAndStartBackend(pythonPath, sumoHome);
      onSuccess(updated);
    } catch (err) {
      setError(typeof err === 'string' ? err : err instanceof Error ? err.message : String(err));
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-700/70 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Traffis Desktop Environment Setup
              </h2>
              <p className="text-xs text-slate-400">
                Point Traffis to your local Python and Eclipse SUMO installations
              </p>
            </div>
          </div>
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {status?.backend_running && (
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Backend is running on <code className="font-mono">127.0.0.1:{status.backend_port}</code>
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-3 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed break-all">
                {error}
              </pre>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Python Executable Path
              </label>
              {status?.detected_python && pythonPath !== status.detected_python && (
                <button
                  type="button"
                  onClick={() => setPythonPath(status.detected_python!)}
                  className="text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
                >
                  Use detected
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={pythonPath}
                onChange={(e) => setPythonPath(e.target.value)}
                placeholder="/path/to/backend/.venv/bin/python"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={handleBrowsePython}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Browse
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Must have <code className="text-slate-400">fastapi</code>,{' '}
              <code className="text-slate-400">uvicorn</code>, and{' '}
              <code className="text-slate-400">traci</code> installed (e.g.{' '}
              <code className="text-slate-400">backend/.venv/bin/python</code>).
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                SUMO_HOME Directory
              </label>
              {status?.detected_sumo_home && sumoHome !== status.detected_sumo_home && (
                <button
                  type="button"
                  onClick={() => setSumoHome(status.detected_sumo_home!)}
                  className="text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
                >
                  Use detected
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={sumoHome}
                onChange={(e) => setSumoHome(e.target.value)}
                placeholder="/Library/Frameworks/EclipseSUMO.framework/Versions/Current/EclipseSUMO/share/sumo"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={handleBrowseSumo}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Browse
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Path to Eclipse SUMO&apos;s <code className="text-slate-400">share/sumo</code> (or
              Windows <code className="text-slate-400">Eclipse\Sumo</code>) folder.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            {canClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isStarting}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60 transition-colors"
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Starting Backend...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Save &amp; Start Backend
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
