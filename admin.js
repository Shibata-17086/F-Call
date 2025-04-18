// 接続先のURLを動的に決定
const getServerUrl = () => {
  // 本番環境では現在接続しているホストを使用
  const currentHost = window.location.hostname;
  const port = 3001; // サーバーのポート番号
  return `http://${currentHost}:${port}`;
};

const socket = io(getServerUrl());
const seatList = document.getElementById('seatList');
const newSeatName = document.getElementById('newSeatName');
const addSeatBtn = document.getElementById('addSeatBtn');
const ticketList = document.getElementById('ticketList');
const issuedHistoryList = document.getElementById('issuedHistoryList');
const historyList = document.getElementById('historyList');
const currentNumber = document.getElementById('currentNumber');
const waitMinutesInput = document.getElementById('waitMinutesInput');
const setWaitMinutesBtn = document.getElementById('setWaitMinutesBtn');
const clearTickets = document.getElementById('clearTickets');
const clearIssuedHistory = document.getElementById('clearIssuedHistory');
const clearHistory = document.getElementById('clearHistory');
const setNumberInput = document.getElementById('setNumberInput');
const setSeatSelect = document.getElementById('setSeatSelect');
const setNumberBtn = document.getElementById('setNumberBtn');
const resetAll = document.getElementById('resetAll');

let seats = [];
let tickets = [];
let issuedHistory = [];
let calledHistory = [];
let currentCall = null;
let waitMinutesPerPerson = 5;

function updateDisplay() {
  // 座席リスト
  seatList.innerHTML = '';
  seats.forEach(seat => {
    const div = document.createElement('div');
    div.className = 'seat-item';
    const nameInput = document.createElement('input');
    nameInput.value = seat.name;
    nameInput.className = 'seat-edit';
    nameInput.style.fontSize = '1rem';
    nameInput.onchange = () => {
      socket.emit('admin:editSeat', { id: seat.id, name: nameInput.value });
    };
    const delBtn = document.createElement('button');
    delBtn.textContent = '削除';
    delBtn.className = 'btn btn-danger';
    delBtn.onclick = () => {
      if (confirm('本当に削除しますか？')) socket.emit('admin:removeSeat', seat.id);
    };
    div.appendChild(nameInput);
    div.appendChild(delBtn);
    seatList.appendChild(div);
  });
  
  // 座席選択ドロップダウンを更新
  setSeatSelect.innerHTML = '';
  seats.forEach(seat => {
    const option = document.createElement('option');
    option.value = seat.id;
    option.textContent = seat.name;
    setSeatSelect.appendChild(option);
  });

  // 発券中番号リスト
  ticketList.innerHTML = '';
  tickets.forEach(ticket => {
    const div = document.createElement('div');
    div.className = 'number-item';
    div.innerHTML = `<div style="font-size:1.5rem;font-weight:bold;">${ticket.number}</div>
      <div style="font-size:0.9rem;color:#888;">${ticket.time}</div>`;
    ticketList.appendChild(div);
  });

  // 発券履歴リスト
  issuedHistoryList.innerHTML = '';
  issuedHistory.forEach(ticket => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `<div style="font-size:1.2rem;font-weight:bold;">${ticket.number}</div>
      <div style="font-size:0.9rem;color:#888;">${ticket.time}</div>`;
    issuedHistoryList.appendChild(div);
  });

  // 呼び出し履歴リスト
  historyList.innerHTML = '';
  calledHistory.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `<div style="font-size:1.2rem;font-weight:bold;">${item.number}</div>
      <div style="font-size:0.9rem;color:#888;">${item.time}</div>
      <div style="font-size:0.9rem;color:#1565c0;">${item.seat ? item.seat.name : ''}</div>`;
    historyList.appendChild(div);
  });

  // 現在の呼び出し番号
  currentNumber.textContent = currentCall && currentCall.number
    ? `${currentCall.number}（${currentCall.seat ? currentCall.seat.name : ''}）`
    : '---';

  // 待ち時間設定
  waitMinutesInput.value = waitMinutesPerPerson;

  console.log('admin update', tickets, issuedHistory);
}

socket.on('init', (data) => {
  seats = data.seats || [];
  tickets = data.tickets || [];
  issuedHistory = data.issuedHistory || [];
  calledHistory = data.calledHistory || [];
  currentCall = data.currentCall;
  waitMinutesPerPerson = data.waitMinutesPerPerson || 5;
  updateDisplay();
});

socket.on('update', (data) => {
  seats = data.seats || [];
  tickets = data.tickets || [];
  issuedHistory = data.issuedHistory || [];
  calledHistory = data.calledHistory || [];
  currentCall = data.currentCall;
  waitMinutesPerPerson = data.waitMinutesPerPerson || 5;
  updateDisplay();
});

// 座席追加
addSeatBtn.onclick = () => {
  const name = newSeatName.value.trim();
  if (!name) {
    alert('座席名を入力してください');
    return;
  }
  socket.emit('admin:addSeat', name);
  newSeatName.value = '';
};

// 待ち時間設定
setWaitMinutesBtn.onclick = () => {
  const minutes = parseInt(waitMinutesInput.value);
  if (isNaN(minutes) || minutes <= 0) {
    alert('有効な数値を入力してください');
    return;
  }
  socket.emit('admin:setWaitMinutes', minutes);
};

// 発券中番号をクリア
clearTickets.onclick = () => {
  if (confirm('現在発券中の番号をすべて削除しますか？')) {
    socket.emit('admin:clearTickets');
  }
};

// 発券履歴をクリア
clearIssuedHistory.onclick = () => {
  if (confirm('発券履歴をすべて削除しますか？')) {
    socket.emit('admin:clearIssuedHistory');
  }
};

// 呼び出し履歴をクリア
clearHistory.onclick = () => {
  if (confirm('呼び出し履歴をすべて削除しますか？')) {
    socket.emit('admin:clearHistory');
  }
};

// 呼び出し番号を設定
setNumberBtn.onclick = () => {
  const number = parseInt(setNumberInput.value);
  const seatId = setSeatSelect.value;
  if (isNaN(number) || !seatId) {
    alert('番号と座席を正しく入力・選択してください');
    return;
  }
  socket.emit('admin:setCurrentNumber', { number, seatId });
};

// リセット
resetAll.onclick = () => {
  if (confirm('サーバー全体をリセットしますか？すべてのデータが削除されます')) {
    socket.emit('reset');
  }
};