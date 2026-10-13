import type {
  AppRequirements,
  ProviderRegistration,
  ProviderRegistrationSubmitted,
  RegistryCheck,
  RegistryCheckEdit,
  RegistryCheckSubmitted,
  RequirementForm,
  RequirementFormAnswers,
  RequirementFormSubmitted,
} from '../../types';
import { PollarApiError } from '../../types';
import type { PollarApiClient } from '../client';

function requirementApiError(error: unknown, fallback: string): PollarApiError {
  const body = (typeof error === 'object' && error !== null ? error : {}) as Record<string, unknown>;
  const code = typeof body.code === 'string' ? body.code : typeof body.error === 'string' ? body.error : fallback;
  return new PollarApiError(code, body);
}

/**
 * GET /requirements/forms/{formId}
 * The form a FORM requirement step asks for (the `optionId` of a pending step in
 * the quote's `requirementsRequired`): its fields, the user's previous answers to
 * prefill, and `missing`, the required keys still open.
 */
export async function getRequirementForm(api: PollarApiClient, formId: string): Promise<RequirementForm> {
  const { data, error } = await api.GET('/requirements/forms/{formId}', { params: { path: { formId } } });
  if (!data?.content || error) throw requirementApiError(error, 'Failed to load the form');
  return data.content;
}

/**
 * POST /requirements/forms/{formId}
 * Submit the full set of answers. Invalid answers throw a {@link PollarApiError}
 * with code `KYC_FORM_INVALID_ANSWERS` and `body.errors` listing `{ key, code }`
 * per field. Quote again afterwards.
 */
export async function submitRequirementForm(
  api: PollarApiClient,
  formId: string,
  answers: RequirementFormAnswers,
): Promise<RequirementFormSubmitted> {
  const { data, error } = await api.POST('/requirements/forms/{formId}', {
    params: { path: { formId } },
    body: { answers },
  });
  if (!data?.content || error) throw requirementApiError(error, 'Failed to submit the form');
  return data.content;
}

/**
 * GET /requirements
 * The app's own KYC steps (every one required, in order, each with equivalent
 * options) and where the user stands: each step's completion and `next`, the first
 * pending step, or null when every step is complete. Nothing is blocked on it.
 */
export async function getAppRequirements(api: PollarApiClient): Promise<AppRequirements> {
  const { data, error } = await api.GET('/requirements');
  if (!data?.content || error) throw requirementApiError(error, 'Failed to load the verification steps');
  return data.content;
}

/**
 * GET /requirements/registry/{optionId}
 * The confirmation screen of a REGISTRY_CHECK step: the identity data that will be
 * checked and the user's status. `prefill.applies` is false when the user's document
 * is not one this registry checks.
 */
export async function getRegistryCheck(api: PollarApiClient, optionId: string): Promise<RegistryCheck> {
  const { data, error } = await api.GET('/requirements/registry/{optionId}', { params: { path: { optionId } } });
  if (!data?.content || error) throw requirementApiError(error, 'Failed to load the registry check');
  return data.content;
}

/**
 * POST /requirements/registry/{optionId}
 * Confirm the data with the surnames split and the CI complement. Resolves to
 * `approved`, or `pending` with `reviewReason` when the registry did not confirm
 * every field. A split that does not rebuild the verified last name throws
 * `KYC_REGISTRY_NAME_MISMATCH`.
 */
/**
 * A registry check and a provider registration each wait on a vendor call (SEGIP,
 * customers/create) that can take well over the 10s default; only these two calls
 * get the longer budget, like startKyc.
 */
const VENDOR_CALL_TIMEOUT_MS = 30_000;
const vendorCallHeaders = { 'x-pollar-timeout-ms': String(VENDOR_CALL_TIMEOUT_MS) };

export async function submitRegistryCheck(
  api: PollarApiClient,
  optionId: string,
  edit: RegistryCheckEdit,
): Promise<RegistryCheckSubmitted> {
  const { data, error } = await api.POST('/requirements/registry/{optionId}', {
    params: { path: { optionId } },
    body: edit,
    headers: vendorCallHeaders,
  });
  if (!data?.content || error) throw requirementApiError(error, 'Failed to submit the registry check');
  return data.content;
}

/**
 * GET /requirements/registration/{corridorId}
 * The PROVIDER_REGISTRATION step of a route: status, `ready` (every earlier step is
 * complete) and the fields the registration shares, to show before consent.
 */
export async function getProviderRegistration(api: PollarApiClient, corridorId: string): Promise<ProviderRegistration> {
  const { data, error } = await api.GET('/requirements/registration/{corridorId}', { params: { path: { corridorId } } });
  if (!data?.content || error) throw requirementApiError(error, 'Failed to load the registration');
  return data.content;
}

/**
 * POST /requirements/registration/{corridorId}
 * The user's consent: registers them with the ramp provider. A field the identity or
 * the forms lack throws `KYC_REGISTRATION_MISSING_DATA` with `body.missing`.
 */
export async function submitProviderRegistration(
  api: PollarApiClient,
  corridorId: string,
): Promise<ProviderRegistrationSubmitted> {
  const { data, error } = await api.POST('/requirements/registration/{corridorId}', {
    params: { path: { corridorId } },
    headers: vendorCallHeaders,
  });
  if (!data?.content || error) throw requirementApiError(error, 'Failed to register with the provider');
  return data.content;
}
