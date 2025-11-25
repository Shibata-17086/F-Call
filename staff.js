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

document.addEventListener('DOMContentLoaded', () => {
  // パルス効果のCSSを追加
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); }
      70% { box-shadow: 0 0 0 10px rgba(76, 175, 80, 0); }
      100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
    }
  `;
  document.head.appendChild(style);

  const currentNumberElement = document.getElementById('currentNumber');
  const ticketList = document.getElementById('ticketList');
  const historyList = document.getElementById('historyList');
  const resetAllBtn = document.getElementById('resetAll');
  const currentCallDisplay = document.getElementById('currentCallDisplay');
  const debugPanel = document.getElementById('debugPanel');
  const debugInfo = document.getElementById('debugInfo');

  let tickets = [];
  let calledHistory = [];
  let currentCall = null;
  let seats = [];
  let showEstimatedWaitTime = false;  // 初期値: 表示しない

  // デバッグ情報を表示
  function showDebug(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.textContent = `${timestamp}: ${message}`;
    debugInfo.appendChild(logEntry);
    
    // スクロールを最新に
    debugInfo.scrollTop = debugInfo.scrollHeight;
    
    // デバッグパネルを表示
    debugPanel.style.display = 'block';
    
    console.log(message);
  }

  // キーボードショートカット (Ctrl+Shift+D) でデバッグパネルの表示切替
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
    }
  });

  function updateDisplay() {
    console.log(`[DEBUG] updateDisplay開始 - 履歴件数: ${calledHistory.length}, 現在の呼び出し: ${currentCall ? currentCall.number : 'なし'}`);
    showDebug(`スタッフ画面更新: チケット数=${tickets.length}, 座席数=${seats.length}, 履歴件数=${calledHistory.length}`);

    // 現在の呼び出し番号表示
    if (currentNumberElement) {
      currentNumberElement.textContent = currentCall && currentCall.number
        ? `${currentCall.number}（${currentCall.seat ? currentCall.seat.name : ''}）`
        : '---';
    }

    // 座席状態表示を追加
    const seatStatusContainer = document.getElementById('seat-status') || createSeatStatusContainer();
    seatStatusContainer.innerHTML = '<h3>座席状況</h3>';
    
    seats.forEach(seat => {
      const seatDiv = document.createElement('div');
      seatDiv.className = 'seat-status-item';
      seatDiv.style.cssText = `
        display: inline-block;
        margin: 0.5rem;
        padding: 1rem;
        border-radius: 8px;
        min-width: 120px;
        text-align: center;
        font-weight: bold;
        ${seat.status === 'busy' 
          ? 'background: #ffebee; border: 2px solid #f44336; color: #c62828;' 
          : 'background: #e8f5e8; border: 2px solid #4caf50; color: #2e7d32;'
        }
      `;
      
      const statusText = seat.status === 'busy' ? '使用中' : '空席';
      const patientInfo = seat.currentPatient ? `\n患者: ${seat.currentPatient}番` : '';
      
      seatDiv.innerHTML = `
        <div style="font-size: 1.1rem;">${seat.name}</div>
        <div style="font-size: 0.9rem; margin-top: 0.5rem;">${statusText}${patientInfo}</div>
      `;
      
      // 診察完了ボタン（使用中の座席のみ）
      if (seat.status === 'busy') {
        const completeBtn = document.createElement('button');
        completeBtn.textContent = '診察完了';
        completeBtn.className = 'btn primary';
        completeBtn.style.cssText = 'margin-top: 0.5rem; font-size: 0.8rem; padding: 0.3rem 0.8rem;';
        completeBtn.onclick = () => {
          socket.emit('completeSession', { seatId: seat.id });
        };
        seatDiv.appendChild(completeBtn);
      }
      
      seatStatusContainer.appendChild(seatDiv);
    });

    // 発券中リスト
    ticketList.innerHTML = '';
    
    if (tickets.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = '現在発券中の番号はありません';
      emptyMsg.className = 'empty-message';
      ticketList.appendChild(emptyMsg);
    } else if (seats.length === 0) {
      const noSeatsMsg = document.createElement('div');
      noSeatsMsg.textContent = '座席が登録されていません。管理画面で座席を追加してください。';
      noSeatsMsg.className = 'empty-message';
      noSeatsMsg.style.color = 'red';
      ticketList.appendChild(noSeatsMsg);
    } else {
      // 優先度順にソートして表示
      const sortedTickets = [...tickets].sort((a, b) => {
        const priorityOrder = { urgent: 0, appointment: 1, normal: 2 };
        return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
      });

      sortedTickets.forEach((ticket, index) => {
        // 座席選択ドロップダウン＋呼び出しボタン
        const div = document.createElement('div');
        div.className = 'number-item';
        div.style.cssText = `
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 1rem;
          min-width: 200px;
          ${getPriorityStyle(ticket.priority)}
        `;

        const priorityLabel = getPriorityLabel(ticket.priority);
        const waitTimeMarkup = showEstimatedWaitTime && ticket.estimatedWaitTime
          ? `<div style="font-size:0.8rem;color:#666;">予想: ${ticket.estimatedWaitTime}分</div>`
          : '';
        
        const numDiv = document.createElement('div');
        numDiv.innerHTML = `
          <div style="font-size:1.5rem;font-weight:bold;">${ticket.number}</div>
          <div style="font-size:0.9rem;color:#888;">${ticket.time}</div>
          <div style="font-size:0.8rem;font-weight:bold;color:#1565c0;">${priorityLabel}</div>
          ${waitTimeMarkup}
        `;
        numDiv.style.marginBottom = '0.5rem';
        numDiv.style.textAlign = 'center';

        const seatSelect = document.createElement('select');
        seatSelect.style.cssText = 'padding: 0.5rem; width: 100%; margin-bottom: 0.5rem;';
        
        // 利用可能な座席のみ表示
        const availableSeats = seats.filter(seat => seat.status === 'available');
        if (availableSeats.length > 0) {
          availableSeats.forEach(seat => {
            const opt = document.createElement('option');
            opt.value = seat.id;
            opt.textContent = seat.name;
            seatSelect.appendChild(opt);
          });
        } else {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = '-- 利用可能な座席なし --';
          seatSelect.appendChild(opt);
          seatSelect.disabled = true;
        }

        const callBtn = document.createElement('button');
        callBtn.textContent = '呼び出し';
        callBtn.className = 'btn primary';
        callBtn.style.cssText = 'width: 100%; padding: 0.5rem;';
        
        if (availableSeats.length === 0) {
          callBtn.disabled = true;
        }
        
        callBtn.onclick = () => {
          const seatId = seatSelect.value;
          if (!seatId) {
            alert('利用可能な座席がありません');
            return;
          }
          console.log('呼び出し：番号=', ticket.number, '座席ID=', seatId);
          socket.emit('callNumber', { number: ticket.number, seatId });
        };

        div.appendChild(numDiv);
        div.appendChild(seatSelect);
        div.appendChild(callBtn);
        ticketList.appendChild(div);
      });
    }

    // 呼び出し履歴
    historyList.innerHTML = '';
    
    console.log(`[DEBUG] 履歴表示処理開始 - 受信履歴: ${calledHistory.length}件`);
    console.log(`[DEBUG] calledHistory:`, calledHistory);
    console.log(`[DEBUG] currentCall:`, currentCall);
    
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
      
      console.log(`[DEBUG] 現在の呼び出しが履歴に含まれているか: ${currentCallInHistory}`);
      
      // 履歴に含まれていない場合のみ、現在の呼び出しを最上部に追加
      if (!currentCallInHistory) {
        const currentCallItem = {
          number: currentCall.number,
          seat: currentCall.seat,
          time: currentCall.time,
          actualWaitTime: null, // 診察中なので待ち時間は未確定
          isCurrentCall: true, // 現在呼び出し中のマーク
          priority: 'current' // 現在呼び出し中を示す特別な優先度
        };
        displayHistory.unshift(currentCallItem);
        console.log(`[DEBUG] 現在の呼び出しを履歴に追加:`, currentCallItem);
      }
    }
    
    console.log(`[DEBUG] 最終表示履歴: ${displayHistory.length}件`);
    console.log(`[DEBUG] displayHistory:`, displayHistory);
    
    if (displayHistory.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = '呼び出し履歴はありません';
      emptyMsg.style.padding = '1rem';
      emptyMsg.style.color = '#666';
      historyList.appendChild(emptyMsg);
      return;
    }
    
    displayHistory.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'history-item';
      
      // 現在呼び出し中の項目のスタイル
      if (item.isCurrentCall || (currentCall && currentCall.number === item.number && !item.cancelled)) {
        div.style.cssText += 'border: 2px solid #4caf50; background: #e8f5e8; animation: pulse 2s infinite;';
      }
      // キャンセル済みの場合のスタイル
      else if (item.cancelled) {
        div.style.cssText += 'opacity: 0.6; background: #f5f5f5; border-left: 4px solid #ff5722;';
      }
      
      const waitTimeInfo = item.actualWaitTime ? `実際の待ち時間: ${item.actualWaitTime}分` : 
                          (item.isCurrentCall || (currentCall && currentCall.number === item.number && !item.cancelled) ? '診察中' : '');
      const cancelInfo = item.cancelled ? `<div style="font-size:0.8rem;color:#ff5722;font-weight:bold;">❌ キャンセル済み (${item.cancelTime})</div>` : '';
      const currentCallInfo = (item.isCurrentCall || (currentCall && currentCall.number === item.number && !item.cancelled)) ? 
                             `<div style="font-size:0.8rem;color:#4caf50;font-weight:bold;">🔥 現在呼び出し中</div>` : '';
      
      div.innerHTML = `
        <div style="font-size:1.2rem;font-weight:bold;">${item.number}</div>
        <div style="font-size:0.9rem;color:#888;">${item.time ? item.time : ''}</div>
        <div style="font-size:0.9rem;color:#1565c0;">${item.seat ? item.seat.name : ''}</div>
        <div style="font-size:0.8rem;color:#666;">${waitTimeInfo}</div>
        ${cancelInfo}
        ${currentCallInfo}
      `;
      
      // キャンセルボタン（キャンセル済みでない場合のみ表示）
      if (!item.cancelled) {
        const isCurrentlyActive = item.isCurrentCall || (currentCall && currentCall.number === item.number);
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = isCurrentlyActive ? '呼び出し取り消し' : '呼び出しキャンセル';
        cancelBtn.className = 'btn danger';
        cancelBtn.style.marginTop = '0.5rem';
        cancelBtn.onclick = () => {
          const confirmMessage = isCurrentlyActive 
            ? `現在呼び出し中の番号${item.number}（${item.seat ? item.seat.name : ''}）を取り消しますか？\n\n※ 座席は空席に戻りますが、患者は待ち列には戻りません。`
            : `番号${item.number}（${item.seat ? item.seat.name : ''}）の呼び出しをキャンセルしますか？\n\n※ 座席は空席に戻りますが、患者は待ち列には戻りません。`;
          
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

  function createSeatStatusContainer() {
    const container = document.createElement('div');
    container.id = 'seat-status';
    container.style.cssText = `
      background: white;
      padding: 1.5rem;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      margin-bottom: 2rem;
    `;
    
    // スタッフ画面の最初のセクションの前に挿入
    const firstSection = document.querySelector('.section');
    if (firstSection) {
      firstSection.parentNode.insertBefore(container, firstSection);
    }
    
    return container;
  }

  function getPriorityStyle(priority) {
    switch (priority) {
      case 'urgent':
        return 'border: 2px solid #f44336; background: #ffebee;';
      case 'appointment':
        return 'border: 2px solid #ff9800; background: #fff3e0;';
      default:
        return 'border: 1px solid #ddd; background: #f8f9fa;';
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
    console.log('[DEBUG] 初期データ受信:', data);
    console.log(`[DEBUG] 受信データ - 履歴件数: ${data.calledHistory ? data.calledHistory.length : 0}, 現在の呼び出し: ${data.currentCall ? data.currentCall.number : 'なし'}`);
    tickets = data.tickets || [];
    calledHistory = data.calledHistory || [];
    currentCall = data.currentCall;
    seats = data.seats || [];
    showEstimatedWaitTime = data.showEstimatedWaitTime !== undefined ? data.showEstimatedWaitTime : false;
    updateDisplay();
  });

  socket.on('update', (data) => {
    console.log('[DEBUG] 更新データ受信:', data);
    console.log(`[DEBUG] 受信データ - 履歴件数: ${data.calledHistory ? data.calledHistory.length : 0}, 現在の呼び出し: ${data.currentCall ? data.currentCall.number : 'なし'}`);
    tickets = data.tickets || [];
    calledHistory = data.calledHistory || [];
    currentCall = data.currentCall;
    seats = data.seats || [];
    showEstimatedWaitTime = data.showEstimatedWaitTime !== undefined ? data.showEstimatedWaitTime : false;
    updateDisplay();
  });

  // 呼び出し成功通知を受信
  socket.on('callSuccess', (data) => {
    showDebug(`呼び出し成功: 番号${data.number} → ${data.seat} (待ち時間: ${data.actualWaitTime}分, 履歴件数: ${data.historyLength})`);
    
    // 成功メッセージを一時的に表示
    const successMsg = document.createElement('div');
    successMsg.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4caf50;
      color: white;
      padding: 1rem 2rem;
      border-radius: 5px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 1000;
      font-size: 1.1rem;
    `;
    successMsg.textContent = `✅ ${data.number}番を${data.seat}に呼び出しました`;
    document.body.appendChild(successMsg);
    
    // 3秒後に自動削除
    setTimeout(() => {
      if (successMsg.parentNode) {
        successMsg.parentNode.removeChild(successMsg);
      }
    }, 3000);
  });

  // キャンセル成功通知を受信
  socket.on('cancelSuccess', (data) => {
    showDebug(`キャンセル成功: ${data.message}`);
    
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

  resetAllBtn.onclick = () => {
    if (confirm('本当にサーバー全体をリセットしますか？')) {
      socket.emit('reset');
    }
  };

  // 接続チェック
  socket.on('connect', () => {
    console.log('サーバーに接続しました');
  });

  socket.on('connect_error', (err) => {
    console.error('サーバー接続エラー:', err);
    alert('サーバーに接続できません。サーバーが起動しているか確認してください。');
  });

  // 初回表示の更新
  updateDisplay();
});