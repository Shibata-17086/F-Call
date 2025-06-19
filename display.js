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
        // より自然で実際的な呼び出し音声に変更
        const seatNumber = currentCall.seat.name.replace(/[^0-9]/g, ''); // 座席番号のみ抽出
        let callMessage;
        
        if (seatNumber) {
          callMessage = `受付番号${currentCall.number}番の患者様、${seatNumber}番診察台へお越しください`;
        } else {
          callMessage = `受付番号${currentCall.number}番の患者様、${currentCall.seat.name}へお越しください`;
        }
        
        speakCallQueued(callMessage);
        
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

  // 基本的なキーボードショートカット（リロードのみ）
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'r':
          e.preventDefault();
          location.reload();
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

  // 音声コントロールパネルを作成
  const createAudioControlPanel = () => {
    const controlPanel = document.createElement('div');
    controlPanel.id = 'audioControlPanel';
    controlPanel.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 1rem;
      border-radius: 12px;
      font-size: 0.9rem;
      z-index: 1000;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      min-width: 200px;
      transition: all 0.3s ease;
    `;
    
    const createButton = (text, bgColor, onclick) => {
      const button = document.createElement('button');
      button.textContent = text;
      button.style.cssText = `
        display: block;
        width: 100%;
        margin: 0.3rem 0;
        padding: 0.8rem;
        background: ${bgColor};
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 0.9rem;
        cursor: pointer;
        transition: background 0.2s ease;
      `;
      button.onmouseover = () => button.style.opacity = '0.8';
      button.onmouseout = () => button.style.opacity = '1';
      button.onclick = onclick;
      return button;
    };
    
    // タイトル
    const title = document.createElement('div');
    title.textContent = '🔊 音声コントロール';
    title.style.cssText = 'font-weight: bold; margin-bottom: 0.5rem; text-align: center;';
    controlPanel.appendChild(title);
    
    // 音声状態表示
    const statusDiv = document.createElement('div');
    statusDiv.id = 'audioStatus';
    statusDiv.style.cssText = 'font-size: 0.8rem; margin-bottom: 0.8rem; text-align: center; color: #ccc;';
    controlPanel.appendChild(statusDiv);
    
    // 音声テストボタン
    const testButton = createButton('🔊 音声テスト', '#4caf50', () => {
      if (!audioInitialized) {
        initializeAudio();
      }
      speakCallQueued('音声テストを開始いたします。受付番号1番の患者様、1番診察台へお越しください');
      playCallSound();
      updateAudioStatus();
    });
    controlPanel.appendChild(testButton);
    
    // 音声初期化ボタン
    const initButton = createButton('🔄 音声初期化', '#ff9800', () => {
      audioInitialized = false;
      audioContext = null;
      speechSynthesis.cancel();
      isSpeaking = false;
      speechQueue = [];
      initializeAudio();
      updateAudioStatus();
      showTemporaryMessage('🔄 音声システムを再初期化しました', 2000);
    });
    controlPanel.appendChild(initButton);
    
    // ミュートボタン
    const muteButton = createButton('🔇 音声停止', '#f44336', () => {
      speechSynthesis.cancel();
      isSpeaking = false;
      speechQueue = [];
      updateAudioStatus();
      showTemporaryMessage('🔇 音声を停止しました', 2000);
    });
    controlPanel.appendChild(muteButton);
    
    // 詳細診断ボタン
    const diagButton = createButton('🔧 詳細診断', '#2196f3', () => {
      createAdvancedAudioDiagnostics();
    });
    controlPanel.appendChild(diagButton);
    
    // 最小化ボタン
    const minimizeButton = createButton('📦 最小化', '#666', () => {
      if (controlPanel.classList.contains('minimized')) {
        controlPanel.classList.remove('minimized');
        controlPanel.style.transform = 'scale(1)';
        minimizeButton.textContent = '📦 最小化';
      } else {
        controlPanel.classList.add('minimized');
        controlPanel.style.transform = 'scale(0.7)';
        minimizeButton.textContent = '📦 展開';
      }
    });
    controlPanel.appendChild(minimizeButton);
    
    // 音声状態を更新する関数
    const updateAudioStatus = () => {
      const voices = speechSynthesis ? speechSynthesis.getVoices() : [];
      const hasJapanese = voices.some(v => v.lang.includes('ja'));
      const statusText = `
        初期化: ${audioInitialized ? '✅' : '❌'} | 
        音声: ${voices.length}個 | 
        日本語: ${hasJapanese ? '✅' : '❌'}
      `;
      statusDiv.textContent = statusText;
    };
    
    document.body.appendChild(controlPanel);
    
    // 定期的に状態を更新
    setInterval(updateAudioStatus, 3000);
    updateAudioStatus();
    
    // 10秒後に半透明にする
    setTimeout(() => {
      controlPanel.style.opacity = '0.7';
    }, 10000);
    
    return { updateAudioStatus };
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

  // 高度な音声診断機能
  const createAdvancedAudioDiagnostics = () => {
    const diagnosticsDiv = document.createElement('div');
    diagnosticsDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.95);
      color: white;
      padding: 2rem;
      border-radius: 12px;
      font-size: 1rem;
      z-index: 10000;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      font-family: monospace;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    `;
    
    const runDiagnostics = () => {
      const results = [];
      
      // 基本チェック
      results.push(`🌐 ブラウザ: ${navigator.userAgent.includes('Chrome') ? 'Chrome/Chromium' : 'その他'}`);
      results.push(`🔊 SpeechSynthesis: ${window.speechSynthesis ? '✅ 対応' : '❌ 非対応'}`);
      results.push(`🔉 AudioContext: ${window.AudioContext || window.webkitAudioContext ? '✅ 対応' : '❌ 非対応'}`);
      
      // 音声エンジンチェック
      const voices = speechSynthesis.getVoices();
      results.push(`🎵 音声エンジン数: ${voices.length}`);
      
      if (voices.length > 0) {
        const japaneseVoices = voices.filter(v => v.lang.includes('ja'));
        const englishVoices = voices.filter(v => v.lang.includes('en'));
        
        results.push(`🇯🇵 日本語音声: ${japaneseVoices.length}個`);
        results.push(`🇺🇸 英語音声: ${englishVoices.length}個`);
        
        if (japaneseVoices.length > 0) {
          results.push(`✅ 推奨音声: ${japaneseVoices[0].name}`);
        } else if (englishVoices.length > 0) {
          results.push(`⚠️ 代替音声: ${englishVoices[0].name} (英語)`);
        }
        
        // 全音声をリスト表示
        results.push(`\n📋 利用可能な音声一覧:`);
        voices.slice(0, 10).forEach((voice, index) => {
          const isDefault = voice.default ? ' (デフォルト)' : '';
          const isLocal = voice.localService ? ' (ローカル)' : ' (リモート)';
          results.push(`${index + 1}. ${voice.name} (${voice.lang})${isDefault}${isLocal}`);
        });
        if (voices.length > 10) {
          results.push(`... 他${voices.length - 10}個`);
        }
      } else {
        results.push(`❌ 音声エンジンが読み込まれていません`);
        results.push(`💡 ヒント: ページを再読み込みしてみてください`);
      }
      
      // システム情報
      results.push(`\n🖥️ システム情報:`);
      results.push(`OS: ${navigator.platform}`);
      results.push(`言語: ${navigator.language}`);
      results.push(`オンライン: ${navigator.onLine ? '✅' : '❌'}`);
      
      // 音声初期化状態
      results.push(`\n🔧 音声システム状態:`);
      results.push(`初期化済み: ${audioInitialized ? '✅' : '❌'}`);
      results.push(`AudioContext: ${audioContext ? audioContext.state : '未作成'}`);
      results.push(`再生中: ${isSpeaking ? '✅' : '❌'}`);
      results.push(`キュー: ${speechQueue.length}件`);
      
      return results.join('\n');
    };
    
    const performAudioTest = () => {
      const testSequence = [
        '音声システムのテストを開始いたします',
        '受付番号1番の患者様、1番診察台へお越しください',
        '受付番号2番の患者様、2番診察台へお越しください'
      ];
      
      let testIndex = 0;
      const runNextTest = () => {
        if (testIndex < testSequence.length) {
          const text = testSequence[testIndex];
          console.log(`🔊 音声テスト実行: ${text}`);
          speakCallQueued(text);
          testIndex++;
          setTimeout(runNextTest, 3000);
        }
      };
      
      if (!audioInitialized) {
        initializeAudio();
        setTimeout(runNextTest, 1000);
      } else {
        runNextTest();
      }
    };
    
    diagnosticsDiv.innerHTML = `
      <div style="text-align: center; margin-bottom: 1rem;">
        <h2>🔧 F-Call 音声診断システム</h2>
      </div>
      <pre style="white-space: pre-wrap; line-height: 1.4;">${runDiagnostics()}</pre>
      <div style="text-align: center; margin-top: 1.5rem;">
        <button id="testAudioBtn" style="margin: 0.5rem; padding: 0.8rem 1.5rem; font-size: 1rem; background: #4caf50; color: white; border: none; border-radius: 5px; cursor: pointer;">
          🔊 音声テスト実行
        </button>
        <button id="forceInitBtn" style="margin: 0.5rem; padding: 0.8rem 1.5rem; font-size: 1rem; background: #ff9800; color: white; border: none; border-radius: 5px; cursor: pointer;">
          🔄 強制初期化
        </button>
        <button id="refreshVoicesBtn" style="margin: 0.5rem; padding: 0.8rem 1.5rem; font-size: 1rem; background: #2196f3; color: white; border: none; border-radius: 5px; cursor: pointer;">
          🎵 音声再読み込み
        </button>
        <button id="closeDiagBtn" style="margin: 0.5rem; padding: 0.8rem 1.5rem; font-size: 1rem; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer;">
          ❌ 閉じる
        </button>
      </div>
      <div style="margin-top: 1rem; padding: 1rem; background: rgba(255,255,255,0.1); border-radius: 5px; font-size: 0.9rem;">
        <strong>📝 ラズベリーパイでの音声トラブルシューティング:</strong><br>
        1. <code>sudo raspi-config</code> → Advanced Options → Audio → Force 3.5mm jack/HDMI<br>
        2. <code>amixer set PCM 100%</code> で音量確認<br>
        3. <code>speaker-test -t wav -c 2</code> でハードウェア確認<br>
        4. Chromiumを <code>--autoplay-policy=no-user-gesture-required</code> で起動
      </div>
    `;
    
    // イベントリスナー
    document.body.appendChild(diagnosticsDiv);
    
    document.getElementById('testAudioBtn').onclick = performAudioTest;
    
    document.getElementById('forceInitBtn').onclick = () => {
      audioInitialized = false;
      audioContext = null;
      speechSynthesis.cancel();
      isSpeaking = false;
      speechQueue = [];
      initializeAudio();
      setTimeout(() => {
        diagnosticsDiv.querySelector('pre').textContent = runDiagnostics();
      }, 1000);
    };
    
    document.getElementById('refreshVoicesBtn').onclick = () => {
      speechSynthesis.getVoices(); // 音声リストを強制更新
      setTimeout(() => {
        diagnosticsDiv.querySelector('pre').textContent = runDiagnostics();
      }, 500);
    };
    
    document.getElementById('closeDiagBtn').onclick = () => {
      diagnosticsDiv.remove();
    };
  };

  // ページ読み込み完了後にコントロールパネルを表示
  setTimeout(() => {
    const audioControl = createAudioControlPanel();
    showDebugInfo();
  }, 2000);

  console.log('F-Call 待合室表示システム初期化完了');
  console.log('音声トラブルシューティング:');
  console.log('- 画面をクリックまたはタッチして音声を有効化してください');
  console.log('- 右下の音声コントロールパネルで操作してください');
  console.log('- 詳細診断ボタンで音声システムの状態を確認できます');
});