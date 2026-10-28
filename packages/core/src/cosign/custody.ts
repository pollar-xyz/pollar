import type { CosignCustody } from '../types';
import { isRecord } from '../api/error-fields';

/** One Turnkey activity of a custody switch, as sdk-api hands it to the device. */
export interface CustodySwitchStep {
  path: string;
  type: string;
  parameters: Record<string, unknown>;
}

const strings = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((v) => typeof v === 'string') ? (value as string[]) : null;

/**
 * Whether a step sdk-api asks the device to stamp keeps the wallet the user's.
 *
 * The device cannot know the app's approver keys, so it does not check them;
 * it checks what would hand control to anyone else. Toward self-custody the
 * quorum may only become the user alone and only other users may be deleted.
 * Toward co-signed one approver user may be added, policies may only let the
 * user act alone, and the quorum may only be the user plus one other at
 * threshold 2: whoever that other is still needs the user's vote.
 */
export function checkCustodySwitchStep(
  step: CustodySwitchStep,
  to: CosignCustody,
  endUserId: string,
): { ok: true } | { ok: false; reason: string } {
  const p = step.parameters;
  switch (step.path) {
    case '/public/v1/submit/update_root_quorum': {
      const userIds = strings(p.userIds);
      if (step.type !== 'ACTIVITY_TYPE_UPDATE_ROOT_QUORUM' || !userIds) return { ok: false, reason: 'malformed quorum update' };
      if (!userIds.includes(endUserId)) return { ok: false, reason: 'the quorum update leaves the user out' };
      if (to === 'SELF_CUSTODY') {
        return p.threshold === 1 && userIds.length === 1
          ? { ok: true }
          : { ok: false, reason: 'a self-custody quorum is the user alone at threshold 1' };
      }
      return p.threshold === 2 && userIds.length === 2 && new Set(userIds).size === 2
        ? { ok: true }
        : { ok: false, reason: 'a co-signed quorum is the user and one approver at threshold 2' };
    }
    case '/public/v1/submit/delete_users': {
      const userIds = strings(p.userIds);
      if (to !== 'SELF_CUSTODY' || step.type !== 'ACTIVITY_TYPE_DELETE_USERS' || !userIds) {
        return { ok: false, reason: 'users are only deleted on the way to self-custody' };
      }
      return userIds.includes(endUserId) ? { ok: false, reason: 'the step would delete the user' } : { ok: true };
    }
    case '/public/v1/submit/create_users': {
      const users = Array.isArray(p.users) ? p.users : null;
      if (to !== 'COSIGNED' || step.type !== 'ACTIVITY_TYPE_CREATE_USERS_V4' || !users || users.length !== 1) {
        return { ok: false, reason: 'only one approver user is added, on the way to co-signed' };
      }
      const user = users[0];
      const keysOk =
        isRecord(user) &&
        Array.isArray(user.apiKeys) &&
        user.apiKeys.length > 0 &&
        user.apiKeys.every((k) => isRecord(k) && k.curveType === 'API_KEY_CURVE_P256');
      const noOtherCredentials =
        isRecord(user) &&
        Array.isArray(user.authenticators) &&
        user.authenticators.length === 0 &&
        Array.isArray(user.oauthProviders) &&
        user.oauthProviders.length === 0;
      return keysOk && noOtherCredentials
        ? { ok: true }
        : { ok: false, reason: 'the approver user carries credentials other than API keys' };
    }
    case '/public/v1/submit/create_policies': {
      const policies = Array.isArray(p.policies) ? p.policies : null;
      if (to !== 'COSIGNED' || step.type !== 'ACTIVITY_TYPE_CREATE_POLICIES' || !policies || policies.length === 0) {
        return { ok: false, reason: 'policies are only installed on the way to co-signed' };
      }
      const userAlone = `approvers.any(user, user.id == '${endUserId}')`;
      return policies.every((pol) => isRecord(pol) && pol.effect === 'EFFECT_ALLOW' && pol.consensus === userAlone)
        ? { ok: true }
        : { ok: false, reason: 'a policy would let someone other than the user act alone' };
    }
    default:
      return { ok: false, reason: `unexpected step ${step.path}` };
  }
}
