// https://brand.github.com/foundations/logo
import './GithubButton.css';
import { LOGO_GITHUB } from '../../constants';

export const GithubButton = ({ disabled, onClick }: { disabled: boolean; onClick: () => void }) => {
  return (
    <button className="github-button" disabled={disabled} onClick={onClick}>
      <img src={LOGO_GITHUB} alt="GitHub" className="github-button-icon" />
      <span className="github-button-contents">Continue with GitHub</span>
    </button>
  );
};
