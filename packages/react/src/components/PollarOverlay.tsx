'use client';

import { useSyncExternalStore, type CSSProperties, type MouseEventHandler, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PollarOverlayProps {
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLDivElement> | undefined;
  children: ReactNode;
}

const noSubscription = () => () => {};

/**
 * The fixed backdrop every Pollar modal sits on, rendered straight into
 * `document.body`. A host modal from React Aria (HeroUI), Radix or Headless UI
 * makes everything outside itself `inert` or `aria-hidden` while it is open; a
 * Pollar prompt rendered inside the host's root would show on top of it and
 * take no clicks, and a signature started from that host modal would wait on a
 * prompt nobody can answer. A direct child of body is outside the host's
 * subtree, and `data-react-aria-top-layer` tells React Aria to leave it
 * reachable: it skips the node when hiding, and neither its focus trap nor its
 * outside-click dismissal treats an interaction inside as leaving the modal.
 *
 * React events still bubble through the React tree, so a nested Pollar modal
 * behaves as it did when it was rendered inline.
 */
export function PollarOverlay({ style, onClick, children }: PollarOverlayProps) {
  // False while hydrating server markup, true on any client render: the server
  // has no body to portal into, and rendering nothing there keeps hydration
  // from comparing an inline overlay against a portal.
  const canPortal = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  if (!canPortal) return null;
  return createPortal(
    <div className="pollar-overlay" data-react-aria-top-layer="true" style={style} onClick={onClick}>
      {children}
    </div>,
    document.body,
  );
}
