const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

class ChatServer {
    constructor() {
        this.server = http.createServer(this.handleRequest.bind(this));
        this.wss = new WebSocket.Server({ server: this.server });
        this.clientMessages = new WeakMap(); // ws -> messages[]
        this.setupWebSocketHandlers();
    }

    validateMessageText(text) {
        return text && typeof text === 'string' && text.trim() !== '' && text.length <= 1024;
    }

    validateUsername(username) {
        return username && typeof username === 'string' && username.trim() !== '' && username.length <= 16;
    }

    handleRequest(req, res) {
        if (req.url === '/') {
            fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
                if (err) {
                    res.writeHead(500);
                    return res.end('Error loading index.html');
                }
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            });
        } else if (req.url === '/app.js') {
            fs.readFile(path.join(__dirname, 'app.js'), (err, data) => {
                if (err) {
                    res.writeHead(500);
                    return res.end('Error loading app.js');
                }
                res.writeHead(200, { 'Content-Type': 'application/javascript' });
                res.end(data);
            });
        } else {
            res.writeHead(404);
            res.end();
        }
    }

    setupWebSocketHandlers() {
        this.wss.on('connection', (ws) => {
            console.log('New client connected');
            this.clientMessages.set(ws, []);

            // Store username directly on the ws object
            ws.username = null;

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);

                    if (data.type === 'join') {
                        this.handleJoin(data, ws);
                    } else if (data.type === 'message') {
                        this.handleMessage(data, ws);
                    } else if (data.type === 'delete') {
                        this.handleDelete(data, ws);
                    } else if (data.type === 'edit') {
                        this.handleEdit(data, ws);
                    }
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            });

            ws.on('close', () => {
                this.handleDisconnect(ws);
                this.clientMessages.delete(ws);
            });
        });
    }

    handleJoin(data, ws) {
        const validated = this.validateUsername(data.username)
        if (!validated) return;
        ws.username = data.username;
        this.broadcast({
            type: 'system',
            text: `${data.username} has joined the chat`,
            timestamp: new Date().toISOString()
        });
    }

    handleMessage(data, ws) {
        if (!ws.username) return; // Only allow messages from joined users
        const validated = this.validateMessageText(data.text);
        if(!validated) return;
        console.log('ertgethrth');
        const messageWithId = {
            type: 'message',
            text: data.text,
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            timestamp: new Date().toISOString(),
            username: ws.username,
        };

        const messages = this.clientMessages.get(ws);
        messages.push(messageWithId);
        this.broadcast(messageWithId);
    }

    handleDelete(data, ws) {
        if (!ws.username) return;

        const messages = this.clientMessages.get(ws);
        if (!messages) return;

        const messageIndex = messages.findIndex(msg => msg.id === data.messageId);
        if (messageIndex !== -1) {
            messages.splice(messageIndex, 1);
            this.broadcast({
                type: 'delete',
                messageId: data.messageId,
                username: ws.username
            });
        } else {
            console.log(`User ${ws.username} attempted to delete message they don't own`);
        }
    }

    handleEdit(data, ws) {
        if (!ws.username) return;

        const messages = this.clientMessages.get(ws);
        if (!messages) return;

        const validated = this.validateMessageText(data.newText);
        if(!validated) return;

        const messageIndex = messages.findIndex(msg => msg.id === data.messageId);
        if (messageIndex !== -1) {
            messages[messageIndex].text = data.newText;
            messages[messageIndex].edited = true;
            messages[messageIndex].editTimestamp = new Date().toISOString();

            this.broadcast({
                type: 'edit',
                messageId: data.messageId,
                newText: data.newText,
                username: ws.username,
                editTimestamp: new Date().toISOString()
            });
        } else {
            console.log(`User ${ws.username} attempted to edit message they don't own`);
        }
    }

    handleDisconnect(ws) {
        if (ws.username) {
            this.broadcast({
                type: 'system',
                text: `${ws.username} has left the chat`,
                timestamp: new Date().toISOString()
            });
        }
    }

    broadcast(message) {
        const jsonMessage = JSON.stringify(message);
        for (const client of this.wss.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(jsonMessage);
            }
        }
    }

    listen(port) {
        this.server.listen(port, () => {
            console.log(`Server running on http://localhost:${port}`);
        });
        return this.server;
    }
}

if (require.main === module) {
    const PORT = process.env.PORT || 8080;
    new ChatServer().listen(PORT);
}

module.exports = { Server: ChatServer };