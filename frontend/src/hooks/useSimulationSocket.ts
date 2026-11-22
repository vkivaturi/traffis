import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  SimulationState,
  NetworkInfo,
  ScenarioMetadata,
  ScenarioGroup,
} from '../types/simulation';
import { apiUrl, wsUrl, isTauri } from '../utils/tauri';

const INITIAL_STATE: SimulationState = {
  sim_time: 0,
  step: 0,
  is_running: false,
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

export function useSimulationSocket(backendPort?: number | null) {
  const [state, setState] = useState<SimulationState>(INITIAL_STATE);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [scenarioGroups, setScenarioGroups] = useState<ScenarioGroup[]>([]);
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
    if (isTauri() && !backendPort) return;
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    const targetUrl = wsUrl(backendPort);
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
          if (data.compact_vehicles && Array.isArray(data.compact_vehicles)) {
            data.vehicles = data.compact_vehicles.map((c: (string | number | null)[]) => ({
              id: c[0] as string,
              x: c[1] as number,
              y: c[2] as number,
              speed: c[3] as number,
              speed_kmh: Math.round((c[3] as number) * 36) / 10,
              acceleration: c[4] as number,
              angle: c[5] as number,
              lane_index: c[6] as number,
              type: (c[7] as string) || 'car',
              color: (c[8] as string) || '#38bdf8',
              length: (c[9] as number) || 5.0,
              width: (c[10] as number) || 1.8,
              leader_id: (c[11] as string | null) ?? null,
              leader_dist: (c[12] as number | null) ?? null,
              direction:
                (c[13] as string) ||
                ((c[5] as number) > 225 && (c[5] as number) < 315
                  ? 'west'
                  : (c[5] as number) > 135 && (c[5] as number) <= 225
                  ? 'south'
                  : 'east'),
              lane_id: `lane_${c[6]}`,
            }));
          } else if (!data.vehicles) {
            data.vehicles = [];
          }
          setState((prev) =>
            !data.junction_metrics &&
            prev.junction_metrics &&
            prev.scenario_id === data.scenario_id &&
            data.step > 0
              ? { ...data, junction_metrics: prev.junction_metrics }
              : data
          );
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
      if (socketRef.current !== ws) return;
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
  }, [backendPort]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const refreshScenarios = useCallback(async () => {
    if (isTauri() && !backendPort) return;
    try {
      const res = await fetch(apiUrl('/api/scenarios/groups', backendPort));
      if (!res.ok) throw new Error('Failed to load groups');
      const groups: ScenarioGroup[] = await res.json();
      if (Array.isArray(groups) && groups.length > 0) {
        setScenarioGroups(groups);
        setScenarios(groups.flatMap((g) => g.scenarios));
      }
    } catch (e) {
      console.warn('Could not load scenario groups, falling back to /api/scenarios:', e);
      try {
        const res = await fetch(apiUrl('/api/scenarios', backendPort));
        const data: ScenarioMetadata[] = res.ok ? await res.json() : [];
        if (data.length > 0) setScenarios(data);
      } catch (err) {
        console.warn('Failed to load scenarios:', err);
      }
    }
  }, [backendPort]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void refreshScenarios();
  }, [refreshScenarios]);

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

  const send = useCallback(
    (action: string, payload: Record<string, unknown> = {}) => {
      const raw = JSON.stringify({ action, payload });
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(raw);
      } else {
        fetch(apiUrl(`/api/${action}`, backendPort), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: raw,
        }).catch((e) => console.warn('REST fallback failed:', e));
      }
    },
    [backendPort]
  );

  const selectScenario = useCallback(
    (scenarioId: string) => {
      const found = scenarios.find((s) => s.id === scenarioId);
      if (found) {
        setActiveScenario(found);
      }

      const raw = JSON.stringify({
        action: 'select_scenario',
        payload: { scenario_id: scenarioId },
      });
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(raw);
      } else {
        fetch(apiUrl('/api/scenario/select', backendPort), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenario_id: scenarioId }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.scenario) {
              setActiveScenario(data.scenario);
              fetch(apiUrl('/api/network-info', backendPort))
                .then((r) => (r.ok ? r.json() : null))
                .then((net) => {
                  if (net) setNetworkInfo(net);
                });
            }
          })
          .catch((e) => console.warn('Failed to switch scenario via REST:', e));
      }
    },
    [scenarios, backendPort]
  );

  const play = useCallback(() => send('play'), [send]);
  const pause = useCallback(() => send('pause'), [send]);
  const reset = useCallback(() => send('reset'), [send]);

  const updateScenarioOptions = useCallback(
    (options: Record<string, unknown>) => {
      const raw = JSON.stringify({
        action: 'update_scenario_options',
        payload: { options },
      });
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(raw);
      } else {
        fetch(apiUrl('/api/scenario/options', backendPort), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ options }),
        }).catch((e) => console.warn('Failed to update scenario options via REST:', e));
      }
    },
    [backendPort]
  );

  return {
    state,
    networkInfo,
    scenarios,
    scenarioGroups,
    activeScenario,
    refreshScenarios,
    selectScenario,
    updateScenarioOptions,
    connected,
    latencyMs,
    updateRateHz,
    play,
    pause,
    reset,
  };
}
