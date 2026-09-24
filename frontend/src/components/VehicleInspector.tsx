import React from 'react';
import { X, Eye, Gauge, ArrowUpRight, ShieldAlert } from 'lucide-react';
import type { Vehicle } from '../types/simulation';

interface VehicleInspectorProps {
  vehicle: Vehicle | null;
  isFollowing: boolean;
  onFollow: () => void;
  onClose: () => void;
}

export const VehicleInspector: React.FC<VehicleInspectorProps> = ({
  vehicle,
  isFollowing,
  onFollow,
  onClose,
}) => {
  if (!vehicle) return null;

  const isBraking = vehicle.acceleration < -0.5;
  const isAccelerating = vehicle.acceleration > 0.5;

  const laneNames = ['Lane 0 (Right / Slow)', 'Lane 1 (Middle)', 'Lane 2 (Left / Fast)'];

  return (
    <div
      id="vehicle-inspector-card"
      className="glass-panel"
      style={{
        position: 'absolute',
        top: '80px',
        right: '20px',
        width: '300px',
        padding: '16px',
        zIndex: 25,
        border: '1px solid rgba(56, 189, 248, 0.3)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), var(--glow-cyan)',
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
              boxShadow: `0 0 8px ${vehicle.color}`,
            }}
          />
          <span style={{ fontSize: '0.95rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#f8fafc' }}>
            {vehicle.id}
          </span>
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: '#94a3b8',
            }}
          >
            {vehicle.type}
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
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          padding: '10px',
          borderRadius: '8px',
        }}
      >
        <div>
          <div style={{ fontSize: '0.68rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Gauge size={12} /> SPEED
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
            {vehicle.speed_kmh} <span style={{ fontSize: '0.7rem' }}>km/h</span>
          </div>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
            ({vehicle.speed.toFixed(1)} m/s)
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.68rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowUpRight size={12} /> ACCELERATION
          </div>
          <div
            style={{
              fontSize: '1.2rem',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: isBraking ? '#f43f5e' : isAccelerating ? '#10b981' : '#f8fafc',
            }}
          >
            {vehicle.acceleration > 0 ? `+${vehicle.acceleration}` : vehicle.acceleration}{' '}
            <span style={{ fontSize: '0.7rem' }}>m/s²</span>
          </div>
          <div style={{ fontSize: '0.68rem', color: isBraking ? '#f43f5e' : isAccelerating ? '#10b981' : '#64748b' }}>
            {isBraking ? 'Braking' : isAccelerating ? 'Accelerating' : 'Cruising'}
          </div>
        </div>
      </div>

      {/* Position & Lane Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.78rem', marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '4px' }}>
          <span style={{ color: '#94a3b8' }}>Position:</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            {vehicle.x.toFixed(1)}m / 1000m
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '4px' }}>
          <span style={{ color: '#94a3b8' }}>Lane:</span>
          <span style={{ fontWeight: 600, color: '#38bdf8' }}>
            {laneNames[vehicle.lane_index] || `Lane ${vehicle.lane_index}`}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '4px' }}>
          <span style={{ color: '#94a3b8' }}>Heading Angle:</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{vehicle.angle}° (East)</span>
        </div>

        {vehicle.leader_id && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(56, 189, 248, 0.08)', padding: '6px 8px', borderRadius: '6px' }}>
            <span style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShieldAlert size={13} /> Leader ({vehicle.leader_id}):
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: vehicle.leader_dist && vehicle.leader_dist < 15 ? '#f43f5e' : '#f8fafc' }}>
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
          backgroundColor: isFollowing ? '#f43f5e' : undefined,
          borderColor: isFollowing ? 'rgba(244, 63, 94, 0.4)' : undefined,
        }}
        onClick={onFollow}
      >
        <Eye size={16} />
        <span>{isFollowing ? 'Stop Tracking' : 'Track with Camera'}</span>
      </button>
    </div>
  );
};
