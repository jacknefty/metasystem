/**
 * NodeBox — Glowing black cube node
 *
 * Renders centered at its position. Parent handles absolute positioning.
 * hasAlgedonic: true causes a red glow + pulse animation (pain signal active)
 */

import { motion } from 'motion/react';
import { COLORS, getNodeColors, type NodeRole } from '../design-system';

interface NodeBoxProps {
  id: string;
  name: string;
  role: NodeRole;
  selected?: boolean;
  hasAlgedonic?: boolean;
  onClick?: () => void;
}

function CubeNode({ glowColor, size = 80, pulse = false }: { glowColor: string; size?: number; pulse?: boolean }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      animate={pulse ? {
        filter: ['drop-shadow(0 0 8px ' + glowColor + ')', 'drop-shadow(0 0 20px ' + glowColor + ')', 'drop-shadow(0 0 8px ' + glowColor + ')'],
      } : {}}
      transition={pulse ? {
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      } : {}}
    >
      <defs>
        <filter id={`glow-${glowColor.replace('#', '')}`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={`topFace-${glowColor.replace('#', '')}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0f0f0f" />
          <stop offset="100%" stopColor="#080808" />
        </linearGradient>
      </defs>

      {/* Solid dark cube - true isometric (all edges = 40 units) */}
      <polygon points="50,15 85,35 50,55 15,35" fill={`url(#topFace-${glowColor.replace('#', '')})`} />
      <polygon points="15,35 50,55 50,95 15,75" fill="#060606" />
      <polygon points="85,35 50,55 50,95 85,75" fill="#0a0a0a" />

      {/* All edges glowing */}
      <g filter={`url(#glow-${glowColor.replace('#', '')})`} stroke={glowColor} strokeWidth="1.5" fill="none">
        <line x1="50" y1="15" x2="85" y2="35" />
        <line x1="50" y1="15" x2="15" y2="35" />
        <line x1="15" y1="35" x2="50" y2="55" />
        <line x1="85" y1="35" x2="50" y2="55" />
        <line x1="50" y1="55" x2="50" y2="95" />
        <line x1="15" y1="35" x2="15" y2="75" />
        <line x1="85" y1="35" x2="85" y2="75" />
        <line x1="15" y1="75" x2="50" y2="95" />
        <line x1="85" y1="75" x2="50" y2="95" />
      </g>
    </motion.svg>
  );
}

export function NodeBox({
  name,
  role,
  selected = false,
  hasAlgedonic = false,
  onClick,
}: NodeBoxProps) {
  const colors = getNodeColors(role);
  const cubeSize = 80;

  // Override glow color to red if algedonic pain is active
  const glowColor = hasAlgedonic ? '#ff3333' : colors.glow;

  return (
    <motion.div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: 'pointer',
      }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: 1,
        scale: selected ? 1.1 : 1,
      }}
      whileHover={{ scale: 1.05 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      onClick={onClick}
    >
      <CubeNode glowColor={glowColor} size={cubeSize} pulse={hasAlgedonic} />

      {/* Name label */}
      <div
        style={{
          marginTop: 8,
          fontSize: '0.875rem',
          fontWeight: 500,
          color: hasAlgedonic ? '#ff6666' : colors.text,
          textAlign: 'center',
          maxWidth: 120,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </div>

      {/* Role label */}
      <div
        style={{
          fontSize: '0.625rem',
          color: COLORS.text.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginTop: 2,
        }}
      >
        {role}
      </div>
    </motion.div>
  );
}
