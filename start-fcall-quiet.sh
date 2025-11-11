#!/bin/bash

# F-Call サーバー起動スクリプト（静默版）
# このスクリプトはターミナルウィンドウを表示せずにサーバーを起動します

# スクリプトのディレクトリに移動
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# サーバーが既に起動しているかチェック
if lsof -Pi :3443 -sTCP:LISTEN -t >/dev/null 2>&1; then
    # サーバーが既に起動している場合、ブラウザだけを開く
    BASE_URL="https://localhost:3443"
    
    # ブラウザを検出
    if [ -d "/Applications/Google Chrome.app" ]; then
        BROWSER="Google Chrome"
    elif [ -d "/Applications/Safari.app" ]; then
        BROWSER="Safari"
    elif [ -d "/Applications/Microsoft Edge.app" ]; then
        BROWSER="Microsoft Edge"
    else
        BROWSER=""
    fi
    
    # ブラウザで各画面を開く
    if [ -n "$BROWSER" ]; then
        open -a "$BROWSER" "$BASE_URL/admin.html" 2>/dev/null
        sleep 0.5
        open -a "$BROWSER" "$BASE_URL/index.html" 2>/dev/null
        sleep 0.5
        open -a "$BROWSER" "$BASE_URL/staff.html" 2>/dev/null
        sleep 0.5
        open -a "$BROWSER" "$BASE_URL/display.html" 2>/dev/null
    else
        open "$BASE_URL/admin.html" 2>/dev/null
        sleep 0.5
        open "$BASE_URL/index.html" 2>/dev/null
        sleep 0.5
        open "$BASE_URL/staff.html" 2>/dev/null
        sleep 0.5
        open "$BASE_URL/display.html" 2>/dev/null
    fi
    exit 0
fi

# サーバーをバックグラウンドで起動
nohup node server.js > server.log 2>&1 &
SERVER_PID=$!

# PIDをファイルに保存
echo $SERVER_PID > server.pid

# サーバーが起動するまで待機（最大15秒）
for i in {1..30}; do
    if lsof -Pi :3443 -sTCP:LISTEN -t >/dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

# 少し待機してからブラウザを開く
sleep 2

# ブラウザで各画面を開く
BASE_URL="https://localhost:3443"

# ブラウザを検出
if [ -d "/Applications/Google Chrome.app" ]; then
    BROWSER="Google Chrome"
elif [ -d "/Applications/Safari.app" ]; then
    BROWSER="Safari"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
    BROWSER="Microsoft Edge"
else
    BROWSER=""
fi

# ブラウザで各画面を開く
if [ -n "$BROWSER" ]; then
    open -a "$BROWSER" "$BASE_URL/admin.html" 2>/dev/null
    sleep 0.5
    open -a "$BROWSER" "$BASE_URL/index.html" 2>/dev/null
    sleep 0.5
    open -a "$BROWSER" "$BASE_URL/staff.html" 2>/dev/null
    sleep 0.5
    open -a "$BROWSER" "$BASE_URL/display.html" 2>/dev/null
else
    open "$BASE_URL/admin.html" 2>/dev/null
    sleep 0.5
    open "$BASE_URL/index.html" 2>/dev/null
    sleep 0.5
    open "$BASE_URL/staff.html" 2>/dev/null
    sleep 0.5
    open "$BASE_URL/display.html" 2>/dev/null
fi

exit 0

