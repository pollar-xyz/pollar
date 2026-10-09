import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { RampWorkflow } from '../src/components/ramp-widget/RampWorkflow';
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('../src/context', () => ({ usePollar: () => ({ styles: {} }) }));
const base = {
  txId: 'fixture-tx',
  status: 'pending',
  lifecycleState: 'awaiting_payment',
  transactionVersion: 2,
  reconciliationRequired: false,
  terms: {
    fiatAmount: '20.00',
    fiatCurrency: 'BOB',
    cryptoAmount: '1.123456789012',
    assetCode: 'NATIVE',
    assetChain: 'POLYGON',
    feeAmount: '0',
    feeCurrency: 'BOB',
    assetIssuer: null,
  },
  nextAction: {
    kind: 'sign_transaction',
    actionId: 'saved-action',
    purpose: 'withdrawal_payment',
    chain: 'POLYGON',
    network: 'mainnet',
    challengeRef: 'saved-challenge',
    payload: { encoding: 'fixture-json', value: 'unsigned' },
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  },
};
test('Polygon action renders exact terms and signs only after an explicit press', async () => {
  const client = {
    signRampAction: jest.fn(async () => ({
      ...base,
      nextAction: { kind: 'wait', actionId: 'wait', reason: 'settlement_verification' },
    })),
    continueRamp: jest.fn(),
  };
  const onChange = jest.fn();
  const screen = render(<RampWorkflow client={client} snapshot={base} onChange={onChange} copyText={jest.fn()} />);
  expect(screen.getByText(/1.123456789012 NATIVE/)).toBeTruthy();
  expect(client.signRampAction).not.toHaveBeenCalled();
  screen.rerender(<RampWorkflow client={client} snapshot={{ ...base }} onChange={onChange} copyText={jest.fn()} />);
  expect(client.signRampAction).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Authorize'));
  await waitFor(() => expect(client.signRampAction).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
});
test('parallel and linkless verification render together; reconciliation hides authorization', () => {
  const verification = {
    ...base,
    nextAction: {
      kind: 'verification',
      actionId: 'verify',
      order: 'parallel',
      steps: [
        { stepId: 'kyc', purpose: 'verification', status: 'required', url: null, instructions: 'Verify with provider' },
        {
          stepId: 'tos',
          purpose: 'terms',
          status: 'required',
          url: 'https://fixture.invalid/terms',
          instructions: 'Review terms',
        },
      ],
    },
  };
  const screen = render(<RampWorkflow client={{}} snapshot={verification} onChange={jest.fn()} copyText={jest.fn()} />);
  expect(screen.getByText(/Verify with provider/)).toBeTruthy();
  expect(screen.getByText('Review terms')).toBeTruthy();
  screen.rerender(
    <RampWorkflow client={{}} snapshot={{ ...base, reconciliationRequired: true }} onChange={jest.fn()} copyText={jest.fn()} />,
  );
  expect(screen.queryByText('Authorize')).toBeNull();
});

test('a pending wallet request cannot repeat and its failure is announced', async () => {
  let reject;
  const pending = new Promise((_, fail) => {
    reject = fail;
  });
  const client = { signRampAction: jest.fn(() => pending) };
  const onChange = jest.fn();
  const screen = render(<RampWorkflow client={client} snapshot={base} onChange={onChange} copyText={jest.fn()} />);
  fireEvent.press(screen.getByText('Authorize'));
  fireEvent.press(screen.getByText('Authorize'));
  expect(client.signRampAction).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error('Wallet rejected the request')));
  const alert = screen.getByRole('alert');
  expect(alert.props.accessibilityLiveRegion).toBe('assertive');
  expect(screen.getByText('Wallet rejected the request')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Authorize' })).toBeEnabled();
  expect(onChange).not.toHaveBeenCalled();
});
