const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { StringDecoder } = require('string_decoder');
const crypto = require('crypto');
const busboy = require('busboy');

class SimpleServer {
    constructor() {
        this.dataFile = path.join(__dirname, 'data', 'epic-messenger-data.json');
        this.encryptionKey = crypto.randomBytes(32);
        
        this.ensureDataDir();
        this.loadData();
        this.setupAutoSave();
    }

    ensureDataDir() {
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
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
                
                console.log('✅ Данные загружены');
                console.log(`📊 Пользователей: ${this.users.length}`);
            } else {
                console.log('📁 Файл данных не найден, инициализируем пустые данные');
                this.initializeData();
            }
        } catch (error) {
            console.log('❌ Ошибка загрузки данных:', error);
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
            console.log('🔄 Сохраняем данные...');
            this.saveData();
            process.exit(0);
        });
    }

    initializeData() {
        this.users = [];
        this.messages = [];
        this.posts = [
            {
                id: this.generateId(),
                userId: 'system',
                userName: 'Epic Messenger',
                text: 'Добро пожаловать в Epic Messenger! 🚀\n\nЗдесь вы можете общаться с друзьями, делиться постами и отправлять подарки.',
                image: null,
                likes: [],
                comments: [],
                views: 0,
                createdAt: new Date()
            }
        ];
        
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
            },
            {
                id: '4',
                name: 'Подарок',
                type: 'gift',
                preview: '🎁',
                price: 50,
                image: null
            },
            {
                id: '5',
                name: 'Огонь',
                type: 'fire',
                preview: '🔥',
                price: 150,
                image: null
            },
            {
                id: '6',
                name: 'Кубок',
                type: 'trophy',
                preview: '🏆',
                price: 300,
                image: null
            }
        ];

        this.promoCodes = [
            {
                id: '1',
                code: 'WELCOME100',
                coins: 100,
                max_uses: 0,
                used_count: 0,
                created_at: new Date()
            }
        ];
    }

    generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    authenticateToken(token) {
        return this.users.find(u => u.id === token);
    }

    serveStaticFile(res, filePath, contentType) {
        const fullPath = path.join(__dirname, 'public', filePath);
        
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
        
        console.log(`API: ${method} ${pathname}`);

        let body = '';
        const decoder = new StringDecoder('utf-8');

        req.on('data', (chunk) => {
            body += decoder.write(chunk);
        });

        req.on('end', () => {
            body += decoder.end();
            
            let data = {};
            if (body && body.trim() !== '') {
                try {
                    data = JSON.parse(body);
                } catch (e) {
                    console.log('JSON parse error:', e.message);
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
                case '/api/register':
                    if (method === 'POST') {
                        response = this.handleRegister(data);
                    }
                    break;
                    
                case '/api/login':
                    if (method === 'POST') {
                        response = this.handleLogin(data);
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
                    
                case '/api/gifts/buy':
                    if (method === 'POST') {
                        response = this.handleBuyGift(token, data);
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

                default:
                    if (pathname.startsWith('/api/posts/') && pathname.endsWith('/like')) {
                        const postId = pathname.split('/')[3];
                        if (method === 'POST') {
                            response = this.handleLikePost(token, postId);
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

    handleRegister(data) {
        const { username, password, displayName } = data;

        if (!username || !password || !displayName) {
            return { success: false, message: 'Все поля обязательны для заполнения' };
        }

        if (username.length < 3) {
            return { success: false, message: 'Имя пользователя должно содержать минимум 3 символа' };
        }

        if (password.length < 6) {
            return { success: false, message: 'Пароль должен содержать минимум 6 символов' };
        }

        const existingUser = this.users.find(u => u.username === username);
        if (existingUser) {
            return { success: false, message: 'Пользователь с таким именем уже существует' };
        }

        const isAdmin = username.toLowerCase() === 'admin' || username.toLowerCase() === 'bayrex';
        
        const newUser = {
            id: this.generateId(),
            username: username,
            displayName: displayName,
            password: this.hashPassword(password),
            avatar: null,
            description: 'Новый пользователь Epic Messenger',
            coins: isAdmin ? 10000 : 1000,
            verified: isAdmin,
            isDeveloper: isAdmin,
            status: 'online',
            lastSeen: new Date(),
            createdAt: new Date(),
            gifts: [],
            friendsCount: 0,
            postsCount: 0,
            giftsCount: 0,
            banned: false
        };

        this.users.push(newUser);
        this.saveData();

        if (isAdmin) {
            console.log(`👑 Администратор зарегистрирован: ${username}`);
        }

        return {
            success: true,
            message: 'Аккаунт успешно создан!',
            token: newUser.id,
            user: {
                id: newUser.id,
                username: newUser.username,
                displayName: newUser.displayName,
                avatar: newUser.avatar,
                coins: newUser.coins,
                verified: newUser.verified,
                isDeveloper: newUser.isDeveloper,
                status: newUser.status
            }
        };
    }

    handleLogin(data) {
        const { username, password } = data;
        const hashedPassword = this.hashPassword(password);
        const user = this.users.find(u => u.username === username && u.password === hashedPassword);
        
        if (!user) {
            return { success: false, message: 'Неверное имя пользователя или пароль' };
        }

        if (user.banned) {
            return { success: false, message: 'Аккаунт заблокирован' };
        }

        user.status = 'online';
        user.lastSeen = new Date();
        this.saveData();

        return {
            success: true,
            token: user.id,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                avatar: user.avatar,
                coins: user.coins,
                verified: user.verified,
                isDeveloper: user.isDeveloper,
                status: user.status,
                lastSeen: user.lastSeen,
                createdAt: user.createdAt,
                friendsCount: user.friendsCount || 0,
                postsCount: user.postsCount || 0,
                giftsCount: user.giftsCount || 0
            }
        };
    }

    handleCurrentUser(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        return {
            success: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
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
                giftsCount: user.giftsCount || 0
            }
        };
    }

    handleGetUsers(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const otherUsers = this.users
            .filter(u => u.id !== user.id && !u.banned)
            .map(u => ({
                id: u.id,
                username: u.username,
                displayName: u.displayName,
                avatar: u.avatar,
                status: u.status,
                lastSeen: u.lastSeen,
                verified: u.verified,
                isDeveloper: u.isDeveloper
            }));

        return {
            success: true,
            users: otherUsers
        };
    }

    handleGetMessages(token, query) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId } = query;
        
        if (!userId) {
            return { success: false, message: 'ID пользователя не указан' };
        }

        const otherUser = this.users.find(u => u.id === userId);
        if (!otherUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        // Получаем сообщения между текущим пользователем и выбранным пользователем
        const chatMessages = this.messages.filter(msg => 
            (msg.senderId === user.id && msg.toUserId === userId) ||
            (msg.senderId === userId && msg.toUserId === user.id)
        );

        // Сортируем по времени
        chatMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        return {
            success: true,
            messages: chatMessages,
            user: {
                id: otherUser.id,
                username: otherUser.username,
                displayName: otherUser.displayName,
                avatar: otherUser.avatar,
                status: otherUser.status,
                verified: otherUser.verified,
                isDeveloper: otherUser.isDeveloper
            }
        };
    }

    handleSendMessage(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { toUserId, text } = data;

        if (!text || text.trim() === '') {
            return { success: false, message: 'Сообщение не может быть пустым' };
        }

        const toUser = this.users.find(u => u.id === toUserId);
        if (!toUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        const message = {
            id: this.generateId(),
            senderId: user.id,
            toUserId: toUserId,
            text: text.trim(),
            timestamp: new Date(),
            read: false
        };

        this.messages.push(message);
        this.saveData();

        console.log(`💬 Сообщение от ${user.username} к ${toUser.username}`);

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
            image: null,
            likes: [],
            comments: [],
            views: 0,
            createdAt: new Date()
        };

        this.posts.unshift(post);
        user.postsCount = (user.postsCount || 0) + 1;
        this.saveData();

        console.log(`📝 Новый пост от ${user.username}`);

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

        return {
            success: true,
            gifts: this.gifts
        };
    }

    handleBuyGift(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { giftId, toUserId } = data;
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
            type: 'gift',
            giftId: gift.id,
            giftName: gift.name,
            giftPrice: gift.price,
            giftPreview: gift.preview,
            timestamp: new Date(),
            read: false
        };

        this.messages.push(giftMessage);

        // Добавление подарка получателю
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

        console.log(`🎁 Подарок отправлен: ${user.username} -> ${recipient.username}`);

        return {
            success: true,
            message: `Подарок "${gift.name}" успешно отправлен!`,
            newBalance: user.coins
        };
    }

    handleActivatePromoCode(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { code } = data;
        const promoCode = this.promoCodes.find(p => p.code === code.toUpperCase());

        if (!promoCode) {
            return { success: false, message: 'Промокод не найден' };
        }

        if (promoCode.max_uses > 0 && promoCode.used_count >= promoCode.max_uses) {
            return { success: false, message: 'Промокод уже использован максимальное количество раз' };
        }

        user.coins += promoCode.coins;
        promoCode.used_count++;
        this.saveData();

        console.log(`💰 Промокод активирован: ${user.username} (+${promoCode.coins} coins)`);

        return {
            success: true,
            message: `Промокод активирован! Начислено ${promoCode.coins} E-COIN`,
            coins: promoCode.coins,
            newBalance: user.coins
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

        this.saveData();

        return {
            success: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
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
                giftsCount: user.giftsCount || 0
            }
        };
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

            // Обслуживание статических файлов
            if (pathname === '/' || pathname === '/index.html') {
                this.serveStaticFile(res, 'index.html', 'text/html');
            } else if (pathname === '/login.html') {
                this.serveStaticFile(res, 'login.html', 'text/html');
            } else if (pathname === '/register.html') {
                this.serveStaticFile(res, 'register.html', 'text/html');
            } else if (pathname === '/chat.html') {
                this.serveStaticFile(res, 'chat.html', 'text/html');
            } else if (pathname === '/gift.html') {
                this.serveStaticFile(res, 'gift.html', 'text/html');
            } else if (pathname === '/balance.html') {
                this.serveStaticFile(res, 'balance.html', 'text/html');
            } else if (pathname === '/settings.html') {
                this.serveStaticFile(res, 'settings.html', 'text/html');
            } else if (pathname === '/profile.html') {
                this.serveStaticFile(res, 'profile.html', 'text/html');
            } else if (pathname.endsWith('.css')) {
                this.serveStaticFile(res, pathname.substring(1), 'text/css');
            } else if (pathname.endsWith('.js')) {
                this.serveStaticFile(res, pathname.substring(1), 'application/javascript');
            } else {
                // Для любых других маршрутов возвращаем index.html (для SPA)
                this.serveStaticFile(res, 'index.html', 'text/html');
            }
        });

        server.listen(port, () => {
            console.log(`🚀 Сервер запущен на порту ${port}`);
            console.log(`📧 Epic Messenger готов к работе!`);
            console.log(`💾 Система сохранения данных активирована`);
            console.log(`\n👑 Администраторы:`);
            console.log(`   - admin / bayrex - получают права администратора при регистрации`);
            console.log(`\n📄 Доступные страницы:`);
            console.log(`   - Главная: http://localhost:${port}/`);
            console.log(`   - Вход: http://localhost:${port}/login.html`);
            console.log(`   - Регистрация: http://localhost:${port}/register.html`);
            console.log(`   - Чат: http://localhost:${port}/chat.html`);
            console.log(`   - Подарки: http://localhost:${port}/gift.html`);
            console.log(`   - Баланс: http://localhost:${port}/balance.html`);
            console.log(`   - Настройки: http://localhost:${port}/settings.html`);
            console.log(`   - Профиль: http://localhost:${port}/profile.html`);
            console.log(`\n💾 Файл данных: ${this.dataFile}`);
        });

        return server;
    }
}

const server = new SimpleServer();
server.start(process.env.PORT || 3000);
