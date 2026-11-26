'use client';

import { useEffect, useRef, useState } from 'react';
import type { RampScannable } from '@pollar/core';

/** The side of the PNG an SVG code is drawn at: sharp enough for any banking app to read. */
const SVG_SIDE = 1024;

function imageSrc(image: RampScannable['image']): string {
  return image.encoding === 'base64'
    ? `data:${image.mediaType};base64,${image.data}`
    : `data:${image.mediaType};charset=utf-8,${encodeURIComponent(image.data)}`;
}

function base64Blob(data: string, type: string): Blob {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type });
}

/**
 * The code as a PNG or JPEG: a phone gallery and the banking apps that read a QR
 * from it take neither SVG nor WebP, so those are drawn on a white canvas first.
 */
async function scannableFile(image: RampScannable['image']): Promise<Blob> {
  if (image.encoding === 'base64' && (image.mediaType === 'image/png' || image.mediaType === 'image/jpeg'))
    return base64Blob(image.data, image.mediaType);
  const element = new Image();
  element.decoding = 'async';
  element.src = imageSrc(image);
  await element.decode();
  const svg = image.mediaType === 'image/svg+xml';
  const width = svg ? SVG_SIDE : element.naturalWidth;
  const height = svg
    ? Math.round((SVG_SIDE * (element.naturalHeight || 1)) / (element.naturalWidth || 1))
    : element.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas unavailable');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(element, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png encoding failed'))), 'image/png'),
  );
}

/**
 * On a phone the share sheet is the way to the gallery ("Save image"): a download
 * lands in Files on iOS, where a banking app does not look. A desktop downloads it.
 */
async function saveFile(blob: Blob, name: string): Promise<'saved' | 'dismissed'> {
  const file = new File([blob], name, { type: blob.type });
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'saved';
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') return 'dismissed';
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}

export function SaveQrButton({
  image,
  fileName,
  labels,
}: {
  image: RampScannable['image'];
  /** Without the extension: it follows the format saved. */
  fileName: string;
  labels: { save: string; saving: string; saved: string; failed: string };
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function save() {
    setState('saving');
    try {
      const blob = await scannableFile(image);
      const extension = blob.type === 'image/jpeg' ? 'jpg' : 'png';
      const outcome = await saveFile(blob, `${fileName}.${extension}`);
      setState(outcome === 'saved' ? 'saved' : 'idle');
    } catch {
      setState('failed');
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2500);
  }

  return (
    <button type="button" className="pollar-btn-secondary pollar-ramp-save-qr" disabled={state === 'saving'} onClick={save}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M8 2v8m0 0 3-3m-3 3L5 7M3 12.5h10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {state === 'saving' ? labels.saving : state === 'saved' ? labels.saved : state === 'failed' ? labels.failed : labels.save}
    </button>
  );
}
