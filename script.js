const socket = io('http://localhost:3001');

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