// 接続先のURLを動的に決定
const getServerUrl = () => {
  const currentHost = window.location.hostname;
  const port = 3443; // サーバーのポート番号
  return `https://${currentHost}:${port}`;
};

// グローバルエラーハンドラ（ブラウザ拡張機能のエラーを無視）
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message && 
      (event.reason.message.includes('Could not establish connection') ||
       event.reason.message.includes('Receiving end does not exist') ||
       event.reason.message.includes('Extension context invalidated'))) {
    console.log('ℹ️ ブラウザ拡張機能のエラーを無視:', event.reason.message);
    event.preventDefault();
    return;
  }
  console.error('❌ 未処理のPromiseエラー:', event.reason);
});

const socket = io(getServerUrl());
const seatList = document.getElementById('seatList');
const newSeatNumber = document.getElementById('newSeatNumber');
const newSeatUnit = document.getElementById('newSeatUnit');
const customSeatUnit = document.getElementById('customSeatUnit');
const addSeatBtn = document.getElementById('addSeatBtn');
const ticketList = document.getElementById('ticketList');
const issuedHistoryList = document.getElementById('issuedHistoryList');
const historyList = document.getElementById('historyList');
const currentNumber = document.getElementById('currentNumber');
const waitMinutesInput = document.getElementById('waitMinutesInput');
const setWaitMinutesBtn = document.getElementById('setWaitMinutesBtn');
const toggleEstimatedWait = document.getElementById('toggleEstimatedWait');
const togglePersonalStatus = document.getElementById('togglePersonalStatus');
const clearTickets = document.getElementById('clearTickets');
const clearIssuedHistory = document.getElementById('clearIssuedHistory');
const clearHistory = document.getElementById('clearHistory');
const setNumberInput = document.getElementById('setNumberInput');
const setSeatSelect = document.getElementById('setSeatSelect');
const setNumberBtn = document.getElementById('setNumberBtn');
const resetAll = document.getElementById('resetAll');

// 音声設定UI要素
const voiceSelect = document.getElementById('voiceSelect');
const rateSlider = document.getElementById('rateSlider');
const rateValue = document.getElementById('rateValue');
const pitchSlider = document.getElementById('pitchSlider');
const pitchValue = document.getElementById('pitchValue');
const volumeSlider = document.getElementById('volumeSlider');
const volumeValue = document.getElementById('volumeValue');
const saveVoiceSettingsBtn = document.getElementById('saveVoiceSettingsBtn');
const resetVoiceSettingsBtn = document.getElementById('resetVoiceSettingsBtn');
const voiceSettingsStatus = document.getElementById('voiceSettingsStatus');

// VOICEVOX設定UI要素
const useVoicevoxCheckbox = document.getElementById('useVoicevoxCheckbox');
const voicevoxSettings = document.getElementById('voicevoxSettings');
const standardVoiceSettings = document.getElementById('standardVoiceSettings');
const voicevoxSpeakerSelect = document.getElementById('voicevoxSpeakerSelect');
const voicevoxSpeedSlider = document.getElementById('voicevoxSpeedSlider');
const voicevoxSpeedValue = document.getElementById('voicevoxSpeedValue');
const voicevoxPitchSlider = document.getElementById('voicevoxPitchSlider');
const voicevoxPitchValue = document.getElementById('voicevoxPitchValue');
const voicevoxIntonationSlider = document.getElementById('voicevoxIntonationSlider');
const voicevoxIntonationValue = document.getElementById('voicevoxIntonationValue');

// 単位リスト（LocalStorageから読み込み）
let customUnits = JSON.parse(localStorage.getItem('customUnits') || '[]');
const defaultUnits = ['番診察台', '番ユニット', '番診察室', '番ブース', '番'];

// 単位リストを結合
function getAllUnits() {
  return [...defaultUnits, ...customUnits];
}

// 単位をLocalStorageに保存
function saveCustomUnits() {
  localStorage.setItem('customUnits', JSON.stringify(customUnits));
}

// ドロップダウンを更新
function updateUnitDropdown(selectElement, selectedValue = null) {
  const currentValue = selectedValue || selectElement.value;
  selectElement.innerHTML = '';
  
  getAllUnits().forEach(unit => {
    const option = document.createElement('option');
    option.value = unit;
    option.textContent = unit;
    if (unit === currentValue) {
      option.selected = true;
    }
    selectElement.appendChild(option);
  });
  
  // カスタム入力オプションを追加
  const customOption = document.createElement('option');
  customOption.value = '__custom__';
  customOption.textContent = '🔧 カスタム入力...';
  selectElement.appendChild(customOption);
  
  if (currentValue === '__custom__') {
    customOption.selected = true;
  }
}

// カスタム入力の表示/非表示
if (newSeatUnit) {
  newSeatUnit.onchange = () => {
    if (newSeatUnit.value === '__custom__') {
      customSeatUnit.style.display = 'inline-block';
      customSeatUnit.focus();
    } else {
      customSeatUnit.style.display = 'none';
    }
  };
}

// ============================================
// 音声設定機能
// ============================================

// デフォルト音声設定
const defaultVoiceSettings = {
  voiceURI: '', // 空文字列は自動選択
  rate: 0.95,
  pitch: 1.0,
  volume: 1.0,
  useVoicevox: false,
  voicevoxSpeaker: 7,  // 京町セイカ（kyoto）
  voicevoxSpeed: 1.1,
  voicevoxPitch: 0,  // ピッチは0が標準（-0.15〜0.15の範囲）
  voicevoxIntonation: 1.5  // 抑揚を1.5に（カスカス防止）
};

// LocalStorageから音声設定を読み込み
function loadVoiceSettings() {
  const saved = localStorage.getItem('voiceSettings');
  if (saved) {
    try {
      return { ...defaultVoiceSettings, ...JSON.parse(saved) };
    } catch (e) {
      console.error('音声設定の読み込みエラー:', e);
      return { ...defaultVoiceSettings };
    }
  }
  return { ...defaultVoiceSettings };
}

// 音声設定をLocalStorageに保存
function saveVoiceSettingsToStorage(settings) {
  localStorage.setItem('voiceSettings', JSON.stringify(settings));
}

// 現在の音声設定
let currentVoiceSettings = loadVoiceSettings();

// 音声リストを読み込んでドロップダウンに追加
function loadVoiceList() {
  if (!voiceSelect) return;
  
  const voices = window.speechSynthesis.getVoices();
  
  // 既存のオプションをクリア（自動選択オプション以外）
  voiceSelect.innerHTML = '<option value="">自動選択（推奨）</option>';
  
  // 日本語音声のみをフィルタ
  const japaneseVoices = voices.filter(voice => 
    voice.lang === 'ja-JP' || voice.lang.startsWith('ja')
  );
  
  japaneseVoices.forEach(voice => {
    const option = document.createElement('option');
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} (${voice.lang})${voice.localService ? ' - オフライン対応' : ''}`;
    
    if (voice.voiceURI === currentVoiceSettings.voiceURI) {
      option.selected = true;
    }
    
    voiceSelect.appendChild(option);
  });
  
  console.log(`🎵 日本語音声: ${japaneseVoices.length}個読み込み完了`);
}

// UIに音声設定を反映
function updateVoiceSettingsUI() {
  if (rateSlider) {
    rateSlider.value = currentVoiceSettings.rate;
    rateValue.textContent = currentVoiceSettings.rate.toFixed(2);
  }
  if (pitchSlider) {
    pitchSlider.value = currentVoiceSettings.pitch;
    pitchValue.textContent = currentVoiceSettings.pitch.toFixed(1);
  }
  if (volumeSlider) {
    volumeSlider.value = currentVoiceSettings.volume;
    volumeValue.textContent = currentVoiceSettings.volume.toFixed(1);
  }
  
  // VOICEVOX設定を反映
  if (useVoicevoxCheckbox) {
    useVoicevoxCheckbox.checked = currentVoiceSettings.useVoicevox || false;
    toggleVoicevoxSettings();
  }
  if (voicevoxSpeakerSelect) {
    voicevoxSpeakerSelect.value = currentVoiceSettings.voicevoxSpeaker || 7;
  }
  if (voicevoxSpeedSlider) {
    voicevoxSpeedSlider.value = currentVoiceSettings.voicevoxSpeed || 1.1;
    voicevoxSpeedValue.textContent = (currentVoiceSettings.voicevoxSpeed || 1.1).toFixed(1);
  }
  if (voicevoxPitchSlider) {
    voicevoxPitchSlider.value = currentVoiceSettings.voicevoxPitch || 0;
    voicevoxPitchValue.textContent = (currentVoiceSettings.voicevoxPitch || 0).toFixed(2);
  }
  if (voicevoxIntonationSlider) {
    voicevoxIntonationSlider.value = currentVoiceSettings.voicevoxIntonation || 1.5;
    voicevoxIntonationValue.textContent = (currentVoiceSettings.voicevoxIntonation || 1.5).toFixed(1);
  }
}

// VOICEVOX設定の表示/非表示を切り替え
function toggleVoicevoxSettings() {
  if (useVoicevoxCheckbox && useVoicevoxCheckbox.checked) {
    if (voicevoxSettings) voicevoxSettings.style.display = 'block';
    if (standardVoiceSettings) standardVoiceSettings.style.display = 'none';
  } else {
    if (voicevoxSettings) voicevoxSettings.style.display = 'none';
    if (standardVoiceSettings) standardVoiceSettings.style.display = 'block';
  }
}

// VOICEVOXチェックボックスのイベント
if (useVoicevoxCheckbox) {
  useVoicevoxCheckbox.onchange = toggleVoicevoxSettings;
}

// スライダーの値変更イベント
if (rateSlider) {
  rateSlider.oninput = () => {
    rateValue.textContent = parseFloat(rateSlider.value).toFixed(2);
  };
}

if (pitchSlider) {
  pitchSlider.oninput = () => {
    pitchValue.textContent = parseFloat(pitchSlider.value).toFixed(1);
  };
}

if (volumeSlider) {
  volumeSlider.oninput = () => {
    volumeValue.textContent = parseFloat(volumeSlider.value).toFixed(1);
  };
}

// VOICEVOXスライダーのイベント
if (voicevoxSpeedSlider) {
  voicevoxSpeedSlider.oninput = () => {
    voicevoxSpeedValue.textContent = parseFloat(voicevoxSpeedSlider.value).toFixed(1);
  };
}

if (voicevoxPitchSlider) {
  voicevoxPitchSlider.oninput = () => {
    voicevoxPitchValue.textContent = parseFloat(voicevoxPitchSlider.value).toFixed(2);
  };
}

if (voicevoxIntonationSlider) {
  voicevoxIntonationSlider.oninput = () => {
    voicevoxIntonationValue.textContent = parseFloat(voicevoxIntonationSlider.value).toFixed(1);
  };
}

// 設定保存ボタン
if (saveVoiceSettingsBtn) {
  saveVoiceSettingsBtn.onclick = () => {
    currentVoiceSettings = {
      voiceURI: voiceSelect ? voiceSelect.value : '',
      rate: rateSlider ? parseFloat(rateSlider.value) : 0.95,
      pitch: pitchSlider ? parseFloat(pitchSlider.value) : 1.0,
      volume: volumeSlider ? parseFloat(volumeSlider.value) : 1.0,
      useVoicevox: useVoicevoxCheckbox ? useVoicevoxCheckbox.checked : false,
      voicevoxSpeaker: voicevoxSpeakerSelect ? parseInt(voicevoxSpeakerSelect.value) : 7,
      voicevoxSpeed: voicevoxSpeedSlider ? parseFloat(voicevoxSpeedSlider.value) : 1.1,
      voicevoxPitch: voicevoxPitchSlider ? parseFloat(voicevoxPitchSlider.value) : 0,
      voicevoxIntonation: voicevoxIntonationSlider ? parseFloat(voicevoxIntonationSlider.value) : 1.5
    };
    
    console.log('🔊 音声設定を保存・送信中:', currentVoiceSettings);
    if (currentVoiceSettings.useVoicevox) {
      console.log(`   - VOICEVOX使用: speaker=${currentVoiceSettings.voicevoxSpeaker} speed=${currentVoiceSettings.voicevoxSpeed} pitch=${currentVoiceSettings.voicevoxPitch} intonation=${currentVoiceSettings.voicevoxIntonation}`);
    } else {
      console.log(`   - 音声URI: "${currentVoiceSettings.voiceURI}" (${currentVoiceSettings.voiceURI ? '指定あり' : '自動選択'})`);
      console.log(`   - 速度: ${currentVoiceSettings.rate}`);
      console.log(`   - ピッチ: ${currentVoiceSettings.pitch}`);
      console.log(`   - 音量: ${currentVoiceSettings.volume}`);
    }
    
    // LocalStorageに保存
    saveVoiceSettingsToStorage(currentVoiceSettings);
    console.log('💾 LocalStorageに保存完了');
    
    // サーバーに設定を送信（待合室表示画面で使用）
    socket.emit('admin:updateVoiceSettings', currentVoiceSettings);
    console.log('📤 サーバーに送信完了');
    
    // 保存成功メッセージを表示
    if (voiceSettingsStatus) {
      voiceSettingsStatus.style.display = 'block';
      voiceSettingsStatus.style.background = '#d4edda';
      voiceSettingsStatus.style.color = '#155724';
      voiceSettingsStatus.style.border = '1px solid #c3e6cb';
      voiceSettingsStatus.textContent = '✅ 音声設定を保存しました。全ての待合室表示画面に反映されます。';
      
      setTimeout(() => {
        voiceSettingsStatus.style.display = 'none';
      }, 5000);
    }
  };
}

// サーバーからの音声設定更新完了通知を受信
socket.on('voiceSettingsUpdated', (result) => {
  if (result.success) {
    console.log('✅ サーバーが音声設定の更新を確認しました');
    console.log('📢 待合室表示画面に即座に反映されました');
  } else {
    console.error('❌ サーバーでの音声設定更新に失敗:', result.error);
    if (voiceSettingsStatus) {
      voiceSettingsStatus.style.display = 'block';
      voiceSettingsStatus.style.background = '#f8d7da';
      voiceSettingsStatus.style.color = '#721c24';
      voiceSettingsStatus.style.border = '1px solid #f5c6cb';
      voiceSettingsStatus.textContent = '❌ 音声設定の保存に失敗しました。再度お試しください。';
      
      setTimeout(() => {
        voiceSettingsStatus.style.display = 'none';
      }, 5000);
    }
  }
});

// 音声設定が変更されたときの通知も受信（確認用）
socket.on('voiceSettingsChanged', (settings) => {
  console.log('🔊 音声設定変更を確認:', settings);
});

// デフォルトに戻すボタン
if (resetVoiceSettingsBtn) {
  resetVoiceSettingsBtn.onclick = () => {
    if (confirm('音声設定をデフォルトに戻しますか？')) {
      currentVoiceSettings = { ...defaultVoiceSettings };
      saveVoiceSettingsToStorage(currentVoiceSettings);
      updateVoiceSettingsUI();
      
      if (voiceSelect) {
        voiceSelect.value = '';
      }
      
      // リセット成功メッセージを表示
      if (voiceSettingsStatus) {
        voiceSettingsStatus.style.display = 'block';
        voiceSettingsStatus.style.background = '#fff3cd';
        voiceSettingsStatus.style.color = '#856404';
        voiceSettingsStatus.style.border = '1px solid #ffeaa7';
        voiceSettingsStatus.textContent = '🔄 音声設定をデフォルトに戻しました。';
        
        setTimeout(() => {
          voiceSettingsStatus.style.display = 'none';
        }, 3000);
      }
      
      // サーバーに設定を送信
      socket.emit('admin:updateVoiceSettings', currentVoiceSettings);
      
      console.log('🔊 音声設定をリセット');
    }
  };
}

// 音声エンジンの読み込み完了を待つ
if ('speechSynthesis' in window) {
  // 音声リストを読み込み
  loadVoiceList();
  
  // 音声エンジンが更新されたときに再読み込み
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoiceList;
  }
  
  // 初期設定をUIに反映
  updateVoiceSettingsUI();
  
  // 定期的に音声エンジンをチェック（遅延読み込み対策）
  setTimeout(() => {
    if (window.speechSynthesis.getVoices().length > 0) {
      loadVoiceList();
    }
  }, 1000);
}

// ページ読み込み時: 必ずデフォルト設定をサーバーに送信
let initialSettingsSent = false;

socket.on('connect', () => {
  if (!initialSettingsSent) {
    initialSettingsSent = true;
    
    console.log('🔌 管理画面がサーバーに接続しました');
    
    // 少し待ってから初期設定を送信
    setTimeout(() => {
      // 確実にデフォルト設定を送信（LocalStorageが空でも）
      const settingsToSend = {
        ...defaultVoiceSettings,
        ...currentVoiceSettings
      };
      
      console.log('📤 初期音声設定をサーバーに送信:', settingsToSend);
      console.log('   特に重要: voicevoxIntonation =', settingsToSend.voicevoxIntonation);
      
      socket.emit('admin:updateVoiceSettings', settingsToSend);
    }, 1000);
  }
});

// 合成音声テスト用
// ============================================
// テスト音声のテキストを変更する場合は、ここを編集してください
// ============================================
const testSpeechBtn = document.getElementById('testSpeechBtn');
if (testSpeechBtn) {
  testSpeechBtn.onclick = async () => {
    // 最初の座席の情報を使用してテスト
    let testMessage = '受付番号1番の患者さま、1番ユニットへお越しください';
    
    if (seats.length > 0) {
      const firstSeat = seats[0];
      const seatNumber = firstSeat.number || '1';
      const seatUnit = firstSeat.unit || '番ユニット';
      testMessage = `受付番号1番の患者さま、${seatNumber}${seatUnit}へお越しください`;
    }
    
    // VOICEVOXを使用する場合
    const useVoicevox = useVoicevoxCheckbox ? useVoicevoxCheckbox.checked : false;
    
    if (useVoicevox) {
      console.log('🎤 VOICEVOXでテスト音声を再生');
      const speaker = voicevoxSpeakerSelect ? parseInt(voicevoxSpeakerSelect.value) : 7;
      const speed = voicevoxSpeedSlider ? parseFloat(voicevoxSpeedSlider.value) : 1.1;
      const pitch = voicevoxPitchSlider ? parseFloat(voicevoxPitchSlider.value) : 0;
      const intonation = voicevoxIntonationSlider ? parseFloat(voicevoxIntonationSlider.value) : 1.5;
      
      try {
        // F-Callサーバー経由でVOICEVOXにアクセス（CORS問題を回避）
        const VOICEVOX_API_URL = '/api/voicevox';
        
        console.log(`📡 VOICEVOX接続テスト: ${VOICEVOX_API_URL}`);
        
        // 音声クエリを生成
        const queryResponse = await fetch(`${VOICEVOX_API_URL}/audio_query?text=${encodeURIComponent(testMessage)}&speaker=${speaker}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (!queryResponse.ok) {
          const errorText = await queryResponse.text();
          console.error('❌ VOICEVOX APIレスポンス:', errorText);
          throw new Error(`VOICEVOX APIエラー: ${queryResponse.status} - ${errorText}`);
        }
        
        const audioQuery = await queryResponse.json();
        
        // 音質改善のため全パラメータを最適設定
        audioQuery.speedScale = speed;                    // 話速（0.5〜2.0）
        audioQuery.pitchScale = pitch;                    // 音高（-0.15〜0.15が推奨）
        audioQuery.intonationScale = intonation;          // 抑揚（0〜2、1.5推奨）
        audioQuery.volumeScale = 1.2;                     // 音量スケール（1.0より大きく）
        audioQuery.prePhonemeLength = 0.1;                // 音声前の無音（0.1秒）
        audioQuery.postPhonemeLength = 0.1;               // 音声後の無音（0.1秒）
        audioQuery.outputSamplingRate = 48000;            // サンプリングレート（48kHzで高品質）
        audioQuery.outputStereo = true;                   // ステレオ出力で音質向上
        
        console.log('🔊 VOICEVOX詳細設定:', {
          speaker,
          speedScale: audioQuery.speedScale,
          pitchScale: audioQuery.pitchScale,
          intonationScale: audioQuery.intonationScale,
          volumeScale: audioQuery.volumeScale,
          samplingRate: audioQuery.outputSamplingRate,
          stereo: audioQuery.outputStereo
        });
        
        // 音声を合成（疑問文対応）
        const synthesisResponse = await fetch(`${VOICEVOX_API_URL}/synthesis?speaker=${speaker}&enable_interrogative_upspeak=true`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'accept': 'audio/wav'
          },
          body: JSON.stringify(audioQuery)
        });
        
        if (!synthesisResponse.ok) {
          const errorText = await synthesisResponse.text();
          throw new Error(`VOICEVOX合成エラー: ${synthesisResponse.status} - ${errorText}`);
        }
        
        const audioBlob = await synthesisResponse.blob();
        console.log(`📦 音声データサイズ: ${(audioBlob.size / 1024).toFixed(2)} KB`);
        
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        // 音量を最大に
        audio.volume = 1.0;
        
        audio.onended = () => URL.revokeObjectURL(audioUrl);
        audio.onerror = (error) => {
          console.error('❌ VOICEVOX音声再生エラー:', error);
          URL.revokeObjectURL(audioUrl);
          alert('VOICEVOXの音声再生に失敗しました。VOICEVOXアプリが起動しているか確認してください。');
        };
        
        console.log('🔊 VOICEVOX音声再生開始（24kHz, 抑揚1.2）');
        await audio.play();
        console.log('✅ VOICEVOXテスト音声再生完了');
        return;
        
      } catch (error) {
        console.error('❌ VOICEVOXエラー:', error);
        alert(`VOICEVOXに接続できません。\n\nエラー: ${error.message}\n\nVOICEVOXアプリが起動しているか確認してください。`);
        return;
      }
    }
    
    // 標準音声の場合
    const msg = new window.SpeechSynthesisUtterance(testMessage);
    msg.lang = 'ja-JP';
    
    // 現在のUI設定を取得（保存前でもテストできるように）
    const testRate = rateSlider ? parseFloat(rateSlider.value) : currentVoiceSettings.rate;
    const testPitch = pitchSlider ? parseFloat(pitchSlider.value) : currentVoiceSettings.pitch;
    const testVolume = volumeSlider ? parseFloat(volumeSlider.value) : currentVoiceSettings.volume;
    const testVoiceURI = voiceSelect ? voiceSelect.value : currentVoiceSettings.voiceURI;
    
    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = null;
    
    // 音声エンジンの選択
    if (testVoiceURI) {
      // 特定の音声が選択されている場合
      selectedVoice = voices.find(voice => voice.voiceURI === testVoiceURI);
      console.log(`🎤 指定された音声: ${selectedVoice ? selectedVoice.name : '見つかりません'}`);
    } else {
      // 自動選択（Mac最適化）
      const orenVoice = voices.find(voice => 
        (voice.lang === 'ja-JP' || voice.lang.startsWith('ja')) && 
        (voice.name.includes('O-ren') || voice.name.includes('O-Ren'))
      );
      
      const kyokoVoice = voices.find(voice => 
        (voice.lang === 'ja-JP' || voice.lang.startsWith('ja')) && 
        voice.name.includes('Kyoko')
      );
      
      const otoyaVoice = voices.find(voice => 
        (voice.lang === 'ja-JP' || voice.lang.startsWith('ja')) && 
        voice.name.includes('Otoya')
      );
      
      const appleVoice = voices.find(voice => 
        (voice.lang === 'ja-JP' || voice.lang.startsWith('ja')) && 
        voice.localService
      );
      
      const anyJapaneseVoice = voices.find(voice => 
        voice.lang === 'ja-JP' || voice.lang.startsWith('ja')
      );
      
      selectedVoice = orenVoice || kyokoVoice || otoyaVoice || appleVoice || anyJapaneseVoice;
      console.log(`🍎 自動選択: ${selectedVoice ? selectedVoice.name : '見つかりません'}`);
    }
    
    if (selectedVoice) {
      msg.voice = selectedVoice;
    }
    
    // UI設定を適用
    msg.rate = testRate;
    msg.volume = testVolume;
    
    // O-Renの場合のみデフォルトピッチを1.3に（ユーザーが変更していない場合）
    if (selectedVoice && (selectedVoice.name.includes('O-ren') || selectedVoice.name.includes('O-Ren'))) {
      // ピッチスライダーが初期値（1.0）の場合のみ1.3に変更
      msg.pitch = (testPitch === 1.0 && !pitchSlider.classList.contains('user-modified')) ? 1.3 : testPitch;
      console.log(`🎤 O-Ren使用: ピッチ=${msg.pitch}を適用`);
    } else {
      msg.pitch = testPitch;
    }
    
    console.log(`🔊 テスト音声設定 - 速度: ${msg.rate}, ピッチ: ${msg.pitch}, 音量: ${msg.volume}, 音声: ${selectedVoice ? selectedVoice.name : 'なし'}`);
    
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(msg);
  };
}

let seats = [];
let tickets = [];
let issuedHistory = [];
let calledHistory = [];
let currentCall = null;
let waitMinutesPerPerson = 5;
let statistics = { averageWaitTime: 5, averageSessionTime: 10 };
let currentDate = '';
let networkInfo = [];
let showEstimatedWaitTime = false;  // 初期値: 表示しない
let showPersonalStatus = false;

function updateDisplay() {
  // ネットワーク情報の更新
  updateNetworkInfo();
  
  // 統計情報の更新
  updateStatistics();
  
  // 座席状況の更新
  updateSeatStatusGrid();

  // 座席リスト
  seatList.innerHTML = '';
  seats.forEach(seat => {
    const div = document.createElement('div');
    div.className = 'seat-item';
    div.style.cssText = 'display: flex; gap: 0.5rem; align-items: center;';
    
    const numberInput = document.createElement('input');
    numberInput.value = seat.number || seat.name.replace(/[^0-9]/g, '');
    numberInput.className = 'seat-edit';
    numberInput.style.cssText = 'font-size: 1rem; width: 60px;';
    numberInput.placeholder = '番号';
    
    const unitSelect = document.createElement('select');
    unitSelect.className = 'seat-edit';
    unitSelect.style.cssText = 'font-size: 1rem; width: 120px; padding: 0.3rem;';
    
    // 動的に単位リストを更新
    updateUnitDropdown(unitSelect, seat.unit || '番ユニット');
    
    const updateInputs = () => {
      const number = numberInput.value.trim();
      const unit = unitSelect.value;
      if (number && unit && unit !== '__custom__') {
        socket.emit('admin:editSeat', { id: seat.id, number, unit });
      }
    };
    
    numberInput.onchange = updateInputs;
    unitSelect.onchange = updateInputs;
    
    const delBtn = document.createElement('button');
    delBtn.textContent = '削除';
    delBtn.className = 'btn btn-danger';
    delBtn.onclick = () => {
      if (confirm('本当に削除しますか？')) socket.emit('admin:removeSeat', seat.id);
    };
    
    div.appendChild(numberInput);
    div.appendChild(unitSelect);
    div.appendChild(delBtn);
    seatList.appendChild(div);
  });
  
  // 座席選択ドロップダウンを更新
  setSeatSelect.innerHTML = '';
  seats.forEach(seat => {
    const option = document.createElement('option');
    option.value = seat.id;
    option.textContent = seat.name;
    setSeatSelect.appendChild(option);
  });

  // 発券中番号リスト（優先度付き表示）
  ticketList.innerHTML = '';
  if (tickets.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.textContent = '現在発券中の番号はありません';
    emptyMsg.className = 'empty-message';
    ticketList.appendChild(emptyMsg);
  } else {
    // 優先度順にソート
    const sortedTickets = [...tickets].sort((a, b) => {
      const priorityOrder = { urgent: 0, appointment: 1, normal: 2 };
      return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
    });
    
    sortedTickets.forEach(ticket => {
      const div = document.createElement('div');
      div.className = 'number-item';
      div.style.cssText = getPriorityStyle(ticket.priority);
      
      const priorityLabel = getPriorityLabel(ticket.priority);
      const waitTimeInfo = ticket.estimatedWaitTime ? `予想: ${ticket.estimatedWaitTime}分` : '';
      
      div.innerHTML = `
        <div style="font-size:1.5rem;font-weight:bold;">${ticket.number}</div>
        <div style="font-size:0.9rem;color:#888;">${ticket.time}</div>
        <div style="font-size:0.8rem;font-weight:bold;color:#1565c0;">${priorityLabel}</div>
        <div style="font-size:0.8rem;color:#666;">${waitTimeInfo}</div>
      `;
      ticketList.appendChild(div);
    });
  }

  // 発券履歴リスト
  issuedHistoryList.innerHTML = '';
  issuedHistory.forEach(ticket => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const priorityLabel = getPriorityLabel(ticket.priority);
    if (ticket.skipped) {
      div.style.cssText += 'background: #fff3e0; border-left: 4px solid #ff9800;';
    }
    const skippedInfo = ticket.skipped
      ? `<div style="font-size:0.85rem;color:#e65100;font-weight:bold;">⚠️ スキップ${ticket.skipTime ? ` (${ticket.skipTime})` : ''}</div>`
      : '';
    div.innerHTML = `
      <div style="font-size:1.2rem;font-weight:bold;">${ticket.number}</div>
      <div style="font-size:0.9rem;color:#888;">${ticket.time}</div>
      <div style="font-size:0.8rem;color:#1565c0;">${priorityLabel}</div>
      ${skippedInfo}
    `;
    issuedHistoryList.appendChild(div);
  });

  // 呼び出し履歴リスト
  historyList.innerHTML = '';
  
  // 表示用の履歴リストを作成（サーバーから受信した履歴をそのまま使用）
  let displayHistory = [...calledHistory];
  
  // 現在の呼び出しが履歴に既に含まれているかチェック
  let currentCallInHistory = false;
  if (currentCall && currentCall.number) {
    currentCallInHistory = calledHistory.some(item => 
      item.number === currentCall.number && 
      item.seat && currentCall.seat && 
      item.seat.name === currentCall.seat.name &&
      !item.cancelled
    );
    
    // 履歴に含まれていない場合のみ、現在の呼び出しを最上部に追加
    if (!currentCallInHistory) {
      displayHistory.unshift({
        number: currentCall.number,
        seat: currentCall.seat,
        time: currentCall.time,
        actualWaitTime: null, // 診察中なので待ち時間は未確定
        isCurrentCall: true, // 現在呼び出し中のマーク
        priority: 'current' // 現在呼び出し中を示す特別な優先度
      });
    }
  }
  
  if (displayHistory.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.textContent = '呼び出し履歴はありません';
    emptyMsg.style.padding = '1rem';
    emptyMsg.style.color = '#666';
    historyList.appendChild(emptyMsg);
  } else {
    displayHistory.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'history-item';
      
      // 現在呼び出し中の項目のスタイル
      if (item.isCurrentCall || (currentCall && currentCall.number === item.number && !item.cancelled)) {
        div.style.cssText += 'border: 2px solid #4caf50; background: #e8f5e8;';
      }
      // キャンセル済みの場合のスタイル
      else if (item.cancelled) {
        div.style.cssText += 'opacity: 0.6; background: #f5f5f5; border-left: 4px solid #ff5722;';
      }
      
      const waitTimeInfo = item.actualWaitTime ? `実際: ${item.actualWaitTime}分` : 
                          (item.isCurrentCall || (currentCall && currentCall.number === item.number && !item.cancelled) ? '診察中' : '');
      const cancelInfo = item.cancelled ? `<div style="font-size:0.8rem;color:#ff5722;font-weight:bold;">❌ キャンセル済み (${item.cancelTime})</div>` : '';
      const currentCallInfo = (item.isCurrentCall || (currentCall && currentCall.number === item.number && !item.cancelled)) ? 
                             `<div style="font-size:0.8rem;color:#4caf50;font-weight:bold;">🔥 現在呼び出し中</div>` : '';
      
      div.innerHTML = `
        <div style="font-size:1.2rem;font-weight:bold;">${item.number}</div>
        <div style="font-size:0.9rem;color:#888;">${item.time}</div>
        <div style="font-size:0.9rem;color:#1565c0;">${item.seat ? item.seat.name : ''}</div>
        <div style="font-size:0.8rem;color:#666;">${waitTimeInfo}</div>
        ${cancelInfo}
        ${currentCallInfo}
      `;
      
      // キャンセルボタン（キャンセル済みでない場合のみ表示）
      if (!item.cancelled) {
        const isCurrentlyActive = item.isCurrentCall || (currentCall && currentCall.number === item.number);
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = isCurrentlyActive ? '取り消し' : 'キャンセル';
        cancelBtn.className = 'btn btn-danger';
        cancelBtn.style.cssText = 'margin-top: 0.5rem; font-size: 0.8rem; padding: 0.3rem 0.6rem;';
        cancelBtn.onclick = () => {
          const confirmMessage = isCurrentlyActive 
            ? `現在呼び出し中の番号${item.number}（${item.seat ? item.seat.name : ''}）を取り消しますか？`
            : `番号${item.number}（${item.seat ? item.seat.name : ''}）の呼び出しをキャンセルしますか？`;
          
          if (confirm(confirmMessage)) {
            if (isCurrentlyActive) {
              // 現在の呼び出しのキャンセル
              socket.emit('cancelCall');
            } else {
              // 履歴からのキャンセル（現在の呼び出しが含まれているかどうかでインデックスを調整）
              const historyIndex = currentCallInHistory ? index : index - 1;
              socket.emit('cancelHistoryCall', { 
                number: item.number, 
                seatId: item.seat ? item.seat.id : null,
                historyIndex: Math.max(0, historyIndex)
              });
            }
          }
        };
        div.appendChild(cancelBtn);
      }
      
      historyList.appendChild(div);
    });
  }

  // 現在の呼び出し番号
  currentNumber.textContent = currentCall && currentCall.number
    ? `${currentCall.number}（${currentCall.seat ? currentCall.seat.name : ''}）`
    : '---';

  // 待ち時間設定
  waitMinutesInput.value = waitMinutesPerPerson;

  if (toggleEstimatedWait && toggleEstimatedWait.checked !== showEstimatedWaitTime) {
    toggleEstimatedWait.checked = showEstimatedWaitTime;
  }

  if (togglePersonalStatus && togglePersonalStatus.checked !== showPersonalStatus) {
    togglePersonalStatus.checked = showPersonalStatus;
  }

  console.log('admin update', tickets, issuedHistory);
}

function updateStatistics() {
  document.getElementById('total-waiting').textContent = tickets.length;
  document.getElementById('avg-wait-time').textContent = Math.round(statistics.averageWaitTime || 5);
  document.getElementById('avg-session-time').textContent = Math.round(statistics.averageSessionTime || 10);
  
  // 本日の発券数（発券履歴から当日分を計算）
  const today = currentDate;
  const todayTickets = issuedHistory.filter(ticket => ticket.date === today);
  document.getElementById('daily-tickets').textContent = todayTickets.length;
  
  // 利用可能座席数
  const availableSeats = seats.filter(seat => seat.status === 'available').length;
  document.getElementById('available-seats').textContent = availableSeats;
}

function updateNetworkInfo() {
  const networkInfoElement = document.getElementById('networkInfo');
  if (!networkInfoElement) return;
  
  if (!networkInfo || networkInfo.length === 0) {
    networkInfoElement.innerHTML = '<div style="color: #666; font-size: 0.9rem;">ネットワーク情報が取得できませんでした</div>';
    return;
  }
  
  // 最初の1つのIPアドレスのみを使用
  const networkInfoToUse = [networkInfo[0]];
  
  let html = '<div style="margin-bottom: 1rem;">';
  html += '<div style="font-weight: bold; margin-bottom: 0.5rem; color: #1565c0;">同一LAN内からアクセス可能なURL:</div>';
  
  networkInfoToUse.forEach((info, index) => {
    const baseUrl = info.url;
    html += `<div style="margin-bottom: 1rem; padding: 1rem; background: white; border-radius: 5px; border: 1px solid #ddd;">`;
    html += `<div style="font-weight: bold; margin-bottom: 0.8rem; color: #333; font-size: 1.1rem;">📡 ${info.address} <span style="font-size: 0.85rem; font-weight: normal; color: #666;">(${info.interface})</span></div>`;
    html += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 0.8rem; font-size: 0.95rem;">`;
    
    // 各画面のURLを表示（クリックでコピー可能 + QRコード）
    const pages = [
      { name: '管理画面', path: 'admin.html' },
      { name: '受付画面', path: 'index.html' },
      { name: 'スタッフ画面', path: 'staff.html' },
      { name: '待合室表示', path: 'display.html' }
    ];
    
    pages.forEach((page, pageIndex) => {
      const url = `${baseUrl}/${page.path}`;
      const qrId = `qr-${index}-${pageIndex}`;
      
      html += `<div style="padding: 0.8rem; background: #f5f5f5; border-radius: 4px; display: flex; flex-direction: column; gap: 0.5rem;">`;
      html += `<div style="font-weight: bold; margin-bottom: 0.2rem; color: #333;">${page.name}:</div>`;
      html += `<div style="color: #1976d2; font-family: monospace; font-size: 0.85rem; word-break: break-all; margin-bottom: 0.5rem;">${url}</div>`;
      html += `<div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">`;
      html += `<button onclick="navigator.clipboard.writeText('${url}').then(() => alert('URLをコピーしました: ${url}')).catch(() => prompt('URLをコピーしてください:', '${url}'))" style="padding: 0.3rem 0.6rem; background: #1976d2; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.8rem;">コピー</button>`;
      html += `<div id="${qrId}" style="display: inline-block; padding: 0.5rem; background: white; border-radius: 4px; border: 1px solid #ddd;"></div>`;
      html += `</div>`;
      html += `</div>`;
    });
    
    html += `</div>`;
    html += `</div>`;
  });
  
  html += '</div>';
  html += '<div style="font-size: 0.85rem; color: #666; margin-top: 0.5rem; padding: 0.5rem; background: #fff3cd; border-radius: 4px; border-left: 3px solid #ffc107;">';
  html += '⚠️ これらのURLは同じネットワーク（LAN）内の他の端末からアクセスできます。証明書警告が表示される場合は「詳細設定」→「アクセスする」をクリックしてください。';
  html += '</div>';
  
  networkInfoElement.innerHTML = html;
  
  // DOMが更新されるのを待ってからQRコードを生成
  setTimeout(() => {
    generateQRCodes(networkInfoToUse);
  }, 100);
}

// QRコード生成関数（qrcode-generatorライブラリ用）
function generateQRCodes(networkInfo) {
  // qrcode-generatorライブラリが読み込まれているか確認
  if (typeof qrcode === 'undefined') {
    console.warn('⚠️ qrcode ライブラリが読み込まれていません。リトライします...');
    // ライブラリが読み込まれていない場合、リトライ
    setTimeout(() => {
      if (typeof qrcode !== 'undefined') {
        console.log('✅ qrcode ライブラリが読み込まれました。QRコードを生成します。');
        generateQRCodes(networkInfo);
      } else {
        console.error('❌ qrcode ライブラリの読み込みに失敗しました。');
        // エラーメッセージを表示
        const networkInfoElement = document.getElementById('networkInfo');
        if (networkInfoElement) {
          const errorDiv = document.createElement('div');
          errorDiv.style.cssText = 'color: #f44336; padding: 1rem; background: #ffebee; border-radius: 4px; margin-top: 1rem;';
          errorDiv.textContent = '⚠️ QRコードライブラリの読み込みに失敗しました。ページをリロードしてください。';
          networkInfoElement.appendChild(errorDiv);
        }
      }
    }, 500);
    return;
  }
  
  console.log('🔵 QRコードを生成中...', 'networkInfo件数:', networkInfo.length);
  
  networkInfo.forEach((info, index) => {
    const baseUrl = info.url;
    const pages = [
      { name: '管理画面', path: 'admin.html' },
      { name: '受付画面', path: 'index.html' },
      { name: 'スタッフ画面', path: 'staff.html' },
      { name: '待合室表示', path: 'display.html' }
    ];
    
    pages.forEach((page, pageIndex) => {
      const url = `${baseUrl}/${page.path}`;
      const qrId = `qr-${index}-${pageIndex}`;
      const qrElement = document.getElementById(qrId);
      
      if (!qrElement) {
        console.warn(`QRコード要素が見つかりません: ${qrId}`);
        return;
      }
      
      // QRコードをクリア
      qrElement.innerHTML = '';
      
      try {
        // qrcode-generatorを使用してQRコードを生成
        // typeNumber: 0 = 自動, errorCorrectionLevel: 'L' = 7%
        const qr = qrcode(0, 'L');
        qr.addData(url);
        qr.make();
        
        // DataURLを生成（cellSize: 3, margin: 2）
        const dataUrl = qr.createDataURL(3, 2);
        
        // 画像要素を作成
        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.cssText = 'display: block; cursor: pointer; border: 1px solid #ddd; border-radius: 4px; width: 100px; height: 100px;';
        img.title = 'クリックで拡大表示';
        img.alt = `${page.name}のQRコード`;
        
        // クリックでQRコードを大きく表示
        img.onclick = () => {
          showQRModal(page.name, url);
        };
        
        qrElement.appendChild(img);
        console.log(`✅ QRコード生成成功: ${page.name} (${url})`);
        
      } catch (error) {
        console.error(`❌ QRコード生成エラー (${url}):`, error);
        qrElement.innerHTML = '<span style="font-size: 0.7rem; color: #999;">QR生成失敗</span>';
      }
    });
  });
}

// QRコードモーダル表示関数
function showQRModal(pageName, url) {
  // モーダルでQRコードを大きく表示
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    cursor: pointer;
  `;
  
  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: white;
    padding: 2rem;
    border-radius: 10px;
    text-align: center;
    position: relative;
    max-width: 90%;
  `;
  
  const title = document.createElement('div');
  title.textContent = pageName;
  title.style.cssText = 'font-weight: bold; font-size: 1.5rem; margin-bottom: 1rem; color: #333;';
  
  const urlText = document.createElement('div');
  urlText.textContent = url;
  urlText.style.cssText = 'font-family: monospace; font-size: 1rem; color: #666; margin-bottom: 1rem; word-break: break-all;';
  
  try {
    // 大きなQRコードを生成
    const qr = qrcode(0, 'L');
    qr.addData(url);
    qr.make();
    
    // 大きなDataURLを生成（cellSize: 10, margin: 4）
    const largeDataUrl = qr.createDataURL(10, 4);
    
    const largeImg = document.createElement('img');
    largeImg.src = largeDataUrl;
    largeImg.style.cssText = 'display: block; margin: 0 auto; max-width: 100%;';
    largeImg.alt = `${pageName}のQRコード（拡大）`;
    
    modalContent.appendChild(title);
    modalContent.appendChild(urlText);
    modalContent.appendChild(largeImg);
    
    // 閉じるボタン
    const closeBtn = document.createElement('div');
    closeBtn.textContent = 'クリックで閉じる';
    closeBtn.style.cssText = 'margin-top: 1rem; color: #666; font-size: 0.9rem;';
    modalContent.appendChild(closeBtn);
    
  } catch (error) {
    console.error('大きなQRコード生成エラー:', error);
    const errorMsg = document.createElement('div');
    errorMsg.textContent = 'QRコードの生成に失敗しました';
    errorMsg.style.cssText = 'color: #f44336; margin-top: 1rem;';
    modalContent.appendChild(title);
    modalContent.appendChild(urlText);
    modalContent.appendChild(errorMsg);
  }
  
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
  
  // クリックで閉じる
  modal.onclick = () => {
    document.body.removeChild(modal);
  };
}

function updateSeatStatusGrid() {
  const grid = document.getElementById('seatStatusGrid');
  if (!grid) return;
  
  grid.innerHTML = '';
  
  if (seats.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.textContent = '座席が登録されていません';
    emptyMsg.style.cssText = 'grid-column: 1 / -1; text-align: center; color: #666; padding: 2rem;';
    grid.appendChild(emptyMsg);
    return;
  }
  
  seats.forEach(seat => {
    const seatDiv = document.createElement('div');
    seatDiv.className = `seat-status-item ${seat.status === 'busy' ? 'seat-busy' : 'seat-available'}`;
    
    const statusText = seat.status === 'busy' ? '使用中' : '空席';
    const patientInfo = seat.currentPatient ? `患者: ${seat.currentPatient}番` : '';
    const sessionTime = seat.sessionStartTime 
      ? `経過: ${Math.round((new Date() - new Date(seat.sessionStartTime)) / (1000 * 60))}分`
      : '';
    
    seatDiv.innerHTML = `
      <div style="font-size: 1.1rem; margin-bottom: 0.5rem;">${seat.name}</div>
      <div style="font-size: 0.9rem;">${statusText}</div>
      ${patientInfo ? `<div style="font-size: 0.8rem; margin-top: 0.3rem;">${patientInfo}</div>` : ''}
      ${sessionTime ? `<div style="font-size: 0.8rem; color: #666;">${sessionTime}</div>` : ''}
    `;
    
    grid.appendChild(seatDiv);
  });
}

function getPriorityStyle(priority) {
  switch (priority) {
    case 'urgent':
      return 'border: 2px solid #f44336; background: #ffebee; padding: 1rem; border-radius: 5px;';
    case 'appointment':
      return 'border: 2px solid #ff9800; background: #fff3e0; padding: 1rem; border-radius: 5px;';
    default:
      return 'border: 1px solid #ddd; background: #f8f9fa; padding: 1rem; border-radius: 5px;';
  }
}

function getPriorityLabel(priority) {
  switch (priority) {
    case 'urgent': return '🚨 緊急';
    case 'appointment': return '📅 予約';
    case 'manual': return '🔧 手動設定';
    default: return '👤 一般';
  }
}

socket.on('init', (data) => {
  seats = data.seats || [];
  tickets = data.tickets || [];
  issuedHistory = data.issuedHistory || [];
  calledHistory = data.calledHistory || [];
  currentCall = data.currentCall;
  waitMinutesPerPerson = data.waitMinutesPerPerson || 5;
  statistics = data.statistics || { averageWaitTime: 5, averageSessionTime: 10 };
  currentDate = data.currentDate || '';
  networkInfo = data.networkInfo || [];
  showEstimatedWaitTime = data.showEstimatedWaitTime !== undefined ? data.showEstimatedWaitTime : false;
  showPersonalStatus = data.showPersonalStatus !== undefined ? data.showPersonalStatus : false;
  
  // 音声設定を受信（サーバーの設定で上書き）
  if (data.voiceSettings) {
    console.log('📥 サーバーから音声設定を受信:', data.voiceSettings);
    
    // currentVoiceSettingsを更新
    currentVoiceSettings = {
      ...defaultVoiceSettings,
      ...data.voiceSettings
    };
    
    // UIに反映
    updateVoiceSettingsUI();
  }
  
  // 初期化時に単位ドロップダウンを更新
  if (newSeatUnit) {
    updateUnitDropdown(newSeatUnit);
  }
  
  updateDisplay();
});

socket.on('update', (data) => {
  seats = data.seats || [];
  tickets = data.tickets || [];
  issuedHistory = data.issuedHistory || [];
  calledHistory = data.calledHistory || [];
  currentCall = data.currentCall;
  waitMinutesPerPerson = data.waitMinutesPerPerson || 5;
  statistics = data.statistics || { averageWaitTime: 5, averageSessionTime: 10 };
  currentDate = data.currentDate || '';
  networkInfo = data.networkInfo || [];
  showEstimatedWaitTime = data.showEstimatedWaitTime !== undefined ? data.showEstimatedWaitTime : false;
  showPersonalStatus = data.showPersonalStatus !== undefined ? data.showPersonalStatus : false;
  updateDisplay();
});

// キャンセル成功通知を受信
socket.on('cancelSuccess', (data) => {
  // キャンセル成功メッセージを一時的に表示
  const cancelMsg = document.createElement('div');
  cancelMsg.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff5722;
    color: white;
    padding: 1rem 2rem;
    border-radius: 5px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    z-index: 1000;
    font-size: 1.1rem;
  `;
  cancelMsg.textContent = `❌ ${data.message}`;
  document.body.appendChild(cancelMsg);
  
  // 3秒後に自動削除
  setTimeout(() => {
    if (cancelMsg.parentNode) {
      cancelMsg.parentNode.removeChild(cancelMsg);
    }
  }, 3000);
});

// 座席追加
addSeatBtn.onclick = () => {
  const number = newSeatNumber.value.trim();
  let unit = newSeatUnit.value;
  
  if (!number) {
    alert('番号を入力してください');
    return;
  }
  
  // カスタム入力の場合
  if (unit === '__custom__') {
    const customUnit = customSeatUnit.value.trim();
    if (!customUnit) {
      alert('カスタム単位を入力してください');
      customSeatUnit.focus();
      return;
    }
    unit = customUnit;
    
    // カスタム単位をリストに追加（重複チェック）
    const allUnits = getAllUnits();
    if (!allUnits.includes(unit)) {
      customUnits.push(unit);
      saveCustomUnits();
      updateUnitDropdown(newSeatUnit, unit);
    }
  }
  
  socket.emit('admin:addSeat', { number, unit });
  newSeatNumber.value = '';
  customSeatUnit.value = '';
  customSeatUnit.style.display = 'none';
  updateUnitDropdown(newSeatUnit, '番ユニット'); // 番ユニットに戻す
};

// 待ち時間設定
setWaitMinutesBtn.onclick = () => {
  const minutes = parseInt(waitMinutesInput.value);
  if (isNaN(minutes) || minutes <= 0) {
    alert('有効な数値を入力してください');
    return;
  }
  socket.emit('admin:setWaitMinutes', minutes);
};

if (toggleEstimatedWait) {
  toggleEstimatedWait.onchange = () => {
    socket.emit('admin:setEstimatedWaitVisibility', toggleEstimatedWait.checked);
  };
}

if (togglePersonalStatus) {
  togglePersonalStatus.onchange = () => {
    socket.emit('admin:setPersonalStatusVisibility', togglePersonalStatus.checked);
  };
}

// 発券中番号をクリア
clearTickets.onclick = () => {
  if (confirm('現在発券中の番号をすべて削除しますか？')) {
    socket.emit('admin:clearTickets');
  }
};

// 発券履歴をクリア
clearIssuedHistory.onclick = () => {
  if (confirm('発券履歴をすべて削除しますか？')) {
    socket.emit('admin:clearIssuedHistory');
  }
};

// 呼び出し履歴をクリア
clearHistory.onclick = () => {
  if (confirm('呼び出し履歴をすべて削除しますか？')) {
    socket.emit('admin:clearHistory');
  }
};

// 呼び出し番号を設定
setNumberBtn.onclick = () => {
  const number = parseInt(setNumberInput.value);
  const seatId = setSeatSelect.value;
  if (isNaN(number) || !seatId) {
    alert('番号と座席を正しく入力・選択してください');
    return;
  }
  socket.emit('admin:setCurrentNumber', { number, seatId });
};

// リセット
resetAll.onclick = () => {
  if (confirm('サーバー全体をリセットしますか？すべてのデータが削除されます')) {
    socket.emit('reset');
  }
};