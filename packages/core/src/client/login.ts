import { PollarApiClient } from '../api/client';
import {
  LoginOptions,
  PollarLoginState,
  PollarStateEntry,
  STATE_VAR_CODES,
  StateLoginCodes,
  StateStatus,
  StateVar,
} from '../types';
import { AlbedoAdapter, FreighterAdapter, WalletType } from '../wallets';
import { isValidSession } from './session';
import { streamUntilFound } from './stream';

function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }),
  ]);
}

export type LoginDeps = {
  api: PollarApiClient;
  basePath: string;
  apiKey: string;
  signal: AbortSignal;
  emitState: (
    state: PollarStateEntry['var'],
    code: PollarStateEntry['code'],
    level: PollarStateEntry['level'],
    status: PollarStateEntry['status'],
    data?: PollarStateEntry['data'],
  ) => void;
  storeSession: (session: PollarLoginState) => void;
  clearSession: () => void;
};

const emitResponse = (
  response: { data?: any; error?: any },
  successCode: StateLoginCodes,
  errorCode: StateLoginCodes,
  emitLog: (
    state: StateVar,
    code: StateLoginCodes,
    level: PollarStateEntry['level'],
    status: PollarStateEntry['status'],
    data?: unknown,
  ) => void,
) => {
  const isSuccess = !!response.data && !response.error;
  emitLog(
    StateVar.LOGIN,
    isSuccess ? successCode : errorCode,
    isSuccess ? 'info' : 'error',
    isSuccess ? StateStatus.LOADING : StateStatus.ERROR,
    isSuccess ? response.data : response.error,
  );
  return isSuccess;
};

export async function login(options: LoginOptions, deps: LoginDeps): Promise<void> {
  const { api, basePath, apiKey, signal, emitState, storeSession, clearSession } = deps;

  emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].CREATE_SESSION_START, 'info', StateStatus.LOADING);
  const createSessionResponse = await api.POST('/auth/session', { signal });

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
      emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].EMAIL_AUTH_START, 'info', StateStatus.LOADING, {
        email: options.email,
      });
      const emailRes = await api.POST(`/auth/email`, {
        body: { clientSessionId, email: options.email },
        signal,
      });

      if (
        !emitResponse(
          emailRes,
          STATE_VAR_CODES[StateVar.LOGIN].EMAIL_AUTH_START_SUCCESS,
          STATE_VAR_CODES[StateVar.LOGIN].EMAIL_AUTH_START_ERROR,
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
      url.searchParams.set('client_session_id', clientSessionId);
      url.searchParams.set('redirect_uri', window.location.origin);
      window.open(url.toString(), '_blank');
      break;
    }
    case 'wallet': {
      try {
        emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].WALLET_AUTH_START, 'info', StateStatus.LOADING, {
          adapter: options.type,
        });
        const adapter = options.type === WalletType.FREIGHTER ? new FreighterAdapter() : new AlbedoAdapter();

        const available = await withSignal(adapter.isAvailable(), signal);
        if (!available) {
          emitState(
            StateVar.LOGIN,
            options.type === WalletType.FREIGHTER
              ? STATE_VAR_CODES[StateVar.LOGIN].WALLET_AUTH_FREIGHTER_NOT_INSTALLED
              : STATE_VAR_CODES[StateVar.LOGIN].WALLET_AUTH_ALBEDO_NOT_INSTALLED,
            'info',
            StateStatus.LOADING,
            {
              type: options.type,
            },
          );
        }

        const { publicKey } = await withSignal(adapter.connect(), signal);
        emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].WALLET_AUTH_CONNECTED, 'info', StateStatus.LOADING, {
          adapter: options.type,
          publicKey,
        });
        emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].WALLET_AUTH_LOGIN_START, 'info', StateStatus.LOADING, {
          adapter: options.type,
          publicKey,
        });
        const emailRes = await api.POST(`/auth/wallet`, {
          body: { clientSessionId, walletAddress: publicKey },
          signal,
        });

        if (
          !emitResponse(
            emailRes,
            STATE_VAR_CODES[StateVar.LOGIN].WALLET_AUTH_LOGIN_START_SUCCESS,
            STATE_VAR_CODES[StateVar.LOGIN].WALLET_AUTH_LOGIN_START_ERROR,
            emitState,
          )
        ) {
          return;
        }
      } catch (error) {
        emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].WALLET_AUTH_ERROR, 'error', StateStatus.ERROR, {
          clientSessionId,
        });
      }
      break;
    }
  }

  emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].STREAM_POLL_START, 'info', StateStatus.LOADING, {
    clientSessionId,
  });
  await streamUntilFound(
    api,
    clientSessionId,
    (data) => {
      if (data['status'] === 'READY') {
        emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].STREAM_POLL_READY, 'info', StateStatus.LOADING);
        return true;
      }
      emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].STREAM_POLL_EVENT, 'info', StateStatus.LOADING, data);
      return false;
    },
    200,
    signal,
  );

  emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].FETCH_SESSION_START, 'info', StateStatus.LOADING);
  const { data, error } = await api.POST(`/auth/login`, {
    body: { clientSessionId },
    signal,
  });

  if (isValidSession(data?.content)) {
    emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].FETCH_SESSION_SUCCESS, 'info', StateStatus.SUCCESS);
    storeSession(data.content);
  } else {
    emitState(StateVar.LOGIN, STATE_VAR_CODES[StateVar.LOGIN].FETCH_SESSION_ERROR, 'error', StateStatus.ERROR, { error, data });
    clearSession();
  }
}
