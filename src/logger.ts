/**
 * ロガー設定
 * log4js でコンソール出力とファイルローテーション
 */

import log4js from 'log4js';

// ログディレクトリ
const LOG_DIR = './logs';

// appenders設定
const appenders: log4js.Configuration['appenders'] = {
  console: {
    type: 'console',
    layout: {
      type: 'pattern',
      pattern: '%[[%d{yyyy-MM-dd hh:mm:ss}] [%p] [%c]%] %m',
    },
  },
};

appenders.file = {
  type: 'dateFile',
  filename: `${LOG_DIR}/t69`,
  pattern: 'yyyy-MM-dd.log',
  alwaysIncludePattern: true,
  numBackups: 5,
  layout: {
    type: 'pattern',
    pattern: '[%d{yyyy-MM-dd hh:mm:ss}] [%p] [%c] %m',
  },
};

// categories設定
const categories: log4js.Configuration['categories'] = {
  default: {
    appenders: Object.keys(appenders),
    level: process.env.LOG_LEVEL || 'info',
  },
};

log4js.configure({
  appenders,
  categories,
});

export const logger = log4js.getLogger();

// 便利なラッパー関数
export function createLogger(name: string) {
  return log4js.getLogger(name);
}
