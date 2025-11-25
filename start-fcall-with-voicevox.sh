#!/bin/bash

# F-Call + VOICEVOX 統合起動スクリプト
# F-CallサーバーとVOICEVOXを同時に起動します

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "======================================"
echo "  🚀 F-Call + VOICEVOX 起動"
echo "======================================"
echo ""

# 1. VOICEVOXの起動確認
echo "【1/3】VOICEVOX音声エンジンの確認..."
if curl -s http://localhost:50021/speakers >/dev/null 2>&1; then
  echo "✅ VOICEVOXは既に起動しています"
else
  echo "🎤 VOICEVOXを起動中..."
  
  if [ -d "/Applications/VOICEVOX.app" ]; then
    open -a VOICEVOX
    
    # 起動を待つ（最大30秒）
    echo "⏳ VOICEVOXサーバーの起動を待っています..."
    for i in {1..30}; do
      if curl -s http://localhost:50021/speakers >/dev/null 2>&1; then
        echo "✅ VOICEVOXサーバーが起動しました（${i}秒）"
        break
      fi
      echo -n "."
      sleep 1
    done
    echo ""
    
    # 最終確認
    if ! curl -s http://localhost:50021/speakers >/dev/null 2>&1; then
      echo "⚠️ VOICEVOXの起動に時間がかかっています"
      echo "   手動で確認してください: http://localhost:50021/speakers"
    fi
  else
    echo "❌ VOICEVOXアプリが見つかりません"
    echo "📥 ダウンロード: https://voicevox.hiroshiba.jp/"
    echo ""
    echo "F-Callは標準音声で起動します..."
  fi
fi

echo ""

# 2. F-Callサーバーの起動
echo "【2/3】F-Callサーバーの起動..."

# サーバーが既に起動しているかチェック
if lsof -Pi :3443 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "✅ F-Callサーバーは既に起動しています"
else
  # nodeコマンドのパスを取得
  NODE_CMD=$(which node 2>/dev/null || echo "/usr/local/bin/node")
  
  if [ ! -f "$NODE_CMD" ]; then
    echo "❌ Node.jsが見つかりません"
    exit 1
  fi
  
  # 依存パッケージの確認
  if [ ! -d "node_modules" ]; then
    echo "📦 依存パッケージをインストール中..."
    npm install
  fi
  
  # サーバーを起動
  echo "🚀 F-Callサーバーを起動中..."
  nohup "$NODE_CMD" server.js > server.log 2>&1 &
  SERVER_PID=$!
  echo $SERVER_PID > server.pid
  echo "✅ サーバー起動中（PID: $SERVER_PID）"
  
  # 起動を待つ
  echo "⏳ サーバーの起動を待っています..."
  for i in {1..20}; do
    if lsof -Pi :3443 -sTCP:LISTEN -t >/dev/null 2>&1; then
      echo "✅ F-Callサーバーが起動しました（${i}秒）"
      break
    fi
    sleep 0.5
  done
fi

echo ""

# 3. ブラウザを開く
echo "【3/3】ブラウザで各画面を開いています..."
sleep 1

BASE_URL="https://localhost:3443"

# Safariを優先
if [ -d "/Applications/Safari.app" ]; then
  BROWSER="Safari"
  open -a "$BROWSER" "$BASE_URL/admin.html"
  sleep 0.5
  open -a "$BROWSER" "$BASE_URL/index.html"
  sleep 0.5
  open -a "$BROWSER" "$BASE_URL/staff.html"
  sleep 0.5
  open -a "$BROWSER" "$BASE_URL/display.html"
elif [ -d "/Applications/Google Chrome.app" ]; then
  BROWSER="Google Chrome"
  open -a "$BROWSER" "$BASE_URL/admin.html"
  sleep 0.5
  open -a "$BROWSER" "$BASE_URL/index.html"
  sleep 0.5
  open -a "$BROWSER" "$BASE_URL/staff.html"
  sleep 0.5
  open -a "$BROWSER" "$BASE_URL/display.html"
else
  open "$BASE_URL/admin.html"
  sleep 0.5
  open "$BASE_URL/index.html"
  sleep 0.5
  open "$BASE_URL/staff.html"
  sleep 0.5
  open "$BASE_URL/display.html"
fi

echo ""
echo "======================================"
echo "✅ すべての起動が完了しました！"
echo "======================================"
echo ""
echo "📋 起動中のサービス:"
echo "  ✓ F-Callサーバー: https://localhost:3443"

if curl -s http://localhost:50021/speakers >/dev/null 2>&1; then
  echo "  ✓ VOICEVOXサーバー: http://localhost:50021"
  echo ""
  echo "🎤 VOICEVOX連携が有効です"
  echo "   管理画面で「VOICEVOX を使用する」にチェックを入れてください"
else
  echo "  ⚠️  VOICEVOXサーバー: 起動していません"
  echo ""
  echo "💡 VOICEVOXを使用する場合:"
  echo "   ./start-voicevox.sh を実行してください"
fi

echo ""
echo "📱 開いた画面:"
echo "  - 管理画面: $BASE_URL/admin.html"
echo "  - 受付画面: $BASE_URL/index.html"
echo "  - スタッフ画面: $BASE_URL/staff.html"
echo "  - 待合室表示: $BASE_URL/display.html"
echo ""
echo "🛑 停止するには: ./stop-fcall.sh"
echo "======================================"
echo ""

