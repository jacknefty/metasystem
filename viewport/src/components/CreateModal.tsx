/**
 * CreateModal — Create new nodes
 *
 * Nodes are just nodes. After creation, join to a hub to establish governance.
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { COLORS } from '../design-system';
import { createIdentity, joinNode, fetchDirectories, type DirectoryListing } from '../api/client';

interface CreateModalProps {
  hubId: string;
  onClose: () => void;
  onCreated: () => void;
}

type ProjectSourceType = 'new' | 'existing' | 'github';

export function CreateModal({ hubId, onClose, onCreated }: CreateModalProps) {
  const [step, setStep] = useState<'source' | 'details'>('source');
  const [projectSourceType, setProjectSourceType] = useState<ProjectSourceType>('new');
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Directory browser state
  const [dirListing, setDirListing] = useState<DirectoryListing | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [dirLoading, setDirLoading] = useState(false);

  // GitHub state
  const [githubRepo, setGithubRepo] = useState('');

  const handleChooseSource = (source: ProjectSourceType) => {
    setProjectSourceType(source);
    if (source === 'existing') {
      loadDirectories();
    }
    setStep('details');
  };

  const loadDirectories = async (path?: string) => {
    setDirLoading(true);
    try {
      const listing = await fetchDirectories(path);
      setDirListing(listing);
    } catch (err) {
      console.error('Failed to load directories:', err);
    } finally {
      setDirLoading(false);
    }
  };

  const handleSelectDir = (path: string) => {
    setSelectedPath(path);
    const dirName = path.split('/').pop() || '';
    if (!name) {
      setName(dirName);
    }
  };

  const handleBack = () => {
    setStep('source');
    setSelectedPath(null);
    setGithubRepo('');
    setName('');
    setPurpose('');
    setError(null);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (projectSourceType === 'existing' && !selectedPath) {
      setError('Select a directory');
      return;
    }

    if (projectSourceType === 'github' && !githubRepo.trim()) {
      setError('GitHub repo URL required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build scope from source
      let scope: string[] | undefined;
      if (projectSourceType === 'existing' && selectedPath) {
        scope = [`${selectedPath}/**`];
      }

      // Create the node
      const node = await createIdentity({
        name: name.trim(),
        purpose: purpose.trim(),
        scope,
      });

      if (!node) {
        setError('Failed to create node');
        return;
      }

      // Join the hub (makes hubId the S5 for this node)
      await joinNode(node.id, hubId);

      onCreated();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="absolute inset-0 flex items-center justify-center z-40"
      style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-md p-6 rounded-lg"
        style={{
          background: COLORS.bg.elevated,
          border: `1px solid ${COLORS.border.subtle}`,
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 style={{ color: COLORS.text.primary, fontSize: '1.125rem', fontWeight: 500 }}>
            {step === 'source' ? 'Create Node' : 'Node Details'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/5"
            style={{ color: COLORS.text.muted }}
          >
            ✕
          </button>
        </div>

        {/* Step: Source Selection */}
        {step === 'source' && (
          <div className="space-y-3">
            <p style={{ color: COLORS.text.muted, fontSize: '0.875rem', marginBottom: '1rem' }}>
              What kind of node?
            </p>

            <button
              onClick={() => handleChooseSource('new')}
              className="w-full p-4 rounded-lg text-left transition-all"
              style={{
                background: COLORS.bg.panel,
                border: `1px solid ${COLORS.border.subtle}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = COLORS.member.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = COLORS.border.subtle;
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded flex items-center justify-center"
                  style={{
                    background: `${COLORS.member.primary}20`,
                    border: `1px solid ${COLORS.member.border}`,
                  }}
                >
                  <span style={{ color: COLORS.member.text }}>●</span>
                </div>
                <div>
                  <div style={{ color: COLORS.text.primary, fontWeight: 500 }}>New Node</div>
                  <div style={{ color: COLORS.text.muted, fontSize: '0.75rem' }}>
                    Agent, project, or sub-organization
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleChooseSource('existing')}
              className="w-full p-4 rounded-lg text-left transition-all"
              style={{
                background: COLORS.bg.panel,
                border: `1px solid ${COLORS.border.subtle}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = COLORS.project.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = COLORS.border.subtle;
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded flex items-center justify-center"
                  style={{
                    background: `${COLORS.project.primary}20`,
                    border: `1px solid ${COLORS.project.border}`,
                  }}
                >
                  <span style={{ color: COLORS.project.text }}>■</span>
                </div>
                <div>
                  <div style={{ color: COLORS.text.primary, fontWeight: 500 }}>Existing Codebase</div>
                  <div style={{ color: COLORS.text.muted, fontSize: '0.75rem' }}>
                    Link to a folder on your machine
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleChooseSource('github')}
              className="w-full p-4 rounded-lg text-left transition-all"
              style={{
                background: COLORS.bg.panel,
                border: `1px solid ${COLORS.border.subtle}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = COLORS.project.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = COLORS.border.subtle;
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded flex items-center justify-center"
                  style={{
                    background: `${COLORS.project.primary}20`,
                    border: `1px solid ${COLORS.project.border}`,
                  }}
                >
                  <span style={{ color: COLORS.project.text }}>◎</span>
                </div>
                <div>
                  <div style={{ color: COLORS.text.primary, fontWeight: 500 }}>Clone from GitHub</div>
                  <div style={{ color: COLORS.text.muted, fontSize: '0.75rem' }}>
                    Clone a repository
                  </div>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Step: Details */}
        {step === 'details' && (
          <div className="space-y-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm transition-colors"
              style={{ color: COLORS.text.muted }}
            >
              ← Back
            </button>

            {/* Directory browser for existing codebase */}
            {projectSourceType === 'existing' && (
              <div>
                <label
                  className="block mb-2"
                  style={{ color: COLORS.text.secondary, fontSize: '0.875rem' }}
                >
                  Select Directory
                </label>
                <div
                  className="rounded-lg p-3 max-h-48 overflow-y-auto"
                  style={{
                    background: COLORS.bg.panel,
                    border: `1px solid ${COLORS.border.subtle}`,
                  }}
                >
                  {dirLoading ? (
                    <div style={{ color: COLORS.text.muted }}>Loading...</div>
                  ) : dirListing ? (
                    <>
                      <div
                        className="text-xs font-mono mb-2 pb-2"
                        style={{
                          color: COLORS.text.muted,
                          borderBottom: `1px solid ${COLORS.border.subtle}`,
                        }}
                      >
                        {dirListing.current}
                      </div>
                      {dirListing.parent !== dirListing.current && (
                        <button
                          onClick={() => loadDirectories(dirListing.parent)}
                          className="w-full text-left px-2 py-1 rounded text-sm hover:bg-white/5"
                          style={{ color: COLORS.text.secondary }}
                        >
                          ..
                        </button>
                      )}
                      {dirListing.directories.map((dir) => (
                        <button
                          key={dir.path}
                          onClick={() => handleSelectDir(dir.path)}
                          onDoubleClick={() => loadDirectories(dir.path)}
                          className="w-full text-left px-2 py-1 rounded text-sm hover:bg-white/5"
                          style={{
                            color: selectedPath === dir.path ? COLORS.project.text : COLORS.text.primary,
                            background: selectedPath === dir.path ? `${COLORS.project.primary}20` : 'transparent',
                          }}
                        >
                          {dir.name}/
                        </button>
                      ))}
                      {dirListing.directories.length === 0 && (
                        <div style={{ color: COLORS.text.muted, fontSize: '0.75rem' }}>
                          No subdirectories
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
                {selectedPath && (
                  <div
                    className="mt-2 text-xs font-mono"
                    style={{ color: COLORS.project.text }}
                  >
                    Selected: {selectedPath}
                  </div>
                )}
              </div>
            )}

            {/* GitHub repo input */}
            {projectSourceType === 'github' && (
              <div>
                <label
                  className="block mb-2"
                  style={{ color: COLORS.text.secondary, fontSize: '0.875rem' }}
                >
                  GitHub Repository
                </label>
                <input
                  type="text"
                  value={githubRepo}
                  onChange={(e) => setGithubRepo(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="w-full px-4 py-3 rounded-lg outline-none"
                  style={{
                    background: COLORS.bg.panel,
                    border: `1px solid ${COLORS.border.subtle}`,
                    color: COLORS.text.primary,
                  }}
                />
              </div>
            )}

            <div>
              <label
                className="block mb-2"
                style={{ color: COLORS.text.secondary, fontSize: '0.875rem' }}
              >
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., claude-agent, landing-page"
                autoFocus={projectSourceType !== 'existing'}
                className="w-full px-4 py-3 rounded-lg outline-none"
                style={{
                  background: COLORS.bg.panel,
                  border: `1px solid ${COLORS.border.subtle}`,
                  color: COLORS.text.primary,
                }}
              />
            </div>

            <div>
              <label
                className="block mb-2"
                style={{ color: COLORS.text.secondary, fontSize: '0.875rem' }}
              >
                Purpose
              </label>
              <textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="What does this node do? What is it trying to achieve?"
                rows={3}
                className="w-full px-4 py-3 rounded-lg outline-none resize-none"
                style={{
                  background: COLORS.bg.panel,
                  border: `1px solid ${COLORS.border.subtle}`,
                  color: COLORS.text.primary,
                }}
              />
            </div>

            {error && (
              <div
                className="p-3 rounded text-sm"
                style={{
                  background: `${COLORS.status.critical}20`,
                  color: COLORS.status.critical,
                }}
              >
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-lg transition-colors"
                style={{
                  background: COLORS.bg.panel,
                  border: `1px solid ${COLORS.border.subtle}`,
                  color: COLORS.text.secondary,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={loading || !name.trim()}
                className="flex-1 px-4 py-3 rounded-lg transition-colors"
                style={{
                  background: loading || !name.trim() ? COLORS.bg.panel : COLORS.member.primary,
                  color: loading || !name.trim() ? COLORS.text.muted : COLORS.bg.void,
                  cursor: loading || !name.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
