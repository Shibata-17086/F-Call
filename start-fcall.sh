#!/bin/bash

# F-Call サーバー起動スクリプト
# このスクリプトはサーバーを起動し、ブラウザで各画面を開きます

# スクリプトのディレクトリに移動
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# PATHを設定（AppleScriptから実行する場合に必要）
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# nodeコマンドのパスを取得
NODE_CMD=$(which node 2>/dev/null || echo "/usr/local/bin/node")

# nodeが存在するか確認
if [ ! -f "$NODE_CMD" ]; then
    echo "❌ エラー: Node.jsが見つかりません。Node.jsをインストールしてください。"
    exit 1
fi

# 依存パッケージがインストールされているか確認
if [ ! -d "node_modules" ]; then
    echo "📦 依存パッケージをインストールしています..."
    npm install
fi

# サーバーが既に起動しているかチェック
if lsof -Pi :3443 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  サーバーは既に起動しています（ポート3443）"
    echo "📋 ブラウザを開きます..."
else
    echo "🚀 F-Call サーバーを起動しています..."
    
    # サーバーをバックグラウンドで起動
    nohup "$NODE_CMD" server.js > server.log 2>&1 &
    SERVER_PID=$!
    echo "✅ サーバー起動中... (PID: $SERVER_PID)"
    
    # サーバーが起動するまで待機（最大10秒）
    echo "⏳ サーバーの起動を待っています..."
    for i in {1..20}; do
        if lsof -Pi :3443 -sTCP:LISTEN -t >/dev/null ; then
            echo "✅ サーバーが起動しました！"
            break
        fi
        sleep 0.5
    done
    
    # PIDをファイルに保存（後で停止するため）
    echo $SERVER_PID > server.pid
    echo "💾 サーバーPIDを保存しました: $SERVER_PID"
fi

# 少し待機してからブラウザを開く
sleep 1

# ブラウザで各画面を開く
echo "🌐 ブラウザで各画面を開いています..."

# ローカルホストのURL
BASE_URL="https://localhost:3443"

# 使用するブラウザを検出（優先順位: Chrome > Safari > Edge > デフォルト）
if [ -d "/Applications/Google Chrome.app" ]; then
    BROWSER="Google Chrome"
elif [ -d "/Applications/Safari.app" ]; then
    BROWSER="Safari"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
    BROWSER="Microsoft Edge"
else
    BROWSER=""
fi

# ブラウザで各画面を開く（少し間隔を空けて開く）
if [ -n "$BROWSER" ]; then
    open -a "$BROWSER" "$BASE_URL/admin.html"
    sleep 0.5
    open -a "$BROWSER" "$BASE_URL/index.html"
    sleep 0.5
    open -a "$BROWSER" "$BASE_URL/staff.html"
    sleep 0.5
    open -a "$BROWSER" "$BASE_URL/display.html"
else
    # デフォルトブラウザを使用
    open "$BASE_URL/admin.html"
    sleep 0.5
    open "$BASE_URL/index.html"
    sleep 0.5
    open "$BASE_URL/staff.html"
    sleep 0.5
    open "$BASE_URL/display.html"
fi

echo "✅ 完了！"
echo ""
echo "📋 開いた画面:"
echo "  - 管理画面: $BASE_URL/admin.html"
echo "  - 受付画面: $BASE_URL/index.html"
echo "  - スタッフ画面: $BASE_URL/staff.html"
echo "  - 待合室表示: $BASE_URL/display.html"
echo ""
echo "🛑 サーバーを停止するには: ./stop-fcall.sh を実行するか、"
echo "   server.pid ファイルを確認して kill コマンドを使用してください"

