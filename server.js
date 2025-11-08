const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { StringDecoder } = require('string_decoder');
const crypto = require('crypto');
const busboy = require('busboy');

// Система rate limiting
const requestCounts = new Map();

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

        this.sendToClient(clientId, 'connected', { clientId });
    }

    generateAccept(key) {
        const sha1 = crypto.createHash('sha1');
        sha1.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
        return sha1.digest('base64');
    }

    generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    handleMessage(clientId, data) {
        try {
            const firstByte = data.readUInt8(0);
            const opcode = firstByte & 0x0F;
            
            // Обработка ping фрейма
            if (opcode === 9) {
                console.log('🏓 Получен PING от клиента', clientId);
                this.sendPong(clientId);
                return;
            }
            
            // Обработка pong фрейма
            if (opcode === 10) {
                console.log('🏓 Получен PONG от клиента', clientId);
                return;
            }
            
            // Обработка текстового фрейма
            if (opcode === 1) {
                const message = this.decodeMessage(data);
                if (message && message.type && message.data) {
                    console.log(`📨 WebSocket сообщение от ${clientId}:`, message.type);
                    this.broadcast(message.type, message.data, clientId);
                }
            }
            
        } catch (error) {
            console.log('❌ Ошибка обработки WebSocket сообщения:', error);
        }
    }

    decodeMessage(buffer) {
        try {
            // Проверяем, что это текстовый фрейм (opcode = 1)
            const firstByte = buffer.readUInt8(0);
            const opcode = firstByte & 0x0F;
            
            if (opcode !== 1) {
                console.log('❌ Не текстовый фрейм, opcode:', opcode);
                return null;
            }

            const secondByte = buffer.readUInt8(1);
            
            const isFinalFrame = Boolean(firstByte & 0x80);
            let payloadLength = secondByte & 0x7F;
            let maskStart = 2;
            
            if (payloadLength === 126) {
                if (buffer.length < 4) {
                    console.log('❌ Недостаточно данных для длины 126');
                    return null;
                }
                payloadLength = buffer.readUInt16BE(2);
                maskStart = 4;
            } else if (payloadLength === 127) {
                if (buffer.length < 10) {
                    console.log('❌ Недостаточно данных для длины 127');
                    return null;
                }
                payloadLength = Number(buffer.readBigUInt64BE(2));
                maskStart = 10;
            }
            
            // Проверяем, что в буфере достаточно данных
            if (buffer.length < maskStart + 4 + payloadLength) {
                console.log('❌ Недостаточно данных в буфере');
                return null;
            }
            
            const masks = buffer.slice(maskStart, maskStart + 4);
            const payload = buffer.slice(maskStart + 4, maskStart + 4 + payloadLength);
            
            const decoded = Buffer.alloc(payloadLength);
            for (let i = 0; i < payloadLength; i++) {
                decoded[i] = payload[i] ^ masks[i % 4];
            }
            
            const messageText = decoded.toString('utf8');
            return JSON.parse(messageText);
            
        } catch (error) {
            console.log('❌ Ошибка декодирования WebSocket сообщения:', error.message);
            return null;
        }
    }

    encodeMessage(data) {
        try {
            const json = JSON.stringify(data);
            const jsonBuffer = Buffer.from(json, 'utf8');
            
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
                Buffer.from([0x81, payloadLengthByte]), // 0x81 = FIN + текстовый фрейм
                lengthBytes
            ]);
            
            return Buffer.concat([header, jsonBuffer]);
        } catch (error) {
            console.log('❌ Ошибка кодирования WebSocket сообщения:', error);
            return Buffer.from([0x81, 0x00]); // Пустой фрейм в случае ошибки
        }
    }

    sendPong(clientId) {
        const client = this.clients.get(clientId);
        if (client && client.socket) {
            try {
                // Pong фрейм: 0x8A = FIN + Pong opcode
                const pongFrame = Buffer.from([0x8A, 0x00]);
                client.socket.write(pongFrame);
            } catch (error) {
                console.log('❌ Ошибка отправки PONG:', error);
            }
        }
    }

    sendToClient(clientId, type, data) {
        const client = this.clients.get(clientId);
        if (client && client.socket) {
            try {
                const message = this.encodeMessage({ type, data });
                client.socket.write(message);
            } catch (error) {
                console.log('❌ Ошибка отправки клиенту:', error);
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
        // Используем /tmp для Render, так как он сохраняется между деплоями
        this.dataFile = path.join('/tmp', 'epic-messenger-data.json');
        this.encryptionKey = crypto.randomBytes(32);
        
        // Система сессий
        this.sessions = new Map();
        
        this.ensureUploadDirs();
        this.loadData();
        this.setupAutoSave();
        
        // Очистка старых сессий каждые 5 минут
        setInterval(() => this.cleanupSessions(), 5 * 60 * 1000);
    }

    // 🔐 СИСТЕМА БЕЗОПАСНОСТИ

    // Rate limiting
    checkRateLimit(ip, endpoint) {
        const key = `${ip}-${endpoint}`;
        const now = Date.now();
        const windowStart = now - 60000; // 1 minute
        
        if (!requestCounts.has(key)) {
            requestCounts.set(key, []);
        }
        
        const requests = requestCounts.get(key);
        // Удаляем старые запросы
        const recentRequests = requests.filter(time => time > windowStart);
        
        // Лимиты по endpoint
        const limits = {
            '/api/login': 10,       // 10 попыток входа в минуту
            '/api/register': 5,     // 5 регистраций в минуту
            '/api/messages': 100,   // 100 сообщений в минуту
            'default': 200          // 200 запросов в минуту для остального
        };
        
        const limit = limits[endpoint] || limits.default;
        
        if (recentRequests.length >= limit) {
            console.log(`🚨 Rate limit exceeded: ${ip} -> ${endpoint}`);
            return false;
        }
        
        recentRequests.push(now);
        requestCounts.set(key, recentRequests);
        return true;
    }

    // Система сессий
    createSession(userId) {
        const sessionId = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 часа
        
        this.sessions.set(sessionId, {
            userId,
            expires,
            createdAt: new Date(),
            lastActive: new Date()
        });
        
        return sessionId;
    }

    validateSession(token) {
        const session = this.sessions.get(token);
        if (!session || session.expires < Date.now()) {
            this.sessions.delete(token);
            return null;
        }
        
        // Обновляем время активности
        session.lastActive = new Date();
        return session;
    }

    cleanupSessions() {
        const now = Date.now();
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.expires < now) {
                this.sessions.delete(sessionId);
            }
        }
    }

    // Проверка прав администратора
    isAdmin(user) {
        return user && user.isDeveloper && user.isAdmin;
    }

    // Проверка дружеских отношений
    isFriend(userId1, userId2) {
        // Здесь можно добавить логику проверки друзей
        // Пока возвращаем false - только свои данные
        return false;
    }

    // Валидация входных данных
    validateInput(input, type) {
        if (typeof input !== 'string') return false;
        
        const validators = {
            username: /^[a-zA-Z0-9_]{3,20}$/,
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            userId: /^[a-f0-9]{10,}$/,
            displayName: /^[a-zA-Z0-9а-яА-ЯёЁ\s\-_]{2,30}$/i,
            text: /^[\s\S]{1,5000}$/ // Базовая проверка длины
        };
        
        return validators[type] ? validators[type].test(input) : true;
    }

    // Логирование безопасности
    logSecurityEvent(user, action, target, success = true) {
        const timestamp = new Date().toISOString();
        const logEntry = `🔐 SECURITY: ${timestamp} | User: ${user.id} (${user.username}) | Action: ${action} | Target: ${target} | ${success ? 'SUCCESS' : 'FAILED'}\n`;
        
        console.log(logEntry.trim());
        
        // Сохраняем в файл
        const logFile = path.join('/tmp', 'security.log');
        fs.appendFileSync(logFile, logEntry, 'utf8');
    }

    // Безопасные заголовки
    setSecurityHeaders(res) {
        const securityHeaders = {
            'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'Referrer-Policy': 'strict-origin-when-cross-origin'
        };
        
        Object.entries(securityHeaders).forEach(([key, value]) => {
            res.setHeader(key, value);
        });
    }

    // 🔚 КОНЕЦ СИСТЕМЫ БЕЗОПАСНОСТИ

    loadData() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
                this.users = data.users || [];
                this.messages = data.messages || [];
                this.posts = data.posts || [];
                this.gifts = data.gifts || [];
                this.promoCodes = data.promoCodes || [];
                this.music = data.music || [];
                this.playlists = data.playlists || [];
                this.bannedIPs = new Map(Object.entries(data.bannedIPs || {}));
                this.devices = new Map(Object.entries(data.devices || {}));
                this.groups = data.groups || [];
                
                // Восстанавливаем даты
                this.messages.forEach(msg => msg.timestamp = new Date(msg.timestamp));
                this.posts.forEach(post => post.createdAt = new Date(post.createdAt));
                this.users.forEach(user => {
                    user.lastSeen = new Date(user.lastSeen);
                    user.createdAt = new Date(user.createdAt);
                });
                this.music.forEach(track => track.createdAt = new Date(track.createdAt));
                this.playlists.forEach(playlist => playlist.createdAt = new Date(playlist.createdAt));
                this.groups.forEach(group => group.createdAt = new Date(group.createdAt));
                
                console.log('✅ Данные загружены из файла');
                console.log(`📊 Статистика: ${this.users.length} пользователей, ${this.messages.length} сообщений, ${this.posts.length} постов, ${this.groups.length} групп`);
            } else {
                console.log('📁 Файл данных не найден, инициализируем пустые данные');
                this.initializeData();
            }
        } catch (error) {
            console.log('❌ Ошибка загрузки данных:', error);
            console.log('🔄 Инициализируем пустые данные');
            this.initializeData();
        }
    }

    saveData() {
        try {
            const data = {
                users: this.users,
                messages: this.messages,
                posts: this.posts,
                gifts: this.gifts,
                promoCodes: this.promoCodes,
                music: this.music,
                playlists: this.playlists,
                bannedIPs: Object.fromEntries(this.bannedIPs),
                devices: Object.fromEntries(this.devices),
                groups: this.groups,
                lastSave: new Date().toISOString()
            };
            
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
            console.log('💾 Данные сохранены');
        } catch (error) {
            console.log('❌ Ошибка сохранения данных:', error);
        }
    }

    setupAutoSave() {
        setInterval(() => {
            this.saveData();
        }, 30000);

        process.on('SIGINT', () => {
            console.log('🔄 Получен SIGINT, сохраняем данные...');
            this.saveData();
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            console.log('🔄 Получен SIGTERM, сохраняем данные...');
            this.saveData();
            process.exit(0);
        });

        process.on('uncaughtException', (error) => {
            console.log('🚨 Необработанная ошибка, сохраняем данные...', error);
            this.saveData();
            process.exit(1);
        });

        console.log('🔄 Автосохранение настроено');
    }

    ensureUploadDirs() {
        const requiredDirs = [
            'public/uploads/music',
            'public/uploads/music/covers',
            'public/uploads/avatars',
            'public/uploads/gifts',
            'public/uploads/posts',
            'public/uploads/images',
            'public/uploads/videos',
            'public/uploads/audio',
            'public/uploads/files',
            'public/assets/emoji',
            '/tmp'
        ];
        
        requiredDirs.forEach(dir => {
            const fullPath = path.join(__dirname, dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
                console.log('✅ Создана папка:', fullPath);
            }
        });
    }

    validateMusicFile(filename) {
        const allowedExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    validateCoverFile(filename) {
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    validateImageFile(filename) {
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    validateVideoFile(filename) {
        const allowedExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    validateAudioFile(filename) {
        const allowedExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    validateFileType(filename, fileType) {
        switch (fileType) {
            case 'image': return this.validateImageFile(filename);
            case 'video': return this.validateVideoFile(filename);
            case 'audio': return this.validateAudioFile(filename);
            default: return false;
        }
    }

    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    decrypt(encryptedText) {
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    getClientIP(req) {
        return req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               (req.connection.socket ? req.connection.socket.remoteAddress : null);
    }

    getDeviceInfo(req) {
        const userAgent = req.headers['user-agent'] || '';
        let browser = 'Unknown';
        let os = 'Unknown';
        
        if (userAgent.includes('Chrome')) browser = 'Chrome';
        else if (userAgent.includes('Firefox')) browser = 'Firefox';
        else if (userAgent.includes('Safari')) browser = 'Safari';
        else if (userAgent.includes('Edge')) browser = 'Edge';
        
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

    generateDeviceId(req) {
        const ip = this.getClientIP(req);
        const deviceInfo = this.getDeviceInfo(req);
        const deviceString = `${ip}-${deviceInfo.browser}-${deviceInfo.os}`;
        return crypto.createHash('md5').update(deviceString).digest('hex');
    }

    isIPBanned(ip) {
        const banInfo = this.bannedIPs.get(ip);
        if (!banInfo) return false;
        
        if (banInfo.expires && banInfo.expires < Date.now()) {
            this.bannedIPs.delete(ip);
            return false;
        }
        
        return true;
    }

    banIP(ip, duration = 30 * 24 * 60 * 60 * 1000) {
        this.bannedIPs.set(ip, {
            bannedAt: new Date(),
            expires: Date.now() + duration
        });
        this.saveData();
    }

    validateAvatarFile(filename) {
        // Временно отключаем валидацию аватаров
        console.log('🔍 Временное отключение загрузки аватаров');
        return false; // Временно возвращаем false для отключения загрузки
    }

    validateGiftFile(filename) {
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    validatePostFile(filename) {
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.mp4', '.avi', '.mov', '.mp3', '.wav'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    sanitizeContent(content) {
        if (typeof content !== 'string') return '';
        
        let sanitized = content;

        // Удаляем HTML теги и опасные атрибуты
        sanitized = sanitized
            .replace(/<[^>]*>/g, '') // Удаляем все HTML теги
            .replace(/&[^;]+;/g, '') // Удаляем HTML entities
            .replace(/javascript:/gi, '[БЛОК]')
            .replace(/data:/gi, '[БЛОК]')
            .replace(/vbscript:/gi, '[БЛОК]')
            .replace(/on\w+="[^"]*"/gi, '')
            .replace(/on\w+='[^']*'/gi, '')
            .replace(/on\w+=\w+/gi, '');

        // Фильтрация по опасным ключевым словам (регистронезависимая)
        const dangerousKeywords = [
            'script', 'iframe', 'object', 'embed', 'link', 'meta', 'style',
            'expression', 'eval', 'exec', 'compile', 'function constructor',
            'document.write', 'innerhtml', 'outerhtml', 'insertadjacent',
            'setattribute', 'createelement', 'appendchild', 'removechild',
            'window.open', 'location.href', 'document.domain', 'localstorage',
            'sessionstorage', 'cookie', 'xmlhttprequest', 'fetch', 'websocket',
            'postmessage', 'import', 'export', 'require', 'module'
        ];

        dangerousKeywords.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            sanitized = sanitized.replace(regex, '[БЛОК]');
        });

        // Фильтрация опасных паттернов
        const dangerousPatterns = [
            /<script[\s\S]*?<\/script>/gi,
            /<iframe[\s\S]*?<\/iframe>/gi,
            /<object[\s\S]*?<\/object>/gi,
            /<embed[\s\S]*?<\/embed>/gi,
            /<svg[\s\S]*?<\/svg>/gi,
            /<link[\s\S]*?>/gi,
            /<meta[\s\S]*?>/gi,
            /<style[\s\S]*?<\/style>/gi,
            /expression\([^)]*\)/gi,
            /eval\([^)]*\)/gi,
            /Function\([^)]*\)/gi,
            /document\.write\([^)]*\)/gi,
            /\.innerHTML\s*=/gi,
            /\.outerHTML\s*=/gi,
            /\.insertAdjacentHTML\([^)]*\)/gi,
            /\.setAttribute\([^)]*\)/gi,
            /document\.createElement\([^)]*\)/gi,
            /window\.open\([^)]*\)/gi,
            /location\.href\s*=/gi,
            /document\.domain\s*=/gi,
            /XMLHttpRequest/gi,
            /Fetch/gi,
            /WebSocket/gi,
            /postMessage\([^)]*\)/gi
        ];

        dangerousPatterns.forEach(pattern => {
            sanitized = sanitized.replace(pattern, '[БЛОК]');
        });

        // Фильтрация IP-адресов (опционально)
        sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');

        // Фильтрация URL (только явные http/https ссылки)
        sanitized = sanitized.replace(/(https?|ftp):\/\/[^\s<>{}\[\]"']+/gi, '[ССЫЛКА]');

        // Удаляем лишние пробелы и обрезаем длину
        sanitized = sanitized.trim();

        if (sanitized.length > 5000) {
            sanitized = sanitized.substring(0, 5000);
        }

        return sanitized;
    }

    async saveFile(fileData, filename, type) {
        return new Promise((resolve, reject) => {
            try {
                let uploadDir = 'uploads';
                if (type === 'avatar') uploadDir = 'uploads/avatars';
                else if (type === 'gift') uploadDir = 'uploads/gifts';
                else if (type === 'post') uploadDir = 'uploads/posts';
                else if (type === 'music') uploadDir = 'uploads/music';
                else if (type === 'music/covers') uploadDir = 'uploads/music/covers';
                else if (type === 'images') uploadDir = 'uploads/images';
                else if (type === 'videos') uploadDir = 'uploads/videos';
                else if (type === 'audio') uploadDir = 'uploads/audio';
                else if (type === 'files') uploadDir = 'uploads/files';

                const filePath = path.join(__dirname, 'public', uploadDir, filename);
                
                let buffer;
                if (fileData.startsWith('data:')) {
                    const base64Data = fileData.split(',')[1];
                    buffer = Buffer.from(base64Data, 'base64');
                } else {
                    buffer = Buffer.from(fileData, 'base64');
                }

                const dirPath = path.dirname(filePath);
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                }

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

    deleteFile(fileUrl) {
        if (!fileUrl || !fileUrl.startsWith('/uploads/')) return;
        
        const filePath = path.join(__dirname, 'public', fileUrl.substring(1));
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    initializeData() {
        this.users = [];

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

        this.posts = [
            {
                id: '1',
                userId: 'system',
                text: 'Добро пожаловать в Epic Messenger! 🚀',
                image: null,
                file: null,
                fileName: null,
                fileType: null,
                likes: [],
                comments: [],
                views: 0,
                createdAt: new Date()
            }
        ];

        this.music = [];
        this.playlists = [];
        this.groups = [];

        this.messages = [];
        this.bannedIPs = new Map();
        this.devices = new Map();
    }

    generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    // 🔐 ОБНОВЛЕННАЯ АУТЕНТИФИКАЦИЯ
    authenticateToken(token) {
        const session = this.validateSession(token);
        if (!session) return null;
        
        return this.users.find(u => u.id === session.userId);
    }

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
            isOwner: false
        };
        
        const userDevices = Array.from(this.devices.values()).filter(d => d.userId === userId);
        if (userDevices.length === 0) {
            device.isOwner = true;
        }
        
        this.devices.set(deviceId, device);
        this.saveData();
        return device;
    }

    getUserDevices(userId) {
        return Array.from(this.devices.values()).filter(device => device.userId === userId);
    }

    terminateDevice(userId, deviceId) {
        const device = this.devices.get(deviceId);
        if (!device || device.userId !== userId) {
            return false;
        }
        
        const userDevices = this.getUserDevices(userId);
        const isOwner = userDevices.some(d => d.isOwner);
        const targetDevice = userDevices.find(d => d.id === deviceId);
        
        if (!targetDevice) return false;
        
        if (targetDevice.isOwner || isOwner) {
            this.devices.delete(deviceId);
            this.saveData();
            return true;
        } else {
            const timeDiff = Date.now() - new Date(targetDevice.createdAt).getTime();
            if (timeDiff > 24 * 60 * 60 * 1000) {
                this.devices.delete(deviceId);
                this.saveData();
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
        
        console.log(`=== API REQUEST ===`);
        console.log(`Method: ${method}`);
        console.log(`Path: ${pathname}`);
        console.log(`Content-Type: ${req.headers['content-type']}`);
        console.log(`Content-Length: ${req.headers['content-length']}`);
        
        // 🔐 Rate limiting проверка
        const clientIP = this.getClientIP(req);
        if (!this.checkRateLimit(clientIP, pathname)) {
            res.writeHead(429, { 
                'Content-Type': 'application/json',
                'Retry-After': '60'
            });
            res.end(JSON.stringify({ 
                success: false, 
                message: 'Слишком много запросов. Попробуйте позже.' 
            }));
            return;
        }

        // 🔧 ВРЕМЕННО ОТКЛЮЧАЕМ MULTIPART ОБРАБОТЧИКИ ДЛЯ АВАТАРОВ
        if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
            if (pathname === '/api/music/upload-full') {
                this.handleUploadMusicFull(req, res);
                return;
            }
            // Временно отключаем обработку аватаров
            else if (pathname === '/api/upload-avatar') {
                res.writeHead(400, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ 
                    success: false, 
                    message: 'Загрузка аватаров временно отключена' 
                }));
                return;
            }
            else if (pathname === '/api/upload-post-image') {
                this.handleUploadPostImageMultipart(req, res);
                return;
            }
            else if (pathname === '/api/upload-file') {
                this.handleUploadFileMultipart(req, res);
                return;
            }
            else if (pathname === '/api/upload-gift') {
                this.handleUploadGiftMultipart(req, res);
                return;
            }
        }

        let body = '';
        const decoder = new StringDecoder('utf-8');

        req.on('data', (chunk) => {
            body += decoder.write(chunk);
        });

        req.on('end', () => {
            body += decoder.end();
            
            if (req.headers['content-type'] && !req.headers['content-type'].includes('multipart/form-data')) {
                console.log(`Raw body:`, body.substring(0, 200) + '...'); // Логируем только начало
                console.log(`Body length: ${body.length}`);
            }
            
            let data = {};
            if (body && body.trim() !== '' && req.headers['content-type'] && !req.headers['content-type'].includes('multipart/form-data')) {
                try {
                    data = JSON.parse(body);
                    console.log(`Parsed data keys:`, Object.keys(data));
                } catch (e) {
                    console.log(`JSON parse error:`, e.message);
                }
            }

            console.log(`=== END REQUEST ===`);
            
            this.processApiRequest(pathname, method, data, parsedUrl.query, req, res);
        });
    }

    processApiRequest(pathname, method, data, query, req, res) {
        console.log(`🔄 Processing API: ${method} ${pathname}`);
        console.log(`📦 Request data keys:`, Object.keys(data));
        console.log(`❓ Query params:`, query);
        
        const headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Content-Length, Accept, Origin',
            'Access-Control-Allow-Credentials': 'true'
        };

        // 🔐 Устанавливаем безопасные заголовки
        this.setSecurityHeaders(res);

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

                case '/api/chats':
                    if (method === 'GET') {
                        response = this.handleGetChats(token);
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

                case '/api/messages/mark-read':
                    if (method === 'POST') {
                        response = this.handleMarkAsRead(token, data);
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
                        // Временно отключаем обновление аватара
                        response = { success: false, message: 'Загрузка аватаров временно отключена' };
                    }
                    break;

                case '/api/upload-avatar':
                    if (method === 'POST') {
                        // Временно отключаем загрузку аватара
                        response = { success: false, message: 'Загрузка аватаров временно отключена' };
                    }
                    break;

                case '/api/upload-gift':
                    if (method === 'POST') {
                        // Уже обработано через multipart
                        response = { success: false, message: 'Use multipart form-data' };
                    }
                    break;

                case '/api/upload-post-image':
                    if (method === 'POST') {
                        // Уже обработано через multipart
                        response = { success: false, message: 'Use multipart form-data' };
                    }
                    break;

                case '/api/upload-file':
                    if (method === 'POST') {
                        // Уже обработано через multipart
                        response = { success: false, message: 'Use multipart form-data' };
                    }
                    break;

                // 🔧 ВРЕМЕННО ОТКЛЮЧАЕМ ПРЕДПРОСМОТР АВАТАРКИ
                case '/api/preview-avatar':
                    if (method === 'POST') {
                        response = { success: false, message: 'Загрузка аватаров временно отключена' };
                    }
                    break;

                case '/api/debug-upload':
                    if (method === 'POST') {
                        console.log('🐛 DEBUG UPLOAD DATA:', {
                            hasFileData: !!data.fileData,
                            fileDataLength: data.fileData?.length,
                            filename: data.filename,
                            fileType: data.fileType
                        });
                        response = { 
                            success: true, 
                            message: 'Debug received',
                            dataInfo: {
                                hasFileData: !!data.fileData,
                                fileDataLength: data.fileData?.length,
                                filename: data.filename
                            }
                        };
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

                case '/api/user-by-username':
                    if (method === 'POST') {
                        response = this.handleGetUserByUsername(token, data);
                    }
                    break;

                case '/api/my-gifts':
                    if (method === 'GET') {
                        response = this.handleGetMyGifts(token);
                    }
                    break;

                // API для групп
                case '/api/groups':
                    if (method === 'GET') {
                        response = this.handleGetUserGroups(token);
                    } else if (method === 'POST') {
                        response = this.handleCreateGroup(token, data);
                    }
                    break;

                case '/api/groups/add-member':
                    if (method === 'POST') {
                        response = this.handleAddToGroup(token, data);
                    }
                    break;

                // API для музыки
                case '/api/music/upload-full':
                    if (method === 'POST') {
                        response = { success: false, message: 'Multipart request already processed' };
                    }
                    break;
                    
                case '/api/music':
                    if (method === 'GET') {
                        response = this.handleGetMusic(token);
                    } else if (method === 'POST') {
                        response = this.handleUploadMusic(token, data);
                    }
                    break;
                    
                case '/api/music/upload':
                    if (method === 'POST') {
                        response = this.handleUploadMusicFile(token, data);
                    }
                    break;
                    
                case '/api/music/upload-cover':
                    if (method === 'POST') {
                        response = this.handleUploadMusicCover(token, data);
                    }
                    break;
                    
                case '/api/music/delete':
                    if (method === 'POST') {
                        response = this.handleDeleteMusic(token, data);
                    }
                    break;
                    
                case '/api/music/search':
                    if (method === 'GET') {
                        response = this.handleSearchMusic(token, query);
                    }
                    break;
                    
                case '/api/music/random':
                    if (method === 'GET') {
                        response = this.handleGetRandomMusic(token);
                    }
                    break;
                    
                case '/api/playlists':
                    if (method === 'GET') {
                        response = this.handleGetPlaylists(token);
                    } else if (method === 'POST') {
                        response = this.handleCreatePlaylist(token, data);
                    }
                    break;
                    
                case '/api/playlists/add':
                    if (method === 'POST') {
                        response = this.handleAddToPlaylist(token, data);
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

        console.log(`📤 Response data:`, response);
        
        res.writeHead(response.success ? 200 : 400, headers);
        res.end(JSON.stringify(response));
    }

    // 🔧 ВРЕМЕННО ОТКЛЮЧАЕМ ОБРАБОТЧИКИ ДЛЯ АВАТАРОВ

    async handleUploadAvatarMultipart(req, res) {
        console.log('🖼️ Загрузка аватаров временно отключена');
        
        res.writeHead(400, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ 
            success: false, 
            message: 'Загрузка аватаров временно отключена для технических работ' 
        }));
    }

    async handleUploadPostImageMultipart(req, res) {
        console.log('📸 Начало обработки загрузки изображения для поста...');

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.authenticateToken(token);
        
        if (!user) {
            res.writeHead(401, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ success: false, message: 'Не авторизован' }));
            return;
        }

        let isResponseSent = false;

        const sendErrorResponse = (message, statusCode = 500) => {
            if (!isResponseSent) {
                isResponseSent = true;
                console.error('❌ Ошибка загрузки изображения:', message);
                res.writeHead(statusCode, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ success: false, message }));
            }
        };

        const sendSuccessResponse = (data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ 
                headers: req.headers,
                limits: {
                    fileSize: 10 * 1024 * 1024, // 10MB максимум
                    files: 1
                }
            });
            
            let imageFile = null;

            bb.on('file', (name, file, info) => {
                const { filename, mimeType } = info;
                console.log(`📁 Получен файл: ${name}, имя: ${filename}, тип: ${mimeType}`);
                
                if (name === 'image' && filename) {
                    const chunks = [];
                    
                    file.on('data', (chunk) => {
                        chunks.push(chunk);
                    });
                    
                    file.on('end', () => {
                        if (chunks.length > 0) {
                            imageFile = {
                                buffer: Buffer.concat(chunks),
                                filename: filename,
                                mimeType: mimeType
                            };
                            console.log('✅ Изображение сохранено в памяти');
                        }
                    });
                } else {
                    file.resume();
                }
            });

            bb.on('close', async () => {
                console.log('🔚 Завершение обработки формы изображения');
                
                try {
                    if (!imageFile) {
                        sendErrorResponse('Файл изображения не получен', 400);
                        return;
                    }

                    if (!this.validatePostFile(imageFile.filename)) {
                        sendErrorResponse('Недопустимый формат файла для поста', 400);
                        return;
                    }

                    // Сохраняем файл
                    const fileExt = path.extname(imageFile.filename);
                    const uniqueFilename = `post_${user.id}_${Date.now()}${fileExt}`;
                    const filePath = path.join(__dirname, 'public', 'uploads', 'posts', uniqueFilename);
                    
                    console.log(`💾 Сохранение изображения: ${filePath}`);
                    await fs.promises.writeFile(filePath, imageFile.buffer);
                    const fileUrl = `/uploads/posts/${uniqueFilename}`;

                    this.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${imageFile.filename}`);

                    console.log(`📸 Пользователь ${user.username} загрузил изображение для поста: ${imageFile.filename}`);

                    sendSuccessResponse({
                        success: true,
                        imageUrl: fileUrl
                    });

                } catch (error) {
                    console.error('❌ Ошибка при сохранении изображения:', error);
                    sendErrorResponse('Ошибка при сохранении файла: ' + error.message);
                }
            });

            bb.on('error', (error) => {
                console.error('❌ Ошибка busboy:', error);
                sendErrorResponse('Ошибка обработки формы: ' + error.message);
            });

            req.pipe(bb);

        } catch (error) {
            console.error('❌ Критическая ошибка в handleUploadPostImageMultipart:', error);
            sendErrorResponse('Критическая ошибка сервера: ' + error.message);
        }
    }

    async handleUploadFileMultipart(req, res) {
        console.log('📎 Начало обработки загрузки файла...');

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.authenticateToken(token);
        
        if (!user) {
            res.writeHead(401, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ success: false, message: 'Не авторизован' }));
            return;
        }

        let isResponseSent = false;

        const sendErrorResponse = (message, statusCode = 500) => {
            if (!isResponseSent) {
                isResponseSent = true;
                console.error('❌ Ошибка загрузки файла:', message);
                res.writeHead(statusCode, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ success: false, message }));
            }
        };

        const sendSuccessResponse = (data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ 
                headers: req.headers,
                limits: {
                    fileSize: 50 * 1024 * 1024, // 50MB максимум
                    files: 1
                }
            });
            
            let uploadedFile = null;
            let fileType = 'files';

            bb.on('field', (name, val) => {
                if (name === 'fileType') {
                    fileType = val;
                }
            });

            bb.on('file', (name, file, info) => {
                const { filename, mimeType } = info;
                console.log(`📁 Получен файл: ${name}, имя: ${filename}, тип: ${mimeType}`);
                
                if (name === 'file' && filename) {
                    const chunks = [];
                    
                    file.on('data', (chunk) => {
                        chunks.push(chunk);
                    });
                    
                    file.on('end', () => {
                        if (chunks.length > 0) {
                            uploadedFile = {
                                buffer: Buffer.concat(chunks),
                                filename: filename,
                                mimeType: mimeType
                            };
                            console.log('✅ Файл сохранен в памяти');
                        }
                    });
                } else {
                    file.resume();
                }
            });

            bb.on('close', async () => {
                console.log('🔚 Завершение обработки формы файла');
                
                try {
                    if (!uploadedFile) {
                        sendErrorResponse('Файл не получен', 400);
                        return;
                    }

                    // Определяем тип файла
                    let uploadDir = 'files';
                    if (fileType === 'image') {
                        if (!this.validateImageFile(uploadedFile.filename)) {
                            sendErrorResponse('Недопустимый формат изображения', 400);
                            return;
                        }
                        uploadDir = 'images';
                    } else if (fileType === 'video') {
                        if (!this.validateVideoFile(uploadedFile.filename)) {
                            sendErrorResponse('Недопустимый формат видео', 400);
                            return;
                        }
                        uploadDir = 'videos';
                    } else if (fileType === 'audio') {
                        if (!this.validateAudioFile(uploadedFile.filename)) {
                            sendErrorResponse('Недопустимый формат аудио', 400);
                            return;
                        }
                        uploadDir = 'audio';
                    }

                    // Сохраняем файл
                    const fileExt = path.extname(uploadedFile.filename);
                    const uniqueFilename = `${fileType}_${user.id}_${Date.now()}${fileExt}`;
                    const filePath = path.join(__dirname, 'public', 'uploads', uploadDir, uniqueFilename);
                    
                    console.log(`💾 Сохранение файла: ${filePath}`);
                    await fs.promises.writeFile(filePath, uploadedFile.buffer);
                    const fileUrl = `/uploads/${uploadDir}/${uniqueFilename}`;

                    this.logSecurityEvent(user, 'UPLOAD_FILE', `file:${uploadedFile.filename}, type:${fileType}`);

                    console.log(`📎 Пользователь ${user.username} загрузил файл: ${uploadedFile.filename}`);

                    sendSuccessResponse({
                        success: true,
                        fileUrl: fileUrl,
                        fileName: uploadedFile.filename,
                        fileType: fileType
                    });

                } catch (error) {
                    console.error('❌ Ошибка при сохранении файла:', error);
                    sendErrorResponse('Ошибка при сохранении файла: ' + error.message);
                }
            });

            bb.on('error', (error) => {
                console.error('❌ Ошибка busboy:', error);
                sendErrorResponse('Ошибка обработки формы: ' + error.message);
            });

            req.pipe(bb);

        } catch (error) {
            console.error('❌ Критическая ошибка в handleUploadFileMultipart:', error);
            sendErrorResponse('Критическая ошибка сервера: ' + error.message);
        }
    }

    async handleUploadGiftMultipart(req, res) {
        console.log('🎁 Начало обработки загрузки изображения подарка...');

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.authenticateToken(token);
        
        if (!user || !this.isAdmin(user)) {
            res.writeHead(401, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ success: false, message: 'Не авторизован или недостаточно прав' }));
            return;
        }

        let isResponseSent = false;

        const sendErrorResponse = (message, statusCode = 500) => {
            if (!isResponseSent) {
                isResponseSent = true;
                console.error('❌ Ошибка загрузки подарка:', message);
                res.writeHead(statusCode, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ success: false, message }));
            }
        };

        const sendSuccessResponse = (data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ 
                headers: req.headers,
                limits: {
                    fileSize: 5 * 1024 * 1024, // 5MB максимум
                    files: 1
                }
            });
            
            let giftFile = null;

            bb.on('file', (name, file, info) => {
                const { filename, mimeType } = info;
                console.log(`📁 Получен файл: ${name}, имя: ${filename}, тип: ${mimeType}`);
                
                if (name === 'gift' && filename) {
                    const chunks = [];
                    
                    file.on('data', (chunk) => {
                        chunks.push(chunk);
                    });
                    
                    file.on('end', () => {
                        if (chunks.length > 0) {
                            giftFile = {
                                buffer: Buffer.concat(chunks),
                                filename: filename,
                                mimeType: mimeType
                            };
                            console.log('✅ Изображение подарка сохранено в памяти');
                        }
                    });
                } else {
                    file.resume();
                }
            });

            bb.on('close', async () => {
                console.log('🔚 Завершение обработки формы подарка');
                
                try {
                    if (!giftFile) {
                        sendErrorResponse('Файл подарка не получен', 400);
                        return;
                    }

                    if (!this.validateGiftFile(giftFile.filename)) {
                        sendErrorResponse('Недопустимый формат файла для подарка', 400);
                        return;
                    }

                    // Сохраняем файл
                    const fileExt = path.extname(giftFile.filename);
                    const uniqueFilename = `gift_${Date.now()}${fileExt}`;
                    const filePath = path.join(__dirname, 'public', 'uploads', 'gifts', uniqueFilename);
                    
                    console.log(`💾 Сохранение подарка: ${filePath}`);
                    await fs.promises.writeFile(filePath, giftFile.buffer);
                    const fileUrl = `/uploads/gifts/${uniqueFilename}`;

                    this.logSecurityEvent(user, 'UPLOAD_GIFT', `file:${giftFile.filename}`);

                    console.log(`🎁 Администратор ${user.username} загрузил изображение подарка: ${giftFile.filename}`);

                    sendSuccessResponse({
                        success: true,
                        imageUrl: fileUrl
                    });

                } catch (error) {
                    console.error('❌ Ошибка при сохранении подарка:', error);
                    sendErrorResponse('Ошибка при сохранении файла: ' + error.message);
                }
            });

            bb.on('error', (error) => {
                console.error('❌ Ошибка busboy:', error);
                sendErrorResponse('Ошибка обработки формы: ' + error.message);
            });

            req.pipe(bb);

        } catch (error) {
            console.error('❌ Критическая ошибка в handleUploadGiftMultipart:', error);
            sendErrorResponse('Критическая ошибка сервера: ' + error.message);
        }
    }

    // 🔧 ВРЕМЕННО ОТКЛЮЧАЕМ ПРЕДПРОСМОТР АВАТАРКИ
    handlePreviewAvatar(token, data) {
        return { success: false, message: 'Загрузка аватаров временно отключена' };
    }

    // 🔐 ОБНОВЛЕННЫЕ МЕТОДЫ С ПРОВЕРКОЙ ПРАВ

    async handleUploadFile(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { fileData, filename, fileType } = data;
        
        if (!this.validateFileType(filename, fileType)) {
            return { success: false, message: 'Недопустимый тип файла' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `${fileType}_${user.id}_${Date.now()}${fileExt}`;
            
            const fileUrl = await this.saveFile(fileData, uniqueFilename, fileType + 's');

            return {
                success: true,
                fileUrl: fileUrl,
                fileName: filename,
                fileType: fileType
            };
        } catch (error) {
            console.error('Ошибка загрузки файла:', error);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    handleGetChats(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // Находим всех пользователей, с которыми есть переписка
        const chatUserIds = new Set();
        this.messages.forEach(msg => {
            if (msg.senderId === user.id) {
                chatUserIds.add(msg.toUserId);
            } else if (msg.toUserId === user.id) {
                chatUserIds.add(msg.senderId);
            }
        });

        const chatUsers = this.users
            .filter(u => u.id !== user.id && chatUserIds.has(u.id))
            .map(u => ({
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
                banned: u.banned || false,
                lastMessage: this.getLastMessage(user.id, u.id),
                unreadCount: this.getUnreadCount(user.id, u.id)
            }));

        // Сортируем по времени последнего сообщения
        chatUsers.sort((a, b) => {
            const timeA = a.lastMessage ? new Date(a.lastMessage.timestamp) : new Date(0);
            const timeB = b.lastMessage ? new Date(b.lastMessage.timestamp) : new Date(0);
            return timeB - timeA;
        });

        return {
            success: true,
            chats: chatUsers
        };
    }

    getLastMessage(userId1, userId2) {
        const messages = this.messages.filter(msg => 
            (msg.senderId === userId1 && msg.toUserId === userId2) ||
            (msg.senderId === userId2 && msg.toUserId === userId1)
        );
        
        if (messages.length === 0) return null;
        
        return messages.reduce((latest, current) => 
            new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest
        );
    }

    getUnreadCount(userId, otherUserId) {
        return this.messages.filter(msg => 
            msg.senderId === otherUserId && 
            msg.toUserId === userId && 
            !msg.read
        ).length;
    }

    handleMarkAsRead(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { fromUserId } = data;
        
        this.messages.forEach(msg => {
            if (msg.senderId === fromUserId && msg.toUserId === user.id && !msg.read) {
                msg.read = true;
            }
        });
        
        this.saveData();
        
        return {
            success: true,
            message: 'Сообщения отмечены как прочитанные'
        };
    }

    handleGetUserByUsername(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { username } = data;
        
        // 🔐 Валидация входных данных
        if (!this.validateInput(username, 'username')) {
            return { success: false, message: 'Некорректное имя пользователя' };
        }

        const targetUser = this.users.find(u => u.username === username);
        
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        // Получаем подарки пользователя
        const userGifts = this.messages
            .filter(msg => msg.type === 'gift' && msg.toUserId === targetUser.id)
            .map(msg => ({
                id: msg.id,
                giftId: msg.giftId,
                giftName: msg.giftName,
                giftImage: msg.giftImage,
                fromUserId: msg.senderId,
                fromUserName: msg.displayName,
                timestamp: msg.timestamp
            }));

        // Получаем посты пользователя
        const userPosts = this.posts.filter(post => post.userId === targetUser.id);

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
            },
            gifts: userGifts,
            posts: userPosts
        };
    }

    handleGetMyGifts(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // Получаем подарки, которые подарили текущему пользователю
        const myGifts = this.messages
            .filter(msg => msg.type === 'gift' && msg.toUserId === user.id)
            .map(msg => ({
                id: msg.id,
                giftId: msg.giftId,
                giftName: msg.giftName,
                giftImage: msg.giftImage,
                giftPreview: msg.giftPreview,
                fromUserId: msg.senderId,
                fromUserName: msg.displayName,
                timestamp: msg.timestamp,
                giftPrice: msg.giftPrice
            }));

        return {
            success: true,
            gifts: myGifts
        };
    }

    // Методы для групп
    handleCreateGroup(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { name, description, avatar } = data;
        
        if (!name || name.trim() === '') {
            return { success: false, message: 'Название группы обязательно' };
        }

        // 🔐 Валидация входных данных
        if (!this.validateInput(name, 'displayName')) {
            return { success: false, message: 'Некорректное название группы' };
        }

        const group = {
            id: this.generateId(),
            name: this.sanitizeContent(name.trim()),
            description: description ? this.sanitizeContent(description) : '',
            avatar: avatar || null,
            ownerId: user.id,
            members: [user.id],
            admins: [user.id],
            createdAt: new Date(),
            isPublic: false
        };

        this.groups.push(group);
        this.saveData();

        console.log(`👥 Создана группа: ${group.name}`);

        return {
            success: true,
            group: group
        };
    }

    handleGetUserGroups(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const userGroups = this.groups.filter(group => 
            group.members.includes(user.id)
        );

        return {
            success: true,
            groups: userGroups
        };
    }

    handleAddToGroup(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { groupId, userId } = data;
        
        const group = this.groups.find(g => g.id === groupId);
        if (!group) {
            return { success: false, message: 'Группа не найдена' };
        }

        // 🔐 Проверяем права - только админы группы могут добавлять
        if (!group.admins.includes(user.id)) {
            this.logSecurityEvent(user, 'ADD_TO_GROUP', `group:${groupId}`, false);
            return { success: false, message: 'Недостаточно прав' };
        }

        const targetUser = this.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        if (group.members.includes(userId)) {
            return { success: false, message: 'Пользователь уже в группе' };
        }

        group.members.push(userId);
        this.saveData();

        this.logSecurityEvent(user, 'ADD_TO_GROUP', `group:${groupId}, user:${userId}`);

        return {
            success: true,
            message: 'Пользователь добавлен в группу'
        };
    }

    // 🔐 ОБНОВЛЕННЫЕ МЕТОДЫ С ПРОВЕРКОЙ ПРАВ ДОСТУПА

    handleGetUser(token, userId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 ПРОВЕРКА ПРАВ: пользователь может получать только СВОИ данные
        if (user.id !== userId && !this.isFriend(user.id, userId)) {
            this.logSecurityEvent(user, 'GET_USER', `user:${userId}`, false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const targetUser = this.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        this.logSecurityEvent(user, 'GET_USER', `user:${userId}`);

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

    handleGetMessages(token, query) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId, toUserId } = query;

        // 🔐 ПРОВЕРКА ПРАВ: пользователь может читать только СВОИ сообщения
        if (user.id !== userId && user.id !== toUserId) {
            this.logSecurityEvent(user, 'GET_MESSAGES', `chat:${userId}-${toUserId}`, false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const chatMessages = this.messages.filter(msg => 
            (msg.senderId === userId && msg.toUserId === toUserId) ||
            (msg.senderId === toUserId && msg.toUserId === userId)
        );

        const decryptedMessages = chatMessages.map(msg => ({
            ...msg,
            text: msg.encrypted ? this.decrypt(msg.text) : msg.text
        }));

        decryptedMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        this.logSecurityEvent(user, 'GET_MESSAGES', `chat:${userId}-${toUserId}`);

        return {
            success: true,
            messages: decryptedMessages
        };
    }

    // 🔐 ОБНОВЛЕННЫЕ АДМИНИСТРАТИВНЫЕ МЕТОДЫ

    handleDeleteUser(token, data) {
        const user = this.authenticateToken(token);
        
        // 🔐 Только администраторы могут удалять пользователей
        if (!user || !this.isAdmin(user)) {
            this.logSecurityEvent(user, 'DELETE_USER', 'SYSTEM', false);
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

        if (targetUser.avatar && targetUser.avatar.startsWith('/uploads/avatars/')) {
            this.deleteFile(targetUser.avatar);
        }

        Array.from(this.devices.entries()).forEach(([deviceId, device]) => {
            if (device.userId === userId) {
                this.devices.delete(deviceId);
            }
        });

        this.users = this.users.filter(u => u.id !== userId);
        this.saveData();

        this.logSecurityEvent(user, 'DELETE_USER', `user:${targetUser.username}`);

        console.log(`🗑️ Администратор ${user.displayName} удалил аккаунт: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} успешно удален`
        };
    }

    handleBanUser(token, data) {
        const user = this.authenticateToken(token);
        
        // 🔐 Только администраторы могут банить пользователей
        if (!user || !this.isAdmin(user)) {
            this.logSecurityEvent(user, 'BAN_USER', 'SYSTEM', false);
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

        if (banned) {
            const userDevices = this.getUserDevices(userId);
            if (userDevices.length > 0) {
                const lastDevice = userDevices[userDevices.length - 1];
                this.banIP(lastDevice.ip);
            }
        }

        this.saveData();

        this.logSecurityEvent(user, banned ? 'BAN_USER' : 'UNBAN_USER', `user:${targetUser.username}`);

        console.log(`🔒 Администратор ${user.displayName} ${banned ? 'заблокировал' : 'разблокировал'} аккаунт: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} ${banned ? 'заблокирован' : 'разблокирован'}`
        };
    }

    handleAdminStats(token) {
        const user = this.authenticateToken(token);
        
        // 🔐 Только администраторы могут смотреть статистику
        if (!user || !this.isAdmin(user)) {
            this.logSecurityEvent(user, 'VIEW_ADMIN_STATS', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        this.logSecurityEvent(user, 'VIEW_ADMIN_STATS', 'SYSTEM');

        return {
            success: true,
            stats: {
                totalUsers: this.users.length,
                totalMessages: this.messages.length,
                totalPosts: this.posts.length,
                totalGifts: this.gifts.length,
                totalPromoCodes: this.promoCodes.length,
                totalMusic: this.music.length,
                totalPlaylists: this.playlists.length,
                totalGroups: this.groups.length,
                onlineUsers: this.users.filter(u => u.status === 'online').length,
                bannedUsers: this.users.filter(u => u.banned).length,
                bannedIPs: this.bannedIPs.size,
                activeDevices: this.devices.size
            }
        };
    }

    // 🔐 ОБНОВЛЕННАЯ АУТЕНТИФИКАЦИЯ И РЕГИСТРАЦИЯ

    handleLogin(data, req) {
        const { username, password } = data;
        
        // 🔐 Валидация входных данных
        if (!this.validateInput(username, 'username') || !password) {
            return { success: false, message: 'Некорректные данные для входа' };
        }

        const hashedPassword = this.hashPassword(password);
        const user = this.users.find(u => u.username === username && u.password === hashedPassword);
        
        if (!user) {
            this.logSecurityEvent({ username }, 'LOGIN', 'SYSTEM', false);
            return { success: false, message: 'Неверное имя пользователя или пароль' };
        }

        if (user.banned) {
            this.logSecurityEvent(user, 'LOGIN', 'SYSTEM', false);
            return { success: false, message: 'Аккаунт заблокирован' };
        }

        const clientIP = this.getClientIP(req);
        if (this.isIPBanned(clientIP)) {
            this.logSecurityEvent(user, 'LOGIN', 'SYSTEM', false);
            return { success: false, message: 'Ваш IP адрес заблокирован' };
        }

        const device = this.registerDevice(user.id, req);
        
        // 🔐 Создаем сессию вместо возврата ID пользователя
        const sessionToken = this.createSession(user.id);

        user.status = 'online';
        user.lastSeen = new Date();
        this.saveData();

        this.logSecurityEvent(user, 'LOGIN', 'SYSTEM');

        return {
            success: true,
            token: sessionToken, // Возвращаем токен сессии, а не ID пользователя
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

        const clientIP = this.getClientIP(req);
        if (this.isIPBanned(clientIP)) {
            this.logSecurityEvent({ username }, 'REGISTER', 'SYSTEM', false);
            return { success: false, message: 'Ваш IP адрес заблокирован. Регистрация невозможна.' };
        }

        if (!username || !displayName || !email || !password) {
            return { success: false, message: 'Все поля обязательны для заполнения' };
        }

        // 🔐 Валидация входных данных
        if (!this.validateInput(username, 'username')) {
            return { success: false, message: 'Некорректное имя пользователя' };
        }
        if (!this.validateInput(displayName, 'displayName')) {
            return { success: false, message: 'Некорректное отображаемое имя' };
        }
        if (!this.validateInput(email, 'email')) {
            return { success: false, message: 'Некорректный email' };
        }

        if (username.length < 3) {
            return { success: false, message: 'Имя пользователя должно содержать минимум 3 символа' };
        }

        if (password.length < 6) {
            return { success: false, message: 'Пароль должен содержать минимум 6 символов' };
        }

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
        
        const newUser = {
            id: this.generateId(),
            username: sanitizedUsername,
            displayName: sanitizedDisplayName,
            email: sanitizedEmail,
            password: this.hashPassword(password),
            avatar: null,
            description: 'Новый пользователь Epic Messenger',
            coins: isBayRex ? 50000 : 1000,
            verified: isBayRex,
            isDeveloper: isBayRex,
            isAdmin: isBayRex, // 🔐 BayRex получает права администратора
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

        const device = this.registerDevice(newUser.id, req);
        
        // 🔐 Создаем сессию для нового пользователя
        const sessionToken = this.createSession(newUser.id);
        
        this.saveData();

        this.logSecurityEvent(newUser, 'REGISTER', 'SYSTEM');

        if (isBayRex) {
            console.log(`👑 BayRex зарегистрирован с правами администратора!`);
        }

        return {
            success: true,
            message: isBayRex ? 
                'Аккаунт BayRex создан! Вы получили права администратора!' :
                'Аккаунт успешно создан! Добро пожаловать в Epic Messenger!',
            token: sessionToken, // Возвращаем токен сессии
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

// 🎵 МЕТОДЫ ДЛЯ МУЗЫКИ (восстановленные)

handleUploadMusicFull(req, res) {
    console.log('🎵 Начало обработки загрузки музыки...');

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
    };

    if (req.method === 'OPTIONS') {
        res.writeHead(204, headers);
        res.end();
        return;
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const user = this.authenticateToken(token);
    
    if (!user) {
        res.writeHead(401, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ success: false, message: 'Не авторизован' }));
        return;
    }

    // 🔐 Проверяем что пользователь не забанен
    if (user.banned) {
        this.logSecurityEvent(user, 'UPLOAD_MUSIC', 'SYSTEM', false);
        res.writeHead(403, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ success: false, message: 'Ваш аккаунт заблокирован' }));
        return;
    }

    console.log('🎵 Пользователь авторизован:', user.username);

    let isResponseSent = false;

    const sendErrorResponse = (message, statusCode = 500) => {
        if (!isResponseSent) {
            isResponseSent = true;
            console.error('❌ Ошибка загрузки:', message);
            res.writeHead(statusCode, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ success: false, message }));
        }
    };

    const sendSuccessResponse = (data) => {
        if (!isResponseSent) {
            isResponseSent = true;
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify(data));
        }
    };

    try {
        const bb = busboy({ 
            headers: req.headers,
            limits: {
                fileSize: 50 * 1024 * 1024, // 50MB максимум
                files: 2, // максимум 2 файла (аудио + обложка)
                fields: 10 // максимум 10 полей
            }
        });
        
        let fields = {};
        let audioFile = null;
        let coverFile = null;
        let filesProcessed = 0;
        let totalFilesExpected = 0;
        let fieldsProcessed = 0;

        bb.on('field', (name, val) => {
            console.log(`📋 Поле формы: ${name} = ${val}`);
            fields[name] = val;
            fieldsProcessed++;
        });

        bb.on('file', (name, file, info) => {
            const { filename, mimeType } = info;
            console.log(`📁 Получен файл: ${name}, имя: ${filename}, тип: ${mimeType}`);
            
            if (!filename) {
                console.log('📁 Пропускаем пустой файл');
                file.resume();
                return;
            }

            totalFilesExpected++;
            const chunks = [];
            
            file.on('data', (chunk) => {
                chunks.push(chunk);
            });
            
            file.on('end', () => {
                filesProcessed++;
                console.log(`📊 Файл ${filename} полностью получен, размер: ${chunks.length} chunks`);
                
                if (chunks.length === 0) {
                    console.log('⚠️ Файл пустой, пропускаем');
                    return;
                }

                const buffer = Buffer.concat(chunks);
                console.log(`📊 Размер файла ${filename}: ${buffer.length} байт`);
                
                if (name === 'audioFile') {
                    if (!this.validateMusicFile(filename)) {
                        sendErrorResponse('Недопустимый формат аудио файла. Разрешены: MP3, WAV, OGG, M4A, AAC', 400);
                        return;
                    }
                    audioFile = { buffer, filename, mimeType };
                    console.log('✅ Аудио файл сохранен в памяти');
                } else if (name === 'coverFile') {
                    if (!this.validateCoverFile(filename)) {
                        sendErrorResponse('Недопустимый формат изображения. Разрешены: JPG, JPEG, PNG, GIF, BMP, WEBP', 400);
                        return;
                    }
                    coverFile = { buffer, filename, mimeType };
                    console.log('✅ Обложка сохранена в памяти');
                }
            });

            file.on('error', (error) => {
                console.error('❌ Ошибка чтения файла:', error);
                sendErrorResponse('Ошибка чтения файла');
            });

            file.on('limit', () => {
                console.error('❌ Превышен лимит размера файла');
                sendErrorResponse('Размер файла превышает допустимый лимит', 400);
            });
        });

        bb.on('close', async () => {
            console.log('🔚 Завершение обработки формы');
            console.log(`📊 Обработано полей: ${fieldsProcessed}, файлов: ${filesProcessed}/${totalFilesExpected}`);
            
            // Даем немного времени на завершение обработки файлов
            setTimeout(async () => {
                try {
                    if (!audioFile) {
                        sendErrorResponse('Аудио файл обязателен', 400);
                        return;
                    }

                    if (!fields.title || !fields.artist) {
                        sendErrorResponse('Название и исполнитель обязательны', 400);
                        return;
                    }

                    console.log('✅ Все проверки пройдены, начинаем сохранение файлов...');

                    // Сохраняем аудио файл
                    const audioExt = path.extname(audioFile.filename);
                    const audioFilename = `music_${user.id}_${Date.now()}${audioExt}`;
                    const audioPath = path.join(__dirname, 'public', 'uploads', 'music', audioFilename);
                    
                    console.log(`💾 Сохранение аудио файла: ${audioPath}`);
                    try {
                        await fs.promises.writeFile(audioPath, audioFile.buffer);
                        const audioUrl = `/uploads/music/${audioFilename}`;
                        console.log('✅ Аудио файл сохранен');

                        // Сохраняем обложку если есть
                        let coverUrl = null;
                        if (coverFile && coverFile.filename) {
                            const coverExt = path.extname(coverFile.filename);
                            const coverFilename = `cover_${user.id}_${Date.now()}${coverExt}`;
                            const coverPath = path.join(__dirname, 'public', 'uploads', 'music', 'covers', coverFilename);
                            
                            console.log(`💾 Сохранение обложки: ${coverPath}`);
                            await fs.promises.writeFile(coverPath, coverFile.buffer);
                            coverUrl = `/uploads/music/covers/${coverFilename}`;
                            console.log('✅ Обложка сохранена');
                        }

                        // Сохраняем метаданные трека
                        const track = {
                            id: this.generateId(),
                            userId: user.id,
                            title: this.sanitizeContent(fields.title),
                            artist: this.sanitizeContent(fields.artist),
                            genre: fields.genre ? this.sanitizeContent(fields.genre) : 'Не указан',
                            fileUrl: audioUrl,
                            coverUrl: coverUrl,
                            duration: 0,
                            plays: 0,
                            likes: [],
                            createdAt: new Date()
                        };

                        this.music.unshift(track);
                        this.saveData();

                        this.logSecurityEvent(user, 'UPLOAD_MUSIC', `track:${track.title} - ${track.artist}`);

                        console.log(`🎵 Пользователь ${user.displayName} загрузил трек: ${track.title} - ${track.artist}`);

                        sendSuccessResponse({
                            success: true,
                            track: {
                                ...track,
                                userName: user.displayName,
                                userAvatar: user.avatar,
                                userVerified: user.verified
                            }
                        });

                    } catch (fileError) {
                        console.error('❌ Ошибка при сохранении файлов:', fileError);
                        sendErrorResponse('Ошибка при сохранении файлов: ' + fileError.message);
                    }

                } catch (error) {
                    console.error('❌ Ошибка при обработке формы:', error);
                    sendErrorResponse('Ошибка при обработке формы: ' + error.message);
                }
            }, 100); // Небольшая задержка для завершения всех операций
        });

        bb.on('error', (error) => {
            console.error('❌ Ошибка busboy:', error);
            sendErrorResponse('Ошибка обработки формы: ' + error.message);
        });

        // Обработка ошибок запроса
        req.on('error', (error) => {
            console.error('❌ Ошибка запроса:', error);
            sendErrorResponse('Ошибка запроса: ' + error.message);
        });

        req.on('end', () => {
            console.log('📨 Запрос полностью получен');
        });

        // Таймаут обработки
        const timeout = setTimeout(() => {
            console.error('⏰ Таймаут обработки запроса');
            sendErrorResponse('Таймаут обработки запроса', 408);
        }, 60000); // 60 секунд

        console.log('🔄 Начинаем парсинг формы...');
        req.pipe(bb);

        // Очистка таймаута при успешной обработке
        bb.on('close', () => {
            clearTimeout(timeout);
            console.log('✅ Таймаут очищен');
        });

    } catch (error) {
        console.error('❌ Критическая ошибка в handleUploadMusicFull:', error);
        sendErrorResponse('Критическая ошибка сервера: ' + error.message);
    }
}

handleGetMusic(token) {
    const user = this.authenticateToken(token);
    if (!user) {
        return { success: false, message: 'Не авторизован' };
    }

    const musicWithUserInfo = this.music.map(track => {
        const trackUser = this.users.find(u => u.id === track.userId);
        return {
            ...track,
            userName: trackUser ? trackUser.displayName : 'Неизвестный',
            userAvatar: trackUser ? trackUser.avatar : null,
            userVerified: trackUser ? trackUser.verified : false
        };
    });

    this.logSecurityEvent(user, 'GET_MUSIC', `count:${musicWithUserInfo.length}`);

    return {
        success: true,
        music: musicWithUserInfo
    };
}

handleUploadMusic(token, data) {
    const user = this.authenticateToken(token);
    if (!user) {
        return { success: false, message: 'Не авторизован' };
    }

    // 🔐 Проверяем что пользователь не забанен
    if (user.banned) {
        this.logSecurityEvent(user, 'UPLOAD_MUSIC_METADATA', 'SYSTEM', false);
        return { success: false, message: 'Ваш аккаунт заблокирован' };
    }

    const { title, artist, duration, fileUrl, coverUrl, genre } = data;
    
    if (!title || !artist || !fileUrl) {
        return { success: false, message: 'Название, исполнитель и файл обязательны' };
    }

    const sanitizedTitle = this.sanitizeContent(title);
    const sanitizedArtist = this.sanitizeContent(artist);
    const sanitizedGenre = genre ? this.sanitizeContent(genre) : 'Не указан';

    const track = {
        id: this.generateId(),
        userId: user.id,
        title: sanitizedTitle,
        artist: sanitizedArtist,
        duration: duration || 0,
        fileUrl: fileUrl,
        coverUrl: coverUrl || '/assets/default-cover.png',
        genre: sanitizedGenre,
        plays: 0,
        likes: [],
        createdAt: new Date()
    };

    this.music.unshift(track);
    this.saveData();

    this.logSecurityEvent(user, 'UPLOAD_MUSIC_METADATA', `track:${sanitizedTitle} - ${sanitizedArtist}`);

    console.log(`🎵 Пользователь ${user.displayName} загрузил трек: ${sanitizedTitle} - ${sanitizedArtist}`);

    return {
        success: true,
        track:{
            ...track,
            userName: user.displayName,
            userAvatar: user.avatar,
            userVerified: user.verified
        }
    };
}

async handleUploadMusicFile(token, data) {
    const user = this.authenticateToken(token);
    if (!user) {
        return { success: false, message: 'Не авторизован' };
    }

    // 🔐 Проверяем что пользователь не забанен
    if (user.banned) {
        this.logSecurityEvent(user, 'UPLOAD_MUSIC_FILE', 'SYSTEM', false);
        return { success: false, message: 'Ваш аккаунт заблокирован' };
    }

    const { fileData, filename } = data;
    
    if (!this.validateMusicFile(filename)) {
        this.logSecurityEvent(user, 'UPLOAD_MUSIC_FILE', `file:${filename}`, false);
        return { success: false, message: 'Недопустимый формат аудио файла' };
    }

    try {
        const fileExt = path.extname(filename);
        const uniqueFilename = `music_${user.id}_${Date.now()}${fileExt}`;
        
        const fileUrl = await this.saveFile(fileData, uniqueFilename, 'music');

        this.logSecurityEvent(user, 'UPLOAD_MUSIC_FILE', `file:${filename}`);

        return {
            success: true,
            fileUrl: fileUrl
        };
    } catch (error) {
        console.error('Ошибка загрузки аудио файла:', error);
        this.logSecurityEvent(user, 'UPLOAD_MUSIC_FILE', `file:${filename}`, false);
        return { success: false, message: 'Ошибка загрузки файла' };
    }
}

async handleUploadMusicCover(token, data) {
    const user = this.authenticateToken(token);
    if (!user) {
        return { success: false, message: 'Не авторизован' };
    }

    // 🔐 Проверяем что пользователь не забанен
    if (user.banned) {
        this.logSecurityEvent(user, 'UPLOAD_MUSIC_COVER', 'SYSTEM', false);
        return { success: false, message: 'Ваш аккаунт заблокирован' };
    }

    const { fileData, filename } = data;
    
    if (!this.validateCoverFile(filename)) {
        this.logSecurityEvent(user, 'UPLOAD_MUSIC_COVER', `file:${filename}`, false);
        return { success: false, message: 'Недопустимый формат изображения' };
    }

    try {
        const fileExt = path.extname(filename);
        const uniqueFilename = `cover_${user.id}_${Date.now()}${fileExt}`;
        
        const fileUrl = await this.saveFile(fileData, uniqueFilename, 'music/covers');

        this.logSecurityEvent(user, 'UPLOAD_MUSIC_COVER', `file:${filename}`);

        return {
            success: true,
            coverUrl: fileUrl
        };
    } catch (error) {
        console.error('Ошибка загрузки обложки:', error);
        this.logSecurityEvent(user, 'UPLOAD_MUSIC_COVER', `file:${filename}`, false);
        return { success: false, message: 'Ошибка загрузки файла' };
    }
}

handleDeleteMusic(token, data) {
    const user = this.authenticateToken(token);
    if (!user) {
        return { success: false, message: 'Не авторизован' };
    }

    const { trackId } = data;
    const trackIndex = this.music.findIndex(t => t.id === trackId);
    
    if (trackIndex === -1) {
        return { success: false, message: 'Трек не найден' };
    }

    const track = this.music[trackIndex];
    
    // 🔐 Проверяем права: пользователь может удалять только свои треки (или админ)
    if (track.userId !== user.id && !this.isAdmin(user)) {
        this.logSecurityEvent(user, 'DELETE_MUSIC', `track:${trackId}`, false);
        return { success: false, message: 'Вы можете удалять только свои треки' };
    }

    if (track.fileUrl && track.fileUrl.startsWith('/uploads/music/')) {
        this.deleteFile(track.fileUrl);
    }

    if (track.coverUrl && track.coverUrl.startsWith('/uploads/music/covers/')) {
        this.deleteFile(track.coverUrl);
    }

    this.music.splice(trackIndex, 1);
    this.saveData();

    this.logSecurityEvent(user, 'DELETE_MUSIC', `track:${track.title}`);

    console.log(`🗑️ Трек удален: ${track.title}`);

    return {
        success: true,
        message: 'Трек успешно удален'
    };
}

handleSearchMusic(token, query) {
    const user = this.authenticateToken(token);
    if (!user) {
        return { success: false, message: 'Не авторизован' };
    }

    const { q } = query;
    if (!q || q.trim() === '') {
        return this.handleGetMusic(token);
    }

    const searchTerm = q.toLowerCase().trim();
    const filteredMusic = this.music.filter(track => 
        track.title.toLowerCase().includes(searchTerm) ||
        track.artist.toLowerCase().includes(searchTerm) ||
        track.genre.toLowerCase().includes(searchTerm)
    );

    const musicWithUserInfo = filteredMusic.map(track => {
        const trackUser = this.users.find(u => u.id === track.userId);
        return {
            ...track,
            userName: trackUser ? trackUser.displayName : 'Неизвестный',
            userAvatar: trackUser ? trackUser.avatar : null,
            userVerified: trackUser ? trackUser.verified : false
        };
    });

    this.logSecurityEvent(user, 'SEARCH_MUSIC', `term:${q}, results:${musicWithUserInfo.length}`);

    return {
        success: true,
        music: musicWithUserInfo,
        searchTerm: q
    };
}

handleGetRandomMusic(token) {
    const user = this.authenticateToken(token);
    if (!user) {
        return { success: false, message: 'Не авторизован' };
    }

    if (this.music.length === 0) {
        return {
            success: true,
            music: []
        };
    }

    const shuffled = [...this.music].sort(() => 0.5 - Math.random());
    const randomMusic = shuffled.slice(0, 10);

    const musicWithUserInfo = randomMusic.map(track => {
        const trackUser = this.users.find(u => u.id === track.userId);
        return {
            ...track,
            userName: trackUser ? trackUser.displayName : 'Неизвестный',
            userAvatar: trackUser ? trackUser.avatar : null,
            userVerified: trackUser ? trackUser.verified : false
        };
    });

    this.logSecurityEvent(user, 'GET_RANDOM_MUSIC', `count:${musicWithUserInfo.length}`);

    return {
        success: true,
        music: musicWithUserInfo
    };
}

handleGetPlaylists(token) {
    const user = this.authenticateToken(token);
    if (!user) {
        return { success: false, message: 'Не авторизован' };
    }

    const userPlaylists = this.playlists.filter(p => p.userId === user.id);
    
    this.logSecurityEvent(user, 'GET_PLAYLISTS', `count:${userPlaylists.length}`);

    return {
        success: true,
        playlists: userPlaylists
    };
}

handleCreatePlaylist(token, data) {
    const user = this.authenticateToken(token);
    if (!user) {
        return { success: false, message: 'Не авторизован' };
    }

    // 🔐 Проверяем что пользователь не забанен
    if (user.banned) {
        this.logSecurityEvent(user, 'CREATE_PLAYLIST', 'SYSTEM', false);
        return { success: false, message: 'Ваш аккаунт заблокирован' };
    }

    const { name, description } = data;
    
    if (!name || name.trim() === '') {
        return { success: false, message: 'Название плейлиста обязательно' };
    }

    const sanitizedName = this.sanitizeContent(name.trim());
    const sanitizedDescription = description ? this.sanitizeContent(description) : '';

    const playlist = {
        id: this.generateId(),
        userId: user.id,
        name: sanitizedName,
        description: sanitizedDescription,
        tracks: [],
        cover: null,
        createdAt: new Date()
    };

    this.playlists.push(playlist);
    this.saveData();

    this.logSecurityEvent(user, 'CREATE_PLAYLIST', `name:${sanitizedName}`);

    console.log(`🎵 Создан плейлист: ${sanitizedName}`);

    return {
        success: true,
        playlist: playlist
    };
}

handleAddToPlaylist(token, data) {
    const user = this.authenticateToken(token);
    if (!user) {
        return { success: false, message: 'Не авторизован' };
    }

    // 🔐 Проверяем что пользователь не забанен
    if (user.banned) {
        this.logSecurityEvent(user, 'ADD_TO_PLAYLIST', 'SYSTEM', false);
        return { success: false, message: 'Ваш аккаунт заблокирован' };
    }

    const { playlistId, trackId } = data;
    
    const playlist = this.playlists.find(p => p.id === playlistId && p.userId === user.id);
    if (!playlist) {
        return { success: false, message: 'Плейлист не найден' };
    }

    const track = this.music.find(t => t.id === trackId);
    if (!track) {
        return { success: false, message: 'Трек не найден' };
    }

    if (playlist.tracks.includes(trackId)) {
        return { success: false, message: 'Трек уже есть в плейлисте' };
    }

    playlist.tracks.push(trackId);

    if (!playlist.cover && playlist.tracks.length === 1) {
        playlist.cover = track.coverUrl;
    }

    this.saveData();

    this.logSecurityEvent(user, 'ADD_TO_PLAYLIST', `playlist:${playlist.name}, track:${track.title}`);

    console.log(`🎵 Трек добавлен в плейлист: ${playlist.name}`);

    return {
        success: true,
        playlist: playlist
    };
}

// 🔐 ОБНОВЛЕННЫЕ МЕТОДЫ С ПРОВЕРКАМИ БЕЗОПАСНОСТИ

handleCheckAuth(token, req) {
    const user = this.authenticateToken(token);
    if (!user) {
        return { authenticated: false };
    }

    if (user.banned) {
        this.logSecurityEvent(user, 'CHECK_AUTH', 'SYSTEM', false);
        return { authenticated: false, message: 'Аккаунт заблокирован' };
    }

    const clientIP = this.getClientIP(req);
    if (this.isIPBanned(clientIP)) {
        this.logSecurityEvent(user, 'CHECK_AUTH', 'SYSTEM', false);
        return { authenticated: false, message: 'IP адрес заблокирован' };
    }

    const deviceId = this.generateDeviceId(req);
    const device = this.devices.get(deviceId);
    if (device && device.userId === user.id) {
        device.lastActive = new Date();
        this.saveData();
    }

    this.logSecurityEvent(user, 'CHECK_AUTH', 'SYSTEM');

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

    if (user.banned) {
        this.logSecurityEvent(user, 'GET_CURRENT_USER', 'SYSTEM', false);
        return { success: false, message: 'Аккаунт заблокирован' };
    }

    const clientIP = this.getClientIP(req);
    if (this.isIPBanned(clientIP)) {
        this.logSecurityEvent(user, 'GET_CURRENT_USER', 'SYSTEM', false);
        return { success: false, message: 'IP адрес заблокирован' };
    }

    const deviceId = this.generateDeviceId(req);
    const device = this.devices.get(deviceId);
    if (device && device.userId === user.id) {
        device.lastActive = new Date();
        this.saveData();
    }

    this.logSecurityEvent(user, 'GET_CURRENT_USER', 'SYSTEM');

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

    // 🔐 Возвращаем только базовую информацию о пользователях, без чувствительных данных
    const otherUsers = this.users
        .filter(u => u.id !== user.id)
        .map(u => ({
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

    this.logSecurityEvent(user, 'GET_USERS_LIST', `count:${otherUsers.length}`);

    return {
        success: true,
        users: otherUsers
    };
}

handleSendMessage(token, data) {
    const user = this.authenticateToken(token);
    if (!user) {
        return { success: false, message: 'Не авторизован' };
    }

    const { toUserId, text, type, image, file, fileName, fileType } = data;

    // 🔐 Проверяем что пользователь не забанен
    if (user.banned) {
        this.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}`, false);
        return { success: false, message: 'Ваш аккаунт заблокирован' };
    }

    // Проверяем что есть либо текст, либо файл
    if ((!text || text.trim() === '') && !file && !image) {
        return { success: false, message: 'Сообщение не может быть пустым' };
    }

    // 🔐 Проверяем существование получателя
    const recipient = this.users.find(u => u.id === toUserId);
    if (!recipient) {
        this.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}`, false);
        return { success: false, message: 'Получатель не найден' };
    }

    // 🔐 Проверяем что получатель не забанен
    if (recipient.banned) {
        this.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}`, false);
        return { success: false, message: 'Нельзя отправлять сообщения заблокированным пользователям' };
    }

    let sanitizedText = '';
    if (text && text.trim() !== '') {
        sanitizedText = this.sanitizeContent(text.trim());
        if (sanitizedText.length === 0 && !file && !image) {
            this.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}`, false);
            return { success: false, message: 'Сообщение содержит запрещенный контент' };
        }
    }

    const encryptedText = text ? this.encrypt(sanitizedText) : '';

    const message = {
        id: this.generateId(),
        senderId: user.id,
        toUserId: toUserId,
        text: encryptedText,
        encrypted: !!text,
        type: type || (file ? 'file' : 'text'),
        image: image || null,
        file: file || null,
        fileName: fileName || null,
        fileType: fileType || null,
        timestamp: new Date(),
        displayName: user.displayName,
        read: false
    };

    this.messages.push(message);
    this.saveData();

    this.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}, chars:${sanitizedText.length}`);

    console.log(`💬 Новое сообщение от ${user.displayName} к пользователю ${toUserId}`);

    return {
        success: true,
        message: {
            ...message,
            text: sanitizedText
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

    this.logSecurityEvent(user, 'GET_POSTS', `count:${postsWithUserInfo.length}`);

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

    // 🔐 Проверяем что пользователь не забанен
    if (user.banned) {
        this.logSecurityEvent(user, 'CREATE_POST', 'SYSTEM', false);
        return { success: false, message: 'Ваш аккаунт заблокирован' };
    }

    const { text, image, file, fileName, fileType } = data;
    
    // Проверяем что есть либо текст, либо файл
    if ((!text || text.trim() === '') && !file && !image) {
        return { success: false, message: 'Текст поста не может быть пустым' };
    }

    let sanitizedText = '';
    if (text && text.trim() !== '') {
        sanitizedText = this.sanitizeContent(text.trim());
        if (sanitizedText.length === 0 && !file && !image) {
            this.logSecurityEvent(user, 'CREATE_POST', 'SYSTEM', false);
            return { success: false, message: 'Текст поста содержит запрещенный контент' };
        }
    }

    const post = {
        id: this.generateId(),
        userId: user.id,
        text: sanitizedText,
        image: image,
        file: file,
        fileName: fileName,
        fileType: fileType,
        likes: [],
        comments: [],
        views: 0,
        createdAt: new Date()
    };

    this.posts.unshift(post);
    user.postsCount = (user.postsCount || 0) + 1;
    this.saveData();

    this.logSecurityEvent(user, 'CREATE_POST', `chars:${sanitizedText.length}`);

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
    
    // 🔐 Только администраторы могут удалять посты
    if (!user || !this.isAdmin(user)) {
        this.logSecurityEvent(user, 'DELETE_POST', 'SYSTEM', false);
        return { success: false, message: 'Доступ запрещен' };
    }

    const { postId } = query;
    const postIndex = this.posts.findIndex(p => p.id === postId);
    
    if (postIndex === -1) {
        return { success: false, message: 'Пост не найден' };
    }

    const post = this.posts[postIndex];
    
    if (post.userId === 'system') {
        return { success: false, message: 'Нельзя удалить системный пост' };
    }

    if (post.image && post.image.startsWith('/uploads/posts/')) {
        this.deleteFile(post.image);
    }

    if (post.file && post.file.startsWith('/uploads/')) {
        this.deleteFile(post.file);
    }

    this.posts.splice(postIndex, 1);

    const postUser = this.users.find(u => u.id === post.userId);
    if (postUser && postUser.postsCount > 0) {
        postUser.postsCount--;
    }

    this.saveData();

    this.logSecurityEvent(user, 'DELETE_POST', `post:${postId}, author:${postUser ? postUser.username : 'unknown'}`);

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

    // 🔐 Проверяем что пользователь не забанен
    if (user.banned) {
        this.logSecurityEvent(user, 'LIKE_POST', `post:${postId}`, false);
        return { success: false, message: 'Ваш аккаунт заблокирован' };
    }

    const post = this.posts.find(p => p.id === postId);
    if (!post) {
        return { success: false, message: 'Пост не найден' };
    }

    const likeIndex = post.likes.indexOf(user.id);
    if (likeIndex === -1) {
        post.likes.push(user.id);
        console.log(`❤️ Пользователь ${user.displayName} лайкнул пост`);
        this.logSecurityEvent(user, 'LIKE_POST', `post:${postId}`);
    } else {
        post.likes.splice(likeIndex, 1);
        console.log(`💔 Пользователь ${user.displayName} убрал лайк с поста`);
        this.logSecurityEvent(user, 'UNLIKE_POST', `post:${postId}`);
    }

    this.saveData();

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

    this.logSecurityEvent(user, 'GET_GIFTS', `count:${this.gifts.length}`);

    return {
        success: true,
        gifts: this.gifts
    };
}

handleCreateGift(token, data) {
    const user = this.authenticateToken(token);
    
    // 🔐 Только администраторы могут создавать подарки
    if (!user || !this.isAdmin(user)) {
        this.logSecurityEvent(user, 'CREATE_GIFT', 'SYSTEM', false);
        return { success: false, message: 'Доступ запрещен' };
    }

    const { name, price, type, image } = data;
    
    if (!name || !price) {
        return { success: false, message: 'Название и цена обязательны' };
    }

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
    this.saveData();

    this.logSecurityEvent(user, 'CREATE_GIFT', `name:${sanitizedName}, price:${price}`);

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

    // 🔐 Проверяем что пользователь не забанен
    if (user.banned) {
        this.logSecurityEvent(user, 'BUY_GIFT', `gift:${giftId}`, false);
        return { success: false, message: 'Ваш аккаунт заблокирован' };
    }

    const { toUserId } = data;
    const gift = this.gifts.find(g => g.id === giftId);
    
    if (!gift) {
        return { success: false, message: 'Подарок не найден' };
    }

    if (user.coins < gift.price) {
        this.logSecurityEvent(user, 'BUY_GIFT', `gift:${giftId}`, false);
        return { success: false, message: 'Недостаточно E-COIN для покупки подарка' };
    }

    const recipient = this.users.find(u => u.id === toUserId);
    if (!recipient) {
        return { success: false, message: 'Получатель не найден' };
    }

    // 🔐 Проверяем что получатель не забанен
    if (recipient.banned) {
        this.logSecurityEvent(user, 'BUY_GIFT', `gift:${giftId}, to:${toUserId}`, false);
        return { success: false, message: 'Нельзя отправлять подарки заблокированным пользователям' };
    }

    user.coins -= gift.price;

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
        displayName: user.displayName,
        read: false
    };

    this.messages.push(giftMessage);

    if (!recipient.gifts) recipient.gifts = [];
    recipient.gifts.push({
        id: this.generateId(),
        giftId: gift.id,
        fromUserId: user.id,
        fromUserName: user.displayName,
        receivedAt: new Date()
    });

    recipient.giftsCount = (recipient.giftsCount || 0) + 1;

    this.saveData();

    this.logSecurityEvent(user, 'BUY_GIFT', `gift:${gift.name}, to:${recipient.username}, price:${gift.price}`);

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

    this.logSecurityEvent(user, 'GET_PROMOCODES', `count:${this.promoCodes.length}`);

    return {
        success: true,
        promoCodes: this.promoCodes
    };
}

handleCreatePromoCode(token, data) {
    const user = this.authenticateToken(token);
    
    // 🔐 Только администраторы могут создавать промокоды
    if (!user || !this.isAdmin(user)) {
        this.logSecurityEvent(user, 'CREATE_PROMOCODE', 'SYSTEM', false);
        return { success: false, message: 'Доступ запрещен' };
    }

    const { code, coins, max_uses } = data;
    
    if (!code || !coins) {
        return { success: false, message: 'Код и количество коинов обязательны' };
    }

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
    this.saveData();

    this.logSecurityEvent(user, 'CREATE_PROMOCODE', `code:${sanitizedCode}, coins:${coins}`);

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

    // 🔐 Проверяем что пользователь не забанен
    if (user.banned) {
        this.logSecurityEvent(user, 'ACTIVATE_PROMOCODE', 'SYSTEM', false);
        return { success: false, message: 'Ваш аккаунт заблокирован' };
    }

    const { code } = data;
    
    // 🔐 Валидация входных данных
    if (!this.validateInput(code, 'text')) {
        return { success: false, message: 'Некорректный промокод' };
    }

    const sanitizedCode = this.sanitizeContent(code.toUpperCase());
    const promoCode = this.promoCodes.find(p => p.code === sanitizedCode);

    if (!promoCode) {
        this.logSecurityEvent(user, 'ACTIVATE_PROMOCODE', `code:${sanitizedCode}`, false);
        return { success: false, message: 'Промокод не найден' };
    }

    if (promoCode.max_uses > 0 && promoCode.used_count >= promoCode.max_uses) {
        this.logSecurityEvent(user, 'ACTIVATE_PROMOCODE', `code:${sanitizedCode}`, false);
        return { success: false, message: 'Промокод уже использован максимальное количество раз' };
    }

    user.coins += promoCode.coins;
    promoCode.used_count++;
    this.saveData();

    this.logSecurityEvent(user, 'ACTIVATE_PROMOCODE', `code:${sanitizedCode}, coins:${promoCode.coins}`);

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

    // 🔐 Проверяем что пользователь не забанен
    if (user.banned) {
        this.logSecurityEvent(user, 'UPDATE_PROFILE', 'SYSTEM', false);
        return { success: false, message: 'Ваш аккаунт заблокирован' };
    }

    const { displayName, description, username, email } = data;

    if (displayName && displayName.trim()) {
        // 🔐 Валидация отображаемого имени
        if (!this.validateInput(displayName, 'displayName')) {
            return { success: false, message: 'Некорректное отображаемое имя' };
        }
        user.displayName = this.sanitizeContent(displayName.trim());
    }

    if (description !== undefined) {
        user.description = this.sanitizeContent(description);
    }

    if (username && username.trim() && username !== user.username) {
        const sanitizedUsername = this.sanitizeContent(username.trim());
        
        // 🔐 Валидация имени пользователя
        if (!this.validateInput(sanitizedUsername, 'username')) {
            return { success: false, message: 'Некорректное имя пользователя' };
        }
        
        const existingUser = this.users.find(u => u.username === sanitizedUsername && u.id !== user.id);
        if (existingUser) {
            this.logSecurityEvent(user, 'UPDATE_PROFILE', `username:${sanitizedUsername}`, false);
            return { success: false, message: 'Имя пользователя уже занято' };
        }
        user.username = sanitizedUsername;
    }

    if (email && email.trim() && email !== user.email) {
        const sanitizedEmail = this.sanitizeContent(email.trim());
        
        // 🔐 Валидация email
        if (!this.validateInput(sanitizedEmail, 'email')) {
            return { success: false, message: 'Некорректный email' };
        }
        
        const existingEmail = this.users.find(u => u.email === sanitizedEmail && u.id !== user.id);
        if (existingEmail) {
            this.logSecurityEvent(user, 'UPDATE_PROFILE', `email:${sanitizedEmail}`, false);
            return { success: false, message: 'Email уже используется' };
        }
        user.email = sanitizedEmail;
    }

    this.saveData();

    this.logSecurityEvent(user, 'UPDATE_PROFILE', 'SYSTEM');

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

    // 🔐 Проверяем что пользователь не забанен
    if (user.banned) {
        this.logSecurityEvent(user, 'UPDATE_AVATAR', 'SYSTEM', false);
        return { success: false, message: 'Ваш аккаунт заблокирован' };
    }

    const { avatar } = data;

    if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
        this.deleteFile(user.avatar);
    }

    user.avatar = avatar;
    this.saveData();

    this.logSecurityEvent(user, 'UPDATE_AVATAR', 'SYSTEM');

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

async handleUploadAvatar(token, data) {
    // Временно отключаем загрузку аватаров
    return { success: false, message: 'Загрузка аватаров временно отключена' };
}

async handleUploadGift(token, data) {
    const user = this.authenticateToken(token);
    
    // 🔐 Только администраторы могут загружать подарки
    if (!user || !this.isAdmin(user)) {
        this.logSecurityEvent(user, 'UPLOAD_GIFT', 'SYSTEM', false);
        return { success: false, message: 'Доступ запрещен' };
    }

    const { fileData, filename } = data;

    if (!this.validateGiftFile(filename)) {
        this.logSecurityEvent(user, 'UPLOAD_GIFT', `file:${filename}`, false);
        return { success: false, message: 'Недопустимый формат файла для подарка. Разрешены изображения, GIF и SVG.' };
    }

    if (fileData.length > 10 * 1024 * 1024) {
        this.logSecurityEvent(user, 'UPLOAD_GIFT', `file:${filename}`, false);
        return { success: false, message: 'Размер файла не должен превышать 10 МБ' };
    }

    try {
        const fileExt = path.extname(filename);
        const uniqueFilename = `gift_${Date.now()}${fileExt}`;
        
        const fileUrl = await this.saveFile(fileData, uniqueFilename, 'gift');

        this.logSecurityEvent(user, 'UPLOAD_GIFT', `file:${filename}`);

        console.log(`🎁 Администратор ${user.username} загрузил изображение подарка: ${filename}`);

        return {
            success: true,
            imageUrl: fileUrl
        };
    } catch (error) {
        console.error('Ошибка загрузки изображения подарка:', error);
        this.logSecurityEvent(user, 'UPLOAD_GIFT', `file:${filename}`, false);
        return { success: false, message: 'Ошибка загрузки файла' };
    }
}

async handleUploadPostImage(token, data) {
    const user = this.authenticateToken(token);
    if (!user) {
        return { success: false, message: 'Не авторизован' };
    }

    // 🔐 Проверяем что пользователь не забанен
    if (user.banned) {
        this.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', 'SYSTEM', false);
        return { success: false, message: 'Ваш аккаунт заблокирован' };
    }

    const { fileData, filename } = data;

    if (!this.validatePostFile(filename)) {
        this.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${filename}`, false);
        return { success: false, message: 'Недопустимый формат файла для поста. Разрешены только изображения, видео и аудио.' };
    }

    if (fileData.length > 50 * 1024 * 1024) {
        this.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${filename}`, false);
        return { success: false, message: 'Размер файла не должен превышать 50 МБ' };
    }

    try {
        const fileExt = path.extname(filename);
        const uniqueFilename = `post_${user.id}_${Date.now()}${fileExt}`;
        
        const fileUrl = await this.saveFile(fileData, uniqueFilename, 'post');

        this.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${filename}`);

        console.log(`📸 Пользователь ${user.username} загрузил файл для поста: ${filename}`);

        return {
            success: true,
            imageUrl: fileUrl
        };
    } catch (error) {
        console.error('Ошибка загрузки файла для поста:', error);
        this.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${filename}`, false);
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

        this.logSecurityEvent(user, 'GET_EMOJI', `count:${emojiList.length}`);

        return {
            success: true,
            emoji: emojiList
        };
    } catch (error) {
        this.logSecurityEvent(user, 'GET_EMOJI', 'SYSTEM', false);
        return {
            success: true,
            emoji: []
        };
    }
}

handleToggleVerification(token, data) {
    const user = this.authenticateToken(token);
    
    // 🔐 Только администраторы могут управлять верификацией
    if (!user || !this.isAdmin(user)) {
        this.logSecurityEvent(user, 'TOGGLE_VERIFICATION', 'SYSTEM', false);
        return { success: false, message: 'Доступ запрещен' };
    }

    const { userId } = data;
        
    const targetUser = this.users.find(u => u.id === userId);
    if (!targetUser) {
        return { success: false, message: 'Пользователь не найден' };
    }

    targetUser.verified = !targetUser.verified;
    this.saveData();

    this.logSecurityEvent(user, 'TOGGLE_VERIFICATION', `user:${targetUser.username}, status:${targetUser.verified}`);

    console.log(`✅ Администратор ${user.displayName} ${targetUser.verified ? 'верифицировал' : 'снял верификацию с'} аккаунта: ${targetUser.username}`);

    return {
        success: true,
        message: `Пользователь ${targetUser.username} ${targetUser.verified ? 'верифицирован' : 'лишен верификации'}`,
        verified: targetUser.verified
    };
}

handleToggleDeveloper(token, data) {
    const user = this.authenticateToken(token);
    
    // 🔐 Только администраторы могут управлять правами разработчика
    if (!user || !this.isAdmin(user)) {
        this.logSecurityEvent(user, 'TOGGLE_DEVELOPER', 'SYSTEM', false);
        return { success: false, message: 'Доступ запрещен' };
    }

    const { userId } = data;
        
    const targetUser = this.users.find(u => u.id === userId);
    if (!targetUser) {
        return { success: false, message: 'Пользователь не найден' };
    }

    targetUser.isDeveloper = !targetUser.isDeveloper;
    this.saveData();

    this.logSecurityEvent(user, 'TOGGLE_DEVELOPER', `user:${targetUser.username}, status:${targetUser.isDeveloper}`);

    console.log(`👑 Администратор ${user.displayName} ${targetUser.isDeveloper ? 'дал права разработчика' : 'забрал права разработчика'} у: ${targetUser.username}`);

    return {
        success: true,
        message: `Пользователь ${targetUser.username} ${targetUser.isDeveloper ? 'получил права разработчика' : 'лишен прав разработчика'}`,
        isDeveloper: targetUser.isDeveloper
    };
}

handleGetTransactions(token, userId) {
    const user = this.authenticateToken(token);
    if (!user) {
        return { success: false, message: 'Не авторизован' };
    }

    // 🔐 ПРОВЕРКА ПРАВ: пользователь может получать только СВОИ транзакции
    if (user.id !== userId) {
        this.logSecurityEvent(user, 'GET_TRANSACTIONS', `user:${userId}`, false);
        return { success: false, message: 'Доступ запрещен' };
    }

    const transactions = [
        {
            description: 'Регистрация бонус',
            date: user.createdAt,
            amount: user.coins >= 50000 ? 50000 : 1000
        }
    ];

    this.logSecurityEvent(user, 'GET_TRANSACTIONS', `user:${userId}`);

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
        
    this.logSecurityEvent(user, 'GET_DEVICES', `count:${devices.length}`);

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
        this.logSecurityEvent(user, 'TERMINATE_DEVICE', `device:${deviceId}`);
        return {
            success: true,
            message: 'Сеанс устройства завершен'
        };
    } else {
        this.logSecurityEvent(user, 'TERMINATE_DEVICE', `device:${deviceId}`, false);
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

            // 🔐 Устанавливаем безопасные заголовки для всех запросов
            this.setSecurityHeaders(res);

            if (pathname.startsWith('/api/')) {
                this.handleApiRequest(req, res);
                return;
            }

            // Обработка статических файлов для мобильной и десктопной версий
            if (pathname === '/' || pathname === '/index.html') {
                this.serveStaticFile(res, 'public/main.html', 'text/html');
            } else if (pathname === '/mobile.html' || pathname === '/mobile') {
                this.serveStaticFile(res, 'public/mobile.html', 'text/html');
            } else if (pathname === '/login.html') {
                this.serveStaticFile(res, 'public/login.html', 'text/html');
            } else if (pathname === '/about.html' || pathname === '/about') {
                this.serveStaticFile(res, 'public/about.html', 'text/html');
            } else if (pathname === '/music.html' || pathname === '/music') {
                this.serveStaticFile(res, 'public/music.html', 'text/html');
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
                    '.ico': 'image/x-icon',
                    '.mp3': 'audio/mpeg',
                    '.wav': 'audio/wav',
                    '.ogg': 'audio/ogg',
                    '.m4a': 'audio/mp4',
                    '.aac': 'audio/aac',
                    '.mp4': 'video/mp4',
                    '.avi': 'video/x-msvideo',
                    '.mov': 'video/quicktime',
                    '.wmv': 'video/x-ms-wmv',
                    '.flv': 'video/x-flv',
                    '.webm': 'video/webm'
                }[ext] || 'application/octet-stream';
                
                this.serveStaticFile(res, 'public' + pathname, contentType);
            } else {
                // По умолчанию отдаем мобильную версию для мобильных устройств
                const userAgent = req.headers['user-agent'] || '';
                const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(userAgent);
                
                if (isMobile) {
                    this.serveStaticFile(res, 'public/mobile.html', 'text/html');
                } else {
                    this.serveStaticFile(res, 'public/main.html', 'text/html');
                }
            }
        });

        const wsServer = new WebSocketServer(server);

        server.listen(port, () => {
            console.log(`🚀 Сервер запущен на порту ${port}`);
            console.log(`📧 Epic Messenger готов к работе!`);
            console.log(`🛡️  СИСТЕМА БЕЗОПАСНОСТИ АКТИВИРОВАНА:`);
            console.log(`   ✅ Rate limiting включен`);
            console.log(`   ✅ Система сессий активирована`);
            console.log(`   ✅ Проверка прав доступа включена`);
            console.log(`   ✅ Валидация входных данных активна`);
            console.log(`   ✅ Безопасные заголовки установлены`);
            console.log(`   ✅ Логирование безопасности включено`);
            console.log(`💾 Система сохранения данных активирована`);
            console.log(`🔒 Данные пользователей защищены шифрованием`);
            console.log(`📁 Поддержка загрузки файлов включена`);
            console.log(`🎵 Музыкальный модуль активирован`);
            console.log(`🛡️  Система банов по IP и устройствам активирована`);
            console.log(`👥 Система групп активирована`);
            console.log(`\n👑 Особый пользователь:`);
            console.log(`   - BayRex - получает права администратора при регистрации`);
            console.log(`\n📄 Доступные страницы:`);
            console.log(`   - Основное приложение: http://localhost:${port}/`);
            console.log(`   - Страница входа: http://localhost:${port}/login.html`);
            console.log(`   - Музыкальный плеер: http://localhost:${port}/music`);
            console.log(`   - О проекте: http://localhost:${port}/about`);
            console.log(`\n💾 Файл данных: ${this.dataFile}`);
            console.log(`📊 Логи безопасности: /tmp/security.log`);
            console.log(`🎵 Для загрузки музыки используйте endpoint: /api/music/upload-full`);
            console.log(`\n🔧 ВРЕМЕННО ОТКЛЮЧЕННЫЕ ФУНКЦИИ:`);
            console.log(`   ❌ Загрузка аватаров временно отключена`);
            console.log(`   ✅ Изображения для постов: /api/upload-post-image (multipart/form-data)`);
            console.log(`   ✅ Файлы для чатов: /api/upload-file (multipart/form-data)`);
            console.log(`   ✅ Подарки: /api/upload-gift (multipart/form-data)`);
        });

        return server;
    }
}

const server = new SimpleServer();
server.start(process.env.PORT || 3000);
