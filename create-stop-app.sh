#!/bin/bash

# F-Call サーバー停止アプリケーション作成スクリプト
# このスクリプトはデスクトップにサーバー停止用のアプリケーションを作成します

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DESKTOP_DIR="$HOME/Desktop"

# デスクトップディレクトリが存在しない場合は作成
if [ ! -d "$DESKTOP_DIR" ]; then
    mkdir -p "$DESKTOP_DIR"
fi

APP_NAME="F-Call停止.app"
APP_PATH="$DESKTOP_DIR/$APP_NAME"

echo "📱 F-Call サーバー停止アプリケーションを作成しています..."

# 既存のアプリケーションを削除
if [ -d "$APP_PATH" ]; then
    echo "⚠️  既存のアプリケーションを削除します..."
    rm -rf "$APP_PATH"
fi

# osacompileを使用してAppleScriptアプリケーションを作成
cat > /tmp/fcall-stop.applescript <<'APPLESCRIPT'
on run
    try
        -- PATHを設定してスクリプトを実行
        do shell script "export PATH='/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH' && cd '/Users/j-fukudamac/Desktop/F-Call' && bash ./stop-fcall.sh" without altering line endings
        
        -- 成功メッセージを表示
        display dialog "F-Callサーバーを停止しました。" buttons {"OK"} default button "OK" with icon note
    on error errMsg
        -- エラーが発生した場合、ダイアログを表示
        display dialog "サーバー停止エラー: " & errMsg buttons {"OK"} default button "OK" with icon stop
    end try
end run
APPLESCRIPT

# AppleScriptをアプリケーションとしてコンパイル
osacompile -o "$APP_PATH" /tmp/fcall-stop.applescript

# クリーンアップ
rm -f /tmp/fcall-stop.applescript

echo "✅ アプリケーションを作成しました: $APP_PATH"
echo ""
echo "📋 使用方法:"
echo "  1. デスクトップの「F-Call停止.app」をダブルクリック"
echo "  2. サーバーが停止されます"
echo ""
echo "💡 ヒント: アプリケーションを右クリック >「情報を見る」でアイコンを変更できます"

