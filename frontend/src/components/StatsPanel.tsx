import React from 'react';
import { Gauge, Users, Flag, Activity, Layers } from 'lucide-react';
import type { SimulationStats, Vehicle } from '../types/simulation';

interface StatsPanelProps {
  stats: SimulationStats;
  vehicles: Vehicle[];
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ stats, vehicles }) => {
  // Compute lane counts
  const laneCounts = [0, 0, 0];
  vehicles.forEach((v) => {
    if (v.lane_index >= 0 && v.lane_index <= 2) {
      laneCounts[v.lane_index]++;
    }
  });

  return (
    <div
      id="simulation-stats-panel"
      className="glass-panel"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '12px',
        padding: '12px 20px',
        margin: '0 20px 14px 20px',
        zIndex: 10,
      }}
    >
      {/* 1. Active Vehicles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(56, 189, 248, 0.25)',
          }}
        >
          <Users size={18} color="#38bdf8" />
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
            Active Cars
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#f8fafc' }}>
            {stats.active_vehicles}
          </div>
        </div>
      </div>

      {/* 2. Average Speed */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(16, 185, 129, 0.25)',
          }}
        >
          <Gauge size={18} color="#10b981" />
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
            Avg Speed
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#f8fafc' }}>
            {stats.avg_speed_kmh}{' '}
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#94a3b8' }}>km/h</span>
          </div>
        </div>
      </div>

      {/* 3. Traffic Density */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(245, 158, 11, 0.25)',
          }}
        >
          <Activity size={18} color="#f59e0b" />
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
            Density
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#f8fafc' }}>
            {stats.density_veh_km}{' '}
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#94a3b8' }}>veh/km</span>
          </div>
        </div>
      </div>

      {/* 4. Total Arrived */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: 'rgba(139, 92, 246, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(139, 92, 246, 0.25)',
          }}
        >
          <Flag size={18} color="#8b5cf6" />
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
            Trips Finished
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#f8fafc' }}>
            {stats.total_arrived}{' '}
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#94a3b8' }}>
              / {stats.total_spawned}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Lane Distribution mini-bars */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: '160px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Layers size={11} /> Lane Load
          </span>
          <span style={{ fontSize: '0.68rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
            L2: {laneCounts[2]} | L1: {laneCounts[1]} | L0: {laneCounts[0]}
          </span>
        </div>
        <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' }}>
          <div
            title={`Lane 2 (Left): ${laneCounts[2]} cars`}
            style={{
              width: `${stats.active_vehicles > 0 ? (laneCounts[2] / stats.active_vehicles) * 100 : 33.3}%`,
              backgroundColor: '#38bdf8',
              transition: 'width 0.3s ease',
            }}
          />
          <div
            title={`Lane 1 (Middle): ${laneCounts[1]} cars`}
            style={{
              width: `${stats.active_vehicles > 0 ? (laneCounts[1] / stats.active_vehicles) * 100 : 33.3}%`,
              backgroundColor: '#10b981',
              transition: 'width 0.3s ease',
            }}
          />
          <div
            title={`Lane 0 (Right): ${laneCounts[0]} cars`}
            style={{
              width: `${stats.active_vehicles > 0 ? (laneCounts[0] / stats.active_vehicles) * 100 : 33.3}%`,
              backgroundColor: '#f59e0b',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>
    </div>
  );
};
