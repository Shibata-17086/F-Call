# 音声アナウンスのカスタマイズ方法

F-Callシステムの音声アナウンスメッセージを変更する方法を説明します。

## 音声メッセージの変更箇所

音声アナウンスのテキストは以下の2つのファイルで定義されています：

### 1. 実際の呼び出し音声 (`display.js`)

**ファイル:** `display.js`  
**場所:** 約850-860行目

実際の患者呼び出し時に再生される音声メッセージです。

```javascript
// 音声メッセージのテンプレート
if (seatNumber) {
  // 座席番号が抽出できた場合
  callMessage = `受付番号${currentCall.number}番の患者様、${seatNumber}番診察台へお越しください`;
} else {
  // 座席番号が抽出できない場合
  callMessage = `受付番号${currentCall.number}番の患者様、${currentCall.seat.name}へお越しください`;
}
```

### 2. テスト音声 (`admin.js`)

**ファイル:** `admin.js`  
**場所:** 約30行目

管理画面の「音声テスト」ボタンで再生されるテスト音声です。

```javascript
const testMessage = '受付番号1番の方、1番診察台へどうぞ';
```

## 変更方法

### 方法1: 直接編集

1. `display.js` を開く
2. 850行目あたりの `callMessage` の部分を編集
3. ファイルを保存
4. ブラウザを再読み込み（またはサーバーを再起動）

### 方法2: メッセージテンプレートの例

以下のようなメッセージに変更できます：

#### 例1: シンプルなメッセージ
```javascript
callMessage = `${currentCall.number}番の方、${seatNumber}番台へどうぞ`;
```

#### 例2: 丁寧なメッセージ
```javascript
callMessage = `お待たせいたしました。受付番号${currentCall.number}番の患者様、${seatNumber}番診察台へお越しください`;
```

#### 例3: 短いメッセージ
```javascript
callMessage = `${currentCall.number}番、${seatNumber}番室`;
```

#### 例4: 優先度を含むメッセージ
```javascript
const priorityText = currentCall.priority === 'urgent' ? '緊急の' : 
                    currentCall.priority === 'appointment' ? '予約の' : '';
callMessage = `${priorityText}受付番号${currentCall.number}番の患者様、${seatNumber}番診察台へお越しください`;
```

## 優先度に応じたメッセージ

緊急や予約の患者に対して特別なメッセージを追加することもできます：

```javascript
// 優先度に応じたメッセージ
const priorityText = currentCall.priority === 'urgent' ? '緊急の' : 
                    currentCall.priority === 'appointment' ? '予約の' : '';

if (priorityText) {
  callMessage = `${priorityText}${callMessage}`;
}
```

## 座席名の扱い

座席名から番号を抽出する処理：

```javascript
const seatNumber = currentCall.seat.name.replace(/[^0-9]/g, '');
```

この処理により、座席名が「1番台」の場合は「1」が抽出され、「1番診察台」の場合は「1」が抽出されます。

座席名をそのまま使用したい場合は：

```javascript
callMessage = `受付番号${currentCall.number}番の患者様、${currentCall.seat.name}へお越しください`;
```

## テスト方法

1. **管理画面でテスト**
   - 管理画面を開く
   - 「音声テスト」ボタンをクリック
   - テスト音声が再生される

2. **実際の呼び出しでテスト**
   - スタッフ画面で番号を呼び出し
   - 待合室表示画面で音声が再生される

## 注意事項

1. **文字数**
   - 長すぎるメッセージは聞き取りにくくなる可能性があります
   - 推奨: 30文字以内

2. **特殊文字**
   - 音声合成エンジンによっては、特殊文字が正しく読み上げられない場合があります
   - 数字やひらがな、カタカナ、漢字は問題なく読み上げられます

3. **変更後の確認**
   - 変更後は必ずテスト音声で確認してください
   - ブラウザを再読み込みしないと変更が反映されない場合があります

4. **サーバー再起動**
   - JavaScriptファイルを変更した場合、ブラウザのキャッシュをクリアするか、強制リロード（Ctrl+Shift+R / Cmd+Shift+R）が必要な場合があります

## よくある変更例

### 医院名を追加
```javascript
callMessage = `福田歯科、受付番号${currentCall.number}番の患者様、${seatNumber}番診察台へお越しください`;
```

### より丁寧な表現
```javascript
callMessage = `お呼びしております。受付番号${currentCall.number}番の患者様、${seatNumber}番診察台へお越しくださいませ`;
```

### 英語メッセージ（テスト用）
```javascript
callMessage = `Patient number ${currentCall.number}, please come to examination room ${seatNumber}`;
```

## トラブルシューティング

### 音声が再生されない

1. ブラウザの音声合成機能が有効か確認
2. ブラウザのコンソールでエラーを確認
3. テスト音声で動作確認

### メッセージが変更されない

1. ブラウザのキャッシュをクリア
2. 強制リロード（Ctrl+Shift+R / Cmd+Shift+R）
3. サーバーを再起動

### 文字化けする

1. ファイルの文字コードがUTF-8であることを確認
2. 特殊文字を避ける
3. シンプルな文字列に変更してテスト

