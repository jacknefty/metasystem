/**
 * Onboarding — Bootstrap Identity when no root exists
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { COLORS } from '../design-system';
import { bootstrap } from '../api/client';

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await bootstrap({
        name: name.trim(),
        purpose: purpose.trim(),
      });

      if (result) {
        onComplete();
      } else {
        setError('Failed to create identity');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const canProceed = step === 0 ? name.trim().length > 0 : true;

  return (
    <div
      className="h-full flex items-center justify-center"
      style={{ background: COLORS.bg.deep }}
    >
      <motion.div
        className="w-full max-w-md p-8 rounded-lg"
        style={{
          background: COLORS.bg.elevated,
          border: `1px solid ${COLORS.border.subtle}`,
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-lg flex items-center justify-center"
            style={{
              background: `${COLORS.identity.primary}20`,
              border: `1px solid ${COLORS.identity.border}`,
            }}
          >
            <span style={{ color: COLORS.identity.text, fontSize: '1.5rem' }}>◆</span>
          </div>
          <h1
            className="text-xl font-medium mb-2"
            style={{ color: COLORS.text.primary }}
          >
            Create Your Identity
          </h1>
          <p style={{ color: COLORS.text.muted }}>
            {step === 0 && 'What should we call you?'}
            {step === 1 && 'What is your purpose?'}
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex justify-center gap-2 mb-8">
          {[0, 1].map((s) => (
            <div
              key={s}
              className="w-2 h-2 rounded-full transition-colors"
              style={{
                background: s === step ? COLORS.identity.primary : COLORS.border.subtle,
              }}
            />
          ))}
        </div>

        {/* Step 0: Name */}
        {step === 0 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name or handle"
              autoFocus
              className="w-full px-4 py-3 rounded-lg outline-none"
              style={{
                background: COLORS.bg.panel,
                border: `1px solid ${COLORS.border.subtle}`,
                color: COLORS.text.primary,
              }}
            />
          </motion.div>
        )}

        {/* Step 1: Purpose */}
        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="What are you building towards? What does this system exist to do?"
              autoFocus
              rows={4}
              className="w-full px-4 py-3 rounded-lg outline-none resize-none"
              style={{
                background: COLORS.bg.panel,
                border: `1px solid ${COLORS.border.subtle}`,
                color: COLORS.text.primary,
              }}
            />
          </motion.div>
        )}

        {/* Error */}
        {error && (
          <div
            className="mt-4 p-3 rounded text-sm"
            style={{
              background: `${COLORS.status.critical}20`,
              color: COLORS.status.critical,
            }}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between mt-8">
          <button
            onClick={() => setStep(step - 1)}
            disabled={step === 0}
            className="px-4 py-2 rounded-lg transition-colors"
            style={{
              background: 'transparent',
              color: step === 0 ? COLORS.text.muted : COLORS.text.secondary,
              cursor: step === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Back
          </button>

          {step < 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed}
              className="px-6 py-2 rounded-lg transition-colors"
              style={{
                background: canProceed ? COLORS.identity.primary : COLORS.bg.panel,
                color: canProceed ? COLORS.bg.void : COLORS.text.muted,
                cursor: canProceed ? 'pointer' : 'not-allowed',
              }}
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2 rounded-lg transition-colors"
              style={{
                background: loading ? COLORS.bg.panel : COLORS.identity.primary,
                color: loading ? COLORS.text.muted : COLORS.bg.void,
              }}
            >
              {loading ? 'Creating...' : 'Create Identity'}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
