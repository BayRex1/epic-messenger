const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Базы данных (временные хранилища)
let users = [];
let messages = [];
let posts = [];
let gifts = [];
let promoCodes = [];

// Генерация ID
function generateId() {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// Инициализация начальных данных
function initializeData() {
    // Создаем тестовых пользователей
    if (users.length === 0) {
        users = [
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
                lastSeen: new Date(Date.now() - 30 * 60 * 1000), // 30 минут назад
                createdAt: new Date(),
                gifts: []
            }
        ];
    }

    // Создаем тестовые подарки
    if (gifts.length === 0) {
        gifts = [
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
    }

    // Создаем тестовые промокоды
    if (promoCodes.length === 0) {
        promoCodes = [
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
    }
}

// Middleware для проверки авторизации
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Токен доступа отсутствует' 
        });
    }

    try {
        // В реальном приложении здесь должна быть проверка JWT токена
        // Для демо просто проверяем существование пользователя
        const user = users.find(u => u.id === token);
        if (!user) {
            return res.status(403).json({ 
                success: false, 
                message: 'Неверный токен' 
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({ 
            success: false, 
            message: 'Неверный токен' 
        });
    }
}

// Routes

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

// Страница логина
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Логин
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.status(401).json({
            success: false,
            message: 'Неверное имя пользователя или пароль'
        });
    }

    // В реальном приложении здесь должен быть JWT токен
    // Для демо используем ID пользователя как токен
    res.json({
        success: true,
        token: user.id,
        user: user
    });
});

// Проверка авторизации
app.get('/api/check-auth', authenticateToken, (req, res) => {
    res.json({ 
        authenticated: true,
        user: req.user
    });
});

// Получение текущего пользователя
app.get('/api/current-user', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

// Получение всех пользователей
app.get('/api/users', authenticateToken, (req, res) => {
    // Исключаем текущего пользователя из списка
    const otherUsers = users.filter(user => user.id !== req.user.id);
    res.json({
        success: true,
        users: otherUsers
    });
});

// Получение пользователя по ID
app.get('/api/users/:id', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.params.id);
    if (!user) {
        return res.status(404).json({
            success: false,
            message: 'Пользователь не найден'
        });
    }

    res.json({
        success: true,
        user: user
    });
});

// Получение сообщений
app.get('/api/messages', authenticateToken, (req, res) => {
    const { userId, toUserId } = req.query;
    
    const chatMessages = messages.filter(msg => 
        (msg.senderId === userId && msg.toUserId === toUserId) ||
        (msg.senderId === toUserId && msg.toUserId === userId)
    );

    res.json({
        success: true,
        messages: chatMessages
    });
});

// Отправка сообщения
app.post('/api/messages/send', authenticateToken, (req, res) => {
    const { userId, toUserId, text, type } = req.body;

    const message = {
        id: generateId(),
        senderId: userId,
        toUserId: toUserId,
        text: text,
        type: type || 'text',
        timestamp: new Date(),
        displayName: req.user.displayName
    };

    messages.push(message);

    // Отправляем сообщение через Socket.IO
    io.emit('new_message', message);

    res.json({
        success: true,
        message: message
    });
});

// Получение постов
app.get('/api/posts', authenticateToken, (req, res) => {
    const postsWithUserInfo = posts.map(post => {
        const user = users.find(u => u.id === post.userId);
        return {
            ...post,
            userName: user ? user.displayName : 'Неизвестный',
            userAvatar: user ? user.avatar : null,
            userVerified: user ? user.verified : false,
            userDeveloper: user ? user.isDeveloper : false
        };
    });

    res.json({
        success: true,
        posts: postsWithUserInfo
    });
});

// Создание поста
app.post('/api/posts', authenticateToken, (req, res) => {
    const { text, image } = req.body;

    const post = {
        id: generateId(),
        userId: req.user.id,
        text: text,
        image: image,
        likes: [],
        comments: [],
        views: 0,
        createdAt: new Date()
    };

    posts.push(post);

    res.json({
        success: true,
        post: post
    });
});

// Лайк поста
app.post('/api/posts/:id/like', authenticateToken, (req, res) => {
    const postId = req.params.id;
    const post = posts.find(p => p.id === postId);

    if (!post) {
        return res.status(404).json({
            success: false,
            message: 'Пост не найден'
        });
    }

    const likeIndex = post.likes.indexOf(req.user.id);
    if (likeIndex === -1) {
        post.likes.push(req.user.id);
    } else {
        post.likes.splice(likeIndex, 1);
    }

    res.json({
        success: true,
        likes: post.likes
    });
});

// Получение подарков
app.get('/api/gifts', authenticateToken, (req, res) => {
    res.json({
        success: true,
        gifts: gifts
    });
});

// Покупка подарка
app.post('/api/gifts/:id/buy', authenticateToken, (req, res) => {
    const giftId = req.params.id;
    const { toUserId } = req.body;
    const gift = gifts.find(g => g.id === giftId);

    if (!gift) {
        return res.status(404).json({
            success: false,
            message: 'Подарок не найден'
        });
    }

    if (req.user.coins < gift.price) {
        return res.status(400).json({
            success: false,
            message: 'Недостаточно E-COIN'
        });
    }

    // Списываем деньги
    req.user.coins -= gift.price;

    // Добавляем подарок пользователю
    if (!req.user.gifts) {
        req.user.gifts = [];
    }

    const userGift = {
        id: generateId(),
        giftId: gift.id,
        giftName: gift.name,
        giftType: gift.type,
        purchasedAt: new Date(),
        fromUserId: req.user.id
    };

    req.user.gifts.push(userGift);

    // Если подарок отправлен другому пользователю
    if (toUserId) {
        const toUser = users.find(u => u.id === toUserId);
        if (toUser) {
            if (!toUser.gifts) {
                toUser.gifts = [];
            }
            toUser.gifts.push({
                ...userGift,
                fromUserId: req.user.id
            });

            // Создаем сообщение о подарке
            const giftMessage = {
                id: generateId(),
                senderId: req.user.id,
                toUserId: toUserId,
                type: 'gift',
                giftName: gift.name,
                giftType: gift.type,
                giftPrice: gift.price,
                timestamp: new Date(),
                displayName: req.user.displayName
            };

            messages.push(giftMessage);
            io.emit('new_message', giftMessage);
        }
    }

    res.json({
        success: true,
        giftName: gift.name,
        newBalance: req.user.coins
    });
});

// Получение промокодов
app.get('/api/promo-codes', authenticateToken, (req, res) => {
    res.json({
        success: true,
        promoCodes: promoCodes
    });
});

// Активация промокода
app.post('/api/promo-codes/activate', authenticateToken, (req, res) => {
    const { code } = req.body;
    const promoCode = promoCodes.find(p => p.code === code);

    if (!promoCode) {
        return res.status(404).json({
            success: false,
            message: 'Промокод не найден'
        });
    }

    if (promoCode.max_uses > 0 && promoCode.used_count >= promoCode.max_uses) {
        return res.status(400).json({
            success: false,
            message: 'Промокод уже использован максимальное количество раз'
        });
    }

    // Начисляем монеты
    req.user.coins += promoCode.coins;
    promoCode.used_count++;

    res.json({
        success: true,
        message: `Промокод активирован! Начислено ${promoCode.coins} E-COIN`,
        coins: promoCode.coins
    });
});

// Обновление профиля
app.post('/api/update-profile', authenticateToken, (req, res) => {
    const { displayName, description, avatar } = req.body;

    if (displayName) {
        req.user.displayName = displayName;
    }

    if (description !== undefined) {
        req.user.description = description;
    }

    if (avatar) {
        req.user.avatar = avatar;
    }

    res.json({
        success: true,
        user: req.user
    });
});

// Админ статистика
app.get('/api/admin/stats', authenticateToken, (req, res) => {
    if (!req.user.isDeveloper) {
        return res.status(403).json({
            success: false,
            message: 'Доступ запрещен'
        });
    }

    res.json({
        success: true,
        stats: {
            totalUsers: users.length,
            totalMessages: messages.length,
            totalPosts: posts.length
        }
    });
});

// История транзакций
app.get('/api/user/:id/transactions', authenticateToken, (req, res) => {
    // Временные данные для демо
    const transactions = [
        {
            description: 'Регистрация бонус',
            date: req.user.createdAt,
            amount: 1000
        },
        {
            description: 'Покупка подарка "Золотая корона"',
            date: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 день назад
            amount: -500
        },
        {
            description: 'Активация промокода WELCOME1000',
            date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 дня назад
            amount: 1000
        }
    ];

    res.json({
        success: true,
        transactions: transactions
    });
});

// Выход из системы
app.post('/api/logout', authenticateToken, (req, res) => {
    // В реальном приложении здесь должна быть инвалидация токена
    res.json({
        success: true,
        message: 'Успешный выход из системы'
    });
});

// Socket.IO connection
io.on('connection', (socket) => {
    console.log('🔗 Новое подключение:', socket.id);

    socket.on('user_online', (userId) => {
        const user = users.find(u => u.id === userId);
        if (user) {
            user.status = 'online';
            user.lastSeen = new Date();
            
            io.emit('user_status_changed', {
                userId: userId,
                status: 'online',
                lastSeen: user.lastSeen
            });
        }
    });

    socket.on('user_typing', (data) => {
        socket.broadcast.emit('user_typing', data);
    });

    socket.on('disconnect', () => {
        console.log('🔌 Пользователь отключился:', socket.id);
    });
});

// Инициализация данных при запуске
initializeData();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📧 Доступен по адресу: http://localhost:${PORT}`);
});
