#!/bin/bash

# F-Call デスクトップショートカット作成スクリプト
# このスクリプトはデスクトップにF-Call起動用のアプリケーションを作成します

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DESKTOP_DIR="$HOME/Desktop"
APP_NAME="F-Call起動.app"
APP_PATH="$DESKTOP_DIR/$APP_NAME"

echo "📱 F-Call デスクトップショートカットを作成しています..."

# Automatorアプリケーションの内容を作成
mkdir -p "$APP_PATH/Contents"
mkdir -p "$APP_PATH/Contents/MacOS"
mkdir -p "$APP_PATH/Contents/Resources"

# Info.plistを作成
cat > "$APP_PATH/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundleIdentifier</key>
    <string>com.fcall.launcher</string>
    <key>CFBundleName</key>
    <string>F-Call起動</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
</dict>
</plist>
EOF

# ランチャースクリプトを作成
cat > "$APP_PATH/Contents/MacOS/launcher" <<'EOF'
#!/bin/bash
# F-Call起動スクリプト

SCRIPT_DIR="/Users/j-fukudamac/Desktop/F-Call"
cd "$SCRIPT_DIR"
./start-fcall.sh
EOF

# 実行権限を付与
chmod +x "$APP_PATH/Contents/MacOS/launcher"

# アイコンを設定（オプション: デフォルトのターミナルアイコンを使用）
# カスタムアイコンがある場合は、ここで設定できます

echo "✅ デスクトップショートカットを作成しました: $APP_PATH"
echo ""
echo "📋 使用方法:"
echo "  1. デスクトップの「F-Call起動.app」をダブルクリック"
echo "  2. サーバーが起動し、ブラウザで各画面が開きます"
echo ""
echo "⚠️  注意: 初回実行時はセキュリティ警告が表示される場合があります"
echo "   システム環境設定 > セキュリティとプライバシー > 一般 で許可してください"

