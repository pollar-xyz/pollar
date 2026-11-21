'use client';

import type { CSSProperties, ReactNode } from 'react';
import { PollarOverlay } from './PollarOverlay';

/**
 * Where a flow's card sits: on the overlay, as a modal, or `inline` in the
 * host's page (a page made for the flow, like a KYC link's), with no backdrop.
 */
export function ModalFrame({
  inline,
  overlayStyle,
  onClose,
  children,
}: {
  inline: boolean;
  overlayStyle?: CSSProperties;
  onClose?: () => void;
  children: ReactNode;
}) {
  if (inline) return <div className="pollar-inline-frame">{children}</div>;
  return (
    <PollarOverlay {...(overlayStyle && { style: overlayStyle })} onClick={onClose}>
      {children}
    </PollarOverlay>
  );
}
