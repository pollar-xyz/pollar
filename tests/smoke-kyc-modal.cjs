const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(relativePath) {
  const filename = path.resolve(relativePath);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const scope = { exports: {}, require: (id) => id.startsWith('.')
    ? load(path.resolve(path.dirname(filename), `${id}.tsx`)) : require(id) };
  // Theme is a .ts utility rather than a React component.
  scope.require = (id) => {
    if (!id.startsWith('.')) return require(id);
    const base = path.resolve(path.dirname(filename), id);
    return load(fs.existsSync(`${base}.tsx`) ? `${base}.tsx` : `${base}.ts`);
  };
  vm.runInNewContext(output, scope);
  return scope.exports;
}

const { KycModalTemplate } = load('packages/react/src/components/kyc-modal/KycModalTemplate.tsx');
const props = {
  theme: 'light', accentColor: '#0060b8', providers: [],
  selectedProvider: { id: 'didit-test', name: 'Didit', flow: 'iframe' },
  session: { kycUrl: 'https://verification.example/session' },
  kycStatus: 'pending', isLoading: false,
  onSelectProvider() {}, onDoneVerifying() {}, onRefresh() {}, onClose() {},
};
const render = (changes) => renderToStaticMarkup(React.createElement(KycModalTemplate, { ...props, ...changes }));
const verifying = render({ step: 'verifying' });
assert.match(verifying, /pollar-kyc-modal--verifying/);
assert.match(verifying, /Check status/);
assert.match(verifying, /Open in new tab/);
assert.match(verifying, /allow="camera; microphone"/);
assert.match(render({ step: 'done' }), /still being reviewed/);
assert.doesNotMatch(render({ step: 'done' }), /not approved/);
assert.match(render({ step: 'done', kycStatus: 'approved' }), /verified successfully/);
assert.match(render({ step: 'verifying', error: 'Try again shortly' }), /role="alert"/);
assert.doesNotMatch(render({ step: 'verifying', selectedProvider: { ...props.selectedProvider, flow: 'redirect' } }), /<iframe/);
console.log('KYC modal: embed, redirect, pending, approved and retryable errors passed');
