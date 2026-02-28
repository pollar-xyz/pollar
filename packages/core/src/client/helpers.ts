import { PollarStateVar, StateStatus } from '../constants';
import { PollarStateEntry } from '../types';

export const emitResponse = <T>(
  state: PollarStateVar,
  response: { data?: any; error?: any },
  success: { code: T; status?: StateStatus },
  errorCode: T,
  emitLog: (
    state: PollarStateVar,
    code: T,
    level: PollarStateEntry['level'],
    status: PollarStateEntry['status'],
    data?: unknown,
  ) => void,
) => {
  const isSuccess = !response.error && !!response.data && !!response.data?.success;
  emitLog(
    state,
    isSuccess ? success.code : errorCode,
    isSuccess ? 'info' : 'error',
    isSuccess ? success.status || StateStatus.LOADING : StateStatus.ERROR,
    isSuccess ? response.data : response.error,
  );
  return isSuccess;
};
