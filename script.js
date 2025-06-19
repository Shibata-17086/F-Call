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

  let tickets = [];
  let issuedHistory = [];

  function updateDisplays() {
    waitingCountDisplay.textContent = tickets.length;
    waitingTimeDisplay.textContent = Math.ceil(tickets.length * 5);
    if (issuedHistory.length > 0) {
      ticketNumberDisplay.textContent = String(issuedHistory[0].number).padStart(3, '0');
    } else {
      ticketNumberDisplay.textContent = '---';
    }
  }

  socket.on('init', (data) => {
    tickets = data.tickets;
    issuedHistory = data.issuedHistory;
    updateDisplays();
  });

  socket.on('update', (data) => {
    tickets = data.tickets;
    issuedHistory = data.issuedHistory;
    updateDisplays();
  });

  issueTicketButton.addEventListener('click', () => {
    socket.emit('issueTicket');
  });
});