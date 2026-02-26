import { pollarApiClient } from '../api/client';
import {
  LoginOptions,
  PollarError,
  PollarLogin,
  PollarStateEntry,
  STATE_VAR_CODES,
  StateLoginCodes,
  StateVar,
  StateVarCodes,
} from '../types';
import { AlbedoAdapter, FreighterAdapter, WalletType } from '../wallets';
import { isValidSession } from './session';
import { streamUntilFound } from './stream';

export type LoginDeps = {
  basePath: string;
  apiKey: string;
  clientId: string;
  emitState: (state: StateVar, code: StateVarCodes, level: PollarStateEntry['level'], data?: unknown) => void;
  storeSession: (session: PollarLogin) => void;
  clearSession: () => void;
};

const emitResponse = (
  response: { data?: any; error?: any },
  successCode: StateLoginCodes,
  errorCode: StateLoginCodes,
  emitLog: (state: StateVar, code: StateLoginCodes, level: PollarStateEntry['level'], data?: unknown) => void,
) => {
  const isSuccess = !!response.data && !response.error;
  emitLog(
    StateVar.LOGIN,
    isSuccess ? successCode : errorCode,
    isSuccess ? 'info' : 'error',
    isSuccess ? response.data : response.error,
  );
  return isSuccess;
};

export async function login(options: LoginOptions, deps: LoginDeps): Promise<void> {
  const { basePath, apiKey, clientId, emitState, storeSession, clearSession } = deps;

  emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].CREATE_SESSION_START, 'info');
  const createSessionResponse = await pollarApiClient.POST('/auth/session');

  if (
    !emitResponse(
      createSessionResponse,
      STATE_VAR_CODES[StateVar.LOGIN].CREATE_SESSION_SUCCESS,
      STATE_VAR_CODES[StateVar.LOGIN].CREATE_SESSION_ERROR,
      emitState,
    )
  ) {
    return;
  }

  const clientSessionId = createSessionResponse.data!.content.clientSessionId;

  switch (options.provider) {
    case 'email': {
      emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].EMAIL_AUTH_START, 'info', { email: options.email });
      const emailRes = await pollarApiClient.POST(`/auth/email`, {
        body: { clientSessionId, email: options.email },
      });

      if (
        !emitResponse(
          emailRes,
          STATE_VAR_CODES[StateVar.LOGIN].EMAIL_AUTH_SUCCESS,
          STATE_VAR_CODES[StateVar.LOGIN].EMAIL_AUTH_ERROR,
          emitState,
        )
      ) {
        return;
      }

      break;
    }
    case 'google':
    case 'github': {
      const url = new URL(`${basePath}/auth/${options.provider}`);
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('client_session_id', clientId);
      url.searchParams.set('redirect_uri', window.location.origin);
      window.open(url.toString(), '_blank');
      break;
    }
    case 'wallet': {
      const adapter = options.type === WalletType.FREIGHTER ? new FreighterAdapter() : new AlbedoAdapter();

      const available = await adapter.isAvailable();
      if (!available) {
        throw new PollarError(options.type === WalletType.FREIGHTER ? 'FREIGHTER_NOT_INSTALLED' : 'WALLET_NOT_AVAILABLE');
      }

      const { publicKey } = await adapter.connect();
    }
  }

  emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].STREAM_POLL_START, 'info', { clientSessionId });
  await streamUntilFound(clientSessionId, (data) => {
    if (data['status'] === 'ready') {
      emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].STREAM_POLL_READY, 'info');
      return true;
    }
    emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].STREAM_POLL_EVENT, 'info', data);
    return false;
  });

  emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].FETCH_SESSION_START, 'info');
  const { data, error } = await pollarApiClient.POST(`/auth/login`, {
    body: { clientSessionId },
  });

  if (isValidSession(data?.content)) {
    storeSession(data.content);
    emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].FETCH_SESSION_SUCCESS, 'info');
  } else {
    clearSession();
    emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].FETCH_SESSION_ERROR, 'error', error);
  }
}
