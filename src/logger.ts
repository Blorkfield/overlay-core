type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(prefix: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  const base = `[${timestamp}] [${prefix}] ${message}`;
  return data !== undefined ? `${base} ${JSON.stringify(data)}` : base;
}

export const logger = {
  debug(prefix: string, message: string, data?: unknown): void {
    if (shouldLog('debug')) {
      console.debug(formatMessage(prefix, message, data));
    }
  },

  info(prefix: string, message: string, data?: unknown): void {
    if (shouldLog('info')) {
      console.info(formatMessage(prefix, message, data));
    }
  },

  warn(prefix: string, message: string, data?: unknown): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage(prefix, message, data));
    }
  },

  error(prefix: string, message: string, data?: unknown): void {
    if (shouldLog('error')) {
      console.error(formatMessage(prefix, message, data));
    }
  }
};
