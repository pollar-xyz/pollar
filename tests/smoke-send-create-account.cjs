// @pollar smoke test: the Send modal's step for a Stellar destination with no account.
//
// Run with `node tests/smoke-send-create-account.cjs` after `npm run build`.
//
// A payment to an address with no Stellar account fails on-chain
// (`paymentNoDestination`). The Send modal looks the destination up first and,
// when it does not exist, asks instead of sending: create it with the XLM being
// sent, or wait for another wallet to fund it. A non-XLM asset cannot create an
// account, so it only gets the explanation and the way back.

const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { SendModalTemplate } = require(path.resolve(__dirname, '../packages/react/dist/index.js'));
const { transactionErrorMessage } = require(path.resolve(__dirname, '../packages/core/dist/index.js'));

let pass = 0;
let fail = 0;
function check(label, ok) {
  if (ok) {
    pass++;
    console.log(`  OK    ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

const DESTINATION = 'GCI767BDLUHQAQUQ66ADIZYKZPWX674FIMULUNANAIZ5QUSKPVIS4UKG';
const XLM = { chain: 'STELLAR', type: 'native', code: 'XLM', balance: '287', available: '286', enabledInApp: true };
const USDC = {
  chain: 'STELLAR',
  type: 'credit_alphanum4',
  code: 'USDC',
  issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  balance: '100',
  available: '100',
  enabledInApp: true,
};
const noop = () => {};

function render(props) {
  return renderToStaticMarkup(
    React.createElement(SendModalTemplate, {
      theme: 'light',
      accentColor: '#005DB4',
      step: 'create-account',
      txTitle: '',
      assets: [XLM, USDC],
      selectedAsset: XLM,
      selectedChain: 'STELLAR',
      canSendOnChain: true,
      amount: '10',
      destination: DESTINATION,
      formError: '',
      isLoadingBalance: false,
      transaction: { step: 'idle' },
      showXdr: false,
      copied: false,
      explorerUrl: null,
      showBack: true,
      isInProgress: false,
      onClose: noop,
      onBack: noop,
      onRefresh: noop,
      onSelectAsset: noop,
      onAmountChange: noop,
      onMax: noop,
      onPaste: noop,
      onDestinationChange: noop,
      onSubmit: noop,
      onSignAndSend: noop,
      onToggleXdr: noop,
      onCopyHash: noop,
      onRetry: noop,
      onDone: noop,
      onCreateAccount: noop,
      ...props,
    }),
  );
}

const enabledButton = (html, text) => new RegExp(`<button class="pollar-btn-primary">${text}</button>`).test(html);
const disabledButton = (html, text) => new RegExp(`<button class="pollar-btn-primary" disabled="">${text}</button>`).test(html);

console.log('XLM to a missing account:');
const xlm = render({});
check('says the account does not exist', xlm.includes('This account doesn&#x27;t exist yet'));
check('shows the destination', xlm.includes(DESTINATION));
check('says it creates the account instead of a payment', xlm.includes('create the account'));
check('offers to create it with the amount', enabledButton(xlm, 'Create account with 10 XLM'));
check('offers to wait for another wallet to fund it', xlm.includes('I&#x27;ll wait until it&#x27;s funded'));

console.log('XLM below the starting minimum:');
const low = render({ amount: '0.5' });
check('explains the 1 XLM minimum', low.includes('at least 1 XLM'));
check('the create button is disabled', disabledButton(low, 'Create account with 0.5 XLM'));

console.log('A non-XLM asset to a missing account:');
const usdc = render({ selectedAsset: USDC });
check('explains it must be created and funded with XLM first', usdc.includes('created and funded with XLM first'));
check('offers no create button', !usdc.includes('Create account with'));
check('still offers to wait', usdc.includes('I&#x27;ll wait until it&#x27;s funded'));

console.log('The failure message when it happens anyway:');
const message = transactionErrorMessage('TX_DESTINATION_NOT_FOUND');
check('names the cause and the fix', /doesn't exist/.test(message) && /created and funded/.test(message));
check('a bare txFailed never reaches the screen', transactionErrorMessage(null, 'txFailed') !== 'txFailed');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
console.log('Send modal create-account step passed.');
