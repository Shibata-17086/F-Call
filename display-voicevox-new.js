// 新しいVOICEVOX音声再生システム
// AudioContext経由で確実に再生

(function() {
  'use strict';

  // グローバル設定
  const VOICEVOX_API_URL = '/api/voicevox';
  
  // AudioContext（ページ全体で1つ）
  let audioContext = null;
  let audioContextUnlocked = false;
  
  // VOICEVOX設定
  let voiceSettings = {
    useVoicevox: true,
    voicevoxSpeaker: 7,  // 京町セイカ（kyoto）
    voicevoxSpeed: 1.1,
    voicevoxPitch: 0,
    voicevoxIntonation: 1.5
  };
  
  // 音声再生キュー
  let speechQueue = [];
  let isPlaying = false;
  
  /**
   * AudioContextを初期化してアンロック
   */
  async function initAudioContext() {
    if (audioContext) {
      return true;
    }
    
    try {
      // AudioContext作成
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextClass({
        sampleRate: 48000,
        latencyHint: 'interactive'
      });
      
      // suspendedの場合はresume
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      // 無音を再生してアンロック
      const buffer = audioContext.createBuffer(1, 1, 22050);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start(0);
      
      audioContextUnlocked = true;
      
      return true;
      
    } catch (error) {
      console.error('❌ AudioContext初期化エラー:', error);
      return false;
    }
  }
  
  /**
   * VOICEVOXで音声を合成して再生
   */
  async function playVoicevoxAudio(text) {
    // AudioContextが初期化されていない場合は初期化を試みる
    if (!audioContextUnlocked) {
      const success = await initAudioContext();
      
      if (!success) {
        console.error('❌ AudioContext初期化失敗 - ページをクリックしてください');
        
        // ヒントを表示
        const hint = document.getElementById('audioHint');
        if (hint) {
          hint.style.display = 'block';
          hint.textContent = '🔊 音声を有効にするには画面をクリックしてください';
        }
        
        throw new Error('AudioContext not initialized - user interaction required');
      }
    }
    
    try {
      const speaker = voiceSettings.voicevoxSpeaker || 7;
      const speed = voiceSettings.voicevoxSpeed || 1.1;
      const pitch = voiceSettings.voicevoxPitch || 0;
      const intonation = voiceSettings.voicevoxIntonation || 1.5;
      
      // ステップ1: 音声クエリ生成
      const queryUrl = `${VOICEVOX_API_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`;
      
      const queryResponse = await fetch(queryUrl, { method: 'POST' });
      if (!queryResponse.ok) {
        throw new Error(`音声クエリ失敗: ${queryResponse.status}`);
      }
      
      const audioQuery = await queryResponse.json();
      
      // パラメータ設定
      audioQuery.speedScale = speed;
      audioQuery.pitchScale = pitch;
      audioQuery.intonationScale = intonation;
      audioQuery.volumeScale = 1.2;
      audioQuery.prePhonemeLength = 0.1;
      audioQuery.postPhonemeLength = 0.1;
      audioQuery.outputSamplingRate = 48000;
      audioQuery.outputStereo = true;
      
      // ステップ2: 音声合成
      const synthesisUrl = `${VOICEVOX_API_URL}/synthesis?speaker=${speaker}`;
      
      const synthesisResponse = await fetch(synthesisUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(audioQuery)
      });
      
      if (!synthesisResponse.ok) {
        throw new Error(`音声合成失敗: ${synthesisResponse.status}`);
      }
      
      const audioBlob = await synthesisResponse.blob();
      
      // ステップ3: AudioContextで再生
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // 再生
      return new Promise((resolve, reject) => {
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // ボリューム調整
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1.0;
        
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        source.onended = () => {
          resolve();
        };
        
        source.start(0);
      });
      
    } catch (error) {
      console.error('❌ VOICEVOX再生エラー:', error);
      throw error;
    }
  }
  
  /**
   * 音声再生キューを処理
   */
  async function processQueue() {
    if (isPlaying || speechQueue.length === 0) {
      return;
    }
    
    isPlaying = true;
    const text = speechQueue.shift();
    
    try {
      await playVoicevoxAudio(text);
    } catch (error) {
      // AudioContext未初期化エラーの場合はキューに戻す
      if (error.message && error.message.includes('AudioContext not initialized')) {
        speechQueue.unshift(text); // キューの先頭に戻す
        
        // ユーザーがクリックしたら自動的に再試行
        const retryHandler = async () => {
          document.removeEventListener('click', retryHandler);
          
          // 少し待ってから再試行
          setTimeout(() => {
            isPlaying = false;
            processQueue();
          }, 500);
        };
        
        document.addEventListener('click', retryHandler, { once: true });
      } else {
        console.error('❌ 再生エラー:', error);
      }
    } finally {
      isPlaying = false;
      // 次のキューを処理
      if (speechQueue.length > 0) {
        setTimeout(() => processQueue(), 100);
      }
    }
  }
  
  /**
   * 音声を再生キューに追加
   */
  function speak(text) {
    speechQueue.push(text);
    processQueue();
  }
  
  /**
   * ページクリックでAudioContextを初期化
   */
  function setupUserInteractionListener() {
    const events = ['click', 'touchstart', 'keydown'];
    
    const handler = async (e) => {
      const success = await initAudioContext();
      
      if (success) {
        // リスナーを削除
        events.forEach(event => {
          document.removeEventListener(event, handler);
        });
        
        // ヒント非表示
        const hint = document.getElementById('audioHint');
        if (hint) hint.style.display = 'none';
      }
    };
    
    events.forEach(event => {
      document.addEventListener(event, handler, { passive: true });
    });
    
    // 5秒後にヒント表示
    setTimeout(() => {
      if (!audioContextUnlocked) {
        const hint = document.getElementById('audioHint');
        if (hint) hint.style.display = 'block';
      }
    }, 5000);
  }
  
  /**
   * 音声設定を更新
   */
  function updateVoiceSettings(settings) {
    if (!settings) return;
    
    voiceSettings = {
      useVoicevox: Boolean(settings.useVoicevox),
      voicevoxSpeaker: Number(settings.voicevoxSpeaker) || 7,
      voicevoxSpeed: Number(settings.voicevoxSpeed) || 1.1,
      voicevoxPitch: Number(settings.voicevoxPitch) || 0,
      voicevoxIntonation: Number(settings.voicevoxIntonation) || 1.5
    };
  }
  
  /**
   * 初期化
   */
  function init() {
    setupUserInteractionListener();
  }
  
  // グローバルに公開
  window.VoicevoxPlayer = {
    init,
    speak,
    updateVoiceSettings,
    isReady: () => audioContextUnlocked
  };
  
  // DOMContentLoaded時に初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();

