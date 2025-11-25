const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const https = require('https');

const app = express();

// ===== エラーハンドリングを追加 =====

// 未処理の例外をキャッチ
process.on('uncaughtException', (error) => {
  console.error('❌ 未処理の例外が発生しました:', error.message);
  console.error('スタックトレース:', error.stack);
  console.log('サーバーを安全に終了します...');
  process.exit(1);
});

// 未処理のPromise拒否をキャッチ
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未処理のPromise拒否:', reason);
  console.error('Promise:', promise);
  console.log('サーバーを安全に終了します...');
  process.exit(1);
});

// 証明書ファイルの存在チェックと読み込み
let privateKey, certificate, credentials, httpsServer;

try {
  // 証明書ファイルの存在確認
  if (!fs.existsSync('server.key')) {
    throw new Error('server.key ファイルが見つかりません');
  }
  if (!fs.existsSync('server.crt')) {
    throw new Error('server.crt ファイルが見つかりません');
  }

  console.log('🔑 SSL証明書ファイルを読み込み中...');
  privateKey = fs.readFileSync('server.key', 'utf8');
  certificate = fs.readFileSync('server.crt', 'utf8');
  credentials = { key: privateKey, cert: certificate };
  httpsServer = https.createServer(credentials, app);
  
  console.log('✅ SSL証明書を正常に読み込みました');

} catch (error) {
  console.error('❌ SSL証明書の読み込みエラー:', error.message);
  console.log('\n📋 証明書を生成するには以下のコマンドを実行してください：');
  console.log('openssl req -x509 -nodes -days 36500 -newkey rsa:2048 \\');
  console.log('  -keyout server.key -out server.crt \\');
  console.log('  -subj "/CN=F-call" \\');
  console.log('  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.11.4"');
  process.exit(1);
}

// Socket.ioサーバーの作成（エラーハンドリング付き）
const io = new Server(httpsServer, {
  cors: {
    origin: "*", // すべてのオリジンからのアクセスを許可
    methods: ["GET", "POST"],
    credentials: true
  },
  // 接続タイムアウトを設定
  pingTimeout: 60000,
  pingInterval: 25000,
  // 最大接続数制限
  maxHttpBufferSize: 1e6,
  // 接続の詳細ログ
  transports: ['websocket', 'polling']
});

// Socket.ioのエラーハンドリング
io.engine.on("connection_error", (err) => {
  console.error('🔌 Socket.io接続エラー:', {
    message: err.message,
    code: err.code,
    context: err.context
  });
});

// Socket.io接続イベント
io.on('connect_error', (error) => {
  console.error('🔌 Socket.io接続エラー (クライアント側):', error);
});

console.log('🔌 Socket.ioサーバーを初期化しました');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// VOICEVOXプロキシ（CORS問題を回避）
const VOICEVOX_BASE_URL = 'http://localhost:50021';

// VOICEVOX /version エンドポイント
app.get('/api/voicevox/version', async (req, res) => {
  try {
    const response = await fetch(`${VOICEVOX_BASE_URL}/version`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('❌ VOICEVOXプロキシエラー (version):', error.message);
    res.status(503).json({ error: 'VOICEVOX接続失敗', message: error.message });
  }
});

// VOICEVOX /speakers エンドポイント
app.get('/api/voicevox/speakers', async (req, res) => {
  try {
    const response = await fetch(`${VOICEVOX_BASE_URL}/speakers`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('❌ VOICEVOXプロキシエラー (speakers):', error.message);
    res.status(503).json({ error: 'VOICEVOX接続失敗', message: error.message });
  }
});

// VOICEVOX /audio_query エンドポイント
app.post('/api/voicevox/audio_query', async (req, res) => {
  try {
    const { text, speaker } = req.query;
    
    if (!text || !speaker) {
      return res.status(400).json({ error: 'text と speaker パラメータが必要です' });
    }
    
    console.log(`🎤 VOICEVOX音声クエリ: speaker=${speaker}, text="${text.substring(0, 30)}..."`);
    
    const response = await fetch(`${VOICEVOX_BASE_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ VOICEVOX APIエラー: ${response.status} - ${errorText}`);
      return res.status(response.status).json({ error: 'VOICEVOX APIエラー', details: errorText });
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('❌ VOICEVOXプロキシエラー (audio_query):', error.message);
    res.status(503).json({ error: 'VOICEVOX接続失敗', message: error.message });
  }
});

// VOICEVOX /synthesis エンドポイント
app.post('/api/voicevox/synthesis', async (req, res) => {
  try {
    const { speaker, enable_interrogative_upspeak } = req.query;
    const audioQuery = req.body;
    
    if (!speaker) {
      return res.status(400).json({ error: 'speaker パラメータが必要です' });
    }
    
    console.log(`🔊 VOICEVOX音声合成: speaker=${speaker}, intonation=${audioQuery.intonationScale}`);
    
    let synthesisUrl = `${VOICEVOX_BASE_URL}/synthesis?speaker=${speaker}`;
    if (enable_interrogative_upspeak) {
      synthesisUrl += `&enable_interrogative_upspeak=${enable_interrogative_upspeak}`;
    }
    
    const response = await fetch(synthesisUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'accept': 'audio/wav'
      },
      body: JSON.stringify(audioQuery)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ VOICEVOX合成エラー: ${response.status} - ${errorText}`);
      return res.status(response.status).json({ error: 'VOICEVOX合成エラー', details: errorText });
    }
    
    // 音声データをそのまま返す
    const audioBuffer = await response.arrayBuffer();
    res.set('Content-Type', 'audio/wav');
    res.send(Buffer.from(audioBuffer));
    
    console.log(`✅ VOICEVOX音声合成完了 (${(audioBuffer.byteLength / 1024).toFixed(2)} KB)`);
  } catch (error) {
    console.error('❌ VOICEVOXプロキシエラー (synthesis):', error.message);
    res.status(503).json({ error: 'VOICEVOX接続失敗', message: error.message });
  }
});

console.log('🎙️ VOICEVOXプロキシを設定しました (/api/voicevox/*)');


// Express エラーハンドリングミドルウェア
app.use((error, req, res, next) => {
  console.error('🌐 Express エラー:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  res.status(500).json({ 
    error: 'サーバー内部エラーが発生しました',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
  });
});

console.log('🌐 Expressミドルウェアを設定しました');

let tickets = []; // [{number, time, priority, estimatedWaitTime}]
let issuedHistory = []; // [{number, time, date}]
let calledHistory = []; // [{number, seat, time, actualWaitTime}]
let skippedTickets = []; // [{number, time, priority}]
let currentCall = null; // {number, seat, time}
let seats = [
  { id: '1', name: '1番ユニット', number: '1', unit: 'ユニット', status: 'available', currentPatient: null, sessionStartTime: null },
  { id: '2', name: '2番ユニット', number: '2', unit: 'ユニット', status: 'available', currentPatient: null, sessionStartTime: null }
];
let waitMinutesPerPerson = 5;
let currentDate = getCurrentDate();
let dailyTicketCount = 0;

// 統計データ
let statistics = {
  averageWaitTime: 5,
  averageSessionTime: 10,
  dailyStats: [],
  peakHours: []
};

// 表示設定
let showEstimatedWaitTime = false;  // 初期値: 表示しない
let showPersonalStatus = false;

// 音声設定の永続化ファイルパス
const VOICE_SETTINGS_FILE = path.join(__dirname, 'voice_settings.json');

// デフォルト音声設定
const DEFAULT_VOICE_SETTINGS = {
  voiceURI: '',
  rate: 0.95,
  pitch: 1.0,
  volume: 1.0,
  useVoicevox: false,
  voicevoxSpeaker: 7,  // 京町セイカ（kyoto）
  voicevoxSpeed: 1.1,
  voicevoxPitch: 0,
  voicevoxIntonation: 1.5  // 抑揚1.5でカスカス防止（重要！）
};

// 音声設定をファイルから読み込み
function loadVoiceSettings() {
  try {
    if (fs.existsSync(VOICE_SETTINGS_FILE)) {
      const data = fs.readFileSync(VOICE_SETTINGS_FILE, 'utf8');
      const savedSettings = JSON.parse(data);
      console.log('📂 音声設定をファイルから読み込み:', savedSettings);
      return { ...DEFAULT_VOICE_SETTINGS, ...savedSettings };
    }
  } catch (error) {
    console.error('❌ 音声設定の読み込みエラー:', error);
  }
  console.log('🔊 デフォルト音声設定を使用');
  return { ...DEFAULT_VOICE_SETTINGS };
}

// 音声設定をファイルに保存
function saveVoiceSettings(settings) {
  try {
    fs.writeFileSync(VOICE_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    console.log('💾 音声設定をファイルに保存しました');
  } catch (error) {
    console.error('❌ 音声設定の保存エラー:', error);
  }
}

// 音声設定（グローバル）
let voiceSettings = loadVoiceSettings();

console.log('🔊 サーバー起動時の音声設定:', voiceSettings);
console.log('   特に重要: voicevoxIntonation =', voiceSettings.voicevoxIntonation);

// 初回起動時にデフォルト設定をファイルに保存
if (!fs.existsSync(VOICE_SETTINGS_FILE)) {
  console.log('📝 初回起動: デフォルト音声設定をファイルに保存');
  saveVoiceSettings(voiceSettings);
}

function getCurrentDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ネットワーク情報を取得する関数
function getNetworkInfo() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const externalUrls = [];
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // IPv4アドレスのみを表示し、内部アドレスは除外
      if (net.family === 'IPv4' && !net.internal) {
        externalUrls.push({
          address: net.address,
          url: `https://${net.address}:3443`,
          interface: name
        });
      }
    }
  }
  
  return externalUrls;
}

function formatTime(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0') + ' ' +
    String(date.getHours()).padStart(2, '0') + ':' +
    String(date.getMinutes()).padStart(2, '0') + ':' +
    String(date.getSeconds()).padStart(2, '0');
}

// 日付が変わった場合の番号リセット
function checkDateReset() {
  const today = getCurrentDate();
  if (currentDate !== today) {
    // 前日の統計を保存
    if (tickets.length > 0 || calledHistory.length > 0) {
      const avgWaitTime = calledHistory.length > 0 
        ? calledHistory.reduce((sum, call) => sum + (call.actualWaitTime || 0), 0) / calledHistory.length
        : statistics.averageWaitTime;
      
      statistics.dailyStats.push({
        date: currentDate,
        totalTickets: dailyTicketCount,
        averageWaitTime: Math.round(avgWaitTime),
        completedCalls: calledHistory.length
      });
      
      // 統計データを更新
      if (calledHistory.length > 0) {
        statistics.averageWaitTime = Math.round(avgWaitTime);
      }
    }
    
    // 日付リセット
    currentDate = today;
    dailyTicketCount = 0;
    tickets = [];
    calledHistory = [];
    currentCall = null;
    skippedTickets = [];
    
    // 座席をリセット
    seats.forEach(seat => {
      seat.status = 'available';
      seat.currentPatient = null;
      seat.sessionStartTime = null;
    });
    
    console.log(`日付が変わりました: ${today} - 番号をリセットしました`);
  }
}

// 動的な待ち時間を計算
function calculateWaitTime(ticketPosition) {
  const availableSeats = seats.filter(seat => seat.status === 'available').length;
  const busySeats = seats.filter(seat => seat.status === 'busy').length;
  
  if (availableSeats > 0) {
    // 利用可能な座席がある場合は短い待ち時間
    return Math.max(1, Math.round(ticketPosition / Math.max(availableSeats, 1) * statistics.averageSessionTime));
  } else {
    // 全席使用中の場合は現在のセッション残り時間 + 待ち列
    const avgRemainingTime = Math.round(statistics.averageSessionTime / 2);
    return avgRemainingTime + Math.round((ticketPosition - busySeats) / seats.length * statistics.averageWaitTime);
  }
}

// 座席状態を更新
function updateSeatStatus(seatId, status, patientNumber = null) {
  const seat = seats.find(s => s.id === seatId);
  if (seat) {
    seat.status = status;
    seat.currentPatient = patientNumber;
    
    if (status === 'busy' && patientNumber) {
      seat.sessionStartTime = new Date();
    } else if (status === 'available') {
      // セッション終了時に統計を更新
      if (seat.sessionStartTime && seat.currentPatient) {
        const sessionDuration = Math.round((new Date() - seat.sessionStartTime) / (1000 * 60));
        statistics.averageSessionTime = Math.round((statistics.averageSessionTime + sessionDuration) / 2);
      }
      seat.sessionStartTime = null;
      seat.currentPatient = null;
    }
  }
}

function sendUpdate() {
  checkDateReset(); // 日付チェック
  
  // ネットワーク情報を取得
  const networkInfo = getNetworkInfo();
  
  io.emit('update', {
    tickets,
    issuedHistory,
    calledHistory,
    currentCall,
    waitMinutesPerPerson,
    seats,
    statistics,
    currentDate,
    networkInfo,
    showEstimatedWaitTime,
    showPersonalStatus,
    skippedTickets,
    voiceSettings
  });
}

io.on('connection', (socket) => {
  console.log(`👤 新しいクライアントが接続しました: ${socket.id} (IP: ${socket.handshake.address})`);
  
  try {
    checkDateReset(); // 接続時に日付チェック
    
    // ネットワーク情報を取得
    const networkInfo = getNetworkInfo();
    
    // 初期データ送信
    socket.emit('init', {
      tickets,
      issuedHistory,
      calledHistory,
      currentCall,
      waitMinutesPerPerson,
      seats,
      statistics,
      currentDate,
      networkInfo,
      showEstimatedWaitTime,
      showPersonalStatus,
      skippedTickets,
      voiceSettings
    });
    
    console.log(`📤 初期データを送信しました: ${socket.id}`);
  } catch (error) {
    console.error(`❌ 初期データ送信エラー (${socket.id}):`, error);
    socket.emit('error', { message: 'サーバー初期化エラーが発生しました' });
  }

  // ソケット切断時の処理
  socket.on('disconnect', (reason) => {
    console.log(`👋 クライアントが切断されました: ${socket.id} (理由: ${reason})`);
  });

  // ソケットエラーハンドリング
  socket.on('error', (error) => {
    console.error(`🔌 ソケットエラー (${socket.id}):`, error);
  });

  // 発券リクエスト
  socket.on('issueTicket', (data = {}) => {
    try {
      console.log(`🎫 発券リクエスト受信 (${socket.id}):`, data);
      
      dailyTicketCount++;
      const time = formatTime(new Date());
      const priority = data.priority || 'normal'; // normal, urgent, appointment
      const position = tickets.length;
      const estimatedWaitTime = calculateWaitTime(position + 1);
      
      const ticket = { 
        number: dailyTicketCount, 
        time,
        date: currentDate,
        priority,
        estimatedWaitTime,
        issueTime: new Date()
      };
      
      // 優先度に応じてソート
      if (priority === 'urgent') {
        // 緊急患者は最前列に
        tickets.unshift(ticket);
      } else if (priority === 'appointment') {
        // 予約患者は緊急患者の後、一般患者の前に
        const urgentCount = tickets.filter(t => t.priority === 'urgent').length;
        tickets.splice(urgentCount, 0, ticket);
      } else {
        // 一般患者は最後尾に
        tickets.push(ticket);
      }
      
      issuedHistory.unshift(ticket);
      
      // 発券成功をクライアントに通知
      socket.emit('ticketIssued', { 
        number: ticket.number, 
        estimatedWaitTime: ticket.estimatedWaitTime,
        priority: ticket.priority 
      });
      
      sendUpdate();
      console.log(`✅ 発券完了: ${ticket.number}番 (${priority})`);
      
    } catch (error) {
      console.error(`❌ 発券エラー (${socket.id}):`, error);
      socket.emit('error', { message: '発券処理中にエラーが発生しました' });
    }
  });

  // 直前の発券を取り消し
  socket.on('undoLastTicket', () => {
    console.log(`📥 undoLastTicket リクエスト受信 (${socket.id})`);
    console.log(`   issuedHistory.length: ${issuedHistory.length}`);
    console.log(`   dailyTicketCount: ${dailyTicketCount}`);
    console.log(`   tickets.length: ${tickets.length}`);
    
    try {
      if (issuedHistory.length === 0) {
        console.log('❌ 取り消し失敗: 発券履歴が空');
        socket.emit('undoTicketFailed', { message: '取り消せる発券履歴がありません。' });
        return;
      }

      const lastTicket = issuedHistory[0];
      console.log(`   lastTicket: ${JSON.stringify(lastTicket)}`);

      if (dailyTicketCount !== lastTicket.number) {
        console.log(`❌ 取り消し失敗: 最新番号不一致 (dailyTicketCount=${dailyTicketCount}, lastTicket.number=${lastTicket.number})`);
        socket.emit('undoTicketFailed', { message: '最新の番号以外は取り消せません。' });
        return;
      }

      const ticketIndex = tickets.findIndex(t => t.number === lastTicket.number);
      console.log(`   ticketIndex: ${ticketIndex}`);
      
      if (ticketIndex === -1) {
        console.log(`❌ 取り消し失敗: 番号${lastTicket.number}は既に呼び出し済み`);
        socket.emit('undoTicketFailed', { message: `番号${lastTicket.number}は既に呼び出し済みのため取り消せません。` });
        return;
      }

      tickets.splice(ticketIndex, 1);
      issuedHistory.shift();
      dailyTicketCount = Math.max(0, dailyTicketCount - 1);

      tickets.forEach((t, index) => {
        t.estimatedWaitTime = calculateWaitTime(index + 1);
      });

      const previousNumber = issuedHistory.length > 0 ? issuedHistory[0].number : null;

      console.log(`✅ 取り消し成功: ${lastTicket.number}番 → 前の番号: ${previousNumber ?? 'なし'}`);
      socket.emit('undoTicketSuccess', {
        cancelledNumber: lastTicket.number,
        previousNumber
      });

      console.log(`↩️ 発券取り消し完了: ${lastTicket.number}番 → 前の番号: ${previousNumber ?? 'なし'}`);
      sendUpdate();
    } catch (error) {
      console.error('❌ 発券取り消しエラー:', error);
      socket.emit('undoTicketFailed', { message: '取り消し処理中にエラーが発生しました。' });
    }
  });

  // スキップ処理（呼び出しスキップ）
  socket.on('skipTicket', ({ number }) => {
    try {
      const targetNumber = Number(number);
      if (!targetNumber) {
        socket.emit('skipFailed', { message: 'スキップする番号が正しくありません。' });
        return;
      }

      const ticketIndex = tickets.findIndex(t => t.number === targetNumber);
      if (ticketIndex === -1) {
        socket.emit('skipFailed', { message: `番号${targetNumber}は待ち列にありません。` });
        return;
      }

      const skippedTicket = tickets.splice(ticketIndex, 1)[0];
      const skipTime = formatTime(new Date());

      const issuedIndex = issuedHistory.findIndex(t => t.number === skippedTicket.number);
      if (issuedIndex !== -1) {
        issuedHistory[issuedIndex].skipped = true;
        issuedHistory[issuedIndex].skipTime = skipTime;
      }

      skippedTickets.unshift({
        number: skippedTicket.number,
        time: skipTime,
        priority: skippedTicket.priority
      });
      if (skippedTickets.length > 10) {
        skippedTickets = skippedTickets.slice(0, 10);
      }

      tickets.forEach((t, index) => {
        t.estimatedWaitTime = calculateWaitTime(index + 1);
      });

      socket.emit('skipSuccess', { number: skippedTicket.number });
      console.log(`⏭️ スキップ処理: ${skippedTicket.number}番をスキップ`);
      sendUpdate();
    } catch (error) {
      console.error('❌ スキップ処理エラー:', error);
      socket.emit('skipFailed', { message: 'スキップ処理中にエラーが発生しました。' });
    }
  });

  // 呼び出しリクエスト
  socket.on('callNumber', ({ number, seatId }) => {
    try {
      console.log(`📢 呼び出しリクエスト開始 (${socket.id}): 番号=${number}, 座席ID=${seatId}`);
      
      const idx = tickets.findIndex(t => t.number === number);
      const seat = seats.find(s => s.id === seatId);
      
      if (idx === -1) {
        console.log(`❌ チケットが見つかりません: 番号=${number}`);
        socket.emit('error', { message: `番号${number}のチケットが見つかりません` });
        return;
      }
      if (!seat) {
        console.log(`❌ 座席が見つかりません: 座席ID=${seatId}`);
        socket.emit('error', { message: '指定された座席が見つかりません' });
        return;
      }
    
    const ticket = tickets[idx];
    const time = formatTime(new Date());
    const actualWaitTime = Math.round((new Date() - ticket.issueTime) / (1000 * 60));
    
    console.log(`[DEBUG] 呼び出し処理中: チケット=${JSON.stringify(ticket)}, 実際の待ち時間=${actualWaitTime}分`);
    
    // 座席を使用中に設定
    updateSeatStatus(seatId, 'busy', number);
    console.log(`[DEBUG] 座席ステータス更新完了: ${seat.name} → 使用中`);
    
    // 呼び出し履歴に即座に追加（実際の待ち時間を記録）
    const historyItem = { 
      number, 
      seat: { ...seat }, // 座席オブジェクトをコピー
      time, 
      actualWaitTime, 
      priority: ticket.priority 
    };
    calledHistory.unshift(historyItem);
    if (calledHistory.length > 10) {
      calledHistory = calledHistory.slice(0, 10);
    }
    console.log(`[DEBUG] 履歴追加完了: ${JSON.stringify(historyItem)}`);
    console.log(`[DEBUG] 現在の履歴件数: ${calledHistory.length}`);
    
    // 現在の呼び出しをセット（履歴追加後）
    currentCall = { 
      number, 
      seat: { ...seat }, // 座席オブジェクトをコピー
      time 
    };
    console.log(`[DEBUG] 現在の呼び出し設定完了: ${JSON.stringify(currentCall)}`);
    
    // 待ち列から削除
    tickets.splice(idx, 1);
    console.log(`[DEBUG] 待ち列から削除完了: 残り${tickets.length}件`);
    
    // 残りの待ち時間を再計算
    tickets.forEach((t, index) => {
      t.estimatedWaitTime = calculateWaitTime(index + 1);
    });
    
    // 呼び出し成功をクライアントに通知
    socket.emit('callSuccess', { 
      number, 
      seat: seat.name, 
      actualWaitTime,
      historyLength: calledHistory.length 
    });
    
    console.log(`[SUCCESS] 呼び出し完了: 番号${number} → ${seat.name} (待ち時間: ${actualWaitTime}分)`);
    console.log(`[DEBUG] 更新データ送信前 - 履歴件数: ${calledHistory.length}, 現在の呼び出し: ${currentCall ? currentCall.number : 'なし'}`);
    
      sendUpdate();
      console.log(`✅ 呼び出し完了: 番号${number} → ${seat.name} (待ち時間: ${actualWaitTime}分)`);
      
    } catch (error) {
      console.error(`❌ 呼び出しエラー (${socket.id}):`, error);
      socket.emit('error', { message: '呼び出し処理中にエラーが発生しました' });
    }
  });

  // 呼び出しキャンセル
  socket.on('cancelCall', () => {
    if (currentCall && currentCall.seat) {
      const cancelledNumber = currentCall.number;
      updateSeatStatus(currentCall.seat.id, 'available');
      
      // 履歴から該当項目を検索
      const historyItem = calledHistory.find(item => 
        item.number === currentCall.number && 
        item.seat && item.seat.id === currentCall.seat.id &&
        !item.cancelled
      );
      
      // 発券履歴から元の情報を取得
      const originalTicket = issuedHistory.find(t => t.number === cancelledNumber);
      
      if (originalTicket) {
        // チケットを発券中リストに戻す（優先度を保持）
        const ticketToRestore = {
          number: originalTicket.number,
          time: originalTicket.time,
          date: originalTicket.date,
          priority: originalTicket.priority || 'normal',
          estimatedWaitTime: calculateWaitTime(tickets.length + 1),
          issueTime: originalTicket.issueTime || new Date()
        };
        
        // 優先度に応じて適切な位置に挿入
        if (ticketToRestore.priority === 'urgent') {
          tickets.unshift(ticketToRestore);
        } else if (ticketToRestore.priority === 'appointment') {
          const urgentCount = tickets.filter(t => t.priority === 'urgent').length;
          tickets.splice(urgentCount, 0, ticketToRestore);
        } else {
          tickets.push(ticketToRestore);
        }
        
        // 待ち時間を再計算
        tickets.forEach((t, index) => {
          t.estimatedWaitTime = calculateWaitTime(index + 1);
        });
      }
      
      // 履歴から該当項目を削除（発券中リストに戻すため）
      const historyIndex = calledHistory.findIndex(item => 
        item.number === currentCall.number && 
        item.seat && item.seat.id === currentCall.seat.id &&
        !item.cancelled
      );
      
      if (historyIndex >= 0) {
        calledHistory.splice(historyIndex, 1);
      }
      
      console.log(`呼び出しキャンセル: 番号${currentCall.number} (${currentCall.seat.name}) → 発券中リストに戻しました`);
    }
    currentCall = null;
    sendUpdate();
  });

  // 履歴からの個別呼び出しキャンセル
  socket.on('cancelHistoryCall', ({ number, seatId, historyIndex }) => {
    const seat = seats.find(s => s.id === seatId);
    if (!seat) {
      socket.emit('error', { message: '座席が見つかりません' });
      return;
    }
    
    // 座席を空席に戻す
    updateSeatStatus(seatId, 'available');
    
    // 現在の呼び出しがこの番号・座席の場合はクリア
    if (currentCall && currentCall.number === number && currentCall.seat && currentCall.seat.id === seatId) {
      currentCall = null;
    }
    
    // 発券履歴から元の情報を取得
    const originalTicket = issuedHistory.find(t => t.number === number);
    
    // 履歴から該当項目を検索
    const historyItem = historyIndex >= 0 && historyIndex < calledHistory.length 
      ? calledHistory[historyIndex] 
      : calledHistory.find(item => item.number === number && item.seat && item.seat.id === seatId && !item.cancelled);
    
    if (originalTicket && historyItem && !historyItem.cancelled) {
      // チケットを発券中リストに戻す（優先度を保持）
      const ticketToRestore = {
        number: originalTicket.number,
        time: originalTicket.time,
        date: originalTicket.date,
        priority: originalTicket.priority || historyItem.priority || 'normal',
        estimatedWaitTime: calculateWaitTime(tickets.length + 1),
        issueTime: originalTicket.issueTime || new Date()
      };
      
      // 優先度に応じて適切な位置に挿入
      if (ticketToRestore.priority === 'urgent') {
        tickets.unshift(ticketToRestore);
      } else if (ticketToRestore.priority === 'appointment') {
        const urgentCount = tickets.filter(t => t.priority === 'urgent').length;
        tickets.splice(urgentCount, 0, ticketToRestore);
      } else {
        tickets.push(ticketToRestore);
      }
      
      // 待ち時間を再計算
      tickets.forEach((t, index) => {
        t.estimatedWaitTime = calculateWaitTime(index + 1);
      });
      
      // 履歴から該当項目を削除（発券中リストに戻すため）
      const actualHistoryIndex = calledHistory.findIndex(item => 
        item.number === number && 
        item.seat && item.seat.id === seatId &&
        !item.cancelled
      );
      
      if (actualHistoryIndex >= 0) {
        calledHistory.splice(actualHistoryIndex, 1);
      }
    } else {
      // 発券履歴が見つからない場合は従来通りキャンセルマークのみ
      if (historyIndex >= 0 && historyIndex < calledHistory.length) {
        calledHistory[historyIndex].cancelled = true;
        calledHistory[historyIndex].cancelTime = formatTime(new Date());
      }
      
      // 残りの待ち時間を再計算
      tickets.forEach((t, index) => {
        t.estimatedWaitTime = calculateWaitTime(index + 1);
      });
    }
    
    // キャンセル成功をクライアントに通知
    socket.emit('cancelSuccess', { 
      number, 
      seat: seat.name,
      message: `番号${number}（${seat.name}）の呼び出しをキャンセルし、発券中リストに戻しました`
    });
    
    console.log(`履歴からキャンセル: 番号${number} → ${seat.name} → 発券中リストに戻しました`);
    sendUpdate();
  });

  // 診察完了
  socket.on('completeSession', ({ seatId }) => {
    const seat = seats.find(s => s.id === seatId);
    const patientNumber = seat ? seat.currentPatient : null;
    
    updateSeatStatus(seatId, 'available');
    
    // 現在の呼び出しがこの座席の場合はクリア
    if (currentCall && currentCall.seat.id === seatId) {
      currentCall = null;
    }
    
    // 残りの待ち時間を再計算
    tickets.forEach((t, index) => {
      t.estimatedWaitTime = calculateWaitTime(index + 1);
    });
    
    console.log(`診察完了: ${seat ? seat.name : seatId} (患者: ${patientNumber}番)`);
    sendUpdate();
  });

  // リセット
  socket.on('reset', () => {
    tickets = [];
    issuedHistory = [];
    calledHistory = [];
    currentCall = null;
    dailyTicketCount = 0;
    skippedTickets = [];
    
    // 座席をリセット
    seats.forEach(seat => {
      seat.status = 'available';
      seat.currentPatient = null;
      seat.sessionStartTime = null;
    });
    
    sendUpdate();
  });

  // 管理画面用イベント
  socket.on('admin:clearTickets', () => {
    tickets = [];
    sendUpdate();
  });
  socket.on('admin:clearIssuedHistory', () => {
    issuedHistory = [];
    skippedTickets = [];
    sendUpdate();
  });
  socket.on('admin:clearHistory', () => {
    calledHistory = [];
    sendUpdate();
  });
  socket.on('admin:setCurrentNumber', ({ number, seatId }) => {
    const seat = seats.find(s => s.id === seatId);
    if (!seat) return;
    
    const time = formatTime(new Date());
    
    // 座席を使用中に設定
    updateSeatStatus(seatId, 'busy', number);
    
    // 呼び出し履歴に追加（管理画面からの手動設定）
    const historyItem = { 
      number, 
      seat, 
      time, 
      actualWaitTime: 0, // 手動設定なので待ち時間は0
      priority: 'manual' // 手動設定を示すマーク
    };
    calledHistory.unshift(historyItem);
    if (calledHistory.length > 10) calledHistory = calledHistory.slice(0, 10);
    
    // 現在の呼び出しをセット
    currentCall = { number, seat, time };
    
    console.log(`管理画面から呼び出し設定: 番号${number} → ${seat.name}`);
    sendUpdate();
  });
  socket.on('admin:setWaitMinutes', (minutes) => {
    if (typeof minutes === 'number' && minutes > 0) {
      waitMinutesPerPerson = minutes;
      statistics.averageWaitTime = minutes;
      sendUpdate();
    }
  });

  socket.on('admin:setEstimatedWaitVisibility', (visible) => {
    const nextValue = Boolean(visible);
    if (showEstimatedWaitTime !== nextValue) {
      showEstimatedWaitTime = nextValue;
      sendUpdate();
    }
  });

  socket.on('admin:setPersonalStatusVisibility', (visible) => {
    const nextValue = Boolean(visible);
    if (showPersonalStatus !== nextValue) {
      showPersonalStatus = nextValue;
      sendUpdate();
    }
  });

  // 座席管理
  socket.on('admin:addSeat', (data) => {
    // 後方互換性のため、文字列の場合も対応
    if (typeof data === 'string') {
      if (!data.trim()) return;
      const id = Date.now().toString();
      seats.push({ 
        id, 
        name: data.trim(),
        number: String(seats.length + 1),
        unit: 'ユニット',
        status: 'available',
        currentPatient: null,
        sessionStartTime: null
      });
      sendUpdate();
      return;
    }
    
    // 新しい形式（number + unit）
    if (!data || !data.number || !data.unit) return;
    const id = Date.now().toString();
    const number = String(data.number).trim();
    const unit = data.unit.trim();
    const name = `${number}番${unit}`;
    
    seats.push({ 
      id, 
      name,
      number,
      unit,
      status: 'available',
      currentPatient: null,
      sessionStartTime: null
    });
    sendUpdate();
  });
  socket.on('admin:removeSeat', (id) => {
    seats = seats.filter(s => s.id !== id);
    sendUpdate();
  });
  socket.on('admin:editSeat', ({ id, number, unit }) => {
    const seat = seats.find(s => s.id === id);
    if (!seat) return;
    
    if (number !== undefined && number !== null && String(number).trim()) {
      seat.number = String(number).trim();
    }
    if (unit !== undefined && unit !== null && String(unit).trim()) {
      seat.unit = String(unit).trim();
    }
    
    // nameを更新
    if (seat.number && seat.unit) {
      seat.name = `${seat.number}番${seat.unit}`;
    }
    
    sendUpdate();
  });
  
  // 音声設定の更新
  socket.on('admin:updateVoiceSettings', (settings) => {
    try {
      if (!settings || typeof settings !== 'object') {
        console.error('❌ 無効な音声設定:', settings);
        socket.emit('voiceSettingsUpdated', { 
          success: false, 
          error: '無効な設定データ' 
        });
        return;
      }
      
      // 音声設定を更新（数値型に確実に変換）
      const newSettings = {
        voiceURI: String(settings.voiceURI || ''),
        rate: Number(settings.rate) || 0.95,
        pitch: Number(settings.pitch) || 1.0,
        volume: Number(settings.volume) || 1.0,
        useVoicevox: Boolean(settings.useVoicevox),
        voicevoxSpeaker: Number(settings.voicevoxSpeaker) || 7,
        voicevoxSpeed: Number(settings.voicevoxSpeed) || 1.1,
        voicevoxPitch: Number(settings.voicevoxPitch) || 0,
        voicevoxIntonation: Number(settings.voicevoxIntonation) || 1.5
      };
      
      voiceSettings = newSettings;
      
      // ファイルに保存（再起動後も設定を保持）
      saveVoiceSettings(voiceSettings);
      
      if (voiceSettings.useVoicevox) {
        console.log('🔊 音声設定を更新（VOICEVOX）:');
        console.log(`   speaker=${voiceSettings.voicevoxSpeaker} speed=${voiceSettings.voicevoxSpeed} pitch=${voiceSettings.voicevoxPitch} intonation=${voiceSettings.voicevoxIntonation}`);
      } else {
        console.log('🔊 音声設定を更新（標準）:');
        console.log(`   URI="${voiceSettings.voiceURI}" rate=${voiceSettings.rate} pitch=${voiceSettings.pitch} volume=${voiceSettings.volume}`);
      }
      
      // 全クライアントに即座に音声設定を配信（専用イベント）
      io.emit('voiceSettingsChanged', voiceSettings);
      console.log('📢 音声設定を全クライアントに即座に配信');
      
      // 通常の更新も送信
      sendUpdate();
      
      // 成功を管理画面に通知
      socket.emit('voiceSettingsUpdated', { 
        success: true, 
        settings: voiceSettings 
      });
      
      console.log('✅ 配信完了（ファイル保存済み）');
      
    } catch (error) {
      console.error('❌ 音声設定更新エラー:', error);
      socket.emit('voiceSettingsUpdated', { 
        success: false, 
        error: error.message 
      });
    }
  });
});

// 定期的な日付チェック（1時間ごと）
setInterval(checkDateReset, 60 * 60 * 1000);

// HTTPサーバーでHTTPSへリダイレクト
const httpApp = express();
httpApp.use((req, res) => {
  res.redirect('https://' + req.headers.host + req.url);
});
const httpServer = http.createServer(httpApp);
httpServer.listen(3001, () => {
  console.log('HTTPサーバー(リダイレクト用)がポート3001で起動');
});

// HTTPSサーバーのエラーハンドリング
httpsServer.on('error', (error) => {
  console.error('❌ HTTPSサーバーエラー:', error);
  if (error.code === 'EADDRINUSE') {
    console.log('🔴 ポート3443は既に使用されています');
    console.log('📋 実行中のプロセスを確認: sudo lsof -i :3443');
    console.log('📋 プロセスを停止: sudo kill -9 [プロセスID]');
  }
  process.exit(1);
});

// HTTPサーバーのエラーハンドリング
httpServer.on('error', (error) => {
  console.error('❌ HTTPサーバーエラー:', error);
  if (error.code === 'EADDRINUSE') {
    console.log('🔴 ポート3001は既に使用されています');
  }
});

// サーバーの起動
httpsServer.listen(3443, () => {
  console.log('==================================================');
  console.log('   🚀 F-Call サーバー(HTTPS)が起動しました (ポート: 3443)');
  console.log('==================================================');
  console.log('ローカル: https://localhost:3443');
  
  // サーバーのIPアドレス情報を表示
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  
  console.log('\nネットワーク接続情報:');
  console.log('--------------------------------------------------');
  
  // 外部アクセス用URLを表示
  const networkInfo = getNetworkInfo();
  
  if (networkInfo.length > 0) {
    console.log('\n外部からアクセス可能なURL:');
    networkInfo.forEach(info => console.log(`  ${info.url} (${info.interface})`));
    console.log('\n以下のURLを他の端末のブラウザで開いてアクセスできます:');
    const baseUrl = networkInfo[0].url;
    console.log(`  管理画面:  ${baseUrl}/admin.html`);
    console.log(`  受付画面:  ${baseUrl}/index.html`);
    console.log(`  スタッフ画面: ${baseUrl}/staff.html`);
    console.log(`  待合室表示: ${baseUrl}/display.html`);
  } else {
    console.log('\n警告: 外部からアクセス可能なネットワークインターフェースが見つかりません');
  }
  console.log('--------------------------------------------------');
  console.log('Ctrl+Cでサーバーを停止できます');
  console.log('==================================================\n');
});

// グレースフルシャットダウンの実装
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 ${signal} シグナルを受信しました。サーバーを安全に停止します...`);
  
  // 新しい接続を受け付けない
  httpsServer.close((err) => {
    if (err) {
      console.error('❌ HTTPSサーバー停止エラー:', err);
    } else {
      console.log('✅ HTTPSサーバーを停止しました');
    }
  });
  
  httpServer.close((err) => {
    if (err) {
      console.error('❌ HTTPサーバー停止エラー:', err);
    } else {
      console.log('✅ HTTPサーバーを停止しました');
    }
  });
  
  // Socket.ioの接続を閉じる
  io.close((err) => {
    if (err) {
      console.error('❌ Socket.io停止エラー:', err);
    } else {
      console.log('✅ Socket.ioサーバーを停止しました');
    }
    
    console.log('👋 F-Callサーバーが正常に停止しました');
    process.exit(0);
  });
  
  // 10秒後に強制終了
  setTimeout(() => {
    console.error('⚠️ グレースフルシャットダウンがタイムアウトしました。強制終了します。');
    process.exit(1);
  }, 10000);
};

// シグナルハンドラーの登録
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

console.log('🛡️ エラーハンドリングとグレースフルシャットダウンを設定しました');