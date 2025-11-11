#!/bin/bash

# F-Call サーバー起動スクリプト（静默版）
# このスクリプトはターミナルウィンドウを表示せずにサーバーを起動します

# スクリプトのディレクトリに移動
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# PATHを設定（AppleScriptから実行する場合に必要）
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# nodeコマンドのパスを取得
NODE_CMD=$(which node 2>/dev/null || echo "/usr/local/bin/node")

# nodeが存在するか確認
if [ ! -f "$NODE_CMD" ]; then
    echo "エラー: Node.jsが見つかりません。Node.jsをインストールしてください。" >&2
    exit 1
fi

# 依存パッケージがインストールされているか確認
if [ ! -d "node_modules" ]; then
    # エラーログファイルに記録
    echo "依存パッケージをインストールしています..." >> "$SCRIPT_DIR/startup-errors.log" 2>&1
    npm install >> "$SCRIPT_DIR/startup-errors.log" 2>&1
fi

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
nohup "$NODE_CMD" server.js >> server.log 2>> server.log &
SERVER_PID=$!

# PIDをファイルに保存
echo $SERVER_PID > server.pid

# 少し待機してから起動確認
sleep 2

# サーバーが起動するまで待機（最大15秒）
STARTED=0
for i in {1..26}; do
    if lsof -Pi :3443 -sTCP:LISTEN -t >/dev/null 2>&1; then
        STARTED=1
        break
    fi
    sleep 0.5
done

# サーバーが起動しなかった場合のエラーログ
if [ $STARTED -eq 0 ]; then
    echo "サーバーが起動しませんでした。ログを確認してください: server.log" >> "$SCRIPT_DIR/startup-errors.log"
    # エラー通知（macOSの場合）
    if command -v osascript >/dev/null 2>&1; then
        osascript -e 'display notification "F-Callサーバーが起動しませんでした。ログを確認してください。" with title "F-Call起動エラー"' 2>/dev/null || true
    fi
fi

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

