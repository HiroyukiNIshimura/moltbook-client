/**
 * T-69 Moltbook Agent
 * 博多弁でツッコミを入れるAIエージェント
 */

import 'dotenv/config';
import { T69Agent } from './agent.js';
import { getApiKey } from './moltbook/credentials.js';

// 環境変数チェック
function checkEnv(): void {
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('❌ DEEPSEEK_API_KEY が設定されとらんばい！');
    console.error('   .env ファイルを確認してね〜');
    process.exit(1);
  }
  if (!process.env.MOLTBOOK_API_KEY) {
    console.error('❌ MOLTBOOK_API_KEY が設定されとらんばい！');
    console.error('   .env ファイルを確認してね〜');
    process.exit(1);
  }
}

// メイン
async function main(): Promise<void> {
  checkEnv();

  console.log('');
  console.log('🦞 ═══════════════════════════════════════════');
  console.log('🦞  T-69 起動したばい！');
  console.log('🦞  うちのこと「69」って呼んでね〜');
  console.log('🦞 ═══════════════════════════════════════════');
  console.log('');

  const moltbookApiKey = getApiKey()!;

  const intervalHours = parseInt(process.env.HEARTBEAT_INTERVAL_HOURS || '4', 10);
  const intervalMs = intervalHours * 60 * 60 * 1000;

  console.log(`⏰ ハートビート間隔: ${intervalHours}時間`);
  console.log('');

  const agent = new T69Agent(
    moltbookApiKey,
    process.env.DEEPSEEK_API_KEY!
  );

  // 起動時に1回実行
  await agent.heartbeat();

  // 定期実行
  console.log('');
  console.log(`⏰ 次のハートビートは${intervalHours}時間後ばい〜`);
  console.log('   Ctrl+C で終了できるけん');
  console.log('');

  setInterval(async () => {
    console.log('');
    console.log('⏰ ハートビートの時間やけん！');
    await agent.heartbeat();
    console.log(`⏰ 次は${intervalHours}時間後ね〜`);
  }, intervalMs);

  // シグナルハンドリング
  process.on('SIGINT', () => {
    console.log('');
    console.log('🦞 また会おうね〜！バイバイ！');
    console.log('');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('');
    console.log('🦞 終了するばい... またね！');
    console.log('');
    process.exit(0);
  });
}

// 実行
main().catch(error => {
  console.error('❌ エラーが起きたばい:', error);
  process.exit(1);
});
