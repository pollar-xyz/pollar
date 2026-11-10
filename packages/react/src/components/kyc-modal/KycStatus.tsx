'use client';

import { useInheritedLanguage } from '../../language-context';
import type { KycStatus as KycStatusValue, PollarLanguage } from '@pollar/core';
import type { CSSProperties } from 'react';
import { KYC_COPY } from './kyc-copy';

interface KycStatusProps {
  status: KycStatusValue;
  /** Replaces the status label, keeping its color. */
  label?: string;
  className?: string;
  /** Language of the status label. Defaults to the user's device. */
  language?: PollarLanguage | undefined;
}

const STATUS_CONFIG: Record<KycStatusValue, { color: string; dot: boolean }> = {
  none: { color: '#6b7280', dot: false },
  pending: { color: '#f59e0b', dot: true },
  approved: { color: '#10b981', dot: false },
  rejected: { color: '#ef4444', dot: false },
  expired: { color: '#6b7280', dot: false },
};

export function KycStatus({ status, label, className, language: languageProp }: KycStatusProps) {
  const language = useInheritedLanguage(languageProp);
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.none;
  const statusText = KYC_COPY[language].status;
  return (
    <span
      className={`pollar-kyc-badge${className ? ` ${className}` : ''}`}
      style={{ '--pollar-kyc-color': config.color } as CSSProperties}
    >
      {config.dot && <span className="pollar-kyc-badge-dot" />}
      {label ?? statusText[status] ?? statusText.none}
    </span>
  );
}
