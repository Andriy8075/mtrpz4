document.addEventListener('DOMContentLoaded', () => {
    const loginContainer = document.getElementById('login-container');
    const chatContainer = document.querySelector('.chat-container');
    const usernameInput = document.getElementById('username');
    const loginBtn = document.getElementById('login-btn');
    const messagesContainer = document.getElementById('messages');
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    
    let socket;
    let currentUser;

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
                <div class="message received" id="message-item">
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
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    // Display system messages
    function displaySystemMessage(text) {
        displayMessage({
            type: 'system',
            text: text,
            timestamp: new Date().toISOString()
        });
    }
});