// 接続先のURLを動的に決定
const getServerUrl = () => {
  const currentHost = window.location.hostname;
  const port = 3001;
  return `http://${currentHost}:${port}`;
};

const socket = io(getServerUrl());

document.addEventListener('DOMContentLoaded', () => {
  const displayNumber = document.getElementById('displayNumber');
  const displaySeat = document.getElementById('displaySeat');
  const historyList = document.getElementById('historyList');
  const digitalClock = document.getElementById('digitalClock');
  const dateDisplay = document.getElementById('dateDisplay');
  const businessHours = document.getElementById('businessHours');
  const notification = document.getElementById('notification');
  const waitingCount = document.getElementById('waitingCount');
  const estimatedWait = document.getElementById('estimatedWait');
  const statusIndicator = document.getElementById('statusIndicator');

  let calledHistory = [];
  let currentCall = null;
  let tickets = [];
  let waitMinutesPerPerson = 5;
  let lastCallNumber = null;
  let lastCallSeat = null;
  let businessHoursConfig = {
    start: '09:00',
    end: '18:00',
    lunchStart: '12:00',
    lunchEnd: '13:00'
  };

  // 音声再生キュー
  let speechQueue = [];
  let isSpeaking = false;

  // シンプルな効果音作成
  function playCallSound() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.log('Audio not supported');
    }
  }

  function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    digitalClock.textContent = `${hours}:${minutes}:${seconds}`;
    
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateDisplay.textContent = now.toLocaleDateString('ja-JP', options);
    
    updateBusinessHoursDisplay(now);
  }

  function updateBusinessHoursDisplay(now) {
    const isOpen = isBusinessOpen(now);
    const isLunchTime = isLunchBreak(now);
    
    businessHours.textContent = `営業時間: ${businessHoursConfig.start}-${businessHoursConfig.end}`;
    
    if (isLunchTime) {
      statusIndicator.innerHTML = '🕐 昼休み中';
      statusIndicator.className = 'status-indicator lunch';
    } else if (isOpen) {
      statusIndicator.innerHTML = '🟢 営業中';
      statusIndicator.className = 'status-indicator';
    } else {
      statusIndicator.innerHTML = '🔴 営業時間外';
      statusIndicator.className = 'status-indicator closed';
    }
  }

  function isBusinessOpen(date = new Date()) {
    const day = date.getDay();
    if (day === 0) return false; // 日曜休み
    
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    
    if (time >= businessHoursConfig.lunchStart && time < businessHoursConfig.lunchEnd) {
      return false;
    }
    
    return time >= businessHoursConfig.start && time < businessHoursConfig.end;
  }

  function isLunchBreak(date = new Date()) {
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    return time >= businessHoursConfig.lunchStart && time < businessHoursConfig.lunchEnd;
  }

  setInterval(updateClock, 1000);
  updateClock();

  function showNotification(message) {
    notification.textContent = message;
    notification.className = 'notification show';
    
    setTimeout(() => {
      notification.className = 'notification';
    }, 8000);
  }

  // 音声再生キュー方式
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
    msg.rate = 0.9;
    msg.pitch = 1.0;
    msg.onend = () => {
      isSpeaking = false;
      setTimeout(() => {
        playNextSpeech();
      }, 1000);
    };
    window.speechSynthesis.speak(msg);
  }

  function getPriorityLabel(priority) {
    switch (priority) {
      case 'urgent': return '🚨 緊急';
      case 'appointment': return '📅 予約';
      case 'normal': 
      default: return '一般';
    }
  }

  function getPriorityClass(priority) {
    return `priority-${priority || 'normal'}`;
  }

  function calculateEstimatedWaitTime() {
    if (tickets.length === 0) return 0;
    
    const avgTreatmentTime = waitMinutesPerPerson || 5;
    const waitTime = tickets.length * avgTreatmentTime;
    return Math.max(waitTime, 5);
  }

  function updateWaitingInfo() {
    const waitCount = tickets.length;
    const estimatedMinutes = calculateEstimatedWaitTime();
    
    waitingCount.innerHTML = `${waitCount}<span class="info-item-unit">人</span>`;
    estimatedWait.innerHTML = `${estimatedMinutes}<span class="info-item-unit">分</span>`;
    
    if (waitCount > 0) {
      waitingCount.style.color = '#2c80b9';
      estimatedWait.style.color = '#2c80b9';
    } else {
      waitingCount.style.color = '#28a745';
      estimatedWait.style.color = '#28a745';
    }
  }

  function updateDisplay() {
    // 現在の呼び出し表示
    if (currentCall && currentCall.number) {
      const seatName = currentCall.seat ? currentCall.seat.name : '';
      
      if (lastCallNumber !== currentCall.number || lastCallSeat !== seatName) {
        playCallSound();
        
        const priorityLabel = getPriorityLabel(currentCall.priority);
        const message = priorityLabel === '一般' 
          ? `${currentCall.number}番の方、${seatName}へどうぞ`
          : `${priorityLabel} ${currentCall.number}番の方、${seatName}へどうぞ`;
        
        showNotification(message);
        speakCallQueued(`受付番号${currentCall.number}番の方、${seatName}へお越しください`);
        
        lastCallNumber = currentCall.number;
        lastCallSeat = seatName;
      }
      
      displayNumber.textContent = currentCall.number;
      displaySeat.textContent = currentCall.seat ? `${currentCall.seat.name}へどうぞ` : 'お待ちください';
      
      displayNumber.className = 'display-number calling';
      displaySeat.className = 'display-seat calling';
    } else {
      displayNumber.textContent = '---';
      displaySeat.textContent = 'お待ちください';
      displayNumber.className = 'display-number';
      displaySeat.className = 'display-seat';
    }

    updateWaitingInfo();
    updateHistoryDisplay();
  }

  function updateHistoryDisplay() {
    historyList.innerHTML = '';
    
    // 現在の呼び出しを履歴の最上位に表示
    let displayHistory = [...calledHistory];
    if (currentCall && currentCall.number) {
      const existsInHistory = calledHistory.some(item => 
        item.number === currentCall.number && 
        item.seat && item.seat.id === currentCall.seat.id
      );
      
      if (!existsInHistory) {
        displayHistory.unshift({
          ...currentCall,
          isCurrent: true,
          time: new Date().toLocaleTimeString('ja-JP', { 
            hour: '2-digit', 
            minute: '2-digit' 
          })
        });
      }
    }
    
    const historyToShow = displayHistory.slice(0, 6);
    
    if (historyToShow.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = '呼び出し履歴はありません';
      emptyMsg.className = 'no-history-message';
      historyList.appendChild(emptyMsg);
    } else {
      historyToShow.forEach((item) => {
        const div = document.createElement('div');
        const priorityClass = getPriorityClass(item.priority);
        const isCurrent = item.isCurrent;
        
        div.className = `history-item ${priorityClass} ${isCurrent ? 'current' : ''}`;
        
        div.innerHTML = `
          <div class="history-number">${item.number}</div>
          <div class="history-seat">${item.seat ? item.seat.name : ''}</div>
          <div class="history-time">${item.time || ''}</div>
          ${isCurrent ? '<div style="font-size: 0.7rem; color: #f39c12; margin-top: 0.2rem;">📢 呼び出し中</div>' : ''}
        `;
        
        historyList.appendChild(div);
      });
    }
  }

  // Socket.io イベントハンドラ
  socket.on('init', (data) => {
    console.log('初期データ受信:', data);
    calledHistory = data.calledHistory || [];
    currentCall = data.currentCall;
    tickets = data.tickets || [];
    waitMinutesPerPerson = data.waitMinutesPerPerson || 5;
    
    if (data.businessHours) {
      businessHoursConfig = { ...businessHoursConfig, ...data.businessHours };
    }
    
    updateDisplay();
  });

  socket.on('update', (data) => {
    console.log('更新データ受信:', data);
    calledHistory = data.calledHistory || [];
    currentCall = data.currentCall;
    tickets = data.tickets || [];
    waitMinutesPerPerson = data.waitMinutesPerPerson || 5;
    
    if (data.businessHours) {
      businessHoursConfig = { ...businessHoursConfig, ...data.businessHours };
    }
    
    updateDisplay();
  });

  // 接続状態の監視
  socket.on('connect', () => {
    console.log('サーバーに接続しました');
  });

  socket.on('disconnect', () => {
    console.log('サーバーとの接続が切断されました');
    statusIndicator.innerHTML = '🔴 接続エラー';
    statusIndicator.className = 'status-indicator closed';
  });

  // キーボードショートカット
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'r':
          e.preventDefault();
          location.reload();
          break;
        case 'm':
          e.preventDefault();
          window.speechSynthesis.cancel();
          isSpeaking = false;
          speechQueue = [];
          break;
      }
    }
  });

  // 画面の可視性変更時の処理
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
    } else {
      updateClock();
    }
  });

  // フルスクリーンモード切り替え
  document.addEventListener('dblclick', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });

  console.log('F-Call 待合室表示システム初期化完了');
});