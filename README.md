# F-Call システム

待合室の呼び出しシステム（F-Call）は、病院や歯科医院などの待合室で患者を効率的に呼び出すためのシステムです。

## 機能

- **受付での番号発行**：患者が来院したら受付で番号を発行
- **スタッフによる呼び出し**：診察の準備ができたらスタッフが患者を呼び出し
- **待合室での大画面表示**：現在呼ばれている番号と履歴を表示
- **席（診察室）の管理**：システム管理者が席の追加・削除・編集

## システム構成

- **受付画面** (`index.html`): 番号発行用の画面
- **スタッフ画面** (`staff.html`): スタッフが患者を呼び出す画面
- **待合室表示** (`display.html`): 待合室に表示する大画面用
- **管理画面** (`admin.html`): 席の管理や設定を行う画面
- **サーバー** (`server.js`): すべてのクライアント間の通信を管理

## インストールと起動方法

### 必要条件

- Node.js (バージョン14以上)
- npm (Node.jsに付属)

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

### サーバーの起動

```bash
node server.js
```

サーバーが起動すると、アクセス可能なURLが表示されます。

## ネットワーク環境での利用

F-Callシステムは、同一ネットワーク内の複数の端末から利用できます。

### 使用方法

1. サーバーを起動すると、アクセス可能なURLが表示されます。
2. 表示されたURLを各端末のブラウザで開きます。
3. 各URLの末尾に以下を追加してアクセスします:
   - 管理画面: `/admin.html`
   - 受付画面: `/index.html`
   - スタッフ画面: `/staff.html`
   - 待合室表示: `/display.html`

### 注意点

- サーバーを実行しているコンピュータとクライアント端末は同じネットワーク内にある必要があります。
- ファイアウォールの設定によっては、ポート3001を開放する必要があるかもしれません。

## Raspberry Piでの実行方法

Raspberry Piでサーバーを実行することで、常時稼働させることができます。

### Raspberry Pi用セットアップ手順

1. Raspberry Pi OSをインストール (Raspberry Pi OS Lite推奨)
2. 必要なパッケージをインストール
```bash
sudo apt update
sudo apt install -y git nodejs npm
```

3. リポジトリをクローンして設定
```bash
git clone https://github.com/Shibata-17086/F-Call.git
cd F-Call
npm install
```

4. 自動起動の設定 (systemdを使用)
```bash
sudo nano /etc/systemd/system/fcall.service
```

以下の内容を貼り付け（パスは実際の環境に合わせて調整）:
```
[Unit]
Description=F-Call Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/F-Call
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

5. サービスを有効化して起動
```bash
sudo systemctl enable fcall.service
sudo systemctl start fcall.service
```

6. サービスのステータス確認
```bash
sudo systemctl status fcall.service
```

### Raspberry Piにアクセスする

1. Raspberry PiのIPアドレスを確認（`hostname -I`）
2. ブラウザで `http://[Raspberry PiのIPアドレス]:3001` にアクセス
3. それぞれの画面URLを開いて使用

## トラブルシューティング

- **サーバーが起動しない**: Node.jsのバージョンが古い可能性があります。`node -v`で確認し、必要に応じて更新してください。
- **クライアントが接続できない**: ファイアウォールの設定を確認し、ポート3001が開放されているか確認してください。
- **画面が表示されない**: ブラウザのコンソールでエラーを確認してください。

## カスタマイズ

- デザインのカスタマイズは各HTMLファイルのCSSを編集してください。
- ポート番号を変更する場合は `server.js` の `PORT` 変数を変更し、各クライアントJSファイルの `getServerUrl` 関数内のポート番号も変更してください。

---

## 画面の説明

### 受付画面（index.html）
- 「受付番号を発行」ボタンで新しい番号を発券
- 現在の待ち人数・予想待ち時間・自分の番号を表示

### スタッフ画面（staff.html）
- 発券中の番号リストから呼び出し番号を選択
- 呼び出し履歴・現在の呼び出し番号を表示
- サーバー全体リセットも可能

### 待合室画面（display.html）
- 現在呼び出し中の番号・呼び出し履歴を大きく表示
- 「自分の受付番号」を入力すると、あと何人待ちか・おおよその待ち時間（管理画面で設定可能）が表示されます

### 管理画面（admin.html）
- 発券中リスト・発券履歴・呼び出し履歴・現在の呼び出し番号をリアルタイム表示
- 1人あたりの予想待ち時間（分）を変更可能（全画面に即時反映）
- 各種リストのクリアや呼び出し番号の変更、全体リセットも可能
- 画面上部にサーバー操作の説明あり

---

## 注意事項
- サーバーが起動していないと、各画面は動作しません。
- 依存パッケージが未インストールの場合は `npm install` を実行してください。
- ポート番号やURLは必要に応じて変更してください。

---
##　ライセンス
- Developed Koki Shibata , Kenngo Sato & Microwave Lab. 

