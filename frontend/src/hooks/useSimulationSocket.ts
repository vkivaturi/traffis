import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  SimulationState,
  NetworkInfo,
  ScenarioMetadata,
  SpawnOptions,
  AutoSpawnSettings,
  TrafficLightSettings,
} from '../types/simulation';

const INITIAL_STATE: SimulationState = {
  sim_time: 0,
  step: 0,
  is_running: true,
  scenario_id: 'straight_road',
  vehicles: [],
  stats: {
    active_vehicles: 0,
    total_spawned: 0,
    total_arrived: 0,
    avg_speed_kmh: 0,
    density_veh_km: 0,
  },
  traffic_light: {
    id: 'traffic_light',
    x: 500,
    state: 'green',
    raw_state: 'GGG',
    mode: 'auto',
    green_duration: 15,
    yellow_duration: 3,
    red_duration: 12,
    phase_timer: 0,
    phase_remaining: 15,
    next_state: 'yellow',
  },
};

export function useSimulationSocket() {
  const [state, setState] = useState<SimulationState>(INITIAL_STATE);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioMetadata[]>([]);
  const [activeScenario, setActiveScenario] = useState<ScenarioMetadata | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [updateRateHz, setUpdateRateHz] = useState<number>(0);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const lastMsgTimeRef = useRef<number>(0);
  const msgCountRef = useRef<number>(0);
  const rateCalcIntervalRef = useRef<number | null>(null);
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    const isSecure = window.location.protocol === 'https:';
    const wsProto = isSecure ? 'wss:' : 'ws:';
    const targetUrl = `${wsProto}//${window.location.host}/ws`;

    const ws = new WebSocket(targetUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('WebSocket connected to SUMO simulation:', targetUrl);
    };

    ws.onmessage = (event) => {
      const now = performance.now();
      if (lastMsgTimeRef.current > 0) {
        const delta = now - lastMsgTimeRef.current;
        if (delta > 0 && delta < 500) {
          setLatencyMs(Math.round(delta));
        }
      }
      lastMsgTimeRef.current = now;
      msgCountRef.current += 1;

      try {
        const data = JSON.parse(event.data);
        if (data.type === 'state') {
          setState(data);
        } else if (data.type === 'network_info') {
          setNetworkInfo(data.data);
          if (data.data?.scenario) {
            setActiveScenario(data.data.scenario);
          }
        } else if (data.type === 'scenario_switched') {
          if (data.scenario) {
            setActiveScenario(data.scenario);
          }
        }
      } catch (err) {
        console.error('Failed to parse simulation message:', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      socketRef.current = null;
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connectRef.current();
      }, 1500);
    };

    ws.onerror = (err) => {
      console.warn('WebSocket connection error, will retry...', err);
      ws.close();
    };
  }, []);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // Load available scenarios
  useEffect(() => {
    let active = true;
    fetch('/api/scenarios')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ScenarioMetadata[]) => {
        if (active && data.length > 0) {
          setScenarios(data);
        }
      })
      .catch((e) => console.warn('Failed to load scenarios:', e));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    connect();

    rateCalcIntervalRef.current = window.setInterval(() => {
      setUpdateRateHz(msgCountRef.current);
      msgCountRef.current = 0;
    }, 1000);

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (rateCalcIntervalRef.current) clearInterval(rateCalcIntervalRef.current);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connect]);

  const send = useCallback((action: string, payload: Record<string, unknown> = {}) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ action, payload }));
    } else {
      fetch(`/api/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((e) => console.warn('REST fallback failed:', e));
    }
  }, []);

  const selectScenario = useCallback((scenarioId: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        action: 'select_scenario',
        payload: { scenario_id: scenarioId },
      }));
    } else {
      fetch('/api/scenario/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: scenarioId }),
      }).catch((e) => console.warn('Failed to switch scenario via REST:', e));
    }
  }, []);

  const play = useCallback(() => send('play'), [send]);
  const pause = useCallback(() => send('pause'), [send]);
  const reset = useCallback(() => send('reset'), [send]);
  const step = useCallback(() => send('step'), [send]);

  const spawnVehicle = useCallback((options: SpawnOptions = {}) => {
    send('spawn', options as Record<string, unknown>);
  }, [send]);

  const setAutoSpawn = useCallback((settings: AutoSpawnSettings) => {
    send('set_auto_spawn', settings as unknown as Record<string, unknown>);
  }, [send]);

  const setTrafficLight = useCallback((settings: TrafficLightSettings) => {
    send('set_traffic_light', settings as unknown as Record<string, unknown>);
  }, [send]);

  const nextTrafficLightPhase = useCallback(() => {
    send('next_traffic_light_phase');
  }, [send]);

  return {
    state,
    networkInfo,
    scenarios,
    activeScenario,
    selectScenario,
    connected,
    latencyMs,
    updateRateHz,
    play,
    pause,
    reset,
    step,
    spawnVehicle,
    setAutoSpawn,
    setTrafficLight,
    nextTrafficLightPhase,
  };
}
