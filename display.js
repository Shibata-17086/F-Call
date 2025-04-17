const socket = io('http://localhost:3001');

document.addEventListener('DOMContentLoaded', () => {
  const displayNumber = document.getElementById('displayNumber');
  const historyList = document.getElementById('historyList');

  let calledHistory = [];
  let currentNumber = null;

  function updateDisplay() {
    displayNumber.textContent = currentNumber !== null ? currentNumber : '---';
    historyList.innerHTML = '';
    calledHistory.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `<div style="font-size:2rem;font-weight:bold;">${item.number}</div><div style="font-size:0.9rem;color:#888;">${item.time}</div>`;
      historyList.appendChild(div);
    });
  }

  socket.on('init', (data) => {
    calledHistory = data.calledHistory;
    currentNumber = data.currentNumber;
    updateDisplay();
  });

  socket.on('update', (data) => {
    calledHistory = data.calledHistory;
    currentNumber = data.currentNumber;
    updateDisplay();
  });
});