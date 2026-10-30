import { useRef, useState } from 'react';
import { applyEmailCodeInput, applyEmailCodePaste, EMAIL_CODE_LENGTH, type EmailCodeUpdate } from './email-code';

interface EmailCodeInputProps {
  email?: string;
  onSubmit: (code: string) => void;
}

export function EmailCodeInput({ email, onSubmit }: EmailCodeInputProps) {
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: EMAIL_CODE_LENGTH }, () => ''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

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
            onChange={(e) => apply(applyEmailCodeInput(digits, i, e.target.value, e.target.selectionStart))}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
          />
        ))}
      </div>
    </div>
  );
}
