const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { StringDecoder } = require('string_decoder');

class WebSocketServer {
    constructor(server) {
        this.server = server;
        this.clients = new Map();
        
        server.on('upgrade', (req, socket, head) => {
            this.handleUpgrade(req, socket, head);
        });
    }

    handleUpgrade(req, socket, head) {
        const key = req.headers['sec-websocket-key'];
        const accept = this.generateAccept(key);
        
        const responseHeaders = [
            'HTTP/1.1 101 Web Socket Protocol Handshake',
            'Upgrade: WebSocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${accept}`
        ];

        socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');
        
        const clientId = this.generateId();
        const client = {
            id: clientId,
            socket: socket,
            rooms: new Set()
        };
        
        this.clients.set(clientId, client);
        
        socket.on('data', (data) => {
            this.handleMessage(clientId, data);
        });
        
        socket.on('close', () => {
            this.clients.delete(clientId);
            this.broadcast('user_offline', { userId: clientId });
        });
        
        socket.on('error', () => {
            this.clients.delete(clientId);
        });

        // Отправляем приветственное сообщение
        this.sendToClient(clientId, 'connected', { clientId });
    }

    generateAccept(key) {
        const crypto = require('crypto');
        const sha1 = crypto.createHash('sha1');
        sha1.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
        return sha1.digest('base64');
    }

    generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    handleMessage(clientId, data) {
        try {
            const message = this.decodeMessage(data);
            if (message && message.type && message.data) {
                this.broadcast(message.type, message.data, clientId);
            }
        } catch (error) {
            console.log('Error decoding message:', error);
        }
    }

    decodeMessage(buffer) {
        const firstByte = buffer.readUInt8(0);
        const secondByte = buffer.readUInt8(1);
        
        const isFinalFrame = Boolean(firstByte & 0x80);
        const opcode = firstByte & 0x0F;
        
        let payloadLength = secondByte & 0x7F;
        let maskStart = 2;
        
        if (payloadLength === 126) {
            payloadLength = buffer.readUInt16BE(2);
            maskStart = 4;
        } else if (payloadLength === 127) {
            payloadLength = Number(buffer.readBigUInt64BE(2));
            maskStart = 10;
        }
        
        const masks = buffer.slice(maskStart, maskStart + 4);
        const payload = buffer.slice(maskStart + 4, maskStart + 4 + payloadLength);
        
        const decoded = Buffer.alloc(payloadLength);
        for (let i = 0; i < payloadLength; i++) {
            decoded[i] = payload[i] ^ masks[i % 4];
        }
        
        return JSON.parse(decoded.toString());
    }

    encodeMessage(data) {
        const json = JSON.stringify(data);
        const jsonBuffer = Buffer.from(json);
        
        const length = jsonBuffer.length;
        let payloadLengthByte;
        let lengthBytes;
        
        if (length <= 125) {
            payloadLengthByte = length;
            lengthBytes = Buffer.alloc(0);
        } else if (length <= 65535) {
            payloadLengthByte = 126;
            lengthBytes = Buffer.alloc(2);
            lengthBytes.writeUInt16BE(length);
        } else {
            payloadLengthByte = 127;
            lengthBytes = Buffer.alloc(8);
            lengthBytes.writeBigUInt64BE(BigInt(length));
        }
        
        const header = Buffer.concat([
            Buffer.from([0x81, payloadLengthByte]),
            lengthBytes
        ]);
        
        return Buffer.concat([header, jsonBuffer]);
    }

    sendToClient(clientId, type, data) {
        const client = this.clients.get(clientId);
        if (client && client.socket) {
            try {
                const message = this.encodeMessage({ type, data });
                client.socket.write(message);
            } catch (error) {
                console.log('Error sending to client:', error);
            }
        }
    }

    broadcast(type, data, excludeClientId = null) {
        for (const [clientId, client] of this.clients) {
            if (clientId !== excludeClientId) {
                this.sendToClient(clientId, type, data);
            }
        }
    }
}

class SimpleServer {
    constructor() {
        this.users = [];
        this.messages = [];
        this.posts = [];
        this.gifts = [];
        this.promoCodes = [];
        this.initializeData();
    }

    initializeData() {
        // Тестовые пользователи
        this.users = [
            {
                id: '1',
                username: 'admin',
                displayName: 'Администратор',
                email: 'admin@example.com',
                password: 'admin123',
                avatar: null,
                description: 'Системный администратор',
                coins: 10000,
                verified: true,
                isDeveloper: true,
                status: 'online',
                lastSeen: new Date(),
                createdAt: new Date(),
                gifts: []
            },
            {
                id: '2',
                username: 'user1',
                displayName: 'Алексей',
                email: 'user1@example.com',
                password: 'user123',
                avatar: null,
                description: 'Обычный пользователь',
                coins: 1000,
                verified: false,
                isDeveloper: false,
                status: 'online',
                lastSeen: new Date(),
                createdAt: new Date(),
                gifts: []
            },
            {
                id: '3',
                username: 'user2',
                displayName: 'Мария',
                email: 'user2@example.com',
                password: 'user123',
                avatar: null,
                description: 'Любитель музыки',
                coins: 1500,
                verified: true,
                isDeveloper: false,
                status: 'offline',
                lastSeen: new Date(Date.now() - 30 * 60 * 1000),
                createdAt: new Date(),
                gifts: []
            }
        ];

        // Тестовые подарки
        this.gifts = [
            {
                id: '1',
                name: 'Золотая корона',
                type: 'crown',
                preview: '👑',
                price: 500
            },
            {
                id: '2',
                name: 'Сердечко',
                type: 'heart',
                preview: '❤️',
                price: 100
            },
            {
                id: '3',
                name: 'Звезда',
                type: 'star',
                preview: '⭐',
                price: 200
            },
            {
                id: '4',
                name: 'Картинка',
                type: 'image',
                preview: '🖼️',
                price: 300
            },
            {
                id: '5',
                name: 'Гифка',
                type: 'gif',
                preview: '🎆',
                price: 400
            }
        ];

        // Тестовые промокоды
        this.promoCodes = [
            {
                id: '1',
                code: 'WELCOME1000',
                coins: 1000,
                max_uses: 0,
                used_count: 0,
                created_at: new Date()
            },
            {
                id: '2',
                code: 'NEWUSER500',
                coins: 500,
                max_uses: 100,
                used_count: 45,
                created_at: new Date()
            }
        ];

        // Тестовые посты
        this.posts = [
            {
                id: '1',
                userId: '2',
                text: 'Привет всем! Это мой первый пост в Epic Messenger! 🎉',
                image: null,
                likes: ['1', '3'],
                comments: [],
                views: 15,
                createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
            },
            {
                id: '2',
                userId: '3',
                text: 'Отличная погода сегодня! Кто на прогулку? ☀️',
                image: null,
                likes: ['2'],
                comments: [],
                views: 8,
                createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000)
            }
        ];

        // Тестовые сообщения
        this.messages = [
            {
                id: '1',
                senderId: '2',
                toUserId: '1',
                text: 'Здравствуйте! У меня вопрос по работе приложения',
                type: 'text',
                timestamp: new Date(Date.now() - 30 * 60 * 1000),
                displayName: 'Алексей'
            },
            {
                id: '2',
                senderId: '1',
                toUserId: '2',
                text: 'Привет! Конечно, задавайте ваш вопрос',
                type: 'text',
                timestamp: new Date(Date.now() - 25 * 60 * 1000),
                displayName: 'Администратор'
            }
        ];
    }

    generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    authenticateToken(token) {
        return this.users.find(u => u.id === token);
    }

    serveStaticFile(res, filePath, contentType) {
        const fullPath = path.join(__dirname, filePath);
        
        fs.readFile(fullPath, (err, data) => {
            if (err) {
                console.log('File not found:', filePath);
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600'
            });
            res.end(data);
        });
    }

    handleApiRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        const method = req.method;
        
        let body = '';
        const decoder = new StringDecoder('utf-8');

        req.on('data', (chunk) => {
            body += decoder.write(chunk);
        });

        req.on('end', () => {
            body += decoder.end();
            
            let data = {};
            if (body) {
                try {
                    data = JSON.parse(body);
                } catch (e) {
                    // Если не JSON, пробуем как FormData
                    const params = new URLSearchParams(body);
                    data = Object.fromEntries(params);
                }
            }

            this.processApiRequest(pathname, method, data, parsedUrl.query, req, res);
        });
    }

    processApiRequest(pathname, method, data, query, req, res) {
        const headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
        };

        // CORS preflight
        if (method === 'OPTIONS') {
            res.writeHead(204, headers);
            res.end();
            return;
        }

        // Получение токена из заголовков
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

        let response;

        try {
            switch (pathname) {
                case '/api/login':
                    if (method === 'POST') {
                        response = this.handleLogin(data);
                    }
                    break;
                    
                case '/api/check-auth':
                    if (method === 'GET') {
                        response = this.handleCheckAuth(token);
                    }
                    break;
                    
                case '/api/current-user':
                    if (method === 'GET') {
                        response = this.handleCurrentUser(token);
                    }
                    break;
                    
                case '/api/users':
                    if (method === 'GET') {
                        response = this.handleGetUsers(token);
                    }
                    break;
                    
                case '/api/messages':
                    if (method === 'GET') {
                        response = this.handleGetMessages(token, query);
                    }
                    break;
                    
                case '/api/messages/send':
                    if (method === 'POST') {
                        response = this.handleSendMessage(token, data);
                    }
                    break;
                    
                case '/api/posts':
                    if (method === 'GET') {
                        response = this.handleGetPosts(token);
                    } else if (method === 'POST') {
                        response = this.handleCreatePost(token, data);
                    }
                    break;
                    
                case '/api/gifts':
                    if (method === 'GET') {
                        response = this.handleGetGifts(token);
                    }
                    break;
                    
                case '/api/promo-codes':
                    if (method === 'GET') {
                        response = this.handleGetPromoCodes(token);
                    }
                    break;
                    
                case '/api/promo-codes/activate':
                    if (method === 'POST') {
                        response = this.handleActivatePromoCode(token, data);
                    }
                    break;
                    
                case '/api/update-profile':
                    if (method === 'POST') {
                        response = this.handleUpdateProfile(token, data);
                    }
                    break;

                case '/api/admin/stats':
                    if (method === 'GET') {
                        response = this.handleAdminStats(token);
                    }
                    break;
                    
                case '/api/logout':
                    if (method === 'POST') {
                        response = { success: true, message: 'Успешный выход из системы' };
                    }
                    break;
                    
                default:
                    if (pathname.startsWith('/api/posts/') && pathname.endsWith('/like')) {
                        const postId = pathname.split('/')[3];
                        if (method === 'POST') {
                            response = this.handleLikePost(token, postId);
                        }
                    } else if (pathname.startsWith('/api/gifts/') && pathname.endsWith('/buy')) {
                        const giftId = pathname.split('/')[3];
                        if (method === 'POST') {
                            response = this.handleBuyGift(token, giftId, data);
                        }
                    } else if (pathname.startsWith('/api/users/')) {
                        const userId = pathname.split('/')[3];
                        if (method === 'GET') {
                            response = this.handleGetUser(token, userId);
                        }
                    } else if (pathname.startsWith('/api/user/') && pathname.includes('/transactions')) {
                        const userId = pathname.split('/')[3];
                        if (method === 'GET') {
                            response = this.handleGetTransactions(token, userId);
                        }
                    } else {
                        response = { success: false, message: 'API endpoint not found' };
                    }
            }
        } catch (error) {
            console.error('API Error:', error);
            response = { success: false, message: error.message };
        }

        if (!response) {
            response = { success: false, message: 'Method not allowed' };
        }

        res.writeHead(response.success ? 200 : 400, headers);
        res.end(JSON.stringify(response));
    }

    handleLogin(data) {
        const { username, password } = data;
        const user = this.users.find(u => u.username === username && u.password === password);
        
        if (!user) {
            return { success: false, message: 'Неверное имя пользователя или пароль' };
        }

        // Обновляем статус пользователя
        user.status = 'online';
        user.lastSeen = new Date();

        return {
            success: true,
            token: user.id,
            user: user
        };
    }

    handleCheckAuth(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { authenticated: false };
        }

        return {
            authenticated: true,
            user: user
        };
    }

    handleCurrentUser(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        return {
            success: true,
            user: user
        };
    }

    handleGetUsers(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const otherUsers = this.users.filter(u => u.id !== user.id);
        return {
            success: true,
            users: otherUsers
        };
    }

    handleGetUser(token, userId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const targetUser = this.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        return {
            success: true,
            user: targetUser
        };
    }

    handleGetMessages(token, query) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId, toUserId } = query;
        const chatMessages = this.messages.filter(msg => 
            (msg.senderId === userId && msg.toUserId === toUserId) ||
            (msg.senderId === toUserId && msg.toUserId === userId)
        );

        return {
            success: true,
            messages: chatMessages
        };
    }

    handleSendMessage(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId, toUserId, text, type } = data;
        const message = {
            id: this.generateId(),
            senderId: userId,
            toUserId: toUserId,
            text: text,
            type: type || 'text',
            timestamp: new Date(),
            displayName: user.displayName
        };

        this.messages.push(message);

        return {
            success: true,
            message: message
        };
    }

    handleGetPosts(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const postsWithUserInfo = this.posts.map(post => {
            const postUser = this.users.find(u => u.id === post.userId);
            return {
                ...post,
                userName: postUser ? postUser.displayName : 'Неизвестный',
                userAvatar: postUser ? postUser.avatar : null,
                userVerified: postUser ? postUser.verified : false,
                userDeveloper: postUser ? postUser.isDeveloper : false
            };
        });

        // Сортируем по дате (новые сначала)
        postsWithUserInfo.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return {
            success: true,
            posts: postsWithUserInfo
        };
    }

    handleCreatePost(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { text, image } = data;
        
        if (!text || text.trim() === '') {
            return { success: false, message: 'Текст поста не может быть пустым' };
        }

        const post = {
            id: this.generateId(),
            userId: user.id,
            text: text.trim(),
            image: image,
            likes: [],
            comments: [],
            views: 0,
            createdAt: new Date()
        };

        this.posts.unshift(post); // Добавляем в начало

        return {
            success: true,
            post: post
        };
    }

    handleLikePost(token, postId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const post = this.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

        const likeIndex = post.likes.indexOf(user.id);
        if (likeIndex === -1) {
            post.likes.push(user.id);
        } else {
            post.likes.splice(likeIndex, 1);
        }

        return {
            success: true,
            likes: post.likes
        };
    }

    handleGetGifts(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        return {
            success: true,
            gifts: this.gifts
        };
    }

    handleBuyGift(token, giftId, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const gift = this.gifts.find(g => g.id === giftId);
        if (!gift) {
            return { success: false, message: 'Подарок не найден' };
        }

        if (user.coins < gift.price) {
            return { success: false, message: 'Недостаточно E-COIN' };
        }

        // Списываем деньги
        user.coins -= gift.price;

        // Добавляем подарок пользователю
        if (!user.gifts) {
            user.gifts = [];
        }

        const userGift = {
            id: this.generateId(),
            giftId: gift.id,
            giftName: gift.name,
            giftType: gift.type,
            purchasedAt: new Date(),
            fromUserId: user.id
        };

        user.gifts.push(userGift);

        // Если подарок отправлен другому пользователю
        if (data.toUserId) {
            const toUser = this.users.find(u => u.id === data.toUserId);
            if (toUser) {
                if (!toUser.gifts) {
                    toUser.gifts = [];
                }
                toUser.gifts.push({
                    ...userGift,
                    fromUserId: user.id
                });

                // Создаем сообщение о подарке
                const giftMessage = {
                    id: this.generateId(),
                    senderId: user.id,
                    toUserId: data.toUserId,
                    type: 'gift',
                    giftName: gift.name,
                    giftType: gift.type,
                    giftPrice: gift.price,
                    timestamp: new Date(),
                    displayName: user.displayName
                };

                this.messages.push(giftMessage);
            }
        }

        return {
            success: true,
            giftName: gift.name,
            newBalance: user.coins
        };
    }

    handleGetPromoCodes(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        return {
            success: true,
            promoCodes: this.promoCodes
        };
    }

    handleActivatePromoCode(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { code } = data;
        const promoCode = this.promoCodes.find(p => p.code === code);

        if (!promoCode) {
            return { success: false, message: 'Промокод не найден' };
        }

        if (promoCode.max_uses > 0 && promoCode.used_count >= promoCode.max_uses) {
            return { success: false, message: 'Промокод уже использован максимальное количество раз' };
        }

        // Начисляем монеты
        user.coins += promoCode.coins;
        promoCode.used_count++;

        return {
            success: true,
            message: `Промокод активирован! Начислено ${promoCode.coins} E-COIN`,
            coins: promoCode.coins
        };
    }

    handleUpdateProfile(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { displayName, description, avatar } = data;

        if (displayName && displayName.trim()) {
            user.displayName = displayName.trim();
        }

        if (description !== undefined) {
            user.description = description;
        }

        if (avatar) {
            user.avatar = avatar;
        }

        return {
            success: true,
            user: user
        };
    }

    handleAdminStats(token) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        return {
            success: true,
            stats: {
                totalUsers: this.users.length,
                totalMessages: this.messages.length,
                totalPosts: this.posts.length,
                totalGifts: this.gifts.length,
                totalPromoCodes: this.promoCodes.length
            }
        };
    }

    handleGetTransactions(token, userId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // Временные данные для демо
        const transactions = [
            {
                description: 'Регистрация бонус',
                date: user.createdAt,
                amount: 1000
            },
            {
                description: 'Покупка подарка "Золотая корона"',
                date: new Date(Date.now() - 24 * 60 * 60 * 1000),
                amount: -500
            },
            {
                description: 'Активация промокода WELCOME1000',
                date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
                amount: 1000
            }
        ];

        return {
            success: true,
            transactions: transactions
        };
    }

    start(port = 3000) {
        const server = http.createServer((req, res) => {
            const parsedUrl = url.parse(req.url, true);
            const pathname = parsedUrl.pathname;

            console.log(`${new Date().toISOString()} - ${req.method} ${pathname}`);

            // API routes
            if (pathname.startsWith('/api/')) {
                this.handleApiRequest(req, res);
                return;
            }

            // Static files
            if (pathname === '/' || pathname === '/index.html') {
                this.serveStaticFile(res, 'public/main.html', 'text/html');
            } else if (pathname === '/login.html') {
                this.serveStaticFile(res, 'public/login.html', 'text/html');
            } else if (pathname.endsWith('.css')) {
                this.serveStaticFile(res, 'public' + pathname, 'text/css');
            } else if (pathname.endsWith('.js')) {
                this.serveStaticFile(res, 'public' + pathname, 'application/javascript');
            } else if (pathname.startsWith('/assets/')) {
                const ext = path.extname(pathname);
                const contentType = {
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.svg': 'image/svg+xml',
                    '.ico': 'image/x-icon'
                }[ext] || 'application/octet-stream';
                
                this.serveStaticFile(res, 'public' + pathname, contentType);
            } else {
                // Serve main.html for any other route (SPA)
                this.serveStaticFile(res, 'public/main.html', 'text/html');
            }
        });

        // Initialize WebSocket server
        const wsServer = new WebSocketServer(server);

        server.listen(port, () => {
            console.log(`🚀 Сервер запущен на порту ${port}`);
            console.log(`📧 Приложение готово к работе`);
            console.log(`👥 Тестовые пользователи:`);
            console.log(`   - Админ: admin / admin123`);
            console.log(`   - Пользователь 1: user1 / user123`);
            console.log(`   - Пользователь 2: user2 / user123`);
        });

        return server;
    }
}

// Запуск сервера
const server = new SimpleServer();
server.start(process.env.PORT || 3000);
