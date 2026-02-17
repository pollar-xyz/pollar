import React, { useState } from 'react';
import { useAuth } from './context';
import { AuthModal } from './AuthModal';
import type { LoginButtonProps } from './types';

export function LoginButton({ onSuccess, onError, className, children }: LoginButtonProps) {
  const { isAuthenticated, logout, isLoading } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  const handleClick = () => {
    if (isAuthenticated) {
      logout().catch(onError);
    } else {
      setModalOpen(true);
    }
  };

  return (
    <>
      <button onClick={handleClick} disabled={isLoading} className={className}>
        {children ?? (isAuthenticated ? 'Logout' : 'Login')}
      </button>
      <AuthModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setModalOpen(false);
          onSuccess?.();
        }}
      />
    </>
  );
}
