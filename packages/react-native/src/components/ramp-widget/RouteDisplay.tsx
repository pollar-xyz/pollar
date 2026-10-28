import React from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { CosignCustody, RampQuote, RampQuoteRejection, RampQuoteRequirement, RampWalletStep } from '@pollar/core';
import { rampLegTitle, rampRequirementCopy, rampResolutionText, rampTrustlineAsset, rampWalletStep } from '@pollar/core';

const CUSTODY_LABEL: Record<CosignCustody, string> = { COSIGNED: 'co-signed', SELF_CUSTODY: 'self-custody' };

interface RouteDisplayProps {
  quote: RampQuote;
  /** The first quote: the most received (or least sent) for the amount. */
  best?: boolean;
  disabled?: boolean;
  onSelect: (quote: RampQuote) => void;
}

const assetOf = (node: RampQuote['legs'][number]['to']) => (node.kind === 'fiat' ? node.currency : node.code);

export function RouteDisplay({ quote, best = false, disabled = false, onSelect }: RouteDisplayProps) {
  const first = quote.legs[0];
  const last = quote.legs[quote.legs.length - 1];
  return (
    <TouchableOpacity
      style={[styles.card, best && styles.recommended, disabled && { opacity: 0.5 }]}
      disabled={disabled}
      onPress={() => onSelect(quote)}
      activeOpacity={0.7}
    >
      <View style={styles.left}>
        <Text style={styles.provider}>
          {first && last
            ? `${quote.amountIn} ${assetOf(first.from)} → ~${quote.amountOut} ${assetOf(last.to)}`
            : `~${quote.amountOut}`}
        </Text>
        <Text style={styles.meta}>{quote.legs.map((leg) => rampLegTitle(leg)).join(' · ')}</Text>
      </View>
      {best && (
        <View style={styles.right}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Best rate</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

/**
 * A route that was planned and dropped, and what the user can do about it: a
 * verification step opens from its button, a missing trustline is added from its own.
 */
export function RejectedRouteDisplay({
  rejection,
  accentColor = '#005DB4',
  disabled = false,
  trusting = false,
  walletBusy = false,
  custodyChoice = false,
  onVerify,
  onTrust,
  onWalletStep,
}: {
  rejection: RampQuoteRejection;
  accentColor?: string;
  /** A route is starting, a trustline or a wallet is being added, so nothing else opens meanwhile. */
  disabled?: boolean;
  /** This row's trustline is being added. */
  trusting?: boolean;
  /** The wallet step this route asks for is running. */
  walletBusy?: boolean;
  /** The app leaves the custody to the user: a wallet set up or moved here asks which. */
  custodyChoice?: boolean;
  /** Without it, a verification step is described but offers no button. */
  onVerify?: ((requirement: RampQuoteRequirement) => void) | undefined;
  /** Without it, a missing trustline is described but offers no button. */
  onTrust?: ((asset: { code: string; issuer: string }) => void) | undefined;
  /**
   * Runs the wallet step the route asks for (`rampWalletStep`: create, set up or move
   * the wallet), with the user's custody pick when `custodyChoice`. An app that leaves
   * the custody to the user creates the wallet from the wallet menu instead.
   */
  onWalletStep?: ((step: RampWalletStep, custody?: CosignCustody) => void) | undefined;
}) {
  const requirement = rejection.requirement;
  const copy = requirement ? rampRequirementCopy(requirement) : null;
  const trustAsset = !requirement && onTrust ? rampTrustlineAsset(rejection) : null;
  const step = !requirement ? rampWalletStep(rejection) : null;
  const fromMenu = step?.action === 'create_wallet' && custodyChoice;
  const walletStep = onWalletStep && !fromMenu ? step : null;
  // Only a step that creates or moves a wallet picks its custody; adding recovery does not.
  const picks: Array<CosignCustody | undefined> =
    custodyChoice && step?.action !== 'set_up_recovery' ? ['COSIGNED', 'SELF_CUSTODY'] : [undefined];
  const meta = copy
    ? copy.message
    : fromMenu
      ? 'You need a wallet to receive this. Create it from the wallet menu, then find the route again.'
      : rampResolutionText(rejection.failure);
  return (
    <View style={[styles.card, !(copy?.action && onVerify) && !trustAsset && !walletStep && { opacity: 0.6 }]}>
      <View style={styles.left}>
        <Text style={styles.provider}>{rejection.legs.map((leg) => rampLegTitle(leg)).join(' · ')}</Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
      {trustAsset && (
        <TouchableOpacity
          style={[styles.verify, { borderColor: accentColor, opacity: disabled && !trusting ? 0.5 : 1 }]}
          disabled={disabled}
          accessibilityState={{ busy: trusting, disabled }}
          onPress={() => onTrust!(trustAsset)}
        >
          {trusting ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ActivityIndicator size="small" color={accentColor} />
              <Text style={{ color: accentColor, fontWeight: '600', fontSize: 13 }}>Adding…</Text>
            </View>
          ) : (
            <Text style={{ color: accentColor, fontWeight: '600', fontSize: 13 }}>Add {trustAsset.code} trustline</Text>
          )}
        </TouchableOpacity>
      )}
      {walletStep &&
        (walletBusy ? (
          <View style={[styles.verify, { borderColor: accentColor }]} accessibilityState={{ busy: true }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ActivityIndicator size="small" color={accentColor} />
              <Text style={{ color: accentColor, fontWeight: '600', fontSize: 13 }}>{walletStep.busyLabel}</Text>
            </View>
          </View>
        ) : (
          picks.map((custody) => (
            <TouchableOpacity
              key={custody ?? 'app'}
              style={[styles.verify, { borderColor: accentColor, opacity: disabled ? 0.5 : 1 }]}
              disabled={disabled}
              accessibilityState={{ disabled }}
              onPress={() => onWalletStep!(walletStep, custody)}
            >
              <Text style={{ color: accentColor, fontWeight: '600', fontSize: 13 }}>
                {custody ? `${walletStep.label} (${CUSTODY_LABEL[custody]})` : walletStep.label}
              </Text>
            </TouchableOpacity>
          ))
        ))}
      {requirement && copy?.action && onVerify && (
        <TouchableOpacity
          style={[styles.verify, { borderColor: accentColor, opacity: disabled ? 0.5 : 1 }]}
          disabled={disabled}
          onPress={() => onVerify(requirement)}
        >
          <Text style={{ color: accentColor, fontWeight: '600', fontSize: 13 }}>{copy.action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    marginBottom: 8,
  },
  recommended: {
    borderColor: '#005DB4',
    backgroundColor: '#f0f7ff',
  },
  left: {
    flex: 1,
    gap: 4,
  },
  right: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  provider: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  meta: {
    fontSize: 12,
    color: '#6b7280',
  },
  badge: {
    backgroundColor: '#005DB4',
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  verify: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
});
