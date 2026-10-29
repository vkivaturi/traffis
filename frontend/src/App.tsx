import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ExternalLink, Info } from 'lucide-react';
import { useSimulationSocket } from './hooks/useSimulationSocket';
import { useAuth } from './hooks/useAuth';
import { Header } from './components/Header';
import { CanvasView } from './components/CanvasView';
import { Controls } from './components/Controls';
import { VehicleInspector } from './components/VehicleInspector';
import { LandingPage } from './components/LandingPage';
import { CompareSimulationsPage } from './components/CompareSimulationsPage';
import { AboutModal } from './components/AboutModal';
import { JunctionMetricsPanel } from './components/JunctionMetricsPanel';
import { SessionExpiredModal } from './components/SessionExpiredModal';
import type { CameraState } from './types/simulation';
import type { User } from './types/auth';
import { soundSystem } from './utils/audio';

export const App: React.FC = () => {
  const {
    user,
    isAuthenticated,
    signInWithGoogle,
    signOut,
  } = useAuth();

  // View state: 'landing' | 'simulator' | 'compare'
  const [currentView, setCurrentView] = useState<'landing' | 'simulator' | 'compare'>('landing');
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  const {
    state,
    authExpired,
    networkInfo,
    scenarios,
    scenarioGroups,
    activeScenario,
    selectScenario,
    updateScenarioOptions,
    connected,
    updateRateHz,
    dataExchangedMB,
    play,
    pause,
    reset,
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
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);

  // Whenever activeScenario changes, automatically update the camera to its default position
  const prevScenarioIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeScenario && activeScenario.id !== prevScenarioIdRef.current) {
      prevScenarioIdRef.current = activeScenario.id;
      if (activeScenario.default_camera) {
        // oxlint-disable-next-line react/set-state-in-effect
        setCamera({
          x: activeScenario.default_camera.x,
          y: activeScenario.default_camera.y,
          zoom: activeScenario.default_camera.zoom,
          followingId: null,
        });
      }
    }
  }, [activeScenario]);

  // Sound effect when traffic signal changes
  const prevSignalStateRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state.traffic_light && soundEnabled && isAuthenticated && currentView === 'simulator') {
      if (prevSignalStateRef.current && prevSignalStateRef.current !== state.traffic_light.state) {
        soundSystem.playSignalChangeSound(state.traffic_light.state);
      }
      prevSignalStateRef.current = state.traffic_light.state;
    }
  }, [state.traffic_light, soundEnabled, isAuthenticated, currentView]);

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

  const handleUpdateOption = useCallback(
    (optionId: string, value: boolean) => {
      updateScenarioOptions({ [optionId]: value });
      soundSystem.playResetSound();
      setSelectedVehicleId(null);
    },
    [updateScenarioOptions]
  );

  const selectedVehicle = state.vehicles.find((v) => v.id === selectedVehicleId) || null;

  // Pause/stop ongoing simulation whenever user navigates back to landing or compare page
  useEffect(() => {
    if (currentView !== 'simulator' && state.is_running) {
      pause();
    }
  }, [currentView, state.is_running, pause]);

  const handleNavigateHome = useCallback(() => {
    if (state.is_running) {
      pause();
    }
    setCurrentView('landing');
  }, [state.is_running, pause]);

  const handleSignOut = useCallback(() => {
    if (state.is_running) {
      pause();
    }
    signOut();
  }, [state.is_running, pause, signOut]);

  // Keyboard Shortcuts (only active in simulator view)
  useEffect(() => {
    if (!isAuthenticated || currentView !== 'simulator') return;

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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated, currentView, state.is_running, state.sim_time, state.max_sim_time, state.time_limit_reached, pause, play, handleReset]);

  // After the user signs in again, return to the landing page (per requirement)
  const handleReauthenticated = (userData?: Partial<User>) => {
    signInWithGoogle(userData);
    setCurrentView('landing');
  };

  const handleNavigateCompare = () => {
    setCurrentView('compare');
  };

  const handleLaunchSimulatorFromCompare = (scenarioId?: string) => {
    if (scenarioId) {
      handleSelectScenario(scenarioId);
    }
    if (isAuthenticated) {
      setCurrentView('simulator');
    } else {
      signInWithGoogle();
      setCurrentView('simulator');
    }
  };

  const sessionExpiredPrompt = authExpired ? <SessionExpiredModal onSignIn={handleReauthenticated} /> : null;

  // 1. If user is on landing page or not authenticated, display Landing Page
  if (!isAuthenticated || currentView === 'landing') {
    return (
      <>
        <LandingPage
          user={user}
          isAuthenticated={isAuthenticated}
          onLaunchSimulator={() => {
            if (isAuthenticated) {
              setCurrentView('simulator');
            }
          }}
          onSignInWithGoogle={signInWithGoogle}
          onSignOut={handleSignOut}
          scenarios={scenarios}
          activeScenarioId={currentScenarioId}
          onNavigateCompare={handleNavigateCompare}
          onSelectScenarioAndLaunch={(scenarioId: string) => {
            handleSelectScenario(scenarioId);
            if (isAuthenticated) {
              setCurrentView('simulator');
            }
          }}
        />
        {sessionExpiredPrompt}
      </>
    );
  }

  // 2. Authenticated Compare Simulations View
  if (currentView === 'compare') {
    return (
      <>
        <CompareSimulationsPage
          user={user}
          isAuthenticated={isAuthenticated}
          onNavigateHome={handleNavigateHome}
          onLaunchSimulator={handleLaunchSimulatorFromCompare}
          onSignInWithGoogle={signInWithGoogle}
          onSignOut={handleSignOut}
          scenarioGroups={scenarioGroups}
          scenarios={scenarios}
        />
        {sessionExpiredPrompt}
      </>
    );
  }

  // 3. Authenticated Simulator View
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
        scenarioGroups={scenarioGroups}
        activeScenarioId={currentScenarioId}
        onSelectScenario={handleSelectScenario}
        user={user}
        onNavigateHome={handleNavigateHome}
        onNavigateCompare={handleNavigateCompare}
        onOpenAbout={() => setIsAboutOpen(true)}
        onSignOut={handleSignOut}
      />


      {/* 2. Main Canvas Viewport with Scenario-aware Road, Vehicles, Traffic Signals */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          width: '100%',
          display: 'flex',
          overflow: 'hidden',
          backgroundColor: '#e8e0d2',
        }}
      >
        <CanvasView
          vehicles={state.vehicles}
          camera={camera}
          setCamera={setCamera}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={setSelectedVehicleId}
          trafficLight={state.traffic_light}
          scenario={activeScenario}
          scenarioId={currentScenarioId}
          networkInfo={networkInfo}
        />

        {/* Corridor junction metrics: per-arm flows, throughput, time & speed */}
        {state.junction_metrics && state.scenario_id === activeScenario?.id && (
          <JunctionMetricsPanel metrics={state.junction_metrics} scenarioId={state.scenario_id} />
        )}

        {/* Selected Vehicle Floating HUD */}
        {selectedVehicle && (
          <VehicleInspector
            vehicle={selectedVehicle}
            scenarioId={state.scenario_id}
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

      {/* 3. Transport Dock: Start / Pause / Stop + Scenario Config (all parameters come from scenario.xml) */}
      <Controls
        isRunning={state.is_running}
        onPlay={play}
        onPause={pause}
        onStop={handleReset}
        stats={state.stats}
        simTime={state.sim_time}
        maxSimTime={state.max_sim_time ?? 300}
        timeLimitReached={state.time_limit_reached}
        scenario={activeScenario}
        trafficLight={state.traffic_light}
        onUpdateOption={handleUpdateOption}
        dataExchangedMB={dataExchangedMB}
      />

      {/* 4. Open-Source Attribution Credits Footer */}
      <footer
        id="app-credits-footer"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '4px 16px',
          backgroundColor: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          fontSize: '0.74rem',
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
            color: '#4a2c11',
            cursor: 'pointer',
            fontSize: '0.74rem',
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          <Info size={11} />
          About Traffis
        </button>
        <span style={{ color: '#cbd5e1' }}>•</span>
        <span>Simulation engine powered by</span>
        <a
          href="https://eclipse.dev/sumo/"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#4a2c11',
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

      {sessionExpiredPrompt}
    </div>
  );
};

export default App;
