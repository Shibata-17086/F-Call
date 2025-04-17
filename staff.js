const socket = io('http://localhost:3001');

document.addEventListener('DOMContentLoaded', () => {
  const currentNumberElement = document.getElementById('currentNumber');
  const ticketList = document.getElementById('ticketList');
  const historyList = document.getElementById('historyList');
  const resetAllBtn = document.getElementById('resetAll');
  const currentCallDisplay = document.getElementById('currentCallDisplay');
  const debugPanel = document.getElementById('debugPanel');
  const debugInfo = document.getElementById('debugInfo');

  let tickets = [];
  let calledHistory = [];
  let currentCall = null;
  let seats = [];

  // デバッグ情報を表示
  function showDebug(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.textContent = `${timestamp}: ${message}`;
    debugInfo.appendChild(logEntry);
    
    // スクロールを最新に
    debugInfo.scrollTop = debugInfo.scrollHeight;
    
    // デバッグパネルを表示
    debugPanel.style.display = 'block';
    
    console.log(message);
  }

  // キーボードショートカット (Ctrl+Shift+D) でデバッグパネルの表示切替
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
    }
  });

  function updateDisplay() {
    showDebug(`スタッフ画面更新: チケット数=${tickets.length}, 座席数=${seats.length}`);

    // 現在の呼び出し番号表示
    if (currentNumberElement) {
      currentNumberElement.textContent = currentCall && currentCall.number
        ? `${currentCall.number}（${currentCall.seat ? currentCall.seat.name : ''}）`
        : '---';
    }

    currentCallDisplay.textContent = currentCall && currentCall.number
      ? `番号: ${currentCall.number}　座席: ${currentCall.seat ? currentCall.seat.name : ''}`
      : '---';

    // 発券中リスト
    ticketList.innerHTML = '';
    
    if (tickets.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = '現在発券中の番号はありません';
      emptyMsg.className = 'empty-message';
      ticketList.appendChild(emptyMsg);
      return;
    }
    
    if (seats.length === 0) {
      const noSeatsMsg = document.createElement('div');
      noSeatsMsg.textContent = '座席が登録されていません。管理画面で座席を追加してください。';
      noSeatsMsg.className = 'empty-message';
      noSeatsMsg.style.color = 'red';
      ticketList.appendChild(noSeatsMsg);
      return;
    }

    tickets.forEach(ticket => {
      // 座席選択ドロップダウン＋呼び出しボタン
      const div = document.createElement('div');
      div.className = 'number-item';
      div.style.display = 'flex';
      div.style.flexDirection = 'column';
      div.style.alignItems = 'center';
      div.style.gap = '0.5rem';
      div.style.padding = '1rem';
      div.style.minWidth = '200px';

      const numDiv = document.createElement('div');
      numDiv.innerHTML = `<div style="font-size:1.5rem;font-weight:bold;">${ticket.number}</div>
                         <div style="font-size:0.9rem;color:#888;">${ticket.time}</div>`;
      numDiv.style.marginBottom = '0.5rem';
      numDiv.style.textAlign = 'center';

      const seatSelect = document.createElement('select');
      seatSelect.style.padding = '0.5rem';
      seatSelect.style.width = '100%';
      seatSelect.style.marginBottom = '0.5rem';
      
      if (seats.length > 0) {
        seats.forEach(seat => {
          const opt = document.createElement('option');
          opt.value = seat.id;
          opt.textContent = seat.name;
          seatSelect.appendChild(opt);
        });
      } else {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '-- 座席がありません --';
        seatSelect.appendChild(opt);
        seatSelect.disabled = true;
      }

      const callBtn = document.createElement('button');
      callBtn.textContent = '呼び出し';
      callBtn.className = 'btn primary';
      callBtn.style.width = '100%';
      callBtn.style.padding = '0.5rem';
      
      if (seats.length === 0) {
        callBtn.disabled = true;
      }
      
      callBtn.onclick = () => {
        const seatId = seatSelect.value;
        if (!seatId) {
          alert('座席を選択してください');
          return;
        }
        console.log('呼び出し：番号=', ticket.number, '座席ID=', seatId);
        socket.emit('callNumber', { number: ticket.number, seatId });
      };

      div.appendChild(numDiv);
      div.appendChild(seatSelect);
      div.appendChild(callBtn);
      ticketList.appendChild(div);
    });

    // 呼び出し履歴
    historyList.innerHTML = '';
    if (calledHistory.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = '呼び出し履歴はありません';
      emptyMsg.style.padding = '1rem';
      emptyMsg.style.color = '#666';
      historyList.appendChild(emptyMsg);
      return;
    }
    
    calledHistory.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `<div style="font-size:1.2rem;font-weight:bold;">${item.number}</div>
        <div style="font-size:0.9rem;color:#888;">${item.time}</div>
        <div style="font-size:0.9rem;color:#1565c0;">${item.seat ? item.seat.name : ''}</div>`;
      historyList.appendChild(div);
    });
  }

  socket.on('init', (data) => {
    console.log('初期データ受信:', data);
    tickets = data.tickets || [];
    calledHistory = data.calledHistory || [];
    currentCall = data.currentCall;
    seats = data.seats || [];
    updateDisplay();
  });

  socket.on('update', (data) => {
    console.log('更新データ受信:', data);
    tickets = data.tickets || [];
    calledHistory = data.calledHistory || [];
    currentCall = data.currentCall;
    seats = data.seats || [];
    updateDisplay();
  });

  resetAllBtn.onclick = () => {
    if (confirm('本当にサーバー全体をリセットしますか？')) {
      socket.emit('reset');
    }
  };

  // 接続チェック
  socket.on('connect', () => {
    console.log('サーバーに接続しました');
  });

  socket.on('connect_error', (err) => {
    console.error('サーバー接続エラー:', err);
    alert('サーバーに接続できません。サーバーが起動しているか確認してください。');
  });

  // 初回表示の更新
  updateDisplay();
});