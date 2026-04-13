/**
 * QRCode component — vendored from react-qr-code (MIT License)
 * Original: https://github.com/rosskhanas/react-qr-code
 * Adapted: removed prop-types dependency, added TypeScript types.
 *
 * MIT License
 * Copyright (c) 2018 Ross Khanas
 */

// @ts-expect-error — qr.js ships CJS without type declarations; bundled via noExternal
import ErrorCorrectLevel from 'qr.js/lib/ErrorCorrectLevel';
// @ts-expect-error — same as above
import QRCodeImpl from 'qr.js/lib/QRCode';
import { forwardRef, type SVGProps } from 'react';

// ─── Internal SVG renderer ────────────────────────────────────────────────────

interface QRCodeSvgProps extends SVGProps<SVGSVGElement> {
  bgColor: string;
  bgD: string;
  fgColor: string;
  fgD: string;
  size: number;
  title?: string;
  viewBoxSize: number;
  xmlns?: string | undefined;
}

const QRCodeSvg = forwardRef<SVGSVGElement, QRCodeSvgProps>(function QRCodeSvg(
  {
    bgColor,
    bgD,
    fgD,
    fgColor,
    size,
    title,
    viewBoxSize,
    xmlns = 'http://www.w3.org/2000/svg',
    ...props
  },
  ref,
) {
  return (
    <svg {...props} height={size} ref={ref} viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`} width={size} xmlns={xmlns}>
      {title ? <title>{title}</title> : null}
      <path d={bgD} fill={bgColor} />
      <path d={fgD} fill={fgColor} />
    </svg>
  );
});

QRCodeSvg.displayName = 'QRCodeSvg';

// ─── Public component ─────────────────────────────────────────────────────────

export interface QRCodeProps extends SVGProps<SVGSVGElement> {
  value: string;
  size?: number;
  bgColor?: string;
  fgColor?: string;
  level?: 'L' | 'M' | 'Q' | 'H';
  title?: string;
}

function bytesToBinaryString(bytes: number[]): string {
  return bytes.map((b) => String.fromCharCode(b & 0xff)).join('');
}

function encodeStringToUtf8Bytes(input: string): number[] {
  return Array.from(new TextEncoder().encode(input));
}

export const QRCode = forwardRef<SVGSVGElement, QRCodeProps>(function QRCode(
  { bgColor = '#FFFFFF', fgColor = '#000000', level = 'L', size = 256, value, ...props },
  ref,
) {
  const qrcode = new QRCodeImpl(-1, ErrorCorrectLevel[level]);
  const utf8Bytes = encodeStringToUtf8Bytes(value);
  const binaryString = bytesToBinaryString(utf8Bytes);
  qrcode.addData(binaryString, 'Byte');
  qrcode.make();

  const cells: boolean[][] = qrcode.modules;

  return (
    <QRCodeSvg
      {...props}
      bgColor={bgColor}
      bgD={cells
        .map((row, rowIndex) => row.map((cell, cellIndex) => (!cell ? `M ${cellIndex} ${rowIndex} l 1 0 0 1 -1 0 Z` : '')).join(' '))
        .join(' ')}
      fgColor={fgColor}
      fgD={cells
        .map((row, rowIndex) => row.map((cell, cellIndex) => (cell ? `M ${cellIndex} ${rowIndex} l 1 0 0 1 -1 0 Z` : '')).join(' '))
        .join(' ')}
      ref={ref}
      size={size}
      viewBoxSize={cells.length}
    />
  );
});
