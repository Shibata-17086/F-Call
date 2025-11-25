// 接続先のURLを動的に決定
const getServerUrl = () => {
  // 本番環境では現在接続しているホストを使用
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
  const ticketNumberDisplay = document.getElementById('ticket-number');
  const waitingCountDisplay = document.getElementById('waiting-count');
  const waitingTimeDisplay = document.getElementById('waiting-time');
  const issueTicketButton = document.getElementById('issue-ticket');
  const prioritySelect = document.getElementById('priority-select');
  const undoTicketButton = document.getElementById('undo-ticket');
  const ticketStatusSection = document.getElementById('ticket-status');
  const estimatedTimeDisplay = document.getElementById('estimated-time');
  const queuePositionDisplay = document.getElementById('queue-position');
  const waitingTimeRow = waitingTimeDisplay ? waitingTimeDisplay.closest('.queue-info') : null;
  const estimatedTimeRow = estimatedTimeDisplay ? estimatedTimeDisplay.closest('.status-item') : null;

  let tickets = [];
  let issuedHistory = [];
  let statistics = { averageWaitTime: 5 };
  let lastIssuedNumber = null;
  let showEstimatedWaitTime = true;
  let showPersonalStatus = true;

  function updateDisplays() {
    waitingCountDisplay.textContent = tickets.length;
    
    // 優先度別の待ち人数を表示
    const normalCount = tickets.filter(t => t.priority === 'normal').length;
    const urgentCount = tickets.filter(t => t.priority === 'urgent').length;
    const appointmentCount = tickets.filter(t => t.priority === 'appointment').length;
    
    let waitingText = `${tickets.length}人`;
    if (urgentCount > 0 || appointmentCount > 0) {
      waitingText += ` (緊急: ${urgentCount}, 予約: ${appointmentCount}, 一般: ${normalCount})`;
    }
    waitingCountDisplay.textContent = waitingText;
    
    // 動的な待ち時間計算
    const selectedPriority = prioritySelect ? prioritySelect.value : 'normal';
    let estimatedWaitTime = 0;
    
    if (tickets.length > 0) {
      if (selectedPriority === 'urgent') {
        // 緊急の場合は最優先
        estimatedWaitTime = Math.max(1, Math.round(statistics.averageWaitTime / 3));
      } else if (selectedPriority === 'appointment') {
        // 予約の場合は緊急患者の後
        estimatedWaitTime = urgentCount * 2 + Math.round(statistics.averageWaitTime / 2);
      } else {
        // 一般の場合は既存の緊急・予約患者の後
        estimatedWaitTime = urgentCount * 2 + appointmentCount * Math.round(statistics.averageWaitTime / 2) + 
                          normalCount * statistics.averageWaitTime;
      }
    }
    
    if (waitingTimeRow) {
      waitingTimeRow.style.display = showEstimatedWaitTime ? 'flex' : 'none';
    }
    waitingTimeDisplay.textContent = showEstimatedWaitTime
      ? `約${estimatedWaitTime}分`
      : '';
    
    // 最新の発券番号を表示
    if (lastIssuedNumber) {
      ticketNumberDisplay.textContent = String(lastIssuedNumber).padStart(3, '0');
    } else if (issuedHistory.length > 0) {
      ticketNumberDisplay.textContent = String(issuedHistory[0].number).padStart(3, '0');
    } else {
      ticketNumberDisplay.textContent = '---';
    }
    
    // 発券したチケットの予想待ち時間と順番を表示
    if (estimatedTimeRow) {
      estimatedTimeRow.style.display = showEstimatedWaitTime ? 'block' : 'none';
    }

    if (ticketStatusSection) {
      if (!showPersonalStatus) {
        ticketStatusSection.style.display = 'none';
      } else if (lastIssuedNumber || issuedHistory.length > 0) {
        ticketStatusSection.style.display = 'block';
      } else {
        ticketStatusSection.style.display = 'none';
      }
    }

    if (lastIssuedNumber && estimatedTimeDisplay && queuePositionDisplay) {
      const myTicket = tickets.find(t => t.number === lastIssuedNumber);
      if (myTicket) {
        estimatedTimeDisplay.textContent = showEstimatedWaitTime && myTicket.estimatedWaitTime !== undefined
          ? `約${myTicket.estimatedWaitTime}分`
          : '';
        const position = tickets.findIndex(t => t.number === lastIssuedNumber) + 1;
        queuePositionDisplay.textContent = `${position}番目`;
      } else {
        estimatedTimeDisplay.textContent = showEstimatedWaitTime ? '呼び出し済み' : '';
        queuePositionDisplay.textContent = '---';
      }
    } else if (estimatedTimeDisplay) {
      estimatedTimeDisplay.textContent = showEstimatedWaitTime ? '---' : '';
    }

    if (undoTicketButton) {
      undoTicketButton.disabled = issuedHistory.length === 0;
    }
  }

  socket.on('init', (data) => {
    tickets = Array.isArray(data.tickets) ? data.tickets : [];
    issuedHistory = Array.isArray(data.issuedHistory) ? data.issuedHistory : [];
    statistics = data.statistics || { averageWaitTime: 5 };
    showEstimatedWaitTime = data.showEstimatedWaitTime !== undefined ? data.showEstimatedWaitTime : true;
    showPersonalStatus = data.showPersonalStatus !== undefined ? data.showPersonalStatus : true;
    updateDisplays();
  });

  socket.on('update', (data) => {
    tickets = Array.isArray(data.tickets) ? data.tickets : [];
    issuedHistory = Array.isArray(data.issuedHistory) ? data.issuedHistory : [];
    statistics = data.statistics || { averageWaitTime: 5 };
    showEstimatedWaitTime = data.showEstimatedWaitTime !== undefined ? data.showEstimatedWaitTime : true;
    showPersonalStatus = data.showPersonalStatus !== undefined ? data.showPersonalStatus : true;
    updateDisplays();
  });

  issueTicketButton.addEventListener('click', () => {
    const priority = prioritySelect ? prioritySelect.value : 'normal';
    socket.emit('issueTicket', { priority });
  });

  if (undoTicketButton) {
    undoTicketButton.addEventListener('click', () => {
      console.log('🔄 取り消しボタンがクリックされました');
      console.log('📋 issuedHistory:', issuedHistory);
      
      if (issuedHistory.length === 0) {
        alert('取り消せる番号がありません');
        return;
      }
      const latestNumber = issuedHistory[0]?.number;
      console.log('📋 latestNumber:', latestNumber);
      
      if (!latestNumber) {
        alert('取り消せる番号がありません');
        return;
      }
      if (!confirm(`直前に発券した番号 ${latestNumber} を取り消しますか？`)) {
        return;
      }
      undoTicketButton.disabled = true;
      console.log('📤 undoLastTicket イベントを送信');
      socket.emit('undoLastTicket');
    });
  } else {
    console.error('❌ undo-ticket ボタンが見つかりません');
  }

  // 発券成功時のイベントを受信
  socket.on('ticketIssued', (data) => {
    lastIssuedNumber = data.number;
    
    // 個人状況セクションを表示
    if (ticketStatusSection && showPersonalStatus) {
      ticketStatusSection.style.display = 'block';
    }
    
    updateDisplays();
  });

  socket.on('undoTicketSuccess', (data = {}) => {
    const cancelledNumber = data.cancelledNumber;
    const previousNumber = data.previousNumber;

    // ローカル状態を即時更新
    tickets = tickets.filter(t => t.number !== cancelledNumber);
    issuedHistory = issuedHistory.filter(t => t.number !== cancelledNumber);
    lastIssuedNumber = previousNumber || null;

    updateDisplays();
    alert(`番号${cancelledNumber}の発券を取り消しました。`);
    if (undoTicketButton) {
      undoTicketButton.disabled = false;
    }
  });

  socket.on('undoTicketFailed', (data = {}) => {
    alert(data.message || '取り消しに失敗しました。');
    if (undoTicketButton) {
      undoTicketButton.disabled = false;
    }
  });

  // エラーハンドリング
  socket.on('error', (data) => {
    alert(data.message || 'エラーが発生しました');
  });

  // 接続状態の監視
  socket.on('connect', () => {
    console.log('サーバーに接続しました');
  });

  socket.on('connect_error', (err) => {
    console.error('サーバー接続エラー:', err);
    alert('サーバーに接続できません。');
  });
});