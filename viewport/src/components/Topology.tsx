/**
 * Topology — Two-level recursive map view
 *
 * Local level: User Identity at center with agent/project Operations packed around it
 * Network level: Zoom out to see local Identity as Operations of MetasystemDAO
 *
 * Continuous zoom transition between levels.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { NodeBox } from './NodeBox';
import { CreateModal } from './CreateModal';
import { CreateDAOModal } from './CreateDAOModal';
import { Starfield, type StarfieldHandle } from './Starfield';
import { Cube } from './Cube';
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
  onClosePanel?: () => void;
}

/**
 * Circle packing for Operations around Identity.
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

export function Topology({ onNodeSelect, selectedNode, onClosePanel }: TopologyProps) {
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

      // Root Identity at center (green)
      nodeList.push({
        id: root.id,
        name: root.name,
        role: 'local-root',
        x: centerX,
        y: centerY,
      });

      // Operations (members) in packed rings
      // Color depends on whether they have members (project=gold) or not (operations=orange)
      const positions = packNodesInRings(
        activeMembers.length,
        centerX,
        centerY,
        LAYOUT.operationsRadius,
        90
      );

      activeMembers.forEach((member: Identity, i: number) => {
        const hasMembers = (member.memberCount || 0) > 0;
        const role = hasMembers ? 'local-hub' : 'local-operations';
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
        const payload = event.payload as { hubId?: string; workId?: string };
        setAlgedonicNodes(prev => {
          const next = new Set(prev);
          next.add(event.subject);
          if (payload.hubId) next.add(payload.hubId);
          return next;
        });
        // Auto-clear after 60s
        setTimeout(() => {
          setAlgedonicNodes(prev => {
            const next = new Set(prev);
            next.delete(event.subject);
            if (payload.hubId) next.delete(payload.hubId);
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
  const { localOperationsNodes, networkOperationsNodes, localIdentityNode, networkIdentityNode } = useMemo(() => {
    if (!rootId) return { localOperationsNodes: [], networkOperationsNodes: [], localIdentityNode: null, networkIdentityNode: null };

    const centerX = viewportSize.width / 2;
    const centerY = viewportSize.height / 2;

    // Local Operations (fade out as we approach network level)
    const localOpacity = Math.max(0, 1 - transitionT * 2);
    const localOperationsNodes = nodes.slice(1).map((node) => ({
      ...node,
      opacity: localOpacity,
      scale: 1,
    }));

    // Network Operations (DAOs + other members orbit around MetasystemDAO Identity)
    const orbitRadius = LAYOUT.operationsRadius;
    const networkOpacity = Math.max(0, (transitionT - 0.3) / 0.7);
    // Scale: starts large (2.0) when first appearing, shrinks to 1.2 at full zoom-out
    const networkScale = 2.0 - transitionT * 0.8;

    // MetasystemDAO starts above center, pans down to center
    const metasystemStartY = centerY - orbitRadius;
    const panOffsetY = panProgress * (centerY - metasystemStartY);
    const metasystemCurrentY = metasystemStartY + panOffsetY;

    // Build unified list of all Operations at network level:
    // - DAOs (projects)
    // - Other members (excluding current user who stays in special position)
    const currentUserAddrLower = currentUserAddress?.toLowerCase();
    const otherMembers = networkMembers.filter(
      m => m.address.toLowerCase() !== currentUserAddrLower
    );

    // Combine DAOs and other members into one orbit
    // DAOs have members → network-project (indigo)
    // Plain members → network-operations (cyan)
    const allNetworkOps: Array<{ id: string; name: string; role: NodeRole }> = [
      ...networkDAOs.map(dao => ({ id: dao.address, name: dao.name, role: 'network-hub' as NodeRole })),
      ...otherMembers.map(m => ({
        id: m.address,
        name: `${m.address.slice(0, 6)}...${m.address.slice(-4)}`,
        role: 'network-operations' as NodeRole
      })),
    ];

    // All Operations orbit around MetasystemDAO's current position
    const networkOpsPositions = packNodesInRings(
      allNetworkOps.length,
      centerX,
      metasystemCurrentY,
      orbitRadius,
      90
    );

    const networkOperationsNodes = allNetworkOps.map((node, i) => ({
      id: node.id,
      name: node.name,
      role: node.role,
      x: networkOpsPositions[i]?.x || centerX + orbitRadius,
      y: networkOpsPositions[i]?.y || metasystemCurrentY,
      opacity: networkOpacity,
      scale: networkScale,
    }));

    // Local Identity (current user) - stays below MetasystemDAO at network level
    // At network level, local root becomes network-operations (cyan) - it's just a member of MetasystemDAO
    // (its local members don't count as network-level sub-DAOs)
    // At local level: stays as local-root (green)
    const localIdentity = nodes[0];
    const showAtNetworkLevel = transitionT > 0.5 && isConnected && isVerifiedMember;
    const userRole = showAtNetworkLevel ? 'network-operations' : 'local-root';

    // At network level, hide local Identity if not a verified member
    const localIdentityOpacity = transitionT > 0.5 && !isVerifiedMember ? 0 : 1;

    const localIdentityNode = localIdentity ? {
      ...localIdentity,
      role: userRole as NodeRole,
      opacity: localIdentityOpacity,
      y: centerY + panOffsetY, // Below MetasystemDAO
    } : null;

    // Network Identity (MetasystemDAO) - violet
    const networkIdentityOpacity = Math.max(0, (transitionT - 0.2) / 0.8);
    const networkIdentityNode = {
      id: 'metasystem-dao',
      name: 'MetasystemDAO',
      role: 'network-identity' as NodeRole,
      x: centerX,
      y: metasystemCurrentY,
      opacity: networkIdentityOpacity,
      scale: networkScale,
    };

    return { localOperationsNodes, networkOperationsNodes, localIdentityNode, networkIdentityNode };
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

      {/* Local Operations layer - zooms out */}
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
            {localOperationsNodes.map((node) => (
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

      {/* Network Operations layer - fixed size, fades in */}
      <div className="absolute inset-0 pointer-events-none">
        {!loading && nodes.length > 0 && (
          <>
            {networkOperationsNodes.map((node) => (
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

      {/* Identity layer - fixed size at center */}
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
            {/* Local Identity / User - stays at center, pans down when DAO takes over */}
            {localIdentityNode && (
              <motion.div
                key={`identity-local-${localIdentityNode.id}`}
                animate={{
                  opacity: localIdentityNode.opacity,
                  top: localIdentityNode.y,
                }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  left: '50%',
                  transform: 'translate(-50%, -50%) scale(1.2)',
                  pointerEvents: localIdentityNode.opacity > 0.1 ? 'auto' : 'none',
                }}
              >
                <NodeBox
                  id={localIdentityNode.id}
                  name={localIdentityNode.name}
                  role={localIdentityNode.role}
                  selected={selectedNode === localIdentityNode.id}
                  hasAlgedonic={algedonicNodes.has(localIdentityNode.id)}
                  onClick={() => onNodeSelect(localIdentityNode.id)}
                />
              </motion.div>
            )}

            {/* Network Identity (MetasystemDAO) - fades in from orbit */}
            {networkIdentityNode && (
              <motion.div
                key={`identity-network-${networkIdentityNode.id}`}
                animate={{
                  opacity: networkIdentityNode.opacity,
                }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  left: networkIdentityNode.x,
                  top: networkIdentityNode.y,
                  transform: `translate(-50%, -50%) scale(${networkIdentityNode.scale})`,
                  pointerEvents: networkIdentityNode.opacity > 0.1 ? 'auto' : 'none',
                }}
              >
                <NodeBox
                  id={networkIdentityNode.id}
                  name={networkIdentityNode.name}
                  role={networkIdentityNode.role}
                  selected={selectedNode === networkIdentityNode.id}
                  hasAlgedonic={algedonicNodes.has(networkIdentityNode.id)}
                  onClick={() => onNodeSelect(networkIdentityNode.id)}
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

      {/* 3D Cube — VSM Black Box */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            key={`cube-${selectedNode}`}
            initial={{ scale: 0.1, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.1, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 150 }}
            className="absolute inset-0 pointer-events-auto"
            style={{ zIndex: 25 }}
          >
            <Cube onClose={onClosePanel} viewportSize={viewportSize} scopeId={selectedNode} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
