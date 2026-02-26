import { useRef, useState } from 'react';

interface EmailCodeInputProps {
  email?: string;
  onSubmit: (code: string) => void;
}

export function EmailCodeInput({ email, onSubmit }: EmailCodeInputProps) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function submit(next: string[]) {
    if (next.every(Boolean)) onSubmit(next.join(''));
  }

  function handleChange(index: number, value: string) {
    const cleaned = value.replace(/\D/g, '').slice(-1);
    const next = digits.map((d, i) => (i === index ? cleaned : d));
    setDigits(next);
    if (cleaned && index < 5) inputRefs.current[index + 1]?.focus();
    submit(next);
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = Array.from({ length: 6 }, (_, i) => text[i] ?? '');
    setDigits(next);
    inputRefs.current[Math.min(text.length - 1, 5)]?.focus();
    submit(next);
  }

  return (
    <div className="pollar-code-section">
      <p className="pollar-code-label">
        Enter the 6-digit code sent to{' '}
        {email ? <strong>{email}</strong> : 'your email'}
      </p>
      <div className="pollar-code-inputs">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={digit}
            className="pollar-code-input"
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
          />
        ))}
      </div>
    </div>
  );
}
