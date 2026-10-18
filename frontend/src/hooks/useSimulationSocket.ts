import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  SimulationState,
  NetworkInfo,
  ScenarioMetadata,
} from '../types/simulation';

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
  max_sim_time: 300,
  time_limit_reached: false,
};

// Matches the backend's 5-minute clock-skew tolerance for Google ID tokens (auth.py)
const TOKEN_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** True when a Google ID token (JWT) is past its expiry. Non-JWT tokens are never treated as expired here. */
export function isTokenExpired(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const payload = JSON.parse(atob(base64));
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now() - TOKEN_CLOCK_SKEW_MS;
  } catch {
    return false;
  }
}

export function useSimulationSocket(authToken?: string) {
  const [state, setState] = useState<SimulationState>(INITIAL_STATE);
  // Token the server rejected or that is already expired. Derived below, so it clears when the user signs in again.
  const [expiredToken, setExpiredToken] = useState<string | null>(null);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioMetadata[]>([]);
  const [activeScenario, setActiveScenario] = useState<ScenarioMetadata | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [updateRateHz, setUpdateRateHz] = useState<number>(0);
  const [dataExchangedMB, setDataExchangedMB] = useState<number>(0);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const lastMsgTimeRef = useRef<number>(0);
  const msgCountRef = useRef<number>(0);
  const totalBytesRef = useRef<number>(0);
  const rateCalcIntervalRef = useRef<number | null>(null);
  const connectRef = useRef<() => void>(() => {});

  const getToken = useCallback((): string => {
    if (authToken) return authToken;
    try {
      const saved = localStorage.getItem('traffis_auth_user');
      return saved ? JSON.parse(saved)?.token || '' : '';
    } catch {
      return '';
    }
  }, [authToken]);

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    const isSecure = window.location.protocol === 'https:';
    const wsProto = isSecure ? 'wss:' : 'ws:';
    const token = getToken();
    // An already-expired token is caught by `authExpired` below, so there is no point connecting with it
    if (token && isTokenExpired(token)) return;
    const targetUrl = `${wsProto}//${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;

    const ws = new WebSocket(targetUrl);
    socketRef.current = ws;
    let opened = false;

    ws.onopen = () => {
      opened = true;
      setConnected(true);
      console.log('WebSocket connected to SUMO simulation:', targetUrl);
    };

    ws.onmessage = (event) => {
      const rawLen = typeof event.data === 'string' ? event.data.length : (event.data?.byteLength || 0);
      totalBytesRef.current += rawLen;

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
            // Unpack compact tuple format:
            // [0:id, 1:x, 2:y, 3:speed, 4:accel, 5:angle, 6:lane_idx, 7:type, 8:color, 9:len, 10:wid, 11:leader_id, 12:leader_dist, 13:direction]
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
              direction: (c[13] as string) || ((c[5] as number) > 225 && (c[5] as number) < 315 ? 'west' : (c[5] as number) > 135 && (c[5] as number) <= 225 ? 'south' : 'east'),
              lane_id: `lane_${c[6]}`,
            }));
          } else if (!data.vehicles) {
            data.vehicles = [];
          }
          // junction_metrics is sent at 1 Hz; carry the last value across intermediate ticks
          setState((prev) =>
            !data.junction_metrics && prev.junction_metrics && prev.scenario_id === data.scenario_id && data.step > 0
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

    ws.onclose = (event) => {
      // Ignore sockets already replaced or torn down by the effect cleanup
      if (socketRef.current !== ws) return;
      setConnected(false);
      socketRef.current = null;
      // 1008 = server rejected the credentials (or the token expired before connecting). Retrying cannot succeed.
      if (event.code === 1008 || (!opened && token && isTokenExpired(token))) {
        setExpiredToken(token || null);
        return;
      }
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connectRef.current();
      }, 1500);
    };

    ws.onerror = (err) => {
      console.warn('WebSocket connection error, will retry...', err);
      ws.close();
    };
  }, [getToken]);

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
      // Calculate cumulative MB exchanged
      setDataExchangedMB(Number((totalBytesRef.current / (1024 * 1024)).toFixed(2)));
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
    const raw = JSON.stringify({ action, payload });
    totalBytesRef.current += raw.length;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(raw);
    } else {
      const token = getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      fetch(`/api/${action}`, {
        method: 'POST',
        headers,
        body: raw,
      }).catch((e) => console.warn('REST fallback failed:', e));
    }
  }, [getToken]);

  const selectScenario = useCallback((scenarioId: string) => {
    const found = scenarios.find((s) => s.id === scenarioId);
    if (found) {
      setActiveScenario(found);
    }

    const raw = JSON.stringify({
      action: 'select_scenario',
      payload: { scenario_id: scenarioId },
    });
    totalBytesRef.current += raw.length;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(raw);
    } else {
      const token = getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      fetch('/api/scenario/select', {
        method: 'POST',
        headers,
        body: JSON.stringify({ scenario_id: scenarioId }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.scenario) {
            setActiveScenario(data.scenario);
            fetch('/api/network-info', { headers })
              .then((r) => (r.ok ? r.json() : null))
              .then((net) => {
                if (net) setNetworkInfo(net);
              });
          }
        })
        .catch((e) => console.warn('Failed to switch scenario via REST:', e));
    }
  }, [getToken, scenarios]);

  const play = useCallback(() => {
    if (state.time_limit_reached || state.sim_time >= (state.max_sim_time ?? 300)) {
      console.warn('Simulation time limit (5 minutes) reached. Reset required.');
      return;
    }
    send('play');
  }, [send, state.time_limit_reached, state.sim_time, state.max_sim_time]);

  const pause = useCallback(() => send('pause'), [send]);
  const reset = useCallback(() => send('reset'), [send]);

  const updateScenarioOptions = useCallback((options: Record<string, unknown>) => {
    const raw = JSON.stringify({
      action: 'update_scenario_options',
      payload: { options },
    });
    totalBytesRef.current += raw.length;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(raw);
    } else {
      const token = getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      fetch('/api/scenario/options', {
        method: 'POST',
        headers,
        body: JSON.stringify({ options }),
      }).catch((e) => console.warn('Failed to update scenario options via REST:', e));
    }
  }, [getToken]);

  const authExpired = !!authToken && (expiredToken === authToken || isTokenExpired(authToken));

  return {
    state,
    authExpired,
    networkInfo,
    scenarios,
    activeScenario,
    selectScenario,
    updateScenarioOptions,
    connected,
    latencyMs,
    updateRateHz,
    dataExchangedMB,
    play,
    pause,
    reset,
  };
}
