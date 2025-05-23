const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const https = require('https');

const app = express();

const privateKey = fs.readFileSync('server.key', 'utf8');
const certificate = fs.readFileSync('server.crt', 'utf8');
const credentials = { key: privateKey, cert: certificate };
const httpsServer = https.createServer(credentials, app);

const io = new Server(httpsServer, {
  cors: {
    origin: "*", // すべてのオリジンからのアクセスを許可
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

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

// 営業時間設定
let businessHours = {
  start: '09:00',
  end: '18:00',
  lunchBreak: { start: '12:00', end: '13:00' }
};

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

function getCurrentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function isBusinessHours() {
  const currentTime = getCurrentTime();
  const start = businessHours.start;
  const end = businessHours.end;
  const lunchStart = businessHours.lunchBreak.start;
  const lunchEnd = businessHours.lunchBreak.end;
  
  return (currentTime >= start && currentTime <= end) && 
         !(currentTime >= lunchStart && currentTime <= lunchEnd);
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
    businessHours,
    currentDate,
    isBusinessHours: isBusinessHours()
  });
}

io.on('connection', (socket) => {
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
    businessHours,
    currentDate,
    isBusinessHours: isBusinessHours()
  });

  // 発券リクエスト
  socket.on('issueTicket', (data = {}) => {
    if (!isBusinessHours()) {
      socket.emit('error', { message: '現在は営業時間外です' });
      return;
    }
    
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
  });

  // 呼び出しリクエスト
  socket.on('callNumber', ({ number, seatId }) => {
    console.log(`[DEBUG] 呼び出しリクエスト開始: 番号=${number}, 座席ID=${seatId}`);
    
    const idx = tickets.findIndex(t => t.number === number);
    const seat = seats.find(s => s.id === seatId);
    
    if (idx === -1) {
      console.log(`[ERROR] チケットが見つかりません: 番号=${number}`);
      return;
    }
    if (!seat) {
      console.log(`[ERROR] 座席が見つかりません: 座席ID=${seatId}`);
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
    console.log(`[DEBUG] 全クライアントへの更新データ送信完了`);
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

  // 営業時間設定
  socket.on('admin:setBusinessHours', (hours) => {
    businessHours = { ...businessHours, ...hours };
    sendUpdate();
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

// サーバーの起動
httpsServer.listen(3443, () => {
  console.log('==================================================');
  console.log('   F-Call サーバー(HTTPS)が起動しました (ポート: 3443)');
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