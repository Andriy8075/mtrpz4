document.addEventListener('DOMContentLoaded', () => {
    const loginContainer = document.getElementById('login-container');
    const chatContainer = document.querySelector('.chat-container');
    const usernameInput = document.getElementById('username');
    const loginBtn = document.getElementById('login-btn');
    const messagesContainer = document.getElementById('messages');
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.querySelector('.send-button');
    const contextMenu = document.getElementById('context-menu');

    let socket;
    let currentUser;
    let selectedMessageId = null;
    let isEditing = false;

    function updateSendButton() {
        if (messageInput.value.trim() !== '') {
            sendButton.classList.add('active');
        } else {
            sendButton.classList.remove('active');
        }
    }

    function nl2br(str) {
        return str.replace(/\n/g, '<br>');
    }

    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
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

    // Handle Enter key (send on Enter, new line on Shift+Enter)
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
                handleServerMessage(message);
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
        const safeMessage = nl2br(escapeHtml(messageText));

        if (safeMessage && socket) {
            if (isEditing && selectedMessageId) {
                // Send edit message
                socket.send(JSON.stringify({
                    type: 'edit',
                    messageId: selectedMessageId,
                    newText: safeMessage,
                    username: currentUser
                }));
                isEditing = false;
                selectedMessageId = null;
            } else {
                // Send new message
                const message = {
                    type: 'message',
                    username: currentUser,
                    text: safeMessage,
                    timestamp: new Date().toISOString()
                };
                socket.send(JSON.stringify(message));
            }

            messageInput.value = '';
            updateSendButton();
        }
    });

    function handleServerMessage(message) {
        switch (message.type) {
            case 'system':
                displaySystemMessage(message.text);
                break;
            case 'message':
                displayMessage(message);
                break;
            case 'delete':
                removeMessage(message.messageId);
                break;
            case 'edit':
                updateMessage(message);
                break;
            default:
                console.log('Unknown message type:', message.type);
        }
    }

    function displayMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        messageElement.dataset.id = message.id;

        const time = new Date(message.timestamp).toLocaleTimeString();
        const isCurrentUser = message.username === currentUser;

        let editedIndicator = '';
        if (message.edited) {
            const editTime = new Date(message.editTimestamp).toLocaleTimeString();
            editedIndicator = `<span class="edited-indicator">(edited at ${editTime})</span>`;
        }

        messageElement.innerHTML = `
            <div class="message ${isCurrentUser ? 'sent' : 'received'}">
                <div class="message-bubble">${message.text}</div>
                <div class="message-info">
                    <span class="message-sender">${message.username}</span>
                    <span class="message-time">${time} ${editedIndicator}</span>
                </div>
            </div>
        `;

        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Add context menu functionality
        setupContextMenu(messageElement, message);
    }

    function removeMessage(messageId) {
        const messageElement = document.querySelector(`.message[data-id="${messageId}"]`);
        if (messageElement) {
            messageElement.remove();
        }
    }

    function updateMessage(message) {
        const messageElement = document.querySelector(`.message[data-id="${message.messageId}"]`);
        if (messageElement) {
            const bubble = messageElement.querySelector('.message-bubble');
            const timeElement = messageElement.querySelector('.message-time');

            if (bubble) bubble.innerHTML = message.newText;
            if (timeElement) {
                const originalTime = timeElement.textContent.split(' ')[0];
                timeElement.innerHTML = `${originalTime} <span class="edited-indicator">(edited at ${new Date(message.editTimestamp).toLocaleTimeString()})</span>`;
            }
        }
    }

    function displaySystemMessage(text) {
        const messageElement = document.createElement('div');
        messageElement.className = 'system-message';
        messageElement.innerHTML = `<em>${text}</em>`;
        messageElement.style.color = '#666';
        messageElement.style.textAlign = 'center';
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function setupContextMenu(messageElement, message) {
        const isCurrentUser = message.username === currentUser;

        messageElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();

            // Only show edit/delete for current user's messages
            if (isCurrentUser) {
                contextMenu.querySelector('[data-action="edit"]').style.display = 'block';
                contextMenu.querySelector('[data-action="delete"]').style.display = 'block';
            } else {
                contextMenu.querySelector('[data-action="edit"]').style.display = 'none';
                contextMenu.querySelector('[data-action="delete"]').style.display = 'none';
            }

            positionContextMenu(e, contextMenu);
        });

        // Handle context menu actions
        contextMenu.querySelectorAll('.context-item').forEach(item => {
            console.log('adding event listener')
            item.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                console.log('click'); // !!! all listeners activated (hear click)
                handleContextAction(action, message);
                contextMenu.style.display = 'none';
            });
        });
    }

    function positionContextMenu(e, menu) {
        menu.style.display = 'flex';
        menu.style.left = `${e.pageX}px`;
        menu.style.top = `${e.pageY}px`;

        // Hide menu when clicking elsewhere
        document.addEventListener('click', function hideMenu() {
            menu.style.display = 'none';
            document.removeEventListener('click', hideMenu);
        }, { once: true });
    }

    function handleContextAction(action, message) {
        switch (action) {
            case 'edit':
                isEditing = true;
                selectedMessageId = message.id;
                messageInput.value = message.text.replace(/<br\s*\/?>/gi, '\n');
                messageInput.focus();
                break;
            case 'delete':
                if (message.username === currentUser) {
                    socket.send(JSON.stringify({
                        type: 'delete',
                        messageId: message.id,
                        username: currentUser
                    }));
                }
                break;
            case 'copy':
                navigator.clipboard.writeText(message.text.replace(/<br\s*\/?>/gi, '\n'));
                break;
            case 'reply':
                messageInput.value = `@${message.username} `;
                messageInput.focus();
                break;
        }
    }
});