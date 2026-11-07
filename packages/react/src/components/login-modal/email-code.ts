export const EMAIL_CODE_LENGTH = 6;

export interface EmailCodeUpdate {
  digits: string[];
  /** Index of the box that should receive focus next. */
  focus: number;
}

/**
 * Apply what the browser wrote into box `index` to the 6 code boxes.
 *
 * A keystroke leaves one digit in the box, or two when the box already held
 * one (the old digit plus the new one). OTP autofill on iOS and Android, and
 * some keyboards' paste, instead write the whole code into the focused box
 * through an input event, not a paste event. That value is spread across the
 * boxes: a full code always from the first box, a shorter run from `index`.
 *
 * When the box already held a digit, the new text may land before or after
 * it. `caret` (the input's selectionStart after the change) says where the
 * insertion ended, so only the inserted text is used; without it the old
 * digit is dropped from whichever end it is found at.
 *
 * Autofill can also replace a selected digit. `replacedPrevious` says whether
 * the old digit was selected when the input arrived: then every digit in the
 * value is new. Without it, a box that now holds a full code is taken as a
 * replacement, since `7` + `12345` and a replacing `712345` look the same.
 */
export function applyEmailCodeInput(
  digits: string[],
  index: number,
  value: string,
  caret?: number | null,
  replacedPrevious?: boolean,
): EmailCodeUpdate {
  const last = EMAIL_CODE_LENGTH - 1;
  const previous = digits[index] ?? '';
  const raw = insertedDigits(value, previous, caret, replacedPrevious);
  const next = digits.slice();

  // Only non-digits were added: leave the box as it was.
  if (raw === '' && value.length > previous.length) return { digits: next, focus: index };

  if (raw.length <= 1) {
    next[index] = raw;
    return { digits: next, focus: raw && index < last ? index + 1 : index };
  }

  const start = raw.length >= EMAIL_CODE_LENGTH ? 0 : index;
  const chars = raw.length >= EMAIL_CODE_LENGTH ? raw.slice(-EMAIL_CODE_LENGTH) : raw.slice(0, EMAIL_CODE_LENGTH - index);
  for (let i = 0; i < chars.length; i++) next[start + i] = chars[i] as string;
  return { digits: next, focus: Math.min(start + chars.length, last) };
}

/** The digits the browser added to a box that held `previous`. */
function insertedDigits(value: string, previous: string, caret?: number | null, replaced?: boolean): string {
  const digits = value.replace(/\D/g, '');
  if (previous === '' || value.length <= previous.length) return digits;

  if (replaced === true) return digits;
  // Unknown selection: a full code in the box most likely replaced the old digit.
  if (replaced === undefined && digits.length === EMAIL_CODE_LENGTH) return digits;

  if (typeof caret === 'number') {
    const added = value.length - previous.length;
    const start = Math.max(caret - added, 0);
    // What is left around the insertion must be the old digit; otherwise the
    // old digit was replaced and every digit in the value is new.
    if (value.slice(0, start) + value.slice(caret) !== previous) return digits;
    return value.slice(start, caret).replace(/\D/g, '');
  }

  // No caret: the old digit sits at one end of the value. When both ends
  // match, the text was most likely appended, so the first digit goes.
  if (digits.startsWith(previous)) return digits.slice(previous.length);
  if (digits.endsWith(previous)) return digits.slice(0, -previous.length);
  return digits;
}

/** Spread pasted text across the boxes from the first one. */
export function applyEmailCodePaste(text: string): EmailCodeUpdate {
  const code = text.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH);
  const digits = Array.from({ length: EMAIL_CODE_LENGTH }, (_, i) => code[i] ?? '');
  return { digits, focus: Math.min(Math.max(code.length - 1, 0), EMAIL_CODE_LENGTH - 1) };
}
