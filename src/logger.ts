/**
 * ロガー設定
 * pino + pino-roll でコンソール出力とファイルローテーション
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

// ログディレクトリ
const LOG_DIR = './logs';

// 日付ファイル名を生成（日本時間）
function getLogFileName(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const date = jst.toISOString().slice(0, 10); // YYYY-MM-DD
  return `${LOG_DIR}/t69.${date}.log`;
}

// Transport設定を構築
const targets: pino.TransportTargetOptions[] = [
  // コンソール出力（pino-pretty）
  {
    target: 'pino-pretty',
    level: 'info',
    options: {
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
];

// 本番環境またはLOG_TO_FILE=trueの場合はファイル出力も追加
if (!isDev || process.env.LOG_TO_FILE === 'true') {
  targets.push({
    // ファイル出力もpino-prettyで整形
    target: 'pino-pretty',
    level: 'info',
    options: {
      colorize: false,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
      destination: getLogFileName(),
      mkdir: true,
      append: true,
    },
  });
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    targets,
  },
});

// 便利なラッパー関数
export function createLogger(name: string) {
  return logger.child({ name });
}
