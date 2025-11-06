const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { StringDecoder } = require('string_decoder');

// Импортируем модули
const SecurityManager = require('./modules/security');
const AuthManager = require('./modules/auth');
const UsersManager = require('./modules/users');
const MessagesManager = require('./modules/messages');
const PostsManager = require('./modules/posts');
const MusicManager = require('./modules/music');
const FileManager = require('./modules/files');
const AdminManager = require('./modules/admin');
const WebSocketServer = require('./modules/websocket');

class SimpleServer {
    constructor() {
        // Используем /tmp для Render
        this.dataFile = path.join('/tmp', 'epic-messenger-data.json');
        this.encryptionKey = crypto.randomBytes(32);
        
        // Инициализируем модули
        this.security = new SecurityManager(this);
        this.auth = new AuthManager(this);
        this.users = new UsersManager(this);
        this.messages = new MessagesManager(this);
        this.posts = new PostsManager(this);
        this.music = new MusicManager(this);
        this.files = new FileManager(this);
        this.admin = new AdminManager(this);
        
        // Инициализируем данные
        this.files.ensureUploadDirs();
        this.loadData();
        this.setupAutoSave();
        
        console.log('✅ Все модули загружены');
    }

    // 🔄 МЕТОДЫ ДАННЫХ

    loadData() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
                this.usersData = data.users || [];
                this.messagesData = data.messages || [];
                this.postsData = data.posts || [];
                this.giftsData = data.gifts || [];
                this.promoCodesData = data.promoCodes || [];
                this.musicData = data.music || [];
                this.playlistsData = data.playlists || [];
                this.bannedIPsData = new Map(Object.entries(data.bannedIPs || {}));
                this.devicesData = new Map(Object.entries(data.devices || {}));
                this.groupsData = data.groups || [];
                
                // Восстанавливаем даты
                this.messagesData.forEach(msg => msg.timestamp = new Date(msg.timestamp));
                this.postsData.forEach(post => post.createdAt = new Date(post.createdAt));
                this.usersData.forEach(user => {
                    user.lastSeen = new Date(user.lastSeen);
                    user.createdAt = new Date(user.createdAt);
                });
                this.musicData.forEach(track => track.createdAt = new Date(track.createdAt));
                this.playlistsData.forEach(playlist => playlist.createdAt = new Date(playlist.createdAt));
                this.groupsData.forEach(group => group.createdAt = new Date(group.createdAt));
                
                console.log('✅ Данные загружены из файла');
                console.log(`📊 Статистика: ${this.usersData.length} пользователей, ${this.messagesData.length} сообщений, ${this.postsData.length} постов, ${this.groupsData.length} групп`);
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
                users: this.usersData,
                messages: this.messagesData,
                posts: this.postsData,
                gifts: this.giftsData,
                promoCodes: this.promoCodesData,
                music: this.musicData,
                playlists: this.playlistsData,
                bannedIPs: Object.fromEntries(this.bannedIPsData),
                devices: Object.fromEntries(this.devicesData),
                groups: this.groupsData,
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

    initializeData() {
        this.usersData = [];
        this.giftsData = [
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
        this.promoCodesData = [
            {
                id: '1',
                code: 'WELCOME1000',
                coins: 1000,
                max_uses: 0,
                used_count: 0,
                created_at: new Date()
            }
        ];
        this.postsData = [
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
        this.musicData = [];
        this.playlistsData = [];
        this.groupsData = [];
        this.messagesData = [];
        this.bannedIPsData = new Map();
        this.devicesData = new Map();
    }

    // 🔧 ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ

    generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    isIPBanned(ip) {
        const banInfo = this.bannedIPsData.get(ip);
        if (!banInfo) return false;
        
        if (banInfo.expires && banInfo.expires < Date.now()) {
            this.bannedIPsData.delete(ip);
            return false;
        }
        
        return true;
    }

    banIP(ip, duration = 30 * 24 * 60 * 60 * 1000) {
        this.bannedIPsData.set(ip, {
            bannedAt: new Date(),
            expires: Date.now() + duration
        });
        this.saveData();
    }

    // 🔄 ОБРАБОТКА ЗАПРОСОВ

    handleApiRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        const method = req.method;
        
        console.log(`=== API REQUEST ===`);
        console.log(`Method: ${method}`);
        console.log(`Path: ${pathname}`);
        
        // 🔐 Rate limiting проверка
        const clientIP = this.security.getClientIP(req);
        if (!this.security.checkRateLimit(clientIP, pathname)) {
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

        // Для multipart/form-data обрабатываем отдельно
        if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
            const multipartEndpoints = [
                '/api/music/upload-full',
                '/api/upload-avatar',
                '/api/upload-gift',
                '/api/upload-post-image',
                '/api/upload-file'
            ];
            
            if (multipartEndpoints.includes(pathname)) {
                // Здесь можно добавить multipart обработчики
                console.log('📎 Multipart request detected, but handlers not implemented yet');
            }
        }

        let body = '';
        const decoder = new StringDecoder('utf-8');

        req.on('data', (chunk) => {
            body += decoder.write(chunk);
        });

        req.on('end', () => {
            body += decoder.end();
            
            let data = {};
            if (body && body.trim() !== '' && req.headers['content-type'] && !req.headers['content-type'].includes('multipart/form-data')) {
                try {
                    data = JSON.parse(body);
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
        
        const headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Content-Length, Accept, Origin',
            'Access-Control-Allow-Credentials': 'true'
        };

        // 🔐 Устанавливаем безопасные заголовки
        this.security.setSecurityHeaders(res);

        if (method === 'OPTIONS') {
            res.writeHead(204, headers);
            res.end();
            return;
        }

        let response;

        try {
            // 🔄 РОУТИНГ API
            switch (pathname) {
                // Аутентификация
                case '/api/login':
                    if (method === 'POST') response = this.auth.handleLogin(data, req);
                    break;
                case '/api/register':
                    if (method === 'POST') response = this.auth.handleRegister(data, req);
                    break;
                case '/api/check-auth':
                    if (method === 'GET') response = this.auth.handleCheckAuth(query.token, req);
                    break;
                case '/api/current-user':
                    if (method === 'GET') response = this.auth.handleCurrentUser(query.token, req);
                    break;
                
                // Пользователи
                case '/api/users':
                    if (method === 'GET') response = this.users.handleGetUsers(query.token);
                    break;
                case '/api/user-by-username':
                    if (method === 'POST') response = this.users.handleGetUserByUsername(data.token, data);
                    break;
                case '/api/update-profile':
                    if (method === 'POST') response = this.users.handleUpdateProfile(data.token, data);
                    break;
                case '/api/update-avatar':
                    if (method === 'POST') response = this.users.handleUpdateAvatar(data.token, data);
                    break;
                case '/api/upload-avatar':
                    if (method === 'POST') response = this.users.handleUploadAvatar(data.token, data);
                    break;
                case '/api/devices':
                    if (method === 'GET') response = this.users.handleGetDevices(query.token);
                    break;
                case '/api/devices/terminate':
                    if (method === 'POST') response = this.users.handleTerminateDevice(data.token, data);
                    break;
                
                // Сообщения
                case '/api/chats':
                    if (method === 'GET') response = this.messages.handleGetChats(query.token);
                    break;
                case '/api/messages':
                    if (method === 'GET') response = this.messages.handleGetMessages(query.token, query);
                    break;
                case '/api/messages/send':
                    if (method === 'POST') response = this.messages.handleSendMessage(data.token, data);
                    break;
                case '/api/messages/edit':
                    if (method === 'POST') response = this.messages.handleEditMessage(data.token, data);
                    break;
                case '/api/messages/delete':
                    if (method === 'POST') response = this.messages.handleDeleteMessage(data.token, data);
                    break;
                case '/api/messages/mark-read':
                    if (method === 'POST') response = this.messages.handleMarkAsRead(data.token, data);
                    break;
                
                // Посты
                case '/api/posts':
                    if (method === 'GET') response = this.posts.handleGetPosts(query.token);
                    else if (method === 'POST') response = this.posts.handleCreatePost(data.token, data);
                    break;
                case '/api/upload-post-image':
                    if (method === 'POST') response = this.posts.handleUploadPostImage(data.token, data);
                    break;
                
                // Музыка
                case '/api/music':
                    if (method === 'GET') response = this.music.handleGetMusic(query.token);
                    else if (method === 'POST') response = this.music.handleUploadMusic(data.token, data);
                    break;
                case '/api/music/upload':
                    if (method === 'POST') response = this.music.handleUploadMusicFile(data.token, data);
                    break;
                case '/api/music/upload-cover':
                    if (method === 'POST') response = this.music.handleUploadMusicCover(data.token, data);
                    break;
                case '/api/music/delete':
                    if (method === 'POST') response = this.music.handleDeleteMusic(data.token, data);
                    break;
                case '/api/music/search':
                    if (method === 'GET') response = this.music.handleSearchMusic(query.token, query);
                    break;
                case '/api/music/random':
                    if (method === 'GET') response = this.music.handleGetRandomMusic(query.token);
                    break;
                case '/api/playlists':
                    if (method === 'GET') response = this.music.handleGetPlaylists(query.token);
                    else if (method === 'POST') response = this.music.handleCreatePlaylist(data.token, data);
                    break;
                case '/api/playlists/add':
                    if (method === 'POST') response = this.music.handleAddToPlaylist(data.token, data);
                    break;
                
                // Админ
                case '/api/admin/stats':
                    if (method === 'GET') response = this.admin.handleAdminStats(query.token);
                    break;
                case '/api/admin/delete-user':
                    if (method === 'POST') response = this.admin.handleDeleteUser(data.token, data);
                    break;
                case '/api/admin/ban-user':
                    if (method === 'POST') response = this.admin.handleBanUser(data.token, data);
                    break;
                case '/api/admin/toggle-verification':
                    if (method === 'POST') response = this.admin.handleToggleVerification(data.token, data);
                    break;
                case '/api/admin/toggle-developer':
                    if (method === 'POST') response = this.admin.handleToggleDeveloper(data.token, data);
                    break;
                
                // Дополнительные endpoints
                case '/api/gifts':
                    if (method === 'GET') response = this.handleGetGifts(query.token);
                    break;
                case '/api/promo-codes':
                    if (method === 'GET') response = this.handleGetPromoCodes(query.token);
                    break;
                case '/api/my-gifts':
                    if (method === 'GET') response = this.users.handleGetMyGifts(query.token);
                    break;
                case '/api/emoji':
                    if (method === 'GET') response = this.handleGetEmoji(query.token);
                    break;
                case '/api/upload-file':
                    if (method === 'POST') response = this.files.handleUploadFile(data.token, data);
                    break;
                
                // Динамические routes
                default:
                    if (pathname.startsWith('/api/posts/') && pathname.endsWith('/like')) {
                        const postId = pathname.split('/')[3];
                        if (method === 'POST') response = this.posts.handleLikePost(query.token, postId);
                    } else if (pathname.startsWith('/api/users/')) {
                        const userId = pathname.split('/')[3];
                        if (method === 'GET') response = this.users.handleGetUser(query.token, userId);
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

        console.log(`📤 Response:`, response.success ? 'SUCCESS' : 'ERROR');
        
        res.writeHead(response.success ? 200 : 400, headers);
        res.end(JSON.stringify(response));
    }

    // 📁 СТАТИЧЕСКИЕ ФАЙЛЫ

    serveStaticFile(res, filePath, contentType) {
        this.files.serveStaticFile(res, filePath, contentType);
    }

    // 🎁 ВРЕМЕННЫЕ МЕТОДЫ (пока не перенесены в модули)

    handleGetGifts(token) {
        const user = this.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        this.security.logSecurityEvent(user, 'GET_GIFTS', `count:${this.giftsData.length}`);

        return {
            success: true,
            gifts: this.giftsData
        };
    }

    handleGetPromoCodes(token) {
        const user = this.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        this.security.logSecurityEvent(user, 'GET_PROMOCODES', `count:${this.promoCodesData.length}`);

        return {
            success: true,
            promoCodes: this.promoCodesData
        };
    }

    handleGetEmoji(token) {
        const user = this.auth.authenticateToken(token);
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

            this.security.logSecurityEvent(user, 'GET_EMOJI', `count:${emojiList.length}`);

            return {
                success: true,
                emoji: emojiList
            };
        } catch (error) {
            this.security.logSecurityEvent(user, 'GET_EMOJI', 'SYSTEM', false);
            return {
                success: true,
                emoji: []
            };
        }
    }

    // 🚀 ЗАПУСК СЕРВЕРА

    start(port = 3000) {
        const server = http.createServer((req, res) => {
            const parsedUrl = url.parse(req.url, true);
            const pathname = parsedUrl.pathname;

            console.log(`${new Date().toISOString()} - ${req.method} ${pathname}`);

            // 🔐 Устанавливаем безопасные заголовки для всех запросов
            this.security.setSecurityHeaders(res);

            if (pathname.startsWith('/api/')) {
                this.handleApiRequest(req, res);
                return;
            }

            // Обработка статических файлов
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

        // Инициализируем WebSocket сервер
        const wsServer = new WebSocketServer(server);

        server.listen(port, () => {
            console.log(`🚀 Сервер запущен на порту ${port}`);
            console.log(`📧 Epic Messenger готов к работе!`);
            console.log(`🛡️  МОДУЛЬНАЯ АРХИТЕКТУРА АКТИВИРОВАНА:`);
            console.log(`   ✅ Security Manager`);
            console.log(`   ✅ Auth Manager`);
            console.log(`   ✅ Users Manager`);
            console.log(`   ✅ Messages Manager`);
            console.log(`   ✅ Posts Manager`);
            console.log(`   ✅ Music Manager`);
            console.log(`   ✅ File Manager`);
            console.log(`   ✅ Admin Manager`);
            console.log(`   ✅ WebSocket Server`);
            console.log(`\n📄 Доступные страницы:`);
            console.log(`   - Основное приложение: http://localhost:${port}/`);
            console.log(`   - Страница входа: http://localhost:${port}/login.html`);
            console.log(`   - Музыкальный плеер: http://localhost:${port}/music`);
            console.log(`   - О проекте: http://localhost:${port}/about`);
        });

        return server;
    }

    // 🔄 ГЕТТЕРЫ ДЛЯ ДОСТУПА К ДАННЫМ ИЗ МОДУЛЕЙ

    get users() { return this.usersData; }
    set users(value) { this.usersData = value; }
    
    get messages() { return this.messagesData; }
    set messages(value) { this.messagesData = value; }
    
    get posts() { return this.postsData; }
    set posts(value) { this.postsData = value; }
    
    get gifts() { return this.giftsData; }
    set gifts(value) { this.giftsData = value; }
    
    get promoCodes() { return this.promoCodesData; }
    set promoCodes(value) { this.promoCodesData = value; }
    
    get music() { return this.musicData; }
    set music(value) { this.musicData = value; }
    
    get playlists() { return this.playlistsData; }
    set playlists(value) { this.playlistsData = value; }
    
    get groups() { return this.groupsData; }
    set groups(value) { this.groupsData = value; }
    
    get bannedIPs() { return this.bannedIPsData; }
    set bannedIPs(value) { this.bannedIPsData = value; }
    
    get devices() { return this.devicesData; }
    set devices(value) { this.devicesData = value; }
}

// Запуск сервера
const server = new SimpleServer();
server.start(process.env.PORT || 3000);
