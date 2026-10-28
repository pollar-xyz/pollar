'use client';

import type {
  PollarLanguage,
  CosignCustody,
  PollarClient,
  RampDirection,
  RampOrder,
  RampQuote,
  RampQuoteRejection,
  RampQuoteRequirement,
  RampRoute,
  RampSigningHandler,
  RampWalletStep,
} from '@pollar/core';
import {
  appUnavailableMessage,
  assertRampStellarSigner,
  isPollarApiError,
  isPollarNetworkError,
  rampCountries,
  rampNextApproval,
  rampQuoteFields,
  rampTrustlineErrorText,
} from '@pollar/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePollar } from '../../context';
import { useWalletAvailable } from '../../useWalletAvailable';
import type { RampStep } from './RampWidgetTemplate';
import { assetKey, fiatKey, RampWidgetTemplate } from './RampWidgetTemplate';
import '../shared.css';
import './RampWidget.css';
import { modalChrome } from '../modal-theme';
import { KycModal } from '../kyc-modal/KycModal';
import { RequirementFormModal } from '../requirement-form-modal/RequirementFormModal';
import { RegistryCheckModal } from '../registry-check-modal/RegistryCheckModal';
import { ProviderRegistrationModal } from '../provider-registration-modal/ProviderRegistrationModal';
import { useModalLanguage } from '../../language';
import { RAMP_COPY, type RampCopy } from './ramp-copy';

interface RampWidgetProps {
  onClose: () => void;
  /** Language of the widget and the steps it opens, as a BCP 47 tag. A language pinned in the dashboard wins over it. */
  language?: string | undefined;
}

/** After "I've paid", the payment is checked this often for this long, then the order goes back to the server's pace. */
const PAYMENT_CHECK_EVERY_MS = 10_000;
const PAYMENT_CHECK_WINDOW_MS = 2 * 60_000;

/** The text for a failed ramp call: an app that cannot serve it, a known code, the server's reason, or the fallback. */
function rampErrorMessage(error: unknown, fallback: string, copy: RampCopy, language: PollarLanguage): string {
  const unavailable = appUnavailableMessage(error, language);
  if (unavailable) return unavailable;
  if (isPollarApiError(error)) {
    const known = copy.errors[error.code];
    if (known) return known;
    const message = error.body.message;
    if (typeof message === 'string' && message && !/^[A-Z0-9_]+$/.test(message)) return message;
  }
  return fallback;
}

/** A route's identity across quotes: quoting again gives the same route a new quote id. */
function routeKey(quote: RampQuote): string {
  const node = (n: RampQuote['legs'][number]['from']) =>
    n.kind === 'asset' ? `${n.code}:${n.chain}` : `${n.currency}:${n.rail}`;
  return quote.legs.map((leg) => `${leg.kind}:${node(leg.from)}>${node(leg.to)}`).join('|');
}

/** An exact decimal, as the API takes amounts: "10", "10.5", never "1e3" or "-2". */
const DECIMAL = /^\d+(\.\d+)?$/;

/**
 * Signs a leg, lending the user's own connected wallet as the ramp signer while
 * it does: the wallet (Freighter, Phantom...) shows the transaction and the
 * user approves it there. Core keeps no built-in ramp signer; an app that
 * registered its own signer for a chain keeps it, and the widget's are released
 * once the leg is signed.
 */
async function signLegWithWallet(client: PollarClient, orderId: string, actionId: string, copy: RampCopy): Promise<RampOrder> {
  const lent: Array<() => void> = [];
  const lend = (chain: 'STELLAR' | 'SOLANA', encoding: string, handler: RampSigningHandler) => {
    try {
      lent.push(client.registerRampSigningHandler(chain, encoding, handler));
    } catch {
      // The app registered its own signer for this chain: that one signs.
    }
  };
  lend('STELLAR', 'xdr', async (action) => {
    const wallet = client.getWallet();
    if (!wallet) throw new Error(copy.connectStellarWallet);
    assertRampStellarSigner(action, wallet.address);
    const outcome = await client.signTx(action.payload.value);
    if (client.getWallet()?.address !== wallet.address) throw new Error(copy.walletChanged);
    if (outcome.status === 'signed') return outcome.signedXdr;
    throw new Error(
      outcome.status === 'error' ? (outcome.message ?? outcome.details ?? copy.signingCancelled) : copy.signingCancelled,
    );
  });
  lend('SOLANA', 'solana-v0-json', async (action) => {
    // The server built the transfer from the user's wallet; sign only one from the wallet connected now.
    const payload = JSON.parse(action.payload.value) as { from?: string; unsignedTransaction?: string };
    const solanaWallet = () => client.getWallets().find((w) => w.chain === 'SOLANA' && w.custody === 'external');
    const wallet = solanaWallet();
    if (!wallet || payload.from !== wallet.address || !payload.unsignedTransaction) throw new Error(copy.solanaWalletMismatch);
    const signed = await client.signSolanaTransaction(payload.unsignedTransaction);
    if (solanaWallet()?.address !== wallet.address) throw new Error(copy.walletChanged);
    return signed;
  });
  try {
    return await client.signRampLeg(orderId, actionId);
  } finally {
    for (const release of lent) release();
  }
}

export function RampWidget({ onClose, language: languageProp }: RampWidgetProps) {
  const {
    getClient,
    styles,
    network,
    openCosignModal,
    setCosignNextStep,
    openRecoveryModal,
    recovery,
    recoveryLocked,
    appConfig,
    cosign,
    refreshWalletBalance,
  } = usePollar();
  const client = getClient();
  const language = useModalLanguage(languageProp);
  const copy = RAMP_COPY[language];
  const { theme, accentColor, styleOverrides, overlayStyle } = modalChrome(styles);

  const [step, setStep] = useState<RampStep>('input');
  const [direction, setDirection] = useState<RampDirection>('ONRAMP');
  const [routes, setRoutes] = useState<RampRoute[]>([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [country, setCountry] = useState('');
  const [fiatChoice, setFiatChoice] = useState('');
  const [assetChoice, setAssetChoice] = useState('');
  const [amount, setAmount] = useState('');
  const [quotes, setQuotes] = useState<RampQuote[]>([]);
  const [rejected, setRejected] = useState<RampQuoteRejection[]>([]);
  const [selected, setSelected] = useState<RampQuote | null>(null);
  const [startingQuoteId, setStartingQuoteId] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<RampOrder | null>(null);
  const [pendingOrders, setPendingOrders] = useState<RampOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [signing, setSigning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<RampQuoteRequirement | null>(null);
  const [trustingAsset, setTrustingAsset] = useState<string | null>(null);
  // The dropped route (its index) whose wallet step is running.
  const [walletBusy, setWalletBusy] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);
  // A route whose order waits on the new account the user approves on the device: once that
  // request is approved the route is resumed, since its quote may lapse meanwhile.
  const [awaitingAccount, setAwaitingAccount] = useState<{ routeKey: string; requestId: string } | null>(null);
  // A read of the order failed and polling keeps trying; cleared by the next good read.
  const [pollTrouble, setPollTrouble] = useState(false);
  // Bumped to start following the order again (after a retry or refresh of one that had stopped).
  const [pollKey, setPollKey] = useState(0);
  // Until when the payment the user says they made is checked at PAYMENT_CHECK_EVERY_MS.
  const [paymentCheckUntil, setPaymentCheckUntil] = useState<number | null>(null);
  // The error a failed check showed, cleared once the order is past the payment.
  const checkErrorRef = useRef<string | null>(null);
  // The approval the user was last prompted for, so each new one prompts once.
  const promptedApproval = useRef<string | null>(null);
  // An app that leaves the custody to the user: the user picks it for each wallet step.
  const custodyChoice = appConfig.application?.walletCustodyMode === 'USER_CHOICE';
  const appChains = appConfig.application?.chains;
  // The step opened last: a modal that reports after it was closed or replaced is ignored.
  const verifyAttempt = useRef<RampQuoteRequirement | null>(null);

  const countries = useMemo(() => rampCountries(routes), [routes]);
  const fiats = countries.find((c) => c.country === country)?.fiats ?? [];
  const fiat = fiats.find((f) => fiatKey(f) === fiatChoice) ?? fiats[0] ?? null;
  const assets = useMemo(() => {
    const seen = new Map<string, RampRoute['asset']>();
    for (const route of routes)
      if (fiat && route.fiat.country === country && fiatKey(route.fiat) === fiatKey(fiat))
        seen.set(assetKey(route.asset), route.asset);
    return [...seen.values()];
  }, [routes, country, fiat]);
  const asset = assets.find((a) => assetKey(a) === assetChoice) ?? assets[0] ?? null;
  const fields = selected ? rampQuoteFields(selected) : [];
  const sellAvailable = useWalletAvailable(
    direction === 'OFFRAMP' && asset ? { chain: asset.chain, code: asset.code, issuer: asset.identifier } : null,
  );

  useEffect(() => {
    if (direction === 'OFFRAMP') void refreshWalletBalance();
  }, [direction, refreshWalletBalance]);

  async function loadRoutes(next: RampDirection) {
    setRoutesLoading(true);
    try {
      const { routes: found } = await client.getRampRoutes(next);
      setRoutes(found);
      const first = rampCountries(found)[0]?.country ?? '';
      setCountry((current) => (found.some((r) => r.fiat.country === current) ? current : first));
    } catch (error) {
      setRoutes([]);
      setErrorMsg(rampErrorMessage(error, copy.loadRoutesFailed, copy, language));
    } finally {
      setRoutesLoading(false);
    }
  }

  async function loadPendingOrders() {
    try {
      // Every order not final yet: one already paid and moving on its own is still the user's to follow.
      const page = await client.listRampOrders({ open: 'true', limit: 5 });
      setPendingOrders(page.orders);
    } catch {
      setPendingOrders([]);
    }
  }

  useEffect(() => {
    void loadRoutes(direction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, direction]);

  useEffect(() => {
    void loadPendingOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // Follow the order at the pace the server suggests until it settles. Reading never signs or approves.
  const orderId = order?.id ?? null;
  useEffect(() => {
    if (step !== 'status' || !orderId) return;
    const controller = new AbortController();
    client
      .pollRampOrder(orderId, {
        signal: controller.signal,
        onUpdate: (next) => {
          setOrder(next);
          setPollTrouble(false);
        },
        onError: () => setPollTrouble(true),
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setErrorMsg(rampErrorMessage(error, copy.readOrderFailed, copy, language));
      });
    return () => controller.abort();
  }, [client, step, orderId, pollKey]);

  // The polling sleeps through the fiat payment's long wait, so once a check sees
  // the order past it, the polling starts again at the pace of the next step.
  const awaitingPayment = step === 'status' && order?.pendingAction?.kind === 'FIAT_PAYMENT';
  useEffect(() => {
    if (paymentCheckUntil === null || !orderId) return;
    if (!awaitingPayment) {
      setPaymentCheckUntil(null);
      setPollKey((key) => key + 1);
      return;
    }
    const timer = setInterval(() => {
      if (Date.now() >= paymentCheckUntil) {
        setPaymentCheckUntil(null);
        return;
      }
      client
        .checkRampOrder(orderId)
        .then(setOrder)
        .catch(() => undefined);
    }, PAYMENT_CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [client, orderId, awaitingPayment, paymentCheckUntil]);

  useEffect(() => {
    if (awaitingPayment || checkErrorRef.current === null) return;
    const shown = checkErrorRef.current;
    checkErrorRef.current = null;
    setErrorMsg((current) => (current === shown ? null : current));
  }, [awaitingPayment]);

  // A co-signed step of the order waits on the user's device: bring its request up the moment it appears.
  const approval = order?.pendingAction?.kind === 'COSIGN_APPROVAL' ? order.pendingAction.actionId : null;
  useEffect(() => {
    if (!approval || promptedApproval.current === approval) return;
    promptedApproval.current = approval;
    void client.cosign
      .pending()
      .catch(() => undefined)
      .then(() => openCosignModal());
  }, [approval, client, openCosignModal]);

  // The approval prompt stays up between two approvals of the order instead of closing and reopening.
  const nextApproval = step === 'status' && order ? rampNextApproval(order, language) : null;
  useEffect(() => {
    setCosignNextStep(nextApproval);
  }, [nextApproval, setCosignNextStep]);
  useEffect(() => () => setCosignNextStep(null), [setCosignNextStep]);

  const resolvedRequest = cosign.lastResolved;
  useEffect(() => {
    if (!awaitingAccount || resolvedRequest?.id !== awaitingAccount.requestId) return;
    setAwaitingAccount(null);
    if (resolvedRequest.status !== 'APPROVED') {
      setErrorMsg(copy.accountNotApproved);
      return;
    }
    void resumeRoute(awaitingAccount.routeKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingAccount, resolvedRequest]);

  function handleDirectionChange(next: RampDirection) {
    setDirection(next);
    setErrorMsg(null);
    setAwaitingAccount(null);
  }

  /** Quotes the entered amount and shows the routes; the quotes found, none when it failed. */
  async function handleFindRoute(): Promise<RampQuote[]> {
    if (!fiat || !asset) return [];
    if (!DECIMAL.test(amount.trim()) || Number(amount) <= 0) {
      setErrorMsg(copy.amountInvalid);
      return [];
    }
    setStep('loading_quote');
    setErrorMsg(null);
    setSelected(null);
    try {
      const result = await client.quoteRamp({
        direction,
        fiat: { currency: fiat.currency, rail: fiat.rail, country: fiat.country },
        asset: { code: asset.code, identifier: asset.identifier, chain: asset.chain },
        amount: { value: amount.trim(), denomination: 'in' },
      });
      setQuotes(result.quotes);
      setRejected(result.rejected);
      setStep('select_route');
      return result.quotes;
    } catch (error) {
      if (isPollarApiError(error) && error.code === 'SDK_RAMPS_NO_ROUTE') {
        setQuotes([]);
        setRejected(Array.isArray(error.body.rejected) ? (error.body.rejected as RampQuoteRejection[]) : []);
        setStep('select_route');
        return [];
      }
      setErrorMsg(rampErrorMessage(error, copy.findRouteFailed, copy, language));
      setStep('error');
      return [];
    }
  }

  function handleVerifyRoute(requirement: RampQuoteRequirement) {
    setErrorMsg(null);
    verifyAttempt.current = requirement;
    setVerifying(requirement);
  }

  function closeVerification() {
    verifyAttempt.current = null;
    setVerifying(null);
  }

  /** A completed step can unlock its route: quote again with the same amount. */
  function verificationDone(requirement: RampQuoteRequirement) {
    if (verifyAttempt.current !== requirement) return;
    closeVerification();
    void handleFindRoute();
  }

  /** Adds the trustline a dropped route needs, sponsored when the app covers it, then quotes again. */
  async function handleTrustAsset(asset: { code: string; issuer: string }) {
    if (trustingAsset) return;
    setTrustingAsset(`${asset.code}:${asset.issuer}`);
    setErrorMsg(null);
    try {
      const outcome = await client.setTrustline(asset);
      if (outcome.status === 'error') {
        setErrorMsg(rampTrustlineErrorText(outcome, asset.code, language));
        return;
      }
      if (outcome.status === 'cosign_pending') {
        setErrorMsg(copy.approveTrustline(asset.code));
        openCosignModal();
        return;
      }
      await client.refreshAssets().catch(() => {});
      await handleFindRoute();
    } catch (error) {
      setErrorMsg(rampErrorMessage(error, copy.addTrustlineFailed(asset.code), copy, language));
    } finally {
      setTrustingAsset(null);
    }
  }

  /**
   * Runs the wallet step a dropped route asks for (create, set up or move the wallet),
   * then quotes again. A new Turnkey wallet first gets a recovery method: it signs
   * nothing until it has one.
   */
  async function handleWalletStep(walletStep: RampWalletStep, index: number, custody?: CosignCustody) {
    if (walletBusy !== null) return;
    setWalletBusy(index);
    setErrorMsg(null);
    try {
      const { recoveryRequired } = await client.runRampWalletStep(walletStep, custody);
      if (recoveryRequired) {
        setErrorMsg(copy.addRecovery);
        openRecoveryModal();
        return;
      }
      await handleFindRoute();
    } catch (error) {
      const code = isPollarApiError(error) ? error.code : null;
      if (code === 'SDK_RAMPS_WALLET_NOT_READY') {
        setErrorMsg(copy.approveAccount);
        openCosignModal();
        return;
      }
      setErrorMsg(
        code === 'SDK_WALLET_PROVISIONING_DISABLED'
          ? copy.noWalletCreation
          : rampErrorMessage(error, copy.prepareWalletFailed, copy, language),
      );
    } finally {
      setWalletBusy(null);
    }
  }

  /** Quotes again and continues with the same route on its fresh quote, which is never resumed again. */
  async function resumeRoute(key: string) {
    const same = (await handleFindRoute()).find((q) => routeKey(q) === key);
    if (same) handleSelectQuote(same, true);
    else setErrorMsg(copy.routeGone);
  }

  /** `fresh`: the quote was just taken, so a lapse is reported instead of quoting again. */
  function handleSelectQuote(quote: RampQuote, fresh = false) {
    // The server refuses a lapsed quote: take the same route on a new one instead of sending it.
    if (!fresh && Date.parse(quote.expiresAt) <= Date.now()) {
      void resumeRoute(routeKey(quote));
      return;
    }
    setSelected(quote);
    setErrorMsg(null);
    const missing = rampQuoteFields(quote).some((f) => !f.optional && !(fieldValues[f.key] ?? '').trim());
    if (missing) setStep('contact');
    else void startOrder(quote, fresh);
  }

  async function startOrder(quote: RampQuote, fresh = false) {
    setIsLoading(true);
    setStartingQuoteId(quote.quoteId);
    setErrorMsg(null);
    setAwaitingAccount(null);
    try {
      const payee = Object.fromEntries(
        rampQuoteFields(quote)
          .map((f) => [f.key, (fieldValues[f.key] ?? '').trim()])
          .filter(([, value]) => value),
      );
      const created = await client.createRampOrder({
        quoteId: quote.quoteId,
        ...(Object.keys(payee).length ? { payee } : {}),
      });
      setOrder(created);
      setStep('status');
    } catch (error) {
      // The route's wallet on another chain waits on the user's approval: bring that request up.
      // Not a failure while the request is there: the route starts again once it is approved.
      if (isPollarApiError(error) && error.code === 'SDK_RAMPS_WALLET_NOT_READY') {
        const pending = await client.cosign.pending().catch(() => []);
        const request = pending.find((r) => r.intent === 'add_accounts');
        if (request) setAwaitingAccount({ routeKey: routeKey(quote), requestId: request.id });
        else setErrorMsg(rampErrorMessage(error, copy.startOrderFailed, copy, language));
        openCosignModal();
        setStep('select_route');
        return;
      }
      // Lapsed between the list and the click (or by the server's clock): same route, new quote.
      if (isPollarApiError(error) && error.code === 'SDK_RAMPS_QUOTE_EXPIRED' && !fresh) {
        void resumeRoute(routeKey(quote));
        return;
      }
      setErrorMsg(rampErrorMessage(error, copy.startOrderFailed, copy, language));
      // A refused detail is fixed on the form; an expired quote needs a new one.
      if (isPollarApiError(error) && error.code === 'VALIDATION_ERROR' && rampQuoteFields(quote).length) setStep('contact');
      else setStep('select_route');
    } finally {
      setIsLoading(false);
      setStartingQuoteId(null);
    }
  }

  async function handleSign() {
    const action = order?.pendingAction;
    if (!order || action?.kind !== 'SIGNATURE' || signing) return;
    setSigning(true);
    setErrorMsg(null);
    try {
      setOrder(await signLegWithWallet(client, order.id, action.actionId, copy));
    } catch (error) {
      setErrorMsg(
        rampErrorMessage(
          error,
          error instanceof Error && error.message ? error.message : copy.signingCancelled,
          copy,
          language,
        ),
      );
      setOrder(await client.getRampOrder(order.id).catch(() => order));
    } finally {
      setSigning(false);
    }
  }

  async function handleResumeOrder(id: string) {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const found = await client.getRampOrder(id);
      setDirection(found.direction);
      setOrder(found);
      setStep('status');
    } catch (error) {
      setErrorMsg(rampErrorMessage(error, copy.resumeOrderFailed, copy, language));
    } finally {
      setIsLoading(false);
    }
  }

  function handleNewOrder() {
    setAwaitingAccount(null);
    setOrder(null);
    setSelected(null);
    setQuotes([]);
    setRejected([]);
    setErrorMsg(null);
    setStep('input');
    void loadPendingOrders();
  }

  function handleBack() {
    setErrorMsg(null);
    setAwaitingAccount(null);
    setStep(step === 'contact' ? 'select_route' : 'input');
  }

  /** Only Amount and Route sit before a step the user can leave; Complete is never left this way. */
  function handleStepSelect(target: string) {
    setErrorMsg(null);
    setAwaitingAccount(null);
    setStep(target === copy.steps.route ? 'select_route' : 'input');
  }

  /** The user says they paid: the payment is checked now, then often for a while. */
  async function handleCheckPayment() {
    if (!order || paymentCheckUntil !== null) return;
    setErrorMsg(null);
    setPaymentCheckUntil(Date.now() + PAYMENT_CHECK_WINDOW_MS);
    try {
      setOrder(await client.checkRampOrder(order.id));
    } catch (error) {
      // A check that timed out still runs on the server: the checks every PAYMENT_CHECK_EVERY_MS carry on.
      if (isPollarNetworkError(error)) return;
      setPaymentCheckUntil(null);
      const message = rampErrorMessage(error, copy.checkPaymentFailed, copy, language);
      checkErrorRef.current = message;
      setErrorMsg(message);
    }
  }

  /** Runs the user's held order again, then follows it. */
  async function handleRetryOrder() {
    if (!order || retrying) return;
    setRetrying(true);
    setErrorMsg(null);
    try {
      setOrder(await client.retryRampOrder(order.id));
      setPollKey((key) => key + 1);
    } catch (error) {
      setErrorMsg(rampErrorMessage(error, copy.retryOrderFailed, copy, language));
    } finally {
      setRetrying(false);
    }
  }

  // An order held until the wallet has a way to be recovered tries again once it has one.
  const heldForRecovery = step === 'status' && order?.failure?.resolutionAction === 'set_up_recovery';
  const wasRecoveryLocked = useRef(recoveryLocked);
  useEffect(() => {
    if (heldForRecovery && wasRecoveryLocked.current && !recoveryLocked && recovery) void handleRetryOrder();
    wasRecoveryLocked.current = recoveryLocked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldForRecovery, recoveryLocked, recovery]);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (step === 'status' && order) {
        setOrder(await client.getRampOrder(order.id));
        setPollKey((key) => key + 1);
      } else if (step === 'select_route') await handleFindRoute();
      else {
        await loadRoutes(direction);
        await loadPendingOrders();
        if (direction === 'OFFRAMP') await refreshWalletBalance();
      }
    } catch (error) {
      setErrorMsg(rampErrorMessage(error, copy.refreshFailed, copy, language));
    } finally {
      setRefreshing(false);
    }
  }

  const flowSteps =
    fields.length || quotes.some((q) => rampQuoteFields(q).length)
      ? [copy.steps.amount, copy.steps.route, copy.steps.details, copy.steps.complete]
      : [copy.steps.amount, copy.steps.route, copy.steps.complete];
  const stepLabel: Partial<Record<RampStep, string>> = {
    input: copy.steps.amount,
    loading_quote: copy.steps.amount,
    select_route: copy.steps.route,
    contact: copy.steps.details,
    status: copy.steps.complete,
  };
  const label = stepLabel[step];

  // The step replaces the widget while it is open; the widget keeps what was entered.
  if (verifying) {
    const progress = { progress: { position: verifying.completed + 1, total: verifying.total } };
    const done = () => verificationDone(verifying);
    if (verifying.type === 'FORM')
      return (
        <RequirementFormModal
          formId={verifying.optionId}
          {...progress}
          language={languageProp}
          onClose={closeVerification}
          onSubmitted={done}
        />
      );
    if (verifying.type === 'REGISTRY_CHECK')
      return (
        <RegistryCheckModal
          optionId={verifying.optionId}
          {...progress}
          language={languageProp}
          onClose={closeVerification}
          onApproved={done}
        />
      );
    if (verifying.type === 'PROVIDER_REGISTRATION')
      return (
        <ProviderRegistrationModal
          corridorId={verifying.corridorId}
          {...progress}
          language={languageProp}
          onClose={closeVerification}
          onRegistered={done}
        />
      );
    return (
      <KycModal
        country={country}
        corridorId={verifying.corridorId}
        providerId={verifying.optionId}
        language={languageProp}
        onClose={closeVerification}
        onApproved={done}
      />
    );
  }

  return (
    <div className="pollar-overlay" style={overlayStyle} onClick={onClose}>
      <RampWidgetTemplate
        language={language}
        theme={theme}
        accentColor={accentColor}
        {...(styleOverrides ? { styleOverrides } : {})}
        network={network}
        step={step}
        flowSteps={flowSteps}
        flowStepIndex={label ? flowSteps.indexOf(label) : -1}
        direction={direction}
        routesLoading={routesLoading}
        countries={countries}
        country={country}
        fiats={fiats}
        fiat={fiat}
        assets={assets}
        asset={asset}
        amount={amount}
        sellAvailable={sellAvailable}
        quotes={quotes}
        rejected={rejected}
        startingQuoteId={startingQuoteId}
        fields={fields}
        fieldValues={fieldValues}
        order={order}
        pendingOrders={pendingOrders}
        isLoading={isLoading}
        refreshing={refreshing}
        signing={signing}
        errorMsg={errorMsg}
        notice={awaitingAccount ? copy.awaitingAccount : null}
        onDirectionChange={handleDirectionChange}
        onCountryChange={(next) => {
          setCountry(next);
          setFiatChoice('');
          setAssetChoice('');
        }}
        onFiatChange={(key) => {
          setFiatChoice(key);
          setAssetChoice('');
        }}
        onAssetChange={setAssetChoice}
        onAmountChange={(value) => {
          setAmount(value);
          setErrorMsg(null);
        }}
        onFindRoute={() => void handleFindRoute()}
        onSelectQuote={(quote) => handleSelectQuote(quote)}
        onVerifyRoute={handleVerifyRoute}
        trustingAsset={trustingAsset}
        onTrustAsset={(asset) => void handleTrustAsset(asset)}
        walletBusy={walletBusy}
        custodyChoice={custodyChoice}
        onWalletStep={(walletStep, index, custody) => void handleWalletStep(walletStep, index, custody)}
        noChains={Array.isArray(appChains) && appChains.length === 0}
        onFieldChange={(key, value) => setFieldValues((current) => ({ ...current, [key]: value }))}
        onContactContinue={() => {
          if (selected) void startOrder(selected);
        }}
        onSign={() => void handleSign()}
        onApprove={openCosignModal}
        retrying={retrying}
        onRetryOrder={() => void handleRetryOrder()}
        onSetUpRecovery={openRecoveryModal}
        recoveryMissing={recovery === null ? null : recoveryLocked}
        pollTrouble={pollTrouble}
        checkingPayment={paymentCheckUntil !== null}
        onCheckPayment={() => void handleCheckPayment()}
        onResumeOrder={(id) => void handleResumeOrder(id)}
        onNewOrder={handleNewOrder}
        onBack={handleBack}
        onStepSelect={handleStepSelect}
        onRetry={() => {
          setErrorMsg(null);
          setStep('input');
        }}
        onRefresh={() => void handleRefresh()}
        onClose={onClose}
      />
    </div>
  );
}
