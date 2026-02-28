import React from 'react';
import { LOGO_POLLAR } from '../constants';

declare const __POLLAR_VERSION__: string;

export const PollarModalFooter = () => {
  return (
    <div className="pollar-footer">
      <span className="pollar-footer-protected">Protected by</span>
      <div className="pollar-footer-brand">
        <img src={LOGO_POLLAR} alt="Pollar" className="pollar-footer-logo" />
        <span className="pollar-footer-name">Pollar</span>
        <span className="pollar-footer-version">v{__POLLAR_VERSION__}</span>
      </div>
    </div>
  );
};
