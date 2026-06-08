/**
 * BlackBoxPanel — VSM Black Box Interface (flat 2D mode)
 *
 * 6 tabs for the canonical subsystems:
 * - Operations: Work execution, chat
 * - Intelligence: Environment, planning
 * - Control: Children, variety flow
 * - Coordination: Peer sync, dampening
 * - Identity: Policy, settings
 * - Audit: Governance, audit trail
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { COLORS } from '../design-system';
import { OperationsFace } from './BlackBox/faces/OperationsFace';
import { IntelligenceFace } from './BlackBox/faces/IntelligenceFace';
import { ControlFace } from './BlackBox/faces/ControlFace';
import { CoordinationFace } from './BlackBox/faces/CoordinationFace';
import { IdentityFace } from './BlackBox/faces/IdentityFace';
import { AuditFace } from './BlackBox/faces/AuditFace';

interface BlackBoxPanelProps {
  nodeId: string;
  onClose?: () => void;
}

type Channel = 'operations' | 'intelligence' | 'control' | 'coordination' | 'identity' | 'audit';

const CHANNELS: { id: Channel; label: string; icon: string; color: string }[] = [
  { id: 'operations', label: 'Operations', icon: '◆', color: COLORS.cyber.line },
  { id: 'intelligence', label: 'Intelligence', icon: '◈', color: COLORS.localRoot.primary },
  { id: 'control', label: 'Control', icon: '◇', color: COLORS.networkOperations.primary },
  { id: 'coordination', label: 'Coordination', icon: '⇄', color: COLORS.localHub.primary },
  { id: 'identity', label: 'Identity', icon: '⬡', color: COLORS.status.executing },
  { id: 'audit', label: 'Audit', icon: '◎', color: COLORS.networkIdentity.primary },
];

const ROTATIONS: Record<Channel, { x: number; y: number }> = {
  operations: { x: 0, y: 0 },
  intelligence: { x: -90, y: 0 },
  control: { x: 90, y: 0 },
  coordination: { x: 0, y: 90 },
  identity: { x: 0, y: -90 },
  audit: { x: 0, y: 180 },
};

export function BlackBoxPanel({ nodeId, onClose }: BlackBoxPanelProps) {
  const [activeChannel, setActiveChannel] = useState<Channel>('operations');

  const currentChannel = CHANNELS.find(c => c.id === activeChannel)!;
  const rot = ROTATIONS[activeChannel];
  const cubeSize = 120;
  const half = cubeSize / 2;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose?.();
  };

  return (
    <div className="blackbox-panel" onClick={handleBackdropClick}>
      {/* Top section with cube */}
      <div className="flex flex-col items-center pt-6 pb-4 flex-shrink-0">
        {/* 3D Cube */}
        <div style={{ perspective: 600 }}>
          <motion.div
            animate={{ rotateX: -rot.x, rotateY: -rot.y }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            style={{
              width: cubeSize,
              height: cubeSize,
              transformStyle: 'preserve-3d',
              position: 'relative',
            }}
          >
            {CHANNELS.map(channel => (
              <CubeFaceLabel
                key={channel.id}
                channel={channel}
                size={cubeSize}
                half={half}
                isActive={activeChannel === channel.id}
                onClick={() => setActiveChannel(channel.id)}
              />
            ))}
          </motion.div>
        </div>

        {/* Channel dock */}
        <div className="flex gap-2 mt-4">
          {CHANNELS.map(channel => (
            <motion.button
              key={channel.id}
              onClick={() => setActiveChannel(channel.id)}
              whileHover={{ scale: 1.1, y: -2 }}
              whileTap={{ scale: 0.95 }}
              className="w-10 h-10 rounded-lg flex flex-col items-center justify-center"
              style={{
                background: activeChannel === channel.id ? channel.color : `${COLORS.bg.elevated}dd`,
                color: activeChannel === channel.id ? COLORS.bg.deep : channel.color,
                boxShadow: activeChannel === channel.id
                  ? `0 4px 15px ${channel.color}50`
                  : '0 2px 6px rgba(0,0,0,0.3)',
              }}
            >
              <span style={{ fontSize: '1rem' }}>{channel.icon}</span>
              <span style={{ fontSize: '0.4rem', fontWeight: 600, opacity: 0.9 }}>
                {channel.label.slice(0, 3).toUpperCase()}
              </span>
            </motion.button>
          ))}
        </div>

        {/* Current channel label */}
        <div className="mt-3 text-center">
          <div
            className="text-sm font-medium uppercase tracking-wider"
            style={{ color: currentChannel.color, textShadow: `0 0 10px ${currentChannel.color}` }}
          >
            {currentChannel.label}
          </div>
          <div className="text-xs" style={{ color: COLORS.text.muted }}>
            {nodeId.length > 24 ? nodeId.slice(0, 24) + '...' : nodeId}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div
        className="flex-1 overflow-hidden min-h-0 mx-4 mb-4 rounded-lg"
        style={{
          background: COLORS.bg.surface,
          border: `1px solid ${currentChannel.color}30`,
          boxShadow: `inset 0 0 30px ${currentChannel.color}10`,
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeChannel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            {activeChannel === 'operations' && <OperationsFace scopeId={nodeId} active />}
            {activeChannel === 'intelligence' && <IntelligenceFace scopeId={nodeId} active />}
            {activeChannel === 'control' && <ControlFace scopeId={nodeId} active />}
            {activeChannel === 'coordination' && <CoordinationFace scopeId={nodeId} active />}
            {activeChannel === 'identity' && <IdentityFace scopeId={nodeId} active />}
            {activeChannel === 'audit' && <AuditFace scopeId={nodeId} active />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function CubeFaceLabel({
  channel,
  size,
  half,
  isActive,
  onClick,
}: {
  channel: { id: Channel; label: string; icon: string; color: string };
  size: number;
  half: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const transforms: Record<Channel, string> = {
    operations: `translateZ(${half}px)`,
    audit: `rotateY(180deg) translateZ(${half}px)`,
    intelligence: `rotateX(90deg) translateZ(${half}px)`,
    control: `rotateX(-90deg) translateZ(${half}px)`,
    coordination: `rotateY(-90deg) translateZ(${half}px)`,
    identity: `rotateY(90deg) translateZ(${half}px)`,
  };

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="absolute cursor-pointer flex flex-col items-center justify-center"
      style={{
        width: size,
        height: size,
        transform: transforms[channel.id],
        backfaceVisibility: 'hidden',
        background: `linear-gradient(135deg, ${COLORS.bg.void} 0%, ${COLORS.bg.deep} 100%)`,
        border: `2px solid ${isActive ? channel.color : `${channel.color}60`}`,
        borderRadius: 4,
        boxShadow: isActive
          ? `inset 0 0 20px ${channel.color}30, 0 0 15px ${channel.color}40`
          : `inset 0 0 15px ${channel.color}15`,
      }}
    >
      <span
        style={{
          color: channel.color,
          fontSize: '2rem',
          textShadow: `0 0 15px ${channel.color}`,
        }}
      >
        {channel.icon}
      </span>
      <span
        className="text-xs uppercase tracking-wider mt-1 font-medium"
        style={{ color: channel.color }}
      >
        {channel.label}
      </span>
    </div>
  );
}
