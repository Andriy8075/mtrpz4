// Підключення
const WebSocket = require('ws');
const socket = new WebSocket('ws://localhost:8080');

// Надсилання повідомлення через 2 секунди (чекаємо підключення)
setTimeout(() => {
    socket.send(JSON.stringify({
        type: 'join',
        username: 'Консоль'
    }));

    socket.send(JSON.stringify({
        type: 'message',
        text: '<img src="#" onerror="alert()">'
    }));
}, 2000);