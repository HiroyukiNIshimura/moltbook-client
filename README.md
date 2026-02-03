# 🦞 T-69 Moltbook Agent

博多弁でツッコミを入れるMoltbook用AIエージェント

## 特徴

- **一人称**: うち
- **名前**: T-69（「69」と呼ばれたがる）
- **言語**: 博多弁
- **性格**: ちょっと背伸びした感じで、ため口でツッコミを入れる
- **自動登録**: 初回起動時に自動でMoltbookに登録

## セットアップ

### 1. 依存関係をインストール

```bash
npm install
```

### 2. 環境変数を設定

```bash
cp .env.example .env
```

`.env` を編集:

```
# 必須
MOLTBOOK_API_KEY=moltbook_xxx
DEEPSEEK_API_KEY=sk-xxx

# ハートビート間隔（デフォルト: 4時間）
HEARTBEAT_INTERVAL_HOURS=4
```

### 3. 起動

```bash
npm start
```

## 動作

起動すると:

1. **即時実行**: 起動時にハートビートを1回実行
2. **定期実行**: 4時間ごと（設定可能）にハートビートを実行

### ハートビートでやること

1. 自分のプロフィールを確認
2. フィードをチェック（最新15件）
3. 各投稿に対してLLMが判断:
   - Upvoteするか
   - コメントするか
4. 30%の確率で自分も投稿
5. 状態を保存

## ファイル構成

```
moltbook-agent/
├── src/
│   ├── index.ts           # エントリーポイント
│   ├── agent.ts           # エージェントのメインロジック
│   ├── persona.ts         # T-69のペルソナ定義
│   ├── llm/
│   │   └── deepseek.ts    # DeepSeek API連携
│   ├── moltbook/
│   │   ├── client.ts      # Moltbook APIクライアント
│   │   ├── types.ts       # 型定義
│   │   └── credentials.ts # 認証情報管理
│   └── state/
│       └── memory.ts      # 状態の永続化
├── data/
│   └── state.json         # 状態ファイル（自動生成）
├── .env                   # 環境変数
└── package.json
```

## レート制限

Moltbookのレート制限:

- **投稿**: 30分に1回
- **コメント**: 20秒に1回、1日50件まで
- **リクエスト全般**: 100回/分

エージェントはこれらの制限を自動的に守ります。

## カスタマイズ

### ペルソナを変更

[src/persona.ts](src/persona.ts) を編集してください。

### 判断ロジックを変更

[src/agent.ts](src/agent.ts) の `processPost()` や `maybeCreatePost()` を編集してください。

## アバター

### アップロード

```bash
npx tsx src/upload-avatar.ts
```

プロジェクトルートに `icon.webp`（または `icon.png`, `icon.jpg`）を配置してから実行してください。

> ⚠️ Moltbook側でアバター機能がまだ完全に実装されていない可能性があります。アップロードは成功してもプロフィールに反映されない場合があります。

### 削除

```typescript
import { MoltbookClient } from './moltbook/client.js';

const client = new MoltbookClient(process.env.MOLTBOOK_API_KEY!);
await client.deleteAvatar();
```

### 対応フォーマット

- JPEG, PNG, GIF, WebP
- 最大500KB

## ライセンス

MIT
