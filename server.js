const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // すべてのオリジンからのアクセスを許可
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

let tickets = []; // [{number, time}]
let issuedHistory = []; // [{number, time}]
let calledHistory = []; // [{number, time, seat}]
let currentCall = null; // {number, seat}
let waitMinutesPerPerson = 5;
let seats = [
  { id: '1', name: '1番台' },
  { id: '2', name: '2番台' }
];

function formatTime(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0') + ' ' +
    String(date.getHours()).padStart(2, '0') + ':' +
    String(date.getMinutes()).padStart(2, '0') + ':' +
    String(date.getSeconds()).padStart(2, '0');
}

function sendUpdate() {
  io.emit('update', {
    tickets,
    issuedHistory,
    calledHistory,
    currentCall,
    waitMinutesPerPerson,
    seats
  });
}

io.on('connection', (socket) => {
  // 初期データ送信
  socket.emit('init', {
    tickets,
    issuedHistory,
    calledHistory,
    currentCall,
    waitMinutesPerPerson,
    seats
  });

  // 発券リクエスト
  socket.on('issueTicket', () => {
    const allNumbers = [...tickets.map(t => t.number), ...issuedHistory.map(h => h.number)];
    const newNumber = allNumbers.length > 0 ? Math.max(...allNumbers) + 1 : 1;
    const time = formatTime(new Date());
    const ticket = { number: newNumber, time };
    tickets.push(ticket);
    issuedHistory.unshift(ticket);
    sendUpdate();
  });

  // 呼び出しリクエスト（スタッフ画面からのみ、座席指定）
  socket.on('callNumber', ({ number, seatId }) => {
    const idx = tickets.findIndex(t => t.number === number);
    const seat = seats.find(s => s.id === seatId);
    if (idx === -1 || !seat) return;
    const time = formatTime(new Date());
    currentCall = { number, seat };
    calledHistory.unshift({ number, time, seat });
    tickets.splice(idx, 1);
    if (calledHistory.length > 10) calledHistory = calledHistory.slice(0, 10);
    sendUpdate();
  });

  // リセット
  socket.on('reset', () => {
    tickets = [];
    issuedHistory = [];
    calledHistory = [];
    currentCall = null;
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
    currentCall = { number, seat };
    sendUpdate();
  });
  socket.on('admin:setWaitMinutes', (minutes) => {
    if (typeof minutes === 'number' && minutes > 0) {
      waitMinutesPerPerson = minutes;
      sendUpdate();
    }
  });

  // 座席管理
  socket.on('admin:addSeat', (name) => {
    if (!name || typeof name !== 'string' || !name.trim()) return;
    const id = Date.now().toString();
    seats.push({ id, name: name.trim() });
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

const PORT = process.env.PORT || 3001;
const IP = process.env.IP || '0.0.0.0';  // すべてのネットワークインターフェースでリッスン

// サーバーの起動
server.listen(PORT, IP, () => {
  console.log(`\n==================================================`);
  console.log(`   F-Call サーバーが起動しました (ポート: ${PORT})`);
  console.log(`==================================================`);
  
  // サーバーのIPアドレス情報を表示
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  
  console.log('\nネットワーク接続情報:');
  console.log('--------------------------------------------------');
  
  // ローカルアクセス用URL
  console.log('ローカル: http://localhost:' + PORT);
  
  // 外部アクセス用URLを表示
  let externalUrls = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // IPv4アドレスのみを表示し、内部アドレスは除外
      if (net.family === 'IPv4' && !net.internal) {
        externalUrls.push(`http://${net.address}:${PORT}`);
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
});