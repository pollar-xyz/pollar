'use client';

import { LoginModal } from './LoginModal';

const stay = () => {};

/**
 * The app's sign-in in the host's page instead of a modal: for a page whose
 * first job is signing the user in, like a KYC link's. It takes the width of
 * its container, so the host sets that. Once the user is signed in it stays
 * as is; the host reads `isAuthenticated` and swaps it for its next screen.
 */
export function LoginFlow() {
  return <LoginModal inline onClose={stay} />;
}
