import { useInheritedLanguage } from '../../language-context';
import { type CosignCustody, type PollarLanguage } from '@pollar/core';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TouchableWithoutFeedback } from 'react-native';
import { WALLET_BUTTON_COPY } from './wallet-button-copy';

/** Presentation state, theme colors and actions for the native wallet button and its menu. */
export interface WalletButtonTemplateProps {
  walletAddress: string | null;
  accentColor: string;
  open: boolean;
  copied: boolean;
  dropdownBg: string;
  dropdownBorder: string;
  itemColor: string;
  onToggleOpen: () => void;
  onClose: () => void;
  onCopy: () => void;
  onWalletBalance: () => void;
  onTxHistory: () => void;
  /** Present when the wallet has recovery methods to manage. */
  onRecovery?: () => void;
  recoveryLocked?: boolean;
  onLogout: () => void;
  onLogin: () => void;
  /** Signed in without a wallet: an app that creates wallets on demand or leaves the custody to the user. */
  signedIn?: boolean;
  creatingWallet?: boolean;
  createWalletError?: string | null;
  /**
   * The app leaves the custody to the user (USER_CHOICE): Create wallet offers
   * co-signed and self-custody, and calls `onCreateWallet` with the pick. A
   * self-custody wallet is created only after the user accepts its risks.
   */
  custodyChoice?: boolean;
  onCreateWallet?: (custody?: CosignCustody) => void;
  /** Language of the button and its menu. Defaults to the user's device; the button passes the resolved one. */
  language?: PollarLanguage | undefined;
}

export function WalletButtonTemplate({
  walletAddress,
  accentColor,
  open,
  copied,
  dropdownBg,
  dropdownBorder,
  itemColor,
  onToggleOpen,
  onClose,
  onCopy,
  onWalletBalance,
  onTxHistory,
  onRecovery,
  recoveryLocked,
  onLogout,
  onLogin,
  signedIn,
  creatingWallet,
  createWalletError,
  custodyChoice,
  onCreateWallet,
  language: languageProp,
}: WalletButtonTemplateProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = WALLET_BUTTON_COPY[language];
  const [selfCustodyNotice, setSelfCustodyNotice] = useState(false);
  const [risksAccepted, setRisksAccepted] = useState(false);
  if (!walletAddress && signedIn) {
    const item = (label: string, onPress: () => void, disabled = false, color = itemColor) => (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.menuItem, { opacity: disabled ? 0.5 : 1 }]}
        onPress={onPress}
        disabled={disabled}
      >
        <Text style={[styles.menuItemText, { color }]}>{label}</Text>
      </TouchableOpacity>
    );
    const note = (text: string) => <Text style={[styles.note, { color: itemColor }]}>{text}</Text>;
    const creatingLabel = copy.creatingWallet;
    return (
      <View style={styles.container}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={onCreateWallet ? copy.noWallet : copy.signedIn}
          style={[styles.loginBtn, { backgroundColor: accentColor }]}
          onPress={onToggleOpen}
        >
          <Text style={styles.loginBtnText}>{onCreateWallet ? copy.noWallet : copy.signedIn}</Text>
        </TouchableOpacity>
        <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
          <TouchableWithoutFeedback onPress={onClose}>
            <View style={styles.overlay}>
              <TouchableWithoutFeedback>
                <View style={[styles.dropdown, { backgroundColor: dropdownBg, borderColor: dropdownBorder }]}>
                  {createWalletError ? note(createWalletError) : null}
                  {onCreateWallet &&
                    !custodyChoice &&
                    item(creatingWallet ? creatingLabel : copy.createWallet, () => onCreateWallet(), !!creatingWallet)}
                  {onCreateWallet && custodyChoice && !selfCustodyNotice && (
                    <>
                      {item(
                        creatingWallet ? creatingLabel : copy.createCosigned,
                        () => onCreateWallet('COSIGNED'),
                        !!creatingWallet,
                      )}
                      {note(copy.cosignedNote)}
                      {item(copy.createSelfCustody, () => setSelfCustodyNotice(true), !!creatingWallet)}
                      {note(copy.selfCustodyNote)}
                    </>
                  )}
                  {onCreateWallet && custodyChoice && selfCustodyNotice && (
                    <>
                      <Text accessibilityRole="alert" style={[styles.note, { color: itemColor }]}>
                        {copy.selfCustodyRisks}
                      </Text>
                      <TouchableOpacity
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: risksAccepted }}
                        style={styles.check}
                        onPress={() => setRisksAccepted((v) => !v)}
                        disabled={creatingWallet}
                      >
                        <View
                          style={[
                            styles.box,
                            { borderColor: dropdownBorder },
                            risksAccepted ? { backgroundColor: accentColor, borderColor: accentColor } : null,
                          ]}
                        />
                        <Text style={[styles.menuItemText, { color: itemColor, flexShrink: 1 }]}>{copy.acceptRisks}</Text>
                      </TouchableOpacity>
                      {item(
                        creatingWallet ? creatingLabel : copy.createSelfCustody,
                        () => onCreateWallet('SELF_CUSTODY'),
                        !!creatingWallet || !risksAccepted,
                      )}
                      {item(
                        copy.back,
                        () => {
                          setSelfCustodyNotice(false);
                          setRisksAccepted(false);
                        },
                        !!creatingWallet,
                      )}
                    </>
                  )}
                  <View style={[styles.divider, { backgroundColor: dropdownBorder }]} />
                  {item(copy.logout, onLogout, false, '#ef4444')}
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    );
  }

  if (!walletAddress) {
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={copy.loginWithPollar}
        style={[styles.loginBtn, { backgroundColor: accentColor }]}
        onPress={onLogin}
      >
        <Text style={styles.loginBtnText}>{copy.loginWithPollar}</Text>
      </TouchableOpacity>
    );
  }

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={copy.openWallet}
        style={[styles.walletBtn, { backgroundColor: dropdownBg, borderColor: dropdownBorder }]}
        onPress={onToggleOpen}
      >
        <View style={[styles.circle, { backgroundColor: accentColor }]} />
        <Text style={[styles.walletBtnText, { color: itemColor }]}>{truncateAddress(walletAddress)}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.dropdown, { backgroundColor: dropdownBg, borderColor: dropdownBorder }]}>
                <View style={[styles.dropdownHeader, { borderBottomColor: dropdownBorder }]}>
                  <View style={styles.headerTitleRow}>
                    <View style={[styles.circle, { backgroundColor: accentColor }]} />
                    <Text style={[styles.headerAddress, { color: itemColor }]}>{truncateAddress(walletAddress)}</Text>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={copy.copyWalletAddress}
                    onPress={onCopy}
                    style={styles.copyBtn}
                  >
                    <Text style={{ color: '#9ca3af', fontSize: 12 }}>{copied ? '✅' : `📋 ${copy.copy}`}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.dropdownBody}>
                  {recoveryLocked && <Text style={styles.lockNotice}>{copy.lockedNoticeShort}</Text>}
                  {onRecovery && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={recoveryLocked ? copy.setUpRecovery : copy.walletRecovery}
                      style={styles.menuItem}
                      onPress={onRecovery}
                    >
                      <Text style={[styles.menuItemText, { color: recoveryLocked ? '#b45309' : itemColor }]}>
                        {recoveryLocked ? copy.setUpRecovery : copy.walletRecovery}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={copy.walletBalance}
                    style={styles.menuItem}
                    onPress={onWalletBalance}
                  >
                    <Text style={[styles.menuItemText, { color: itemColor }]}>💰 {copy.walletBalance}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={copy.txHistory}
                    style={styles.menuItem}
                    onPress={onTxHistory}
                  >
                    <Text style={[styles.menuItemText, { color: itemColor }]}>⏱️ {copy.txHistory}</Text>
                  </TouchableOpacity>

                  <View style={[styles.divider, { backgroundColor: dropdownBorder }]} />

                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={copy.disconnectWallet}
                    style={[styles.menuItem, { marginTop: 4 }]}
                    onPress={onLogout}
                  >
                    <Text style={[styles.menuItemText, { color: '#ef4444' }]}>🚪 {copy.disconnect}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, paddingVertical: 4 },
  check: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  box: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5 },
  lockNotice: { color: '#b45309', fontSize: 12, paddingHorizontal: 12, paddingVertical: 8 },
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    elevation: 2,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  walletBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
  },
  circle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  walletBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdown: {
    width: 250,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    padding: 16,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAddress: {
    fontSize: 14,
    fontWeight: '600',
  },
  copyBtn: {
    minHeight: 44,
    justifyContent: 'center',
    padding: 4,
  },
  dropdownBody: {},
  menuItem: {
    minHeight: 44,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: 4,
  },
});
