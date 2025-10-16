const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { StringDecoder } = require('string_decoder');
const crypto = require('crypto');
const busboy = require('busboy');

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
        // Используем /tmp для Render, так как он сохраняется между деплоями
        this.dataFile = path.join('/tmp', 'epic-messenger-data.json');
        this.encryptionKey = crypto.randomBytes(32);
        
        // Кэш для эмодзи
        this.emojiCache = null;
        this.emojiCacheTime = null;
        this.emojiCacheDuration = 5 * 60 * 1000; // 5 минут кэша
        
        this.ensureUploadDirs();
        this.loadData();
        this.setupAutoSave();
    }

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
                
                // Восстанавливаем даты
                this.messages.forEach(msg => msg.timestamp = new Date(msg.timestamp));
                this.posts.forEach(post => post.createdAt = new Date(post.createdAt));
                this.users.forEach(user => {
                    user.lastSeen = new Date(user.lastSeen);
                    user.createdAt = new Date(user.createdAt);
                    // Миграция для старых пользователей
                    if (!user.deviceType) user.deviceType = 'desktop';
                    if (!user.preferredVersion) user.preferredVersion = 'desktop';
                });
                this.music.forEach(track => track.createdAt = new Date(track.createdAt));
                this.playlists.forEach(playlist => playlist.createdAt = new Date(playlist.createdAt));
                
                console.log('✅ Данные загружены из файла');
                console.log(`📊 Статистика: ${this.users.length} пользователей, ${this.messages.length} сообщений, ${this.posts.length} постов`);
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
                lastSave: new Date().toISOString()
            };
            
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
            console.log('💾 Данные сохранены');
        } catch (error) {
            console.log('❌ Ошибка сохранения данных:', error);
        }
    }

    setupAutoSave() {
        // Сохраняем каждые 30 секунд
        setInterval(() => {
            this.saveData();
        }, 30000);

        // Сохраняем при graceful shutdown
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

        // Сохраняем при необработанных ошибках
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
            'public/assets/emoji',
            '/tmp' // Убедимся что папка tmp существует
        ];
        
        requiredDirs.forEach(dir => {
            const fullPath = path.join(__dirname, dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
                console.log('✅ Создана папка:', fullPath);
            }
        });
    }

    // Кэшированная загрузка эмодзи
    async loadEmojiList() {
        const now = Date.now();
        
        if (this.emojiCache && this.emojiCacheTime && 
            (now - this.emojiCacheTime) < this.emojiCacheDuration) {
            return this.emojiCache;
        }

        try {
            const emojiPath = path.join(__dirname, 'public', 'assets', 'emoji');
            const files = fs.readdirSync(emojiPath);
            const emojiList = files.filter(file => 
                file.endsWith('.png') || file.endsWith('.svg') || file.endsWith('.gif')
            ).map(file => ({
                name: path.parse(file).name,
                url: `/assets/emoji/${file}`,
                filename: file
            }));

            this.emojiCache = emojiList;
            this.emojiCacheTime = now;
            
            console.log(`📦 Загружено ${emojiList.length} эмодзи в кэш`);
            return emojiList;
        } catch (error) {
            console.log('❌ Эмодзи не загружены:', error.message);
            return [];
        }
    }

    // Обработка текста с эмодзи
    processTextWithEmoji(text, emojiList) {
        if (!text || typeof text !== 'string') return text;

        let processedText = text;
        
        // Заменяем кастомные эмодзи коды на HTML
        emojiList.forEach(emoji => {
            const emojiCode = `:${emoji.name}:`;
            const emojiHtml = `<img src="${emoji.url}" alt="${emoji.name}" class="emoji" style="width: 20px; height: 20px; vertical-align: middle; display: inline-block;">`;
            processedText = processedText.replace(new RegExp(this.escapeRegExp(emojiCode), 'g'), emojiHtml);
        });

        return processedText;
    }

    // Вспомогательная функция для экранирования спецсимволов в регулярных выражениях
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        
        // Определение браузера
        let browser = 'Unknown';
        if (userAgent.includes('Chrome')) browser = 'Chrome';
        else if (userAgent.includes('Firefox')) browser = 'Firefox';
        else if (userAgent.includes('Safari')) browser = 'Safari';
        else if (userAgent.includes('Edge')) browser = 'Edge';
        
        // Определение ОС
        let os = 'Unknown';
        if (userAgent.includes('Windows')) os = 'Windows';
        else if (userAgent.includes('Mac')) os = 'Mac OS';
        else if (userAgent.includes('Linux')) os = 'Linux';
        else if (userAgent.includes('Android')) os = 'Android';
        else if (userAgent.includes('iOS')) os = 'iOS';
        
        // Определение типа устройства
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
        const deviceType = isMobile ? 'mobile' : 'desktop';
        
        return {
            browser,
            os,
            deviceType,
            userAgent,
            isMobile
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
        this.saveData(); // Сохраняем при изменении банов
    }

    validateAvatarFile(filename) {
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    validateGiftFile(filename) {
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    validatePostFile(filename) {
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
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
                likes: [],
                comments: [],
                views: 0,
                createdAt: new Date()
            }
        ];

        this.music = [];
        this.playlists = [];

        this.messages = [];
        this.bannedIPs = new Map();
        this.devices = new Map();
    }

    generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    authenticateToken(token) {
        return this.users.find(u => u.id === token);
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
        this.saveData(); // Сохраняем при добавлении устройства
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
            this.saveData(); // Сохраняем при удалении устройства
            return true;
        } else {
            const timeDiff = Date.now() - new Date(targetDevice.createdAt).getTime();
            if (timeDiff > 24 * 60 * 60 * 1000) {
                this.devices.delete(deviceId);
                this.saveData(); // Сохраняем при удалении устройства
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
        
        // Для multipart/form-data обрабатываем отдельно
        if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
            if (pathname === '/api/music/upload-full') {
                this.handleUploadMusicFull(req, res);
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
            
            // Для multipart/form-data не логируем тело, так как оно бинарное
            if (req.headers['content-type'] && !req.headers['content-type'].includes('multipart/form-data')) {
                console.log(`Raw body:`, body);
                console.log(`Body length: ${body.length}`);
            }
            
            let data = {};
            if (body && body.trim() !== '' && req.headers['content-type'] && !req.headers['content-type'].includes('multipart/form-data')) {
                try {
                    data = JSON.parse(body);
                    console.log(`Parsed data:`, data);
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
        console.log(`📦 Request data:`, data);
        console.log(`❓ Query params:`, query);
        
        const headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Content-Length, Accept, Origin',
            'Access-Control-Allow-Credentials': 'true'
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

                case '/api/change-version':
                    if (method === 'POST') {
                        response = this.handleChangeVersion(token, data);
                    }
                    break;

                case '/api/ping':
                    if (method === 'GET') {
                        response = { success: true, ping: Date.now(), timestamp: new Date().toISOString() };
                    }
                    break;

                // API для музыки
                case '/api/music/upload-full':
                    // Обрабатывается в handleApiRequest для multipart/form-data
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

    // Улучшенный метод для получения сообщений с поддержкой эмодзи
    async handleGetMessages(token, query) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId, toUserId } = query;
        
        if (!userId || !toUserId) {
            return { success: false, message: 'Не указаны ID пользователей' };
        }

        // Проверяем права доступа к чату
        if (user.id !== userId && user.id !== toUserId && !user.isDeveloper) {
            return { success: false, message: 'Доступ к этому чату запрещен' };
        }

        const chatMessages = this.messages.filter(msg => 
            (msg.senderId === userId && msg.toUserId === toUserId) ||
            (msg.senderId === toUserId && msg.toUserId === userId)
        );

        // Расшифровываем сообщения
        const decryptedMessages = chatMessages.map(msg => ({
            ...msg,
            text: msg.encrypted ? this.decrypt(msg.text) : msg.text,
            isCurrentUser: msg.senderId === user.id
        }));

        // Сортируем по времени
        decryptedMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Загружаем эмодзи из кэша
        const emojiList = await this.loadEmojiList();

        // Обрабатываем эмодзи в сообщениях
        const processedMessages = decryptedMessages.map(msg => {
            if (msg.type === 'text' && msg.text) {
                const processedText = this.processTextWithEmoji(msg.text, emojiList);
                
                return {
                    ...msg,
                    text: processedText,
                    containsEmoji: processedText !== msg.text,
                    originalText: msg.text // Сохраняем оригинальный текст для редактирования
                };
            }
            return msg;
        });

        // Получаем информацию о собеседнике
        const otherUserId = user.id === userId ? toUserId : userId;
        const otherUser = this.users.find(u => u.id === otherUserId);

        return {
            success: true,
            messages: processedMessages,
            chatInfo: {
                otherUser: otherUser ? {
                    id: otherUser.id,
                    displayName: otherUser.displayName,
                    avatar: otherUser.avatar,
                    verified: otherUser.verified,
                    status: otherUser.status,
                    isDeveloper: otherUser.isDeveloper
                } : null,
                totalMessages: processedMessages.length,
                emojiSupported: emojiList.length > 0
            }
        };
    }

    // Обновленный метод для получения эмодзи
    async handleGetEmoji(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const emojiList = await this.loadEmojiList();

        return {
            success: true,
            emoji: emojiList
        };
    }

    // Новый метод для смены версии
    handleChangeVersion(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { version } = data;
        if (version !== 'desktop' && version !== 'mobile') {
            return { success: false, message: 'Неверная версия' };
        }

        user.preferredVersion = version;
        this.saveData();

        return {
            success: true,
            message: `Версия изменена на ${version === 'mobile' ? 'мобильную' : 'компьютерную'}`,
            version: version
        };
    }

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
                            this.saveData(); // Сохраняем данные

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

    // Методы для музыки
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
        this.saveData(); // Сохраняем данные

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

        const { fileData, filename } = data;
        
        if (!this.validateMusicFile(filename)) {
            return { success: false, message: 'Недопустимый формат аудио файла' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `music_${user.id}_${Date.now()}${fileExt}`;
            
            const fileUrl = await this.saveFile(fileData, uniqueFilename, 'music');

            return {
                success: true,
                fileUrl: fileUrl
            };
        } catch (error) {
            console.error('Ошибка загрузки аудио файла:', error);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    async handleUploadMusicCover(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { fileData, filename } = data;
        
        if (!this.validateCoverFile(filename)) {
            return { success: false, message: 'Недопустимый формат изображения' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `cover_${user.id}_${Date.now()}${fileExt}`;
            
            const fileUrl = await this.saveFile(fileData, uniqueFilename, 'music/covers');

            return {
                success: true,
                coverUrl: fileUrl
            };
        } catch (error) {
            console.error('Ошибка загрузки обложки:', error);
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
        
        if (track.userId !== user.id && !user.isDeveloper) {
            return { success: false, message: 'Вы можете удалять только свои треки' };
        }

        if (track.fileUrl && track.fileUrl.startsWith('/uploads/music/')) {
            this.deleteFile(track.fileUrl);
        }

        if (track.coverUrl && track.coverUrl.startsWith('/uploads/music/covers/')) {
            this.deleteFile(track.coverUrl);
        }

        this.music.splice(trackIndex, 1);
        this.saveData(); // Сохраняем данные

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
        this.saveData(); // Сохраняем данные

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

        this.saveData(); // Сохраняем данные

        console.log(`🎵 Трек добавлен в плейлист: ${playlist.name}`);

        return {
            success: true,
            playlist: playlist
        };
    }

    // Остальные методы
    handleLogin(data, req) {
        const { username, password } = data;
        const hashedPassword = this.hashPassword(password);
        const user = this.users.find(u => u.username === username && u.password === hashedPassword);
        
        if (!user) {
            return { success: false, message: 'Неверное имя пользователя или пароль' };
        }

        if (user.banned) {
            return { success: false, message: 'Аккаунт заблокирован' };
        }

        const clientIP = this.getClientIP(req);
        if (this.isIPBanned(clientIP)) {
            return { success: false, message: 'Ваш IP адрес заблокирован' };
        }

        const device = this.registerDevice(user.id, req);

        user.status = 'online';
        user.lastSeen = new Date();
        this.saveData(); // Сохраняем данные

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
                banned: user.banned || false,
                deviceType: user.deviceType || 'desktop',
                preferredVersion: user.preferredVersion || 'desktop'
            }
        };
    }

    handleRegister(data, req) {
        const { username, displayName, email, password } = data;

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
        
        // Определяем устройство пользователя
        const deviceInfo = this.getDeviceInfo(req);
        
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
            status: 'online',
            lastSeen: new Date(),
            createdAt: new Date(),
            gifts: [],
            isProtected: isBayRex,
            friendsCount: 0,
            postsCount: 0,
            giftsCount: 0,
            banned: false,
            deviceType: deviceInfo.deviceType,
            preferredVersion: deviceInfo.isMobile ? 'mobile' : 'desktop',
            registrationDevice: {
                browser: deviceInfo.browser,
                os: deviceInfo.os,
                userAgent: deviceInfo.userAgent
            }
        };

        this.users.push(newUser);

        const device = this.registerDevice(newUser.id, req);
        this.saveData(); // Сохраняем данные

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
                banned: newUser.banned,
                deviceType: newUser.deviceType,
                preferredVersion: newUser.preferredVersion
            }
        };
    }

    handleCheckAuth(token, req) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { authenticated: false };
        }

        if (user.banned) {
            return { authenticated: false, message: 'Аккаунт заблокирован' };
        }

        const clientIP = this.getClientIP(req);
        if (this.isIPBanned(clientIP)) {
            return { authenticated: false, message: 'IP адрес заблокирован' };
        }

        const deviceId = this.generateDeviceId(req);
        const device = this.devices.get(deviceId);
        if (device && device.userId === user.id) {
            device.lastActive = new Date();
            this.saveData(); // Сохраняем данные
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
                banned: user.banned || false,
                deviceType: user.deviceType || 'desktop',
                preferredVersion: user.preferredVersion || 'desktop'
            }
        };
    }

    handleCurrentUser(token, req) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            return { success: false, message: 'Аккаунт заблокирован' };
        }

        const clientIP = this.getClientIP(req);
        if (this.isIPBanned(clientIP)) {
            return { success: false, message: 'IP адрес заблокирован' };
        }

        const deviceId = this.generateDeviceId(req);
        const device = this.devices.get(deviceId);
        if (device && device.userId === user.id) {
            device.lastActive = new Date();
            this.saveData(); // Сохраняем данные
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
                banned: user.banned || false,
                deviceType: user.deviceType || 'desktop',
                preferredVersion: user.preferredVersion || 'desktop'
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
            banned: u.banned || false,
            deviceType: u.deviceType || 'desktop'
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
                banned: targetUser.banned || false,
                deviceType: targetUser.deviceType || 'desktop'
            }
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

        const sanitizedText = this.sanitizeContent(text.trim());

        if (sanitizedText.length === 0) {
            return { success: false, message: 'Сообщение содержит запрещенный контент' };
        }

        // Проверяем поддержку эмодзи в тексте
        const containsCustomEmoji = /:\w+:/g.test(sanitizedText);

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
            displayName: user.displayName,
            containsCustomEmoji: containsCustomEmoji
        };

        this.messages.push(message);
        this.saveData(); // Сохраняем данные

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
        this.saveData(); // Сохраняем данные

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
        
        if (post.userId === 'system') {
            return { success: false, message: 'Нельзя удалить системный пост' };
        }

        if (post.image && post.image.startsWith('/uploads/posts/')) {
            this.deleteFile(post.image);
        }

        this.posts.splice(postIndex, 1);

        const postUser = this.users.find(u => u.id === post.userId);
        if (postUser && postUser.postsCount > 0) {
            postUser.postsCount--;
        }

        this.saveData(); // Сохраняем данные

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

        this.saveData(); // Сохраняем данные

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
        this.saveData(); // Сохраняем данные

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
            displayName: user.displayName
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

        this.saveData(); // Сохраняем данные

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
        this.saveData(); // Сохраняем данные

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
        this.saveData(); // Сохраняем данные

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

        this.saveData(); // Сохраняем данные

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
                banned: user.banned || false,
                deviceType: user.deviceType || 'desktop',
                preferredVersion: user.preferredVersion || 'desktop'
            }
        };
    }

    handleUpdateAvatar(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { avatar } = data;

        if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
            this.deleteFile(user.avatar);
        }

        user.avatar = avatar;
        this.saveData(); // Сохраняем данные

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
                banned: user.banned || false,
                deviceType: user.deviceType || 'desktop',
                preferredVersion: user.preferredVersion || 'desktop'
            }
        };
    }

    async handleUploadAvatar(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { fileData, filename } = data;

        if (!this.validateAvatarFile(filename)) {
            return { success: false, message: 'Недопустимый формат файла для аватара. Разрешены только изображения.' };
        }

        if (fileData.length > 5 * 1024 * 1024) {
            return { success: false, message: 'Размер файла не должен превышать 5 МБ' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `avatar_${user.id}_${Date.now()}${fileExt}`;
            
            const fileUrl = await this.saveFile(fileData, uniqueFilename, 'avatar');

            if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
                this.deleteFile(user.avatar);
            }

            user.avatar = fileUrl;
            this.saveData(); // Сохраняем данные

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
                    banned: user.banned || false,
                    deviceType: user.deviceType || 'desktop',
                    preferredVersion: user.preferredVersion || 'desktop'
                }
            };
        } catch (error) {
            console.error('Ошибка загрузки аватара:', error);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    async handleUploadGift(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { fileData, filename } = data;

        if (!this.validateGiftFile(filename)) {
            return { success: false, message: 'Недопустимый формат файла для подарка. Разрешены изображения, GIF и SVG.' };
        }

        if (fileData.length > 10 * 1024 * 1024) {
            return { success: false, message: 'Размер файла не должен превышать 10 МБ' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `gift_${Date.now()}${fileExt}`;
            
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

    async handleUploadPostImage(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { fileData, filename } = data;

        if (!this.validatePostFile(filename)) {
            return { success: false, message: 'Недопустимый формат файла для поста. Разрешены только изображения.' };
        }

        if (fileData.length > 10 * 1024 * 1024) {
            return { success: false, message: 'Размер файла не должен превышать 10 МБ' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `post_${user.id}_${Date.now()}${fileExt}`;
            
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

    handleAdminStats(token) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        // Симуляция FPS и пинга
        const fps = Math.floor(Math.random() * 60) + 30; // 30-90 FPS
        const ping = Math.floor(Math.random() * 100) + 10; // 10-110ms

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
                onlineUsers: this.users.filter(u => u.status === 'online').length,
                bannedUsers: this.users.filter(u => u.banned).length,
                bannedIPs: this.bannedIPs.size,
                activeDevices: this.devices.size,
                fps: fps,
                ping: ping,
                serverUptime: process.uptime(),
                memoryUsage: Math.round(process.memoryUsage().rss / 1024 / 1024) // в MB
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

        if (targetUser.avatar && targetUser.avatar.startsWith('/uploads/avatars/')) {
            this.deleteFile(targetUser.avatar);
        }

        Array.from(this.devices.entries()).forEach(([deviceId, device]) => {
            if (device.userId === userId) {
                this.devices.delete(deviceId);
            }
        });

        this.users = this.users.filter(u => u.id !== userId);
        this.saveData(); // Сохраняем данные

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

        if (banned) {
            const userDevices = this.getUserDevices(userId);
            if (userDevices.length > 0) {
                const lastDevice = userDevices[userDevices.length - 1];
                this.banIP(lastDevice.ip);
            }
        }

        this.saveData(); // Сохраняем данные

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
        this.saveData(); // Сохраняем данные

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
        this.saveData(); // Сохраняем данные

        console.log(`👑 Пользователь ${user.displayName} ${targetUser.isDeveloper ? 'дал права разработчика' : 'забрал права разработчика'} у: ${targetUser.username}`);

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
            } else if (pathname === '/about.html' || pathname === '/about') {
                this.serveStaticFile(res, 'public/about.html', 'text/html');
            } else if (pathname === '/music.html' || pathname === '/music') {
                this.serveStaticFile(res, 'public/music.html', 'text/html');
            } else if (pathname === '/mobile.html' || pathname === '/mobile') {
                this.serveStaticFile(res, 'public/mobile.html', 'text/html');
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
                    '.aac': 'audio/aac'
                }[ext] || 'application/octet-stream';
                
                this.serveStaticFile(res, 'public' + pathname, contentType);
            } else {
                this.serveStaticFile(res, 'public/main.html', 'text/html');
            }
        });

        const wsServer = new WebSocketServer(server);

        server.listen(port, () => {
            console.log(`🚀 Сервер запущен на порту ${port}`);
            console.log(`📧 Epic Messenger готов к работе!`);
            console.log(`💾 Система сохранения данных активирована`);
            console.log(`🔒 Данные пользователей защищены шифрованием`);
            console.log(`📁 Поддержка загрузки файлов включена`);
            console.log(`🎵 Музыкальный модуль активирован`);
            console.log(`🛡️  Система банов по IP и устройствам активирована`);
            console.log(`📱 Поддержка мобильной версии включена`);
            console.log(`😊 Поддержка кастомных эмодзи включена`);
            console.log(`\n👑 Особый пользователь:`);
            console.log(`   - BayRex - получает права администратора при регистрации`);
            console.log(`\n📄 Доступные страницы:`);
            console.log(`   - Основное приложение: http://localhost:${port}/`);
            console.log(`   - Страница входа: http://localhost:${port}/login.html`);
            console.log(`   - Музыкальный плеер: http://localhost:${port}/music`);
            console.log(`   - О проекте: http://localhost:${port}/about`);
            console.log(`   - Мобильная версия: http://localhost:${port}/mobile`);
            console.log(`\n💾 Файл данных: ${this.dataFile}`);
            console.log(`🎵 Для загрузки музыки используйте endpoint: /api/music/upload-full`);
            console.log(`😊 Для использования эмодзи в сообщениях используйте синтаксис :имя_эмодзи:`);
        });

        return server;
    }
}

const server = new SimpleServer();
server.start(process.env.PORT || 3000);
