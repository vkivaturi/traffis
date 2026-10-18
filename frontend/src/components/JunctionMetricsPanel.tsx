import React, { useState } from 'react';
import { ChevronDown, ChevronUp, CircleDot, Undo2, Hourglass, AlertTriangle } from 'lucide-react';
import type { JunctionMetrics } from '../types/simulation';

interface JunctionMetricsPanelProps {
  metrics: JunctionMetrics;
}

const ARM_COLORS: Record<string, string> = { NG: '#38bdf8', TL: '#10b981', FL: '#f59e0b' };

const odLabel = (key: string) => key.replace('_', ' → ');

const cellStyle: React.CSSProperties = { padding: '2px 4px', fontFamily: 'var(--font-mono)', textAlign: 'right' };
const headStyle: React.CSSProperties = {
  padding: '2px 4px',
  color: '#64748b',
  fontWeight: 700,
  fontSize: '0.62rem',
  textTransform: 'uppercase',
  textAlign: 'right',
};

export const JunctionMetricsPanel: React.FC<JunctionMetricsPanelProps> = ({ metrics }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      id="junction-metrics-panel"
      className="glass-panel"
      style={{
        position: 'absolute',
        top: '60px',
        left: '16px',
        width: '290px',
        padding: '10px 12px',
        zIndex: 12,
        fontSize: '0.74rem',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span style={{ fontWeight: 800, color: '#e2e8f0', letterSpacing: '0.03em' }}>JUNCTION METRICS</span>
        {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </div>

      {/* Headline counters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
        <div title="Vehicles currently on the roundabout ring (incl. ring junction lanes)">
          <div style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.66rem' }}>
            <CircleDot size={11} /> RING OCCUPANCY
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
            {metrics.roundabout_occupancy} <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>veh</span>
          </div>
        </div>
        <div title="Vehicles that used the bottom-road median U-turn (all TL → NG traffic)">
          <div style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.66rem' }}>
            <Undo2 size={11} /> U-TURNS
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
            {metrics.uturn_count}
            {metrics.teleports > 0 && (
              <span
                title="SUMO teleports (deadlock clearance)"
                style={{ marginLeft: '8px', fontSize: '0.68rem', color: '#f43f5e' }}
              >
                <AlertTriangle size={10} /> {metrics.teleports} tp
              </span>
            )}
          </div>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Per-arm inflow / outflow / delay */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
            <thead>
              <tr>
                <th style={{ ...headStyle, textAlign: 'left' }}>Arm</th>
                <th style={headStyle}>In</th>
                <th style={headStyle}>Out</th>
                <th style={headStyle} title="Mean (travel time − free-flow time) of trips from this arm">
                  Delay
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.arms.map((a) => (
                <tr key={a.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '2px 4px', fontWeight: 700, color: ARM_COLORS[a.id] ?? '#e2e8f0' }} title={a.name}>
                    {a.name} ({a.id})
                  </td>
                  <td style={cellStyle}>{a.inflow}</td>
                  <td style={cellStyle}>{a.outflow}</td>
                  <td style={cellStyle}>{a.avg_delay_s != null ? `${a.avg_delay_s}s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* O-D throughput vs configured demand */}
          <div style={{ marginTop: '10px', color: '#64748b', fontWeight: 700, fontSize: '0.62rem' }}>
            O-D THROUGHPUT (ACTUAL / CONFIGURED VEH/H) · AVG TRIP TIME
          </div>
          {metrics.od.map((o) => {
            const pct = o.configured_vph > 0 ? Math.min(100, (o.throughput_vph / o.configured_vph) * 100) : 0;
            return (
              <div
                key={o.key}
                style={{ marginTop: '4px' }}
                title={`${o.arrived} vehicles arrived; average travel time from entering to leaving the network`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, color: ARM_COLORS[o.key.slice(0, 2)] ?? '#e2e8f0' }}>
                    {odLabel(o.key)}
                    {o.key === 'TL_NG' && <span style={{ color: '#64748b', fontWeight: 500 }}> via U-turn</span>}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {o.throughput_vph} / {o.configured_vph}
                    <span style={{ color: '#94a3b8', marginLeft: '8px' }}>
                      {o.avg_travel_time_s != null ? `${o.avg_travel_time_s.toFixed(0)}s` : '—'}
                    </span>
                  </span>
                </div>
                <div style={{ height: '4px', borderRadius: '2px', backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      backgroundColor: ARM_COLORS[o.key.slice(0, 2)] ?? '#38bdf8',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            );
          })}

          {/* Entry queues */}
          <div
            style={{
              marginTop: '10px',
              color: '#64748b',
              fontWeight: 700,
              fontSize: '0.62rem',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Hourglass size={10} /> ENTRY QUEUES (HALTING, LAST 100 M)
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            {metrics.entry_queues.map((q) => (
              <div
                key={q.id}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  borderRadius: '6px',
                  backgroundColor: q.halting > 10 ? 'rgba(244, 63, 94, 0.15)' : 'rgba(255,255,255,0.04)',
                }}
                title={q.id}
              >
                <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{q.label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: q.halting > 10 ? '#f43f5e' : '#f8fafc' }}>
                  {q.halting}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
