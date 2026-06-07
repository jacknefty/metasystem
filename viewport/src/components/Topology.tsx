/**
 * Topology — Two-level recursive map view
 *
 * Local level: User S5 at center with agent/project S1s packed around it
 * Network level: Zoom out to see local S5 as S1 of MetasystemDAO
 *
 * Continuous zoom transition between levels.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { NodeBox } from './NodeBox';
import { CreateModal } from './CreateModal';
import { CreateDAOModal } from './CreateDAOModal';
import { Starfield, type StarfieldHandle } from './Starfield';
import { COLORS, LAYOUT, type NodeRole } from '../design-system';
import { fetchWorkspaceRoot, fetchMembers, fetchNetworkTopology, fetchNetworkStatus, fetchNetworkMember, type Identity, type NetworkDAO, type NetworkMemberInfo } from '../api/client';
import { subscribe } from '../api/events';
import { useAccount } from 'wagmi';

interface TopologyNode {
  id: string;
  name: string;
  role: NodeRole;
  x: number;
  y: number;
}

interface TopologyProps {
  onNodeSelect: (nodeId: string | null) => void;
  selectedNode: string | null;
}

/**
 * Circle packing for S1s around S5.
 *
 * Evenly distributes nodes in concentric rings.
 * Scale-free: works for 1 node or 1000 nodes.
 *
 * First ring fits as many as circumference allows,
 * overflow goes to next ring outward.
 */
function packNodesInRings(
  count: number,
  centerX: number,
  centerY: number,
  startRadius: number,
  nodeSize: number = 100
): Array<{ x: number; y: number }> {
  if (count === 0) return [];

  const positions: Array<{ x: number; y: number }> = [];
  const minGap = nodeSize * 0.4; // Minimum space between node centers
  let remaining = count;
  let currentRadius = startRadius;

  while (remaining > 0) {
    const circumference = 2 * Math.PI * currentRadius;
    // How many nodes fit in this ring with proper spacing
    const maxInRing = Math.max(1, Math.floor(circumference / (nodeSize + minGap)));
    const nodesInRing = Math.min(remaining, maxInRing);

    // Evenly distribute around the ring, starting from top (-π/2)
    for (let i = 0; i < nodesInRing; i++) {
      const angle = (2 * Math.PI * i) / nodesInRing - Math.PI / 2;
      positions.push({
        x: centerX + currentRadius * Math.cos(angle),
        y: centerY + currentRadius * Math.sin(angle),
      });
    }

    remaining -= nodesInRing;
    // Next ring is further out
    currentRadius += nodeSize + minGap;
  }

  return positions;
}

// Network level data is now fetched from contracts

export function Topology({ onNodeSelect, selectedNode }: TopologyProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [nodes, setNodes] = useState<TopologyNode[]>([]);
  const [rootId, setRootId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateDAOModal, setShowCreateDAOModal] = useState(false);
  const [algedonicNodes, setAlgedonicNodes] = useState<Set<string>>(new Set());

  // Network state
  const [networkDAOs, setNetworkDAOs] = useState<NetworkDAO[]>([]);
  const [networkMembers, setNetworkMembers] = useState<NetworkMemberInfo[]>([]);
  const [networkConnected, setNetworkConnected] = useState(false);
  const [networkMemberCount, setNetworkMemberCount] = useState(0);

  // Current user's wallet address and membership status
  const { address: currentUserAddress, isConnected } = useAccount();
  const [isVerifiedMember, setIsVerifiedMember] = useState(false);

  // Viewport dimensions
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });

  // Level transition threshold
  const NETWORK_THRESHOLD = 0.5;
  const isNetworkLevel = zoom < NETWORK_THRESHOLD;

  // Interpolation factor for smooth transition (0 = full local, 1 = full network)
  const transitionT = useMemo(() => {
    if (zoom >= 0.7) return 0;
    if (zoom <= 0.3) return 1;
    return 1 - (zoom - 0.3) / 0.4;
  }, [zoom]);

  useEffect(() => {
    const updateSize = () => {
      const el = document.querySelector('.viewport');
      if (el) {
        setViewportSize({
          width: el.clientWidth,
          height: el.clientHeight,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Fetch and layout local nodes
  const loadNodes = useCallback(async () => {
    setLoading(true);

    try {
      // Get workspace root
      const { rootId: wsRootId, root } = await fetchWorkspaceRoot();
      if (!wsRootId || !root) {
        setNodes([]);
        setLoading(false);
        return;
      }

      setRootId(wsRootId);

      // Get members (nodes that have joined root)
      const members = await fetchMembers(wsRootId);
      const activeMembers = members.filter((m: Identity) => m.status === 'active');

      const centerX = viewportSize.width / 2;
      const centerY = viewportSize.height / 2;

      // Build node list
      const nodeList: TopologyNode[] = [];

      // Root S5 at center (green)
      nodeList.push({
        id: root.id,
        name: root.name,
        role: 'local-root',
        x: centerX,
        y: centerY,
      });

      // S1s (members) in packed rings
      // Color depends on whether they have members (project=gold) or not (s1=orange)
      const positions = packNodesInRings(
        activeMembers.length,
        centerX,
        centerY,
        LAYOUT.s1Radius,
        90
      );

      activeMembers.forEach((member: Identity, i: number) => {
        const hasMembers = (member.memberCount || 0) > 0;
        const role = hasMembers ? 'local-project' : 'local-s1';
        console.log(`[Topology] ${member.name}: memberCount=${member.memberCount}, hasMembers=${hasMembers}, role=${role}`);
        nodeList.push({
          id: member.id,
          name: member.name,
          role,
          x: positions[i]?.x || centerX,
          y: positions[i]?.y || centerY,
        });
      });

      setNodes(nodeList);
    } catch (err) {
      console.error('Failed to load topology:', err);
    } finally {
      setLoading(false);
    }
  }, [viewportSize]);

  // Load network topology
  const loadNetwork = useCallback(async () => {
    try {
      const [status, topology] = await Promise.all([
        fetchNetworkStatus(),
        fetchNetworkTopology(),
      ]);

      setNetworkConnected(status.connected);
      setNetworkMemberCount(status.memberCount || 0);

      if (topology) {
        setNetworkDAOs(topology.daos);
        setNetworkMembers(topology.members || []);
      }
    } catch (err) {
      console.error('Failed to load network:', err);
      setNetworkConnected(false);
    }
  }, []);

  // Verify membership when wallet connects/changes
  useEffect(() => {
    if (!isConnected || !currentUserAddress) {
      setIsVerifiedMember(false);
      return;
    }

    fetchNetworkMember(currentUserAddress).then(member => {
      setIsVerifiedMember(member?.isMember ?? false);
    }).catch(() => {
      setIsVerifiedMember(false);
    });
  }, [isConnected, currentUserAddress]);

  useEffect(() => {
    loadNodes();
    loadNetwork();

    // Subscribe to chain events
    const unsubscribe = subscribe((event) => {
      if (event.type.startsWith('identity:')) {
        loadNodes();
      }
      // Track algedonic state from events directly
      if (event.type === 'algedonic:pain') {
        const payload = event.payload as { projectId?: string; workId?: string };
        setAlgedonicNodes(prev => {
          const next = new Set(prev);
          next.add(event.subject);
          if (payload.projectId) next.add(payload.projectId);
          return next;
        });
        // Auto-clear after 60s
        setTimeout(() => {
          setAlgedonicNodes(prev => {
            const next = new Set(prev);
            next.delete(event.subject);
            if (payload.projectId) next.delete(payload.projectId);
            return next;
          });
        }, 60000);
      }
    });

    return unsubscribe;
  }, [loadNodes, loadNetwork]);

  
  // Zoom handler (wheel to zoom in/out)
  // Below 20%, we stop zooming and start panning (0 to 1 = jack centered to DAO centered)
  const [panProgress, setPanProgress] = useState(0);
  const panProgressRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep ref in sync
  useEffect(() => {
    panProgressRef.current = panProgress;
  }, [panProgress]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      const scrollingOut = delta < 0;
      const scrollingIn = delta > 0;

      setZoom((z) => {
        // If at min zoom and scrolling out, pan instead
        if (z <= 0.2 && scrollingOut) {
          setPanProgress((p) => Math.min(1, p + 0.1));
          return 0.2;
        }

        // If at min zoom with pan, reduce pan first before zooming in
        if (z <= 0.2 && scrollingIn && panProgressRef.current > 0) {
          setPanProgress((p) => Math.max(0, p - 0.1));
          return 0.2;
        }

        // Normal zoom
        return Math.max(0.2, Math.min(1.2, z + delta));
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // Add button handler
  const handleAdd = () => {
    setShowCreateModal(true);
  };

  const handleCreateModalClose = () => {
    setShowCreateModal(false);
  };

  const handleCreated = () => {
    loadNodes();
  };

  // Separate render lists for different layers
  const { localS1s, networkS1s, localS5Node, networkS5Node } = useMemo(() => {
    if (!rootId) return { localS1s: [], networkS1s: [], localS5Node: null, networkS5Node: null };

    const centerX = viewportSize.width / 2;
    const centerY = viewportSize.height / 2;

    // Local S1s (fade out as we approach network level)
    const localS1Opacity = Math.max(0, 1 - transitionT * 2);
    const localS1s = nodes.slice(1).map((node) => ({
      ...node,
      opacity: localS1Opacity,
      scale: 1,
    }));

    // Network S1s (DAOs + other members orbit around MetasystemDAO S5)
    const orbitRadius = LAYOUT.s1Radius;
    const networkS1Opacity = Math.max(0, (transitionT - 0.3) / 0.7);
    // Scale: starts large (2.0) when first appearing, shrinks to 1.2 at full zoom-out
    const networkS1Scale = 2.0 - transitionT * 0.8;

    // MetasystemDAO starts above center, pans down to center
    const metasystemStartY = centerY - orbitRadius;
    const panOffsetY = panProgress * (centerY - metasystemStartY);
    const metasystemCurrentY = metasystemStartY + panOffsetY;

    // Build unified list of all S1s at network level:
    // - DAOs (projects)
    // - Other members (excluding current user who stays in special position)
    const currentUserAddrLower = currentUserAddress?.toLowerCase();
    const otherMembers = networkMembers.filter(
      m => m.address.toLowerCase() !== currentUserAddrLower
    );

    // Combine DAOs and other members into one orbit
    // DAOs have members → network-project (indigo)
    // Plain members → network-s1 (cyan)
    const allNetworkS1s: Array<{ id: string; name: string; role: NodeRole }> = [
      ...networkDAOs.map(dao => ({ id: dao.address, name: dao.name, role: 'network-project' as NodeRole })),
      ...otherMembers.map(m => ({
        id: m.address,
        name: `${m.address.slice(0, 6)}...${m.address.slice(-4)}`,
        role: 'network-s1' as NodeRole
      })),
    ];

    // All S1s orbit around MetasystemDAO's current position
    const networkS1Positions = packNodesInRings(
      allNetworkS1s.length,
      centerX,
      metasystemCurrentY,
      orbitRadius,
      90
    );

    const networkS1s = allNetworkS1s.map((node, i) => ({
      id: node.id,
      name: node.name,
      role: node.role,
      x: networkS1Positions[i]?.x || centerX + orbitRadius,
      y: networkS1Positions[i]?.y || metasystemCurrentY,
      opacity: networkS1Opacity,
      scale: networkS1Scale,
    }));

    // Local S5 (current user) - stays below MetasystemDAO at network level
    // At network level, local root becomes network-s1 (cyan) - it's just a member of MetasystemDAO
    // (its local members don't count as network-level sub-DAOs)
    // At local level: stays as local-root (green)
    const localS5 = nodes[0];
    const showAtNetworkLevel = transitionT > 0.5 && isConnected && isVerifiedMember;
    const userRole = showAtNetworkLevel ? 'network-s1' : 'local-root';

    // At network level, hide local S5 if not a verified member
    const localS5Opacity = transitionT > 0.5 && !isVerifiedMember ? 0 : 1;

    const localS5Node = localS5 ? {
      ...localS5,
      role: userRole as NodeRole,
      opacity: localS5Opacity,
      y: centerY + panOffsetY, // Below MetasystemDAO
    } : null;

    // Network S5 (MetasystemDAO) - violet
    const networkS5Opacity = Math.max(0, (transitionT - 0.2) / 0.8);
    const networkS5Node = {
      id: 'metasystem-dao',
      name: 'MetasystemDAO',
      role: 'network-s5' as NodeRole,
      x: centerX,
      y: metasystemCurrentY,
      opacity: networkS5Opacity,
      scale: networkS1Scale,
    };

    return { localS1s, networkS1s, localS5Node, networkS5Node };
  }, [nodes, rootId, transitionT, viewportSize, panProgress, networkDAOs, networkMembers, currentUserAddress, isConnected, isVerifiedMember]);

  // Trigger hyperdrive on work completed events
  const starfieldRef = useRef<StarfieldHandle>(null);

  useEffect(() => {
    const unsub = subscribe((event) => {
      if (event.type === 'work:completed' || event.type === 'credit:earned') {
        starfieldRef.current?.triggerHyperdrive(120);
      }
    });
    return unsub;
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{ background: COLORS.bg.deep }}
    >
      {/* Starfield background */}
      <Starfield
        ref={starfieldRef}
        width={viewportSize.width}
        height={viewportSize.height}
        starCount={180}
        baseSpeed={0.4}
      />

      {/* Level indicator */}
      <div
        className="absolute top-4 left-4 z-20 px-3 py-1 rounded text-xs font-mono"
        style={{
          background: COLORS.bg.elevated,
          border: `1px solid ${COLORS.border.subtle}`,
          color: COLORS.text.secondary,
        }}
      >
        {isNetworkLevel ? (
          <>
            Network · {networkConnected ? (
              <span style={{ color: '#22c55e' }}>●</span>
            ) : (
              <span style={{ color: '#ef4444' }}>○</span>
            )} {networkDAOs.length} DAOs · {networkMemberCount} members
          </>
        ) : (
          <>Local · {Math.round(zoom * 100)}%</>
        )}
      </div>

      {/* Zoom controls */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-1">
        <button
          onClick={() => setZoom(Math.min(1.2, zoom + 0.1))}
          className="w-8 h-8 flex items-center justify-center rounded text-lg"
          style={{
            background: COLORS.bg.elevated,
            border: `1px solid ${COLORS.border.subtle}`,
            color: COLORS.text.secondary,
          }}
        >
          +
        </button>
        <button
          onClick={() => setZoom(Math.max(0.2, zoom - 0.1))}
          className="w-8 h-8 flex items-center justify-center rounded text-lg"
          style={{
            background: COLORS.bg.elevated,
            border: `1px solid ${COLORS.border.subtle}`,
            color: COLORS.text.secondary,
          }}
        >
          −
        </button>
      </div>

      {/* Local S1s layer - zooms out */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          transformOrigin: `${viewportSize.width / 2}px ${viewportSize.height / 2}px`,
        }}
        animate={{ scale: zoom }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {!loading && nodes.length > 0 && (
          <>
            {localS1s.map((node) => (
              <motion.div
                key={`local-${node.id}`}
                animate={{
                  opacity: node.opacity,
                }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  left: node.x,
                  top: node.y,
                  transform: `translate(-50%, -50%) scale(${node.scale})`,
                  pointerEvents: node.opacity > 0.1 ? 'auto' : 'none',
                }}
              >
                <NodeBox
                  id={node.id}
                  name={node.name}
                  role={node.role}
                  selected={selectedNode === node.id}
                  hasAlgedonic={algedonicNodes.has(node.id)}
                  onClick={() => onNodeSelect(node.id)}
                />
              </motion.div>
            ))}
          </>
        )}
      </motion.div>

      {/* Network S1s layer - fixed size, fades in */}
      <div className="absolute inset-0 pointer-events-none">
        {!loading && nodes.length > 0 && (
          <>
            {networkS1s.map((node) => (
              <motion.div
                key={`network-${node.id}`}
                animate={{
                  opacity: node.opacity,
                }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  left: node.x,
                  top: node.y,
                  transform: `translate(-50%, -50%) scale(${node.scale})`,
                  pointerEvents: node.opacity > 0.1 ? 'auto' : 'none',
                }}
              >
                <NodeBox
                  id={node.id}
                  name={node.name}
                  role={node.role}
                  selected={selectedNode === node.id}
                  hasAlgedonic={algedonicNodes.has(node.id)}
                  onClick={() => onNodeSelect(node.id)}
                />
              </motion.div>
            ))}
          </>
        )}
      </div>

      {/* S5 layer - fixed size at center */}
      <div className="absolute inset-0 pointer-events-none">
        {loading ? (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ color: COLORS.text.muted }}
          >
            Loading...
          </div>
        ) : nodes.length === 0 ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4"
            style={{ color: COLORS.text.muted }}
          >
            <div>No identity found</div>
            <div className="text-xs">Run: npx tsx src/main.ts bootstrap</div>
          </div>
        ) : (
          <>
            {/* Local S5 / User - stays at center, pans down when DAO takes over */}
            {localS5Node && (
              <motion.div
                key={`s5-local-${localS5Node.id}`}
                animate={{
                  opacity: localS5Node.opacity,
                  top: localS5Node.y,
                }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  left: '50%',
                  transform: 'translate(-50%, -50%) scale(1.2)',
                  pointerEvents: localS5Node.opacity > 0.1 ? 'auto' : 'none',
                }}
              >
                <NodeBox
                  id={localS5Node.id}
                  name={localS5Node.name}
                  role={localS5Node.role}
                  selected={selectedNode === localS5Node.id}
                  hasAlgedonic={algedonicNodes.has(localS5Node.id)}
                  onClick={() => onNodeSelect(localS5Node.id)}
                />
              </motion.div>
            )}

            {/* Network S5 (MetasystemDAO) - fades in from orbit */}
            {networkS5Node && (
              <motion.div
                key={`s5-network-${networkS5Node.id}`}
                animate={{
                  opacity: networkS5Node.opacity,
                }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  left: networkS5Node.x,
                  top: networkS5Node.y,
                  transform: `translate(-50%, -50%) scale(${networkS5Node.scale})`,
                  pointerEvents: networkS5Node.opacity > 0.1 ? 'auto' : 'none',
                }}
              >
                <NodeBox
                  id={networkS5Node.id}
                  name={networkS5Node.name}
                  role={networkS5Node.role}
                  selected={selectedNode === networkS5Node.id}
                  hasAlgedonic={algedonicNodes.has(networkS5Node.id)}
                  onClick={() => onNodeSelect(networkS5Node.id)}
                />
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* Add button - local level */}
      {!isNetworkLevel && (
        <button
          className="add-button"
          onClick={handleAdd}
          title="Add agent or project"
        >
          +
        </button>
      )}

      {/* Add button - network level (only for verified members) */}
      {isNetworkLevel && isVerifiedMember && (
        <button
          className="add-button"
          onClick={() => setShowCreateDAOModal(true)}
          title="Create new DAO"
        >
          +
        </button>
      )}

      {/* Hint */}
      <div
        className="absolute bottom-4 left-4 text-xs"
        style={{ color: COLORS.text.muted }}
      >
        {isNetworkLevel
          ? 'Scroll up to zoom back to local level'
          : 'Scroll down to zoom out to network level'}
      </div>

      {/* Create Modal (local) */}
      <AnimatePresence>
        {showCreateModal && rootId && (
          <CreateModal
            hubId={rootId}
            onClose={handleCreateModalClose}
            onCreated={handleCreated}
          />
        )}
      </AnimatePresence>

      {/* Create DAO Modal (network) */}
      <AnimatePresence>
        {showCreateDAOModal && (
          <CreateDAOModal
            onClose={() => setShowCreateDAOModal(false)}
            onCreated={loadNetwork}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
