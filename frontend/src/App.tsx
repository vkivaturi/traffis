import React, { useState, useEffect } from 'react';
import { useSimulationSocket } from './hooks/useSimulationSocket';
import { Header } from './components/Header';
import { MiniMap } from './components/MiniMap';
import { CanvasView } from './components/CanvasView';
import { Controls } from './components/Controls';
import { StatsPanel } from './components/StatsPanel';
import { VehicleInspector } from './components/VehicleInspector';
import type { CameraState, SpawnOptions, AutoSpawnSettings } from './types/simulation';
import { soundSystem } from './utils/audio';

export const App: React.FC = () => {
  const {
    state,
    connected,
    latencyMs,
    updateRateHz,
    play,
    pause,
    reset,
    step,
    spawnVehicle,
    setAutoSpawn,
  } = useSimulationSocket();

  const [camera, setCamera] = useState<CameraState>({
    x: 100, // Start focused near road entry
    y: -4.8,
    zoom: 12,
    followingId: null,
  });

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [viewportWidthMeters, setViewportWidthMeters] = useState<number>(100);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [autoSpawnSettings, setAutoSpawnSettings] = useState<AutoSpawnSettings>({
    enabled: true,
    rate_per_minute: 25,
  });

  const handleToggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    soundSystem.setEnabled(nextVal);
  };

  const handleSpawn = (options: SpawnOptions) => {
    spawnVehicle(options);
    soundSystem.playSpawnSound();
  };

  const handleReset = () => {
    reset();
    soundSystem.playResetSound();
    setSelectedVehicleId(null);
    setCamera((prev) => ({ ...prev, followingId: null, x: 100 }));
  };

  const handleUpdateAutoSpawn = (settings: AutoSpawnSettings) => {
    setAutoSpawnSettings(settings);
    setAutoSpawn(settings);
  };

  const selectedVehicle = state.vehicles.find((v) => v.id === selectedVehicleId) || null;

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (state.is_running) pause();
        else play();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        handleReset();
      } else if (e.code === 'KeyS') {
        e.preventDefault();
        handleSpawn({});
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.is_running, pause, play]);

  return (
    <div
      id="app-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      {/* 1. Header Navigation */}
      <Header
        state={state}
        connected={connected}
        latencyMs={latencyMs}
        updateRateHz={updateRateHz}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
      />

      {/* 2. 1000m Highway Radar Bar */}
      <MiniMap
        vehicles={state.vehicles}
        camera={camera}
        viewportWidthMeters={viewportWidthMeters}
        onJumpToX={(x) => setCamera((c) => ({ ...c, x, followingId: null }))}
      />

      {/* 3. Main Canvas Viewport with Vehicles and Road */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          width: '100%',
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        <CanvasView
          vehicles={state.vehicles}
          camera={camera}
          setCamera={setCamera}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={setSelectedVehicleId}
          onViewportMetersChange={setViewportWidthMeters}
        />

        {/* Selected Vehicle Floating HUD */}
        {selectedVehicle && (
          <VehicleInspector
            vehicle={selectedVehicle}
            isFollowing={camera.followingId === selectedVehicle.id}
            onFollow={() => {
              setCamera((c) => ({
                ...c,
                followingId: c.followingId === selectedVehicle.id ? null : selectedVehicle.id,
              }));
            }}
            onClose={() => setSelectedVehicleId(null)}
          />
        )}
      </div>

      {/* 4. Controls Toolbar */}
      <Controls
        isRunning={state.is_running}
        onPlay={play}
        onPause={pause}
        onReset={handleReset}
        onStep={step}
        onSpawnVehicle={handleSpawn}
        autoSpawnSettings={autoSpawnSettings}
        onUpdateAutoSpawn={handleUpdateAutoSpawn}
      />

      {/* 5. Telemetry & Analytics Dashboard */}
      <StatsPanel stats={state.stats} vehicles={state.vehicles} />
    </div>
  );
};

export default App;
