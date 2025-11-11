# MacでのF-Callセットアップガイド

## デスクトップショートカットの作成方法

### 方法1: 自動スクリプトを使用（推奨）

```bash
cd /Users/j-fukudamac/Desktop/F-Call
./create-app.sh
```

これでデスクトップに「F-Call起動.app」が作成されます。

**注意**: 初回実行時にセキュリティ警告が表示される場合があります。
システム環境設定 > セキュリティとプライバシー > 一般 で「開く」をクリックして許可してください。

### 方法2: Automatorを使用して手動で作成

1. **Automatorを起動**
   - アプリケーション > Automator を開く

2. **アプリケーションを作成**
   - 「アプリケーション」を選択して「選択」をクリック

3. **シェルスクリプトを追加**
   - 左側の「ユーティリティ」から「シェルスクリプトを実行」をドラッグ&ドロップ

4. **スクリプトを入力**
   ```bash
   cd /Users/j-fukudamac/Desktop/F-Call
   ./start-fcall.sh
   ```

5. **保存**
   - 「ファイル」>「保存」を選択
   - 名前: 「F-Call起動」
   - 場所: デスクトップ
   - ファイル形式: アプリケーション

6. **アイコンを設定（オプション）**
   - アプリケーションを右クリック >「情報を見る」
   - アイコンをドラッグ&ドロップで変更

## 使用方法

### サーバー起動とブラウザ起動

1. **デスクトップの「F-Call起動.app」をダブルクリック**
   - 初回実行時はセキュリティ警告が表示される場合があります
   - システム環境設定 > セキュリティとプライバシー > 一般 で「開く」をクリック

2. **サーバーが自動的に起動します**
   - バックグラウンドで起動するため、ターミナルウィンドウは表示されません
   - サーバーのログは `server.log` に保存されます

3. **ブラウザで以下の画面が自動的に開きます：**
   - 管理画面: https://localhost:3443/admin.html
   - 受付画面: https://localhost:3443/index.html
   - スタッフ画面: https://localhost:3443/staff.html
   - 待合室表示: https://localhost:3443/display.html

**証明書警告について:**
自己署名証明書を使用しているため、初回アクセス時に警告が表示されます。
「詳細設定」>「localhostにアクセスする（安全ではありません）」をクリックして進んでください。

### サーバー停止

```bash
cd /Users/j-fukudamac/Desktop/F-Call
./stop-fcall.sh
```

または、ターミナルで以下を実行：

```bash
cd /Users/j-fukudamac/Desktop/F-Call
kill $(cat server.pid)
```

## トラブルシューティング

### サーバーが起動しない場合

#### 1. テストスクリプトを実行

まず、サーバーが正常に起動するかテストしてください：

```bash
cd /Users/j-fukudamac/Desktop/F-Call
./test-server.sh
```

このスクリプトは以下を確認します：
- Node.jsのインストール状況
- 依存パッケージのインストール状況
- 証明書ファイルの存在
- ポートの利用可能性
- サーバーの起動

#### 2. ログファイルを確認

サーバーのログを確認してください：

```bash
cd /Users/j-fukudamac/Desktop/F-Call
cat server.log
```

エラーログがある場合：

```bash
cat startup-errors.log
```

#### 3. 手動でサーバーを起動

スクリプトではなく、手動でサーバーを起動してエラーを確認：

```bash
cd /Users/j-fukudamac/Desktop/F-Call
node server.js
```

#### 4. よくある問題と対処法

**問題: Node.jsが見つからない**
```bash
# Node.jsのパスを確認
which node

# Node.jsがインストールされていない場合
brew install node
# または、公式サイトからインストール: https://nodejs.org/
```

**問題: 依存パッケージがインストールされていない**
```bash
cd /Users/j-fukudamac/Desktop/F-Call
npm install
```

**問題: ポート3443が既に使用されている**
```bash
# 使用しているプロセスを確認
lsof -i :3443

# プロセスを停止
./stop-fcall.sh
# または
kill $(lsof -ti :3443)
```

**問題: 証明書ファイルが見つからない**
```bash
# 証明書ファイルを確認
ls -la server.key server.crt

# 証明書ファイルが存在しない場合、生成が必要です
# README.mdの「新しい証明書を生成する場合」を参照
```

### 初回実行時のセキュリティ警告

Macのセキュリティ設定により、初回実行時に警告が表示される場合があります。

**対処方法:**
1. システム環境設定 > セキュリティとプライバシー > 一般 を開く
2. 「開く」ボタンをクリックして許可

### ポートが既に使用されている場合

サーバーが既に起動している場合、以下のメッセージが表示されます：

```
⚠️  サーバーは既に起動しています（ポート3443）
```

この場合、既存のサーバーを使用してブラウザが開きます。

### サーバーが起動しない場合

1. Node.jsがインストールされているか確認：
   ```bash
   node --version
   ```

2. 必要なパッケージがインストールされているか確認：
   ```bash
   cd /Users/j-fukudamac/Desktop/F-Call
   npm install
   ```

3. サーバーログを確認：
   ```bash
   cat server.log
   ```

### ブラウザが開かない場合

手動でブラウザを開いて以下のURLにアクセス：
- https://localhost:3443/admin.html
- https://localhost:3443/index.html
- https://localhost:3443/staff.html
- https://localhost:3443/display.html

**証明書警告について:**
自己署名証明書を使用しているため、初回アクセス時に警告が表示されます。
「詳細設定」>「localhostにアクセスする（安全ではありません）」をクリックして進んでください。

## カスタマイズ

### 使用するブラウザを変更

`start-fcall.sh` を編集して、ブラウザの優先順位を変更できます。

```bash
# Chromeを優先する場合
open -a "Google Chrome" "$BASE_URL/admin.html"

# Safariを優先する場合
open -a "Safari" "$BASE_URL/admin.html"
```

### 起動する画面を変更

`start-fcall.sh` を編集して、不要な画面の起動を削除できます。

## 自動起動設定（オプション）

Mac起動時に自動でサーバーを起動する場合：

1. システム環境設定 > ユーザとグループ > ログイン項目 を開く
2. 「+」ボタンをクリック
3. 「F-Call起動.app」を追加

## ログファイル

サーバーのログは `server.log` に保存されます。

```bash
tail -f server.log
```

## サポート

問題が発生した場合は、以下を確認してください：
- Node.jsのバージョン（14以上推奨）
- ポート3443が使用可能か
- 証明書ファイル（server.key, server.crt）が存在するか

