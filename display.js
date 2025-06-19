// 接続先のURLを動的に決定
const getServerUrl = () => {
  const currentHost = window.location.hostname;
  const port = 3443;
  return `https://${currentHost}:${port}`;
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
  let audioInitialized = false;
  let audioContext = null;

  // 音声初期化（ユーザー操作後に実行）
  function initializeAudio() {
    if (audioInitialized) return;
    
    try {
      // AudioContextの初期化
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // SpeechSynthesis の初期化（Raspberry Pi対応）
      if ('speechSynthesis' in window) {
        // 利用可能な音声を取得
        const voices = speechSynthesis.getVoices();
        console.log('利用可能な音声:', voices);
        
        // 音声がまだ読み込まれていない場合は待機
        if (voices.length === 0) {
          speechSynthesis.addEventListener('voiceschanged', () => {
            const newVoices = speechSynthesis.getVoices();
            console.log('音声読み込み完了:', newVoices);
          });
        }
        
        // テスト音声を無音で再生（音声合成の初期化）
        const testUtterance = new SpeechSynthesisUtterance('');
        testUtterance.volume = 0;
        speechSynthesis.speak(testUtterance);
      }
      
      audioInitialized = true;
      console.log('音声システムが初期化されました');
      
      // 初期化成功を視覚的に通知
      showTemporaryMessage('🔊 音声システム準備完了', 2000);
      
    } catch (error) {
      console.error('音声初期化エラー:', error);
      showTemporaryMessage('⚠️ 音声初期化に失敗しました', 3000);
    }
  }

  // 一時的なメッセージ表示
  function showTemporaryMessage(message, duration = 3000) {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(44, 128, 185, 0.9);
      color: white;
      padding: 1rem 2rem;
      border-radius: 8px;
      font-size: 1.2rem;
      z-index: 9999;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    `;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.parentNode.removeChild(messageDiv);
      }
    }, duration);
  }

  // シンプルな効果音作成（改良版）
  function playCallSound() {
    try {
      if (!audioContext) {
        initializeAudio();
        return;
      }
      
      // AudioContextがsuspendedの場合は再開
      if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
          playCallSoundInternal();
        });
      } else {
        playCallSoundInternal();
      }
    } catch (error) {
      console.log('効果音再生エラー:', error);
    }
  }

  function playCallSoundInternal() {
    try {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // より聞き取りやすい周波数とパターン
      oscillator.frequency.value = 880; // A5音
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
      
      // 2回目の音（エコー効果）
      setTimeout(() => {
        try {
          const oscillator2 = audioContext.createOscillator();
          const gainNode2 = audioContext.createGain();
          
          oscillator2.connect(gainNode2);
          gainNode2.connect(audioContext.destination);
          
          oscillator2.frequency.value = 660; // E5音
          oscillator2.type = 'sine';
          
          gainNode2.gain.setValueAtTime(0, audioContext.currentTime);
          gainNode2.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.1);
          gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
          
          oscillator2.start(audioContext.currentTime);
          oscillator2.stop(audioContext.currentTime + 0.4);
        } catch (e) {
          console.log('2回目の効果音エラー:', e);
        }
      }, 200);
      
    } catch (error) {
      console.log('効果音生成エラー:', error);
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

  // 音声再生キュー方式（改良版）
  function speakCallQueued(text) {
    console.log('音声キューに追加:', text);
    speechQueue.push(text);
    playNextSpeech();
  }

  function playNextSpeech() {
    if (isSpeaking || speechQueue.length === 0) return;
    
    // 音声が初期化されていない場合は初期化を試行
    if (!audioInitialized) {
      console.log('音声システムが初期化されていません。初期化を試行します。');
      initializeAudio();
    }
    
    if (!('speechSynthesis' in window)) {
      console.error('このブラウザは音声合成をサポートしていません');
      speechQueue = []; // キューをクリア
      return;
    }
    
    isSpeaking = true;
    const text = speechQueue.shift();
    
    try {
      // 音声合成をキャンセル（重複防止）
      speechSynthesis.cancel();
      
      const msg = new SpeechSynthesisUtterance(text);
      msg.lang = 'ja-JP';
      msg.rate = 0.8; // ラズパイでは少し遅めに
      msg.pitch = 1.0;
      msg.volume = 1.0;
      
      // 利用可能な日本語音声を探す
      const voices = speechSynthesis.getVoices();
      const japaneseVoice = voices.find(voice => 
        voice.lang === 'ja-JP' || voice.lang === 'ja' || voice.name.includes('Japanese')
      );
      
      if (japaneseVoice) {
        msg.voice = japaneseVoice;
        console.log('日本語音声を使用:', japaneseVoice.name);
      } else {
        console.log('日本語音声が見つかりません。デフォルト音声を使用します。');
        // 利用可能な音声をすべて表示
        console.log('利用可能な音声:', voices.map(v => `${v.name} (${v.lang})`));
      }
      
      msg.onstart = () => {
        console.log('音声再生開始:', text);
      };
      
      msg.onend = () => {
        console.log('音声再生終了');
        isSpeaking = false;
        setTimeout(() => {
          playNextSpeech();
        }, 1000);
      };
      
      msg.onerror = (event) => {
        console.error('音声再生エラー:', event);
        isSpeaking = false;
        setTimeout(() => {
          playNextSpeech();
        }, 1000);
      };
      
      // 音声再生
      speechSynthesis.speak(msg);
      
      // タイムアウト処理（ラズパイで音声が止まることがあるため）
      setTimeout(() => {
        if (isSpeaking) {
          console.log('音声再生タイムアウト。強制終了します。');
          speechSynthesis.cancel();
          isSpeaking = false;
          playNextSpeech();
        }
      }, 10000); // 10秒でタイムアウト
      
    } catch (error) {
      console.error('音声合成エラー:', error);
      isSpeaking = false;
      setTimeout(() => {
        playNextSpeech();
      }, 1000);
    }
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
    // 営業時間の表示を更新
    updateBusinessHoursDisplay();
    
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
      businessHoursConfig = {
        start: data.businessHours.start || businessHoursConfig.start,
        end: data.businessHours.end || businessHoursConfig.end,
        lunchStart: data.businessHours.lunchBreak?.start || businessHoursConfig.lunchStart,
        lunchEnd: data.businessHours.lunchBreak?.end || businessHoursConfig.lunchEnd
      };
      console.log('営業時間設定受信:', businessHoursConfig);
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
      businessHoursConfig = {
        start: data.businessHours.start || businessHoursConfig.start,
        end: data.businessHours.end || businessHoursConfig.end,
        lunchStart: data.businessHours.lunchBreak?.start || businessHoursConfig.lunchStart,
        lunchEnd: data.businessHours.lunchBreak?.end || businessHoursConfig.lunchEnd
      };
      console.log('営業時間設定更新:', businessHoursConfig);
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
          console.log('音声をミュートしました');
          showTemporaryMessage('🔇 音声をミュートしました', 2000);
          break;
        case 't': // 音声テスト用
          e.preventDefault();
          if (!audioInitialized) {
            initializeAudio();
          }
          speakCallQueued('音声テストです。受付番号1番の方、1番台へお越しください');
          playCallSound();
          showTemporaryMessage('🔊 音声テストを実行中', 3000);
          break;
        case 'i': // 音声初期化
          e.preventDefault();
          initializeAudio();
          break;
      }
    }
  });

  // 画面クリック時に音声初期化（ユーザー操作が必要なため）
  document.addEventListener('click', () => {
    if (!audioInitialized) {
      initializeAudio();
    }
  }, { once: true });

  // 画面タッチ時にも音声初期化（タッチデバイス対応）
  document.addEventListener('touchstart', () => {
    if (!audioInitialized) {
      initializeAudio();
    }
  }, { once: true });

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

  // 初期化完了時の音声テスト用ボタンを追加
  const createAudioTestButton = () => {
    const testButton = document.createElement('button');
    testButton.textContent = '🔊 音声テスト';
    testButton.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 1rem 2rem;
      background: #4caf50;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1.1rem;
      cursor: pointer;
      z-index: 1000;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      transition: opacity 0.3s ease;
    `;
    
    testButton.onclick = () => {
      // 音声初期化
      if (!audioInitialized) {
        initializeAudio();
      }
      
      // テスト音声再生
      speakCallQueued('音声テストです。受付番号1番の方、1番台へお越しください');
      playCallSound();
      
      // ボタンを5秒後に半透明にする
      setTimeout(() => {
        if (testButton.parentNode) {
          testButton.style.opacity = '0.5';
        }
      }, 5000);
    };
    
    document.body.appendChild(testButton);
    
    // 10秒後にボタンを自動で薄くする
    setTimeout(() => {
      testButton.style.opacity = '0.3';
    }, 10000);
    
    // 30秒後にボタンを非表示にする
    setTimeout(() => {
      if (testButton.parentNode) {
        testButton.style.display = 'none';
      }
    }, 30000);
  };

  // デバッグ情報を表示する関数
  const showDebugInfo = () => {
    const debugDiv = document.createElement('div');
    debugDiv.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 1rem;
      border-radius: 8px;
      font-size: 0.9rem;
      z-index: 999;
      max-width: 300px;
      font-family: monospace;
    `;
    
    const updateDebugInfo = () => {
      const voices = speechSynthesis ? speechSynthesis.getVoices() : [];
      const hasJapanese = voices.some(v => v.lang === 'ja-JP' || v.lang === 'ja');
      
      debugDiv.innerHTML = `
        <div><strong>🔧 音声デバッグ情報</strong></div>
        <div>初期化: ${audioInitialized ? '✅' : '❌'}</div>
        <div>AudioContext: ${audioContext ? '✅' : '❌'}</div>
        <div>SpeechSynthesis: ${window.speechSynthesis ? '✅' : '❌'}</div>
        <div>音声数: ${voices.length}</div>
        <div>日本語音声: ${hasJapanese ? '✅' : '❌'}</div>
        <div>再生中: ${isSpeaking ? '✅' : '❌'}</div>
        <div>キュー: ${speechQueue.length}件</div>
        <hr style="margin: 0.5rem 0;">
        <div style="font-size: 0.8rem;">
          Ctrl+T: 音声テスト<br>
          Ctrl+M: ミュート<br>
          Ctrl+I: 再初期化
        </div>
      `;
    };
    
    updateDebugInfo();
    document.body.appendChild(debugDiv);
    
    // 5秒ごとに情報を更新
    const interval = setInterval(updateDebugInfo, 5000);
    
    // 1分後にデバッグ情報を非表示
    setTimeout(() => {
      if (debugDiv.parentNode) {
        debugDiv.parentNode.removeChild(debugDiv);
        clearInterval(interval);
      }
    }, 60000);
  };

  // ページ読み込み完了後にテストボタンとデバッグ情報を表示
  setTimeout(() => {
    createAudioTestButton();
    showDebugInfo();
  }, 2000);

  console.log('F-Call 待合室表示システム初期化完了');
  console.log('音声トラブルシューティング:');
  console.log('- 画面をクリックまたはタッチして音声を有効化してください');
  console.log('- Ctrl+T で音声テストができます');
  console.log('- Ctrl+M で音声をミュートできます');
  console.log('- Ctrl+I で音声システムを再初期化できます');
});