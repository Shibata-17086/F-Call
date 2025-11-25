# VOICEVOX接続トラブルシューティング

## 🔍 現在の状態確認

### 1. VOICEVOXアプリの起動確認

ターミナルで以下を実行:
```bash
ps aux | grep -i voicevox | grep -v grep
```

✅ 正常: プロセスが表示される  
❌ 異常: 何も表示されない → VOICEVOXアプリを起動

### 2. API接続確認

```bash
curl http://localhost:50021/version
```

✅ 正常: `"0.24.1"` などバージョンが表示される  
❌ 異常: エラーや応答なし

### 3. 音声クエリテスト

```bash
curl -X POST "http://localhost:50021/audio_query?text=テスト&speaker=66"
```

✅ 正常: JSONデータが返される  
❌ 異常: `Invalid HTTP request received.` などのエラー

## 🛠️ 診断方法

### A. 診断ツールを使用（推奨）

1. Safariで以下を開く:
```
file:///Users/kokishibata/develop/F-Call/test-voicevox.html
```

2. 「1️⃣ 接続テスト」ボタンをクリック
3. ログを確認

### B. Admin画面で確認

1. Safariで開く:
```
http://localhost:3001/admin.html
```

2. **🔊 音声設定**セクション
3. **「VOICEVOX を使用する」にチェック**
4. キャラクターを選択
5. **「音声テスト」ボタン**をクリック
6. **Safari → 開発 → Webインスペクタを表示** でコンソールを確認

## ❌ よくあるエラーと解決方法

### エラー1: `Failed to fetch` / `TypeError: NetworkError`

**原因**: VOICEVOXアプリが起動していない、またはAPIサーバーが応答していない

**解決方法**:
```bash
# VOICEVOXを起動
cd /Users/kokishibata/develop/F-Call
./start-voicevox.sh

# または手動起動
open -a VOICEVOX
```

### エラー2: `CORS policy` エラー

**原因**: ブラウザのセキュリティポリシー（通常は発生しないはず）

**解決方法**: VOICEVOXは `Access-Control-Allow-Origin: *` を返すため、通常はCORSエラーは発生しません。  
もし発生する場合は、VOICEVOXアプリを再起動してください。

### エラー3: `Invalid HTTP request received.`

**原因**: APIリクエストの形式が間違っている

**確認ポイント**:
- ✅ 正しい: `POST /audio_query?text=テスト&speaker=66`
- ❌ 間違い: テキストをボディで送信、またはクエリパラメータの形式が不正

### エラー4: 音声テストボタンを押しても何も起きない

**原因**: JavaScriptエラー、またはイベントリスナーが動作していない

**デバッグ方法**:
1. Safari → 開発 → Webインスペクタを表示
2. コンソールタブでエラーを確認
3. 以下を手動実行:
```javascript
console.log('テストボタン:', document.getElementById('testSpeechBtn'));
console.log('VOICEVOX使用:', document.getElementById('useVoicevoxCheckbox').checked);
console.log('スピーカーID:', document.getElementById('voicevoxSpeakerSelect').value);
```

### エラー5: 「接続できなくて音声のテストすらできない」

**段階的診断**:

#### ステップ1: ブラウザのコンソールを開く
```
Safari → 開発 → Webインスペクタを表示
```

#### ステップ2: 手動でVOICEVOX接続テスト
コンソールに以下を貼り付けて実行:
```javascript
fetch('http://localhost:50021/version')
  .then(r => r.json())
  .then(v => console.log('✅ VOICEVOX接続成功:', v))
  .catch(e => console.error('❌ VOICEVOX接続失敗:', e));
```

#### ステップ3: 音声クエリテスト
```javascript
fetch('http://localhost:50021/audio_query?text=テスト&speaker=66', {
  method: 'POST'
})
  .then(r => r.json())
  .then(d => console.log('✅ 音声クエリ成功:', d))
  .catch(e => console.error('❌ 音声クエリ失敗:', e));
```

#### ステップ4: エラーメッセージを確認
- `TypeError: Failed to fetch` → VOICEVOXが起動していない
- `TypeError: NetworkError` → ポート50021がブロックされている
- `400 Bad Request` → リクエスト形式が間違っている
- `404 Not Found` → APIエンドポイントが間違っている
- `500 Internal Server Error` → VOICEVOX内部エラー

## 🔧 完全リセット手順

すべてがうまくいかない場合:

```bash
# 1. すべてのVOICEVOXプロセスを終了
pkill -9 -i voicevox

# 2. F-Callサーバーを終了
pkill -9 node

# 3. VOICEVOXを起動
open -a VOICEVOX

# 4. VOICEVOX起動確認（10秒待つ）
sleep 10
curl http://localhost:50021/version

# 5. F-Callサーバーを起動
cd /Users/kokishibata/develop/F-Call
node server.js

# 6. Safariで診断ツールを開く
open -a Safari test-voicevox.html
```

## 📝 デバッグ情報の収集

問題が解決しない場合、以下の情報を収集:

```bash
# 1. VOICEVOX起動確認
ps aux | grep -i voicevox | grep -v grep

# 2. ポート使用確認
lsof -i :50021

# 3. API接続テスト
curl -v http://localhost:50021/version

# 4. スピーカー一覧
curl http://localhost:50021/speakers | python3 -m json.tool | head -50

# 5. 音声クエリテスト（詳細）
curl -v -X POST "http://localhost:50021/audio_query?text=テスト&speaker=66" 2>&1 | head -50
```

## 📞 サポート

上記の手順で解決しない場合:
1. Safari のコンソールログをスクリーンショット
2. ターミナルでの診断コマンド結果をコピー
3. 具体的なエラーメッセージを報告

