import type { RequirementFormAnswers, RequirementFormField } from '@pollar/core';

export type FormLanguage = 'en' | 'es';

/** Field labels come in English and Spanish; the browser's language picks one. */
export function formLanguage(): FormLanguage {
  const language = typeof navigator !== 'undefined' ? navigator.language : '';
  return language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function localized(text: { en?: string; es?: string } | undefined, language: FormLanguage): string {
  return (language === 'es' ? text?.es || text?.en : text?.en || text?.es) ?? '';
}

/** Values as the inputs hold them: text for every text-like input. */
export type FormValues = Record<string, string | boolean | string[]>;

export function initialValues(fields: RequirementFormField[], answers: RequirementFormAnswers): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    const answer = answers[field.key];
    if (field.type === 'checkbox') values[field.key] = answer === true;
    else if (field.type === 'multiselect') values[field.key] = Array.isArray(answer) ? answer : [];
    else values[field.key] = answer === undefined || answer === null ? '' : String(answer);
  }
  return values;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What the inputs can tell before the server does: a number that is not one and a
 * date outside `YYYY-MM-DD`. Both would otherwise leave as `null` or free text and
 * come back as a server error, or be dropped silently when the field is optional.
 */
export function localFieldErrors(fields: RequirementFormField[], values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (typeof value !== 'string' || !value.trim()) continue;
    if (field.type === 'number' && !Number.isFinite(Number(value))) errors[field.key] = 'invalid_type';
    if (field.type === 'date' && (!DATE.test(value.trim()) || Number.isNaN(Date.parse(`${value.trim()}T00:00:00Z`)))) {
      errors[field.key] = 'invalid_format';
    }
  }
  return errors;
}

/** The answers to send: numbers as numbers, empty inputs left out so the server reports them. */
export function answersOf(fields: RequirementFormField[], values: FormValues): RequirementFormAnswers {
  const answers: RequirementFormAnswers = {};
  for (const field of fields) {
    const value = values[field.key];
    if (field.type === 'checkbox') {
      answers[field.key] = value === true;
    } else if (field.type === 'multiselect') {
      if (Array.isArray(value) && value.length) answers[field.key] = value;
    } else if (typeof value === 'string' && value.trim()) {
      answers[field.key] = field.type === 'number' ? Number(value) : value.trim();
    }
  }
  return answers;
}

const MESSAGES: Record<FormLanguage, Record<string, string>> = {
  en: {
    required: 'This field is required.',
    invalid_type: 'This value is not valid.',
    invalid_option: 'Choose one of the options.',
    too_long: 'This is too long.',
    too_small: 'This value is too small.',
    too_large: 'This value is too large.',
    pattern: 'This does not have the expected format.',
    invalid_format: 'This does not have the expected format.',
  },
  es: {
    required: 'Este campo es obligatorio.',
    invalid_type: 'Este valor no es válido.',
    invalid_option: 'Elige una de las opciones.',
    too_long: 'Es demasiado largo.',
    too_small: 'Este valor es demasiado bajo.',
    too_large: 'Este valor es demasiado alto.',
    pattern: 'No tiene el formato esperado.',
    invalid_format: 'No tiene el formato esperado.',
  },
};

export function fieldErrorMessage(code: string, language: FormLanguage): string {
  return MESSAGES[language][code] ?? MESSAGES[language].invalid_type!;
}

/** The per-field errors of a KYC_FORM_INVALID_ANSWERS error, by key; null when it names none. */
export function fieldErrorsOf(error: unknown): Record<string, string> | null {
  if (!error || typeof error !== 'object') return null;
  const { code, body } = error as { code?: unknown; body?: { errors?: unknown } };
  if (code !== 'KYC_FORM_INVALID_ANSWERS' || !Array.isArray(body?.errors)) return null;
  const errors: Record<string, string> = {};
  for (const item of body.errors as { key?: unknown; code?: unknown }[]) {
    if (typeof item.key === 'string' && typeof item.code === 'string') errors[item.key] = item.code;
  }
  return Object.keys(errors).length ? errors : null;
}

export const COPY: Record<
  FormLanguage,
  Record<'title' | 'loading' | 'submit' | 'submitting' | 'close' | 'loadError' | 'submitError' | 'step', string>
> = {
  en: {
    title: 'A few more details',
    loading: 'Loading the form…',
    submit: 'Continue',
    submitting: 'Saving…',
    close: 'Close',
    loadError: 'Could not load the form. Please try again.',
    submitError: 'Could not save your answers. Please try again.',
    step: 'Step {n} of {total}',
  },
  es: {
    title: 'Unos datos más',
    loading: 'Cargando el formulario…',
    submit: 'Continuar',
    submitting: 'Guardando…',
    close: 'Cerrar',
    loadError: 'No se pudo cargar el formulario. Intenta de nuevo.',
    submitError: 'No se pudieron guardar tus respuestas. Intenta de nuevo.',
    step: 'Paso {n} de {total}',
  },
};
