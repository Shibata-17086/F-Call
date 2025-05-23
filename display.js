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

  // 効果音作成
  function createBeepSound(frequency = 800, duration = 200) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration / 1000);
  }

  function playCallSound() {
    // 優雅な3音の呼び出し音
    createBeepSound(600, 150);
    setTimeout(() => createBeepSound(800, 150), 200);
    setTimeout(() => createBeepSound(1000, 300), 400);
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
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const isOpen = isBusinessOpen(now);
    const isLunchTime = isLunchBreak(now);
    
    businessHours.textContent = `営業時間: ${businessHoursConfig.start}-${businessHoursConfig.end}`;
    
    if (isLunchTime) {
      statusIndicator.innerHTML = '🕐 昼休み中';
      statusIndicator.className = 'status-indicator closed';
    } else if (isOpen) {
      statusIndicator.innerHTML = '🟢 営業中';
      statusIndicator.className = 'status-indicator';
    } else {
      statusIndicator.innerHTML = '🔴 営業時間外';
      statusIndicator.className = 'status-indicator closed';
    }
  }

  function isBusinessOpen(date = new Date()) {
    const day = date.getDay(); // 0=日曜, 6=土曜
    if (day === 0) return false; // 日曜休み
    
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    
    // 昼休み時間のチェック
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
    
    // 8秒後に非表示
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
    msg.rate = 0.9; // 少しゆっくり
    msg.pitch = 1.1; // 少し高めの音程
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
      default: return '👤 一般';
    }
  }

  function getPriorityClass(priority) {
    return `priority-${priority || 'normal'}`;
  }

  function calculateEstimatedWaitTime() {
    if (tickets.length === 0) return 0;
    
    // 空いている座席数を考慮した待ち時間計算
    const availableSeats = 4; // 仮の座席数（実際はサーバーから取得）
    const avgTreatmentTime = waitMinutesPerPerson || 5;
    
    // 並列処理を考慮した計算
    const waitTime = Math.ceil(tickets.length / availableSeats) * avgTreatmentTime;
    return Math.max(waitTime, 5); // 最低5分
  }

  function updateWaitingInfo() {
    const waitCount = tickets.length;
    const estimatedMinutes = calculateEstimatedWaitTime();
    
    waitingCount.innerHTML = `${waitCount}<span class="info-item-unit">人</span>`;
    estimatedWait.innerHTML = `${estimatedMinutes}<span class="info-item-unit">分</span>`;
    
    // アニメーション効果
    if (waitCount > 0) {
      waitingCount.style.color = '#667eea';
      estimatedWait.style.color = '#667eea';
    } else {
      waitingCount.style.color = '#28a745';
      estimatedWait.style.color = '#28a745';
    }
  }

  function updateDisplay() {
    // 現在の呼び出し表示
    if (currentCall && currentCall.number) {
      const seatName = currentCall.seat ? currentCall.seat.name : '';
      
      // 新しい呼び出しの場合
      if (lastCallNumber !== currentCall.number || lastCallSeat !== seatName) {
        // 効果音再生
        playCallSound();
        
        // 通知表示
        const priorityLabel = getPriorityLabel(currentCall.priority);
        showNotification(`${priorityLabel} ${currentCall.number}番の方、${seatName}へどうぞ`);
        
        // 音声アナウンス
        const speechText = `${getPriorityLabel(currentCall.priority)} 受付番号${currentCall.number}番の方、${seatName}へお越しください`;
        speakCallQueued(speechText);
        
        lastCallNumber = currentCall.number;
        lastCallSeat = seatName;
      }
      
      displayNumber.textContent = currentCall.number;
      displaySeat.textContent = currentCall.seat ? `${currentCall.seat.name}へどうぞ` : 'お待ちください';
      
      // アニメーション追加
      displayNumber.className = 'display-number calling';
      displaySeat.className = 'display-seat calling';
    } else {
      displayNumber.textContent = '---';
      displaySeat.textContent = 'お待ちください';
      displayNumber.className = 'display-number';
      displaySeat.className = 'display-seat';
    }

    // 待合情報更新
    updateWaitingInfo();

    // 履歴表示
    updateHistoryDisplay();
  }

  function updateHistoryDisplay() {
    historyList.innerHTML = '';
    
    // 現在の呼び出しを履歴の最上位に表示
    let displayHistory = [...calledHistory];
    if (currentCall && currentCall.number) {
      // 現在の呼び出しが履歴に既に存在するかチェック
      const existsInHistory = calledHistory.some(item => 
        item.number === currentCall.number && 
        item.seat && item.seat.id === currentCall.seat.id
      );
      
      if (!existsInHistory) {
        // 履歴の先頭に現在の呼び出しを追加
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
    
    const historyToShow = displayHistory.slice(0, 8);
    
    if (historyToShow.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = '呼び出し履歴はありません';
      emptyMsg.className = 'no-history-message';
      historyList.appendChild(emptyMsg);
    } else {
      historyToShow.forEach((item, index) => {
        const div = document.createElement('div');
        const priorityClass = getPriorityClass(item.priority);
        const isRecent = index < 3; // 最新3件をハイライト
        const isCurrent = item.isCurrent;
        
        div.className = `history-item ${priorityClass} ${isRecent ? 'recent' : ''} ${isCurrent ? 'current' : ''}`;
        
        if (isCurrent) {
          div.style.border = '2px solid #667eea';
          div.style.boxShadow = '0 0 20px rgba(102, 126, 234, 0.3)';
          div.style.animation = 'pulse-glow 2s ease-in-out infinite';
        }
        
        div.innerHTML = `
          <div class="history-number">${item.number}</div>
          <div class="history-seat">${item.seat ? item.seat.name : ''}</div>
          <div class="history-time">${item.time || ''}</div>
          ${isCurrent ? '<div style="font-size: 0.8rem; color: #667eea; margin-top: 0.2rem;">📢 呼び出し中</div>' : ''}
        `;
        
        // 優先度に応じた装飾
        if (item.priority === 'urgent') {
          div.style.background = 'linear-gradient(135deg, #fee, #fdd)';
        } else if (item.priority === 'appointment') {
          div.style.background = 'linear-gradient(135deg, #fff3cd, #ffeaa7)';
        }
        
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
    statusIndicator.style.borderLeft = '4px solid #28a745';
  });

  socket.on('disconnect', () => {
    console.log('サーバーとの接続が切断されました');
    statusIndicator.innerHTML = '🔴 接続エラー';
    statusIndicator.className = 'status-indicator closed';
    statusIndicator.style.borderLeft = '4px solid #dc3545';
  });

  // エラーハンドリング
  socket.on('connect_error', (error) => {
    console.error('接続エラー:', error);
    statusIndicator.innerHTML = '🔴 接続エラー';
    statusIndicator.className = 'status-indicator closed';
  });

  // キーボードショートカット（開発・デバッグ用）
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'r':
          e.preventDefault();
          location.reload();
          break;
        case 'm':
          e.preventDefault();
          // 音声のミュート/アンミュート
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
      // 画面が非表示になった時は音声を停止
      window.speechSynthesis.cancel();
      isSpeaking = false;
    } else {
      // 画面が表示された時は時計を更新
      updateClock();
    }
  });

  // フルスクリーンモード切り替え（大画面表示用）
  document.addEventListener('dblclick', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });

  // タッチジェスチャー対応（タブレット表示用）
  let touchStartY = 0;
  document.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  });

  document.addEventListener('touchend', (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY - touchEndY;
    
    // 上にスワイプでリフレッシュ
    if (diff > 50) {
      location.reload();
    }
  });

  console.log('F-Call 待合室表示システム初期化完了');
});