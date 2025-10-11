const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { StringDecoder } = require('string_decoder');
const crypto = require('crypto');

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
        this.bannedIPs = new Map();
        this.devices = new Map();
        this.encryptionKey = crypto.randomBytes(32); // Ключ для шифрования
        
        // Создаем папки для загрузок если их нет
        this.ensureUploadDirs();
        this.initializeData();
    }

    // Создание папок для загрузок
    ensureUploadDirs() {
        const uploadDirs = ['uploads', 'uploads/avatars', 'uploads/gifts', 'uploads/posts'];
        uploadDirs.forEach(dir => {
            const dirPath = path.join(__dirname, 'public', dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
        });
    }

    // Шифрование данных
    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    // Дешифрование данных
    decrypt(encryptedText) {
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    // Хеширование пароля
    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    // Получение IP адреса из запроса
    getClientIP(req) {
        return req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               (req.connection.socket ? req.connection.socket.remoteAddress : null);
    }

    // Получение информации об устройстве
    getDeviceInfo(req) {
        const userAgent = req.headers['user-agent'] || '';
        let browser = 'Unknown';
        let os = 'Unknown';
        
        // Определяем браузер
        if (userAgent.includes('Chrome')) browser = 'Chrome';
        else if (userAgent.includes('Firefox')) browser = 'Firefox';
        else if (userAgent.includes('Safari')) browser = 'Safari';
        else if (userAgent.includes('Edge')) browser = 'Edge';
        
        // Определяем ОС
        if (userAgent.includes('Windows')) os = 'Windows';
        else if (userAgent.includes('Mac')) os = 'Mac OS';
        else if (userAgent.includes('Linux')) os = 'Linux';
        else if (userAgent.includes('Android')) os = 'Android';
        else if (userAgent.includes('iOS')) os = 'iOS';
        
        return {
            browser,
            os,
            userAgent
        };
    }

    // Генерация ID устройства
    generateDeviceId(req) {
        const ip = this.getClientIP(req);
        const deviceInfo = this.getDeviceInfo(req);
        const deviceString = `${ip}-${deviceInfo.browser}-${deviceInfo.os}`;
        return crypto.createHash('md5').update(deviceString).digest('hex');
    }

    // Проверка бана по IP
    isIPBanned(ip) {
        const banInfo = this.bannedIPs.get(ip);
        if (!banInfo) return false;
        
        // Проверяем срок бана
        if (banInfo.expires && banInfo.expires < Date.now()) {
            this.bannedIPs.delete(ip);
            return false;
        }
        
        return true;
    }

    // Бан IP
    banIP(ip, duration = 30 * 24 * 60 * 60 * 1000) { // 30 дней по умолчанию
        this.bannedIPs.set(ip, {
            bannedAt: new Date(),
            expires: Date.now() + duration
        });
    }

    // Валидация файлов для аватаров (только фото)
    validateAvatarFile(filename) {
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    // Валидация файлов для подарков (фото + gif + svg)
    validateGiftFile(filename) {
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    // Валидация файлов для постов
    validatePostFile(filename) {
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    // Улучшенная валидация контента - запрещает ссылки, HTML, SVG, скрипты
    sanitizeContent(content) {
        if (typeof content !== 'string') return '';
        
        // Удаляем все URL (http, https, ftp, IP-адреса)
        let sanitized = content
            .replace(/(https?|ftp)\/\/[^\s/$.#].[^\s]*/gi, '[ССЫЛКА УДАЛЕНА]')
            .replace(/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/[^\s]*)?/gi, (match) => {
                // Проверяем, похоже ли на домен
                if (match.includes('.') && !match.includes(' ')) {
                    return '[ССЫЛКА УДАЛЕНА]';
                }
                return match;
            })
            .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP УДАЛЕН]');

        // Удаляем все HTML теги и специальные символы
        sanitized = sanitized
            .replace(/<[^>]*>/g, '') // Удаляем все HTML теги
            .replace(/&[^;]+;/g, '') // Удаляем HTML entities
            .replace(/javascript:/gi, '')
            .replace(/data:/gi, '')
            .replace(/vbscript:/gi, '')
            .replace(/on\w+="[^"]*"/gi, '')
            .replace(/on\w+='[^']*'/gi, '')
            .replace(/on\w+=\w+/gi, '')
            .trim();

        // Дополнительная защита от XSS
        const dangerousPatterns = [
            /<script[\s\S]*?<\/script>/gi,
            /<svg[\s\S]*?<\/svg>/gi,
            /<object[\s\S]*?<\/object>/gi,
            /<embed[\s\S]*?<\/embed>/gi,
            /<iframe[\s\S]*?<\/iframe>/gi,
            /<link[\s\S]*?>/gi,
            /<meta[\s\S]*?>/gi,
            /<style[\s\S]*?<\/style>/gi,
            /expression\(/gi,
            /url\(/gi
        ];

        dangerousPatterns.forEach(pattern => {
            sanitized = sanitized.replace(pattern, '');
        });

        // Ограничиваем длину
        if (sanitized.length > 5000) {
            sanitized = sanitized.substring(0, 5000);
        }

        return sanitized;
    }

    // Сохранение файла
    saveFile(fileData, filename, type) {
        return new Promise((resolve, reject) => {
            try {
                // Определяем папку для сохранения
                let uploadDir = 'uploads';
                if (type === 'avatar') uploadDir = 'uploads/avatars';
                else if (type === 'gift') uploadDir = 'uploads/gifts';
                else if (type === 'post') uploadDir = 'uploads/posts';

                const filePath = path.join(__dirname, 'public', uploadDir, filename);
                
                // Удаляем префикс data URL если есть
                const base64Data = fileData.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                
                fs.writeFile(filePath, buffer, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(`/${uploadDir}/${filename}`);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    // Удаление файла
    deleteFile(fileUrl) {
        if (!fileUrl || !fileUrl.startsWith('/uploads/')) return;
        
        const filePath = path.join(__dirname, 'public', fileUrl.substring(1));
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    initializeData() {
        this.users = [];

        // Базовые подарки
        this.gifts = [
            {
                id: '1',
                name: 'Золотая корона',
                type: 'crown',
                preview: '👑',
                price: 500,
                image: null
            },
            {
                id: '2',
                name: 'Сердечко',
                type: 'heart',
                preview: '❤️',
                price: 100,
                image: null
            },
            {
                id: '3',
                name: 'Звезда',
                type: 'star',
                preview: '⭐',
                price: 200,
                image: null
            }
        ];

        // Промокоды
        this.promoCodes = [
            {
                id: '1',
                code: 'WELCOME1000',
                coins: 1000,
                max_uses: 0,
                used_count: 0,
                created_at: new Date()
            }
        ];

        // Начальные посты
        this.posts = [
            {
                id: '1',
                userId: 'system',
                text: 'Добро пожаловать в Epic Messenger! 🚀',
                image: null,
                likes: [],
                comments: [],
                views: 0,
                createdAt: new Date()
            }
        ];

        this.messages = [];
    }

    generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    authenticateToken(token) {
        return this.users.find(u => u.id === token);
    }

    // Регистрация устройства
    registerDevice(userId, req) {
        const deviceId = this.generateDeviceId(req);
        const deviceInfo = this.getDeviceInfo(req);
        const ip = this.getClientIP(req);
        
        const device = {
            id: deviceId,
            userId: userId,
            name: `${deviceInfo.browser} on ${deviceInfo.os}`,
            browser: deviceInfo.browser,
            os: deviceInfo.os,
            ip: ip,
            userAgent: deviceInfo.userAgent,
            lastActive: new Date(),
            createdAt: new Date(),
            isOwner: false // Определяется при первой регистрации
        };
        
        // Проверяем, является ли это первым устройством пользователя
        const userDevices = Array.from(this.devices.values()).filter(d => d.userId === userId);
        if (userDevices.length === 0) {
            device.isOwner = true;
        }
        
        this.devices.set(deviceId, device);
        return device;
    }

    // Получение устройств пользователя
    getUserDevices(userId) {
        return Array.from(this.devices.values()).filter(device => device.userId === userId);
    }

    // Завершение сеанса устройства
    terminateDevice(userId, deviceId) {
        const device = this.devices.get(deviceId);
        if (!device || device.userId !== userId) {
            return false;
        }
        
        // Проверяем права на завершение сеанса
        const userDevices = this.getUserDevices(userId);
        const isOwner = userDevices.some(d => d.isOwner);
        const targetDevice = userDevices.find(d => d.id === deviceId);
        
        if (!targetDevice) return false;
        
        // Владелец может завершить любой сеанс, другие пользователи - только через 24 часа
        if (targetDevice.isOwner || isOwner) {
            this.devices.delete(deviceId);
            return true;
        } else {
            // Проверяем, прошло ли 24 часа
            const timeDiff = Date.now() - new Date(targetDevice.createdAt).getTime();
            if (timeDiff > 24 * 60 * 60 * 1000) {
                this.devices.delete(deviceId);
                return true;
            }
            return false;
        }
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

        if (method === 'OPTIONS') {
            res.writeHead(204, headers);
            res.end();
            return;
        }

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

        let response;

        try {
            switch (pathname) {
                case '/api/login':
                    if (method === 'POST') {
                        response = this.handleLogin(data, req);
                    }
                    break;
                    
                case '/api/register':
                    if (method === 'POST') {
                        response = this.handleRegister(data, req);
                    }
                    break;
                    
                case '/api/check-auth':
                    if (method === 'GET') {
                        response = this.handleCheckAuth(token, req);
                    }
                    break;
                    
                case '/api/current-user':
                    if (method === 'GET') {
                        response = this.handleCurrentUser(token, req);
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
                    } else if (method === 'DELETE') {
                        response = this.handleDeletePost(token, query);
                    }
                    break;
                    
                case '/api/gifts':
                    if (method === 'GET') {
                        response = this.handleGetGifts(token);
                    } else if (method === 'POST') {
                        response = this.handleCreateGift(token, data);
                    }
                    break;
                    
                case '/api/promo-codes':
                    if (method === 'GET') {
                        response = this.handleGetPromoCodes(token);
                    }
                    break;
                    
                case '/api/promo-codes/create':
                    if (method === 'POST') {
                        response = this.handleCreatePromoCode(token, data);
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

                case '/api/update-avatar':
                    if (method === 'POST') {
                        response = this.handleUpdateAvatar(token, data);
                    }
                    break;

                case '/api/upload-avatar':
                    if (method === 'POST') {
                        response = this.handleUploadAvatar(token, data);
                    }
                    break;

                case '/api/upload-gift':
                    if (method === 'POST') {
                        response = this.handleUploadGift(token, data);
                    }
                    break;

                case '/api/upload-post-image':
                    if (method === 'POST') {
                        response = this.handleUploadPostImage(token, data);
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

                case '/api/admin/ban-user':
                    if (method === 'POST') {
                        response = this.handleBanUser(token, data);
                    }
                    break;

                case '/api/admin/toggle-verification':
                    if (method === 'POST') {
                        response = this.handleToggleVerification(token, data);
                    }
                    break;

                case '/api/admin/toggle-developer':
                    if (method === 'POST') {
                        response = this.handleToggleDeveloper(token, data);
                    }
                    break;

                case '/api/emoji':
                    if (method === 'GET') {
                        response = this.handleGetEmoji(token);
                    }
                    break;

                case '/api/devices':
                    if (method === 'GET') {
                        response = this.handleGetDevices(token);
                    }
                    break;

                case '/api/devices/terminate':
                    if (method === 'POST') {
                        response = this.handleTerminateDevice(token, data);
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

    handleLogin(data, req) {
        const { username, password } = data;
        const hashedPassword = this.hashPassword(password);
        const user = this.users.find(u => u.username === username && u.password === hashedPassword);
        
        if (!user) {
            return { success: false, message: 'Неверное имя пользователя или пароль' };
        }

        // Проверяем бан пользователя
        if (user.banned) {
            return { success: false, message: 'Аккаунт заблокирован' };
        }

        // Проверяем бан по IP
        const clientIP = this.getClientIP(req);
        if (this.isIPBanned(clientIP)) {
            return { success: false, message: 'Ваш IP адрес заблокирован' };
        }

        // Регистрируем устройство
        const device = this.registerDevice(user.id, req);

        user.status = 'online';
        user.lastSeen = new Date();

        return {
            success: true,
            token: user.id,
            deviceId: device.id,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                avatar: user.avatar,
                description: user.description,
                coins: user.coins,
                verified: user.verified,
                isDeveloper: user.isDeveloper,
                status: user.status,
                lastSeen: user.lastSeen,
                createdAt: user.createdAt,
                friendsCount: user.friendsCount || 0,
                postsCount: user.postsCount || 0,
                giftsCount: user.giftsCount || 0,
                banned: user.banned || false
            }
        };
    }

    handleRegister(data, req) {
        const { username, displayName, email, password } = data;

        // Проверяем бан по IP
        const clientIP = this.getClientIP(req);
        if (this.isIPBanned(clientIP)) {
            return { success: false, message: 'Ваш IP адрес заблокирован. Регистрация невозможна.' };
        }

        if (!username || !displayName || !email || !password) {
            return { success: false, message: 'Все поля обязательны для заполнения' };
        }

        if (username.length < 3) {
            return { success: false, message: 'Имя пользователя должно содержать минимум 3 символа' };
        }

        if (password.length < 6) {
            return { success: false, message: 'Пароль должен содержать минимум 6 символов' };
        }

        // Очищаем входные данные
        const sanitizedUsername = this.sanitizeContent(username);
        const sanitizedDisplayName = this.sanitizeContent(displayName);
        const sanitizedEmail = this.sanitizeContent(email);

        const existingUser = this.users.find(u => u.username === sanitizedUsername);
        if (existingUser) {
            return { success: false, message: 'Пользователь с таким именем уже существует' };
        }

        const existingEmail = this.users.find(u => u.email === sanitizedEmail);
        if (existingEmail) {
            return { success: false, message: 'Пользователь с таким email уже существует' };
        }

        const isBayRex = sanitizedUsername.toLowerCase() === 'bayrex';
        console.log(`🔍 Регистрация пользователя: ${sanitizedUsername}, isBayRex: ${isBayRex}`);
        
        const newUser = {
            id: this.generateId(),
            username: sanitizedUsername,
            displayName: sanitizedDisplayName,
            email: sanitizedEmail,
            password: this.hashPassword(password), // Хешируем пароль
            avatar: null,
            description: 'Новый пользователь Epic Messenger',
            coins: isBayRex ? 50000 : 1000,
            verified: isBayRex,
            isDeveloper: isBayRex,
            status: 'online',
            lastSeen: new Date(),
            createdAt: new Date(),
            gifts: [],
            isProtected: isBayRex,
            friendsCount: 0,
            postsCount: 0,
            giftsCount: 0,
            banned: false
        };

        this.users.push(newUser);

        // Регистрируем устройство
        const device = this.registerDevice(newUser.id, req);

        if (isBayRex) {
            console.log(`👑 BayRex зарегистрирован с правами администратора!`);
        }

        return {
            success: true,
            message: isBayRex ? 
                'Аккаунт BayRex создан! Вы получили права администратора!' :
                'Аккаунт успешно создан! Добро пожаловать в Epic Messenger!',
            token: newUser.id,
            deviceId: device.id,
            user: {
                id: newUser.id,
                username: newUser.username,
                displayName: newUser.displayName,
                email: newUser.email,
                avatar: newUser.avatar,
                description: newUser.description,
                coins: newUser.coins,
                verified: newUser.verified,
                isDeveloper: newUser.isDeveloper,
                status: newUser.status,
                lastSeen: newUser.lastSeen,
                createdAt: newUser.createdAt,
                friendsCount: newUser.friendsCount,
                postsCount: newUser.postsCount,
                giftsCount: newUser.giftsCount,
                banned: newUser.banned
            }
        };
    }

    handleCheckAuth(token, req) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { authenticated: false };
        }

        // Проверяем бан пользователя
        if (user.banned) {
            return { authenticated: false, message: 'Аккаунт заблокирован' };
        }

        // Проверяем бан по IP
        const clientIP = this.getClientIP(req);
        if (this.isIPBanned(clientIP)) {
            return { authenticated: false, message: 'IP адрес заблокирован' };
        }

        // Обновляем активность устройства
        const deviceId = this.generateDeviceId(req);
        const device = this.devices.get(deviceId);
        if (device && device.userId === user.id) {
            device.lastActive = new Date();
        }

        return {
            authenticated: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                avatar: user.avatar,
                description: user.description,
                coins: user.coins,
                verified: user.verified,
                isDeveloper: user.isDeveloper,
                status: user.status,
                lastSeen: user.lastSeen,
                createdAt: user.createdAt,
                friendsCount: user.friendsCount || 0,
                postsCount: user.postsCount || 0,
                giftsCount: user.giftsCount || 0,
                banned: user.banned || false
            }
        };
    }

    handleCurrentUser(token, req) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // Проверяем бан пользователя
        if (user.banned) {
            return { success: false, message: 'Аккаунт заблокирован' };
        }

        // Проверяем бан по IP
        const clientIP = this.getClientIP(req);
        if (this.isIPBanned(clientIP)) {
            return { success: false, message: 'IP адрес заблокирован' };
        }

        // Обновляем активность устройства
        const deviceId = this.generateDeviceId(req);
        const device = this.devices.get(deviceId);
        if (device && device.userId === user.id) {
            device.lastActive = new Date();
        }

        return {
            success: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                avatar: user.avatar,
                description: user.description,
                coins: user.coins,
                verified: user.verified,
                isDeveloper: user.isDeveloper,
                status: user.status,
                lastSeen: user.lastSeen,
                createdAt: user.createdAt,
                friendsCount: user.friendsCount || 0,
                postsCount: user.postsCount || 0,
                giftsCount: user.giftsCount || 0,
                banned: user.banned || false
            }
        };
    }

    handleGetUsers(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const otherUsers = this.users.filter(u => u.id !== user.id).map(u => ({
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            avatar: u.avatar,
            description: u.description,
            coins: u.coins,
            verified: u.verified,
            isDeveloper: u.isDeveloper,
            status: u.status,
            lastSeen: u.lastSeen,
            createdAt: u.createdAt,
            friendsCount: u.friendsCount || 0,
            postsCount: u.postsCount || 0,
            giftsCount: u.giftsCount || 0,
            banned: u.banned || false
        }));

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
            user: {
                id: targetUser.id,
                username: targetUser.username,
                displayName: targetUser.displayName,
                avatar: targetUser.avatar,
                description: targetUser.description,
                coins: targetUser.coins,
                verified: targetUser.verified,
                isDeveloper: targetUser.isDeveloper,
                status: targetUser.status,
                lastSeen: targetUser.lastSeen,
                createdAt: targetUser.createdAt,
                friendsCount: targetUser.friendsCount || 0,
                postsCount: targetUser.postsCount || 0,
                giftsCount: targetUser.giftsCount || 0,
                banned: targetUser.banned || false
            }
        };
    }

    handleDeleteUser(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        
        const targetUser = this.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        if (targetUser.isProtected) {
            return { success: false, message: 'Нельзя удалить защищенного пользователя' };
        }

        if (targetUser.id === user.id) {
            return { success: false, message: 'Нельзя удалить свой собственный аккаунт' };
        }

        // Удаляем аватар пользователя если есть
        if (targetUser.avatar && targetUser.avatar.startsWith('/uploads/avatars/')) {
            this.deleteFile(targetUser.avatar);
        }

        // Удаляем устройства пользователя
        Array.from(this.devices.entries()).forEach(([deviceId, device]) => {
            if (device.userId === userId) {
                this.devices.delete(deviceId);
            }
        });

        this.users = this.users.filter(u => u.id !== userId);

        console.log(`🗑️ Пользователь ${user.displayName} удалил аккаунт: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} успешно удален`
        };
    }

    handleBanUser(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId, banned } = data;
        
        const targetUser = this.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        if (targetUser.isProtected) {
            return { success: false, message: 'Нельзя заблокировать защищенного пользователя' };
        }

        targetUser.banned = banned;

        // Если бан, то добавляем IP в бан лист
        if (banned) {
            // Находим последнее устройство пользователя для получения IP
            const userDevices = this.getUserDevices(userId);
            if (userDevices.length > 0) {
                const lastDevice = userDevices[userDevices.length - 1];
                this.banIP(lastDevice.ip);
            }
        }

        console.log(`🔒 Пользователь ${user.displayName} ${banned ? 'заблокировал' : 'разблокировал'} аккаунт: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} ${banned ? 'заблокирован' : 'разблокирован'}`
        };
    }

    handleToggleVerification(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        
        const targetUser = this.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        targetUser.verified = !targetUser.verified;

        console.log(`✅ Пользователь ${user.displayName} ${targetUser.verified ? 'верифицировал' : 'снял верификацию с'} аккаунта: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} ${targetUser.verified ? 'верифицирован' : 'лишен верификации'}`,
            verified: targetUser.verified
        };
    }

    handleToggleDeveloper(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        
        const targetUser = this.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        targetUser.isDeveloper = !targetUser.isDeveloper;

        console.log(`👑 Пользователь ${user.displayName} ${targetUser.isDeveloper ? 'дал права разработчика' : 'забрал права разработчика'} у: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} ${targetUser.isDeveloper ? 'получил права разработчика' : 'лишен прав разработчика'}`,
            isDeveloper: targetUser.isDeveloper
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

        // Дешифруем сообщения
        const decryptedMessages = chatMessages.map(msg => ({
            ...msg,
            text: msg.encrypted ? this.decrypt(msg.text) : msg.text
        }));

        decryptedMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        return {
            success: true,
            messages: decryptedMessages
        };
    }

    handleSendMessage(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { toUserId, text, type, image } = data;

        if (!text || text.trim() === '') {
            return { success: false, message: 'Сообщение не может быть пустым' };
        }

        // Очищаем текст от опасного контента
        const sanitizedText = this.sanitizeContent(text.trim());

        if (sanitizedText.length === 0) {
            return { success: false, message: 'Сообщение содержит запрещенный контент' };
        }

        // Шифруем сообщение
        const encryptedText = this.encrypt(sanitizedText);

        const message = {
            id: this.generateId(),
            senderId: user.id,
            toUserId: toUserId,
            text: encryptedText,
            encrypted: true,
            type: type || 'text',
            image: image || null,
            timestamp: new Date(),
            displayName: user.displayName
        };

        this.messages.push(message);

        console.log(`💬 Новое сообщение от ${user.displayName} к пользователю ${toUserId}`);

        return {
            success: true,
            message: {
                ...message,
                text: sanitizedText // Возвращаем очищенный текст для клиента
            }
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

        // Очищаем текст от опасного контента
        const sanitizedText = this.sanitizeContent(text.trim());

        if (sanitizedText.length === 0) {
            return { success: false, message: 'Текст поста содержит запрещенный контент' };
        }

        const post = {
            id: this.generateId(),
            userId: user.id,
            text: sanitizedText,
            image: image,
            likes: [],
            comments: [],
            views: 0,
            createdAt: new Date()
        };

        this.posts.unshift(post);
        user.postsCount = (user.postsCount || 0) + 1;

        console.log(`📝 Новый пост от ${user.displayName}`);

        return {
            success: true,
            post: {
                ...post,
                userName: user.displayName,
                userAvatar: user.avatar,
                userVerified: user.verified,
                userDeveloper: user.isDeveloper
            }
        };
    }

    handleDeletePost(token, query) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { postId } = query;
        const postIndex = this.posts.findIndex(p => p.id === postId);
        
        if (postIndex === -1) {
            return { success: false, message: 'Пост не найден' };
        }

        const post = this.posts[postIndex];
        
        // Администраторы могут удалять любые посты, кроме системных
        if (post.userId === 'system') {
            return { success: false, message: 'Нельзя удалить системный пост' };
        }

        // Удаляем изображение поста если есть
        if (post.image && post.image.startsWith('/uploads/posts/')) {
            this.deleteFile(post.image);
        }

        this.posts.splice(postIndex, 1);

        // Уменьшаем счетчик постов пользователя
        const postUser = this.users.find(u => u.id === post.userId);
        if (postUser && postUser.postsCount > 0) {
            postUser.postsCount--;
        }

        console.log(`🗑️ Администратор ${user.displayName} удалил пост пользователя ${postUser ? postUser.username : 'unknown'}`);

        return {
            success: true,
            message: 'Пост успешно удален'
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

    handleCreateGift(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { name, price, type, image } = data;
        
        if (!name || !price) {
            return { success: false, message: 'Название и цена обязательны' };
        }

        // Очищаем название подарка
        const sanitizedName = this.sanitizeContent(name);

        const gift = {
            id: this.generateId(),
            name: sanitizedName,
            type: type || 'custom',
            preview: image ? '🖼️' : '🎁',
            price: parseInt(price),
            image: image,
            createdAt: new Date()
        };

        this.gifts.push(gift);

        console.log(`🎁 Администратор ${user.displayName} создал новый подарок: ${sanitizedName}`);

        return {
            success: true,
            gift: gift
        };
    }

    handleBuyGift(token, giftId, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { toUserId } = data;
        const gift = this.gifts.find(g => g.id === giftId);
        
        if (!gift) {
            return { success: false, message: 'Подарок не найден' };
        }

        if (user.coins < gift.price) {
            return { success: false, message: 'Недостаточно E-COIN для покупки подарка' };
        }

        const recipient = this.users.find(u => u.id === toUserId);
        if (!recipient) {
            return { success: false, message: 'Получатель не найден' };
        }

        // Списание средств
        user.coins -= gift.price;

        // Создание сообщения о подарке
        const giftMessage = {
            id: this.generateId(),
            senderId: user.id,
            toUserId: toUserId,
            text: '',
            encrypted: false,
            type: 'gift',
            giftId: gift.id,
            giftName: gift.name,
            giftPrice: gift.price,
            giftImage: gift.image,
            giftPreview: gift.preview,
            timestamp: new Date(),
            displayName: user.displayName
        };

        this.messages.push(giftMessage);

        // Добавляем подарок получателю
        if (!recipient.gifts) recipient.gifts = [];
        recipient.gifts.push({
            id: this.generateId(),
            giftId: gift.id,
            fromUserId: user.id,
            fromUserName: user.displayName,
            receivedAt: new Date()
        });

        recipient.giftsCount = (recipient.giftsCount || 0) + 1;

        console.log(`🎁 Пользователь ${user.displayName} отправил подарок "${gift.name}" пользователю ${recipient.displayName}`);

        return {
            success: true,
            message: `Подарок "${gift.name}" успешно отправлен!`,
            gift: gift
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

    handleCreatePromoCode(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { code, coins, max_uses } = data;
        
        if (!code || !coins) {
            return { success: false, message: 'Код и количество коинов обязательны' };
        }

        // Очищаем код промокода
        const sanitizedCode = this.sanitizeContent(code.toUpperCase());

        const existingPromo = this.promoCodes.find(p => p.code === sanitizedCode);
        if (existingPromo) {
            return { success: false, message: 'Промокод с таким кодом уже существует' };
        }

        const promoCode = {
            id: this.generateId(),
            code: sanitizedCode,
            coins: parseInt(coins),
            max_uses: max_uses || 0,
            used_count: 0,
            created_at: new Date()
        };

        this.promoCodes.push(promoCode);

        console.log(`🎫 Администратор ${user.username} создал промокод: ${sanitizedCode}`);

        return {
            success: true,
            promoCode: promoCode
        };
    }

    handleActivatePromoCode(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { code } = data;
        const sanitizedCode = this.sanitizeContent(code.toUpperCase());
        const promoCode = this.promoCodes.find(p => p.code === sanitizedCode);

        if (!promoCode) {
            return { success: false, message: 'Промокод не найден' };
        }

        if (promoCode.max_uses > 0 && promoCode.used_count >= promoCode.max_uses) {
            return { success: false, message: 'Промокод уже использован максимальное количество раз' };
        }

        user.coins += promoCode.coins;
        promoCode.used_count++;

        console.log(`💰 Пользователь ${user.displayName} активировал промокод ${sanitizedCode} (+${promoCode.coins} E-COIN)`);

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

        const { displayName, description, username, email } = data;

        // Очищаем данные от опасного контента
        if (displayName && displayName.trim()) {
            user.displayName = this.sanitizeContent(displayName.trim());
        }

        if (description !== undefined) {
            user.description = this.sanitizeContent(description);
        }

        if (username && username.trim() && username !== user.username) {
            const sanitizedUsername = this.sanitizeContent(username.trim());
            const existingUser = this.users.find(u => u.username === sanitizedUsername && u.id !== user.id);
            if (existingUser) {
                return { success: false, message: 'Имя пользователя уже занято' };
            }
            user.username = sanitizedUsername;
        }

        if (email && email.trim() && email !== user.email) {
            const sanitizedEmail = this.sanitizeContent(email.trim());
            const existingEmail = this.users.find(u => u.email === sanitizedEmail && u.id !== user.id);
            if (existingEmail) {
                return { success: false, message: 'Email уже используется' };
            }
            user.email = sanitizedEmail;
        }

        console.log(`📝 Пользователь ${user.username} обновил профиль`);

        return {
            success: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                avatar: user.avatar,
                description: user.description,
                coins: user.coins,
                verified: user.verified,
                isDeveloper: user.isDeveloper,
                status: user.status,
                lastSeen: user.lastSeen,
                createdAt: user.createdAt,
                friendsCount: user.friendsCount || 0,
                postsCount: user.postsCount || 0,
                giftsCount: user.giftsCount || 0,
                banned: user.banned || false
            }
        };
    }

    handleUpdateAvatar(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { avatar } = data;

        // Удаляем старый аватар если он был загруженным файлом
        if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
            this.deleteFile(user.avatar);
        }

        user.avatar = avatar;

        console.log(`🖼️ Пользователь ${user.username} обновил аватар`);

        return {
            success: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                avatar: user.avatar,
                description: user.description,
                coins: user.coins,
                verified: user.verified,
                isDeveloper: user.isDeveloper,
                status: user.status,
                lastSeen: user.lastSeen,
                createdAt: user.createdAt,
                friendsCount: user.friendsCount || 0,
                postsCount: user.postsCount || 0,
                giftsCount: user.giftsCount || 0,
                banned: user.banned || false
            }
        };
    }

    // Загрузка аватара из файла
    async handleUploadAvatar(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { fileData, filename } = data;

        // Проверяем тип файла для аватара
        if (!this.validateAvatarFile(filename)) {
            return { success: false, message: 'Недопустимый формат файла для аватара. Разрешены только изображения.' };
        }

        // Проверяем размер файла (5 МБ максимум для аватара)
        if (fileData.length > 5 * 1024 * 1024) {
            return { success: false, message: 'Размер файла не должен превышать 5 МБ' };
        }

        try {
            // Генерируем уникальное имя файла
            const fileExt = path.extname(filename);
            const uniqueFilename = `avatar_${user.id}_${Date.now()}${fileExt}`;
            
            // Сохраняем файл
            const fileUrl = await this.saveFile(fileData, uniqueFilename, 'avatar');

            // Удаляем старый аватар если он был загруженным файлом
            if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
                this.deleteFile(user.avatar);
            }

            // Обновляем аватар пользователя
            user.avatar = fileUrl;

            console.log(`🖼️ Пользователь ${user.username} загрузил аватар: ${filename}`);

            return {
                success: true,
                avatarUrl: fileUrl,
                user: {
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    email: user.email,
                    avatar: user.avatar,
                    description: user.description,
                    coins: user.coins,
                    verified: user.verified,
                    isDeveloper: user.isDeveloper,
                    status: user.status,
                    lastSeen: user.lastSeen,
                    createdAt: user.createdAt,
                    friendsCount: user.friendsCount || 0,
                    postsCount: user.postsCount || 0,
                    giftsCount: user.giftsCount || 0,
                    banned: user.banned || false
                }
            };
        } catch (error) {
            console.error('Ошибка загрузки аватара:', error);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    // Загрузка изображения подарка
    async handleUploadGift(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { fileData, filename } = data;

        // Проверяем тип файла для подарка
        if (!this.validateGiftFile(filename)) {
            return { success: false, message: 'Недопустимый формат файла для подарка. Разрешены изображения, GIF и SVG.' };
        }

        // Проверяем размер файла (10 МБ максимум)
        if (fileData.length > 10 * 1024 * 1024) {
            return { success: false, message: 'Размер файла не должен превышать 10 МБ' };
        }

        try {
            // Генерируем уникальное имя файла
            const fileExt = path.extname(filename);
            const uniqueFilename = `gift_${Date.now()}${fileExt}`;
            
            // Сохраняем файл
            const fileUrl = await this.saveFile(fileData, uniqueFilename, 'gift');

            console.log(`🎁 Администратор ${user.username} загрузил изображение подарка: ${filename}`);

            return {
                success: true,
                imageUrl: fileUrl
            };
        } catch (error) {
            console.error('Ошибка загрузки изображения подарка:', error);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    // Загрузка изображения для поста
    async handleUploadPostImage(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { fileData, filename } = data;

        // Проверяем тип файла для поста
        if (!this.validatePostFile(filename)) {
            return { success: false, message: 'Недопустимый формат файла для поста. Разрешены только изображения.' };
        }

        // Проверяем размер файла (10 МБ максимум)
        if (fileData.length > 10 * 1024 * 1024) {
            return { success: false, message: 'Размер файла не должен превышать 10 МБ' };
        }

        try {
            // Генерируем уникальное имя файла
            const fileExt = path.extname(filename);
            const uniqueFilename = `post_${user.id}_${Date.now()}${fileExt}`;
            
            // Сохраняем файл
            const fileUrl = await this.saveFile(fileData, uniqueFilename, 'post');

            console.log(`📸 Пользователь ${user.username} загрузил изображение для поста: ${filename}`);

            return {
                success: true,
                imageUrl: fileUrl
            };
        } catch (error) {
            console.error('Ошибка загрузки изображения для поста:', error);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    handleGetEmoji(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        try {
            const emojiPath = path.join(__dirname, 'public', 'assets', 'emoji');
            const files = fs.readdirSync(emojiPath);
            const emojiList = files.filter(file => 
                file.endsWith('.png') || file.endsWith('.svg') || file.endsWith('.gif')
            ).map(file => ({
                name: file,
                url: `/assets/emoji/${file}`
            }));

            return {
                success: true,
                emoji: emojiList
            };
        } catch (error) {
            return {
                success: true,
                emoji: []
            };
        }
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
                totalPromoCodes: this.promoCodes.length,
                onlineUsers: this.users.filter(u => u.status === 'online').length,
                bannedUsers: this.users.filter(u => u.banned).length,
                bannedIPs: this.bannedIPs.size,
                activeDevices: this.devices.size
            }
        };
    }

    handleGetTransactions(token, userId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const transactions = [
            {
                description: 'Регистрация бонус',
                date: user.createdAt,
                amount: user.coins >= 50000 ? 50000 : 1000
            }
        ];

        return {
            success: true,
            transactions: transactions
        };
    }

    handleGetDevices(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const devices = this.getUserDevices(user.id);
        return {
            success: true,
            devices: devices
        };
    }

    handleTerminateDevice(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { deviceId } = data;
        const success = this.terminateDevice(user.id, deviceId);

        if (success) {
            return {
                success: true,
                message: 'Сеанс устройства завершен'
            };
        } else {
            return {
                success: false,
                message: 'Не удалось завершить сеанс устройства'
            };
        }
    }

    start(port = 3000) {
        const server = http.createServer((req, res) => {
            const parsedUrl = url.parse(req.url, true);
            const pathname = parsedUrl.pathname;

            console.log(`${new Date().toISOString()} - ${req.method} ${pathname}`);

            if (pathname.startsWith('/api/')) {
                this.handleApiRequest(req, res);
                return;
            }

            if (pathname === '/' || pathname === '/index.html') {
                this.serveStaticFile(res, 'public/main.html', 'text/html');
            } else if (pathname === '/login.html') {
                this.serveStaticFile(res, 'public/login.html', 'text/html');
            } else if (pathname.endsWith('.css')) {
                this.serveStaticFile(res, 'public' + pathname, 'text/css');
            } else if (pathname.endsWith('.js')) {
                this.serveStaticFile(res, 'public' + pathname, 'application/javascript');
            } else if (pathname.startsWith('/assets/') || pathname.startsWith('/uploads/')) {
                const ext = path.extname(pathname);
                const contentType = {
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.svg': 'image/svg+xml',
                    '.bmp': 'image/bmp',
                    '.webp': 'image/webp',
                    '.ico': 'image/x-icon'
                }[ext] || 'application/octet-stream';
                
                this.serveStaticFile(res, 'public' + pathname, contentType);
            } else {
                this.serveStaticFile(res, 'public/main.html', 'text/html');
            }
        });

        const wsServer = new WebSocketServer(server);

        server.listen(port, () => {
            console.log(`🚀 Сервер запущен на порту ${port}`);
            console.log(`📧 Приложение готово к работе`);
            console.log(`🔒 Данные пользователей защищены шифрованием`);
            console.log(`📁 Поддержка загрузки файлов включена`);
            console.log(`🛡️  Система банов по IP и устройствам активирована`);
            console.log(`\n👑 Особый пользователь:`);
            console.log(`   - BayRex - получает права администратора при регистрации`);
        });

        return server;
    }
}

const server = new SimpleServer();
server.start(process.env.PORT || 3000);
