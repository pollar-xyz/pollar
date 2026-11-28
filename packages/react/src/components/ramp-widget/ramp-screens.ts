import type { PollarLanguage, RampOrder } from '@pollar/core';
import { rampLegStatus, rampLegTitle, rampStepTitle } from '@pollar/core';
import { RAMP_COPY } from './ramp-copy';

type Leg = RampOrder['legs'][number];
type LegStep = Leg['steps'][number];

export type RampScreenStatus = 'done' | 'current' | 'upcoming' | 'failed';

/** One screen of a running order: something the user does, or a stretch the order runs on its own. */
export interface RampScreen {
  key: string;
  /** 'action': the user pays, signs or approves here. 'wait': the order moves without them. */
  kind: 'action' | 'wait';
  leg: Leg;
  /** The chain steps the screen covers; empty for a leg without planned steps. */
  steps: LegStep[];
  title: string;
  status: RampScreenStatus;
  /** A payment screen whose provider has not asked for the payment yet: nothing to pay with so far. */
  preparing?: boolean;
}

export const amountText = (value: string, language: PollarLanguage) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(language, { maximumFractionDigits: 7 }) : value;
};

/**
 * The order as screens, in the order the user meets them: each signature on its
 * own screen, the steps that run between two signatures together on one. The first
 * screen not done is the current one (failed when its leg or the order stopped);
 * every screen before it is done, every one after it upcoming.
 */
export function rampOrderScreens(
  order: Pick<RampOrder, 'legs' | 'pendingAction' | 'state'>,
  language: PollarLanguage,
): RampScreen[] {
  const copy = RAMP_COPY[language].screens;
  const parts: Array<Omit<RampScreen, 'status'> & { done: boolean }> = [];
  const waitsOn = (leg: Leg) => order.pendingAction?.legIndex === leg.index && order.pendingAction.kind !== 'NONE';

  for (const leg of order.legs) {
    const legStatus = rampLegStatus(leg);
    const legDone = legStatus === 'done';
    if (leg.steps?.length) {
      let running: LegStep[] = [];
      const flush = () => {
        if (!running.length) return;
        parts.push({
          key: `${leg.index}:${running[0]!.kind}`,
          kind: 'wait',
          leg,
          steps: running,
          title: rampLegTitle(leg, language),
          done: legDone || running.every((s) => s.status === 'done'),
        });
        running = [];
      };
      for (const step of leg.steps) {
        if (!step.signs) {
          running.push(step);
          continue;
        }
        flush();
        parts.push({
          key: `${leg.index}:${step.kind}`,
          kind: 'action',
          leg,
          steps: [step],
          title: rampStepTitle(step, leg, language),
          done: legDone || step.status === 'done',
        });
      }
      flush();
      continue;
    }

    if (leg.kind === 'PROVIDER_ONRAMP' || leg.kind === 'PROVIDER_OFFRAMP') {
      const onramp = leg.kind === 'PROVIDER_ONRAMP';
      const unitIn = leg.from.kind === 'fiat' ? leg.from.currency : leg.from.code;
      const unitOut = leg.to.kind === 'fiat' ? leg.to.currency : leg.to.code;
      // Absent from an sdk-api that predates it: a running leg not waiting on the user is then taken as paid.
      const payment = leg.paymentStatus as Leg['paymentStatus'] | undefined;
      const paid = payment === undefined ? legStatus === 'active' && !waitsOn(leg) : payment === 'received';
      const amount = amountText(leg.amountInPlanned, language);
      parts.push({
        key: `${leg.index}:pay`,
        kind: 'action',
        leg,
        steps: [],
        title: onramp ? copy.pay(amount, unitIn) : copy.send(amount, unitIn),
        done: legDone || paid,
        preparing: payment === 'not_requested' && !waitsOn(leg),
      });
      parts.push({
        key: `${leg.index}:deliver`,
        kind: 'wait',
        leg,
        steps: [],
        title: onramp ? copy.delivering(unitOut) : copy.payingOut(unitOut),
        done: legDone,
      });
      continue;
    }

    parts.push({
      key: `${leg.index}`,
      kind: leg.signingMode ? 'action' : 'wait',
      leg,
      steps: [],
      title: rampLegTitle(leg, language),
      done: legDone,
    });
  }

  const stopped = ['failed', 'refunded'].includes(order.state);
  let currentFound = false;
  return parts.map(({ done, ...screen }) => {
    if (done) return { ...screen, status: 'done' };
    if (currentFound) return { ...screen, status: 'upcoming' };
    currentFound = true;
    return { ...screen, status: stopped || rampLegStatus(screen.leg) === 'failed' ? 'failed' : 'current' };
  });
}
