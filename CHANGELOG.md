# Changelog

## 0.4.4
- Fix OAuth popup blocked on Safari/Brave iOS: `window.open` is now called before any `await` to preserve the user gesture context

## 0.4.3
- Authentication via Google, GitHub, Email OTP, Stellar wallets
- PollarClient with transaction building and submission
- StellarClient for Horizon queries
- React provider, hook, and WalletButton component
- Typed event system for state management

## 0.3.x
- Initial SDK structure and Pollar API integration
- Basic authentication flows

## 0.2.x  
- Monorepo setup with Turborepo
- Core package scaffolding
