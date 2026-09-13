import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { AUTH_ERROR_CODES, AuthState } from '@pollar/core';
import { LOGO_ALBEDO, LOGO_FREIGHTER, LOGO_POLLAR } from '../../constants';
import { ModalStatusBanner, PollarModalFooter, PollarOverlay } from '../commons';

type StateStatus = 'NONE' | 'LOADING' | 'SUCCESS' | 'ERROR';

const AUTH_STATE_MESSAGES: Record<AuthState['step'], string> = {
    idle: '',
    creating_session: 'Initializing…',
    entering_email: '',
    sending_email: 'Sending…',
    entering_code: 'Code sent — check your inbox',
    verifying_email_code: 'Verifying…',
    opening_oauth: 'Redirecting…',
    connecting_wallet: 'Connecting wallet…',
    wallet_not_installed: 'Wallet not installed',
    authenticating_wallet: 'Signing in with wallet…',
    authenticating: 'Authenticating…',
    authenticated: 'Welcome!',
    error: '',
};

function authStateToStatus(step: AuthState['step']): StateStatus {
    const loading: AuthState['step'][] = [
        'creating_session',
        'sending_email',
        'verifying_email_code',
        'opening_oauth',
        'connecting_wallet',
        'authenticating_wallet',
        'authenticating',
    ];
    const success: AuthState['step'][] = ['authenticated', 'entering_code'];
    const error: AuthState['step'][] = ['error', 'wallet_not_installed'];

    if (loading.includes(step)) return 'LOADING';
    if (success.includes(step)) return 'SUCCESS';
    if (error.includes(step)) return 'ERROR';
    return 'NONE';
}

export interface LoginModalTemplateProps {
    theme: string;
    accentColor: string;
    logoUrl: string | null;
    emailEnabled: boolean;
    embeddedWallets: boolean;
    providers: {
        google: boolean;
        discord: boolean;
        x: boolean;
        github: boolean;
        apple: boolean;
    };
    appName: string;
    email?: string;
    onEmailChange?: (email: string) => void;
    onEmailSubmit?: () => void;
    onSocialLogin?: (provider: 'google' | 'github') => void;
    onFreighterConnect?: () => void;
    onAlbedoConnect?: () => void;
    authState: AuthState;
    codeInputKey?: number;
    onCodeSubmit?: (code: string) => void;
    onBack: () => void;
    onCancel: () => void;
    onRetry: () => void;
}

export function LoginModalTemplate({
    theme,
    accentColor,
    logoUrl,
    emailEnabled,
    embeddedWallets,
    providers,
    appName,
    email = '',
    onEmailChange,
    onEmailSubmit,
    onSocialLogin,
    onFreighterConnect,
    onAlbedoConnect,
    authState,
    codeInputKey,
    onCodeSubmit,
    onBack,
    onCancel,
    onRetry,
}: LoginModalTemplateProps) {
    const [showWalletPicker, setShowWalletPicker] = useState(false);
    const [code, setCode] = useState('');

    const isDark = theme === 'dark';
    const enabledSocial = Object.entries(providers).filter(([, enabled]) => enabled);

    const colors = {
        bg: isDark ? '#1a1a1a' : '#ffffff',
        border: isDark ? '#374151' : '#e5e7eb',
        text: isDark ? '#ffffff' : '#111827',
        muted: isDark ? '#9ca3af' : '#6b7280',
        inputBg: isDark ? '#374151' : '#f9fafb',
    };

    const status = authStateToStatus(authState.step);
    const isLoading = status === 'LOADING';
    const isEmailCodeError =
        authState.step === 'error' &&
        (authState.errorCode === AUTH_ERROR_CODES.EMAIL_CODE_EXPIRED ||
            authState.errorCode === AUTH_ERROR_CODES.EMAIL_CODE_INVALID);
    const awaitingEmailCode =
        authState.step === 'entering_code' || authState.step === 'verifying_email_code' || isEmailCodeError;
    const statusMessage =
        authState.step === 'error' ? authState.message : AUTH_STATE_MESSAGES[authState.step];

    const BackButton = ({ onClick }: { onClick: () => void }) => (
        <TouchableOpacity style={[styles.iconButton, styles.backBtn, { borderColor: colors.border }]} onPress={onClick}>
            <Text style={{ color: colors.muted, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
    );

    return (
        <PollarOverlay onCancel={onCancel}>
            <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <TouchableOpacity style={[styles.iconButton, styles.closeBtn, { borderColor: colors.border }]} onPress={onCancel}>
                    <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
                </TouchableOpacity>

                <View style={styles.header}>
                    <View style={styles.logoWrap}>
                        <Image source={{ uri: logoUrl ?? LOGO_POLLAR }} style={styles.logo} />
                    </View>
                    <Text style={[styles.title, { color: colors.text }]}>{appName}</Text>
                    <Text style={[styles.subtitle, { color: colors.muted }]}>Log in or sign up</Text>
                </View>

                {awaitingEmailCode ? (
                    <View style={{ width: '100%' }}>
                        <BackButton onClick={onBack} />
                        <TextInput
                            key={codeInputKey}
                            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                            placeholder="Enter verification code"
                            placeholderTextColor={colors.muted}
                            value={code}
                            onChangeText={setCode}
                            keyboardType="number-pad"
                            maxLength={6}
                        />
                        <TouchableOpacity
                            style={[styles.primaryBtn, { backgroundColor: accentColor, opacity: !code ? 0.5 : 1 }]}
                            onPress={() => onCodeSubmit && onCodeSubmit(code)}
                            disabled={!code || isLoading}
                        >
                            <Text style={styles.primaryBtnText}>Verify Code</Text>
                        </TouchableOpacity>
                    </View>
                ) : showWalletPicker ? (
                    <View style={{ width: '100%' }}>
                        <BackButton onClick={() => setShowWalletPicker(false)} />
                        <View style={styles.walletList}>
                            <TouchableOpacity style={[styles.walletBtn, { borderColor: colors.border }]} onPress={onFreighterConnect} disabled={isLoading}>
                                <Image source={{ uri: LOGO_FREIGHTER }} style={styles.walletIcon} />
                                <Text style={[styles.walletName, { color: colors.text }]}>Freighter</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.walletBtn, { borderColor: colors.border }]} onPress={onAlbedoConnect} disabled={isLoading}>
                                <Text style={[styles.walletName, { color: colors.text }]}>Albedo</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View style={{ width: '100%' }}>
                        {emailEnabled && (
                            <View style={styles.emailSection}>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                                    placeholder="you@email.com"
                                    placeholderTextColor={colors.muted}
                                    value={email}
                                    editable={!isLoading}
                                    onChangeText={onEmailChange}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                />
                                <TouchableOpacity
                                    style={[styles.primaryBtn, { backgroundColor: accentColor, opacity: (!email || isLoading) ? 0.5 : 1 }]}
                                    disabled={isLoading || !email}
                                    onPress={onEmailSubmit}
                                >
                                    <Text style={styles.primaryBtnText}>Submit</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {emailEnabled && enabledSocial.length > 0 && (
                            <View style={styles.divider}>
                                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                                <Text style={[styles.dividerText, { color: colors.muted, backgroundColor: colors.bg }]}>or continue with</Text>
                                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                            </View>
                        )}

                        {enabledSocial.length > 0 && (
                            <View style={styles.socialList}>
                                {enabledSocial.some(([key]) => key === 'google') && (
                                    <TouchableOpacity style={[styles.socialBtn, { borderColor: colors.border }]} onPress={() => onSocialLogin && onSocialLogin('google')} disabled={isLoading}>
                                        <Text style={[styles.socialBtnText, { color: colors.text }]}>Google</Text>
                                    </TouchableOpacity>
                                )}
                                {enabledSocial.some(([key]) => key === 'github') && (
                                    <TouchableOpacity style={[styles.socialBtn, { borderColor: colors.border }]} onPress={() => onSocialLogin && onSocialLogin('github')} disabled={isLoading}>
                                        <Text style={[styles.socialBtnText, { color: colors.text }]}>GitHub</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        {embeddedWallets && (
                            <View style={styles.walletSection}>
                                <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={() => setShowWalletPicker(true)} disabled={isLoading}>
                                    <Text style={[styles.secondaryBtnText, { color: colors.muted }]}>Wallet</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}

                <ModalStatusBanner
                    message={statusMessage}
                    status={status}
                    onCancel={onCancel}
                    onRetry={isEmailCodeError ? undefined : onRetry}
                />

                <PollarModalFooter />
            </View>
        </PollarOverlay>
    );
}

const styles = StyleSheet.create({
    card: {
        width: '100%',
        borderRadius: 16,
        borderWidth: 1,
        padding: 24,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 25,
        shadowOffset: { width: 0, height: 10 },
        elevation: 10,
        alignItems: 'center',
    },
    iconButton: {
        position: 'absolute',
        width: 32,
        height: 32,
        borderRadius: 6,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    closeBtn: {
        top: 16,
        right: 16,
    },
    backBtn: {
        top: -70,
        left: -10,
    },
    header: {
        alignItems: 'center',
        marginBottom: 20,
        marginTop: 10,
    },
    logoWrap: {
        marginBottom: 12,
    },
    logo: {
        width: 48,
        height: 48,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
    },
    emailSection: {
        width: '100%',
    },
    input: {
        width: '100%',
        height: 44,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 16,
        fontSize: 16,
        marginBottom: 12,
    },
    primaryBtn: {
        width: '100%',
        height: 44,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    primaryBtnText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
    },
    dividerLine: {
        flex: 1,
        height: 1,
    },
    dividerText: {
        paddingHorizontal: 10,
        fontSize: 12,
    },
    socialList: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 16,
    },
    socialBtn: {
        flex: 1,
        height: 44,
        borderWidth: 1,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    socialBtnText: {
        fontSize: 14,
        fontWeight: '600',
    },
    walletSection: {
        width: '100%',
        marginTop: 8,
    },
    secondaryBtn: {
        width: '100%',
        height: 44,
        borderWidth: 1,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    secondaryBtnText: {
        fontSize: 15,
        fontWeight: '600',
    },
    walletList: {
        width: '100%',
        gap: 12,
    },
    walletBtn: {
        width: '100%',
        flexDirection: 'row',
        height: 50,
        borderWidth: 1,
        borderRadius: 8,
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    walletIcon: {
        width: 24,
        height: 24,
        marginRight: 12,
    },
    walletName: {
        fontSize: 16,
        fontWeight: '600',
    },
});
