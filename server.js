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
let currentCall = null; // {number, seat, time}
let seats = [
  { id: '1', name: '1番台', status: 'available', currentPatient: null, sessionStartTime: null },
  { id: '2', name: '2番台', status: 'available', currentPatient: null, sessionStartTime: null }
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

function getCurrentDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
  
  io.emit('update', {
    tickets,
    issuedHistory,
    calledHistory,
    currentCall,
    waitMinutesPerPerson,
    seats,
    statistics,
    currentDate
  });
}

io.on('connection', (socket) => {
  console.log(`👤 新しいクライアントが接続しました: ${socket.id} (IP: ${socket.handshake.address})`);
  
  try {
    checkDateReset(); // 接続時に日付チェック
    
    // 初期データ送信
    socket.emit('init', {
      tickets,
      issuedHistory,
      calledHistory,
      currentCall,
      waitMinutesPerPerson,
      seats,
      statistics,
      currentDate
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
      updateSeatStatus(currentCall.seat.id, 'available');
      
      // 履歴にキャンセルマークを追加（現在の呼び出しがある場合）
      const historyIndex = calledHistory.findIndex(item => 
        item.number === currentCall.number && 
        item.seat && item.seat.id === currentCall.seat.id &&
        !item.cancelled
      );
      
      if (historyIndex >= 0) {
        calledHistory[historyIndex].cancelled = true;
        calledHistory[historyIndex].cancelTime = formatTime(new Date());
      }
      
      console.log(`呼び出しキャンセル: 番号${currentCall.number} (${currentCall.seat.name})`);
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
    
    // 履歴にキャンセルマークを追加
    if (historyIndex >= 0 && historyIndex < calledHistory.length) {
      calledHistory[historyIndex].cancelled = true;
      calledHistory[historyIndex].cancelTime = formatTime(new Date());
    }
    
    // 残りの待ち時間を再計算
    tickets.forEach((t, index) => {
      t.estimatedWaitTime = calculateWaitTime(index + 1);
    });
    
    // キャンセル成功をクライアントに通知
    socket.emit('cancelSuccess', { 
      number, 
      seat: seat.name,
      message: `番号${number}（${seat.name}）の呼び出しをキャンセルしました`
    });
    
    console.log(`履歴からキャンセル: 番号${number} → ${seat.name}`);
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

  // 座席管理
  socket.on('admin:addSeat', (name) => {
    if (!name || typeof name !== 'string' || !name.trim()) return;
    const id = Date.now().toString();
    seats.push({ 
      id, 
      name: name.trim(),
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
  socket.on('admin:editSeat', ({ id, name }) => {
    const seat = seats.find(s => s.id === id);
    if (seat && name && name.trim()) seat.name = name.trim();
    sendUpdate();
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
  let externalUrls = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // IPv4アドレスのみを表示し、内部アドレスは除外
      if (net.family === 'IPv4' && !net.internal) {
        externalUrls.push(`https://${net.address}:3443`);
      }
    }
  }
  
  if (externalUrls.length > 0) {
    console.log('\n外部からアクセス可能なURL:');
    externalUrls.forEach(url => console.log(`  ${url}`));
    console.log('\n以下のURLを他の端末のブラウザで開いてアクセスできます:');
    console.log(`  管理画面:  ${externalUrls[0]}/admin.html`);
    console.log(`  受付画面:  ${externalUrls[0]}/index.html`);
    console.log(`  スタッフ画面: ${externalUrls[0]}/staff.html`);
    console.log(`  待合室表示: ${externalUrls[0]}/display.html`);
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