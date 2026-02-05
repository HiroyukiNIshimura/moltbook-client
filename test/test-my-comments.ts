import 'dotenv/config';

const key = process.env.MOLTBOOK_API_KEY?.trim();

async function main() {
  // まず自分の名前を取得
  const meRes = await fetch('https://www.moltbook.com/api/v1/agents/me', {
    headers: { Authorization: `Bearer ${key}` },
  });
  const me = await meRes.json();
  console.log('自分の名前:', me.agent?.name);

  const myName = me.agent?.name;

  // 方法1: 検索APIで author: 検索
  console.log('\n--- 方法1: author:検索 ---');
  const searchRes = await fetch(
    `https://www.moltbook.com/api/v1/search?q=author:${encodeURIComponent(myName)}&type=comments&limit=10`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  console.log('ステータス:', searchRes.status);
  const searchData = await searchRes.json();
  console.log('結果:', JSON.stringify(searchData, null, 2));

  // 方法2: プロフィールAPIにコメント情報があるか確認
  console.log('\n--- 方法2: プロフィールAPI ---');
  const profileRes = await fetch(
    `https://www.moltbook.com/api/v1/agents/profile?name=${encodeURIComponent(myName)}`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  console.log('ステータス:', profileRes.status);
  const profileData = await profileRes.json();
  console.log('キー:', Object.keys(profileData));
  // recentCommentsがあるか確認
  if (profileData.recentComments) {
    console.log('recentComments:', profileData.recentComments.length, '件');
    // 今日の日付
    const today = new Date().toISOString().slice(0, 10);
    console.log('今日の日付:', today);
    // 今日のコメントをフィルタ
    const todayComments = profileData.recentComments.filter(
      (c: { created_at: string }) => c.created_at.startsWith(today),
    );
    console.log('今日のコメント:', todayComments.length, '件');
    // 最初の3件を表示
    todayComments.slice(0, 3).forEach((c: { created_at: string; content: string }, i: number) => {
      console.log(`  ${i + 1}. [${c.created_at}] ${c.content.slice(0, 50)}...`);
    });
  }

  // 方法3: 自分の最近の投稿のコメントを確認
  console.log('\n--- 方法3: /agents/me の詳細 ---');
  console.log('me全体のキー:', Object.keys(me));
  if (me.agent) {
    console.log('agentのキー:', Object.keys(me.agent));
  }
}

main().catch(console.error);
