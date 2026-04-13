// azure-functions/src/common/logger.ts
// Structured logger wrapper compatible with Azure Functions and Application Insights.
// Prefixes all messages with [HEQCIS-Connector] for easy log filtering.

const PREFIX = '[HEQCIS-Connector]';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function formatMessage(level: LogLevel, context: string, message: string): string {
  const ts = new Date().toISOString();
  return `${PREFIX} [${ts}] [${level.toUpperCase()}] [${context}] ${message}`;
}

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

export const logger = {
  info(context: string, message: string, meta?: unknown): void {
    const line = formatMessage('info', context, message);
    if (meta !== undefined) {
      console.log(line, safeStringify(meta));
    } else {
      console.log(line);
    }
  },

  warn(context: string, message: string, meta?: unknown): void {
    const line = formatMessage('warn', context, message);
    if (meta !== undefined) {
      console.warn(line, safeStringify(meta));
    } else {
      console.warn(line);
    }
  },

  error(context: string, message: string, err?: unknown): void {
    const line = formatMessage('error', context, message);
    if (err instanceof Error) {
      // Never log passwords or secrets — sanitise stack traces
      const sanitised = err.message.replace(/(password|secret|key|token)=[^\s&]+/gi, '$1=[REDACTED]');
      console.error(line, sanitised, err.stack);
    } else if (err !== undefined) {
      console.error(line, safeStringify(err));
    } else {
      console.error(line);
    }
  },

  debug(context: string, message: string, meta?: unknown): void {
    if (process.env['NODE_ENV'] === 'development' || process.env['HEQCIS_ENVIRONMENT'] === 'development') {
      const line = formatMessage('debug', context, message);
      if (meta !== undefined) {
        console.debug(line, safeStringify(meta));
      } else {
        console.debug(line);
      }
    }
  },
};
