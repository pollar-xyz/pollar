'use client';

import { useState } from 'react';
import { usePollar } from './context';
import './LoginModal.css';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export function LoginModal({ open, onClose }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const { getClient } = usePollar();
  const [emailView, setEmailView] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  function handleClose() {
    setEmailView(false);
    setEmail('');
    onClose();
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      await getClient().login({ provider: 'google' });
      handleClose();
    } finally {
      setLoading(false);
    }
  }

  async function handleEmail() {
    if (!email) return;
    setLoading(true);
    try {
      await getClient().login({ provider: 'email', email });
      handleClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pollar-overlay" onClick={handleClose}>
      <div className="pollar-modal" onClick={(e) => e.stopPropagation()}>
        <button onClick={handleClose} className="pollar-close" aria-label="Close">
          ✕
        </button>

        <h2 className="pollar-title">Sign in</h2>

        {!emailView ? (
          <div className="pollar-actions">
            <button onClick={handleGoogle} disabled={loading} className="pollar-btn">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M47.5 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.3-10.6 7.3-17.4z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.1 1.4-4.9 2.3-8 2.3-6.1 0-11.3-4.1-13.2-9.7H2.6v6.2C6.6 42.9 14.7 48 24 48z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.8 28.8c-.5-1.4-.8-2.8-.8-4.3s.3-3 .8-4.3v-6.2H2.6C.9 17.3 0 20.5 0 24s.9 6.7 2.6 9.8l8.2-5z"
                />
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.6-6.6C35.9 2.5 30.4 0 24 0 14.7 0 6.6 5.1 2.6 12.7l8.2 5C12.7 13.6 17.9 9.5 24 9.5z"
                />
              </svg>
              Continue with Google
            </button>

            <button
              onClick={() => setEmailView(true)}
              disabled={loading}
              className="pollar-btn"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              Continue with Email
            </button>
          </div>
        ) : (
          <div className="pollar-actions">
            <button onClick={() => setEmailView(false)} className="pollar-back">
              ← Back
            </button>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleEmail()}
              className="pollar-input"
              autoFocus
            />
            <button
              onClick={handleEmail}
              disabled={loading || !email}
              className="pollar-btn-primary"
            >
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}