// 接続先のURLを動的に決定
const getServerUrl = () => {
  const currentHost = window.location.hostname;
  const port = 3443; // サーバーのポート番号
  return `https://${currentHost}:${port}`;
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

// 合成音声テスト用
const testSpeechBtn = document.getElementById('testSpeechBtn');
if (testSpeechBtn) {
  testSpeechBtn.onclick = () => {
    const msg = new window.SpeechSynthesisUtterance('受付番号1番の方、1番診察台へどうぞ');
    msg.lang = 'ja-JP';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(msg);
  };
}

let seats = [];
let tickets = [];
let issuedHistory = [];
let calledHistory = [];
let currentCall = null;
let waitMinutesPerPerson = 5;
let statistics = { averageWaitTime: 5, averageSessionTime: 10 };
let currentDate = '';

function updateDisplay() {
  // 統計情報の更新
  updateStatistics();
  
  // 座席状況の更新
  updateSeatStatusGrid();

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

  // 発券中番号リスト（優先度付き表示）
  ticketList.innerHTML = '';
  if (tickets.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.textContent = '現在発券中の番号はありません';
    emptyMsg.className = 'empty-message';
    ticketList.appendChild(emptyMsg);
  } else {
    // 優先度順にソート
    const sortedTickets = [...tickets].sort((a, b) => {
      const priorityOrder = { urgent: 0, appointment: 1, normal: 2 };
      return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
    });
    
    sortedTickets.forEach(ticket => {
      const div = document.createElement('div');
      div.className = 'number-item';
      div.style.cssText = getPriorityStyle(ticket.priority);
      
      const priorityLabel = getPriorityLabel(ticket.priority);
      const waitTimeInfo = ticket.estimatedWaitTime ? `予想: ${ticket.estimatedWaitTime}分` : '';
      
      div.innerHTML = `
        <div style="font-size:1.5rem;font-weight:bold;">${ticket.number}</div>
        <div style="font-size:0.9rem;color:#888;">${ticket.time}</div>
        <div style="font-size:0.8rem;font-weight:bold;color:#1565c0;">${priorityLabel}</div>
        <div style="font-size:0.8rem;color:#666;">${waitTimeInfo}</div>
      `;
      ticketList.appendChild(div);
    });
  }

  // 発券履歴リスト
  issuedHistoryList.innerHTML = '';
  issuedHistory.forEach(ticket => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const priorityLabel = getPriorityLabel(ticket.priority);
    div.innerHTML = `
      <div style="font-size:1.2rem;font-weight:bold;">${ticket.number}</div>
      <div style="font-size:0.9rem;color:#888;">${ticket.time}</div>
      <div style="font-size:0.8rem;color:#1565c0;">${priorityLabel}</div>
    `;
    issuedHistoryList.appendChild(div);
  });

  // 呼び出し履歴リスト
  historyList.innerHTML = '';
  
  // 表示用の履歴リストを作成（サーバーから受信した履歴をそのまま使用）
  let displayHistory = [...calledHistory];
  
  // 現在の呼び出しが履歴に既に含まれているかチェック
  let currentCallInHistory = false;
  if (currentCall && currentCall.number) {
    currentCallInHistory = calledHistory.some(item => 
      item.number === currentCall.number && 
      item.seat && currentCall.seat && 
      item.seat.name === currentCall.seat.name &&
      !item.cancelled
    );
    
    // 履歴に含まれていない場合のみ、現在の呼び出しを最上部に追加
    if (!currentCallInHistory) {
      displayHistory.unshift({
        number: currentCall.number,
        seat: currentCall.seat,
        time: currentCall.time,
        actualWaitTime: null, // 診察中なので待ち時間は未確定
        isCurrentCall: true, // 現在呼び出し中のマーク
        priority: 'current' // 現在呼び出し中を示す特別な優先度
      });
    }
  }
  
  if (displayHistory.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.textContent = '呼び出し履歴はありません';
    emptyMsg.style.padding = '1rem';
    emptyMsg.style.color = '#666';
    historyList.appendChild(emptyMsg);
  } else {
    displayHistory.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'history-item';
      
      // 現在呼び出し中の項目のスタイル
      if (item.isCurrentCall || (currentCall && currentCall.number === item.number && !item.cancelled)) {
        div.style.cssText += 'border: 2px solid #4caf50; background: #e8f5e8;';
      }
      // キャンセル済みの場合のスタイル
      else if (item.cancelled) {
        div.style.cssText += 'opacity: 0.6; background: #f5f5f5; border-left: 4px solid #ff5722;';
      }
      
      const waitTimeInfo = item.actualWaitTime ? `実際: ${item.actualWaitTime}分` : 
                          (item.isCurrentCall || (currentCall && currentCall.number === item.number && !item.cancelled) ? '診察中' : '');
      const cancelInfo = item.cancelled ? `<div style="font-size:0.8rem;color:#ff5722;font-weight:bold;">❌ キャンセル済み (${item.cancelTime})</div>` : '';
      const currentCallInfo = (item.isCurrentCall || (currentCall && currentCall.number === item.number && !item.cancelled)) ? 
                             `<div style="font-size:0.8rem;color:#4caf50;font-weight:bold;">🔥 現在呼び出し中</div>` : '';
      
      div.innerHTML = `
        <div style="font-size:1.2rem;font-weight:bold;">${item.number}</div>
        <div style="font-size:0.9rem;color:#888;">${item.time}</div>
        <div style="font-size:0.9rem;color:#1565c0;">${item.seat ? item.seat.name : ''}</div>
        <div style="font-size:0.8rem;color:#666;">${waitTimeInfo}</div>
        ${cancelInfo}
        ${currentCallInfo}
      `;
      
      // キャンセルボタン（キャンセル済みでない場合のみ表示）
      if (!item.cancelled) {
        const isCurrentlyActive = item.isCurrentCall || (currentCall && currentCall.number === item.number);
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = isCurrentlyActive ? '取り消し' : 'キャンセル';
        cancelBtn.className = 'btn btn-danger';
        cancelBtn.style.cssText = 'margin-top: 0.5rem; font-size: 0.8rem; padding: 0.3rem 0.6rem;';
        cancelBtn.onclick = () => {
          const confirmMessage = isCurrentlyActive 
            ? `現在呼び出し中の番号${item.number}（${item.seat ? item.seat.name : ''}）を取り消しますか？`
            : `番号${item.number}（${item.seat ? item.seat.name : ''}）の呼び出しをキャンセルしますか？`;
          
          if (confirm(confirmMessage)) {
            if (isCurrentlyActive) {
              // 現在の呼び出しのキャンセル
              socket.emit('cancelCall');
            } else {
              // 履歴からのキャンセル（現在の呼び出しが含まれているかどうかでインデックスを調整）
              const historyIndex = currentCallInHistory ? index : index - 1;
              socket.emit('cancelHistoryCall', { 
                number: item.number, 
                seatId: item.seat ? item.seat.id : null,
                historyIndex: Math.max(0, historyIndex)
              });
            }
          }
        };
        div.appendChild(cancelBtn);
      }
      
      historyList.appendChild(div);
    });
  }

  // 現在の呼び出し番号
  currentNumber.textContent = currentCall && currentCall.number
    ? `${currentCall.number}（${currentCall.seat ? currentCall.seat.name : ''}）`
    : '---';

  // 待ち時間設定
  waitMinutesInput.value = waitMinutesPerPerson;

  console.log('admin update', tickets, issuedHistory);
}

function updateStatistics() {
  document.getElementById('total-waiting').textContent = tickets.length;
  document.getElementById('avg-wait-time').textContent = Math.round(statistics.averageWaitTime || 5);
  document.getElementById('avg-session-time').textContent = Math.round(statistics.averageSessionTime || 10);
  
  // 本日の発券数（発券履歴から当日分を計算）
  const today = currentDate;
  const todayTickets = issuedHistory.filter(ticket => ticket.date === today);
  document.getElementById('daily-tickets').textContent = todayTickets.length;
  
  // 利用可能座席数
  const availableSeats = seats.filter(seat => seat.status === 'available').length;
  document.getElementById('available-seats').textContent = availableSeats;
}

function updateSeatStatusGrid() {
  const grid = document.getElementById('seatStatusGrid');
  if (!grid) return;
  
  grid.innerHTML = '';
  
  if (seats.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.textContent = '座席が登録されていません';
    emptyMsg.style.cssText = 'grid-column: 1 / -1; text-align: center; color: #666; padding: 2rem;';
    grid.appendChild(emptyMsg);
    return;
  }
  
  seats.forEach(seat => {
    const seatDiv = document.createElement('div');
    seatDiv.className = `seat-status-item ${seat.status === 'busy' ? 'seat-busy' : 'seat-available'}`;
    
    const statusText = seat.status === 'busy' ? '使用中' : '空席';
    const patientInfo = seat.currentPatient ? `患者: ${seat.currentPatient}番` : '';
    const sessionTime = seat.sessionStartTime 
      ? `経過: ${Math.round((new Date() - new Date(seat.sessionStartTime)) / (1000 * 60))}分`
      : '';
    
    seatDiv.innerHTML = `
      <div style="font-size: 1.1rem; margin-bottom: 0.5rem;">${seat.name}</div>
      <div style="font-size: 0.9rem;">${statusText}</div>
      ${patientInfo ? `<div style="font-size: 0.8rem; margin-top: 0.3rem;">${patientInfo}</div>` : ''}
      ${sessionTime ? `<div style="font-size: 0.8rem; color: #666;">${sessionTime}</div>` : ''}
    `;
    
    grid.appendChild(seatDiv);
  });
}

function getPriorityStyle(priority) {
  switch (priority) {
    case 'urgent':
      return 'border: 2px solid #f44336; background: #ffebee; padding: 1rem; border-radius: 5px;';
    case 'appointment':
      return 'border: 2px solid #ff9800; background: #fff3e0; padding: 1rem; border-radius: 5px;';
    default:
      return 'border: 1px solid #ddd; background: #f8f9fa; padding: 1rem; border-radius: 5px;';
  }
}

function getPriorityLabel(priority) {
  switch (priority) {
    case 'urgent': return '🚨 緊急';
    case 'appointment': return '📅 予約';
    case 'manual': return '🔧 手動設定';
    default: return '👤 一般';
  }
}

socket.on('init', (data) => {
  seats = data.seats || [];
  tickets = data.tickets || [];
  issuedHistory = data.issuedHistory || [];
  calledHistory = data.calledHistory || [];
  currentCall = data.currentCall;
  waitMinutesPerPerson = data.waitMinutesPerPerson || 5;
  statistics = data.statistics || { averageWaitTime: 5, averageSessionTime: 10 };
  currentDate = data.currentDate || '';
  updateDisplay();
});

socket.on('update', (data) => {
  seats = data.seats || [];
  tickets = data.tickets || [];
  issuedHistory = data.issuedHistory || [];
  calledHistory = data.calledHistory || [];
  currentCall = data.currentCall;
  waitMinutesPerPerson = data.waitMinutesPerPerson || 5;
  statistics = data.statistics || { averageWaitTime: 5, averageSessionTime: 10 };
  currentDate = data.currentDate || '';
  updateDisplay();
});

// キャンセル成功通知を受信
socket.on('cancelSuccess', (data) => {
  // キャンセル成功メッセージを一時的に表示
  const cancelMsg = document.createElement('div');
  cancelMsg.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff5722;
    color: white;
    padding: 1rem 2rem;
    border-radius: 5px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    z-index: 1000;
    font-size: 1.1rem;
  `;
  cancelMsg.textContent = `❌ ${data.message}`;
  document.body.appendChild(cancelMsg);
  
  // 3秒後に自動削除
  setTimeout(() => {
    if (cancelMsg.parentNode) {
      cancelMsg.parentNode.removeChild(cancelMsg);
    }
  }, 3000);
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