'use client';

import type { KycStatus as KycStatusValue } from '@pollar/core';
import type { CSSProperties } from 'react';

interface KycStatusProps {
  status: KycStatusValue;
  className?: string;
}

const STATUS_CONFIG: Record<KycStatusValue, { label: string; color: string; dot: boolean }> = {
  none: { label: 'Not started', color: '#6b7280', dot: false },
  pending: { label: 'Pending review', color: '#f59e0b', dot: true },
  approved: { label: 'Verified', color: '#10b981', dot: false },
  rejected: { label: 'Rejected', color: '#ef4444', dot: false },
};

export function KycStatus({ status, className }: KycStatusProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.none;
  return (
    <span
      className={`pollar-kyc-badge${className ? ` ${className}` : ''}`}
      style={{ '--pollar-kyc-color': config.color } as CSSProperties}
    >
      {config.dot && <span className="pollar-kyc-badge-dot" />}
      {config.label}
    </span>
  );
}
