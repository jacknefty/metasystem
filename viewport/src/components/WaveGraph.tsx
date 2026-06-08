/**
 * WaveGraph — DAG visualization of work contracts
 *
 * Shows wave function (pending) vs collapsed particles (complete)
 * Animates as variety flows through the system
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { COLORS } from '../design-system';
import {
  fetchWorkGraph,
  subscribeToEvents,
  type WorkGraph,
  type WorkGraphNode,
} from '../api/client';

interface WaveGraphProps {
  hubId: string;
  compact?: boolean;
}

interface NodePosition {
  x: number;
  y: number;
}

const NODE_WIDTH = 140;
const NODE_HEIGHT = 80;
const LEVEL_HEIGHT = 120;
const NODE_GAP = 20;

function getNodeColor(node: WorkGraphNode, isLeverage: boolean) {
  if (node.status === 'fulfilled') {
    return {
      fill: `${COLORS.status.healthy}20`,
      stroke: COLORS.status.healthy,
      text: COLORS.status.healthy,
    };
  }
  if (node.status === 'executing') {
    return {
      fill: `${COLORS.member.primary}20`,
      stroke: COLORS.member.primary,
      text: COLORS.text.primary,
    };
  }
  if (node.status === 'blocked' || node.status === 'pending') {
    return {
      fill: 'transparent',
      stroke: COLORS.border.subtle,
      text: COLORS.text.muted,
    };
  }
  // Ready
  return {
    fill: isLeverage ? `${COLORS.status.warning}15` : 'transparent',
    stroke: isLeverage ? COLORS.status.warning : COLORS.text.secondary,
    text: COLORS.text.secondary,
  };
}

function calculatePositions(graph: WorkGraph): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  const levels = new Map<string, number>();

  // Calculate depth levels via topological sort
  const getLevel = (nodeId: string): number => {
    if (levels.has(nodeId)) return levels.get(nodeId)!;

    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node || node.dependsOn.length === 0) {
      levels.set(nodeId, 0);
      return 0;
    }

    const maxDepLevel = Math.max(...node.dependsOn.map(d => getLevel(d)));
    const level = maxDepLevel + 1;
    levels.set(nodeId, level);
    return level;
  };

  graph.nodes.forEach(n => getLevel(n.id));

  // Group nodes by level
  const levelGroups = new Map<number, string[]>();
  levels.forEach((level, nodeId) => {
    if (!levelGroups.has(level)) levelGroups.set(level, []);
    levelGroups.get(level)!.push(nodeId);
  });

  // Position nodes
  levelGroups.forEach((nodeIds, level) => {
    const totalWidth = nodeIds.length * NODE_WIDTH + (nodeIds.length - 1) * NODE_GAP;
    const startX = -totalWidth / 2 + NODE_WIDTH / 2;

    nodeIds.forEach((nodeId, idx) => {
      positions.set(nodeId, {
        x: startX + idx * (NODE_WIDTH + NODE_GAP),
        y: level * LEVEL_HEIGHT,
      });
    });
  });

  return positions;
}

export function WaveGraph({ hubId, compact = false }: WaveGraphProps) {
  const [graph, setGraph] = useState<WorkGraph | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pulsingNodes, setPulsingNodes] = useState<Set<string>>(new Set());
  const svgRef = useRef<SVGSVGElement>(null);

  const loadGraph = useCallback(async () => {
    const data = await fetchWorkGraph(hubId);
    setGraph(data);
  }, [hubId]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      if (
        event.type === 'work:created' ||
        event.type === 'work:fulfilled' ||
        event.type === 'work:dispatched'
      ) {
        loadGraph();

        // Pulse animation for affected node
        if (event.subject) {
          setPulsingNodes(prev => new Set([...prev, event.subject]));
          setTimeout(() => {
            setPulsingNodes(prev => {
              const next = new Set(prev);
              next.delete(event.subject);
              return next;
            });
          }, 1000);
        }
      }
    });

    return unsubscribe;
  }, [loadGraph]);

  if (!graph || graph.nodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: COLORS.text.muted }}
      >
        {graph ? 'No work contracts yet' : 'Loading...'}
      </div>
    );
  }

  const positions = calculatePositions(graph);
  const selectedNode = selected ? graph.nodes.find(n => n.id === selected) : null;

  // Calculate SVG viewBox
  const allPositions = Array.from(positions.values());
  const minX = Math.min(...allPositions.map(p => p.x)) - NODE_WIDTH;
  const maxX = Math.max(...allPositions.map(p => p.x)) + NODE_WIDTH;
  const maxY = Math.max(...allPositions.map(p => p.y)) + NODE_HEIGHT + 40;
  const width = maxX - minX + NODE_WIDTH;
  const height = maxY + 40;

  if (compact) {
    // Compact view for FocusPanel tab
    return (
      <div className="p-3 space-y-3">
        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span style={{ color: COLORS.text.muted }}>Progress</span>
            <span style={{ color: COLORS.text.secondary }}>{graph.stats.progress}%</span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: COLORS.bg.elevated }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${graph.stats.progress}%`,
                background: COLORS.status.healthy,
              }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div
            className="p-2 rounded"
            style={{ background: COLORS.bg.elevated }}
          >
            <div style={{ color: COLORS.text.muted }}>Active</div>
            <div className="text-lg" style={{ color: COLORS.member.primary }}>
              {graph.stats.active}
            </div>
          </div>
          <div
            className="p-2 rounded"
            style={{ background: COLORS.bg.elevated }}
          >
            <div style={{ color: COLORS.text.muted }}>Pending</div>
            <div className="text-lg" style={{ color: COLORS.text.secondary }}>
              {graph.stats.pending}
            </div>
          </div>
          <div
            className="p-2 rounded"
            style={{ background: COLORS.bg.elevated }}
          >
            <div style={{ color: COLORS.text.muted }}>Done</div>
            <div className="text-lg" style={{ color: COLORS.status.healthy }}>
              {graph.stats.complete}
            </div>
          </div>
        </div>

        {/* Variety */}
        <div className="text-xs">
          <span style={{ color: COLORS.text.muted }}>Variety: </span>
          <span style={{ color: COLORS.text.secondary }}>
            {graph.stats.varietyResolved} / {graph.stats.varietyTotal} bits
          </span>
        </div>

        {/* Mini graph */}
        <svg
          viewBox={`${minX} -20 ${width} ${height}`}
          className="w-full"
          style={{ height: 150 }}
        >
          {/* Edges */}
          {graph.edges.map((edge, i) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            return (
              <line
                key={i}
                x1={from.x}
                y1={from.y + NODE_HEIGHT / 2}
                x2={to.x}
                y2={to.y - NODE_HEIGHT / 2 + 10}
                stroke={COLORS.border.subtle}
                strokeWidth={1}
                strokeDasharray="4 2"
              />
            );
          })}

          {/* Nodes */}
          {graph.nodes.map(node => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const isLeverage = node.id === graph.leveragePoint;
            const colors = getNodeColor(node, isLeverage);
            const isPulsing = pulsingNodes.has(node.id);

            return (
              <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}>
                <rect
                  x={-20}
                  y={-10}
                  width={40}
                  height={20}
                  rx={4}
                  fill={colors.fill}
                  stroke={colors.stroke}
                  strokeWidth={isPulsing ? 2 : 1}
                  strokeDasharray={node.status === 'pending' || node.status === 'blocked' ? '3 2' : 'none'}
                  className={isPulsing ? 'animate-pulse' : ''}
                />
                {isLeverage && (
                  <text
                    x={0}
                    y={-15}
                    textAnchor="middle"
                    fontSize={10}
                    fill={COLORS.status.warning}
                  >
                    ★
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  // Full view
  return (
    <div className="flex h-full">
      {/* Graph */}
      <div className="flex-1 overflow-auto p-4">
        <svg
          ref={svgRef}
          viewBox={`${minX} -40 ${width} ${height}`}
          className="w-full"
          style={{ minHeight: 400 }}
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Edges */}
          {graph.edges.map((edge, i) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            return (
              <path
                key={i}
                d={`M ${from.x} ${from.y + NODE_HEIGHT / 2}
                    C ${from.x} ${from.y + NODE_HEIGHT / 2 + 30},
                      ${to.x} ${to.y - NODE_HEIGHT / 2 - 30},
                      ${to.x} ${to.y - NODE_HEIGHT / 2 + 5}`}
                fill="none"
                stroke={COLORS.border.subtle}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                markerEnd="url(#arrowhead)"
              />
            );
          })}

          {/* Arrowhead */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <polygon
                points="0 0, 6 3, 0 6"
                fill={COLORS.border.subtle}
              />
            </marker>
          </defs>

          {/* Nodes */}
          {graph.nodes.map(node => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const isLeverage = node.id === graph.leveragePoint;
            const colors = getNodeColor(node, isLeverage);
            const isPulsing = pulsingNodes.has(node.id);
            const isSelected = selected === node.id;
            const score = node.leverage * node.uncertainty;

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => setSelected(node.id === selected ? null : node.id)}
                style={{ cursor: 'pointer' }}
              >
                {/* Node box */}
                <rect
                  x={-NODE_WIDTH / 2}
                  y={-NODE_HEIGHT / 2}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={8}
                  fill={colors.fill}
                  stroke={isSelected ? COLORS.member.primary : colors.stroke}
                  strokeWidth={isSelected || isPulsing ? 2 : 1}
                  strokeDasharray={node.status === 'pending' || node.status === 'blocked' ? '6 4' : 'none'}
                  filter={isPulsing ? 'url(#glow)' : undefined}
                  className={isPulsing ? 'animate-pulse' : ''}
                />

                {/* Leverage star */}
                {isLeverage && (
                  <text
                    x={NODE_WIDTH / 2 - 15}
                    y={-NODE_HEIGHT / 2 + 15}
                    fontSize={14}
                    fill={COLORS.status.warning}
                  >
                    ★
                  </text>
                )}

                {/* Name */}
                <text
                  x={0}
                  y={-10}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={500}
                  fill={colors.text}
                >
                  {node.name.length > 16 ? node.name.slice(0, 14) + '...' : node.name}
                </text>

                {/* Score */}
                <text
                  x={0}
                  y={8}
                  textAnchor="middle"
                  fontSize={10}
                  fill={COLORS.text.muted}
                >
                  L:{node.leverage} × U:{node.uncertainty} = {score}
                </text>

                {/* Status / agent */}
                <text
                  x={0}
                  y={24}
                  textAnchor="middle"
                  fontSize={9}
                  fill={colors.text}
                >
                  {node.status === 'executing' && node.executorId
                    ? `● ${node.executorId}`
                    : node.status}
                </text>

                {/* Variety progress bar */}
                {node.varietyTotal > 0 && (
                  <g transform={`translate(${-NODE_WIDTH / 2 + 10}, ${NODE_HEIGHT / 2 - 8})`}>
                    <rect
                      x={0}
                      y={0}
                      width={NODE_WIDTH - 20}
                      height={4}
                      rx={2}
                      fill={COLORS.bg.panel}
                    />
                    <rect
                      x={0}
                      y={0}
                      width={((node.varietyResolved / node.varietyTotal) * (NODE_WIDTH - 20))}
                      height={4}
                      rx={2}
                      fill={COLORS.status.healthy}
                    />
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <div
          className="w-64 p-4 border-l overflow-y-auto"
          style={{ borderColor: COLORS.border.subtle, background: COLORS.bg.panel }}
        >
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-medium" style={{ color: COLORS.text.primary }}>
              {selectedNode.name}
            </h3>
            <button
              onClick={() => setSelected(null)}
              style={{ color: COLORS.text.muted }}
            >
              ✕
            </button>
          </div>

          <div className="space-y-4 text-sm">
            <div>
              <div style={{ color: COLORS.text.muted }}>Status</div>
              <div style={{ color: COLORS.text.secondary }}>{selectedNode.status}</div>
            </div>

            {selectedNode.executorId && (
              <div>
                <div style={{ color: COLORS.text.muted }}>Agent</div>
                <div style={{ color: COLORS.member.primary }}>{selectedNode.executorId}</div>
              </div>
            )}

            <div>
              <div style={{ color: COLORS.text.muted }}>Score</div>
              <div style={{ color: COLORS.text.secondary }}>
                L:{selectedNode.leverage} × U:{selectedNode.uncertainty} ={' '}
                {selectedNode.leverage * selectedNode.uncertainty}
              </div>
            </div>

            <div>
              <div style={{ color: COLORS.text.muted }}>Variety</div>
              <div style={{ color: COLORS.text.secondary }}>
                {selectedNode.varietyResolved} / {selectedNode.varietyTotal} bits
              </div>
            </div>

            <div>
              <div style={{ color: COLORS.text.muted }} className="mb-2">
                Conditions
              </div>
              <div className="space-y-1">
                {selectedNode.conditions.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span style={{ color: c.met ? COLORS.status.healthy : COLORS.text.muted }}>
                      {c.met ? '✓' : '○'}
                    </span>
                    <span style={{ color: COLORS.text.secondary }}>
                      {c.description}
                    </span>
                    <span style={{ color: COLORS.text.muted }}>
                      {c.varietyWeight || 0}b
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {selectedNode.dependsOn.length > 0 && (
              <div>
                <div style={{ color: COLORS.text.muted }}>Depends on</div>
                <div style={{ color: COLORS.text.secondary }}>
                  {selectedNode.dependsOn.join(', ')}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
