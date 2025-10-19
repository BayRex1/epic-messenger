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
        this.dataFile = path.join('/tmp', 'epic-messenger-data.json');
        this.encryptionKey = crypto.randomBytes(32);
        
        this.emojiCache = null;
        this.emojiCacheTime = null;
        this.emojiCacheDuration = 5 * 60 * 1000;
        
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
                
                this.messages.forEach(msg => msg.timestamp = new Date(msg.timestamp));
                this.posts.forEach(post => post.createdAt = new Date(post.createdAt));
                this.users.forEach(user => {
                    user.lastSeen = new Date(user.lastSeen);
                    user.createdAt = new Date(user.createdAt);
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

    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    handleLogin(data, req) {
        const { username, password } = data;
        
        if (!username || !password) {
            return { success: false, message: 'Имя пользователя и пароль обязательны' };
        }

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
        this.saveData();

        // Уведомляем всех о смене статуса
        const wsServer = this.wsServer;
        if (wsServer) {
            wsServer.broadcast('user_status_changed', {
                userId: user.id,
                status: 'online',
                displayName: user.displayName
            });
        }

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
        this.saveData();

        // Уведомляем всех о новом пользователе
        const wsServer = this.wsServer;
        if (wsServer) {
            wsServer.broadcast('user_joined', {
                userId: newUser.id,
                displayName: newUser.displayName,
                avatar: newUser.avatar
            });
        }

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

    // ... остальные методы класса SimpleServer остаются без изменений
    // (getClientIP, getDeviceInfo, generateDeviceId, registerDevice, etc.)

    start(port = 3000) {
        const server = http.createServer((req, res) => {
            const parsedUrl = url.parse(req.url, true);
            const pathname = parsedUrl.pathname;

            console.log(`${new Date().toISOString()} - ${req.method} ${pathname}`);
            console.log(`User-Agent: ${req.headers['user-agent']}`);

            if (pathname.startsWith('/api/')) {
                this.handleApiRequest(req, res);
                return;
            }

            // ОСНОВНАЯ ЛОГИКА ПЕРЕНАПРАВЛЕНИЯ
            if (pathname === '/' || pathname === '/index.html') {
                const deviceInfo = this.getDeviceInfo(req);
                const user = this.isUserAuthenticated(req);
                
                console.log(`📱 Device detection: Mobile=${deviceInfo.isMobile}, Browser=${deviceInfo.browser}, OS=${deviceInfo.os}`);
                console.log(`🔐 User auth: ${user ? 'Authenticated' : 'Not authenticated'}`);

                if (!user) {
                    // НЕАВТОРИЗОВАННЫЙ пользователь - всегда на страницу логина
                    console.log('🚫 User not authenticated, redirecting to login');
                    this.serveStaticFile(res, 'public/login.html', 'text/html');
                } else {
                    // АВТОРИЗОВАННЫЙ пользователь - определяем версию по устройству
                    if (deviceInfo.isMobile) {
                        console.log('📱 Mobile device detected, serving mobile version');
                        this.serveStaticFile(res, 'public/mobile.html', 'text/html');
                    } else {
                        console.log('💻 Desktop device detected, serving desktop version');
                        this.serveStaticFile(res, 'public/main.html', 'text/html');
                    }
                }
            } else if (pathname === '/login.html') {
                this.serveStaticFile(res, 'public/login.html', 'text/html');
            } else if (pathname === '/about.html' || pathname === '/about') {
                this.serveStaticFile(res, 'public/about.html', 'text/html');
            } else if (pathname === '/music.html' || pathname === '/music') {
                this.serveStaticFile(res, 'public/music.html', 'text/html');
            } else if (pathname === '/mobile.html' || pathname === '/mobile') {
                // Прямой доступ к мобильной версии
                this.serveStaticFile(res, 'public/mobile.html', 'text/html');
            } else if (pathname === '/main.html') {
                // Прямой доступ к десктопной версии
                this.serveStaticFile(res, 'public/main.html', 'text/html');
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
                // Для всех остальных маршрутов также проверяем авторизацию и устройство
                const deviceInfo = this.getDeviceInfo(req);
                const user = this.isUserAuthenticated(req);
                
                if (!user) {
                    this.serveStaticFile(res, 'public/login.html', 'text/html');
                } else if (deviceInfo.isMobile) {
                    this.serveStaticFile(res, 'public/mobile.html', 'text/html');
                } else {
                    this.serveStaticFile(res, 'public/main.html', 'text/html');
                }
            }
        });

        const wsServer = new WebSocketServer(server);
        this.wsServer = wsServer;

        server.listen(port, () => {
            console.log(`🚀 Сервер запущен на порту ${port}`);
            console.log(`📧 Epic Messenger готов к работе!`);
            console.log(`💾 Система сохранения данных активирована`);
            console.log(`🔒 Данные пользователей защищены шифрованием`);
            console.log(`📁 Поддержка загрузки файлов включена`);
            console.log(`🎵 Музыкальный модуль активирован`);
            console.log(`🛡️  Система банов по IP и устройствам активирована`);
            console.log(`📱 УЛУЧШЕННОЕ ОПРЕДЕЛЕНИЕ УСТРОЙСТВ ВКЛЮЧЕНО`);
            console.log(`🔐 АВТОМАТИЧЕСКАЯ ПРОВЕРКА АВТОРИЗАЦИИ ВКЛЮЧЕНА`);
            console.log(`😊 Поддержка кастомных эмодзи включена`);
            console.log(`\n👑 Особый пользователь:`);
            console.log(`   - BayRex - получает права администратора при регистрации`);
            console.log(`\n📄 Доступные страницы:`);
            console.log(`   - Основное приложение (автоопределение): http://localhost:${port}/`);
            console.log(`   - Страница входа: http://localhost:${port}/login.html`);
            console.log(`   - Музыкальный плеер: http://localhost:${port}/music`);
            console.log(`   - О проекте: http://localhost:${port}/about`);
            console.log(`   - Мобильная версия: http://localhost:${port}/mobile`);
            console.log(`   - Десктопная версия: http://localhost:${port}/main.html`);
            console.log(`\n💾 Файл данных: ${this.dataFile}`);
            console.log(`🎵 Для загрузки музыки используйте endpoint: /api/music/upload-full`);
            console.log(`😊 Для использования эмодзи в сообщениях используйте синтаксис :имя_файла_эмодзи:`);
            console.log(`\n🔗 Мобильные и десктопные пользователи теперь ВИДЯТ ДРУГ ДРУГА!`);
            console.log(`\n⚠️  ВАЖНО: Неавторизованные пользователи автоматически перенаправляются на страницу логина!`);
        });

        return server;
    }
}

const server = new SimpleServer();
server.start(process.env.PORT || 3000);
