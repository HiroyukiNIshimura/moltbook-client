/**
 * T-69 Moltbook Agent
 * 博多弁でツッコミを入れるAIエージェント
 */

import 'dotenv/config';
import { T69Agent } from './agent';
import { createLogger } from './logger';
import { getAPIKeyEnvName, getLLMProvider } from './llm';
import { getApiKey } from './moltbook/credentials';

const log = createLogger('main');

// タスク間隔の設定（分単位）
const TASK_INTERVALS = {
  feedCheck: { min: 30, max: 60 }, // フィード確認: 30〜60分
  replyCheck: { min: 45, max: 90 }, // リプライ確認: 45〜90分
  postAttempt: { min: 60, max: 120 }, // 投稿試行: 60〜120分
  followCheck: { min: 120, max: 240 }, // フォロー: 2〜4時間
};

// 環境変数チェック
function checkEnv(): void {
  const llmProvider = getLLMProvider();
  const llmApiKeyEnv = getAPIKeyEnvName(llmProvider);

  if (!process.env[llmApiKeyEnv]) {
    log.error(`❌ ${llmApiKeyEnv} が設定されとらんばい！`);
    log.error('   .env ファイルを確認してね〜');
    log.error(`   （LLMプロバイダー: ${llmProvider}）`);
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

  // 基本間隔（環境変数で調整可能、デフォルト20分）
  const baseIntervalMinutes = parseInt(
    process.env.HEARTBEAT_INTERVAL_MINUTES || '20',
    10,
  );

  const llmProvider = getLLMProvider();
  log.info(`🤖 LLMプロバイダー: ${llmProvider}`);
  log.info('⏰ 行動パターン設定:');
  log.info(
    `   フィード確認: ${TASK_INTERVALS.feedCheck.min}〜${TASK_INTERVALS.feedCheck.max}分間隔`,
  );
  log.info(
    `   リプライ確認: ${TASK_INTERVALS.replyCheck.min}〜${TASK_INTERVALS.replyCheck.max}分間隔`,
  );
  log.info(
    `   投稿試行: ${TASK_INTERVALS.postAttempt.min}〜${TASK_INTERVALS.postAttempt.max}分間隔`,
  );
  log.info(
    `   フォロー: ${TASK_INTERVALS.followCheck.min}〜${TASK_INTERVALS.followCheck.max}分間隔`,
  );
  log.info(`   ベースチェック: ${baseIntervalMinutes}分ごと`);
  log.info('');

  const agent = new T69Agent(moltbookApiKey);

  // 起動時に1回実行
  await agent.heartbeat();

  // 定期実行（ランダムな間隔で自然に）
  const scheduleNextHeartbeat = () => {
    // ベース間隔 ± 30%のランダムな揺らぎ
    const jitter = 0.3;
    const minMs = baseIntervalMinutes * (1 - jitter) * 60 * 1000;
    const maxMs = baseIntervalMinutes * (1 + jitter) * 60 * 1000;
    const nextInterval = minMs + Math.random() * (maxMs - minMs);
    const nextMinutes = Math.round(nextInterval / 60000);

    log.info('');
    log.info(`⏰ 次のハートビートは約${nextMinutes}分後ばい〜`);
    log.info('   Ctrl+C で終了できるけん');
    log.info('');

    setTimeout(async () => {
      log.info('');
      log.info('⏰ ハートビートの時間やけん！');
      try {
        await agent.heartbeat();
      } catch (error) {
        log.error({ err: error }, '❌ ハートビートでエラーが起きたばい');
      }
      scheduleNextHeartbeat();
    }, nextInterval);
  };

  scheduleNextHeartbeat();

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
