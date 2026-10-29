import { useEffect, useRef, useState } from 'react';
import { applyEmailCodeInput, applyEmailCodePaste, EMAIL_CODE_LENGTH, type EmailCodeUpdate } from './email-code';

interface EmailCodeInputProps {
  email?: string;
  onSubmit: (code: string) => void;
}

export function EmailCodeInput({ email, onSubmit }: EmailCodeInputProps) {
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: EMAIL_CODE_LENGTH }, () => ''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  // Each box's selection just before its last input, to tell a replaced digit from one typed
  // beside it. Read in a native beforeinput listener: React has no synthetic event that fires
  // before the value changes.
  const selections = useRef<({ start: number; end: number } | null)[]>([]);

  useEffect(() => {
    const listeners = inputRefs.current.map((el, index) => {
      if (!el) return null;
      const remember = () => {
        selections.current[index] = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
      };
      el.addEventListener('beforeinput', remember);
      return () => el.removeEventListener('beforeinput', remember);
    });
    return () => listeners.forEach((remove) => remove?.());
  }, []);

  function handleChange(index: number, el: HTMLInputElement) {
    const previous = digits[index] ?? '';
    const selection = selections.current[index];
    selections.current[index] = null;
    const replaced = previous && selection ? selection.start === 0 && selection.end >= previous.length : undefined;
    apply(applyEmailCodeInput(digits, index, el.value, el.selectionStart, replaced));
  }

  function apply({ digits: next, focus }: EmailCodeUpdate) {
    setDigits(next);
    inputRefs.current[focus]?.focus();
    if (next.every(Boolean)) onSubmit(next.join(''));
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    apply(applyEmailCodePaste(e.clipboardData.getData('text')));
  }

  return (
    <div className="pollar-code-section">
      <p className="pollar-code-label">Enter the 6-digit code sent to {email ? <strong>{email}</strong> : 'your email'}</p>
      <div className="pollar-code-inputs">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            // No maxLength: OTP autofill writes the whole code into one box, and a
            // maxLength would truncate it before onChange sees it.
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${i + 1} of ${EMAIL_CODE_LENGTH}`}
            value={digit}
            className="pollar-code-input"
            onChange={(e) => handleChange(i, e.target)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
          />
        ))}
      </div>
    </div>
  );
}
