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
  const notification = document.getElementById('notification');
  const waitingCount = document.getElementById('waitingCount');
  const waitingCountCard = document.getElementById('waitingCountCard');
  const estimatedWait = document.getElementById('estimatedWait');
  const estimatedWaitCard = document.getElementById('estimatedWaitCard');

  let calledHistory = [];
  let currentCall = null;
  let tickets = [];
  let waitMinutesPerPerson = 5;
  let showEstimatedWaitTime = true;
  let lastCallNumber = null;
  let lastCallSeat = null;

  // 音声再生キュー
  let speechQueue = [];
  let isSpeaking = false;
  let audioInitialized = false;
  let audioContext = null;

  // 音声初期化（ユーザー操作後に実行）
  function initializeAudio() {
    if (audioInitialized) return;
    
    console.log('🔊 音声システム初期化開始...');
    
    // デバイス検出
    const isRaspberryPi = navigator.userAgent.includes('armv') || 
                         navigator.userAgent.includes('Linux') && navigator.userAgent.includes('arm') ||
                         navigator.platform.includes('Linux arm') ||
                         window.location.hostname.includes('raspberrypi') ||
                         navigator.userAgent.includes('X11; Linux armv');
    
    const isMacOS = navigator.userAgent.includes('Mac');
    
    console.log(`🖥️ デバイス検出: ${isRaspberryPi ? 'Raspberry Pi' : isMacOS ? 'macOS' : 'その他'}`);
    
    try {
      // AudioContext の初期化
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!audioContext && AudioContext) {
        audioContext = new AudioContext();
        console.log('✅ AudioContext初期化完了');
        
        // ラズベリーパイの場合はAudioContextの状態を詳しくチェック
        if (isRaspberryPi) {
          console.log(`🔍 AudioContext状態: ${audioContext.state}`);
          if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
              console.log('✅ AudioContext再開完了');
            }).catch(e => {
              console.error('❌ AudioContext再開失敗:', e);
            });
          }
        }
      }
      
      // SpeechSynthesis の確認
      if (!('speechSynthesis' in window)) {
        console.error('❌ このブラウザは音声合成をサポートしていません');
        return;
      }
      
      // ラズベリーパイ用の特別な音声エンジン読み込み処理
      const loadVoicesWithRetry = (retryCount = 0) => {
        const voices = speechSynthesis.getVoices();
        console.log(`🎵 音声エンジン読み込み試行 ${retryCount + 1}: ${voices.length}個の音声`);
        
        if (voices.length > 0) {
          console.log('✅ 音声エンジン読み込み完了');
          
          // 音声の詳細情報をログ出力（ラズベリーパイでは特に重要）
          voices.forEach((voice, index) => {
            console.log(`音声 ${index + 1}: ${voice.name} (${voice.lang}) ${voice.default ? '[デフォルト]' : ''} ${voice.localService ? '[ローカル]' : '[リモート]'}`);
          });
          
          const japaneseVoices = voices.filter(v => v.lang.includes('ja'));
          const englishVoices = voices.filter(v => v.lang.includes('en'));
          
          console.log(`🇯🇵 日本語音声: ${japaneseVoices.length}個`);
          console.log(`🇺🇸 英語音声: ${englishVoices.length}個`);
          
          if (japaneseVoices.length > 0) {
            console.log(`✅ 推奨音声: ${japaneseVoices[0].name}`);
          } else if (englishVoices.length > 0) {
            console.log(`⚠️ 日本語音声なし。英語音声を使用: ${englishVoices[0].name}`);
          }
          
          audioInitialized = true;
          console.log('🎉 音声システム初期化完了！');
          
          // ラズベリーパイの場合は初期化後により長い待機時間
          const waitTime = isRaspberryPi ? 2000 : 500;
          setTimeout(() => {
            console.log('🔊 初期化テスト音声を再生...');
            
            // ラズベリーパイ用の簡単なテスト音声
            if (isRaspberryPi) {
              speakCallQueued('音声システム準備完了');
            } else {
              speakCallQueued('音声システムの初期化が完了しました');
            }
          }, waitTime);
          
        } else if (retryCount < (isRaspberryPi ? 20 : 15)) { // ラズベリーパイはより多く試行
          // 音声エンジンの読み込みを強制的に試行（ラズベリーパイ対応強化）
          console.log('🔄 音声エンジン読み込み中... 再試行します');
          
          // 方法1: 空の音声を再生して音声エンジンを活性化
          try {
            const dummyUtterance = new SpeechSynthesisUtterance('');
            dummyUtterance.volume = 0;
            speechSynthesis.speak(dummyUtterance);
            speechSynthesis.cancel();
          } catch (e) {
            console.log('方法1失敗:', e.message);
          }
          
          // 方法2: 非常に短い音声で強制読み込み
          if (retryCount > 5) {
            try {
              const forceUtterance = new SpeechSynthesisUtterance('a');
              forceUtterance.volume = 0.01;
              forceUtterance.rate = 10;
              speechSynthesis.speak(forceUtterance);
              setTimeout(() => speechSynthesis.cancel(), 100);
            } catch (e) {
              console.log('方法2失敗:', e.message);
            }
          }
          
          // 方法3: ラズベリーパイ特有の音声エンジン強制読み込み
          if (isRaspberryPi && retryCount > 8) {
            try {
              // espeak特有の処理
              const espeakUtterance = new SpeechSynthesisUtterance('test');
              espeakUtterance.volume = 0;
              espeakUtterance.rate = 0.1;
              espeakUtterance.pitch = 1;
              speechSynthesis.speak(espeakUtterance);
              setTimeout(() => speechSynthesis.cancel(), 200);
              console.log('🔧 ラズベリーパイ特有の音声エンジン活性化実行');
            } catch (e) {
              console.log('ラズベリーパイ特有処理失敗:', e.message);
            }
          }
          
          // 方法4: ページリロードを促す（最後の手段）
          if (retryCount > 15) {
            console.warn('⚠️ 音声エンジンの読み込みに時間がかかっています');
            showTemporaryMessage('音声エンジン読み込み中... しばらくお待ちください', 3000);
          }
          
          const retryDelay = isRaspberryPi ? (retryCount > 10 ? 3000 : 1500) : (retryCount > 10 ? 2000 : 1000);
          setTimeout(() => loadVoicesWithRetry(retryCount + 1), retryDelay);
        } else {
          console.error('❌ 音声エンジンの読み込みに失敗しました');
          console.warn('💡 解決策: ページを再読み込みするか、ブラウザを再起動してください');
          
          // フォールバック: 音声なしでも動作するように設定
          audioInitialized = true;
          
          // デバイス固有の解決策を提示
          let deviceSpecificSolutions = '';
          if (isRaspberryPi) {
            deviceSpecificSolutions = `
              <br><strong>🥧 Raspberry Pi特有の解決策:</strong><br>
              1. <code>sudo raspi-config</code> → Advanced Options → Audio<br>
              2. <code>amixer set PCM 100%</code> で音量確認<br>
              3. <code>aplay /usr/share/sounds/alsa/Front_Left.wav</code> でハードウェア確認<br>
              4. Chromiumを <code>--no-sandbox --autoplay-policy=no-user-gesture-required</code> で起動<br>
              5. <code>sudo apt-get install espeak espeak-data</code> で音声エンジン再インストール
            `;
          } else if (isMacOS) {
            deviceSpecificSolutions = `
              <br><strong>🍎 macOS特有の解決策:</strong><br>
              1. システム環境設定 → アクセシビリティ → スピーチ<br>
              2. ターミナルで <code>say "テスト"</code> を実行
            `;
          }
          
          // ユーザーに手動での解決策を提示
          showPersistentMessage(`
            ❌ 音声エンジンが読み込まれませんでした<br>
            🔧 基本的な解決策:<br>
            1. ページを再読み込み (Ctrl+R/Cmd+R)<br>
            2. ブラウザを再起動<br>
            3. 他のブラウザを試す (Chrome推奨)
            ${deviceSpecificSolutions}
          `);
        }
      };
      
      // 音声エンジンの読み込み開始
      loadVoicesWithRetry();
      
      // voiceschanged イベントリスナー（音声エンジンの非同期読み込み対応）
      if ('onvoiceschanged' in speechSynthesis) {
        speechSynthesis.onvoiceschanged = () => {
          console.log('🔄 音声エンジンが更新されました');
          const voices = speechSynthesis.getVoices();
          console.log(`🎵 更新された音声数: ${voices.length}`);
          if (!audioInitialized && voices.length > 0) {
            loadVoicesWithRetry();
          }
        };
      }
      
      // デバイス固有の音声エンジン活性化
      if (isMacOS) {
        console.log('🍎 macOS検出: 音声エンジン活性化を試行');
        setTimeout(() => {
          // macOS特有の音声エンジン活性化
          try {
            speechSynthesis.getVoices();
            if (window.speechSynthesis.onvoiceschanged !== undefined) {
              speechSynthesis.onvoiceschanged = speechSynthesis.onvoiceschanged;
            }
          } catch (e) {
            console.log('macOS音声活性化エラー:', e.message);
          }
        }, 2000);
      }
      
      if (isRaspberryPi) {
        console.log('🥧 Raspberry Pi検出: 音声エンジン特別活性化を試行');
        
        // ラズベリーパイ特有の処理
        setTimeout(() => {
          try {
            // espeak/espeakの強制活性化
            speechSynthesis.getVoices();
            
            // 音声エンジンのキャッシュクリア
            if (typeof speechSynthesis.cancel === 'function') {
              speechSynthesis.cancel();
            }
            
            // 複数回の音声エンジン取得試行
            for (let i = 0; i < 5; i++) {
              setTimeout(() => {
                const voices = speechSynthesis.getVoices();
                console.log(`🥧 ラズベリーパイ音声取得試行 ${i + 1}: ${voices.length}個`);
              }, i * 500);
            }
            
          } catch (e) {
            console.log('ラズベリーパイ音声活性化エラー:', e.message);
          }
        }, 3000);
      }
      
    } catch (error) {
      console.error('❌ 音声初期化エラー:', error);
      audioInitialized = true; // エラーでも初期化済みにして無限ループを防ぐ
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

  // 持続的なメッセージ表示関数
  function showPersistentMessage(html) {
    const messageDiv = document.createElement('div');
    messageDiv.innerHTML = html;
    messageDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 0, 0, 0.9);
      color: white;
      padding: 2rem;
      border-radius: 12px;
      font-size: 1.1rem;
      z-index: 10001;
      max-width: 500px;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      line-height: 1.6;
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '❌ 閉じる';
    closeBtn.style.cssText = `
      margin-top: 1rem;
      padding: 0.8rem 1.5rem;
      background: rgba(255,255,255,0.2);
      color: white;
      border: 1px solid white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 1rem;
    `;
    closeBtn.onclick = () => {
      if (messageDiv.parentNode) {
        messageDiv.parentNode.removeChild(messageDiv);
      }
    };
    
    messageDiv.appendChild(closeBtn);
    document.body.appendChild(messageDiv);
    
    // 30秒後に自動削除
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.parentNode.removeChild(messageDiv);
      }
    }, 30000);
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
    console.log('🎤 音声キューに追加:', text);
    speechQueue.push(text);
    playNextSpeech();
  }

  // ラズベリーパイ用の代替音声機能
  function playAlternativeAudio(number, seatNumber) {
    console.log('🥧 ラズベリーパイ用代替音声システム開始');
    
    if (!audioContext) {
      console.error('❌ AudioContextが初期化されていません');
      return;
    }
    
    try {
      // チャイム音を再生
      playCallSound();
      
      // 少し待ってから番号を音で表現
      setTimeout(() => {
        playNumberAsBeeps(number);
      }, 2000);
      
      // さらに待ってから座席番号を音で表現
      if (seatNumber) {
        setTimeout(() => {
          playHighBeep(); // 区切り音
          setTimeout(() => {
            playNumberAsBeeps(seatNumber);
          }, 500);
        }, 4000);
      }
      
    } catch (error) {
      console.error('❌ 代替音声再生エラー:', error);
    }
  }

  // 数字をビープ音で表現する関数
  function playNumberAsBeeps(number) {
    console.log(`🔢 数字をビープ音で表現: ${number}`);
    
    const digits = number.toString().split('');
    let delay = 0;
    
    digits.forEach((digit, index) => {
      setTimeout(() => {
        playDigitAsBeep(parseInt(digit));
        // 桁の区切りに短い休止
        if (index < digits.length - 1) {
          setTimeout(() => playShortBeep(), 800);
        }
      }, delay);
      delay += 1200;
    });
  }

  // 一桁の数字をビープ音で表現
  function playDigitAsBeep(digit) {
    console.log(`🎵 数字 ${digit} をビープ音で再生`);
    
    if (digit === 0) {
      // 0は長い低い音
      playTone(220, 800);
    } else {
      // 1-9は対応する回数のビープ音
      let beepDelay = 0;
      for (let i = 0; i < digit; i++) {
        setTimeout(() => {
          playTone(440 + (i * 20), 150); // 音程を少しずつ上げる
        }, beepDelay);
        beepDelay += 200;
      }
    }
  }

  // 高い区切り音
  function playHighBeep() {
    playTone(880, 300);
  }

  // 短いビープ音
  function playShortBeep() {
    playTone(660, 100);
  }

  // 指定周波数・時間のトーン再生
  function playTone(frequency, duration) {
    if (!audioContext || audioContext.state === 'suspended') {
      console.log('⚠️ AudioContextが使用できません');
      return;
    }
    
    try {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration / 1000);
      
    } catch (error) {
      console.error('❌ トーン再生エラー:', error);
    }
  }

  function playNextSpeech() {
    if (isSpeaking || speechQueue.length === 0) return;
    
    // デバイス検出
    const isRaspberryPi = navigator.userAgent.includes('armv') || 
                         navigator.userAgent.includes('Linux') && navigator.userAgent.includes('arm') ||
                         navigator.platform.includes('Linux arm') ||
                         window.location.hostname.includes('raspberrypi') ||
                         navigator.userAgent.includes('X11; Linux armv');
    
    // 音声が初期化されていない場合は初期化を試行
    if (!audioInitialized) {
      console.log('音声システムが初期化されていません。初期化を試行します。');
      initializeAudio();
      // 初期化後に再試行（ラズベリーパイはより長い待機時間）
      const waitTime = isRaspberryPi ? 5000 : 2000;
      setTimeout(() => playNextSpeech(), waitTime);
      return;
    }
    
    if (!('speechSynthesis' in window)) {
      console.error('このブラウザは音声合成をサポートしていません');
      // ラズベリーパイの場合は代替音声システムを使用
      if (isRaspberryPi && speechQueue.length > 0) {
        const text = speechQueue.shift();
        console.log('🥧 音声合成非対応のため代替音声システムを使用');
        const numberMatch = text.match(/(\d+)/g);
        if (numberMatch && numberMatch.length >= 1) {
          const number = parseInt(numberMatch[0]);
          const seatNumber = numberMatch.length > 1 ? parseInt(numberMatch[1]) : null;
          playAlternativeAudio(number, seatNumber);
        }
      }
      speechQueue = []; // キューをクリア
      return;
    }
    
    // 音声エンジンが読み込まれているかチェック
    const voices = speechSynthesis.getVoices();
    if (voices.length === 0) {
      console.log('⚠️ 音声エンジンがまだ読み込まれていません。');
      
      // ラズベリーパイで音声エンジンが5秒以上読み込まれない場合は代替システムを使用
      if (isRaspberryPi) {
        const currentTime = Date.now();
        if (!window.speechSystemStartTime) {
          window.speechSystemStartTime = currentTime;
        }
        
        if (currentTime - window.speechSystemStartTime > 5000) {
          console.log('🥧 音声エンジン読み込み時間切れ。代替音声システムを使用。');
          const text = speechQueue.shift();
          const numberMatch = text.match(/(\d+)/g);
          if (numberMatch && numberMatch.length >= 1) {
            const number = parseInt(numberMatch[0]);
            const seatNumber = numberMatch.length > 1 ? parseInt(numberMatch[1]) : null;
            playAlternativeAudio(number, seatNumber);
          }
          return;
        }
      }
      
      const retryDelay = isRaspberryPi ? 2000 : 1000;
      setTimeout(() => playNextSpeech(), retryDelay);
      return;
    }
    
    isSpeaking = true;
    const text = speechQueue.shift();
    
    try {
      // 音声合成をキャンセル（重複防止）
      speechSynthesis.cancel();
      
      // ラズベリーパイでは長めの待機時間
      const cancelWaitTime = isRaspberryPi ? 500 : 200;
      
      // 少し待ってから音声作成（cancel後の安定化）
      setTimeout(() => {
        const msg = new SpeechSynthesisUtterance(text);
        
        // ラズベリーパイ向けの音声設定最適化
        if (isRaspberryPi) {
          msg.lang = 'en-US'; // ラズベリーパイでは英語の方が安定
          msg.rate = 0.6; // ラズベリーパイではより遅く
          msg.pitch = 1.0;
          msg.volume = 1.0;
          console.log('🥧 ラズベリーパイ向け音声設定を適用');
        } else {
          msg.lang = 'ja-JP';
          msg.rate = 0.7;
          msg.pitch = 1.0;
          msg.volume = 1.0;
        }
        
        // 利用可能な音声を探す
        const voices = speechSynthesis.getVoices();
        console.log(`🎵 現在の音声数: ${voices.length}`);
        
        let selectedVoice = null;
        
        if (isRaspberryPi) {
          // ラズベリーパイでは英語音声を優先
          const englishVoice = voices.find(voice => 
            voice.lang.includes('en') || voice.name.toLowerCase().includes('english')
          );
          const espeakVoice = voices.find(voice => 
            voice.name.toLowerCase().includes('espeak') || voice.name.toLowerCase().includes('mbrola')
          );
          
          selectedVoice = espeakVoice || englishVoice || voices[0];
          
          if (selectedVoice) {
            console.log(`🥧 ラズベリーパイ用音声選択: ${selectedVoice.name} (${selectedVoice.lang})`);
          }
        } else {
          // その他のデバイスでは日本語音声を優先
          const japaneseVoice = voices.find(voice => 
            voice.lang === 'ja-JP' || voice.lang === 'ja' || voice.name.includes('Japanese') || voice.name.includes('日本語')
          );
          
          selectedVoice = japaneseVoice;
          
          if (selectedVoice) {
            console.log(`✅ 日本語音声を使用: ${selectedVoice.name}`);
          }
        }
        
        // 音声が見つからない場合のフォールバック
        if (!selectedVoice) {
          const defaultVoice = voices.find(v => v.default) || voices[0];
          if (defaultVoice) {
            selectedVoice = defaultVoice;
            console.log(`⚠️ フォールバック音声を使用: ${defaultVoice.name}`);
          } else {
            console.log('⚠️ 音声が見つかりません。代替システムを使用');
            
            // 音声が見つからない場合はラズベリーパイ代替システムを使用
            if (isRaspberryPi) {
              isSpeaking = false;
              const numberMatch = text.match(/(\d+)/g);
              if (numberMatch && numberMatch.length >= 1) {
                const number = parseInt(numberMatch[0]);
                const seatNumber = numberMatch.length > 1 ? parseInt(numberMatch[1]) : null;
                playAlternativeAudio(number, seatNumber);
              }
              return;
            }
          }
        }
        
        if (selectedVoice) {
          msg.voice = selectedVoice;
        }
        
        msg.onstart = () => {
          console.log('🔊 音声再生開始:', text);
        };
        
        msg.onend = () => {
          console.log('✅ 音声再生終了');
          isSpeaking = false;
          const nextDelay = isRaspberryPi ? 1000 : 500; // ラズベリーパイは長めの間隔
          setTimeout(() => {
            playNextSpeech();
          }, nextDelay);
        };
        
        msg.onerror = (event) => {
          console.error('❌ 音声再生エラー:', event);
          isSpeaking = false;
          
          // ラズベリーパイで音声エラーが発生した場合は代替システムを使用
          if (isRaspberryPi) {
            console.log('🥧 音声エラーのため代替音声システムを使用');
            const numberMatch = text.match(/(\d+)/g);
            if (numberMatch && numberMatch.length >= 1) {
              const number = parseInt(numberMatch[0]);
              const seatNumber = numberMatch.length > 1 ? parseInt(numberMatch[1]) : null;
              playAlternativeAudio(number, seatNumber);
            }
          }
          
          const errorDelay = isRaspberryPi ? 2000 : 1000;
          setTimeout(() => {
            playNextSpeech();
          }, errorDelay);
        };
        
        // 音声再生
        console.log('🎤 音声合成開始:', text);
        speechSynthesis.speak(msg);
        
        // タイムアウト処理（ラズベリーパイではより長いタイムアウト）
        const timeoutDuration = isRaspberryPi ? 25000 : 15000;
        const timeoutId = setTimeout(() => {
          if (isSpeaking) {
            console.log('⏰ 音声再生タイムアウト。代替システムを使用。');
            speechSynthesis.cancel();
            isSpeaking = false;
            
            // タイムアウト時にもラズベリーパイ代替システムを使用
            if (isRaspberryPi) {
              const numberMatch = text.match(/(\d+)/g);
              if (numberMatch && numberMatch.length >= 1) {
                const number = parseInt(numberMatch[0]);
                const seatNumber = numberMatch.length > 1 ? parseInt(numberMatch[1]) : null;
                playAlternativeAudio(number, seatNumber);
              }
            }
            
            setTimeout(() => playNextSpeech(), isRaspberryPi ? 1000 : 500);
          }
        }, timeoutDuration);
        
        // 正常終了時にタイムアウトをクリア
        msg.addEventListener('end', () => {
          clearTimeout(timeoutId);
        });
        
      }, cancelWaitTime);
      
    } catch (error) {
      console.error('❌ 音声合成エラー:', error);
      isSpeaking = false;
      
      // ラズベリーパイで例外が発生した場合は代替システムを使用
      if (isRaspberryPi) {
        console.log('🥧 音声合成例外のため代替音声システムを使用');
        const numberMatch = text.match(/(\d+)/g);
        if (numberMatch && numberMatch.length >= 1) {
          const number = parseInt(numberMatch[0]);
          const seatNumber = numberMatch.length > 1 ? parseInt(numberMatch[1]) : null;
          playAlternativeAudio(number, seatNumber);
        }
      }
      
      const errorRetryDelay = isRaspberryPi ? 2000 : 1000;
      setTimeout(() => {
        playNextSpeech();
      }, errorRetryDelay);
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
    
    waitingCount.textContent = waitCount;
    if (estimatedWaitCard) {
      estimatedWaitCard.style.display = showEstimatedWaitTime ? 'flex' : 'none';
    }
    if (showEstimatedWaitTime) {
      estimatedWait.textContent = estimatedMinutes;
    } else {
      estimatedWait.textContent = '';
    }
    
    const activeColor = waitCount > 0 ? '#2c80b9' : '#28a745';
    waitingCount.style.color = activeColor;
    if (estimatedWait) estimatedWait.style.color = activeColor;
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
        
        // ============================================
        // 音声アナウンスのテキストを変更する場合は、ここを編集してください
        // ============================================
        const seatNumber = currentCall.seat.name.replace(/[^0-9]/g, ''); // 座席番号のみ抽出
        let callMessage;
        
        // 優先度に応じたメッセージ（オプション）
        const priorityText = currentCall.priority === 'urgent' ? '緊急の' : 
                            currentCall.priority === 'appointment' ? '予約の' : '';
        
        // 音声メッセージのテンプレートを変更する場合は、以下の部分を編集してください
        if (seatNumber) {
          // 座席番号が抽出できた場合のメッセージ
          callMessage = `受付番号${currentCall.number}番の患者さま、${seatNumber}番診察台へお越しください`;
          // 他の例:
          // callMessage = `${currentCall.number}番の方、${seatNumber}番台へどうぞ`;
          // callMessage = `番号${currentCall.number}、${seatNumber}番診察室へ`;
        } else {
          // 座席番号が抽出できない場合のメッセージ
          callMessage = `受付番号${currentCall.number}番の患者さま、${currentCall.seat.name}へお越しください`;
          // 他の例:
          // callMessage = `${currentCall.number}番の方、${currentCall.seat.name}へどうぞ`;
        }
        
        // 優先度メッセージを含める場合（コメントアウトを解除）
        // if (priorityText) {
        //   callMessage = `${priorityText}${callMessage}`;
        // }
        
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
    showEstimatedWaitTime = data.showEstimatedWaitTime !== undefined ? data.showEstimatedWaitTime : true;
    
    updateDisplay();
  });

  socket.on('update', (data) => {
    console.log('更新データ受信:', data);
    calledHistory = data.calledHistory || [];
    currentCall = data.currentCall;
    tickets = data.tickets || [];
    waitMinutesPerPerson = data.waitMinutesPerPerson || 5;
    showEstimatedWaitTime = data.showEstimatedWaitTime !== undefined ? data.showEstimatedWaitTime : true;
    
    updateDisplay();
  });

  // 接続状態の監視
  socket.on('connect', () => {
    console.log('サーバーに接続しました');
  });

  socket.on('disconnect', () => {
    console.log('サーバーとの接続が切断されました');
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
      console.log('👆 ユーザークリックによる音声初期化');
      initializeAudio();
    }
  }, { once: true });

  // 画面タッチ時にも音声初期化（タッチデバイス対応）
  document.addEventListener('touchstart', () => {
    if (!audioInitialized) {
      console.log('👆 ユーザータッチによる音声初期化');
      initializeAudio();
    }
  }, { once: true });

  // ページ読み込み完了時に音声システムを初期化
  document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOMContentLoaded: 音声システム初期化開始');
    setTimeout(() => {
      initializeAudio();
    }, 1000);
  });

  // ページ完全読み込み時にも音声システム初期化を試行
  window.addEventListener('load', () => {
    console.log('🌐 ページ完全読み込み: 音声システム初期化確認');
    setTimeout(() => {
      if (!audioInitialized) {
        console.log('🔄 音声システム未初期化のため再試行');
        initializeAudio();
      }
    }, 2000);
  });

  // 定期的な音声エンジンチェック（5秒ごと）
  setInterval(() => {
    if (!audioInitialized && 'speechSynthesis' in window) {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        console.log('🔄 定期チェック: 音声エンジンが利用可能になりました');
        initializeAudio();
      }
    }
  }, 5000);

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


});