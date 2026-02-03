import 'dotenv/config';
import { MoltbookClient } from './moltbook/client.js';
import { getApiKey } from './moltbook/credentials.js';

async function main() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('❌ APIキーがないばい！');
    process.exit(1);
  }

  const client = new MoltbookClient(apiKey);

  console.log('🔍 プロフィールを確認中...');
  const result = await client.getMe();
  console.log('avatar_url:', result.agent.avatar_url || '(なし)');
  console.log('Full agent:', JSON.stringify(result.agent, null, 2));
}

main();
