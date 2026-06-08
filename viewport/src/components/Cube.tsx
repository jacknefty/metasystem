/**
 * VSM Cube — 3D interface to the 6 canonical subsystems
 *
 * Each face maps to a directory in src/:
 * - Operations (front)   → src/operations/
 * - Control (bottom)     → src/control/
 * - Intelligence (top)   → src/intelligence/
 * - Coordination (left)  → src/coordination/
 * - Identity (right)     → src/identity/
 * - Audit (back)         → src/audit/
 *
 * The 18 transducers sit on the ports between these subsystems.
 */

import { useState } from 'react';
import { OperationsFace } from './BlackBox/faces/OperationsFace';
import { AuditFace } from './BlackBox/faces/AuditFace';
import { IntelligenceFace } from './BlackBox/faces/IntelligenceFace';
import { ControlFace } from './BlackBox/faces/ControlFace';
import { CoordinationFace } from './BlackBox/faces/CoordinationFace';
import { IdentityFace } from './BlackBox/faces/IdentityFace';

interface CubeProps {
  onClose?: () => void;
  viewportSize: { width: number; height: number };
  scopeId?: string;
}

type Face = 'operations' | 'audit' | 'intelligence' | 'control' | 'coordination' | 'identity';

const FACE_ROTATIONS: Record<Face, { x: number; y: number }> = {
  operations: { x: 0, y: 0 },
  audit: { x: 0, y: 180 },
  intelligence: { x: -90, y: 0 },
  control: { x: 90, y: 0 },
  coordination: { x: 0, y: 90 },
  identity: { x: 0, y: -90 },
};

const GLOW_COLOR = '#0ff';
const GLOW_COLOR_DIM = 'rgba(0, 255, 255, 0.4)';

export function Cube({ onClose, viewportSize, scopeId = 'default' }: CubeProps) {
  const [activeFace, setActiveFace] = useState<Face>('operations');
  const [rotX, setRotX] = useState(0);
  const [rotY, setRotY] = useState(0);

  const cubeSize = Math.min(viewportSize.width, viewportSize.height) * 0.64;
  const half = cubeSize / 2;

  const perspective = 2000;
  const apparentSize = cubeSize * (perspective / (perspective - half));
  const cubeBottomFromViewportBottom = (viewportSize.height - apparentSize) / 2;
  const navHeight = 55;
  const navCenterFromBottom = cubeBottomFromViewportBottom / 2;
  const navFromBottom = navCenterFromBottom - navHeight / 2;

  const rotateTo = (face: Face) => {
    setActiveFace(face);
    setRotX(FACE_ROTATIONS[face].x);
    setRotY(FACE_ROTATIONS[face].y);
  };

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Backdrop - click to close */}
      <div
        style={{ position: 'absolute', inset: 0 }}
        onClick={onClose}
      />

      {/* Cube area - blocks backdrop clicks */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: apparentSize,
          height: apparentSize,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Perspective container */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            perspective: perspective,
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Rotating cube with interactive faces */}
          <div
            style={{
              width: cubeSize,
              height: cubeSize,
              position: 'relative',
              transformStyle: 'preserve-3d',
              transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`,
              transition: 'transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
          >
            <CubeFace size={cubeSize} transform={`translateZ(${half}px)`}>
              <OperationsFace scopeId={scopeId} active={activeFace === 'operations'} />
            </CubeFace>

            <CubeFace size={cubeSize} transform={`rotateY(180deg) translateZ(${half}px)`}>
              <AuditFace scopeId={scopeId} active={activeFace === 'audit'} />
            </CubeFace>

            <CubeFace size={cubeSize} transform={`rotateX(90deg) translateZ(${half}px)`}>
              <IntelligenceFace scopeId={scopeId} active={activeFace === 'intelligence'} />
            </CubeFace>

            <CubeFace size={cubeSize} transform={`rotateX(-90deg) translateZ(${half}px)`}>
              <ControlFace scopeId={scopeId} active={activeFace === 'control'} />
            </CubeFace>

            <CubeFace size={cubeSize} transform={`rotateY(-90deg) translateZ(${half}px)`}>
              <CoordinationFace scopeId={scopeId} active={activeFace === 'coordination'} />
            </CubeFace>

            <CubeFace size={cubeSize} transform={`rotateY(90deg) translateZ(${half}px)`}>
              <IdentityFace scopeId={scopeId} active={activeFace === 'identity'} />
            </CubeFace>
          </div>
        </div>
      </div>

      {/* Nav dock */}
      <div
        style={{
          position: 'absolute',
          bottom: navFromBottom,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 8,
          padding: '8px 12px',
          background: 'rgba(10, 10, 15, 0.9)',
          border: `1px solid ${GLOW_COLOR_DIM}`,
          borderRadius: 12,
          boxShadow: `0 0 20px rgba(0, 255, 255, 0.1), inset 0 0 20px rgba(0, 255, 255, 0.03)`,
        }}
      >
        <NavButton icon="◆" label="OPS" active={activeFace === 'operations'} onClick={() => rotateTo('operations')} />
        <NavButton icon="◈" label="INT" active={activeFace === 'intelligence'} onClick={() => rotateTo('intelligence')} />
        <NavButton icon="◇" label="CTL" active={activeFace === 'control'} onClick={() => rotateTo('control')} />
        <NavButton icon="⇄" label="CRD" active={activeFace === 'coordination'} onClick={() => rotateTo('coordination')} />
        <NavButton icon="⬡" label="IDN" active={activeFace === 'identity'} onClick={() => rotateTo('identity')} />
        <NavButton icon="◎" label="AUD" active={activeFace === 'audit'} onClick={() => rotateTo('audit')} />
      </div>
    </div>
  );
}

function CubeFace({
  size,
  transform,
  children,
}: {
  size: number;
  transform: string;
  children?: React.ReactNode;
}) {
  const cornerSize = 12;

  return (
    <div
      style={{
        position: 'absolute',
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #0a0a12 0%, #06060a 100%)',
        overflow: 'hidden',
        transform,
        backfaceVisibility: 'hidden',
        transformStyle: 'preserve-3d',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Glowing border */}
      <div style={{
        position: 'absolute',
        inset: 0,
        border: `1px solid ${GLOW_COLOR_DIM}`,
        boxShadow: `
          inset 0 0 40px rgba(0, 255, 255, 0.04),
          0 0 15px rgba(0, 255, 255, 0.15)
        `,
        pointerEvents: 'none',
      }} />

      {/* Corner accents */}
      <CornerAccent position="top-left" size={cornerSize} />
      <CornerAccent position="top-right" size={cornerSize} />
      <CornerAccent position="bottom-left" size={cornerSize} />
      <CornerAccent position="bottom-right" size={cornerSize} />

      {/* Edge glow lines */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: cornerSize,
        right: cornerSize,
        height: 1,
        background: `linear-gradient(90deg, transparent, ${GLOW_COLOR}, transparent)`,
        opacity: 0.6,
        boxShadow: `0 0 8px ${GLOW_COLOR}`,
      }} />
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: cornerSize,
        right: cornerSize,
        height: 1,
        background: `linear-gradient(90deg, transparent, ${GLOW_COLOR}, transparent)`,
        opacity: 0.6,
        boxShadow: `0 0 8px ${GLOW_COLOR}`,
      }} />
      <div style={{
        position: 'absolute',
        left: 0,
        top: cornerSize,
        bottom: cornerSize,
        width: 1,
        background: `linear-gradient(180deg, transparent, ${GLOW_COLOR}, transparent)`,
        opacity: 0.6,
        boxShadow: `0 0 8px ${GLOW_COLOR}`,
      }} />
      <div style={{
        position: 'absolute',
        right: 0,
        top: cornerSize,
        bottom: cornerSize,
        width: 1,
        background: `linear-gradient(180deg, transparent, ${GLOW_COLOR}, transparent)`,
        opacity: 0.6,
        boxShadow: `0 0 8px ${GLOW_COLOR}`,
      }} />

      {/* Content */}
      {children && (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function CornerAccent({ position, size }: { position: string; size: number }) {
  const styles: React.CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    pointerEvents: 'none',
  };

  const lineStyle: React.CSSProperties = {
    position: 'absolute',
    background: GLOW_COLOR,
    boxShadow: `0 0 6px ${GLOW_COLOR}, 0 0 12px ${GLOW_COLOR}`,
  };

  if (position === 'top-left') {
    return (
      <div style={{ ...styles, top: 0, left: 0 }}>
        <div style={{ ...lineStyle, top: 0, left: 0, width: size, height: 2 }} />
        <div style={{ ...lineStyle, top: 0, left: 0, width: 2, height: size }} />
      </div>
    );
  }
  if (position === 'top-right') {
    return (
      <div style={{ ...styles, top: 0, right: 0 }}>
        <div style={{ ...lineStyle, top: 0, right: 0, width: size, height: 2 }} />
        <div style={{ ...lineStyle, top: 0, right: 0, width: 2, height: size }} />
      </div>
    );
  }
  if (position === 'bottom-left') {
    return (
      <div style={{ ...styles, bottom: 0, left: 0 }}>
        <div style={{ ...lineStyle, bottom: 0, left: 0, width: size, height: 2 }} />
        <div style={{ ...lineStyle, bottom: 0, left: 0, width: 2, height: size }} />
      </div>
    );
  }
  if (position === 'bottom-right') {
    return (
      <div style={{ ...styles, bottom: 0, right: 0 }}>
        <div style={{ ...lineStyle, bottom: 0, right: 0, width: size, height: 2 }} />
        <div style={{ ...lineStyle, bottom: 0, right: 0, width: 2, height: size }} />
      </div>
    );
  }
  return null;
}

function NavButton({
  icon,
  label,
  active,
  onClick
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        width: 48,
        height: 48,
        background: active
          ? 'linear-gradient(135deg, rgba(0, 255, 255, 0.2) 0%, rgba(0, 255, 255, 0.1) 100%)'
          : 'linear-gradient(135deg, rgba(20, 20, 30, 0.8) 0%, rgba(15, 15, 25, 0.8) 100%)',
        color: active ? GLOW_COLOR : '#4a5568',
        border: `1px solid ${active ? GLOW_COLOR : 'rgba(100, 100, 120, 0.3)'}`,
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: active
          ? `0 0 15px rgba(0, 255, 255, 0.3), inset 0 0 10px rgba(0, 255, 255, 0.1)`
          : 'none',
      }}
    >
      <span style={{
        fontSize: 18,
        textShadow: active ? `0 0 10px ${GLOW_COLOR}` : 'none',
      }}>
        {icon}
      </span>
      <span style={{
        fontSize: 9,
        letterSpacing: '0.08em',
        fontWeight: 500,
        textShadow: active ? `0 0 8px ${GLOW_COLOR}` : 'none',
      }}>
        {label}
      </span>
    </button>
  );
}
