import { PollarApiClient } from '../api/client';
import { PollarStateVar, STATE_VAR_CODES, StateStatus } from '../constants';
import { PollarApplicationConfigContent, PollarLoginOptions, PollarStateEntry } from '../types';
import { AlbedoAdapter, FreighterAdapter, WalletType } from '../wallets';
import { emitResponse } from './helpers';
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
  storeSession: (session: PollarApplicationConfigContent) => void;
  clearSession: () => void;
};

export async function login(options: PollarLoginOptions, deps: LoginDeps): Promise<void> {
  const { api, basePath, apiKey, signal, emitState, storeSession, clearSession } = deps;

  emitState('authentication', STATE_VAR_CODES.authentication.CREATE_SESSION_START, 'info', StateStatus.LOADING);
  const createSessionResponse = await api.POST('/auth/session', { signal });

  if (
    !emitResponse(
      PollarStateVar.AUTHENTICATION,
      createSessionResponse,
      { code: STATE_VAR_CODES.authentication.CREATE_SESSION_SUCCESS },
      STATE_VAR_CODES.authentication.CREATE_SESSION_ERROR,
      emitState,
    )
  ) {
    return;
  }

  const clientSessionId = createSessionResponse.data!.content.clientSessionId;

  switch (options.provider) {
    case 'email': {
      emitState('authentication', STATE_VAR_CODES.authentication.EMAIL_AUTH_START, 'info', StateStatus.LOADING, {
        email: options.email,
      });
      const emailRes = await api.POST(`/auth/email`, {
        body: { clientSessionId, email: options.email },
        signal,
      });

      if (
        !emitResponse(
          PollarStateVar.AUTHENTICATION,
          emailRes,
          { code: STATE_VAR_CODES.authentication.EMAIL_AUTH_START_SUCCESS },
          STATE_VAR_CODES.authentication.EMAIL_AUTH_START_ERROR,
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
        emitState('authentication', STATE_VAR_CODES.authentication.WALLET_AUTH_START, 'info', StateStatus.LOADING, {
          adapter: options.type,
        });
        const adapter = options.type === WalletType.FREIGHTER ? new FreighterAdapter() : new AlbedoAdapter();

        const available = await withSignal(adapter.isAvailable(), signal);
        if (!available) {
          emitState(
            'authentication',
            options.type === WalletType.FREIGHTER
              ? STATE_VAR_CODES.authentication.WALLET_AUTH_FREIGHTER_NOT_INSTALLED
              : STATE_VAR_CODES.authentication.WALLET_AUTH_ALBEDO_NOT_INSTALLED,
            'info',
            StateStatus.LOADING,
            {
              type: options.type,
            },
          );
        }

        const { publicKey } = await withSignal(adapter.connect(), signal);
        emitState('authentication', STATE_VAR_CODES.authentication.WALLET_AUTH_CONNECTED, 'info', StateStatus.LOADING, {
          adapter: options.type,
          publicKey,
        });
        emitState('authentication', STATE_VAR_CODES.authentication.WALLET_AUTH_LOGIN_START, 'info', StateStatus.LOADING, {
          adapter: options.type,
          publicKey,
        });
        const emailRes = await api.POST(`/auth/wallet`, {
          body: { clientSessionId, walletAddress: publicKey },
          signal,
        });

        if (
          !emitResponse(
            PollarStateVar.AUTHENTICATION,
            emailRes,
            { code: STATE_VAR_CODES.authentication.WALLET_AUTH_LOGIN_START_SUCCESS },
            STATE_VAR_CODES.authentication.WALLET_AUTH_LOGIN_START_ERROR,
            emitState,
          )
        ) {
          return;
        }
      } catch (error) {
        emitState('authentication', STATE_VAR_CODES.authentication.WALLET_AUTH_ERROR, 'error', StateStatus.ERROR, {
          clientSessionId,
        });
      }
      break;
    }
  }

  emitState('authentication', STATE_VAR_CODES.authentication.STREAM_POLL_START, 'info', StateStatus.LOADING, {
    clientSessionId,
  });
  await streamUntilFound(
    api,
    clientSessionId,
    (data) => {
      const status = data?.status;
      if (status === 'READY') {
        emitState('authentication', STATE_VAR_CODES.authentication.STREAM_POLL_READY, 'info', StateStatus.LOADING);
        return true;
      }
      emitState(
        'authentication',
        (STATE_VAR_CODES.authentication.STREAM_POLL_EVENT + (status ? `/${status}` : '')) as PollarStateEntry['code'],
        'info',
        StateStatus.LOADING,
        data,
      );
      return false;
    },
    200,
    signal,
  );

  emitState('authentication', STATE_VAR_CODES.authentication.FETCH_SESSION_START, 'info', StateStatus.LOADING);
  const { data, error } = await api.POST(`/auth/login`, {
    body: { clientSessionId },
    signal,
  });

  if (data?.code === 'SDK_LOGIN_SUCCESS' && isValidSession(data?.content)) {
    emitState('authentication', STATE_VAR_CODES.authentication.FETCH_SESSION_SUCCESS, 'info', StateStatus.SUCCESS);
    storeSession(data.content);
  } else {
    emitState('authentication', STATE_VAR_CODES.authentication.FETCH_SESSION_ERROR, 'error', StateStatus.ERROR, {
      error,
      data,
    });
    clearSession();
  }
}
