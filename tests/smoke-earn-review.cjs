// The Earn approval and result, web and React Native: a deposit or withdrawal
// reads as a sentence with its asset, network and opportunity, never as the
// raw operation id, and the fee line says who pays only when the request does.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://test.invalid/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const core = require('../packages/core/dist/index.js');

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  OK    ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message}`);
    failed++;
  }
}

const passthrough = ({ children }) => React.createElement(React.Fragment, null, children);
const reactNative = {
  View: passthrough,
  ScrollView: passthrough,
  Text: passthrough,
  TouchableOpacity: (props) => React.createElement('button', { disabled: props.disabled }, props.children),
  Pressable: (props) => React.createElement('button', { disabled: props.disabled }, props.children),
  Image: () => null,
  ActivityIndicator: () => null,
  Modal: passthrough,
  Linking: { openURL: () => Promise.resolve() },
  Platform: { OS: 'ios', select: (options) => options.ios ?? options.default },
  StyleSheet: { create: (s) => s, absoluteFillObject: {}, hairlineWidth: 1 },
};
const reactNativeSvg = { __esModule: true, default: passthrough, Circle: () => null, Path: () => null, Rect: () => null };

function loader(mocks) {
  const cache = new Map();
  return function load(file) {
    if (cache.has(file)) return cache.get(file);
    const filename = path.resolve(__dirname, '..', file);
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const scope = { exports: {}, setTimeout, clearTimeout, globalThis, document };
    cache.set(file, scope.exports);
    scope.require = (id) => {
      if (id in mocks) return mocks[id];
      if (id.endsWith('.css')) return {};
      if (id === '@pollar/core') return core;
      if (id.startsWith('.')) {
        const base = path.join(path.dirname(file), id);
        return load(fs.existsSync(path.resolve(__dirname, '..', `${base}.tsx`)) ? `${base}.tsx` : `${base}.ts`);
      }
      return require(id);
    };
    vm.runInNewContext(output, scope);
    return scope.exports;
  };
}

const WALLET = 'Wa11etAddressSo1ana1111111111111111111111111';
const SPONSOR = 'SponsorAddressSo1ana111111111111111111111111';
// What sdk-api puts in a Solana Earn co-sign request's details.
const cosignDetails = (overrides = {}) => ({
  action: 'withdraw',
  opportunityId: 'opp-1',
  amount: '0.2',
  assetCode: 'USDC',
  mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  feePayer: WALLET,
  sponsored: false,
  ...overrides,
});
const opportunities = [
  { id: 'opp-1', name: 'USDC vault', apy: 3.96, asset: { code: 'USDC' }, metadata: { protocol: 'kamino' } },
];
const text = (review) => JSON.stringify(review);

for (const pkg of ['react', 'react-native']) {
  console.log(`\n── ${pkg}: the review model ──────────────────────────────`);
  const load = loader({});
  const model = load(`packages/${pkg}/src/components/tx-review/tx-review-model.ts`);
  const { TX_REVIEW_COPY } = load(`packages/${pkg}/src/components/tx-review/tx-review-copy.ts`);
  const en = TX_REVIEW_COPY.en;
  const request = (operation, details, extra = {}) =>
    model.reviewFromRequest(
      { chain: 'SOLANA', network: 'mainnet', operation, details, signWith: WALLET, fallbackTitle: 'earn withdraw', ...extra },
      en,
    );

  const unnamed = request('earn_withdraw', cosignDetails());
  check('an opportunity the app has not listed: the amount with its asset', () =>
    assert.equal(unnamed.title, 'Withdraw 0.2 USDC'),
  );
  check('it never shows the raw operation', () => assert.doesNotMatch(text(unnamed), /earn[ _]withdraw/i));
  check('the asset leaves the opportunity for the wallet', () => {
    assert.equal(unnamed.kind, 'withdraw');
    assert.equal(unnamed.from.amount, '0.2');
    assert.equal(unnamed.from.asset, 'USDC');
    assert.equal(unnamed.from.chain, 'SOLANA');
    assert.equal(unnamed.to.self, true);
  });
  check('the network names the chain', () =>
    assert.ok(unnamed.rows.some((r) => r.label === 'Network' && r.value === 'Solana mainnet')),
  );
  check('not sponsored: the wallet pays the fee', () => {
    assert.equal(unnamed.fee?.sponsored, false);
    assert.ok(unnamed.rows.some((r) => r.label === 'Network fee' && r.value === 'Paid by your wallet'));
  });

  model.rememberEarnOpportunities(opportunities);
  const named = request('earn_withdraw', cosignDetails());
  check('a listed opportunity: its name in the title', () => assert.equal(named.title, 'Withdraw from USDC vault'));
  check('its name and APY after fees in the details', () => {
    assert.ok(named.rows.some((r) => r.label === 'Opportunity' && r.value === 'USDC vault'));
    assert.ok(named.rows.some((r) => r.label === 'APY after fees' && r.value === '3.96%'));
  });
  check('the protocol behind it is never shown', () => assert.doesNotMatch(text(named), /kamino|pods/i));

  const sponsored = request(
    'earn_deposit',
    cosignDetails({ action: 'deposit', amount: '1', feePayer: SPONSOR, sponsored: true }),
  );
  check('a deposit names where it goes', () => assert.equal(sponsored.title, 'Deposit into USDC vault'));
  check('sponsored: the app pays the fee', () => {
    assert.equal(sponsored.fee?.sponsored, true);
    assert.ok(sponsored.rows.some((r) => r.label === 'Network fee' && r.value === 'Covered by the app'));
    assert.equal(en.feeSponsored, 'The app pays the network fee');
    assert.equal(en.feePaid, 'You pay the network fee');
  });
  check('without the flag, the fee payer decides', () => {
    const { sponsored: _, ...noFlag } = cosignDetails({ feePayer: SPONSOR });
    assert.equal(request('earn_withdraw', noFlag).fee?.sponsored, true);
  });

  // The signature confirmation core asks before the build: no fee payer exists yet.
  const confirm = request('earn_deposit', { action: 'deposit', opportunity: 'opp-1', amount: '1' }, { signWith: undefined });
  check('the confirmation names the opportunity and its asset', () => {
    assert.equal(confirm.title, 'Deposit into USDC vault');
    assert.equal(confirm.from.asset, 'USDC');
  });
  check('the confirmation claims nobody pays the fee before the build says', () => {
    assert.equal(confirm.fee, undefined);
    assert.ok(!confirm.rows.some((r) => r.label === 'Network fee'));
  });

  check('Spanish and Portuguese', () => {
    const es = model.reviewFromRequest(
      { chain: 'SOLANA', operation: 'earn_deposit', details: cosignDetails({ action: 'deposit' }), fallbackTitle: '' },
      TX_REVIEW_COPY.es,
    );
    const pt = model.reviewFromRequest(
      { chain: 'SOLANA', operation: 'earn_withdraw', details: cosignDetails(), fallbackTitle: '' },
      TX_REVIEW_COPY.pt,
    );
    assert.equal(es.title, 'Depositar en USDC vault');
    assert.equal(pt.title, 'Sacar de USDC vault');
    assert.equal(TX_REVIEW_COPY.es.feeSponsored, 'La app paga la comisión de red');
    assert.equal(TX_REVIEW_COPY.pt.feeSponsored, 'O app paga a taxa de rede');
  });

  check('the result says what happened', () => {
    const parts = { action: 'deposit', chain: 'SOLANA', amount: '1', asset: 'USDC', name: 'USDC vault' };
    assert.equal(model.earnOutcome(parts, en), 'Deposited 1 USDC into the USDC vault on Solana');
    assert.equal(model.earnOutcome({ ...parts, action: 'withdraw' }, en), 'Withdrew 1 USDC from the USDC vault on Solana');
    assert.equal(model.earnOutcome(parts, TX_REVIEW_COPY.es), 'Depositaste 1 USDC en USDC vault, en Solana');
    assert.equal(model.earnOutcome(parts, TX_REVIEW_COPY.pt), 'Você depositou 1 USDC em USDC vault, na Solana');
    assert.equal(model.earnOutcome({ ...parts, name: undefined }, en), 'Deposited 1 USDC on Solana');
  });
}

async function mount(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () => root.render(element));
  return {
    text: () => document.body.textContent,
    unmount: async () => {
      await React.act(async () => root.unmount());
      container.remove();
    },
  };
}

(async () => {
  console.log('\n── web ConfirmModal, Earn deposit ────────────────────────');
  {
    const context = { getClient: () => ({ onAuthStateChange: () => () => undefined }), styles: {}, network: 'mainnet' };
    const load = loader({
      '../../context': { usePollar: () => context },
      '../../language': { useModalLanguage: () => 'en' },
      '../commons': { CopyButton: () => null, PollarModalFooter: () => null },
      '../PollarOverlay': { PollarOverlay: passthrough },
    });
    load('packages/react/src/components/tx-review/tx-review-model.ts').rememberEarnOpportunities(opportunities);
    const { ConfirmModal } = load('packages/react/src/components/confirm-modal/ConfirmModal.tsx');
    const confirmation = {
      kind: 'build_sign_submit',
      network: 'SOLANA',
      operation: 'earn_deposit',
      details: { action: 'deposit', opportunity: 'opp-1', amount: '1' },
      confirm: () => undefined,
      reject: () => undefined,
    };
    const view = await mount(React.createElement(ConfirmModal, { confirmation }));
    check('the title says where the deposit goes', () => assert.match(view.text(), /Deposit into USDC vault/));
    check('the amount carries its asset', () => assert.match(view.text(), /1 USDC/));
    check('no raw operation id', () => assert.doesNotMatch(view.text(), /earn[ _]deposit/i));
    await view.unmount();
  }

  console.log('\n── web TxStatusView, Earn result ─────────────────────────');
  {
    const load = loader({ '../commons': { CopyButton: () => null, ModalStatusBanner: ({ message }) => message } });
    const model = load('packages/react/src/components/tx-review/tx-review-model.ts');
    const { TX_REVIEW_COPY } = load('packages/react/src/components/tx-review/tx-review-copy.ts');
    const { TxStatusView } = load('packages/react/src/components/transaction-modal/TxStatusView.tsx');
    const parts = { action: 'deposit', chain: 'SOLANA', amount: '1', asset: 'USDC', name: 'USDC vault' };
    for (const [sponsored, line] of [
      [false, /You pay the network fee/],
      [true, /The app pays the network fee/],
    ]) {
      const view = await mount(
        React.createElement(TxStatusView, {
          transaction: { step: 'success', hash: 'sig-1', sponsored },
          showXdr: false,
          copied: false,
          explorerUrl: 'https://solscan.io/tx/sig-1',
          onSignAndSend: () => undefined,
          onToggleXdr: () => undefined,
          onCopyHash: () => undefined,
          onDone: () => undefined,
          language: 'en',
          review: model.reviewForEarn(parts, TX_REVIEW_COPY.en),
          successMessage: model.earnOutcome(parts, TX_REVIEW_COPY.en),
        }),
      );
      check(`sponsored ${sponsored}: the result says what happened`, () =>
        assert.match(view.text(), /Deposited 1 USDC into the USDC vault on Solana/),
      );
      check(`sponsored ${sponsored}: the generic sent line is gone`, () =>
        assert.doesNotMatch(view.text(), /Transaction sent successfully/),
      );
      check(`sponsored ${sponsored}: the fee line follows the transaction`, () => assert.match(view.text(), line));
      await view.unmount();
    }
    const unknown = await mount(
      React.createElement(TxStatusView, {
        transaction: { step: 'success', hash: 'sig-2' },
        showXdr: false,
        copied: false,
        explorerUrl: null,
        onSignAndSend: () => undefined,
        onToggleXdr: () => undefined,
        onCopyHash: () => undefined,
        onDone: () => undefined,
        language: 'en',
        review: model.reviewForEarn(parts, TX_REVIEW_COPY.en),
      }),
    );
    check('unknown payer: no fee line at all', () => assert.doesNotMatch(unknown.text(), /network fee/));
    await unknown.unmount();
  }

  console.log('\n── web TxStatusView, a confirmation answered in the view ──');
  {
    const load = loader({ '../commons': { CopyButton: () => null, ModalStatusBanner: ({ message }) => message } });
    const model = load('packages/react/src/components/tx-review/tx-review-model.ts');
    const { TX_REVIEW_COPY } = load('packages/react/src/components/tx-review/tx-review-copy.ts');
    const { TxStatusView } = load('packages/react/src/components/transaction-modal/TxStatusView.tsx');
    const parts = { action: 'deposit', chain: 'SOLANA', amount: '1', asset: 'USDC', name: 'USDC vault' };
    const answers = [];
    const base = {
      showXdr: false,
      copied: false,
      explorerUrl: null,
      onSignAndSend: () => undefined,
      onToggleXdr: () => undefined,
      onCopyHash: () => undefined,
      onDone: () => undefined,
      language: 'en',
      review: model.reviewForEarn(parts, TX_REVIEW_COPY.en),
    };
    const confirmation = {
      id: 'c-1',
      kind: 'sign',
      network: 'SOLANA',
      confirm: () => answers.push('yes'),
      reject: () => answers.push('no'),
    };
    const asking = await mount(
      React.createElement(TxStatusView, {
        ...base,
        transaction: { step: 'building-signing-submitting' },
        confirmation,
      }),
    );
    const confirmButton = [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Confirm');
    check('the yes is asked in the view, under the review', () => {
      assert.ok(confirmButton, 'no Confirm button');
      assert.match(asking.text(), /USDC vault/);
    });
    check('no status strip while it waits for the yes', () => assert.doesNotMatch(asking.text(), /Processing transaction/));
    await React.act(async () => confirmButton?.click());
    check('Confirm answers the confirmation', () => assert.deepEqual(answers, ['yes']));
    await asking.unmount();

    const sending = await mount(
      React.createElement(TxStatusView, { ...base, transaction: { step: 'building-signing-submitting' } }),
    );
    check('on its way: one strip under the same review', () => {
      assert.match(sending.text(), /USDC vault/);
      assert.ok(document.body.querySelector('.pollar-outcome'), 'no outcome strip');
    });
    await sending.unmount();

    const sent = await mount(React.createElement(TxStatusView, { ...base, transaction: { step: 'success', hash: 'sig-3' } }));
    check('sent: the hash stays out of the view until the details open', () => assert.doesNotMatch(sent.text(), /sig-3/));
    await sent.unmount();
  }

  console.log('\n── react-native TxReview, Earn ───────────────────────────');
  {
    const load = loader({ 'react-native': reactNative, 'react-native-svg': reactNativeSvg });
    const model = load('packages/react-native/src/components/tx-review/tx-review-model.ts');
    const { TX_REVIEW_COPY } = load('packages/react-native/src/components/tx-review/tx-review-copy.ts');
    const { TxReview } = load('packages/react-native/src/components/tx-review/TxReview.tsx');
    for (const [sponsored, line] of [
      [false, /You pay the network fee/],
      [true, /The app pays the network fee/],
    ]) {
      const data = model.reviewFromRequest(
        {
          chain: 'SOLANA',
          network: 'mainnet',
          operation: 'earn_withdraw',
          details: cosignDetails({ sponsored, feePayer: sponsored ? SPONSOR : WALLET }),
          signWith: WALLET,
          fallbackTitle: 'earn withdraw',
        },
        TX_REVIEW_COPY.en,
      );
      const view = await mount(React.createElement(TxReview, { data, theme: 'light', accentColor: '#005DB4', language: 'en' }));
      check(`sponsored ${sponsored}: the amount and the fee line`, () => {
        assert.match(view.text(), /0\.2 USDC/);
        assert.match(view.text(), line);
      });
      await view.unmount();
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('Earn review: titles, asset, network, opportunity, fee payer and result, web and React Native, passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
