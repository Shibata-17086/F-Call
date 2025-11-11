#!/bin/bash

# F-Call アプリケーション作成スクリプト（AppleScript版）
# このスクリプトはAutomatorアプリケーションを作成します

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DESKTOP_DIR="$HOME/Desktop"

# デスクトップディレクトリが存在しない場合は作成
if [ ! -d "$DESKTOP_DIR" ]; then
    mkdir -p "$DESKTOP_DIR"
fi

APP_NAME="F-Call起動.app"
APP_PATH="$DESKTOP_DIR/$APP_NAME"

echo "📱 F-Call アプリケーションを作成しています..."

# 既存のアプリケーションを削除
if [ -d "$APP_PATH" ]; then
    echo "⚠️  既存のアプリケーションを削除します..."
    rm -rf "$APP_PATH"
fi

# osacompileを使用してAppleScriptアプリケーションを作成
# 静默版スクリプトを使用（ターミナルを表示しない）
cat > /tmp/fcall-launcher.applescript <<'APPLESCRIPT'
on run
    try
        -- PATHを設定してスクリプトを実行
        do shell script "export PATH='/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH' && cd '/Users/j-fukudamac/Desktop/F-Call' && bash ./start-fcall-quiet.sh" without altering line endings
    on error errMsg
        -- エラーが発生した場合、ダイアログを表示
        display dialog "サーバー起動エラー: " & errMsg buttons {"OK"} default button "OK" with icon stop
    end try
end run
APPLESCRIPT

# AppleScriptをアプリケーションとしてコンパイル
osacompile -o "$APP_PATH" /tmp/fcall-launcher.applescript

# クリーンアップ
rm -f /tmp/fcall-launcher.applescript

# アイコンを設定（オプション）
# カスタムアイコンがある場合は、ここで設定できます

echo "✅ アプリケーションを作成しました: $APP_PATH"
echo ""
echo "📋 使用方法:"
echo "  1. デスクトップの「F-Call起動.app」をダブルクリック"
echo "  2. ターミナルが開き、サーバーが起動します"
echo "  3. ブラウザで各画面が自動的に開きます"
echo ""
echo "💡 ヒント: アプリケーションを右クリック >「情報を見る」でアイコンを変更できます"

