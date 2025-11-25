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

  // デバッグ情報を記録（パネルは自動表示しない）
  function showDebug(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.textContent = `${timestamp}: ${message}`;
    debugInfo.appendChild(logEntry);
    
    // スクロールを最新に（表示されている場合のみ）
    if (debugPanel.style.display === 'block') {
      debugInfo.scrollTop = debugInfo.scrollHeight;
    }
    
    // デバッグパネルは自動表示しない（Ctrl+Shift+Dで手動表示可能）
    // debugPanel.style.display = 'block';
    
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
    
    // 座席を横並びで表示
    const seatGrid = document.createElement('div');
    seatGrid.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap; align-items:center;';
    
    seats.forEach(seat => {
      const seatDiv = document.createElement('div');
      seatDiv.style.cssText = `
        display:flex; align-items:center; gap:10px; padding:10px 16px; border-radius:0.5rem; font-size:1rem; font-weight:500;
        background:#fff; border:1px solid rgba(0,0,0,0.05); box-shadow:0 2px 5px rgba(0,0,0,0.05);
        ${seat.status === 'busy' ? 'border-left:4px solid #dc3545;' : 'border-left:4px solid #28a745;'}
      `;
      
      const patient = seat.currentPatient ? ` (${seat.currentPatient}番)` : '';
      seatDiv.innerHTML = `<span style="color:#2c80b9; font-weight:600;">${seat.name}</span><span style="color:#666;">${patient}</span>`;
      
      if (seat.status === 'busy') {
        const btn = document.createElement('button');
        btn.innerHTML = '完了';
        btn.style.cssText = 'min-height:44px; padding:8px 16px; font-size:1rem; font-weight:500; border-radius:0.5rem; border:none; background:#28a745; color:white; cursor:pointer;';
        btn.onclick = () => socket.emit('completeSession', { seatId: seat.id });
        seatDiv.appendChild(btn);
      } else {
        const statusSpan = document.createElement('span');
        statusSpan.style.cssText = 'color:#28a745; font-size:0.9rem;';
        statusSpan.textContent = '空席';
        seatDiv.appendChild(statusSpan);
      }
      
      seatGrid.appendChild(seatDiv);
    });
    
    seatStatusContainer.appendChild(seatGrid);

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
        const div = document.createElement('div');
        div.className = 'number-item';
        div.style.cssText = `display:flex; flex-direction:column; gap:10px; padding:14px; border-radius:0.5rem; box-shadow:0 2px 5px rgba(0,0,0,0.05); ${getPriorityStyle(ticket.priority)}`;

        const priorityLabel = getPriorityLabel(ticket.priority);
        
        // 番号と情報
        const header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
        header.innerHTML = `
          <span style="font-size:2rem; font-weight:bold; color:#2c80b9;">${ticket.number}</span>
          <span style="font-size:0.85rem; color:#888;">${priorityLabel}</span>
        `;
        div.appendChild(header);

        // 座席選択（スキップオプション含む）
        const seatSelect = document.createElement('select');
        seatSelect.style.cssText = 'width:100%;';
        
        const availableSeats = seats.filter(seat => seat.status === 'available');
        
        // 座席オプション
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
          opt.textContent = '座席なし';
          seatSelect.appendChild(opt);
        }
        
        // スキップオプションを追加
        const skipOpt = document.createElement('option');
        skipOpt.value = '__skip__';
        skipOpt.textContent = '── スキップ ──';
        skipOpt.style.color = '#888';
        seatSelect.appendChild(skipOpt);
        
        div.appendChild(seatSelect);

        // 実行ボタン
        const actionBtn = document.createElement('button');
        actionBtn.innerHTML = '呼出';
        actionBtn.style.cssText = 'width:100%; min-height:52px; font-size:1.1rem; font-weight:500; border-radius:0.5rem; border:none; background:#4ca3d8; color:white; cursor:pointer;';
        
        // 選択変更時にボタンを更新
        seatSelect.onchange = () => {
          if (seatSelect.value === '__skip__') {
            actionBtn.innerHTML = 'スキップ';
            actionBtn.style.background = '#ffc107';
            actionBtn.style.color = '#333';
          } else {
            actionBtn.innerHTML = '呼出';
            actionBtn.style.background = seatSelect.value ? '#4ca3d8' : '#ccc';
            actionBtn.style.color = 'white';
          }
        };
        
        actionBtn.onclick = () => {
          if (seatSelect.value === '__skip__') {
            if (confirm(`${ticket.number}番をスキップしますか？`)) {
              socket.emit('skipTicket', { number: ticket.number });
            }
          } else if (seatSelect.value) {
            socket.emit('callNumber', { number: ticket.number, seatId: seatSelect.value });
          } else {
            alert('座席を選択してください');
          }
        };

        div.appendChild(actionBtn);
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
      
      const isActive = item.isCurrentCall || (currentCall && currentCall.number === item.number && !item.cancelled);
      
      // display.htmlと同じスタイル
      div.style.cssText = `
        display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 14px; border-radius:0.5rem;
        background:#fff; box-shadow:0 2px 5px rgba(0,0,0,0.05); border:1px solid rgba(0,0,0,0.05);
        ${isActive ? 'border-color:#ffc107; background:#fff3cd;' : 
          item.cancelled ? 'opacity:0.5;' : ''}
      `;
      
      // 左: 番号と情報
      const info = document.createElement('div');
      info.style.cssText = 'display:flex; align-items:center; gap:14px;';
      
      const numSpan = document.createElement('span');
      numSpan.style.cssText = 'font-size:1.8rem; font-weight:bold; color:#2c80b9; min-width:44px;';
      numSpan.textContent = item.number;
      info.appendChild(numSpan);
      
      const detail = document.createElement('div');
      detail.style.cssText = 'font-size:0.95rem; color:#666; line-height:1.4;';
      const seatName = item.seat ? item.seat.name : '';
      const status = isActive ? '<span style="color:#28a745;font-weight:500;">呼出中</span>' : 
                     item.cancelled ? '<span style="color:#dc3545;">取消済</span>' : 
                     (item.actualWaitTime ? `${item.actualWaitTime}分` : '');
      detail.innerHTML = `${seatName}<br>${status}`;
      info.appendChild(detail);
      
      div.appendChild(info);
      
      // 右: キャンセルボタン
      if (!item.cancelled) {
        const cancelBtn = document.createElement('button');
        cancelBtn.innerHTML = '取消';
        cancelBtn.style.cssText = 'min-height:48px; padding:10px 18px; font-size:1rem; font-weight:500; border-radius:0.5rem; border:none; background:#dc3545; color:white; cursor:pointer;';
        cancelBtn.onclick = () => {
          if (confirm(`${item.number}番を取り消しますか？`)) {
            if (isActive) {
              socket.emit('cancelCall');
            } else {
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
    container.className = 'section';
    container.style.cssText = 'grid-column:1/3; grid-row:1; display:flex; align-items:center; gap:14px; padding:10px 14px;';
    
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.insertBefore(container, mainContent.firstChild);
    }
    
    return container;
  }

  function getPriorityStyle(priority) {
    // display.htmlと同じ色を使用
    switch (priority) {
      case 'urgent':
        return 'border-left:5px solid #dc3545; background:#fff;';
      case 'appointment':
        return 'border-left:5px solid #ffc107; background:#fff;';
      default:
        return 'border-left:5px solid #28a745; background:#fff;';
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

  // 欠番処理の結果
  socket.on('skipSuccess', ({ number }) => {
    showDebug(`スキップ: ${number}`);
    const msg = document.createElement('div');
    msg.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ff9800;
      color: white;
      padding: 1rem 2rem;
      border-radius: 5px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 1000;
      font-size: 1.1rem;
    `;
    msg.textContent = `⏭️ 番号${number}をスキップしました`;
    document.body.appendChild(msg);
    setTimeout(() => {
      if (msg.parentNode) {
        msg.parentNode.removeChild(msg);
      }
    }, 3000);
  });

  socket.on('skipFailed', (data = {}) => {
    alert(data.message || 'スキップ処理に失敗しました。');
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