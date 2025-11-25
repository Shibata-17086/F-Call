#!/bin/bash

# VOICEVOXサーバー起動スクリプト

echo "🎤 VOICEVOX連携セットアップ"
echo "======================================"

# VOICEVOXがインストールされているか確認
VOICEVOX_APP="/Applications/VOICEVOX.app"
VOICEVOX_ENGINE=""

# VOICEVOXアプリの検索
if [ -d "$VOICEVOX_APP" ]; then
  echo "✅ VOICEVOXアプリが見つかりました: $VOICEVOX_APP"
  
  # VOICEVOXエンジンのパスを探す
  VOICEVOX_ENGINE="$VOICEVOX_APP/Contents/MacOS/VOICEVOX"
  
  if [ ! -f "$VOICEVOX_ENGINE" ]; then
    # 別のパスを試す
    VOICEVOX_ENGINE="$VOICEVOX_APP/Contents/Resources/engine/run"
  fi
else
  echo "❌ VOICEVOXアプリが見つかりません"
  echo ""
  echo "📥 VOICEVOXをインストールしてください:"
  echo "   https://voicevox.hiroshiba.jp/"
  echo ""
  exit 1
fi

# ポート50021が既に使用されているか確認
if lsof -Pi :50021 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "✅ VOICEVOXサーバーは既に起動しています（ポート: 50021）"
  echo ""
  echo "接続テスト中..."
  
  # 接続テスト
  if curl -s http://localhost:50021/speakers >/dev/null 2>&1; then
    echo "✅ VOICEVOXサーバーに接続できました"
    
    # 利用可能な話者を表示
    echo ""
    echo "📢 利用可能なキャラクター:"
    curl -s http://localhost:50021/speakers | python3 -m json.tool 2>/dev/null | grep -E '"name"|"speaker_uuid"' | head -20 || echo "キャラクター情報の取得に失敗"
  else
    echo "⚠️ ポート50021は使用中ですが、VOICEVOXサーバーではない可能性があります"
  fi
else
  echo "🚀 VOICEVOXサーバーを起動します..."
  echo ""
  
  # VOICEVOXアプリを起動
  echo "VOICEVOXアプリを起動中..."
  open -a VOICEVOX
  
  # サーバーが起動するまで待機
  echo "サーバーの起動を待っています..."
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
  if curl -s http://localhost:50021/speakers >/dev/null 2>&1; then
    echo "✅ VOICEVOXサーバーに接続成功"
    echo ""
    echo "📢 利用可能なキャラクター:"
    curl -s http://localhost:50021/speakers | python3 -m json.tool 2>/dev/null | grep -E '"name"' | head -10 || echo "キャラクター情報の取得に失敗"
  else
    echo "❌ VOICEVOXサーバーの起動に失敗しました"
    echo ""
    echo "手動で起動してください:"
    echo "  1. Finderでアプリケーション > VOICEVOX を開く"
    echo "  2. または: open -a VOICEVOX"
    exit 1
  fi
fi

echo ""
echo "======================================"
echo "✅ VOICEVOX連携の準備が完了しました"
echo "======================================"
echo ""
echo "管理画面で「VOICEVOX を使用する」にチェックを入れてください"
echo "URL: https://localhost:3443/admin.html"
echo ""

