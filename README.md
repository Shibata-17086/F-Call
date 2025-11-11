# F-Call システム

待合室の呼び出しシステム（F-Call）は、病院や歯科医院などの待合室で患者を効率的に呼び出すためのシステムです。

## 機能

- **受付での番号発行**：患者が来院したら受付で番号を発行
- **スタッフによる呼び出し**：診察の準備ができたらスタッフが患者を呼び出し
- **待合室での大画面表示**：現在呼ばれている番号と履歴を表示
- **席（診察室）の管理**：システム管理者が席の追加・削除・編集
- **HTTPS対応**：暗号化通信によるセキュアな運用

## システム構成

- **受付画面** (`index.html`): 番号発行用の画面
- **スタッフ画面** (`staff.html`): スタッフが患者を呼び出す画面
- **待合室表示** (`display.html`): 待合室に表示する大画面用
- **管理画面** (`admin.html`): 席の管理や設定を行う画面
- **サーバー** (`server.js`): すべてのクライアント間の通信を管理（HTTPS対応）

## インストールと起動方法

### 必要条件

- Node.js (バージョン14以上推奨)
- npm (Node.jsに付属)
- OpenSSL (証明書生成用)

### インストール手順

1. リポジトリをクローン
```bash
git clone https://github.com/Shibata-17086/F-Call.git
cd F-Call
```

2. 依存パッケージをインストール
```bash
npm install
```

3. 証明書の設定（既存の証明書を使用する場合）
リポジトリには自己署名証明書（`server.crt`, `server.key`）が含まれていますが、新しく生成することも可能です。

### Macでの簡単起動（デスクトップショートカット）

Macで使用する場合は、デスクトップショートカットを作成できます：

1. **デスクトップショートカットの作成**
   ```bash
   cd /Users/j-fukudamac/Desktop/F-Call
   ./create-app.sh
   ```

2. **デスクトップの「F-Call起動.app」をダブルクリック**
   - サーバーが自動的に起動します
   - ブラウザで各画面が自動的に開きます

詳細な手順は [MAC_SETUP.md](./MAC_SETUP.md) を参照してください。

### サーバーの停止

**デスクトップアプリケーションから:**
1. デスクトップの「F-Call停止.app」をダブルクリック

**ターミナルから:**
```bash
cd /Users/j-fukudamac/Desktop/F-Call
./stop-fcall.sh
```

停止アプリケーションの作成：
```bash
cd /Users/j-fukudamac/Desktop/F-Call
./create-stop-app.sh
```

### 新しい証明書を生成する場合
```bash
# 自己署名証明書の生成（100年有効、ホスト名：F-call）
openssl req -x509 -nodes -days 36500 -newkey rsa:2048 \
  -keyout server.key -out server.crt \
  -subj "/CN=F-call" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.1.100"
```
※ IPアドレス部分（192.168.1.100）は実際のサーバーのIPアドレスに変更してください

### サーバーの起動

```bash
node server.js
```

サーバーが起動すると、HTTPSアクセス可能なURLが表示されます（ポート3443）。

## Raspberry Piでの完全セットアップ手順

Raspberry Piでサーバーを実行することで、院内LANで常時稼働させることができます。

### 1. Raspberry Pi の初期設定

```bash
# Raspberry Pi OSアップデート
sudo apt update && sudo apt upgrade -y

# 必要なパッケージをインストール
sudo apt install -y git nodejs npm openssl curl
```

### 2. Node.js の最新バージョンをインストール（推奨）

```bash
# Node.js 20.x をインストール
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# バージョン確認
node -v
npm -v
```

### 3. F-Callシステムのセットアップ

```bash
# ホームディレクトリにクローン
cd /home/pi
git clone https://github.com/Shibata-17086/F-Call.git
cd F-Call

# 依存パッケージをインストール
npm install

# ファイル権限の設定
chmod 600 server.key
chmod 644 server.crt
```

### 4. 証明書の設定

#### 既存の証明書を使用する場合
リポジトリに含まれている証明書をそのまま使用できます。

#### カスタム証明書を生成する場合
```bash
# ラズパイのIPアドレスを確認
hostname -I

# 新しい自己署名証明書を生成（IPアドレスを実際の値に変更）
openssl req -x509 -nodes -days 36500 -newkey rsa:2048 \
  -keyout server.key -out server.crt \
  -subj "/CN=F-call" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.1.100,DNS:raspberrypi.local"

# ファイル権限の設定
chmod 600 server.key
chmod 644 server.crt
```

### 5. ファイアウォール設定

#### UFWを使用する場合（推奨）

```bash
# UFWをインストール（見つからない場合）
sudo apt install -y ufw

# UFWを有効化
sudo ufw enable

# HTTPSポート（3443）を開放
sudo ufw allow 3443

# HTTPリダイレクト用ポート（3001）を開放
sudo ufw allow 3001

# 設定確認
sudo ufw status
```

#### UFWが利用できない場合：iptablesを直接使用

```bash
# 現在のiptables設定を確認
sudo iptables -L

# HTTPSポート（3443）を開放
sudo iptables -A INPUT -p tcp --dport 3443 -j ACCEPT

# HTTPリダイレクト用ポート（3001）を開放
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT

# 設定を永続化（iptables-persistentをインストール）
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

#### 院内LANのみの場合：ファイアウォール無効化

院内LANでの使用のみで、外部からのアクセスがない環境では、ファイアウォールを無効にすることも可能です：

```bash
# UFWを無効化（インストールされている場合）
sudo ufw disable

# iptablesをクリア（必要に応じて）
sudo iptables -F
sudo iptables -X
sudo iptables -Z
```

**注意**: ファイアウォールを無効にする場合は、ルーターやネットワーク機器でのアクセス制限を確認してください。

### 6. 自動起動設定（systemdを使用）

```bash
# サービスファイルを作成
sudo nano /etc/systemd/system/fcall.service
```

以下の内容を貼り付け:
```ini
[Unit]
Description=F-Call HTTPS Server
After=network.target
Wants=network.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/home/pi/F-Call
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

# ログ設定
StandardOutput=journal
StandardError=journal
SyslogIdentifier=fcall

[Install]
WantedBy=multi-user.target
```

```bash
# サービスの有効化と起動
sudo systemctl daemon-reload
sudo systemctl enable fcall.service
sudo systemctl start fcall.service

# サービスのステータス確認
sudo systemctl status fcall.service

# ログの確認
sudo journalctl -u fcall.service -f
```

### 7. プロセス管理（pm2を使用する場合）

systemdの代わりにpm2を使用することも可能です:

```bash
# pm2をグローバルインストール
sudo npm install -g pm2

# F-Callサーバーを起動
pm2 start server.js --name "fcall"

# 自動起動設定
pm2 startup
pm2 save

# ステータス確認
pm2 status
pm2 logs fcall
```

### 8. ネットワーク設定の確認

```bash
# IPアドレスの確認
hostname -I

# ポート3443でリッスンしているか確認
sudo netstat -tlnp | grep 3443

# 動作確認（別端末から）
curl -k https://[ラズパイのIP]:3443
```

## アクセス方法

### HTTPS接続（推奨）
- 管理画面: `https://[ラズパイのIP]:3443/admin.html`
- 受付画面: `https://[ラズパイのIP]:3443/index.html`
- スタッフ画面: `https://[ラズパイのIP]:3443/staff.html`
- 待合室表示: `https://[ラズパイのIP]:3443/display.html`

### 初回アクセス時の証明書警告について
自己署名証明書を使用しているため、初回アクセス時にブラウザで「この接続は安全ではありません」等の警告が表示されますが、以下の手順で回避できます：

1. **Chrome/Firefox**: 「詳細設定」→「[サイト]にアクセスする（安全ではありません）」
2. **Safari**: 「詳細」→「このWebサイトに進む」
3. **キーチェーンで信頼設定**（Mac）: `server.crt`をダブルクリック→「常に信頼」に設定

## 運用に関する注意点

### セキュリティ設定
- **院内LANのみでの運用を強く推奨**
- 外部からのアクセスはファイアウォールで遮断
- 定期的にOS・Node.jsのアップデートを実施

### 定期メンテナンス
```bash
# システムアップデート
sudo apt update && sudo apt upgrade -y

# サービス再起動
sudo systemctl restart fcall.service

# ログローテーション確認
sudo journalctl --vacuum-time=30d
```

### バックアップ
```bash
# 重要ファイルのバックアップ
cp server.key server.key.backup
cp server.crt server.crt.backup
cp server.js server.js.backup
```

### パフォーマンス設定（必要に応じて）
```bash
# メモリ設定（ラズパイ4以上推奨）
echo 'gpu_mem=16' | sudo tee -a /boot/config.txt

# 再起動
sudo reboot
```

## トラブルシューティング

### サーバーが起動しない場合
```bash
# サービスログの確認
sudo journalctl -u fcall.service -n 50

# Node.jsのバージョン確認
node -v  # 14以上が必要

# 証明書ファイルの確認
ls -la server.key server.crt
```

### 接続できない場合
```bash
# ポートの確認
sudo netstat -tlnp | grep 3443

# ファイアウォールの確認
sudo ufw status

# IPアドレスの確認
hostname -I
```

### 証明書エラーの場合
```bash
# 証明書の内容確認
openssl x509 -in server.crt -text -noout

# 新しい証明書の生成（必要に応じて）
openssl req -x509 -nodes -days 36500 -newkey rsa:2048 \
  -keyout server.key -out server.crt \
  -subj "/CN=F-call" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$(hostname -I | cut -d' ' -f1)"
```

## 画面の説明

### 受付画面（index.html）
- 「受付番号を発行」ボタンで新しい番号を発券
- 現在の待ち人数・予想待ち時間・自分の番号を表示

### スタッフ画面（staff.html）
- 発券中の番号リストから呼び出し番号を選択
- 呼び出し履歴・現在の呼び出し番号を表示
- 座席状況の確認と診察完了処理
- サーバー全体リセットも可能

### 待合室画面（display.html）
- 現在呼び出し中の番号・呼び出し履歴を大きく表示
- 音声合成による呼び出しアナウンス（ブラウザ対応）

### 管理画面（admin.html）
- リアルタイム統計（待ち人数、平均待ち時間、利用可能座席等）
- 営業時間設定・座席管理
- 発券履歴・呼び出し履歴の管理
- システム全体の設定変更

## カスタマイズ

- **デザイン**: 各HTMLファイルのCSSを編集
- **ポート番号**: `server.js`とクライアントJSファイルの`getServerUrl`関数を変更
- **証明書**: より長い有効期限や組織情報を含む証明書に変更可能

---

## 注意事項
- HTTPSサーバーが起動していないと、各画面は動作しません
- 自己署名証明書使用時は初回アクセス時に警告が表示されます
- 院内LANでの運用を前提としており、外部公開は推奨しません

---
## ライセンス
- Developed by Koki Shibata, Kenngo Sato & Microwave Lab.

