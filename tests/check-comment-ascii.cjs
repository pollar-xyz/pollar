#!/usr/bin/env node
'use strict';

// Guards the repo convention that code comments use only keyboard-typeable
// (ASCII) characters: no em dashes, box-drawing header lines, arrows, section
// signs or similar glyphs. Scans .ts/.tsx/.css comments under packages/*/src
// (the generated schema.d.ts is exempt) plus every package.json "description".
// String literals are out of scope on purpose: UI copy is a product decision.
//
// Exits 1 listing every violation, so it can run as part of `npm run test:smoke`.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'packages');

/** Comment spans of one line, tracking block-comment state across lines. */
function commentSpans(line, inBlock, isCss) {
  const spans = [];
  let i = 0;
  const n = line.length;
  if (inBlock) {
    const end = line.indexOf('*/');
    if (end === -1) return { spans: [[0, n]], inBlock: true };
    spans.push([0, end]);
    i = end + 2;
    inBlock = false;
  }
  let quote = null;
  while (i < n) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === quote) quote = null;
      i += 1; continue;
    }
    if (!isCss && (ch === '"' || ch === "'" || ch === '`')) { quote = ch; i += 1; continue; }
    if (ch === '/' && i + 1 < n) {
      const nxt = line[i + 1];
      if (nxt === '/' && !isCss) { spans.push([i, n]); return { spans, inBlock: false }; }
      if (nxt === '*') {
        const end = line.indexOf('*/', i + 2);
        if (end === -1) { spans.push([i, n]); return { spans, inBlock: true }; }
        spans.push([i, end]);
        i = end + 2; continue;
      }
    }
    i += 1;
  }
  return { spans, inBlock };
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.turbo'].includes(entry.name)) continue;
      yield* walk(path.join(dir, entry.name));
    } else {
      yield path.join(dir, entry.name);
    }
  }
}

const violations = [];

for (const file of walk(ROOT)) {
  const base = path.basename(file);
  const rel = path.relative(ROOT, file);

  if (base === 'package.json') {
    const desc = JSON.parse(fs.readFileSync(file, 'utf8')).description ?? '';
    for (const ch of desc) {
      if (ch.codePointAt(0) > 126) violations.push(`${rel} (description): "${ch}" U+${ch.codePointAt(0).toString(16).toUpperCase()}`);
    }
    continue;
  }

  if (!/\.(ts|tsx|css)$/.test(base) || base === 'schema.d.ts') continue;

  const isCss = base.endsWith('.css');
  let inBlock = false;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const line = lines[lineNo];
    const res = commentSpans(line, inBlock, isCss);
    inBlock = res.inBlock;
    for (let i = 0; i < line.length; i++) {
      const code = line.codePointAt(i);
      if (code <= 126) continue;
      if (res.spans.some(([s, e]) => i >= s && i < e)) {
        violations.push(`${rel}:${lineNo + 1}: "${line[i]}" U+${code.toString(16).toUpperCase()} in a comment`);
      }
      if (code > 0xffff) i++; // surrogate pair
    }
  }
}

if (violations.length > 0) {
  console.error(`check-comment-ascii: ${violations.length} non-ASCII character(s) in comments:`);
  for (const v of violations.slice(0, 50)) console.error('  ' + v);
  if (violations.length > 50) console.error(`  ... and ${violations.length - 50} more`);
  process.exit(1);
}
console.log('check-comment-ascii: OK (comments and package descriptions are ASCII-only)');
