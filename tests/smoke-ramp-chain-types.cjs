const assert = require('node:assert/strict');
const path = require('node:path');
const ts = require('typescript');

const program = ts.createProgram([path.join(__dirname, 'ramp-chain.types.ts')], {
  noEmit: true,
  strict: true,
  skipLibCheck: true,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2020,
});
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(
  diagnostics.length,
  0,
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => process.cwd(),
    getCanonicalFileName: (file) => file,
    getNewLine: () => '\n',
  }),
);
console.log('Ramp chain types: closed catalog across web, native and all generated ramp API fields passed.');
