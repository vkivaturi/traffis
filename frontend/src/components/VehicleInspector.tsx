import React from 'react';
import { X, Eye, Gauge, ArrowUpRight, ShieldAlert } from 'lucide-react';
import type { Vehicle } from '../types/simulation';

const ARM_NAMES: Record<string, string> = { NG: 'Nallagandla', TL: 'Tellapur', FL: 'Flyover' };

interface VehicleInspectorProps {
  vehicle: Vehicle | null;
  scenarioId?: string;
  isFollowing: boolean;
  onFollow: () => void;
  onClose: () => void;
  style?: React.CSSProperties;
}

export const VehicleInspector: React.FC<VehicleInspectorProps> = ({
  vehicle,
  scenarioId,
  isFollowing,
  onFollow,
  onClose,
  style,
}) => {
  if (!vehicle) return null;

  const isBraking = vehicle.acceleration < -0.5;
  const isAccelerating = vehicle.acceleration > 0.5;
  const isWest = vehicle.angle > 180 || vehicle.direction === 'west' || vehicle.y > 0;
  const isRoundabout = scenarioId === 'gnt_circle' || scenarioId === 'gnt_circle_with_traffic_lights';

  // O-D scenarios (e.g. GNT Circle) send the trip key, e.g. "TL_NG", as the direction
  const odMatch = /^([A-Z]{2})_([A-Z]{2})$/.exec(vehicle.direction ?? '');
  const odTag = odMatch ? `${odMatch[1]} → ${odMatch[2]}` : null;
  const odName = odMatch
    ? `${ARM_NAMES[odMatch[1]] ?? odMatch[1]} → ${ARM_NAMES[odMatch[2]] ?? odMatch[2]}${vehicle.direction === 'TL_NG' && isRoundabout ? ' (via U-turn)' : ''}`
    : null;

  const dirName = odName ?? (isWest ? 'Westbound (1000m → 0m)' : 'Eastbound (0m → 1000m)');
  const laneLabel = odMatch
    ? `Lane ${vehicle.lane_index} (${vehicle.lane_index === 0 ? 'kerb side' : 'towards median'})`
    : `${isWest ? 'WB' : 'EB'} ${vehicle.lane_index === 0 ? 'Lane 0 (Right / Slow)' : 'Lane 1 (Left / Fast)'}`;
  const headingName = ['North', 'East', 'South', 'West'][Math.round(((vehicle.angle % 360) + 360) % 360 / 90) % 4];

  return (
    <div
      id="vehicle-inspector-card"
      className="glass-panel"
      style={{
        position: 'absolute',
        top: '74px',
        right: '20px',
        width: '300px',
        padding: '16px',
        zIndex: 25,
        border: '1px solid #e2e8f0',
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
        boxShadow: 'var(--shadow-lg)',
        borderRadius: '10px',
        ...style,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '3px',
              backgroundColor: vehicle.color,
              border: '1px solid rgba(0, 0, 0, 0.1)',
            }}
          />
          <span style={{ fontSize: '0.96rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#0f172a' }}>
            {vehicle.id}
          </span>
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: '#f1f5f9',
              color: '#475569',
            }}
          >
            {vehicle.type.replace('_', ' ')}
          </span>
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: isWest ? '#eff6ff' : '#ecfdf5',
              color: isWest ? '#2563eb' : '#059669',
              border: `1px solid ${isWest ? '#bfdbfe' : '#a7f3d0'}`,
            }}
          >
            {odTag ?? (isWest ? '← WB' : 'EB →')}
          </span>
        </div>
        <button className="btn-icon" style={{ width: '28px', height: '28px' }} onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      {/* Speed & Acceleration Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          marginBottom: '12px',
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          padding: '10px',
          borderRadius: '8px',
        }}
      >
        <div>
          <div style={{ fontSize: '0.68rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
            <Gauge size={12} color="#4a2c11" /> SPEED
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#4a2c11' }}>
            {vehicle.speed_kmh} <span style={{ fontSize: '0.72rem', color: '#64748b' }}>km/h</span>
          </div>
          <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
            ({vehicle.speed.toFixed(1)} m/s)
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.68rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
            <ArrowUpRight size={12} color="#059669" /> ACCELERATION
          </div>
          <div
            style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: isBraking ? '#dc2626' : isAccelerating ? '#059669' : '#0f172a',
            }}
          >
            {vehicle.acceleration > 0 ? `+${vehicle.acceleration}` : vehicle.acceleration}{' '}
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>m/s²</span>
          </div>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, color: isBraking ? '#dc2626' : isAccelerating ? '#059669' : '#64748b' }}>
            {isBraking ? 'Braking' : isAccelerating ? 'Accelerating' : 'Cruising'}
          </div>
        </div>
      </div>

      {/* Position & Lane Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.78rem', marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
          <span style={{ color: '#64748b' }}>Direction:</span>
          <span style={{ fontWeight: 600, color: isWest ? '#2563eb' : '#059669' }}>
            {dirName}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
          <span style={{ color: '#64748b' }}>Position:</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#0f172a' }}>
            {odMatch ? `${vehicle.x.toFixed(1)}, ${vehicle.y.toFixed(1)} m` : `${vehicle.x.toFixed(1)}m / 1000m`}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
          <span style={{ color: '#64748b' }}>Lane:</span>
          <span style={{ fontWeight: 600, color: '#0f172a' }}>
            {laneLabel}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
          <span style={{ color: '#64748b' }}>Heading Angle:</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: '#0f172a' }}>{vehicle.angle}° ({odMatch ? headingName : isWest ? 'West' : 'East'})</span>
        </div>

        {vehicle.leader_id && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '6px 8px', borderRadius: '6px' }}>
            <span style={{ color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
              <ShieldAlert size={13} /> Leader ({vehicle.leader_id}):
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: vehicle.leader_dist && vehicle.leader_dist < 15 ? '#dc2626' : '#1e40af' }}>
              {vehicle.leader_dist}m ahead
            </span>
          </div>
        )}
      </div>

      {/* Follow Vehicle Button */}
      <button
        className="btn-primary"
        style={{
          width: '100%',
          justifyContent: 'center',
          backgroundColor: isFollowing ? '#dc2626' : '#4a2c11',
          borderColor: isFollowing ? '#b91c1c' : 'rgba(0, 0, 0, 0.1)',
        }}
        onClick={onFollow}
      >
        <Eye size={16} />
        <span>{isFollowing ? 'Stop Tracking' : 'Track with Camera'}</span>
      </button>
    </div>
  );
};

export default VehicleInspector;
