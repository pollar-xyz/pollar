import React, { Component, ReactNode } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TouchableWithoutFeedback } from 'react-native';
import { LOGO_POLLAR } from '../constants';

declare const __POLLAR_VERSION__: string;

type StateStatus = 'NONE' | 'LOADING' | 'SUCCESS' | 'ERROR';

interface ModalErrorBoundaryState {
    crashed: boolean;
}

export class ModalErrorBoundary extends Component<{ children: ReactNode; onClose: () => void }, ModalErrorBoundaryState> {
    state: ModalErrorBoundaryState = { crashed: false };

    static getDerivedStateFromError(): ModalErrorBoundaryState {
        return { crashed: true };
    }

    componentDidCatch(error: unknown) {
        console.error('[Pollar] Modal crashed:', error);
    }

    render() {
        if (this.state.crashed) {
            this.props.onClose();
            return null;
        }
        return <>{this.props.children}</>;
    }
}

export const PollarModalFooter = () => {
    return (
        <View style={styles.footerContainer}>
            <Text style={styles.protectedText}>Protected by</Text>
            <View style={styles.brandRow}>
                <Image style={styles.footerLogo} source={{ uri: LOGO_POLLAR }} />
                <Text style={styles.brandName}>Pollar</Text>
                <Text style={styles.versionText}>v{typeof __POLLAR_VERSION__ !== 'undefined' ? __POLLAR_VERSION__ : '0.0.0'}</Text>
            </View>
        </View>
    );
};

export function PollarOverlay({ children, onCancel }: { children: ReactNode; onCancel: () => void }) {
    return (
        <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
            <View style={StyleSheet.absoluteFillObject}>
                <TouchableWithoutFeedback onPress={onCancel}>
                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                        <TouchableWithoutFeedback>
                            {children}
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </View>
        </Modal>
    );
}

interface ModalStatusBannerProps {
    message: string;
    status: StateStatus;
    onCancel?: (() => void) | undefined;
    onRetry?: (() => void) | undefined;
}

export function ModalStatusBanner({ message, status, onCancel, onRetry }: ModalStatusBannerProps) {
    if (!message && status === 'NONE') {
        return <View style={styles.statusEmptyContainer} />;
    }

    const isLoading = status === 'LOADING';

    return (
        <View style={[styles.statusContainer, status === 'ERROR' && styles.statusError, status === 'SUCCESS' && styles.statusSuccess]}>
            <View style={styles.statusMessageRow}>
                {isLoading && <ActivityIndicator size="small" color="#005DB4" style={{ marginRight: 8 }} />}
                {status === 'ERROR' && <Text style={{ color: '#ef4444', marginRight: 8 }}>⚠️</Text>}
                {status === 'SUCCESS' && <Text style={{ color: '#10b981', marginRight: 8 }}>✅</Text>}
                <Text style={[styles.statusText, status === 'ERROR' && { color: '#ef4444' }, status === 'SUCCESS' && { color: '#10b981' }, status === 'LOADING' && { color: '#005DB4' }]}>
                    {message}
                </Text>
            </View>
            <View style={styles.statusActions}>
                {isLoading && onCancel && (
                    <TouchableOpacity onPress={onCancel} style={styles.statusButton}>
                        <Text style={styles.statusButtonText}>Cancel</Text>
                    </TouchableOpacity>
                )}
                {status === 'ERROR' && onRetry && (
                    <TouchableOpacity onPress={onRetry} style={styles.statusButton}>
                        <Text style={styles.statusButtonText}>Retry</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    footerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 24,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        marginTop: 16,
    },
    protectedText: {
        fontSize: 14,
        color: '#6b7280',
        marginRight: 8,
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    footerLogo: {
        width: 18,
        height: 18,
        marginRight: 6,
    },
    brandName: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111827',
        marginRight: 6,
    },
    versionText: {
        fontSize: 11,
        color: '#9ca3af',
    },
    statusEmptyContainer: {
        minHeight: 40,
        marginTop: 8,
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 14,
        minHeight: 40,
        marginTop: 8,
    },
    statusError: {
        backgroundColor: '#fef2f2',
        borderRadius: 8,
    },
    statusSuccess: {
        backgroundColor: '#f0fdf4',
        borderRadius: 8,
    },
    statusMessageRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusText: {
        fontSize: 13,
        fontWeight: '500',
    },
    statusActions: {
        flexDirection: 'row',
    },
    statusButton: {
        marginLeft: 8,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 4,
    },
    statusButtonText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#4b5563',
    },
});
