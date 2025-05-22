const WebSocket = require('ws');
const { createServer } = require('http');
const { Server } = require('./server');

describe('Multi-Client WebSocket Chat Server', () => {
    let chatServer;
    let httpServer;
    let wss;
    let port;

    beforeAll((done) => {
        httpServer = createServer();
        wss = new WebSocket.Server({ server: httpServer });

        // Initialize with mock implementation similar to your actual server
        chatServer = new Server();
        Object.assign(chatServer, {
            wss,
            clients: new Map(),
            broadcast: jest.fn(function(message) {
                const jsonMessage = JSON.stringify(message);
                for (const client of this.wss.clients) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(jsonMessage);
                    }
                }
            })
        });

        chatServer.setupWebSocketHandlers();

        httpServer.listen(0, () => {
            port = httpServer.address().port;
            done();
        });
    });

    afterAll((done) => {
        wss.close();
        httpServer.close(done);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should handle multiple clients sending messages', async () => {
        // Create three test clients
        const client1 = new WebSocket(`ws://localhost:${port}`);
        const client2 = new WebSocket(`ws://localhost:${port}`);
        const client3 = new WebSocket(`ws://localhost:${port}`);

        // Array to collect all messages received by all clients
        const allMessages = [];

        // Wait for all clients to connect
        await Promise.all([
            new Promise((resolve) => client1.on('open', resolve)),
            new Promise((resolve) => client2.on('open', resolve)),
            new Promise((resolve) => client3.on('open', resolve))
        ]);

        // Register message handlers
        client1.on('message', (data) => allMessages.push({ client: 'client1', message: JSON.parse(data) }));
        client2.on('message', (data) => allMessages.push({ client: 'client2', message: JSON.parse(data) }));
        client3.on('message', (data) => allMessages.push({ client: 'client3', message: JSON.parse(data) }));

        // Have each client join with a unique username
        client1.send(JSON.stringify({ type: 'join', username: 'Alice' }));
        client2.send(JSON.stringify({ type: 'join', username: 'Bob' }));
        client3.send(JSON.stringify({ type: 'join', username: 'Charlie' }));

        // Wait for join messages to propagate
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Send messages from each client
        const message1 = { type: 'message', text: 'Hello from Alice', username: 'Alice', timestamp: new Date().toISOString() };
        const message2 = { type: 'message', text: 'Hi from Bob', username: 'Bob', timestamp: new Date().toISOString() };
        const message3 = { type: 'message', text: 'Greetings from Charlie', username: 'Charlie', timestamp: new Date().toISOString() };

        client1.send(JSON.stringify(message1));
        client2.send(JSON.stringify(message2));
        client3.send(JSON.stringify(message3));

        // Wait for all messages to propagate
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Verify join notifications were received by all clients
        const joinMessages = allMessages.filter(m => m.message.text.includes('has joined'));
        expect(joinMessages).toHaveLength(9); // 3 joins × 3 clients

        // Verify each client received all chat messages
        const aliceMessages = allMessages.filter(m => m.message.username === 'Alice' && m.message.type === 'message');
        const bobMessages = allMessages.filter(m => m.message.username === 'Bob' && m.message.type === 'message');
        const charlieMessages = allMessages.filter(m => m.message.username === 'Charlie' && m.message.type === 'message');


        //each client got 3 messages: 1 from themselves and 2 from others
        expect(aliceMessages).toHaveLength(3);
        expect(bobMessages).toHaveLength(3);
        expect(charlieMessages).toHaveLength(3);

        // Verify message content
        expect(aliceMessages.every(m => m.message.text === 'Hello from Alice')).toBe(true);
        expect(bobMessages.every(m => m.message.text === 'Hi from Bob')).toBe(true);
        expect(charlieMessages.every(m => m.message.text === 'Greetings from Charlie')).toBe(true);

        // Close all clients
        client1.close();
        client2.close();
        client3.close();
    });

    test('should not receive messages after leaving', async () => {
        const client1 = new WebSocket(`ws://localhost:${port}`);
        const client2 = new WebSocket(`ws://localhost:${port}`);

        await Promise.all([
            new Promise((resolve) => client1.on('open', resolve)),
            new Promise((resolve) => client2.on('open', resolve))
        ]);

        // Client1 will leave, client2 will monitor messages
        client1.send(JSON.stringify({ type: 'join', username: 'Leaver' }));
        client2.send(JSON.stringify({ type: 'join', username: 'Observer' }));

        // Wait for joins to complete
        await new Promise((resolve) => setTimeout(resolve, 100));

        const observerMessages = [];
        client1.on('message', (data) => {
            observerMessages.push(JSON.parse(data));
        });

        // Client1 sends a message
        client1.send(JSON.stringify({
            type: 'message',
            text: 'Before leaving',
            username: 'Leaver',
            timestamp: new Date().toISOString()
        }));

        // Wait for message to be received
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Client1 leaves
        client1.close();

        // Wait for leave to be processed
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Client2 sends a message (which Leaver shouldn't receive)
        client2.send(JSON.stringify({
            type: 'message',
            text: 'After leaver left',
            username: 'Observer',
            timestamp: new Date().toISOString()
        }));

        // Wait for final message
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify Observer only received the first message (the second was after Leaver left)
        expect(observerMessages).toHaveLength(1);
        expect(observerMessages[0].text).toBe('Before leaving');

        client2.close();
    });
});
