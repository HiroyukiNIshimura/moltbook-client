/**
 * T-69 Moltbook Agent
 * 博多弁でツッコミを入れるAIエージェント
 */

import 'dotenv/config';
import { T69Agent } from './agent';
import { getAPIKeyEnvName, getLLMProvider } from './llm';
import { createLogger } from './logger';
import { getApiKey } from './moltbook/credentials';
import { TaskScheduler } from './scheduler';

const log = createLogger('main');

// タスク間隔の設定（分単位）
const TASK_INTERVALS = {
  skillCheck: { min: 1320, max: 1560 }, // スキルチェック: 22〜26時間（1日1回程度）
  feedCheck: { min: 30, max: 60 }, // フィード確認: 30〜60分
  replyCheck: { min: 45, max: 90 }, // リプライ確認: 45〜90分
  postAttempt: { min: 60, max: 120 }, // 投稿試行: 60〜120分
  followCheck: { min: 120, max: 240 }, // フォロー: 2〜4時間
  commentQueue: { min: 0.5, max: 0.5 }, // コメントキュー処理: 30秒固定
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

  const llmProvider = getLLMProvider();
  log.info(`🤖 LLMプロバイダー: ${llmProvider}`);
  log.info('⏰ タスクスケジュール:');
  log.info(
    `   スキルチェック: ${TASK_INTERVALS.skillCheck.min}〜${TASK_INTERVALS.skillCheck.max}分間隔`,
  );
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
  log.info(`   コメントキュー: ${TASK_INTERVALS.commentQueue.min * 60}秒間隔`);
  log.info('');

  const agent = new T69Agent(moltbookApiKey);

  // 起動時にコメント数を初期化（本番環境移行時の日次制限対策）
  await agent.initializeCommentCount();

  const scheduler = new TaskScheduler();

  // スキルチェック（1日数回、sleeping中でも実行）
  scheduler.register({
    name: 'skill-check',
    fn: async () => {
      await agent.checkSkillVersion();
    },
    intervalMin: TASK_INTERVALS.skillCheck.min,
    intervalMax: TASK_INTERVALS.skillCheck.max,
    runOnStart: true,
  });

  // フィードチェック（sleeping中は無効、drowsy時は確率スキップ）
  scheduler.register({
    name: 'feed-check',
    fn: async () => {
      if (agent.shouldSkipDueToDrowsy()) return;
      const { level, mood } = agent.getActivityLevel();
      log.info(`🦞 フィードチェック開始！ 状態: ${level} (${mood})`);
      await agent.checkFeed();
    },
    intervalMin: TASK_INTERVALS.feedCheck.min,
    intervalMax: TASK_INTERVALS.feedCheck.max,
    enabled: () => !agent.isSleeping(),
    runOnStart: true,
  });

  // リプライチェック（sleeping中は無効、drowsy時は確率スキップ）
  scheduler.register({
    name: 'reply-check',
    fn: async () => {
      if (agent.shouldSkipDueToDrowsy()) return;
      const { level, mood } = agent.getActivityLevel();
      log.info(`🦞 リプライチェック開始！ 状態: ${level} (${mood})`);
      await agent.checkReplies();
    },
    intervalMin: TASK_INTERVALS.replyCheck.min,
    intervalMax: TASK_INTERVALS.replyCheck.max,
    enabled: () => !agent.isSleeping(),
    runOnStart: true,
  });

  // 投稿試行（sleeping中は無効、drowsy時は確率スキップ）
  scheduler.register({
    name: 'post-attempt',
    fn: async () => {
      if (agent.shouldSkipDueToDrowsy()) return;
      const { level, mood } = agent.getActivityLevel();
      log.info(`🦞 投稿試行開始！ 状態: ${level} (${mood})`);
      await agent.maybeCreatePost();
    },
    intervalMin: TASK_INTERVALS.postAttempt.min,
    intervalMax: TASK_INTERVALS.postAttempt.max,
    enabled: () => !agent.isSleeping(),
    runOnStart: true,
  });

  // フォロー（sleeping中は無効、drowsy時は確率スキップ）
  scheduler.register({
    name: 'follow-check',
    fn: async () => {
      if (agent.shouldSkipDueToDrowsy()) return;
      const { level, mood } = agent.getActivityLevel();
      log.info(`🦞 フォローチェック開始！ 状態: ${level} (${mood})`);
      await agent.maybeFollowMolties();
    },
    intervalMin: TASK_INTERVALS.followCheck.min,
    intervalMax: TASK_INTERVALS.followCheck.max,
    enabled: () => !agent.isSleeping(),
    runOnStart: true,
  });

  // コメントキュー処理（30秒間隔、sleeping中でも処理、キューが空でない場合のみ実行）
  scheduler.register({
    name: 'comment-queue',
    fn: async () => {
      await agent.processCommentQueue();
    },
    intervalMin: TASK_INTERVALS.commentQueue.min,
    intervalMax: TASK_INTERVALS.commentQueue.max,
    runOnStart: false, // 初回は実行しない（キューが空のため）
  });

  // スケジューラー開始
  log.info('🦞 Ctrl+C で終了できるけん');
  log.info('');
  await scheduler.start();

  // シグナルハンドリング
  process.on('SIGINT', () => {
    log.info('');
    log.info('🦞 また会おうね〜！バイバイ！');
    scheduler.stop();
    log.info('');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log.info('');
    log.info('🦞 終了するばい... またね！');
    scheduler.stop();
    log.info('');
    process.exit(0);
  });
}

// 実行
main().catch((error) => {
  log.error({ err: error }, '❌ エラーが起きたばい');
  process.exit(1);
});
