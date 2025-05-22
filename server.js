const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

class ChatServer {
    constructor() {
        this.server = http.createServer(this.handleRequest.bind(this));
        this.wss = new WebSocket.Server({ server: this.server });
        this.clients = new Map();
        this.messages = []; // Store messages for editing/deleting

        this.setupWebSocketHandlers();
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

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);

                    if (data.type === 'join') {
                        this.handleJoin(data, ws);
                    } else if (data.type === 'message') {
                        this.handleMessage(data);
                    } else if (data.type === 'delete') {
                        this.handleDelete(data);
                    } else if (data.type === 'edit') {
                        this.handleEdit(data);
                    }
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            });

            ws.on('close', () => {
                this.handleDisconnect(ws);
            });
        });
    }

    handleJoin(data, ws) {
        this.clients.set(data.username, ws);
        this.broadcast({
            type: 'system',
            text: `${data.username} has joined the chat`,
            timestamp: new Date().toISOString()
        });
    }

    handleMessage(data) {
        // Add unique ID to the message
        const messageWithId = {
            ...data,
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5)
        };
        this.messages.push(messageWithId);
        this.broadcast(messageWithId);
    }

    handleDelete(data) {
        const messageIndex = this.messages.findIndex(msg => msg.id === data.messageId);
        if (messageIndex !== -1) {
            // Check if the user is the author of the message
            if (this.messages[messageIndex].username === data.username) {
                this.messages.splice(messageIndex, 1);
                this.broadcast({
                    type: 'delete',
                    messageId: data.messageId,
                    username: data.username
                });
            } else {
                console.log(`User ${data.username} attempted to delete message they don't own`);
            }
        }
    }

    handleEdit(data) {
        const messageIndex = this.messages.findIndex(msg => msg.id === data.messageId);
        if (messageIndex !== -1) {
            // Check if the user is the author of the message
            if (this.messages[messageIndex].username === data.username) {
                this.messages[messageIndex].text = data.newText;
                this.messages[messageIndex].edited = true;
                this.messages[messageIndex].editTimestamp = new Date().toISOString();

                this.broadcast({
                    type: 'edit',
                    messageId: data.messageId,
                    newText: data.newText,
                    username: data.username,
                    editTimestamp: new Date().toISOString()
                });
            } else {
                console.log(`User ${data.username} attempted to edit message they don't own`);
            }
        }
    }

    handleDisconnect(ws) {
        let username;
        for (const [name, client] of this.clients.entries()) {
            if (client === ws) {
                username = name;
                this.clients.delete(name);
                break;
            }
        }

        if (username) {
            this.broadcast({
                type: 'system',
                text: `${username} has left the chat`,
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

// Only start the server if this is the main module
if (require.main === module) {
    const PORT = process.env.PORT || 8080;
    new ChatServer().listen(PORT);
}

module.exports = { Server: ChatServer };