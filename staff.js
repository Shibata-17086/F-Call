const socket = io('http://localhost:3001');

document.addEventListener('DOMContentLoaded', () => {
  const currentNumberElement = document.getElementById('currentNumber');
  const ticketList = document.getElementById('ticketList');
  const historyList = document.getElementById('historyList');
  const resetAllBtn = document.getElementById('resetAll');

  let tickets = [];
  let calledHistory = [];
  let currentNumber = null;

  function updateDisplay() {
    currentNumberElement.textContent = currentNumber !== null ? currentNumber : '---';

    // 発券中リスト
    ticketList.innerHTML = '';
    tickets.forEach(ticket => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.style.margin = '0.2rem';
      btn.textContent = `${ticket.number}\n${ticket.time}`;
      btn.onclick = () => {
        socket.emit('callNumber', ticket.number);
      };
      ticketList.appendChild(btn);
    });

    // 呼び出し履歴
    historyList.innerHTML = '';
    calledHistory.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `<div style="font-size:1.2rem;font-weight:bold;">${item.number}</div><div style="font-size:0.9rem;color:#888;">${item.time}</div>`;
      historyList.appendChild(div);
    });
  }

  socket.on('init', (data) => {
    tickets = data.tickets;
    calledHistory = data.calledHistory;
    currentNumber = data.currentNumber;
    updateDisplay();
  });

  socket.on('update', (data) => {
    tickets = data.tickets;
    calledHistory = data.calledHistory;
    currentNumber = data.currentNumber;
    updateDisplay();
  });

  resetAllBtn.onclick = () => {
    if (confirm('本当にサーバー全体をリセットしますか？')) {
      socket.emit('reset');
    }
  };
});