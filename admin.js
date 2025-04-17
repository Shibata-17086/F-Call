const socket = io('http://localhost:3001');
const ticketList = document.getElementById('ticketList');
const issuedHistoryList = document.getElementById('issuedHistoryList');
const historyList = document.getElementById('historyList');
const currentNumberDiv = document.getElementById('currentNumber');
const setNumberInput = document.getElementById('setNumberInput');
const setNumberBtn = document.getElementById('setNumberBtn');
const clearTicketsBtn = document.getElementById('clearTickets');
const clearIssuedHistoryBtn = document.getElementById('clearIssuedHistory');
const clearHistoryBtn = document.getElementById('clearHistory');
const resetAllBtn = document.getElementById('resetAll');

let tickets = [];
let issuedHistory = [];
let calledHistory = [];
let currentNumber = null;

function updateDisplay() {
  // 現在発券中の番号
  ticketList.innerHTML = '';
  tickets.forEach(ticket => {
    const div = document.createElement('div');
    div.className = 'number-item';
    div.innerHTML = `<div style="font-size:1.2rem;font-weight:bold;">${ticket.number}</div><div style="font-size:0.9rem;color:#888;">${ticket.time}</div>`;
    ticketList.appendChild(div);
  });

  // 発券履歴
  issuedHistoryList.innerHTML = '';
  issuedHistory.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `<div style="font-size:1.2rem;font-weight:bold;">${item.number}</div><div style="font-size:0.9rem;color:#888;">${item.time}</div>`;
    issuedHistoryList.appendChild(div);
  });

  // 呼び出し履歴
  historyList.innerHTML = '';
  calledHistory.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `<div style="font-size:1.2rem;font-weight:bold;">${item.number}</div><div style="font-size:0.9rem;color:#888;">${item.time}</div>`;
    historyList.appendChild(div);
  });

  // 現在の呼び出し番号
  currentNumberDiv.textContent = currentNumber !== null ? currentNumber : '---';
}

socket.on('init', (data) => {
  tickets = data.tickets;
  issuedHistory = data.issuedHistory;
  calledHistory = data.calledHistory;
  currentNumber = data.currentNumber;
  updateDisplay();
});

socket.on('update', (data) => {
  tickets = data.tickets;
  issuedHistory = data.issuedHistory;
  calledHistory = data.calledHistory;
  currentNumber = data.currentNumber;
  updateDisplay();
});

clearTicketsBtn.onclick = () => {
  if (confirm('本当に全ての発券中番号を削除しますか？')) {
    socket.emit('admin:clearTickets');
  }
};

clearIssuedHistoryBtn.onclick = () => {
  if (confirm('本当に発券履歴をクリアしますか？')) {
    socket.emit('admin:clearIssuedHistory');
  }
};

clearHistoryBtn.onclick = () => {
  if (confirm('本当に呼び出し履歴をクリアしますか？')) {
    socket.emit('admin:clearHistory');
  }
};

setNumberBtn.onclick = () => {
  const val = parseInt(setNumberInput.value);
  if (isNaN(val) || val < 0) {
    alert('0以上の番号を入力してください');
    return;
  }
  socket.emit('admin:setCurrentNumber', val);
};

resetAllBtn.onclick = () => {
  if (confirm('本当にサーバー全体をリセットしますか？')) {
    socket.emit('reset');
  }
};