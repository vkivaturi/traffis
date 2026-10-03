import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ExternalLink, Info } from 'lucide-react';
import { useSimulationSocket } from './hooks/useSimulationSocket';
import { useAuth } from './hooks/useAuth';
import { Header } from './components/Header';
import { MiniMap } from './components/MiniMap';
import { CanvasView } from './components/CanvasView';
import { Controls } from './components/Controls';
import { VehicleInspector } from './components/VehicleInspector';
import { TrafficSignalPanel } from './components/TrafficSignalPanel';
import { LandingPage } from './components/LandingPage';
import { AboutModal } from './components/AboutModal';
import type { CameraState, SpawnOptions, AutoSpawnSettings } from './types/simulation';
import { soundSystem } from './utils/audio';

export const App: React.FC = () => {
  const {
    user,
    isAuthenticated,
    signInWithGoogle,
    signOut,
  } = useAuth();

  // View state: 'landing' | 'simulator'
  // Only authenticated users can access 'simulator'
  const [currentView, setCurrentView] = useState<'landing' | 'simulator'>('landing');
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  const activeView = isAuthenticated ? currentView : 'landing';

  const {
    state,
    scenarios,
    activeScenario,
    selectScenario,
    connected,
    latencyMs,
    updateRateHz,
    dataExchangedMB,
    play,
    pause,
    reset,
    step,
    spawnVehicle,
    setAutoSpawn,
    setTrafficLight,
    nextTrafficLightPhase,
    setDefaultSpeed,
  } = useSimulationSocket(user?.token);

  const currentScenarioId = activeScenario?.id || state.scenario_id || 'straight_road';
  const isIntersection = activeScenario?.type === 'intersection';

  const [camera, setCamera] = useState<CameraState>({
    x: 500,
    y: 0,
    zoom: 12,
    followingId: null,
  });

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [viewportWidthMeters, setViewportWidthMeters] = useState<number>(100);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [isSignalPanelOpen, setIsSignalPanelOpen] = useState<boolean>(false);
  const [autoSpawnSettings, setAutoSpawnSettings] = useState<AutoSpawnSettings>({
    enabled: true,
    rate_per_minute: 25,
    rate_per_hour: 1500,
  });

  // Sound effect when traffic signal changes
  const prevSignalStateRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state.traffic_light && soundEnabled && activeView === 'simulator') {
      if (prevSignalStateRef.current && prevSignalStateRef.current !== state.traffic_light.state) {
        soundSystem.playSignalChangeSound(state.traffic_light.state);
      }
      prevSignalStateRef.current = state.traffic_light.state;
    }
  }, [state.traffic_light, soundEnabled, activeView]);

  const handleToggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    soundSystem.setEnabled(nextVal);
  };

  const handleSelectScenario = (scenarioId: string) => {
    selectScenario(scenarioId);
    setSelectedVehicleId(null);
    soundSystem.playResetSound();

    // Use the scenario's default_camera from metadata if available
    const targetScenario = scenarios.find(s => s.id === scenarioId);
    if (targetScenario?.default_camera) {
      setCamera({
        x: targetScenario.default_camera.x,
        y: targetScenario.default_camera.y,
        zoom: targetScenario.default_camera.zoom,
        followingId: null,
      });
    } else {
      setCamera({
        x: 500,
        y: 0,
        zoom: 12,
        followingId: null,
      });
    }
  };

  const handleSpawn = useCallback((options: SpawnOptions) => {
    spawnVehicle(options);
    soundSystem.playSpawnSound();
  }, [spawnVehicle]);

  const handleReset = useCallback(() => {
    reset();
    soundSystem.playResetSound();
    setSelectedVehicleId(null);
    setCamera((prev) => ({
      ...prev,
      followingId: null,
      x: activeScenario?.default_camera?.x ?? (isIntersection ? 0 : 500),
      y: activeScenario?.default_camera?.y ?? (isIntersection ? 0 : 0),
      zoom: activeScenario?.default_camera?.zoom ?? (isIntersection ? 3.2 : 12),
    }));
  }, [reset, isIntersection, activeScenario?.default_camera]);

  const handleUpdateAutoSpawn = (settings: AutoSpawnSettings) => {
    setAutoSpawnSettings(settings);
    setAutoSpawn(settings);
  };

  const handleFocusSignal = () => {
    setCamera((c) => ({
      ...c,
      x: isIntersection ? 0 : 500,
      y: 0,
      zoom: isIntersection ? 12 : 14,
      followingId: null,
    }));
  };

  const selectedVehicle = state.vehicles.find((v) => v.id === selectedVehicleId) || null;

  // Keyboard Shortcuts (only active in simulator view)
  useEffect(() => {
    if (activeView !== 'simulator') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      const isLimitReached = !!state.time_limit_reached || state.sim_time >= (state.max_sim_time ?? 300);

      if (e.code === 'Space') {
        e.preventDefault();
        if (state.is_running) pause();
        else if (!isLimitReached) play();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        handleReset();
      } else if (e.code === 'KeyS') {
        e.preventDefault();
        if (!isLimitReached) handleSpawn({});
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeView, state.is_running, state.sim_time, state.max_sim_time, state.time_limit_reached, pause, play, handleReset, handleSpawn]);

  // If user is on landing page or not authenticated, display Landing Page
  if (activeView === 'landing') {
    return (
      <LandingPage
        user={user}
        isAuthenticated={isAuthenticated}
        onLaunchSimulator={() => {
          if (isAuthenticated) {
            setCurrentView('simulator');
          }
        }}
        onSignInWithGoogle={signInWithGoogle}
        onSignOut={signOut}
      />
    );
  }

  // Authenticated Simulator View
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
      {/* 1. Header Navigation with Road Selection Dropdown, Home link, and Profile */}
      <Header
        state={state}
        connected={connected}
        updateRateHz={updateRateHz}
        dataExchangedMB={dataExchangedMB}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        scenarios={scenarios}
        activeScenarioId={currentScenarioId}
        onSelectScenario={handleSelectScenario}
        user={user}
        onNavigateHome={() => setCurrentView('landing')}
        onOpenAbout={() => setIsAboutOpen(true)}
        onSignOut={signOut}
      />

      {/* 2. Scenario-aware Radar Bar */}
      <MiniMap
        vehicles={state.vehicles}
        camera={camera}
        viewportWidthMeters={viewportWidthMeters}
        onJumpToX={(x, y = 0) => setCamera((c) => ({ ...c, x, y, followingId: null }))}
        trafficLight={state.traffic_light}
        scenario={activeScenario}
      />

      {/* 3. Main Canvas Viewport with Scenario-aware Road, Vehicles, Traffic Signals */}
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
          trafficLight={state.traffic_light}
          onTrafficLightClick={() => setIsSignalPanelOpen(true)}
          scenario={activeScenario}
        />

        {/* Interactive Traffic Signal Control HUD */}
        <TrafficSignalPanel
          trafficLight={state.traffic_light}
          onUpdateSettings={setTrafficLight}
          onNextPhase={nextTrafficLightPhase}
          onFocusSignal={handleFocusSignal}
          isOpen={isSignalPanelOpen}
          onToggleOpen={() => setIsSignalPanelOpen((v) => !v)}
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

      {/* 4. Controls Dock with Visible Section & Expandable Advanced Tools */}
      <Controls
        isRunning={state.is_running}
        step={state.step}
        onPlay={play}
        onPause={pause}
        onReset={handleReset}
        onStep={step}
        onSpawnVehicle={handleSpawn}
        autoSpawnSettings={autoSpawnSettings}
        onUpdateAutoSpawn={handleUpdateAutoSpawn}
        trafficLight={state.traffic_light}
        onUpdateTrafficLight={setTrafficLight}
        onNextTrafficLightPhase={nextTrafficLightPhase}
        onFocusTrafficSignal={handleFocusSignal}
        activeScenarioId={currentScenarioId}
        stats={state.stats}
        vehicles={state.vehicles}
        latencyMs={latencyMs}
        updateRateHz={updateRateHz}
        dataExchangedMB={dataExchangedMB}
        defaultSpeedKmh={state.default_speed_kmh ?? 50}
        onUpdateDefaultSpeed={setDefaultSpeed}
        simTime={state.sim_time}
        maxSimTime={state.max_sim_time ?? 300}
        timeLimitReached={state.time_limit_reached}
      />

      {/* 5. Open-Source Attribution Credits Footer */}
      <footer
        id="app-credits-footer"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '4px 16px',
          backgroundColor: 'rgba(8, 12, 20, 0.95)',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          fontSize: '0.7rem',
          color: '#64748b',
          zIndex: 30,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => setIsAboutOpen(true)}
          style={{
            background: 'none',
            border: 'none',
            color: '#38bdf8',
            cursor: 'pointer',
            fontSize: '0.7rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          <Info size={11} />
          About Traffis
        </button>
        <span style={{ color: '#334155' }}>•</span>
        <span>Simulation engine powered by</span>
        <a
          href="https://eclipse.dev/sumo/"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#38bdf8',
            textDecoration: 'none',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
        >
          <span>Eclipse SUMO</span>
          <ExternalLink size={11} />
        </a>
      </footer>

      {/* Global About Modal */}
      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
    </div>
  );
};

export default App;
