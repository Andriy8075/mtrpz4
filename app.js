document.addEventListener('DOMContentLoaded', () => {
    const loginContainer = document.getElementById('login-container');
    const chatContainer = document.querySelector('.chat-container');
    const usernameInput = document.getElementById('username');
    const loginBtn = document.getElementById('login-btn');
    const messagesContainer = document.getElementById('messages');
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.querySelector('.send-button');

    let socket;
    let currentUser;

    function updateSendButton() {
        if (messageInput.value.trim() !== '') {
            sendButton.classList.add('active');
        } else {
            sendButton.classList.remove('active');
        }
    }
    function adjustTextareaHeight() {
        messageInput.style.height = 'auto';

        if (messageInput.scrollHeight > 69) {
            messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
            if(Math.min(messageInput.scrollHeight, 150) == 150){
                console.log("==")
                messageInput.style.overflowY = 'auto';
            }
        } else {
            messageInput.style.height = '48px';
            messageInput.style.overflowY = 'hidden';
        }

        updateSendButton();
    }

    messageInput.addEventListener('input', adjustTextareaHeight);

    // Обробка натискання Enter (відправка при Enter, перенос рядка при Shift+Enter)
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (messageInput.value.trim() !== '') {
                messageForm.dispatchEvent(new Event('submit'));
            }
        }
    });

    // Handle login
    loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const username = usernameInput.value.trim();

        if (username) {
            currentUser = username;

            // Initialize WebSocket connection
            socket = new WebSocket(`ws://${window.location.hostname}:8080`);

            socket.onopen = () => {
                console.log('WebSocket connection established');

                // Send the username to the server
                socket.send(JSON.stringify({
                    type: 'join',
                    username: currentUser
                }));

                // Show chat interface
                loginContainer.style.display = 'none';
                chatContainer.style.display = 'flex';
                messageInput.focus();
            };

            socket.onmessage = (event) => {
                const message = JSON.parse(event.data);
                displayMessage(message);
            };

            socket.onclose = () => {
                console.log('WebSocket connection closed');
                displaySystemMessage('Connection to server lost. Please refresh the page.');
            };

            socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                displaySystemMessage('Connection error occurred.');
            };
        }
    });

    // Handle message submission
    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const messageText = messageInput.value.trim();

        if (messageText && socket) {
            const message = {
                type: 'message',
                username: currentUser,
                text: messageText,
                timestamp: new Date().toISOString()
            };

            socket.send(JSON.stringify(message));
            messageInput.value = '';
            updateSendButton();
        }
    });

    // Display a message in the chat
    function displayMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message';

        if (message.type === 'system') {
            messageElement.innerHTML = `<em>${message.text}</em>`;
            messageElement.style.color = '#666';
            messageElement.style.textAlign = 'center';
        } else {
            const time = new Date(message.timestamp).toLocaleTimeString();
            messageElement.innerHTML = `
                <div class="message received" id="message-container">
                    <div class="message-bubble">
                        ${message.text}
                    </div>
                    <div class="message-info">
                    <span class="message-sender">${message.username}</span>
                    <span class="message-time">${time}</span>
                    </div>
                </div>
            `;
        }

        messagesContainer.appendChild(messageElement);
        messageInput.value = '';
        messageInput.style.height = '48px';
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        displayContextMenu()
    }

    // Display system messages
    function displaySystemMessage(text) {
        displayMessage({
            type: 'system',
            text: text,
            timestamp: new Date().toISOString()
        });
    }

    // Display contextMenu
    function displayContextMenu() {
        const message = document.getElementById('message-container');
        const contextMenu = document.getElementById('context-menu');

        if (!message || !contextMenu) {
            console.error('Не знайдено елемент message-container або context-menu');
            return;
        }

        function closeContextMenu() {
            contextMenu.style.display = "none";
            document.removeEventListener('click', handleOutsideClick);
        }

        function handleOutsideClick(e) {
            if (!contextMenu.contains(e.target) && e.target !== message) {
                closeContextMenu();
            }
        }

        message.addEventListener('click', (e) => {
            e.stopPropagation();

            document.querySelectorAll('.context-menu').forEach(menu => {
                if (menu !== contextMenu) menu.style.display = "none";
            });

            const position = message.getBoundingClientRect();
            const scrollX = window.scrollX || document.documentElement.scrollLeft;
            const scrollY = window.scrollY || document.documentElement.scrollTop;

            contextMenu.style.display = "flex";
            contextMenu.style.left = `${position.right + scrollX + 10}px`;
            contextMenu.style.top = `${position.bottom + scrollY}px`;

            document.addEventListener('click', handleOutsideClick);
        });

        contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', closeContextMenu);
        });
    }
});