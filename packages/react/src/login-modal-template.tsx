'use client';

interface LoginModalTemplateProps {
  theme: 'light' | 'dark';
  accentColor: string;
  logoBase64: string | null;
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
  // Interactive props (optional — omit for static preview)
  email?: string;
  loading?: boolean;
  error?: string | null;
  onEmailChange?: (email: string) => void;
  onEmailSubmit?: () => void;
  onSocialLogin?: (provider: string) => void;
  onFreighterConnect?: () => void;
  onAlbedoConnect?: () => void;
}

export function LoginModalTemplate({
  theme,
  accentColor,
  logoBase64,
  emailEnabled,
  embeddedWallets,
  providers,
  appName,
  email = '',
  loading = false,
  error,
  onEmailChange,
  onEmailSubmit,
  onSocialLogin,
  onFreighterConnect,
  onAlbedoConnect,
}: LoginModalTemplateProps) {
  const isDark = theme === 'dark';
  const bg = isDark ? '#1a1a1a' : '#FFFFFF';
  const border = isDark ? '#374151' : '#E5E7EB';
  const textPrimary = isDark ? '#FFFFFF' : '#111827';
  const textMuted = isDark ? '#9CA3AF' : '#6B7280';
  const socialBg = isDark ? '#374151' : '#FFFFFF';

  const enabledSocial = Object.entries(providers).filter(([, enabled]) => enabled);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 460,
        borderRadius: 16,
        border: `1px solid ${border}`,
        padding: 32,
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        backgroundColor: bg,
        transition: 'all 0.3s',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
          <img
            src={logoBase64 ?? 'https://pollar.xyz/logo_polo.png'}
            alt="Logo"
            style={{ height: 64, width: 64, objectFit: 'contain', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}
          />
        </div>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 30, fontWeight: 700, color: textPrimary }}>
          {appName}
        </h2>
        <p style={{ margin: 0, fontSize: 16, color: textMuted }}>Log in or sign up</p>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 8,
            backgroundColor: isDark ? '#2a1515' : '#fef2f2',
            border: `1px solid ${isDark ? '#7f1d1d' : '#fecaca'}`,
            color: isDark ? '#f87171' : '#dc2626',
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          {error}
        </div>
      )}

      {/* Email */}
      {emailEnabled && (
        <div style={{ marginBottom: 16 }}>
          <input
            type="email"
            placeholder="you@email.com"
            value={email}
            disabled={loading}
            onChange={(e) => onEmailChange?.(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onEmailSubmit?.()}
            style={{
              width: '100%',
              borderRadius: 8,
              border: '1px solid #D1D5DB',
              backgroundColor: isDark ? '#374151' : '#FFFFFF',
              padding: '14px 16px',
              fontSize: 16,
              color: textPrimary,
              outline: 'none',
              boxSizing: 'border-box',
              opacity: loading ? 0.5 : 1,
            }}
          />
          <button
            type="button"
            disabled={loading || !email}
            onClick={onEmailSubmit}
            style={{
              display: 'block',
              marginTop: 12,
              width: '100%',
              borderRadius: 8,
              padding: '14px 0',
              fontSize: 16,
              fontWeight: 700,
              color: '#FFFFFF',
              backgroundColor: accentColor,
              border: 'none',
              cursor: loading || !email ? 'not-allowed' : 'pointer',
              opacity: loading || !email ? 0.5 : 1,
              boxSizing: 'border-box',
            }}
          >
            Submit
          </button>
        </div>
      )}

      {/* Divider */}
      {emailEnabled && enabledSocial.length > 0 && (
        <div style={{ position: 'relative', margin: '20px 0' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '100%', borderTop: `1px solid ${border}` }} />
          </div>
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', fontSize: 14 }}>
            <span style={{ padding: '0 16px', fontWeight: 500, color: textMuted, backgroundColor: bg }}>
              or continue with
            </span>
          </div>
        </div>
      )}

      {/* Social providers */}
      {enabledSocial.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {enabledSocial.map(([key]) => (
            <button
              key={key}
              type="button"
              disabled={loading}
              onClick={() => onSocialLogin?.(key)}
              style={{
                display: 'flex',
                width: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                borderRadius: 8,
                border: `1px solid ${border}`,
                backgroundColor: socialBg,
                padding: '14px 16px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
                boxSizing: 'border-box',
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 600, color: textPrimary }}>{key}</span>
            </button>
          ))}
        </div>
      )}

      {/* Embedded wallets */}
      {embeddedWallets && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 500,
              textAlign: 'center',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: textMuted,
            }}
          >
            Continue with a wallet
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={onFreighterConnect}
            style={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              borderRadius: 8,
              border: `2px solid ${accentColor}`,
              backgroundColor: `${accentColor}10`,
              color: accentColor,
              padding: '14px 16px',
              fontSize: 16,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              boxSizing: 'border-box',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden>
              <circle cx="16" cy="16" r="16" fill="#5E4AE3" />
              <path d="M10 16l4-6h8l-4 6 4 6h-8l-4-6z" fill="white" />
            </svg>
            Freighter
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onAlbedoConnect}
            style={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              borderRadius: 8,
              border: `2px solid ${accentColor}`,
              backgroundColor: `${accentColor}10`,
              color: accentColor,
              padding: '14px 16px',
              fontSize: 16,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              boxSizing: 'border-box',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden>
              <circle cx="16" cy="16" r="16" fill="#F5A623" />
              <circle cx="16" cy="16" r="7" fill="white" />
              <circle cx="16" cy="16" r="3" fill="#F5A623" />
            </svg>
            Albedo
          </button>
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderTop: `1px solid ${border}`,
          paddingTop: 24,
        }}
      >
        <span style={{ fontSize: 14, color: textMuted }}>Protected by</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="https://pollar.xyz/logo_polo.png" alt="Pollar" style={{ width: 18, height: 18 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>Pollar</span>
        </div>
      </div>
    </div>
  );
}