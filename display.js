// 接続先のURLを動的に決定
const getServerUrl = () => {
  const currentHost = window.location.hostname;
  const port = 3443;
  return `https://${currentHost}:${port}`;
};

const socket = io(getServerUrl());

// グローバルエラーハンドラ（ブラウザ拡張機能のエラーを無視）
window.addEventListener('unhandledrejection', (event) => {
  // ブラウザ拡張機能のエラーを無視
  if (event.reason && event.reason.message && 
      (event.reason.message.includes('Could not establish connection') ||
       event.reason.message.includes('Receiving end does not exist') ||
       event.reason.message.includes('Extension context invalidated'))) {
    console.log('ℹ️ ブラウザ拡張機能のエラーを無視:', event.reason.message);
    event.preventDefault();
    return;
  }
  
  // その他のエラーは通常通り処理
  console.error('❌ 未処理のPromiseエラー:', event.reason);
});

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
  const skippedSection = document.getElementById('skippedSection');
  const skippedList = document.getElementById('skippedList');

  let calledHistory = [];
  let currentCall = null;
  let tickets = [];
  let waitMinutesPerPerson = 5;
  let showEstimatedWaitTime = false;  // 初期値: 表示しない
  let lastCallNumber = null;
  let lastCallSeat = null;
  let skippedNumbers = [];
  
  // 音声設定（サーバーから受信）
  // 注: O-Ren使用時はpitchが1.3に自動調整されます
  let voiceSettings = {
    voiceURI: '',
    rate: 0.95,
    pitch: 1.0,  // デフォルト（O-Ren以外）
    volume: 1.0,
    useVoicevox: false,  // VOICEVOX使用フラグ
    voicevoxSpeaker: 7,  // 京町セイカ（kyoto）
    voicevoxSpeed: 1.1,
    voicevoxPitch: 0,  // ピッチは0が標準
    voicevoxIntonation: 1.5  // 抑揚1.5でカスカス防止
  };

  // 音声再生キュー
  let speechQueue = [];
  let isSpeaking = false;
  let audioInitialized = false;
  let audioContext = null;
  
  // VOICEVOX設定（F-Callサーバー経由でアクセス・CORS問題を回避）
  const VOICEVOX_API_URL = '/api/voicevox';

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
          
          if (!audioInitialized) {
            audioInitialized = true;
            console.log('🎉 音声システム初期化完了！');
            
            // 初期化完了メッセージは再生しない（不要なアナウンス削減）
            // 必要な場合は以下のコメントを解除:
            // setTimeout(() => {
            //   speakCallQueued('音声システムの初期化が完了しました');
            // }, 500);
          }
          
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
          if (!audioInitialized) {
            console.log('🔄 音声エンジンが更新されました');
            const voices = speechSynthesis.getVoices();
            console.log(`🎵 更新された音声数: ${voices.length}`);
            if (voices.length > 0) {
              loadVoicesWithRetry();
            }
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

  // VOICEVOX音声合成関数（完全版・改善版）
  async function speakWithVoicevox(text) {
    
    // 音声がアンロックされていない場合は自動的にアンロック
    if (!audioUnlocked) {
      console.log('⚠️ 音声未アンロック、自動アンロックを試行');
      await unlockAudio();
      console.log('✅ アンロック処理完了、再生を開始します');
    }
    
    // 標準音声合成を確実に停止（重複再生防止）
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    try {
      // パラメータを取得（デフォルト値でフォールバック）
      const speaker = Number(voiceSettings.voicevoxSpeaker) || 7;
      const speed = Number(voiceSettings.voicevoxSpeed) || 1.1;
      const pitch = Number(voiceSettings.voicevoxPitch) || 0;
      const intonation = Number(voiceSettings.voicevoxIntonation) || 1.5;
      
      console.log('📊 使用するパラメータ:', {
        speaker,
        speed,
        pitch,
        intonation
      });
      
      // 1. 音声クエリを生成
      const queryUrl = `${VOICEVOX_API_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`;
      console.log('📤 音声クエリリクエスト:', queryUrl);
      
      const queryResponse = await fetch(queryUrl, {
        method: 'POST'
      });
      
      console.log('📥 音声クエリレスポンス:', queryResponse.status, queryResponse.statusText);
      
      if (!queryResponse.ok) {
        throw new Error(`audio_query failed: ${queryResponse.status}`);
      }
      
      const audioQuery = await queryResponse.json();
      
      console.log('📋 audio_query取得前の元データ:', {
        speedScale: audioQuery.speedScale,
        pitchScale: audioQuery.pitchScale,
        intonationScale: audioQuery.intonationScale,
        volumeScale: audioQuery.volumeScale,
        outputSamplingRate: audioQuery.outputSamplingRate
      });
      
      // 音質パラメータ設定
      audioQuery.speedScale = speed;
      audioQuery.pitchScale = pitch;
      audioQuery.intonationScale = intonation;
      audioQuery.volumeScale = 1.2;
      audioQuery.prePhonemeLength = 0.1;
      audioQuery.postPhonemeLength = 0.1;
      audioQuery.outputSamplingRate = 48000;
      audioQuery.outputStereo = true;
      
      console.log('✅ パラメータ設定後のaudioQuery:', {
        speedScale: audioQuery.speedScale,
        pitchScale: audioQuery.pitchScale,
        intonationScale: audioQuery.intonationScale,
        volumeScale: audioQuery.volumeScale,
        outputSamplingRate: audioQuery.outputSamplingRate,
        outputStereo: audioQuery.outputStereo
      });
      
      // 2. 音声を合成
      console.log('📤 synthesis APIに送信するデータ:', JSON.stringify({
        speedScale: audioQuery.speedScale,
        pitchScale: audioQuery.pitchScale,
        intonationScale: audioQuery.intonationScale,
        volumeScale: audioQuery.volumeScale,
        outputSamplingRate: audioQuery.outputSamplingRate,
        outputStereo: audioQuery.outputStereo
      }, null, 2));
      
      const synthesisResponse = await fetch(`${VOICEVOX_API_URL}/synthesis?speaker=${speaker}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(audioQuery)
      });
      
      if (!synthesisResponse.ok) {
        throw new Error(`synthesis failed: ${synthesisResponse.status}`);
      }
      
      // 3. 音声データを再生
      const audioBlob = await synthesisResponse.blob();
      console.log(`📦 音声サイズ: ${(audioBlob.size / 1024).toFixed(1)} KB`);
      
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.volume = 1.0;
      
      // 再生完了時の処理
      audio.addEventListener('ended', () => {
        URL.revokeObjectURL(audioUrl);
        isSpeaking = false;
        playNextSpeech();
      });
      
      // エラー時の処理
      audio.addEventListener('error', (e) => {
        console.error('❌ Audio再生エラー:', e);
        URL.revokeObjectURL(audioUrl);
        isSpeaking = false;
        playNextSpeech();
      });
      
      // 再生開始
      await audio.play();
      
    } catch (error) {
      console.error('❌ VOICEVOXエラー:', error);
      console.error('   エラーメッセージ:', error.message);
      console.error('   エラースタック:', error.stack);
      console.error('   エラータイプ:', error.name);
      
      // VOICEVOXエラー時は標準音声にフォールバック
      console.log('⚠️ 標準音声で再生します');
      isSpeaking = false;
      
      // キューに戻して標準音声で再試行
      speechQueue.unshift(text);
      voiceSettings.useVoicevox = false;  // 一時的に無効化
      playNextSpeech();
    }
  }

  // 音声再生キュー方式（改良版）
  function speakCallQueued(text) {
    // 新しいVOICEVOXシステムを使用
    if (window.VoicevoxPlayer && voiceSettings.useVoicevox) {
      window.VoicevoxPlayer.speak(text);
      return;
    }
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
    // キューが空または既に再生中の場合は何もしない
    if (isSpeaking || speechQueue.length === 0) {
      return;
    }
    
    // キューから次のテキストを取得
    const text = speechQueue.shift();
    isSpeaking = true;
    
    console.log(`▶️ 音声再生開始: "${text}"`);
    
    // VOICEVOXを使用する場合
    if (voiceSettings.useVoicevox) {
      speakWithVoicevox(text);
      return;  // VOICEVOXで処理完了、標準音声は実行しない
    }
    
    // 以下、標準音声合成モード
    
    // デバイス検出
    const isRaspberryPi = navigator.userAgent.includes('armv') || 
                         navigator.userAgent.includes('Linux') && navigator.userAgent.includes('arm');
    
    // 音声が初期化されていない場合
    if (!audioInitialized) {
      console.log('⚠️ 音声未初期化、初期化を試行');
      isSpeaking = false;
      speechQueue.unshift(text);  // テキストを戻す
      initializeAudio();
      setTimeout(() => playNextSpeech(), 2000);
      return;
    }
    
    // speechSynthesisが利用可能かチェック
    if (!('speechSynthesis' in window)) {
      console.error('❌ 音声合成非対応');
      isSpeaking = false;
      speechQueue = [];
      return;
    }
    
    // 音声エンジンの読み込み確認
    const voices = speechSynthesis.getVoices();
    if (voices.length === 0) {
      console.log('⚠️ 音声エンジン未読み込み、再試行');
      isSpeaking = false;
      speechQueue.unshift(text);  // テキストを戻す
      setTimeout(() => playNextSpeech(), 1000);
      return;
    }
    
    // 標準音声合成をキャンセル
    speechSynthesis.cancel();
    
    // 少し待ってから音声作成
    setTimeout(() => {
      const msg = new SpeechSynthesisUtterance(text);
      msg.lang = 'ja-JP';
      
      const voices = speechSynthesis.getVoices();
      let selectedVoice = null;
      
      // 音声エンジンの選択（指定音声 or 自動選択）
      if (voiceSettings.voiceURI) {
        selectedVoice = voices.find(voice => voice.voiceURI === voiceSettings.voiceURI);
      }
      
      if (!selectedVoice) {
        // 優先順位: O-Ren > Kyoko > Otoya > その他
        const orenVoice = voices.find(v => v.lang.startsWith('ja') && v.name.includes('O-ren'));
        const kyokoVoice = voices.find(v => v.lang.startsWith('ja') && v.name.includes('Kyoko'));
        const otoyaVoice = voices.find(v => v.lang.startsWith('ja') && v.name.includes('Otoya'));
        const japaneseVoice = voices.find(v => v.lang.startsWith('ja'));
        
        selectedVoice = orenVoice || kyokoVoice || otoyaVoice || japaneseVoice || voices[0];
        console.log(`✅ 自動選択: ${selectedVoice.name}`);
      }
      
      // 音声を設定
      if (selectedVoice) {
        msg.voice = selectedVoice;
      }
      
      // パラメータ設定
      msg.rate = Number(voiceSettings.rate) || 0.95;
      msg.volume = Number(voiceSettings.volume) || 1.0;
      
      // O-Ren使用時はピッチ1.3
      if (selectedVoice && selectedVoice.name.includes('O-ren')) {
        msg.pitch = 1.3;
      } else {
        msg.pitch = Number(voiceSettings.pitch) || 1.0;
      }
      
      console.log(`🔊 標準音声: ${selectedVoice ? selectedVoice.name : 'なし'} 速度=${msg.rate} ピッチ=${msg.pitch}`);
      
      // イベントハンドラ設定
      msg.onend = () => {
        isSpeaking = false;
        setTimeout(() => playNextSpeech(), 500);
      };
      
      msg.onerror = (e) => {
        console.error('❌ 標準音声エラー:', e);
        isSpeaking = false;
        setTimeout(() => playNextSpeech(), 500);
      };
      
      // 音声再生
      speechSynthesis.speak(msg);
      
    }, 200);  // 200ms待機してから実行
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
        const seatNumber = currentCall.seat.number || currentCall.seat.name.replace(/[^0-9]/g, ''); // 座席番号を取得
        const seatUnit = currentCall.seat.unit || 'ユニット'; // 座席単位を取得
        let callMessage;
        
        // 優先度に応じたメッセージ（オプション）
        const priorityText = currentCall.priority === 'urgent' ? '緊急の' : 
                            currentCall.priority === 'appointment' ? '予約の' : '';
        
        // 音声メッセージのテンプレートを変更する場合は、以下の部分を編集してください
        if (seatNumber) {
          // 座席番号が取得できた場合のメッセージ（単位も含む）
          callMessage = `受付番号${currentCall.number}番の患者さま、${seatNumber}番${seatUnit}へお越しください`;
          // 他の例:
          // callMessage = `${currentCall.number}番の方、${seatNumber}番${seatUnit}へどうぞ`;
          // callMessage = `番号${currentCall.number}、${seatNumber}番${seatUnit}へ`;
        } else {
          // 座席番号が取得できない場合のメッセージ
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
    updateSkippedList();
  }

  function updateHistoryDisplay() {
    historyList.innerHTML = '';
    
    // 現在の呼び出しを履歴の最上位に表示
    const skippedSet = new Set((skippedNumbers || []).map(item => Number(item.number)));
    let displayHistory = (calledHistory || []).filter(item => {
      const num = Number(item.number);
      return !item.skipped && !skippedSet.has(num);
    });
    if (currentCall && currentCall.number && !skippedSet.has(Number(currentCall.number))) {
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
    
    const historyToShow = displayHistory.slice(0, 10);
    
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

  function updateSkippedList() {
    if (!skippedSection || !skippedList) return;
    
    if (!skippedNumbers || skippedNumbers.length === 0) {
      skippedSection.style.display = 'none';
      skippedList.innerHTML = '';
      return;
    }
    
    skippedSection.style.display = 'block';
    skippedList.innerHTML = '';
    
    skippedNumbers.slice(0, 6).forEach(item => {
      const chip = document.createElement('div');
      chip.className = 'skipped-chip';
      const timeText = item.time ? item.time.split(' ')[1] || item.time : '';
      chip.innerHTML = `
        <span class="skipped-number">No.${item.number}</span>
        <span class="skipped-time">${timeText}</span>
      `;
      skippedList.appendChild(chip);
    });
  }

  // 音声設定を更新する共通関数
  const updateVoiceSettings = (settings) => {
    if (!settings) {
      return;
    }
    
    const newSettings = {
      voiceURI: String(settings.voiceURI || ''),
      rate: Number(settings.rate) || 0.95,
      pitch: Number(settings.pitch) || 1.0,
      volume: Number(settings.volume) || 1.0,
      useVoicevox: Boolean(settings.useVoicevox),
      voicevoxSpeaker: Number(settings.voicevoxSpeaker) || 7,
      voicevoxSpeed: Number(settings.voicevoxSpeed) || 1.1,
      voicevoxPitch: Number(settings.voicevoxPitch) || 0,
      voicevoxIntonation: Number(settings.voicevoxIntonation) || 1.5
    };
    
    voiceSettings = newSettings;
    
    // 新しいVOICEVOXシステムにも通知
    if (window.VoicevoxPlayer) {
      window.VoicevoxPlayer.updateVoiceSettings(newSettings);
    }
  };

  // Socket.io イベントハンドラ
  socket.on('init', (data) => {
    calledHistory = data.calledHistory || [];
    currentCall = data.currentCall;
    tickets = data.tickets || [];
    waitMinutesPerPerson = data.waitMinutesPerPerson || 5;
    showEstimatedWaitTime = data.showEstimatedWaitTime !== undefined ? data.showEstimatedWaitTime : false;
    skippedNumbers = data.skippedTickets || [];
    updateVoiceSettings(data.voiceSettings);
    updateDisplay();
  });

  socket.on('update', (data) => {
    calledHistory = data.calledHistory || [];
    currentCall = data.currentCall;
    tickets = data.tickets || [];
    waitMinutesPerPerson = data.waitMinutesPerPerson || 5;
    showEstimatedWaitTime = data.showEstimatedWaitTime !== undefined ? data.showEstimatedWaitTime : false;
    skippedNumbers = data.skippedTickets || [];
    updateVoiceSettings(data.voiceSettings);
    updateDisplay();
  });

  // 音声設定が変更されたときの専用イベント（即座に反映）
  socket.on('voiceSettingsChanged', (settings) => {
    updateVoiceSettings(settings);
    
    // 視覚的なフィードバックを表示
    const notification = document.getElementById('notification');
    if (notification) {
      notification.textContent = '🔊 音声設定が更新されました';
      notification.className = 'notification show';
      setTimeout(() => {
        notification.className = 'notification';
      }, 3000);
    }
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

  // 音声許可取得フラグ
  let audioUnlocked = false;
  
  // デバッグ用: 現在の音声設定を表示するグローバル関数
  window.debugVoiceSettings = () => {
    return voiceSettings;
  };
  
  // ページ内の任意のクリックで音声をアンロック（自動再生を許可）
  async function unlockAudio() {
    if (audioUnlocked) {
      return;
    }
    
    // AudioContextをアンロック
    if (audioContext && audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (e) {
        // エラーを無視
      }
    }
    
    // ダミーの無音を再生してブラウザの自動再生を許可
    const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    silentAudio.volume = 0.01;
    
    try {
      await silentAudio.play();
      audioUnlocked = true;
    } catch (error) {
      // エラーを無視して続行
      audioUnlocked = true; // エラーでもフラグは立てる（既に許可されている可能性）
    }
  }
  
  // ページ読み込み時に、最初のクリック/タッチで音声をアンロック
  document.addEventListener('DOMContentLoaded', () => {
    const audioHint = document.getElementById('audioHint');
    const unlockEvents = ['click', 'touchstart', 'touchend', 'keydown'];
    
    const unlockHandler = async (e) => {
      console.log('🖱️ ユーザー操作検知:', e.type);
      
      await unlockAudio();
      
      // ヒントを非表示
      if (audioHint) {
        audioHint.style.display = 'none';
      }
      
      // 一度実行したらリスナーを削除
      unlockEvents.forEach(event => {
        document.removeEventListener(event, unlockHandler);
      });
    };
    
    unlockEvents.forEach(event => {
      document.addEventListener(event, unlockHandler, { once: false, passive: true });
    });
    
    // 5秒後にヒントを表示（まだアンロックされていない場合）
    setTimeout(() => {
      if (!audioUnlocked && audioHint) {
        audioHint.style.display = 'block';
      }
    }, 5000);
    
  });

  // 音声初期化を一度だけ実行する統合関数
  let audioInitAttempted = false;
  
  const tryInitializeAudio = (source) => {
    if (audioInitAttempted) return;
    audioInitAttempted = true;
    
    setTimeout(() => {
      initializeAudio();
    }, 500);
  };

  // ユーザー操作時に音声初期化（一度だけ）
  const initOnUserAction = () => {
    if (!audioInitialized && !audioInitAttempted) {
      tryInitializeAudio('ユーザー操作');
    }
  };

  document.addEventListener('click', initOnUserAction, { once: true });
  document.addEventListener('touchstart', initOnUserAction, { once: true });

  // ページ読み込み完了時に音声システムを初期化（1秒待機）
  setTimeout(() => {
    if (!audioInitAttempted) {
      tryInitializeAudio('自動初期化');
    }
  }, 1000);

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