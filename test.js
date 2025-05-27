const WebSocket = require('ws');
const { createServer } = require('http');
const { Server } = require('./server');

describe('WebSocket Chat Server', () => {
    let chatServer;
    let httpServer;
    let wss;
    let port;

    // Helper function to create client and wait for connection
    async function createClient() {
        const client = new WebSocket(`ws://localhost:${port}`);
        await new Promise((resolve) => client.on('open', resolve));
        return client;
    }

    // Helper function to wait for messages
    function awaitMessages(client, count = 1) {
        return new Promise((resolve) => {
            const messages = [];
            const handler = (data) => {
                messages.push(JSON.parse(data));
                if (messages.length >= count) {
                    client.removeListener('message', handler);
                    resolve(count === 1 ? messages[0] : messages);
                }
            };
            client.on('message', handler);
        });
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
        wss.close(() => {
            httpServer.close(done);
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
        // Close all connected clients
        wss.clients.forEach(client => client.terminate());
    });

    describe('Connection Handling', () => {
        test('should accept new connections', async () => {
            const client = await createClient();
            expect(client.readyState).toBe(WebSocket.OPEN);
            client.close();
        });

        test('should notify when user joins', async () => {
            const client = await createClient();
            client.send(JSON.stringify({ type: 'join', username: 'TestUser' }));

            const message = await awaitMessages(client);
            expect(message.type).toBe('system');
            expect(message.text).toContain('TestUser has joined');
            client.close();
        });
    });

    describe('Message Handling', () => {
        test('should broadcast messages to all clients', async () => {
            const client1 = await createClient();
            const client2 = await createClient();

            client1.send(JSON.stringify({ type: 'join', username: 'Alice' }));
            client2.send(JSON.stringify({ type: 'join', username: 'Bob' }));

            // Wait for join messages
            await awaitMessages(client1, 2);
            await awaitMessages(client2, 2);

            client1.send(JSON.stringify({
                type: 'message',
                text: 'Hello everyone',
                timestamp: new Date().toISOString()
            }));

            const [msg1, msg2] = await Promise.all([
                awaitMessages(client1),
                awaitMessages(client2)
            ]);

            expect(msg1.text).toBe('Hello everyone');
            expect(msg2.text).toBe('Hello everyone');
            expect(msg1.username).toBe('Alice');

            client1.close();
            client2.close();
        });

        test('should validate message length', async () => {
            const client = await createClient();
            client.send(JSON.stringify({ type: 'join', username: 'TestUser' }));
            await awaitMessages(client);

            // Send invalid message (too long)
            const longMessage = 'a'.repeat(1025);
            client.send(JSON.stringify({
                type: 'message',
                text: longMessage,
                timestamp: new Date().toISOString()
            }));

            // No message should be received
            const received = await Promise.race([
                awaitMessages(client),
                new Promise(resolve => setTimeout(() => resolve(null), 100))
            ]);

            expect(received).toBeNull();
            client.close();
        });
    });

    describe('Edit and Delete', () => {
        test('should allow message editing', async () => {
            const client1 = await createClient();
            const client2 = await createClient();

            client1.send(JSON.stringify({ type: 'join', username: 'Alice' }));
            client2.send(JSON.stringify({ type: 'join', username: 'Bob' }));

            // Wait for joins
            await awaitMessages(client1, 2);
            await awaitMessages(client2, 2);

            // Send initial message
            client1.send(JSON.stringify({
                type: 'message',
                text: 'Original message',
                timestamp: new Date().toISOString()
            }));

            const [msg1, msg2] = await Promise.all([
                awaitMessages(client1),
                awaitMessages(client2)
            ]);

            // Edit the message
            client1.send(JSON.stringify({
                type: 'edit',
                messageId: msg1.id,
                newText: 'Edited message'
            }));

            const [edit1, edit2] = await Promise.all([
                awaitMessages(client1),
                awaitMessages(client2)
            ]);

            expect(edit1.type).toBe('edit');
            expect(edit1.newText).toBe('Edited message');
            expect(edit1.messageId).toBe(msg1.id);

            client1.close();
            client2.close();
        });

        test('should prevent editing others messages', async () => {
            const client1 = await createClient();
            const client2 = await createClient();

            client1.send(JSON.stringify({ type: 'join', username: 'Alice' }));
            client2.send(JSON.stringify({ type: 'join', username: 'Bob' }));

            // Wait for joins
            await awaitMessages(client1, 2);
            await awaitMessages(client2, 2);

            // Alice sends message
            client1.send(JSON.stringify({
                type: 'message',
                text: 'Alice message',
                timestamp: new Date().toISOString()
            }));

            const [msg1, msg2] = await Promise.all([
                awaitMessages(client1),
                awaitMessages(client2)
            ]);

            // Bob tries to edit Alice's message
            client2.send(JSON.stringify({
                type: 'edit',
                messageId: msg1.id,
                newText: 'Hacked message'
            }));

            // No message should be received
            const received = await Promise.race([
                awaitMessages(client1),
                new Promise(resolve => setTimeout(() => resolve(null), 100))
            ]);

            expect(received).toBeNull();

            client1.close();
            client2.close();
        });

        test('should allow message deletion', async () => {
            const client = await createClient();
            client.send(JSON.stringify({ type: 'join', username: 'TestUser' }));
            await awaitMessages(client);

            // Send message
            client.send(JSON.stringify({
                type: 'message',
                text: 'Message to delete',
                timestamp: new Date().toISOString()
            }));

            const msg = await awaitMessages(client);

            // Delete message
            client.send(JSON.stringify({
                type: 'delete',
                messageId: msg.id
            }));

            const deleteMsg = await awaitMessages(client);
            expect(deleteMsg.type).toBe('delete');
            expect(deleteMsg.messageId).toBe(msg.id);

            client.close();
        });
    });

    describe('Disconnection Handling', () => {
        test('should notify when user leaves', async () => {
            const client1 = await createClient();
            const client2 = await createClient();

            client1.send(JSON.stringify({ type: 'join', username: 'Alice' }));
            client2.send(JSON.stringify({ type: 'join', username: 'Bob' }));

            // Wait for joins
            await awaitMessages(client1, 2);
            await awaitMessages(client2, 2);

            client1.close();

            const leaveMsg = await awaitMessages(client2);
            expect(leaveMsg.type).toBe('system');
            expect(leaveMsg.text).toContain('Alice has left');

            client2.close();
        });

        test('should not receive messages after leaving', async () => {
            const client1 = await createClient();
            const client2 = await createClient();

            client1.send(JSON.stringify({ type: 'join', username: 'Alice' }));
            client2.send(JSON.stringify({ type: 'join', username: 'Bob' }));

            // Wait for joins
            await awaitMessages(client1, 2);
            await awaitMessages(client2, 2);

            client1.close();

            // Bob sends message after Alice left
            client2.send(JSON.stringify({
                type: 'message',
                text: 'After Alice left',
                timestamp: new Date().toISOString()
            }));

            // No message should be received by Alice (already closed)
            // Just verify no errors occur

            client2.close();
        });
    });

    describe('Validation', () => {
        test('should reject invalid usernames', async () => {
            const client = await createClient();

            // Send invalid username (too long)
            const longUsername = 'a'.repeat(17);
            client.send(JSON.stringify({ type: 'join', username: longUsername }));

            // No join message should be received
            const received = await Promise.race([
                awaitMessages(client),
                new Promise(resolve => setTimeout(() => resolve(null), 100))
            ]);

            expect(received).toBeNull();
            client.close();
        });

        test('should reject long messages', async () => {
            const client = await createClient();
            client.send(JSON.stringify({ type: 'join', username: 'TestUser' }));
            await awaitMessages(client);

            // Send empty message
            client.send(JSON.stringify({
                type: 'message',
                text: 'a'.repeat(1025),
                timestamp: new Date().toISOString()
            }));

            // No message should be received
            const received = await Promise.race([
                awaitMessages(client),
                new Promise(resolve => setTimeout(() => resolve(null), 100))
            ]);

            expect(received).toBeNull();
            client.close();
        });

        test('should reject empty messages', async () => {
            const client = await createClient();
            client.send(JSON.stringify({ type: 'join', username: 'TestUser' }));
            await awaitMessages(client);

            // Send empty message
            client.send(JSON.stringify({
                type: 'message',
                text: "  ",
                timestamp: new Date().toISOString()
            }));

            // No message should be received
            const received = await Promise.race([
                awaitMessages(client),
                new Promise(resolve => setTimeout(() => resolve(null), 100))
            ]);

            expect(received).toBeNull();
            client.close();
        });
    });

    describe('Message Editing and Deletion', () => {
        let client1, client2, client3;
        let initialMessageId;

        beforeEach(async () => {
            // Create and connect clients
            client1 = await createClient();
            client2 = await createClient();
            client3 = await createClient();

            // Join clients with usernames
            client1.send(JSON.stringify({ type: 'join', username: 'Owner' }));
            client2.send(JSON.stringify({ type: 'join', username: 'Friend' }));
            client3.send(JSON.stringify({ type: 'join', username: 'Stranger' }));

            // Wait for join confirmations
            await Promise.all([
                awaitMessages(client1, 3),  // Wait for 3 messages (join confirmations + user list updates)
                awaitMessages(client2, 3),
                awaitMessages(client3, 3)
            ]);

            // Send initial message
            client1.send(JSON.stringify({
                type: 'message',
                text: 'Original message',
                timestamp: new Date().toISOString()
            }));

            // Get message ID from the first client
            const msg = await awaitMessages(client1);
            initialMessageId = msg.id;

            // Ensure all clients received the initial message
            await Promise.all([
                awaitMessages(client2),
                awaitMessages(client3)
            ]);
        });

        afterEach(() => {
            [client1, client2, client3].forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.close();
                }
            });
        });

        test('should allow owner to edit their message', async () => {
            // Edit the message
            client1.send(JSON.stringify({
                type: 'edit',
                messageId: initialMessageId,
                newText: 'Edited content'
            }));

            // Wait for edit confirmations
            const [edited1, edited2, edited3] = await Promise.all([
                awaitMessages(client1),
                awaitMessages(client2),
                awaitMessages(client3)
            ]);

            // Verify responses
            expect(edited1).toMatchObject({
                type: 'edit',
                messageId: initialMessageId,
                newText: 'Edited content'
            });
            expect(edited2).toMatchObject({
                type: 'edit',
                messageId: initialMessageId,
                newText: 'Edited content'
            });
            expect(edited3).toMatchObject({
                type: 'edit',
                messageId: initialMessageId,
                newText: 'Edited content'
            });
        });

        test('should allow owner to delete their message', async () => {
            // Delete the message
            client1.send(JSON.stringify({
                type: 'delete',
                messageId: initialMessageId
            }));

            // Wait for delete confirmations
            const [deleted1, deleted2, deleted3] = await Promise.all([
                awaitMessages(client1),
                awaitMessages(client2),
                awaitMessages(client3)
            ]);

            // Verify responses
            expect(deleted1).toMatchObject({
                type: 'delete',
                messageId: initialMessageId
            });
            expect(deleted2).toMatchObject({
                type: 'delete',
                messageId: initialMessageId
            });
            expect(deleted3).toMatchObject({
                type: 'delete',
                messageId: initialMessageId
            });
        });

        test('should mark edited messages with timestamp', async () => {
            // Edit the message
            client1.send(JSON.stringify({
                type: 'edit',
                messageId: initialMessageId,
                newText: 'Edited with timestamp'
            }));

            const edited = await awaitMessages(client1);

            expect(edited).toMatchObject({
                type: 'edit',
                messageId: initialMessageId,
                newText: 'Edited with timestamp'
            });
            expect(edited.editTimestamp).toBeDefined();
            expect(new Date(edited.editTimestamp)).toBeInstanceOf(Date);
        });

        test('should prevent non-owners from editing messages', async () => {
            // Attempt to edit as non-owner
            const editAttempt = {
                type: 'edit',
                messageId: initialMessageId,
                newText: 'Malicious edit'
            };
            client2.send(JSON.stringify(editAttempt));

            // Wait a short time to ensure no edit happens
            const received = await Promise.race([
                awaitMessages(client1),
                new Promise(resolve => setTimeout(() => resolve(null), 100))
            ]);

            expect(received).toBeNull();
        });


        test('should prevent non-owners from deleting messages', async () => {
            // Attempt to delete as non-owner
            const deleteAttempt = {
                type: 'delete',
                messageId: initialMessageId
            };
            client3.send(JSON.stringify(deleteAttempt));

            // Wait a short time to ensure no deletion happens
            const received = await Promise.race([
                awaitMessages(client1),
                new Promise(resolve => setTimeout(() => resolve(null), 100))
            ]);

            expect(received).toBeNull();
        });

    });
});