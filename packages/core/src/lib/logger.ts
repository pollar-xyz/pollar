/**
 * Log levels in increasing verbosity. Setting a level emits that level and
 * every more-important one; `silent` disables all SDK logging.
 *
 *   silent < error < warn < info < debug
 */
export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

/**
 * Sink the SDK writes logs to. The global `console` already satisfies this
 * shape, so it's the default. Inject your own (pino, Sentry breadcrumbs, a test
 * spy…) via `PollarClientConfig.logger` to route SDK logs wherever you want.
 */
export interface PollarLogger {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

const RANK: Record<LogLevel, number> = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

/**
 * Build a level-gated logger over a sink. The returned object has the same
 * method surface as {@link PollarLogger}; each call is silently dropped when its
 * level is more verbose than the configured `level`. Messages keep their own
 * `[PollarClient…]` prefixes, so this only adds filtering + sink routing.
 *
 * Defaults: `level = 'info'`, `sink = console`.
 */
export function createLogger(level: LogLevel = 'info', sink: PollarLogger = console): PollarLogger {
  const threshold = RANK[level];
  const gate =
    (lvl: Exclude<LogLevel, 'silent'>) =>
    (...args: unknown[]): void => {
      if (threshold >= RANK[lvl]) sink[lvl](...args);
    };
  return { error: gate('error'), warn: gate('warn'), info: gate('info'), debug: gate('debug') };
}
