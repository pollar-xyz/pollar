// @pollar smoke test - the 6-box email code input (issue #8).
//
// Run with `node tests/smoke-email-code-input.cjs` (no build needed: the
// source is transpiled on the fly, as in smoke-kyc-modal.cjs).
//
// OTP autofill on iOS and Android writes the whole code into the focused box
// through an input event, not a paste event. With maxLength={2} and
// slice(-1) only one digit survived and the code was never submitted.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(relativePath) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const scope = { exports: {} };
  scope.require = (id) => {
    if (!id.startsWith('.')) return require(id);
    const base = path.resolve(path.dirname(filename), id);
    return load(path.relative(path.resolve(__dirname, '..'), fs.existsSync(`${base}.tsx`) ? `${base}.tsx` : `${base}.ts`));
  };
  vm.runInNewContext(output, scope);
  return scope.exports;
}

const dir = 'packages/react/src/components/login-modal';
const { applyEmailCodeInput, applyEmailCodePaste } = load(`${dir}/email-code.ts`);
const { EmailCodeInput } = load(`${dir}/EmailCodeInput.tsx`);

// The modules run in their own vm context, so compare plain copies of their results.
const eq = (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);

const empty = ['', '', '', '', '', ''];
const filled = (s) => s.split('');

// Autofill: the whole code arrives in one box.
eq(applyEmailCodeInput(empty, 0, '482913'), { digits: filled('482913'), focus: 5 });
// ...also when the focused box is not the first one, or already held a digit.
eq(applyEmailCodeInput(empty, 3, '482913').digits, filled('482913'));
eq(applyEmailCodeInput(['7', '', '', '', '', ''], 0, '7482913').digits, filled('482913'));
// The old digit can sit on either side of the code: with the caret, only the inserted text counts.
const seven = ['7', '', '', '', '', ''];
eq(applyEmailCodeInput(seven, 0, '4829137').digits, filled('482913'));
eq(applyEmailCodeInput(seven, 0, '4829137', 6).digits, filled('482913'));
eq(applyEmailCodeInput(seven, 0, '7482913', 7).digits, filled('482913'));
eq(applyEmailCodeInput(['3', '', '', '', '', ''], 0, '4829133', 6).digits, filled('482913'));
eq(applyEmailCodeInput(['3', '', '', '', '', ''], 0, '3482913', 7).digits, filled('482913'));
// Autofill can also replace the digit instead of inserting beside it; the whole code is kept.
eq(applyEmailCodeInput(seven, 0, '482913', 6), { digits: filled('482913'), focus: 5 });
eq(applyEmailCodeInput(seven, 0, '482913').digits, filled('482913'));
eq(applyEmailCodeInput(seven, 0, '712345', 6).digits, filled('712345'));
// When the box knows its selection, a code beside the old digit and one replacing it differ.
eq(applyEmailCodeInput(seven, 0, '712345', 6, false).digits, ['1', '2', '3', '4', '5', '']);
eq(applyEmailCodeInput(seven, 0, '712345', 6, true).digits, filled('712345'));
eq(applyEmailCodeInput(seven, 0, '7482913', 7, false).digits, filled('482913'));
eq(applyEmailCodeInput(seven, 0, '482913', 6, true).digits, filled('482913'));
// A replacement the box did not see as a selection is still caught: the old digit is gone.
eq(applyEmailCodeInput(seven, 0, '482913', 6, false).digits, filled('482913'));
// Replaced by a shorter run: every digit is new, filled from the box.
eq(applyEmailCodeInput(seven, 0, '48', 2).digits, ['4', '8', '', '', '', '']);
// ...or with separators some providers include.
eq(applyEmailCodeInput(empty, 0, '482 913').digits, filled('482913'));

// Keystrokes keep their old behaviour.
eq(applyEmailCodeInput(empty, 0, '4'), { digits: ['4', '', '', '', '', ''], focus: 1 });
eq(applyEmailCodeInput(['4', '8', '2', '9', '1', ''], 5, '3'), { digits: filled('482913'), focus: 5 });
eq(applyEmailCodeInput(['4', '', '', '', '', ''], 0, 'a'), { digits: empty, focus: 0 });
eq(applyEmailCodeInput(['4', '', '', '', '', ''], 0, ''), { digits: empty, focus: 0 });
// Typing over a filled box keeps the new digit, caret after or before the old one.
eq(applyEmailCodeInput(['', '', '5', '', '', ''], 2, '58').digits, ['', '', '8', '', '', '']);
eq(applyEmailCodeInput(['', '', '5', '', '', ''], 2, '85').digits, ['', '', '8', '', '', '']);
eq(applyEmailCodeInput(['', '', '5', '', '', ''], 2, '58', 2).digits, ['', '', '8', '', '', '']);
eq(applyEmailCodeInput(['', '', '5', '', '', ''], 2, '85', 1).digits, ['', '', '8', '', '', '']);
// A non-digit typed into a filled box leaves it as it was.
eq(applyEmailCodeInput(['', '', '5', '', '', ''], 2, '5a', 2), { digits: ['', '', '5', '', '', ''], focus: 2 });

// A partial run fills from the box it was entered in.
eq(applyEmailCodeInput(empty, 2, '913'), { digits: ['', '', '9', '1', '3', ''], focus: 5 });
eq(applyEmailCodeInput(empty, 4, '913').digits, ['', '', '', '', '9', '1']);

// Paste.
eq(applyEmailCodePaste('48-29-13'), { digits: filled('482913'), focus: 5 });
eq(applyEmailCodePaste('48'), { digits: ['4', '8', '', '', '', ''], focus: 1 });
eq(applyEmailCodePaste('abc'), { digits: empty, focus: 0 });

// Markup: autofill hint on the first box, and no maxLength to truncate the code.
const html = renderToStaticMarkup(React.createElement(EmailCodeInput, { email: 'a@b.c', onSubmit() {} }));
assert.equal((html.match(/<input/g) || []).length, 6);
assert.equal((html.match(/autoComplete="one-time-code"|autocomplete="one-time-code"/g) || []).length, 1);
assert.doesNotMatch(html, /maxlength/i);

// Mounted: the beforeinput listener really records the selection, so a code
// replacing the old digit and one typed beside it reach different results.
// (The cases above pass `replacedPrevious` by hand; static markup never runs it.)
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://test.invalid/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// Node 20, the CI runtime, has no global navigator; react-dom reads it on load.
globalThis.navigator = dom.window.navigator;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = require('react-dom/client');
const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;

async function mount() {
  const submitted = [];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () =>
    root.render(React.createElement(EmailCodeInput, { email: 'a@b.c', onSubmit: (code) => submitted.push(code) })),
  );
  const boxes = () => Array.from(container.querySelectorAll('input'));
  // What a browser does for one input: beforeinput with the selection as it
  // was, then the new value (caret at its end) and an input event.
  const input = async (index, value, selection) => {
    const el = boxes()[index];
    await React.act(async () => {
      el.focus();
      el.setSelectionRange(selection[0], selection[1]);
      el.dispatchEvent(new dom.window.Event('beforeinput', { bubbles: true, cancelable: true }));
      setValue.call(el, value);
      el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };
  const values = () => boxes().map((el) => el.value);
  const unmount = () => React.act(async () => root.unmount()).then(() => container.remove());
  return { input, values, submitted, unmount };
}

(async () => {
  // Autofill replaces the selected 7 with 712345: the whole code is kept and submitted.
  let view = await mount();
  await view.input(0, '7', [0, 0]);
  assert.deepEqual(view.values(), ['7', '', '', '', '', '']);
  await view.input(0, '712345', [0, 1]);
  assert.deepEqual(view.values(), filled('712345'));
  assert.deepEqual(view.submitted, ['712345']);
  await view.unmount();

  // 12345 typed after the 7 (caret after it, nothing selected): only the new digits count.
  view = await mount();
  await view.input(0, '7', [0, 0]);
  await view.input(0, '712345', [1, 1]);
  assert.deepEqual(view.values(), ['1', '2', '3', '4', '5', '']);
  assert.deepEqual(view.submitted, []);
  await view.unmount();

  console.log('Email code input: autofill, keystrokes, overtype, partial runs, paste and mounted selection passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
