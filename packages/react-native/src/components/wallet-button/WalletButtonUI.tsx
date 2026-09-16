import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TouchableWithoutFeedback } from 'react-native';

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
  onLogout: () => void;
  onLogin: () => void;
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
  onLogout,
  onLogin,
}: WalletButtonTemplateProps) {
  if (!walletAddress) {
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Login with Pollar"
        style={[styles.loginBtn, { backgroundColor: accentColor }]}
        onPress={onLogin}
      >
        <Text style={styles.loginBtnText}>Login with Pollar</Text>
      </TouchableOpacity>
    );
  }

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Open connected wallet"
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
                    accessibilityLabel="Copy wallet address"
                    onPress={onCopy}
                    style={styles.copyBtn}
                  >
                    <Text style={{ color: '#9ca3af', fontSize: 12 }}>{copied ? '✅' : '📋 Copy'}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.dropdownBody}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Wallet balance"
                    style={styles.menuItem}
                    onPress={onWalletBalance}
                  >
                    <Text style={[styles.menuItemText, { color: itemColor }]}>💰 Wallet Balance</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Transaction history"
                    style={styles.menuItem}
                    onPress={onTxHistory}
                  >
                    <Text style={[styles.menuItemText, { color: itemColor }]}>⏱️ Transaction History</Text>
                  </TouchableOpacity>

                  <View style={[styles.divider, { backgroundColor: dropdownBorder }]} />

                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Disconnect wallet"
                    style={[styles.menuItem, { marginTop: 4 }]}
                    onPress={onLogout}
                  >
                    <Text style={[styles.menuItemText, { color: '#ef4444' }]}>🚪 Disconnect</Text>
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
