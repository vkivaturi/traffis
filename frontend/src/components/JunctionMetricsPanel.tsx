import React, { useState } from 'react';
import { ChevronDown, ChevronUp, CircleDot, Undo2, Hourglass, AlertTriangle } from 'lucide-react';
import type { JunctionMetrics } from '../types/simulation';

interface JunctionMetricsPanelProps {
  metrics: JunctionMetrics;
}

const ARM_COLORS: Record<string, string> = { NG: '#2563eb', TL: '#059669', FL: '#d97706' };

const odLabel = (key: string) => key.replace('_', ' → ');

const cellStyle: React.CSSProperties = { padding: '4px 6px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: '#0f172a' };
const headStyle: React.CSSProperties = {
  padding: '4px 6px',
  color: '#64748b',
  fontWeight: 700,
  fontSize: '0.64rem',
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
        top: '64px',
        left: '16px',
        width: '310px',
        padding: '12px 14px',
        zIndex: 12,
        fontSize: '0.76rem',
        backgroundColor: 'rgba(255, 255, 255, 0.96)',
        borderColor: '#e2e8f0',
        borderRadius: '10px',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#635bff',
            }}
          />
          <span style={{ fontWeight: 800, color: '#0f172a', letterSpacing: '0.04em', fontSize: '0.78rem' }}>
            JUNCTION FLOW METRICS
          </span>
        </div>
        {collapsed ? <ChevronDown size={14} color="#64748b" /> : <ChevronUp size={14} color="#64748b" />}
      </div>

      {/* Headline counters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
        <div
          style={{
            padding: '8px 10px',
            backgroundColor: '#f8fafc',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
          }}
          title="Active vehicles circulating on the roundabout ring"
        >
          <div style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.66rem', fontWeight: 700 }}>
            <CircleDot size={12} color="#059669" /> RING CONGESTION
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, fontFamily: 'var(--font-mono)', marginTop: '2px', color: '#0f172a' }}>
            {metrics.roundabout_occupancy} <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>veh</span>
          </div>
        </div>

        <div
          style={{
            padding: '8px 10px',
            backgroundColor: '#f8fafc',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
          }}
          title="Vehicles routed via the bottom-road median U-turn (Tellapur → Nallagandla)"
        >
          <div style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.66rem', fontWeight: 700 }}>
            <Undo2 size={12} color="#d97706" /> U-TURN FLOW
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, fontFamily: 'var(--font-mono)', marginTop: '2px', color: '#0f172a' }}>
            {metrics.uturn_count}
            {metrics.teleports > 0 && (
              <span
                title="Deadlock teleports automatically cleared"
                style={{ marginLeft: '6px', fontSize: '0.68rem', color: '#dc2626' }}
              >
                <AlertTriangle size={10} /> {metrics.teleports}
              </span>
            )}
          </div>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Per-arm inflow / outflow / delay */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ ...headStyle, textAlign: 'left' }}>Road Arm</th>
                <th style={headStyle} title="Vehicles entered">Inflow</th>
                <th style={headStyle} title="Vehicles exited">Outflow</th>
                <th style={headStyle} title="Average delay in seconds per vehicle">
                  Avg Delay
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.arms.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '5px 6px', fontWeight: 700, color: ARM_COLORS[a.id] ?? '#0f172a' }} title={a.name}>
                    {a.name} ({a.id})
                  </td>
                  <td style={cellStyle}>{a.inflow}</td>
                  <td style={cellStyle}>{a.outflow}</td>
                  <td style={cellStyle}>{a.avg_delay_s != null ? `${a.avg_delay_s}s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* O-D route throughput */}
          <div style={{ marginTop: '12px', color: '#64748b', fontWeight: 700, fontSize: '0.64rem', letterSpacing: '0.04em' }}>
            CORRIDOR ROUTES (ACTUAL / DEMAND VEH/H)
          </div>
          {metrics.od.map((o) => {
            const pct = o.configured_vph > 0 ? Math.min(100, (o.throughput_vph / o.configured_vph) * 100) : 0;
            return (
              <div
                key={o.key}
                style={{ marginTop: '6px' }}
                title={`${o.arrived} vehicles arrived at destination`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                  <span style={{ fontWeight: 600, color: ARM_COLORS[o.key.slice(0, 2)] ?? '#0f172a' }}>
                    {odLabel(o.key)}
                    {o.key === 'TL_NG' && <span style={{ color: '#64748b', fontWeight: 500 }}> (U-turn)</span>}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#0f172a' }}>
                    {o.throughput_vph} / {o.configured_vph}
                    <span style={{ color: '#64748b', marginLeft: '6px' }}>
                      {o.avg_travel_time_s != null ? `${o.avg_travel_time_s.toFixed(0)}s` : '—'}
                    </span>
                  </span>
                </div>
                <div style={{ height: '4px', borderRadius: '2px', backgroundColor: '#e2e8f0', overflow: 'hidden', marginTop: '3px' }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      backgroundColor: ARM_COLORS[o.key.slice(0, 2)] ?? '#635bff',
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
              marginTop: '12px',
              color: '#64748b',
              fontWeight: 700,
              fontSize: '0.64rem',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              letterSpacing: '0.04em',
            }}
          >
            <Hourglass size={11} /> WAITING ENTRY QUEUES (LAST 100M)
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            {metrics.entry_queues.map((q) => (
              <div
                key={q.id}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  borderRadius: '6px',
                  backgroundColor: q.halting > 10 ? '#fef2f2' : '#f8fafc',
                  border: `1px solid ${q.halting > 10 ? '#fecaca' : '#e2e8f0'}`,
                }}
                title={q.id}
              >
                <div style={{ fontSize: '0.64rem', color: '#64748b' }}>{q.label}</div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    fontSize: '0.98rem',
                    color: q.halting > 10 ? '#dc2626' : '#0f172a',
                  }}
                >
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

export default JunctionMetricsPanel;
