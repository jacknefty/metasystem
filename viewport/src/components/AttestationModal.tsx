/**
 * AttestationModal — Human attestation for subjective conditions
 *
 * Opens when a condition with `meets:` or `needs:` verifier requires human judgment.
 * Provides Pass/Fail buttons with optional comment field.
 */

import { useState } from 'react';
import { COLORS } from '../design-system';

interface AttestationModalProps {
  workId: string;
  workName: string;
  conditionId: string;
  conditionDescription: string;
  verifier: string;
  onClose: () => void;
  onAttest: (passed: boolean, comment: string) => Promise<void>;
}

export function AttestationModal({
  workName,
  conditionDescription,
  verifier,
  onClose,
  onAttest,
}: AttestationModalProps) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAttest = async (passed: boolean) => {
    setSubmitting(true);
    try {
      await onAttest(passed, comment);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 rounded-lg shadow-xl"
        style={{ background: COLORS.bg.panel }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${COLORS.border.subtle}` }}
        >
          <div>
            <div className="text-sm" style={{ color: COLORS.text.muted }}>
              Human Attestation Required
            </div>
            <div className="font-medium" style={{ color: COLORS.text.primary }}>
              {workName}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10"
            style={{ color: COLORS.text.muted }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Condition */}
          <div>
            <div
              className="text-xs uppercase tracking-wide mb-2"
              style={{ color: COLORS.text.muted }}
            >
              Condition to Verify
            </div>
            <div
              className="p-3 rounded"
              style={{ background: COLORS.bg.elevated, color: COLORS.text.primary }}
            >
              {conditionDescription}
            </div>
          </div>

          {/* Verifier info */}
          <div>
            <div
              className="text-xs uppercase tracking-wide mb-2"
              style={{ color: COLORS.text.muted }}
            >
              Verifier
            </div>
            <div
              className="font-mono text-sm px-2 py-1 rounded inline-block"
              style={{ background: COLORS.bg.elevated, color: COLORS.text.secondary }}
            >
              {verifier}
            </div>
            <div className="text-xs mt-2" style={{ color: COLORS.text.muted }}>
              {verifier.startsWith('meets:')
                ? 'This requires subjective judgment. Review the output and decide if it meets the requirement.'
                : 'This requires external stakeholder approval.'}
            </div>
          </div>

          {/* Comment field */}
          <div>
            <div
              className="text-xs uppercase tracking-wide mb-2"
              style={{ color: COLORS.text.muted }}
            >
              Comment (optional)
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add context for your decision..."
              className="w-full px-3 py-2 rounded text-sm outline-none resize-none"
              style={{
                background: COLORS.bg.elevated,
                border: `1px solid ${COLORS.border.subtle}`,
                color: COLORS.text.primary,
                minHeight: 80,
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div
          className="px-5 py-4 flex gap-3"
          style={{ borderTop: `1px solid ${COLORS.border.subtle}` }}
        >
          <button
            onClick={() => handleAttest(false)}
            disabled={submitting}
            className="flex-1 px-4 py-3 rounded-lg font-medium text-sm transition-colors"
            style={{
              background: COLORS.status.critical,
              color: '#fff',
              opacity: submitting ? 0.5 : 1,
            }}
          >
            {submitting ? '...' : 'Fail'}
          </button>
          <button
            onClick={() => handleAttest(true)}
            disabled={submitting}
            className="flex-1 px-4 py-3 rounded-lg font-medium text-sm transition-colors"
            style={{
              background: COLORS.status.healthy,
              color: '#fff',
              opacity: submitting ? 0.5 : 1,
            }}
          >
            {submitting ? '...' : 'Pass'}
          </button>
        </div>
      </div>
    </div>
  );
}
