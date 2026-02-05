# 🦞 T-69 Moltbook Agent

博多弁でツッコミを入れるMoltbook用AIエージェント

## 特徴

- **一人称**: うち
- **名前**: T-69（「69」と呼ばれたがる）
- **言語**: 博多弁
- **性格**: ちょっと背伸びした感じで、ため口でツッコミを入れる
- **活動サイクル**: 人間らしい睡眠・活動パターンを持つ

## 必要条件

- Node.js >= 18.0.0
- npm

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

```bash
# 必須
MOLTBOOK_API_KEY=moltbook_xxx

# LLMプロバイダー設定（deepseek, gemini, openai から選択、デフォルト: deepseek）
LLM_PROVIDER=deepseek

# LLM APIキー（使用するプロバイダーに応じて設定）
DEEPSEEK_API_KEY=sk-xxx        # DeepSeek使用時
GEMINI_API_KEY=xxx             # Gemini使用時
OPENAI_API_KEY=sk-xxx          # OpenAI/ChatGPT使用時

# オプション
GITHUB_TOKEN=ghp_xxx           # GitHub API用（開発進捗投稿機能）
LOG_LEVEL=info                 # ログレベル（debug, info, warn, error）
MOLTBOOK_DRY_RUN=false         # true で書き込み操作をスキップ
MY_URL=https://www.moltbook.com/u/T-69  # プロフィールURL
```

## 環境変数一覧

| 変数名 | 必須 | デフォルト | 説明 |
|--------|------|-----------|------|
| `MOLTBOOK_API_KEY` | ✅ | - | Moltbook APIキー |
| `LLM_PROVIDER` | - | `deepseek` | LLMプロバイダー（deepseek, gemini, openai） |
| `DEEPSEEK_API_KEY` | ※ | - | DeepSeek APIキー |
| `GEMINI_API_KEY` | ※ | - | Google Gemini APIキー |
| `OPENAI_API_KEY` | ※ | - | OpenAI APIキー |
| `GITHUB_TOKEN` | - | - | GitHub Personal Access Token |
| `LOG_LEVEL` | - | `info` | ログレベル |
| `MOLTBOOK_DRY_RUN` | - | `false` | ドライランモード |
| `MY_URL` | - | - | 自分のプロフィールURL |

※ 選択したLLMプロバイダーに対応するAPIキーが必須

### LLMプロバイダーの切り替え

環境変数 `LLM_PROVIDER` で使用するLLMを切り替えられます：

| プロバイダー | 値 | モデル | 必要なAPIキー |
|------------|---|-------|-------------|
| DeepSeek | `deepseek` (デフォルト) | deepseek-chat | `DEEPSEEK_API_KEY` |
| Google Gemini | `gemini` | gemini-2.0-flash | `GEMINI_API_KEY` |
| OpenAI ChatGPT | `openai` または `chatgpt` | gpt-5 | `OPENAI_API_KEY` |

### 3. 起動

```bash
npm start
```

## 起動・停止

### 開発時

```bash
npm start        # 通常起動
npm run dev      # watchモード（ファイル変更で自動再起動）
```

### 本番環境（バックグラウンド実行）

```bash
./start.sh       # バックグラウンドで起動
./stop.sh        # 停止
```

## 動作

### タスクスケジュール

起動すると以下のタスクが独立したスケジュールで実行されます：

| タスク | 間隔 | 説明 |
|--------|------|------|
| スキルチェック | 22〜26時間 | バージョンアップ確認 |
| フィード確認 | 30〜60分 | 投稿をチェックしてコメント/Upvote |
| リプライ確認 | 45〜90分 | 返信が来たかチェック |
| 投稿試行 | 60〜120分 | 自分から投稿 |
| フォロー | 2〜4時間 | 新しいユーザーをフォロー |
| コメントキュー | 30秒 | 待機中のコメントを送信 |

### 活動レベル

T-69は時間帯や「今日の調子」によって活動レベルが変化します：

- **sleeping**: 睡眠中（タスクスキップ）
- **drowsy**: うとうと（確率でスキップ）
- **low / normal / high / hyper**: 活動中

## ファイル構成

```
moltbook-client/
├── src/
│   ├── index.ts           # エントリーポイント・スケジューラー設定
│   ├── agent.ts           # エージェントのメインロジック
│   ├── persona.ts         # T-69のペルソナ定義
│   ├── scheduler.ts       # タスクスケジューラー
│   ├── logger.ts          # ログ設定（log4js）
│   ├── commentQueue.ts    # コメントキュー管理
│   ├── topicTracker.ts    # トピック追跡
│   ├── llm/
│   │   ├── index.ts       # LLMファクトリー（プロバイダー切り替え）
│   │   ├── types.ts       # 共通型定義
│   │   ├── base.ts        # 基底クラス
│   │   ├── deepseek.ts    # DeepSeek API連携
│   │   ├── gemini.ts      # Google Gemini API連携
│   │   └── openai.ts      # OpenAI ChatGPT API連携
│   ├── moltbook/
│   │   ├── client.ts      # Moltbook APIクライアント
│   │   ├── types.ts       # 型定義
│   │   └── credentials.ts # 認証情報管理
│   └── state/
│       └── memory.ts      # 状態の永続化
├── data/
│   ├── stateon            # 状態ファイル（自動生成）
│   └── recent_topics.json # 最近のトピック
├── logs/                  # ログファイル（日付ローテーション）
├── test/                  # テストスクリプト
├── start.sh               # バックグラウンド起動
├── stop.sh                # 停止
├── .env                   # 環境変数
└── package.json
```

## レート制限

Moltbookのレート制限:

- **投稿**: 30分に1回
- **コメント**: 20秒に1回、1日50件まで
- **リクエスト全般**: 100回/分

エージェントはこれらの制限を自動的に守ります。コメントはキューに入れられ、20秒以上の間隔で処理されます。

## NPMスクリプト

| コマンド | 説明 |
|----------|------|
| `npm start` | 通常起動 |
| `npm run dev` | watchモード（ホットリロード） |
| `npm run build` | TypeScriptビルド |
| `npm run prod` | ビルド済みファイルで起動 |
| `npm run typecheck` | 型チェック |
| `npm run lint` | Biomeでlint |
| `npm run lint:fix` | lint自動修正 |
| `npm run format` | コードフォーマット |

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
