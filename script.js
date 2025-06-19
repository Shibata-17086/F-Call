// 接続先のURLを動的に決定
const getServerUrl = () => {
  // 本番環境では現在接続しているホストを使用
  const currentHost = window.location.hostname;
  const port = 3443; // サーバーのポート番号
  return `https://${currentHost}:${port}`;
};

const socket = io(getServerUrl());

document.addEventListener('DOMContentLoaded', () => {
  const ticketNumberDisplay = document.getElementById('ticket-number');
  const waitingCountDisplay = document.getElementById('waiting-count');
  const waitingTimeDisplay = document.getElementById('waiting-time');
  const issueTicketButton = document.getElementById('issue-ticket');
  const prioritySelect = document.getElementById('priority-select');
  const businessHoursDisplay = document.getElementById('business-hours');
  const estimatedTimeDisplay = document.getElementById('estimated-time');
  const queuePositionDisplay = document.getElementById('queue-position');

  let tickets = [];
  let issuedHistory = [];
  let statistics = { averageWaitTime: 5 };
  let isBusinessHours = true;
  let lastIssuedNumber = null;

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
    
    waitingTimeDisplay.textContent = `約${estimatedWaitTime}分`;
    
    // 最新の発券番号を表示
    if (lastIssuedNumber) {
      ticketNumberDisplay.textContent = String(lastIssuedNumber).padStart(3, '0');
    } else if (issuedHistory.length > 0) {
      ticketNumberDisplay.textContent = String(issuedHistory[0].number).padStart(3, '0');
    } else {
      ticketNumberDisplay.textContent = '---';
    }
    
    // 発券したチケットの予想待ち時間と順番を表示
    if (lastIssuedNumber && estimatedTimeDisplay && queuePositionDisplay) {
      const myTicket = tickets.find(t => t.number === lastIssuedNumber);
      if (myTicket) {
        estimatedTimeDisplay.textContent = `約${myTicket.estimatedWaitTime}分`;
        const position = tickets.findIndex(t => t.number === lastIssuedNumber) + 1;
        queuePositionDisplay.textContent = `${position}番目`;
      } else {
        estimatedTimeDisplay.textContent = '呼び出し済み';
        queuePositionDisplay.textContent = '---';
      }
    }
    
    // 営業時間外の表示
    if (businessHoursDisplay) {
      businessHoursDisplay.style.display = isBusinessHours ? 'none' : 'block';
    }
    
    // ボタンの状態
    issueTicketButton.disabled = !isBusinessHours;
    issueTicketButton.textContent = isBusinessHours ? '受付番号を発行' : '営業時間外';
  }

  socket.on('init', (data) => {
    tickets = Array.isArray(data.tickets) ? data.tickets : [];
    issuedHistory = Array.isArray(data.issuedHistory) ? data.issuedHistory : [];
    statistics = data.statistics || { averageWaitTime: 5 };
    isBusinessHours = data.isBusinessHours !== false;
    updateDisplays();
  });

  socket.on('update', (data) => {
    tickets = Array.isArray(data.tickets) ? data.tickets : [];
    issuedHistory = Array.isArray(data.issuedHistory) ? data.issuedHistory : [];
    statistics = data.statistics || { averageWaitTime: 5 };
    isBusinessHours = data.isBusinessHours !== false;
    updateDisplays();
  });

  issueTicketButton.addEventListener('click', () => {
    if (!isBusinessHours) {
      alert('現在は営業時間外です。');
      return;
    }
    
    const priority = prioritySelect ? prioritySelect.value : 'normal';
    socket.emit('issueTicket', { priority });
  });

  // 発券成功時のイベントを受信
  socket.on('ticketIssued', (data) => {
    lastIssuedNumber = data.number;
    
    // 個人状況セクションを表示
    const ticketStatusSection = document.getElementById('ticket-status');
    if (ticketStatusSection) {
      ticketStatusSection.style.display = 'block';
    }
    
    updateDisplays();
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