import type { FormLanguage } from '../requirement-form-modal/form-fields';

type RegistryCopy = Record<
  | 'title'
  | 'intro'
  | 'givenNames'
  | 'surname1'
  | 'surname2'
  | 'birthdate'
  | 'documentNumber'
  | 'complement'
  | 'submit'
  | 'submitting'
  | 'close'
  | 'approved'
  | 'review'
  | 'notApplicable'
  | 'identityRequired'
  | 'nameMismatch'
  | 'rejected'
  | 'loadError'
  | 'submitError'
  | 'step',
  string
>;

export const REGISTRY_COPY: Record<FormLanguage, RegistryCopy> = {
  en: {
    title: 'Confirm your details',
    intro:
      "We check these details with SEGIP, Bolivia's civil registry. They come from your verified document: you can only adjust how your surnames are split and your ID complement.",
    givenNames: 'Names',
    surname1: 'First surname',
    surname2: 'Second surname',
    birthdate: 'Date of birth',
    documentNumber: 'ID number',
    complement: 'Complement (if your ID has one)',
    submit: 'Confirm',
    submitting: 'Checking…',
    close: 'Close',
    approved: 'Your details were confirmed.',
    review: 'Your details are being reviewed. You can continue once they are confirmed.',
    notApplicable:
      'This check is only for Bolivian ID cards (CI). Your verified document is not one, so this route is not available.',
    identityRequired: 'Verify your identity first.',
    nameMismatch: 'Both surnames together must read as on your document: {full}.',
    rejected: 'The registry did not confirm: {fields}. Check how they are written and try again.',
    loadError: 'Could not load your details. Please try again.',
    submitError: 'Could not check your details. Please try again.',
    step: 'Step {n} of {total}',
  },
  es: {
    title: 'Confirma tus datos',
    intro:
      'Validamos estos datos con el SEGIP, el registro civil de Bolivia. Vienen de tu documento verificado: solo puedes ajustar cómo se separan tus apellidos y el complemento de tu CI.',
    givenNames: 'Nombres',
    surname1: 'Primer apellido',
    surname2: 'Segundo apellido',
    birthdate: 'Fecha de nacimiento',
    documentNumber: 'Número de CI',
    complement: 'Complemento (si tu CI lo tiene)',
    submit: 'Confirmar',
    submitting: 'Validando…',
    close: 'Cerrar',
    approved: 'Tus datos fueron confirmados.',
    review: 'Tus datos están en revisión. Podrás continuar cuando se confirmen.',
    notApplicable:
      'Esta validación es solo para cédulas bolivianas (CI). Tu documento verificado no lo es, así que esta ruta no está disponible.',
    identityRequired: 'Primero verifica tu identidad.',
    nameMismatch: 'Los dos apellidos juntos deben leerse como en tu documento: {full}.',
    rejected: 'El registro no confirmó: {fields}. Revisa cómo están escritos e intenta de nuevo.',
    loadError: 'No se pudieron cargar tus datos. Intenta de nuevo.',
    submitError: 'No se pudieron validar tus datos. Intenta de nuevo.',
    step: 'Paso {n} de {total}',
  },
};

type RegistrationCopy = Record<
  | 'title'
  | 'intro'
  | 'consent'
  | 'submit'
  | 'submitting'
  | 'close'
  | 'notReady'
  | 'missing'
  | 'invalid'
  | 'fix'
  | 'loadError'
  | 'submitError'
  | 'step'
  | 'terms',
  string
>;

export const REGISTRATION_COPY: Record<FormLanguage, RegistrationCopy> = {
  en: {
    title: 'Register with the payment provider',
    intro: 'To use this route, the provider registers you as its customer. These details will be sent to it:',
    consent: 'I agree to share these details with the provider.',
    submit: 'Register',
    submitting: 'Registering…',
    close: 'Close',
    notReady: 'Complete the previous steps first.',
    missing: 'Some details are missing: {fields}.',
    invalid: 'Some details need to be corrected: {fields}.',
    fix: 'Review my details',
    loadError: 'Could not load the registration. Please try again.',
    submitError: 'Could not register you. Please try again.',
    step: 'Step {n} of {total}',
    terms: "Read the provider's terms of service",
  },
  es: {
    title: 'Registro con el proveedor de pagos',
    intro: 'Para usar esta ruta, el proveedor te registra como su cliente. Se le enviarán estos datos:',
    consent: 'Acepto compartir estos datos con el proveedor.',
    submit: 'Registrarme',
    submitting: 'Registrando…',
    close: 'Cerrar',
    notReady: 'Primero completa los pasos anteriores.',
    missing: 'Faltan algunos datos: {fields}.',
    invalid: 'Hay datos que corregir: {fields}.',
    fix: 'Revisar mis datos',
    loadError: 'No se pudo cargar el registro. Intenta de nuevo.',
    submitError: 'No se pudo completar el registro. Intenta de nuevo.',
    step: 'Paso {n} de {total}',
    terms: 'Leer los términos de servicio del proveedor',
  },
};

/** The fields a registration shares, by the key the server lists them with. */
export const SHARED_FIELD_LABELS: Record<FormLanguage, Record<string, string>> = {
  en: {
    name: 'Names',
    lastname: 'Surnames',
    document_type: 'Document type',
    document_number: 'Document number',
    country: 'Country',
    state_of_residence: 'Department of residence',
    economic_activity: 'Economic activity',
    source_of_funds: 'Source of funds',
    destination_of_funds: 'Use of funds',
    income_level: 'Income level',
    doc_provider_id: 'SEGIP validation',
    first_name: 'First name',
    last_name: 'Last name',
    email: 'Email',
    birth_date: 'Date of birth',
    document_country: 'Document country',
    phone_country_code: 'Phone country code',
    phone_number: 'Phone number',
    occupation: 'Occupation',
    annual_salary: 'Annual income',
    account_purpose: 'Purpose of the card',
    expected_monthly_volume: 'Expected monthly spend',
    address_line1: 'Street address',
    address_line2: 'Address line 2',
    city: 'City',
    region: 'State or province',
    postal_code: 'Postal code',
    country_code: 'Country of residence',
  },
  es: {
    name: 'Nombres',
    lastname: 'Apellidos',
    document_type: 'Tipo de documento',
    document_number: 'Número de documento',
    country: 'País',
    state_of_residence: 'Departamento de residencia',
    economic_activity: 'Actividad económica',
    source_of_funds: 'Origen de los fondos',
    destination_of_funds: 'Destino de los fondos',
    income_level: 'Nivel de ingresos',
    doc_provider_id: 'Validación SEGIP',
    first_name: 'Nombres',
    last_name: 'Apellidos',
    email: 'Correo electrónico',
    birth_date: 'Fecha de nacimiento',
    document_country: 'País del documento',
    phone_country_code: 'Código de país del teléfono',
    phone_number: 'Teléfono',
    occupation: 'Ocupación',
    annual_salary: 'Ingreso anual',
    account_purpose: 'Uso de la tarjeta',
    expected_monthly_volume: 'Gasto mensual esperado',
    address_line1: 'Dirección',
    address_line2: 'Dirección (línea 2)',
    city: 'Ciudad',
    region: 'Estado o provincia',
    postal_code: 'Código postal',
    country_code: 'País de residencia',
  },
};

export const errorCode = (error: unknown) =>
  error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : null;

/** `body.missing` of a KYC_REGISTRATION_MISSING_DATA error. */
export function missingFieldsOf(error: unknown): string[] {
  const body = error && typeof error === 'object' ? (error as { body?: { missing?: unknown } }).body : undefined;
  return Array.isArray(body?.missing) ? body.missing.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * `body.invalid` and `body.forms` of a KYC_REGISTRATION_MISSING_DATA error: the
 * listed keys that have an answer the provider cannot use, and the forms that hold
 * the listed keys, to reopen.
 */
export function registrationFixOf(error: unknown): { invalid: string[]; forms: { formId: string; keys: string[] }[] } {
  const body =
    error && typeof error === 'object' ? (error as { body?: { invalid?: unknown; forms?: unknown } }).body : undefined;
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  const forms = Array.isArray(body?.forms)
    ? body.forms.flatMap((item): { formId: string; keys: string[] }[] => {
        const form = item && typeof item === 'object' ? (item as { formId?: unknown; keys?: unknown }) : {};
        return typeof form.formId === 'string' ? [{ formId: form.formId, keys: strings(form.keys) }] : [];
      })
    : [];
  return { invalid: strings(body?.invalid), forms };
}
