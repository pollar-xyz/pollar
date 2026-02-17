import React from 'react';
import { useAuth } from './context';
import type { AuthModalProps } from './types';

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const { login } = useAuth();

  if (!open) return null;

  const handleGoogle = () => {
    login({ provider: 'google' });
    onSuccess?.();
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true">
      <button type="button" onClick={handleGoogle}>
        Continue with Google
      </button>
      {/* TODO: GitHub button */}
      {/* TODO: Email/password form */}
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
