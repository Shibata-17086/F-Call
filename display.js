const socket = io('http://localhost:3001');

document.addEventListener('DOMContentLoaded', () => {
  const displayNumber = document.getElementById('displayNumber');
  const displaySeat = document.getElementById('displaySeat');
  const historyList = document.getElementById('historyList');
  const digitalClock = document.getElementById('digitalClock');
  const dateDisplay = document.getElementById('dateDisplay');
  const notification = document.getElementById('notification');

  let calledHistory = [];
  let currentCall = null;
  let tickets = [];
  let waitMinutesPerPerson = 5;
  let lastCallNumber = null;

  function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    digitalClock.textContent = `${hours}:${minutes}:${seconds}`;
    
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateDisplay.textContent = now.toLocaleDateString('ja-JP', options);
  }

  setInterval(updateClock, 1000);
  updateClock();

  function showNotification(message) {
    notification.textContent = message;
    notification.style.display = 'block';

    setTimeout(() => {
      notification.style.display = 'none';
    }, 10000);
  }

  function updateDisplay() {
    if (currentCall && currentCall.number) {
      if (lastCallNumber !== currentCall.number) {
        showNotification(`${currentCall.number}番の方、${currentCall.seat ? currentCall.seat.name : ''}へどうぞ`);
        lastCallNumber = currentCall.number;
      }
      
      displayNumber.textContent = currentCall.number;
      displaySeat.textContent = currentCall.seat ? `${currentCall.seat.name}へどうぞ` : 'お待ちください';
      
      displayNumber.classList.add('highlight');
      setTimeout(() => {
        displayNumber.classList.remove('highlight');
      }, 2000);
    } else {
      displayNumber.textContent = '---';
      displaySeat.textContent = 'お待ちください';
    }

    historyList.innerHTML = '';
    
    if (calledHistory.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = '呼び出し履歴はありません';
      emptyMsg.className = 'no-history-message';
      historyList.appendChild(emptyMsg);
    } else {
      const historyToShow = calledHistory
        .filter(item => !currentCall || item.number !== currentCall.number)
        .slice(0, 8);
        
      historyToShow.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
          <div style="font-size:2.5rem;font-weight:bold;">${item.number}</div>
          <div style="font-size:1.2rem;color:#fff;margin-top:0.5rem;">${item.seat ? item.seat.name : ''}</div>
        `;
        historyList.appendChild(div);
      });
    }
  }

  socket.on('init', (data) => {
    console.log('初期データ受信:', data);
    calledHistory = data.calledHistory || [];
    currentCall = data.currentCall;
    tickets = data.tickets || [];
    waitMinutesPerPerson = data.waitMinutesPerPerson || 5;
    updateDisplay();
  });

  socket.on('update', (data) => {
    console.log('更新データ受信:', data);
    calledHistory = data.calledHistory || [];
    currentCall = data.currentCall;
    tickets = data.tickets || [];
    waitMinutesPerPerson = data.waitMinutesPerPerson || 5;
    updateDisplay();
  });
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes highlight {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }
    .highlight {
      animation: highlight 2s ease;
    }
  `;
  document.head.appendChild(style);
});