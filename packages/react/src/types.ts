import { pollarPaths } from '@pollar/core';

type ConfigResponse = pollarPaths['/applications/config']['get']['responses'][200]['content']['application/json'];
export type PollarConfig = ConfigResponse['content'];

export type PollarStyles = PollarConfig['styles'];

export interface LoginButtonProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  className?: string;
  children?: React.ReactNode;
}

export interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}
