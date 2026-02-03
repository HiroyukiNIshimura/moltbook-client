#!/bin/bash

# Moltbook Agent 終了スクリプト

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.moltbook-agent.pid"

# PIDファイルが存在するかチェック
if [ ! -f "$PID_FILE" ]; then
    echo "⚠️  PIDファイルが見つかりません"

    # プロセス名で検索して終了を試みる
    PIDS=$(pgrep -f "tsx src/index.ts")
    if [ -n "$PIDS" ]; then
        echo "📍 関連プロセスを発見しました: $PIDS"
        read -p "これらのプロセスを終了しますか? (y/N): " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            echo "$PIDS" | xargs kill
            echo "✅ プロセスを終了しました"
        fi
    else
        echo "❌ 実行中のエージェントが見つかりません"
    fi
    exit 1
fi

PID=$(cat "$PID_FILE")

# プロセスが存在するかチェック
if ! ps -p "$PID" > /dev/null 2>&1; then
    echo "⚠️  プロセス (PID: $PID) は既に終了しています"
    rm -f "$PID_FILE"
    exit 0
fi

# プロセスを終了
echo "🛑 エージェントを停止しています (PID: $PID)..."
kill "$PID"

# 終了を待機 (最大10秒)
for _ in {1..10}; do
    if ! ps -p "$PID" > /dev/null 2>&1; then
        echo "✅ エージェントが正常に停止しました"
        rm -f "$PID_FILE"
        exit 0
    fi
    sleep 1
done

# 強制終了
echo "⚠️  通常終了できません。強制終了します..."
kill -9 "$PID"
rm -f "$PID_FILE"
echo "✅ エージェントを強制終了しました"
