// 接続先のURLを動的に決定
const getServerUrl = () => {
  // 本番環境では現在接続しているホストを使用
  const currentHost = window.location.hostname;
  const port = 3001; // サーバーのポート番号
  return `http://${currentHost}:${port}`;
};

const socket = io(getServerUrl());

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
  let lastCallSeat = null;

  // 音声再生キュー
  let speechQueue = [];
  let isSpeaking = false;

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
    }, 8000);
  }

  // 音声再生キュー方式で呼び出しを再生する関数
  function speakCallQueued(text) {
    speechQueue.push(text);
    playNextSpeech();
  }

  function playNextSpeech() {
    if (isSpeaking || speechQueue.length === 0) return;
    isSpeaking = true;
    const text = speechQueue.shift();
    const msg = new window.SpeechSynthesisUtterance(text);
    msg.lang = 'ja-JP';
    msg.onend = () => {
      isSpeaking = false;
      setTimeout(() => {
        playNextSpeech();
      }, 1000);
    };
    window.speechSynthesis.speak(msg);
  }

  function updateDisplay() {
    if (currentCall && currentCall.number) {
      // 番号も座席も前回と同じなら何もしない
      const seatName = currentCall.seat ? currentCall.seat.name : '';
      if (lastCallNumber !== currentCall.number || lastCallSeat !== seatName) {
        showNotification(`${currentCall.number}番の方、${seatName}へどうぞ`);
        speakCallQueued(`受付番号${currentCall.number}番の方、${seatName}へどうぞ`);
        lastCallNumber = currentCall.number;
        lastCallSeat = seatName;
      }
      
      displayNumber.textContent = currentCall.number;
      displaySeat.textContent = currentCall.seat ? `${currentCall.seat.name}へどうぞ` : 'お待ちください';
      
      displayNumber.classList.add('highlight');
      setTimeout(() => {
        displayNumber.classList.remove('highlight');
      }, 1500);
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
        .slice(0, 6);
        
      historyToShow.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
          <div style="font-size:2.2rem;font-weight:bold;color:#4ca3d8;">${item.number}</div>
          <div style="font-size:1.1rem;color:#666;margin-top:0.5rem;">${item.seat ? item.seat.name : ''}</div>
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
      50% { transform: scale(1.03); }
      100% { transform: scale(1); }
    }
    .highlight {
      animation: highlight 1.5s ease;
    }
  `;
  document.head.appendChild(style);
});