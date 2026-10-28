'use client';

import type {
  CosignCustody,
  CosignDevicesContent,
  CosignQuorumReport,
  CosignRequest,
  CosignState,
  CosignVerification,
} from '@pollar/core';
import { useCallback, useEffect, useState } from 'react';
import { usePollar } from './context';

export interface UseCosignResult {
  /** Requests waiting for this device's vote, oldest first. */
  pending: CosignRequest[];
  /** The last request that reached a final state. */
  lastResolved?: CosignRequest;
  /** Whether the client's co-sign store has been read at least once. */
  loaded: boolean;
  /** Re-read the pending requests from the API. */
  refresh: () => Promise<void>;
  /** Verify the request against Turnkey and, when it checks out, vote yes. */
  approve: (request: CosignRequest) => Promise<CosignRequest>;
  /** Vote no. Final. */
  reject: (request: CosignRequest) => Promise<CosignRequest>;
  /** The verification a UI can show before the user decides. */
  verify: (request: CosignRequest) => Promise<CosignVerification>;
  /** Read the sub-organization from Turnkey with the device key and record whether it is the quorum its custody promises. */
  inspectQuorum: () => Promise<CosignQuorumReport>;
  /** The user's enrolled devices and the quorum state as sdk-api records it. */
  devices: () => Promise<CosignDevicesContent>;
  /** Revoke another enrolled device; `force` to revoke this one. */
  revokeDevice: (deviceId: string, options?: { force?: boolean }) => Promise<CosignDevicesContent>;
  /** Move the wallet between co-signed and self-custody; only an app in USER_CHOICE custody allows it. */
  switchCustody: (to: CosignCustody) => Promise<CosignQuorumReport>;
}

/**
 * The user's side of a Turnkey co-signed wallet, for an app that renders its
 * own confirmation UI instead of the provider's modal. Subscribes to the
 * client's co-sign store and loads the pending requests once on mount.
 */
export function useCosign(): UseCosignResult {
  const { getClient, isAuthenticated } = usePollar();
  const [state, setState] = useState<CosignState>({ pending: [] });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => getClient().onCosignStateChange(setState), [getClient]);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      await getClient().cosign.pending();
    } finally {
      setLoaded(true);
    }
  }, [getClient, isAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    pending: state.pending,
    ...(state.lastResolved ? { lastResolved: state.lastResolved } : {}),
    loaded,
    refresh,
    approve: useCallback((request: CosignRequest) => getClient().cosign.approve(request), [getClient]),
    reject: useCallback((request: CosignRequest) => getClient().cosign.reject(request), [getClient]),
    verify: useCallback((request: CosignRequest) => getClient().cosign.verify(request), [getClient]),
    inspectQuorum: useCallback(() => getClient().cosign.inspectQuorum(), [getClient]),
    devices: useCallback(() => getClient().cosign.devices(), [getClient]),
    revokeDevice: useCallback(
      (deviceId: string, options?: { force?: boolean }) => getClient().cosign.revokeDevice(deviceId, options),
      [getClient],
    ),
    switchCustody: useCallback((to: CosignCustody) => getClient().cosign.switchCustody(to), [getClient]),
  };
}
