/* eslint-disable global-require */
/* eslint-disable no-console */
/**
 * Global logger, available everywhere just use, Logger.info or Logger.error without import
 * Environment, development will use console, uat and prod will use pino logger
 */
 class Logger {
  constructor() {
    this.logger = require('pino')();
  }

  /**
   * Logger info
   * @param {string/object} msg: string or object message
   */
  info(...msg) {
    if (process.env.NODE_ENV === 'development') console.log(...msg);
    else this.logger.info(...msg);
  }

  /**
   * Logger error
   * @param {string/object} msg: string or object message
   */
  error(...msg) {
    if (process.env.NODE_ENV === 'development') console.error('\x1b[31m', ...msg, '\x1b[0m');
    else this.logger.error(...msg);
  }
}

module.exports = new Logger();
