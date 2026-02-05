/**
 * postDevProgress 関数のテストスクリプト
 *
 * 使い方:
 *   npx tsx test-dev-progress.ts [--repo owner/repo]
 *
 * オプション:
 *   --repo: テスト対象のリポジトリを指定（デフォルト: HiroyukiNIshimura/pecus-aspire）
 *
 * 環境変数:
 *   MOLTBOOK_DRY_RUN=true で実際の投稿をスキップ（LLM生成は実行される）
 */

import 'dotenv/config';
import { T69Agent } from './src/agent';

const args = process.argv.slice(2);
const repoIndex = args.indexOf('--repo');
const repo =
  repoIndex !== -1 ? args[repoIndex + 1] : 'HiroyukiNIshimura/pecus-aspire';

const isDryRun = process.env.MOLTBOOK_DRY_RUN === 'true';

console.log('🧪 postDevProgress テスト開始');
console.log(`📦 対象リポジトリ: ${repo}`);
console.log(`🔧 モード: ${isDryRun ? 'ドライラン（MOLTBOOK_DRY_RUN=true）' : '本番（投稿する）'}`);
console.log('---');

// GitHub API でコミットを取得するテスト
async function testGitHubAPI() {
  console.log('\n📡 GitHub API テスト...');

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'T69-Agent-Test',
  };

  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    console.log('✅ GITHUB_TOKEN が設定されています');
  } else {
    console.log('⚠️ GITHUB_TOKEN が未設定（レート制限60回/時間）');
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/commits?per_page=5`,
      { headers },
    );

    if (!res.ok) {
      console.log(`❌ GitHub API エラー: ${res.status} ${res.statusText}`);
      const errorBody = await res.text();
      console.log(`   レスポンス: ${errorBody.slice(0, 200)}`);
      return null;
    }

    const commits = (await res.json()) as Array<{
      commit: { message: string; author: { date: string } };
      sha: string;
    }>;

    console.log(`✅ ${commits.length}件のコミットを取得`);
    console.log('\n最近のコミット:');
    for (const c of commits.slice(0, 3)) {
      const msg = c.commit.message.split('\n')[0];
      const date = new Date(c.commit.author.date).toLocaleString('ja-JP');
      console.log(`  - ${c.sha.slice(0, 7)}: ${msg}`);
      console.log(`    📅 ${date}`);
    }

    return commits;
  } catch (error) {
    console.log(`❌ GitHub API 接続エラー: ${error}`);
    return null;
  }
}

// Moltbook API 接続テスト
async function testMoltbookConnection() {
  console.log('\n📡 Moltbook API テスト...');

  const key = process.env.MOLTBOOK_API_KEY?.trim();
  if (!key) {
    console.log('❌ MOLTBOOK_API_KEY が設定されていません');
    return false;
  }

  console.log(`✅ MOLTBOOK_API_KEY が設定されています (${key.slice(0, 10)}...)`);

  try {
    const res = await fetch('https://www.moltbook.com/api/v1/agents/me', {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });

    if (!res.ok) {
      console.log(`❌ Moltbook API エラー: ${res.status}`);
      return false;
    }

    const data = (await res.json()) as { agent: { name: string; karma: number } };
    console.log(`✅ 接続成功: ${data.agent.name} (カルマ: ${data.agent.karma})`);
    return true;
  } catch (error) {
    console.log(`❌ Moltbook API 接続エラー: ${error}`);
    return false;
  }
}

// メイン処理
async function main() {
  // 1. GitHub API テスト
  const commits = await testGitHubAPI();
  if (!commits || commits.length === 0) {
    console.log('\n❌ コミットが取得できないため終了');
    process.exit(1);
  }

  // 2. Moltbook 接続テスト
  const moltbookOk = await testMoltbookConnection();
  if (!moltbookOk) {
    console.log('\n❌ Moltbook に接続できないため終了');
    process.exit(1);
  }

  // 3. postDevProgress を実行
  console.log('\n🚀 postDevProgress を実行します...');

  const key = process.env.MOLTBOOK_API_KEY?.trim();
  if (!key) {
    console.log('❌ MOLTBOOK_API_KEY が必要です');
    process.exit(1);
  }

  const agent = new T69Agent(key);

  try {
    await agent.postDevProgress(repo);
    console.log('\n✅ 完了！');
  } catch (error) {
    console.log(`\n❌ エラー: ${error}`);
    process.exit(1);
  }
}

main();
