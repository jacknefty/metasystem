/**
 * Metasystem DAO — Main App
 */

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Topology } from './components/Topology';
import { FocusPanel } from './components/FocusPanel';
import { Onboarding } from './components/Onboarding';
import { CubeMockups } from './components/CubeMockups';
import { WalletConnect } from './components/WalletConnect';
import { checkHasRoot } from './api/client';

export function App() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hasRoot, setHasRoot] = useState<boolean | null>(null);

  // Check for ?mockups query param
  const showMockups = new URLSearchParams(window.location.search).has('mockups');

  useEffect(() => {
    if (!showMockups) {
      checkHasRoot().then(setHasRoot);
    }
  }, [showMockups]);

  // Show cube mockups page
  if (showMockups) {
    return <CubeMockups />;
  }

  const handleNodeSelect = (nodeId: string | null) => {
    setSelectedNode(nodeId);
  };

  const handleClosePanel = () => {
    setSelectedNode(null);
  };

  const handleOnboardingComplete = () => {
    setHasRoot(true);
  };

  // Loading state
  if (hasRoot === null) {
    return (
      <div className="bezel">
        <div className="viewport flex items-center justify-center">
          <div style={{ color: '#6b7280' }}>Loading...</div>
        </div>
      </div>
    );
  }

  // No root — show onboarding
  if (!hasRoot) {
    return (
      <div className="bezel">
        <div className="viewport">
          <Onboarding onComplete={handleOnboardingComplete} />
        </div>
      </div>
    );
  }

  // Has root — show topology
  return (
    <div className="bezel">
      <div className="viewport">
        {/* Wallet connect in top-right */}
        <div
          className="absolute top-4 right-16 z-30"
          style={{ marginRight: '60px' }}
        >
          <WalletConnect />
        </div>

        <Topology onNodeSelect={handleNodeSelect} selectedNode={selectedNode} />

        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              style={{ position: 'absolute', inset: 0, zIndex: 30 }}
            >
              <FocusPanel nodeId={selectedNode} onClose={handleClosePanel} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
