import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TouchableWithoutFeedback } from 'react-native';

interface WalletButtonTemplateProps {
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
            <TouchableOpacity style={[styles.loginBtn, { backgroundColor: accentColor }]} onPress={onLogin}>
                <Text style={styles.loginBtnText}>Connect Wallet</Text>
            </TouchableOpacity>
        );
    }

    const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    return (
        <View style={styles.container}>
            <TouchableOpacity style={[styles.walletBtn, { backgroundColor: dropdownBg, borderColor: dropdownBorder }]} onPress={onToggleOpen}>
                <View style={[styles.circle, { backgroundColor: accentColor }]} />
                <Text style={[styles.walletBtnText, { color: itemColor }]}>{truncateAddress(walletAddress)}</Text>
            </TouchableOpacity>

            <Modal visible={open} transparent animationType="fade">
                <TouchableWithoutFeedback onPress={onClose}>
                    <View style={styles.overlay}>
                        <TouchableWithoutFeedback>
                            <View style={[styles.dropdown, { backgroundColor: dropdownBg, borderColor: dropdownBorder }]}>

                                <View style={[styles.dropdownHeader, { borderBottomColor: dropdownBorder }]}>
                                    <View style={styles.headerTitleRow}>
                                        <View style={[styles.circle, { backgroundColor: accentColor }]} />
                                        <Text style={[styles.headerAddress, { color: itemColor }]}>{truncateAddress(walletAddress)}</Text>
                                    </View>
                                    <TouchableOpacity onPress={onCopy} style={styles.copyBtn}>
                                        <Text style={{ color: '#9ca3af', fontSize: 12 }}>{copied ? '✅' : '📋 Copy'}</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.dropdownBody}>
                                    <TouchableOpacity style={styles.menuItem} onPress={onWalletBalance}>
                                        <Text style={[styles.menuItemText, { color: itemColor }]}>💰 Wallet Balance</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.menuItem} onPress={onTxHistory}>
                                        <Text style={[styles.menuItemText, { color: itemColor }]}>⏱️ Transaction History</Text>
                                    </TouchableOpacity>

                                    <View style={[styles.divider, { backgroundColor: dropdownBorder }]} />

                                    <TouchableOpacity style={[styles.menuItem, { marginTop: 4 }]} onPress={onLogout}>
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
        ...StyleSheet.absoluteFillObject,
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
        padding: 4,
    },
    dropdownBody: {

    },
    menuItem: {
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
