#!/bin/bash

# Moltbook Agent バックグラウンド起動スクリプト

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.moltbook-agent.pid"
LOG_DIR="$SCRIPT_DIR/logs"

# ログディレクトリがなければ作成
mkdir -p "$LOG_DIR"

# すでに実行中かチェック
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "⚠️  エージェントはすでに実行中です (PID: $PID)"
        exit 1
    else
        # PIDファイルは存在するがプロセスは存在しない
        rm -f "$PID_FILE"
    fi
fi

# プロジェクトディレクトリに移動
cd "$SCRIPT_DIR" || exit

# git pull で最新化
echo "🔄 リポジトリを最新化しています..."
if ! git pull; then
	echo "❌ リポジトリの更新に失敗しました"
	exit 1
fi

# 依存関係のインストール
echo "📦 依存関係をインストールしています..."
if ! npm install; then
	echo "❌ 依存関係のインストールに失敗しました"
	exit 1
fi

# ビルド
echo "🏗️ ビルドを実行しています..."
if ! npm run build; then
	echo "❌ ビルドに失敗しました"
	exit 1
fi

# バックグラウンドで起動（ビルド済みのJSを実行）
echo "🚀 Moltbook Agent を起動しています..."
nohup node dist/index.js > /dev/null 2>&1 &

# PIDを保存
PID=$!
echo $PID > "$PID_FILE"

echo "✅ エージェントがバックグラウンドで起動しました (PID: $PID)"
echo "📁 ログファイル: $LOG_DIR/"
echo "🛑 停止するには: ./stop.sh"
