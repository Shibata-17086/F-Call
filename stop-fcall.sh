#!/bin/bash

# F-Call サーバー停止スクリプト

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# PATHを設定（AppleScriptから実行する場合に必要）
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

STOPPED=0

# PIDファイルからサーバーのPIDを読み取る
if [ -f server.pid ]; then
    SERVER_PID=$(cat server.pid)
    echo "🛑 サーバーを停止しています (PID: $SERVER_PID)..."
    
    # プロセスが存在するか確認
    if ps -p $SERVER_PID > /dev/null 2>&1; then
        # SIGTERMで正常終了を試みる
        kill $SERVER_PID 2>/dev/null
        
        # プロセスが終了するまで待機（最大5秒）
        for i in {1..10}; do
            if ! ps -p $SERVER_PID > /dev/null 2>&1; then
                echo "✅ サーバーを停止しました"
                STOPPED=1
                break
            fi
            sleep 0.5
        done
        
        # まだプロセスが残っている場合、強制終了
        if ps -p $SERVER_PID > /dev/null 2>&1; then
            echo "⚠️  正常終了に失敗したため、強制終了します..."
            kill -9 $SERVER_PID 2>/dev/null
            sleep 1
            if ! ps -p $SERVER_PID > /dev/null 2>&1; then
                echo "✅ サーバーを強制停止しました"
                STOPPED=1
            fi
        fi
    else
        echo "⚠️  プロセスが見つかりませんでした（既に停止している可能性があります）"
        STOPPED=1
    fi
    
    # PIDファイルを削除
    rm -f server.pid
else
    echo "⚠️  server.pid ファイルが見つかりません"
fi

# ポート3443を使用しているプロセスを確認
PORT_PID=$(lsof -ti :3443 2>/dev/null)
if [ ! -z "$PORT_PID" ]; then
    if [ $STOPPED -eq 0 ]; then
        echo "🔍 ポート3443を使用しているプロセスが見つかりました (PID: $PORT_PID)"
        echo "🛑 プロセスを停止します..."
        kill $PORT_PID 2>/dev/null
        sleep 1
        # まだ残っている場合、強制終了
        if lsof -ti :3443 > /dev/null 2>&1; then
            kill -9 $PORT_PID 2>/dev/null
            echo "✅ プロセスを強制停止しました"
        else
            echo "✅ プロセスを停止しました"
        fi
    fi
else
    echo "✅ ポート3443は使用されていません"
fi

# サーバーログファイルの存在確認
if [ -f server.log ]; then
    echo "📋 サーバーログ: $SCRIPT_DIR/server.log"
fi

