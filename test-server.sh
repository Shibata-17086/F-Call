#!/bin/bash

# サーバー起動テストスクリプト
# このスクリプトでサーバーが正常に起動するかテストできます

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🔍 サーバー起動テストを開始します..."
echo ""

# PATHを設定
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# nodeコマンドのパスを取得
NODE_CMD=$(which node 2>/dev/null || echo "/usr/local/bin/node")

echo "1. Node.jsの確認"
if [ -f "$NODE_CMD" ]; then
    echo "   ✅ Node.jsが見つかりました: $NODE_CMD"
    echo "   バージョン: $($NODE_CMD --version)"
else
    echo "   ❌ Node.jsが見つかりません"
    exit 1
fi

echo ""
echo "2. 依存パッケージの確認"
if [ -d "node_modules" ]; then
    echo "   ✅ node_modulesが存在します"
else
    echo "   ⚠️  node_modulesが存在しません。インストールします..."
    npm install
fi

echo ""
echo "3. 証明書ファイルの確認"
if [ -f "server.key" ] && [ -f "server.crt" ]; then
    echo "   ✅ 証明書ファイルが存在します"
else
    echo "   ❌ 証明書ファイルが見つかりません"
    exit 1
fi

echo ""
echo "4. ポート3443の確認"
if lsof -Pi :3443 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "   ⚠️  ポート3443は既に使用されています"
    echo "   既存のサーバーを停止しますか？ (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        ./stop-fcall.sh
    else
        echo "   テストを終了します"
        exit 1
    fi
else
    echo "   ✅ ポート3443は利用可能です"
fi

echo ""
echo "5. サーバーを起動します..."
nohup "$NODE_CMD" server.js > server.log 2>&1 &
SERVER_PID=$!
echo "   サーバーPID: $SERVER_PID"

echo ""
echo "6. サーバーの起動を待機します..."
for i in {1..20}; do
    if lsof -Pi :3443 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "   ✅ サーバーが起動しました！"
        break
    fi
    sleep 0.5
done

echo ""
echo "7. サーバーログを確認します..."
echo "   最後の10行:"
tail -10 server.log

echo ""
echo "8. サーバーの状態を確認します..."
if lsof -Pi :3443 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "   ✅ サーバーは正常に動作しています"
    echo ""
    echo "🌐 以下のURLでアクセスできます:"
    echo "   - 管理画面: https://localhost:3443/admin.html"
    echo "   - 受付画面: https://localhost:3443/index.html"
    echo "   - スタッフ画面: https://localhost:3443/staff.html"
    echo "   - 待合室表示: https://localhost:3443/display.html"
    echo ""
    echo "🛑 サーバーを停止するには: ./stop-fcall.sh を実行してください"
else
    echo "   ❌ サーバーが起動していません"
    echo "   ログを確認してください: cat server.log"
    exit 1
fi

