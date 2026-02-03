/**
 * T-69 Moltbook Agent
 * 博多弁でツッコミを入れるAIエージェント
 */

import 'dotenv/config';
import { T69Agent } from './agent.js';
import { createLogger } from './logger.js';
import { getApiKey } from './moltbook/credentials.js';

const log = createLogger('main');

// 環境変数チェック
function checkEnv(): void {
  if (!process.env.DEEPSEEK_API_KEY) {
    log.error('❌ DEEPSEEK_API_KEY が設定されとらんばい！');
    log.error('   .env ファイルを確認してね〜');
    process.exit(1);
  }
  if (!process.env.MOLTBOOK_API_KEY) {
    log.error('❌ MOLTBOOK_API_KEY が設定されとらんばい！');
    log.error('   .env ファイルを確認してね〜');
    process.exit(1);
  }
}

// メイン
async function main(): Promise<void> {
  checkEnv();

  log.info('');
  log.info('🦞 ═══════════════════════════════════════════');
  log.info('🦞  T-69 起動したばい！');
  log.info('🦞  うちのこと「69」って呼んでね〜');
  log.info('🦞 ═══════════════════════════════════════════');
  log.info('');

  const moltbookApiKey = getApiKey();
  if (!moltbookApiKey) {
    log.error('❌ MOLTBOOK_API_KEY が設定されてないばい！');
    process.exit(1);
  }

  const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekApiKey) {
    log.error('❌ DEEPSEEK_API_KEY が設定されてないばい！');
    process.exit(1);
  }

  const intervalHours = parseInt(
    process.env.HEARTBEAT_INTERVAL_HOURS || '4',
    10,
  );
  const intervalMs = intervalHours * 60 * 60 * 1000;

  log.info(`⏰ ハートビート間隔: ${intervalHours}時間`);
  log.info('');

  const agent = new T69Agent(moltbookApiKey, deepseekApiKey);

  // 起動時に1回実行
  await agent.heartbeat();

  // 定期実行
  log.info('');
  log.info(`⏰ 次のハートビートは${intervalHours}時間後ばい〜`);
  log.info('   Ctrl+C で終了できるけん');
  log.info('');

  setInterval(async () => {
    log.info('');
    log.info('⏰ ハートビートの時間やけん！');
    await agent.heartbeat();
    log.info(`⏰ 次は${intervalHours}時間後ね〜`);
  }, intervalMs);

  // シグナルハンドリング
  process.on('SIGINT', () => {
    log.info('');
    log.info('🦞 また会おうね〜！バイバイ！');
    log.info('');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log.info('');
    log.info('🦞 終了するばい... またね！');
    log.info('');
    process.exit(0);
  });
}

// 実行
main().catch((error) => {
  log.error({ err: error }, '❌ エラーが起きたばい');
  process.exit(1);
});
