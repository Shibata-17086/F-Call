const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

let tickets = []; // 現在発券中 [{number, time}]
let issuedHistory = []; // 発券履歴 [{number, time}]
let calledHistory = []; // 呼び出し履歴 [{number, time}]
let currentNumber = null; // 現在呼び出し中の番号

function formatTime(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0') + ' ' +
    String(date.getHours()).padStart(2, '0') + ':' +
    String(date.getMinutes()).padStart(2, '0') + ':' +
    String(date.getSeconds()).padStart(2, '0');
}

io.on('connection', (socket) => {
  // 初期データ送信
  socket.emit('init', {
    tickets,
    issuedHistory,
    calledHistory,
    currentNumber
  });

// 発券リクエスト
socket.on('issueTicket', () => {
    // すべての発券番号の最大値を取得
    const allNumbers = [...tickets.map(t => t.number), ...issuedHistory.map(h => h.number)];
    const newNumber = allNumbers.length > 0 ? Math.max(...allNumbers) + 1 : 1;
    const time = formatTime(new Date());
    const ticket = { number: newNumber, time };
    tickets.push(ticket);
    issuedHistory.unshift(ticket);
    io.emit('update', { tickets, issuedHistory, calledHistory, currentNumber });
  });

  // 呼び出しリクエスト（スタッフ画面からのみ、発券中リストから選択）
  socket.on('callNumber', (number) => {
    const idx = tickets.findIndex(t => t.number === number);
    if (idx === -1) return; // 発券中でない番号は無視
    const time = formatTime(new Date());
    currentNumber = number;
    calledHistory.unshift({ number, time });
    tickets.splice(idx, 1); // 発券中リストから削除
    if (calledHistory.length > 10) calledHistory = calledHistory.slice(0, 10);
    io.emit('update', { tickets, issuedHistory, calledHistory, currentNumber });
  });

  // リセット
  socket.on('reset', () => {
    tickets = [];
    issuedHistory = [];
    calledHistory = [];
    currentNumber = null;
    io.emit('update', { tickets, issuedHistory, calledHistory, currentNumber });
  });

  // 管理画面用イベント
  socket.on('admin:clearTickets', () => {
    tickets = [];
    io.emit('update', { tickets, issuedHistory, calledHistory, currentNumber });
  });
  socket.on('admin:clearIssuedHistory', () => {
    issuedHistory = [];
    io.emit('update', { tickets, issuedHistory, calledHistory, currentNumber });
  });
  socket.on('admin:clearHistory', () => {
    calledHistory = [];
    io.emit('update', { tickets, issuedHistory, calledHistory, currentNumber });
  });
  socket.on('admin:setCurrentNumber', (number) => {
    currentNumber = number;
    io.emit('update', { tickets, issuedHistory, calledHistory, currentNumber });
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});