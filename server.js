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
        // Убираем предсозданного пользователя - теперь только при регистрации
        this.users = [];

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
                code: 'EPIC2024',
                coins: 2000,
                max_uses: 50,
                used_count: 0,
                created_at: new Date()
            }
        ];

        // Начальные посты
        this.posts = [
            {
                id: '1',
                userId: 'system',
                text: 'Добро пожаловать в Epic Messenger! 🚀\n\nЭто современная платформа для общения с уникальными возможностями:\n\n• Мгновенные сообщения\n• Система подарков и E-COIN\n• Лента постов\n• Админ панель для управления\n\nПрисоединяйтесь к нашему сообществу! 💬',
                image: null,
                likes: [],
                comments: [],
                views: 0,
                createdAt: new Date()
            }
        ];

        // Начальные сообщения
        this.messages = [];
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
                    
                case '/api/register':
                    if (method === 'POST') {
                        response = this.handleRegister(data);
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

                case '/api/admin/delete-user':
                    if (method === 'POST') {
                        response = this.handleDeleteUser(token, data);
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

    handleRegister(data) {
        const { username, displayName, email, password } = data;

        // Валидация
        if (!username || !displayName || !email || !password) {
            return { success: false, message: 'Все поля обязательны для заполнения' };
        }

        if (username.length < 3) {
            return { success: false, message: 'Имя пользователя должно содержать минимум 3 символа' };
        }

        if (password.length < 6) {
            return { success: false, message: 'Пароль должен содержать минимум 6 символов' };
        }

        // Проверяем, существует ли пользователь
        const existingUser = this.users.find(u => u.username === username);
        if (existingUser) {
            return { success: false, message: 'Пользователь с таким именем уже существует' };
        }

        const existingEmail = this.users.find(u => u.email === email);
        if (existingEmail) {
            return { success: false, message: 'Пользователь с таким email уже существует' };
        }

        // ПРОВЕРКА НА BayRex - даем особые права
        const isBayRex = username.toLowerCase() === 'bayrex';
        console.log(`🔍 Регистрация пользователя: ${username}, isBayRex: ${isBayRex}`);
        
        // Создаем нового пользователя
        const newUser = {
            id: this.generateId(),
            username: username,
            displayName: displayName,
            email: email,
            password: password,
            avatar: null,
            description: 'Новый пользователь Epic Messenger',
            coins: isBayRex ? 50000 : 1000, // BayRex получает 50к монет
            verified: isBayRex, // BayRex сразу верифицирован
            isDeveloper: isBayRex, // BayRex получает права разработчика
            status: 'online',
            lastSeen: new Date(),
            createdAt: new Date(),
            gifts: [],
            isProtected: isBayRex // BayRex защищен от удаления
        };

        this.users.push(newUser);

        if (isBayRex) {
            console.log(`👑 BayRex зарегистрирован с правами администратора!`);
            console.log(`✅ verified: ${newUser.verified}, isDeveloper: ${newUser.isDeveloper}`);
        } else {
            console.log(`✅ Новый пользователь зарегистрирован: ${username} (${displayName})`);
        }

        return {
            success: true,
            message: isBayRex ? 
                'Аккаунт BayRex создан! Вы получили права администратора!' :
                'Аккаунт успешно создан! Добро пожаловать в Epic Messenger!',
            user: newUser
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

    handleDeleteUser(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        
        // Проверяем, существует ли пользователь
        const targetUser = this.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        // Защита от удаления BayRex и защищенных пользователей
        if (targetUser.isProtected) {
            return { success: false, message: 'Нельзя удалить защищенного пользователя' };
        }

        // Нельзя удалить самого себя
        if (targetUser.id === user.id) {
            return { success: false, message: 'Нельзя удалить свой собственный аккаунт' };
        }

        // Удаляем пользователя
        this.users = this.users.filter(u => u.id !== userId);

        console.log(`🗑️ Пользователь ${user.displayName} удалил аккаунт: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} успешно удален`
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

        // Сортируем сообщения по времени
        chatMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

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

        const { toUserId, text, type } = data;

        if (!text || text.trim() === '') {
            return { success: false, message: 'Сообщение не может быть пустым' };
        }

        const message = {
            id: this.generateId(),
            senderId: user.id,
            toUserId: toUserId,
            text: text.trim(),
            type: type || 'text',
            timestamp: new Date(),
            displayName: user.displayName
        };

        this.messages.push(message);

        console.log(`💬 Новое сообщение от ${user.displayName} к пользователю ${toUserId}`);

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
            if (post.userId === 'system') {
                return {
                    ...post,
                    userName: 'Epic Messenger',
                    userAvatar: null,
                    userVerified: true,
                    userDeveloper: true
                };
            }
            
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

        const { text } = data;
        
        if (!text || text.trim() === '') {
            return { success: false, message: 'Текст поста не может быть пустым' };
        }

        const post = {
            id: this.generateId(),
            userId: user.id,
            text: text.trim(),
            image: null, // Пока без изображений
            likes: [],
            comments: [],
            views: 0,
            createdAt: new Date()
        };

        this.posts.unshift(post); // Добавляем в начало

        console.log(`📝 Новый пост от ${user.displayName}`);

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
            console.log(`❤️ Пользователь ${user.displayName} лайкнул пост`);
        } else {
            post.likes.splice(likeIndex, 1);
            console.log(`💔 Пользователь ${user.displayName} убрал лайк с поста`);
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
                console.log(`🎁 Пользователь ${user.displayName} отправил подарок пользователю ${toUser.displayName}`);
            }
        } else {
            console.log(`🎁 Пользователь ${user.displayName} купил подарок: ${gift.name}`);
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

        console.log(`💰 Пользователь ${user.displayName} активировал промокод ${code} (+${promoCode.coins} E-COIN)`);

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

        const { displayName, description } = data;

        if (displayName && displayName.trim()) {
            user.displayName = displayName.trim();
        }

        if (description !== undefined) {
            user.description = description;
        }

        console.log(`📝 Пользователь ${user.username} обновил профиль`);

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
                amount: user.coins >= 50000 ? 50000 : 1000 // BayRex получает 50к, остальные 1к
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
            console.log(`🔐 Доступные endpoints:`);
            console.log(`   - GET  /api/check-auth - Проверка авторизации`);
            console.log(`   - POST /api/login - Вход в систему`);
            console.log(`   - POST /api/register - Регистрация`);
            console.log(`   - GET  /api/users - Список пользователей`);
            console.log(`   - GET  /api/posts - Лента постов`);
            console.log(`   - POST /api/posts - Создание поста`);
            console.log(`   - GET  /api/gifts - Магазин подарков`);
            console.log(`   - POST /api/admin/delete-user - Удаление пользователя (только для админов)`);
            console.log(`\n👑 Особый пользователь:`);
            console.log(`   - BayRex - получает права администратора при регистрации`);
            console.log(`   • Полные права администратора`);
            console.log(`   • Защищенный аккаунт`);
            console.log(`   • Доступ к админ панели`);
            console.log(`   • 50,000 E-COIN начального баланса`);
        });

        return server;
    }
}

// Запуск сервера
const server = new SimpleServer();
server.start(process.env.PORT || 3000);
