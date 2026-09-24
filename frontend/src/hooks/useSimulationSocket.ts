import { useState, useEffect, useRef, useCallback } from 'react';
import type { SimulationState, NetworkInfo, SpawnOptions, AutoSpawnSettings } from '../types/simulation';

const INITIAL_STATE: SimulationState = {
  sim_time: 0,
  step: 0,
  is_running: true,
  vehicles: [],
  stats: {
    active_vehicles: 0,
    total_spawned: 0,
    total_arrived: 0,
    avg_speed_kmh: 0,
    density_veh_km: 0,
  },
};

export function useSimulationSocket() {
  const [state, setState] = useState<SimulationState>(INITIAL_STATE);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [updateRateHz, setUpdateRateHz] = useState<number>(0);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const lastMsgTimeRef = useRef<number>(performance.now());
  const msgCountRef = useRef<number>(0);
  const rateCalcIntervalRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    // Use current host with fallback to port 8000 for direct connection
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
      const delta = now - lastMsgTimeRef.current;
      lastMsgTimeRef.current = now;
      msgCountRef.current += 1;

      // Approximate instantaneous latency / jitter
      if (delta > 0 && delta < 500) {
        setLatencyMs(Math.round(delta));
      }

      try {
        const data = JSON.parse(event.data);
        if (data.type === 'state') {
          setState(data);
        } else if (data.type === 'network_info') {
          setNetworkInfo(data.data);
        }
      } catch (err) {
        console.error('Failed to parse simulation message:', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      socketRef.current = null;
      // Schedule reconnect after 1.5s
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 1500);
    };

    ws.onerror = (err) => {
      console.warn('WebSocket connection error, will retry...', err);
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();

    // Calculate actual incoming message rate every 1 second
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
      // Fallback to REST API if WebSocket is momentarily disconnected
      fetch(`/api/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((e) => console.warn('REST fallback failed:', e));
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

  return {
    state,
    networkInfo,
    connected,
    latencyMs,
    updateRateHz,
    play,
    pause,
    reset,
    step,
    spawnVehicle,
    setAutoSpawn,
  };
}
