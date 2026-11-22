import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ExternalLink, Info } from 'lucide-react';
import { useSimulationSocket } from './hooks/useSimulationSocket';
import { Header } from './components/Header';
import { CanvasView } from './components/CanvasView';
import { Controls } from './components/Controls';
import { VehicleInspector } from './components/VehicleInspector';
import { LandingPage } from './components/LandingPage';
import { CompareSimulationsPage } from './components/CompareSimulationsPage';
import { NetworkEditorPage } from './components/NetworkEditorPage';
import { AboutModal } from './components/AboutModal';
import { JunctionMetricsPanel } from './components/JunctionMetricsPanel';
import { DesktopSetupModal } from './components/DesktopSetupModal';
import {
  isTauri,
  getDesktopStatus,
  setBackendPort as setGlobalBackendPort,
  type DesktopStatus,
} from './utils/tauri';
import type { CameraState } from './types/simulation';
import { soundSystem } from './utils/audio';

export const App: React.FC = () => {
  // View state: 'landing' | 'simulator' | 'compare' | 'editor'
  const [currentView, setCurrentView] = useState<'landing' | 'simulator' | 'compare' | 'editor'>(() =>
    isTauri() ? 'simulator' : 'landing'
  );
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  const [desktopStatus, setDesktopStatus] = useState<DesktopStatus | null>(null);
  const [isDesktopSetupOpen, setIsDesktopSetupOpen] = useState(false);
  const [backendPort, setBackendPort] = useState<number | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    getDesktopStatus()
      .then((status) => {
        setDesktopStatus(status);
        if (status.backend_running && status.backend_port) {
          setGlobalBackendPort(status.backend_port);
          setBackendPort(status.backend_port);
        } else {
          setIsDesktopSetupOpen(true);
        }
      })
      .catch((err) => {
        console.error('Failed to query desktop status:', err);
        setIsDesktopSetupOpen(true);
      });
  }, []);

  const {
    state,
    networkInfo,
    scenarios,
    scenarioGroups,
    activeScenario,
    refreshScenarios,
    selectScenario,
    updateScenarioOptions,
    connected,
    updateRateHz,
    play,
    pause,
    reset,
  } = useSimulationSocket(backendPort);

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
    if (state.traffic_light && soundEnabled && currentView === 'simulator') {
      if (prevSignalStateRef.current && prevSignalStateRef.current !== state.traffic_light.state) {
        soundSystem.playSignalChangeSound(state.traffic_light.state);
      }
      prevSignalStateRef.current = state.traffic_light.state;
    }
  }, [state.traffic_light, soundEnabled, currentView]);

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

  // Pause/stop ongoing simulation whenever user navigates away from simulator view
  const prevViewRef = useRef(currentView);
  useEffect(() => {
    if (prevViewRef.current === 'simulator' && currentView !== 'simulator' && state.is_running) {
      pause();
    }
    prevViewRef.current = currentView;
  }, [currentView, state.is_running, pause]);

  const handleNavigateHome = useCallback(() => {
    if (state.is_running) {
      pause();
    }
    setCurrentView('landing');
  }, [state.is_running, pause]);

  // Keyboard Shortcuts (only active in simulator view)
  useEffect(() => {
    if (currentView !== 'simulator') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (state.is_running) pause();
        else if (!state.time_limit_reached) play();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        handleReset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, state.is_running, state.time_limit_reached, pause, play, handleReset]);

  const handleNavigateCompare = () => {
    setCurrentView('compare');
  };

  const handleNavigateEditor = () => {
    setCurrentView('editor');
  };

  const handleRunFromEditor = async (scenarioId: string) => {
    await refreshScenarios();
    handleSelectScenario(scenarioId);
    setCurrentView('simulator');
  };

  const handleLaunchSimulatorFromCompare = (scenarioId?: string) => {
    if (scenarioId) {
      handleSelectScenario(scenarioId);
    }
    setCurrentView('simulator');
  };

  const desktopSetupModal = (
    <DesktopSetupModal
      key={`${desktopStatus?.python_path ?? ''}-${desktopStatus?.sumo_home ?? ''}-${isDesktopSetupOpen}`}
      isOpen={isDesktopSetupOpen}
      status={desktopStatus}
      onSuccess={(updated) => {
        setDesktopStatus(updated);
        if (updated.backend_port) {
          setGlobalBackendPort(updated.backend_port);
          setBackendPort(updated.backend_port);
        }
        setIsDesktopSetupOpen(false);
      }}
      onClose={desktopStatus?.backend_running ? () => setIsDesktopSetupOpen(false) : undefined}
    />
  );

  // 1. Landing Page View
  if (currentView === 'landing') {
    return (
      <>
        <LandingPage
          onLaunchSimulator={() => setCurrentView('simulator')}
          scenarios={scenarios}
          activeScenarioId={currentScenarioId}
          onNavigateCompare={handleNavigateCompare}
          onSelectScenarioAndLaunch={(scenarioId: string) => {
            handleSelectScenario(scenarioId);
            setCurrentView('simulator');
          }}
        />
        {desktopSetupModal}
      </>
    );
  }

  // 2. Compare Simulations View
  if (currentView === 'compare') {
    return (
      <>
        <CompareSimulationsPage
          onNavigateHome={handleNavigateHome}
          onLaunchSimulator={handleLaunchSimulatorFromCompare}
          scenarioGroups={scenarioGroups}
          scenarios={scenarios}
        />
        {desktopSetupModal}
      </>
    );
  }

  // 2b. Self-Serve Network Editor View
  if (currentView === 'editor') {
    return (
      <>
        <NetworkEditorPage
          onBackToSimulator={() => setCurrentView('simulator')}
          onRunScenario={handleRunFromEditor}
        />
        {desktopSetupModal}
      </>
    );
  }

  // 3. Simulator View
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
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        scenarios={scenarios}
        scenarioGroups={scenarioGroups}
        activeScenarioId={currentScenarioId}
        onSelectScenario={handleSelectScenario}
        onNavigateHome={handleNavigateHome}
        onNavigateCompare={handleNavigateCompare}
        onNavigateEditor={handleNavigateEditor}
        onOpenAbout={() => setIsAboutOpen(true)}
        onOpenDesktopSettings={isTauri() ? () => setIsDesktopSetupOpen(true) : undefined}
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
        maxSimTime={state.max_sim_time}
        timeLimitReached={state.time_limit_reached}
        scenario={activeScenario}
        trafficLight={state.traffic_light}
        onUpdateOption={handleUpdateOption}
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

      {desktopSetupModal}
    </div>
  );
};

export default App;
