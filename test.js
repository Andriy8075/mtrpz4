const WebSocket = require('ws');
const { createServer } = require('http');
const { Server } = require('./server');

describe('Multi-Client WebSocket Chat Server', () => {
    let chatServer;
    let httpServer;
    let wss;
    let port;

    function awaitMessagesFrom(...clients) {
        const promises = [];
        for (const client of clients) {
            promises.push(new Promise((resolve) => {
                let messagesCount = 0;
                const incCountAndCheckForResolve = (data) => {
                    messagesCount++;
                    if (messagesCount >= client.count) {
                        client.client.removeListener('message', incCountAndCheckForResolve);
                        resolve();
                    }
                };
                client.client.on('message', incCountAndCheckForResolve);
            }));
        }
        return Promise.all(promises);
    }

    beforeAll((done) => {
        httpServer = createServer();
        wss = new WebSocket.Server({ server: httpServer });

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
        // Закриваємо WebSocket сервер перед HTTP сервером
        wss.close(() => {
            httpServer.close(done);
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ... (інші імпорти та початок describe залишаються без змін)

test('should handle multiple clients sending messages', async () => {
    const client1 = new WebSocket(`ws://localhost:${port}`);
    const client2 = new WebSocket(`ws://localhost:${port}`);
    const client3 = new WebSocket(`ws://localhost:${port}`);

    const allMessages = [];

    await Promise.all([
        new Promise((resolve) => client1.on('open', resolve)),
        new Promise((resolve) => client2.on('open', resolve)),
        new Promise((resolve) => client3.on('open', resolve))
    ]);

    client1.on('message', (data) => allMessages.push({ client: 'client1', message: JSON.parse(data) }));
    client2.on('message', (data) => allMessages.push({ client: 'client2', message: JSON.parse(data) }));
    client3.on('message', (data) => allMessages.push({ client: 'client3', message: JSON.parse(data) }));

    const joinMessageToAwait = awaitMessagesFrom(
        { client: client1, count: 3 },
        { client: client2, count: 3 },
        { client: client3, count: 3 }
    );

    client1.send(JSON.stringify({ type: 'join', username: 'Alice' }));
    client2.send(JSON.stringify({ type: 'join', username: 'Bob' }));
    client3.send(JSON.stringify({ type: 'join', username: 'Charlie' }));

    await joinMessageToAwait;

    const message1 = { type: 'message', text: 'Hello from Alice', username: 'Alice', timestamp: new Date().toISOString() };
    const message2 = { type: 'message', text: 'Hi from Bob', username: 'Bob', timestamp: new Date().toISOString() };
    const message3 = { type: 'message', text: 'Greetings from Charlie', username: 'Charlie', timestamp: new Date().toISOString() };

    const textMessagesToAwait = awaitMessagesFrom(
        { client: client1, count: 3 },
        { client: client2, count: 3 },
        { client: client3, count: 3 }
    );

    client1.send(JSON.stringify(message1));
    client2.send(JSON.stringify(message2));
    client3.send(JSON.stringify(message3));

    await textMessagesToAwait;

    const joinMessages = allMessages.filter(m => m.message.text.includes('has joined'));
    expect(joinMessages).toHaveLength(9); // 3 joins × 3 clients

    const aliceMessages = allMessages.filter(m => m.message.username === 'Alice' && m.message.type === 'message');
    const bobMessages = allMessages.filter(m => m.message.username === 'Bob' && m.message.type === 'message');
    const charlieMessages = allMessages.filter(m => m.message.username === 'Charlie' && m.message.type === 'message');

    expect(aliceMessages).toHaveLength(3);
    expect(bobMessages).toHaveLength(3);
    expect(charlieMessages).toHaveLength(3);

    expect(aliceMessages.every(m => m.message.text === 'Hello from Alice')).toBe(true);
    expect(bobMessages.every(m => m.message.text === 'Hi from Bob')).toBe(true);
    expect(charlieMessages.every(m => m.message.text === 'Greetings from Charlie')).toBe(true);

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

    const joinPromises = awaitMessagesFrom(
        { client: client1, count: 2 },
        { client: client2, count: 2 },
    );

    client1.send(JSON.stringify({ type: 'join', username: 'Leaver' }));
    client2.send(JSON.stringify({ type: 'join', username: 'Observer' }));

    await joinPromises;

    const leaverMessages = [];
    client1.on('message', (data) => {
        leaverMessages.push(JSON.parse(data));
    });

    const messagePromises = awaitMessagesFrom(
        { client: client1, count: 1 },
        { client: client2, count: 1 },
    );

    client1.send(JSON.stringify({
        type: 'message',
        text: 'Before leaving',
        username: 'Leaver',
        timestamp: new Date().toISOString()
    }));

    await messagePromises;

    const leavePromise = awaitMessagesFrom({ client: client2, count: 1 });
    client1.close();
    await leavePromise;

    const afterLeavingMessagePromise = awaitMessagesFrom({ client: client2, count: 1 });
    client2.send(JSON.stringify({
        type: 'message',
        text: 'After leaver left',
        username: 'Observer',
        timestamp: new Date().toISOString()
    }));

    await afterLeavingMessagePromise;

    expect(leaverMessages).toHaveLength(1);
    expect(leaverMessages[0].text).toBe('Before leaving');

    client2.close();
    });
});