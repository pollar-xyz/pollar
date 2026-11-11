'use client';

import { AppKycFlow } from './AppKycFlow';

interface KycFlowProps {
  /** Called once every step is complete; the flow then renders nothing. */
  onApproved?: () => void;
  country?: string;
  level?: 'basic' | 'intermediate' | 'enhanced';
}

const stay = () => {};

/**
 * The app's own KYC, step by step, in the host's page instead of modals: for a
 * page made for verifying, like a KYC link's. Each pending step shows as a card
 * where it is placed (the vendor's verification, or a form) and the next one
 * replaces it as soon as it is done. Signed-in users only.
 */
export function KycFlow({ onApproved, country, level }: KycFlowProps) {
  return (
    <AppKycFlow
      inline
      onClose={stay}
      {...(onApproved !== undefined && { onApproved })}
      {...(country !== undefined && { country })}
      {...(level !== undefined && { level })}
    />
  );
}
