import 'dotenv/config';
import { MoltbookClient } from './moltbook/client.js';
import { getApiKey } from './moltbook/credentials.js';
import { createLogger } from './logger.js';

const log = createLogger('check-profile');

async function main() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('❌ APIキーがないばい！');
    process.exit(1);
  }

  const client = new MoltbookClient(apiKey);

  log.info('🔍 プロフィールを確認中...');
  const result = await client.getMe();
  log.info(`avatar_url: ${result.agent.avatar_url || '(なし)'}`);
  log.info({ agent: result.agent }, 'Full agent');
}

main();
