const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Create HTTP server for serving the HTML file
const server = http.createServer((req, res) => {
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
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

const clients = new Map();

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'join') {
                // Store the user's WebSocket connection
                clients.set(data.username, ws);
            } else if (data.type === 'message') {
                // Broadcast the message to all clients
                broadcast(data);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        // Find the username for this WebSocket
        let username;
        for (const [name, client] of clients.entries()) {
            if (client === ws) {
                username = name;
                clients.delete(name);
                break;
            }
        }
    });
});

function broadcast(message) {
    const jsonMessage = JSON.stringify(message);
    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(jsonMessage);
        }
    }
}

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});