/**
 * T-69のアバターをアップロード
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { getApiKey } from './moltbook/credentials.js';

const BASE_URL = 'https://www.moltbook.com/api/v1';

async function main() {
  const apiKey = getApiKey()?.trim();
  if (!apiKey) {
    console.error('❌ APIキーがないばい！');
    process.exit(1);
  }

  console.log('🦞 アバターをアップロードするばい〜');

  const imageBuffer = readFileSync('./icon.webp');
  console.log(`📷 ファイルサイズ: ${(imageBuffer.length / 1024).toFixed(1)} KB`);

  // FormDataを手動で構築
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/webp' });
  formData.append('file', blob, 'icon.webp');

  console.log('📤 アップロード中...');

  const response = await fetch(`${BASE_URL}/agents/me/avatar`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  console.log(`📥 ステータス: ${response.status}`);
  const result = await response.text();
  console.log('📥 レスポンス:', result);
}

main();

