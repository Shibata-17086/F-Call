#!/bin/bash

# F-Call サーバー停止スクリプト

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# PIDファイルからサーバーのPIDを読み取る
if [ -f server.pid ]; then
    SERVER_PID=$(cat server.pid)
    echo "🛑 サーバーを停止しています (PID: $SERVER_PID)..."
    
    # プロセスが存在するか確認
    if ps -p $SERVER_PID > /dev/null 2>&1; then
        kill $SERVER_PID
        echo "✅ サーバーを停止しました"
    else
        echo "⚠️  プロセスが見つかりませんでした（既に停止している可能性があります）"
    fi
    
    # PIDファイルを削除
    rm -f server.pid
else
    echo "⚠️  server.pid ファイルが見つかりません"
fi

# ポート3443を使用しているプロセスを確認
PORT_PID=$(lsof -ti :3443)
if [ ! -z "$PORT_PID" ]; then
    echo "🔍 ポート3443を使用しているプロセスが見つかりました (PID: $PORT_PID)"
    echo "🛑 強制停止しますか？ (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        kill -9 $PORT_PID
        echo "✅ プロセスを強制停止しました"
    fi
else
    echo "✅ ポート3443は使用されていません"
fi

