const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const sharp = require('sharp');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const JWT_SECRET = 'your-secret-key-here';
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Хранилище данных
let users = [];
let posts = [];
let chats = [];
let messages = [];
let gifts = [];
let userGifts = [];
let promoCodes = [];

// Загрузка данных при запуске
function loadData() {
    try {
        if (fs.existsSync('data/users.json')) {
            users = JSON.parse(fs.readFileSync('data/users.json', 'utf8'));
        }
        if (fs.existsSync('data/posts.json')) {
            posts = JSON.parse(fs.readFileSync('data/posts.json', 'utf8'));
        }
        if (fs.existsSync('data/chats.json')) {
            chats = JSON.parse(fs.readFileSync('data/chats.json', 'utf8'));
        }
        if (fs.existsSync('data/messages.json')) {
            messages = JSON.parse(fs.readFileSync('data/messages.json', 'utf8'));
        }
        if (fs.existsSync('data/gifts.json')) {
            gifts = JSON.parse(fs.readFileSync('data/gifts.json', 'utf8'));
        }
        if (fs.existsSync('data/userGifts.json')) {
            userGifts = JSON.parse(fs.readFileSync('data/userGifts.json', 'utf8'));
        }
        if (fs.existsSync('data/promoCodes.json')) {
            promoCodes = JSON.parse(fs.readFileSync('data/promoCodes.json', 'utf8'));
        }
    } catch (error) {
        console.log('Создание новых файлов данных...');
        saveData();
    }
}

// Сохранение данных
function saveData() {
    const dataDir = 'data';
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }

    fs.writeFileSync('data/users.json', JSON.stringify(users, null, 2));
    fs.writeFileSync('data/posts.json', JSON.stringify(posts, null, 2));
    fs.writeFileSync('data/chats.json', JSON.stringify(chats, null, 2));
    fs.writeFileSync('data/messages.json', JSON.stringify(messages, null, 2));
    fs.writeFileSync('data/gifts.json', JSON.stringify(gifts, null, 2));
    fs.writeFileSync('data/userGifts.json', JSON.stringify(userGifts, null, 2));
    fs.writeFileSync('data/promoCodes.json', JSON.stringify(promoCodes, null, 2));
}

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadsDir = 'uploads';
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir);
        }
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// Middleware для проверки JWT токена
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Токен доступа отсутствует' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Недействительный токен' });
        }
        req.user = user;
        next();
    });
}

// Генерация JWT токена
function generateToken(user) {
    return jwt.sign(
        { 
            userId: user.id, 
            username: user.username,
            isAdmin: user.isAdmin || false
        }, 
        JWT_SECRET, 
        { expiresIn: '24h' }
    );
}

// API Routes

// Регистрация
app.post('/api/register', async (req, res) => {
    try {
        const { username, displayName, email, password } = req.body;

        // Проверка обязательных полей
        if (!username || !displayName || !email || !password) {
            return res.status(400).json({ success: false, message: 'Все поля обязательны для заполнения' });
        }

        // Проверка уникальности username и email
        if (users.find(u => u.username === username)) {
            return res.status(400).json({ success: false, message: 'Пользователь с таким именем уже существует' });
        }

        if (users.find(u => u.email === email)) {
            return res.status(400).json({ success: false, message: 'Пользователь с таким email уже существует' });
        }

        // Хеширование пароля
        const hashedPassword = await bcrypt.hash(password, 10);

        // Создание пользователя
        const newUser = {
            id: Date.now().toString(),
            username,
            displayName,
            email,
            password: hashedPassword,
            eCoins: 1000, // Начальный баланс
            isVerified: username === '@BayRex',
            isDeveloper: username === '@BayRex',
            isAdmin: username === '@BayRex',
            avatar: null,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        saveData();

        // Генерация токена
        const token = generateToken(newUser);

        res.json({
            success: true,
            message: 'Регистрация успешна',
            token,
            deviceId: Date.now().toString(),
            user: {
                id: newUser.id,
                username: newUser.username,
                displayName: newUser.displayName,
                email: newUser.email,
                eCoins: newUser.eCoins,
                isVerified: newUser.isVerified,
                isDeveloper: newUser.isDeveloper,
                isAdmin: newUser.isAdmin,
                avatar: newUser.avatar
            }
        });

    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
    }
});

// Вход
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Все поля обязательны для заполнения' });
        }

        // Поиск пользователя
        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(400).json({ success: false, message: 'Неверное имя пользователя или пароль' });
        }

        // Проверка пароля
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ success: false, message: 'Неверное имя пользователя или пароль' });
        }

        // Генерация токена
        const token = generateToken(user);

        res.json({
            success: true,
            message: 'Вход успешен',
            token,
            deviceId: Date.now().toString(),
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                eCoins: user.eCoins,
                isVerified: user.isVerified,
                isDeveloper: user.isDeveloper,
                isAdmin: user.isAdmin,
                avatar: user.avatar
            }
        });

    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ success: false, message: 'Внутренняя ошибка сервера' });
    }
});

// Получение постов
app.get('/api/posts', (req, res) => {
    try {
        const postsWithUsers = posts.map(post => {
            const user = users.find(u => u.id === post.userId);
            return {
                ...post,
                user: {
                    displayName: user?.displayName || 'Неизвестный',
                    username: user?.username || 'unknown',
                    isVerified: user?.isVerified || false,
                    isDeveloper: user?.isDeveloper || false,
                    avatar: user?.avatar || null
                }
            };
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({ success: true, posts: postsWithUsers });
    } catch (error) {
        console.error('Ошибка получения постов:', error);
        res.status(500).json({ success: false, message: 'Ошибка загрузки постов' });
    }
});

// Создание поста
app.post('/api/posts/create', authenticateToken, upload.single('media'), (req, res) => {
    try {
        const { text } = req.body;
        const userId = req.user.userId;

        if (!text && !req.file) {
            return res.status(400).json({ success: false, message: 'Пост должен содержать текст или медиа' });
        }

        let media = null;
        if (req.file) {
            const fileType = req.file.mimetype.split('/')[0];
            media = {
                type: fileType,
                url: `/uploads/${req.file.filename}`,
                filename: req.file.filename
            };
        }

        const newPost = {
            id: Date.now().toString(),
            userId,
            text: text || '',
            media,
            likes: 0,
            likedBy: [],
            views: 0,
            createdAt: new Date().toISOString()
        };

        posts.push(newPost);
        saveData();

        // Отправка поста через WebSocket
        const user = users.find(u => u.id === userId);
        const postWithUser = {
            ...newPost,
            user: {
                displayName: user.displayName,
                username: user.username,
                isVerified: user.isVerified,
                isDeveloper: user.isDeveloper,
                avatar: user.avatar
            }
        };

        io.emit('newPost', postWithUser);

        res.json({ success: true, message: 'Пост опубликован', post: newPost });
    } catch (error) {
        console.error('Ошибка создания поста:', error);
        res.status(500).json({ success: false, message: 'Ошибка публикации поста' });
    }
});

// Лайк поста
app.post('/api/posts/:postId/like', authenticateToken, (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user.userId;

        const post = posts.find(p => p.id === postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Пост не найден' });
        }

        const likeIndex = post.likedBy.indexOf(userId);
        if (likeIndex > -1) {
            // Удалить лайк
            post.likedBy.splice(likeIndex, 1);
            post.likes--;
        } else {
            // Добавить лайк
            post.likedBy.push(userId);
            post.likes++;
        }

        saveData();

        res.json({ success: true, likes: post.likes, liked: likeIndex === -1 });
    } catch (error) {
        console.error('Ошибка лайка поста:', error);
        res.status(500).json({ success: false, message: 'Ошибка лайка поста' });
    }
});

// Получение чатов пользователя
app.get('/api/chats', authenticateToken, (req, res) => {
    try {
        const userId = req.user.userId;

        const userChats = chats.filter(chat => 
            chat.participants.includes(userId)
        ).map(chat => {
            const otherParticipantId = chat.participants.find(id => id !== userId);
            const otherUser = users.find(u => u.id === otherParticipantId);
            
            const lastMessage = messages
                .filter(m => m.chatId === chat.id)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

            return {
                id: chat.id,
                otherUser: {
                    id: otherUser?.id,
                    displayName: otherUser?.displayName || 'Неизвестный',
                    username: otherUser?.username || 'unknown',
                    isVerified: otherUser?.isVerified || false,
                    isDeveloper: otherUser?.isDeveloper || false,
                    avatar: otherUser?.avatar || null
                },
                lastMessage: lastMessage ? {
                    text: lastMessage.text,
                    type: lastMessage.type,
                    createdAt: lastMessage.createdAt
                } : null,
                unreadCount: chat.unreadCount || 0
            };
        });

        res.json({ success: true, chats: userChats });
    } catch (error) {
        console.error('Ошибка получения чатов:', error);
        res.status(500).json({ success: false, message: 'Ошибка загрузки чатов' });
    }
});

// Отправка сообщения
app.post('/api/messages/send', authenticateToken, upload.single('file'), (req, res) => {
    try {
        const { text } = req.body;
        const userId = req.user.userId;
        const file = req.file;

        if (!text && !file) {
            return res.status(400).json({ success: false, message: 'Сообщение не может быть пустым' });
        }

        // Определение типа сообщения
        let messageType = 'text';
        let media = null;

        if (file) {
            const fileType = file.mimetype.split('/')[0];
            messageType = fileType;
            media = {
                type: fileType,
                url: `/uploads/${file.filename}`,
                filename: file.filename
            };
        }

        // Создание или поиск чата
        let chat = chats.find(c => c.participants.includes(userId));
        if (!chat) {
            chat = {
                id: Date.now().toString(),
                participants: [userId],
                createdAt: new Date().toISOString()
            };
            chats.push(chat);
        }

        const newMessage = {
            id: Date.now().toString(),
            chatId: chat.id,
            senderId: userId,
            text: text || '',
            type: messageType,
            media,
            createdAt: new Date().toISOString()
        };

        messages.push(newMessage);
        saveData();

        // Отправка через WebSocket
        io.emit('newMessage', {
            ...newMessage,
            sender: {
                id: userId,
                displayName: req.user.displayName,
                username: req.user.username,
                isVerified: req.user.isVerified,
                isDeveloper: req.user.isDeveloper
            }
        });

        res.json({ success: true, message: 'Сообщение отправлено', message: newMessage });
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        res.status(500).json({ success: false, message: 'Ошибка отправки сообщения' });
    }
});

// Получение сообщений чата
app.get('/api/chats/:chatId/messages', authenticateToken, (req, res) => {
    try {
        const { chatId } = req.params;
        const chatMessages = messages
            .filter(m => m.chatId === chatId)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            .map(message => {
                const sender = users.find(u => u.id === message.senderId);
                return {
                    ...message,
                    sender: {
                        id: sender?.id,
                        displayName: sender?.displayName || 'Неизвестный',
                        username: sender?.username || 'unknown',
                        isVerified: sender?.isVerified || false,
                        isDeveloper: sender?.isDeveloper || false,
                        avatar: sender?.avatar || null
                    }
                };
            });

        res.json({ success: true, messages: chatMessages });
    } catch (error) {
        console.error('Ошибка получения сообщений:', error);
        res.status(500).json({ success: false, message: 'Ошибка загрузки сообщений' });
    }
});

// Получение профиля пользователя
app.get('/api/users/:username/profile', authenticateToken, (req, res) => {
    try {
        const { username } = req.params;
        const user = users.find(u => u.username === username);

        if (!user) {
            return res.status(404).json({ success: false, message: 'Пользователь не найден' });
        }

        // Статистика пользователя
        const userPosts = posts.filter(p => p.userId === user.id);
        const totalLikes = userPosts.reduce((sum, post) => sum + post.likes, 0);
        const userGiftsCount = userGifts.filter(g => g.receiverId === user.id).length;

        const userPostsWithDetails = userPosts.map(post => ({
            ...post,
            liked: post.likedBy.includes(req.user.userId)
        }));

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                isVerified: user.isVerified,
                isDeveloper: user.isDeveloper,
                avatar: user.avatar,
                eCoins: user.eCoins,
                createdAt: user.createdAt
            },
            stats: {
                posts: userPosts.length,
                likes: totalLikes,
                gifts: userGiftsCount
            },
            posts: userPostsWithDetails
        });
    } catch (error) {
        console.error('Ошибка получения профиля:', error);
        res.status(500).json({ success: false, message: 'Ошибка загрузки профиля' });
    }
});

// Получение подарков пользователя
app.get('/api/users/gifts', authenticateToken, (req, res) => {
    try {
        const userId = req.user.userId;
        const userGiftsList = userGifts
            .filter(g => g.receiverId === userId)
            .map(gift => {
                const giftInfo = gifts.find(g => g.id === gift.giftId);
                const sender = users.find(u => u.id === gift.senderId);
                return {
                    ...gift,
                    gift: giftInfo,
                    sender: {
                        displayName: sender?.displayName || 'Неизвестный',
                        username: sender?.username || 'unknown'
                    }
                };
            });

        res.json({ success: true, gifts: userGiftsList });
    } catch (error) {
        console.error('Ошибка получения подарков:', error);
        res.status(500).json({ success: false, message: 'Ошибка загрузки подарков' });
    }
});

// Магазин подарков
app.get('/api/gifts/shop', authenticateToken, (req, res) => {
    try {
        res.json({ success: true, gifts: gifts });
    } catch (error) {
        console.error('Ошибка получения магазина подарков:', error);
        res.status(500).json({ success: false, message: 'Ошибка загрузки магазина' });
    }
});

// Покупка подарка
app.post('/api/gifts/buy', authenticateToken, (req, res) => {
    try {
        const { giftId, receiverId } = req.body;
        const senderId = req.user.userId;

        const gift = gifts.find(g => g.id === giftId);
        const sender = users.find(u => u.id === senderId);
        const receiver = users.find(u => u.id === receiverId);

        if (!gift || !sender || !receiver) {
            return res.status(404).json({ success: false, message: 'Подарок или пользователь не найден' });
        }

        if (sender.eCoins < gift.price) {
            return res.status(400).json({ success: false, message: 'Недостаточно E-Coin' });
        }

        // Списание средств
        sender.eCoins -= gift.price;

        // Добавление подарка
        const userGift = {
            id: Date.now().toString(),
            giftId,
            senderId,
            receiverId,
            sentAt: new Date().toISOString()
        };

        userGifts.push(userGift);
        saveData();

        res.json({ success: true, message: 'Подарок отправлен', newBalance: sender.eCoins });
    } catch (error) {
        console.error('Ошибка покупки подарка:', error);
        res.status(500).json({ success: false, message: 'Ошибка отправки подарка' });
    }
});

// Админ панель - статистика
app.get('/api/admin/stats', authenticateToken, (req, res) => {
    try {
        const user = users.find(u => u.id === req.user.userId);
        if (!user || !user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Доступ запрещен' });
        }

        const stats = {
            totalUsers: users.length,
            totalPosts: posts.length,
            totalMessages: messages.length,
            ping: Math.floor(Math.random() * 50) + 10, // Пример пинга
            fps: Math.floor(Math.random() * 30) + 60 // Пример FPS
        };

        res.json({ success: true, stats });
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ success: false, message: 'Ошибка загрузки статистики' });
    }
});

// Админ панель - список пользователей
app.get('/api/admin/users', authenticateToken, (req, res) => {
    try {
        const user = users.find(u => u.id === req.user.userId);
        if (!user || !user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Доступ запрещен' });
        }

        const usersList = users.map(user => {
            const userPosts = posts.filter(p => p.userId === user.id);
            const totalLikes = userPosts.reduce((sum, post) => sum + post.likes, 0);

            return {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                eCoins: user.eCoins,
                isVerified: user.isVerified,
                isDeveloper: user.isDeveloper,
                isAdmin: user.isAdmin,
                postsCount: userPosts.length,
                likesCount: totalLikes,
                createdAt: user.createdAt
            };
        });

        res.json({ success: true, users: usersList });
    } catch (error) {
        console.error('Ошибка получения пользователей:', error);
        res.status(500).json({ success: false, message: 'Ошибка загрузки пользователей' });
    }
});

// Админ панель - управление пользователями
app.post('/api/admin/users/:userId/toggle-verify', authenticateToken, (req, res) => {
    try {
        const adminUser = users.find(u => u.id === req.user.userId);
        if (!adminUser || !adminUser.isAdmin) {
            return res.status(403).json({ success: false, message: 'Доступ запрещен' });
        }

        const { userId } = req.params;
        const user = users.find(u => u.id === userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'Пользователь не найден' });
        }

        user.isVerified = !user.isVerified;
        saveData();

        res.json({ success: true, isVerified: user.isVerified });
    } catch (error) {
        console.error('Ошибка изменения верификации:', error);
        res.status(500).json({ success: false, message: 'Ошибка изменения статуса' });
    }
});

app.post('/api/admin/users/:userId/toggle-developer', authenticateToken, (req, res) => {
    try {
        const adminUser = users.find(u => u.id === req.user.userId);
        if (!adminUser || !adminUser.isAdmin) {
            return res.status(403).json({ success: false, message: 'Доступ запрещен' });
        }

        const { userId } = req.params;
        const user = users.find(u => u.id === userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'Пользователь не найден' });
        }

        user.isDeveloper = !user.isDeveloper;
        saveData();

        res.json({ success: true, isDeveloper: user.isDeveloper });
    } catch (error) {
        console.error('Ошибка изменения статуса разработчика:', error);
        res.status(500).json({ success: false, message: 'Ошибка изменения статуса' });
    }
});

app.delete('/api/admin/users/:userId', authenticateToken, (req, res) => {
    try {
        const adminUser = users.find(u => u.id === req.user.userId);
        if (!adminUser || !adminUser.isAdmin) {
            return res.status(403).json({ success: false, message: 'Доступ запрещен' });
        }

        const { userId } = req.params;

        // Нельзя удалить себя
        if (userId === req.user.userId) {
            return res.status(400).json({ success: false, message: 'Нельзя удалить свой аккаунт' });
        }

        users = users.filter(u => u.id !== userId);
        posts = posts.filter(p => p.userId !== userId);
        saveData();

        res.json({ success: true, message: 'Пользователь удален' });
    } catch (error) {
        console.error('Ошибка удаления пользователя:', error);
        res.status(500).json({ success: false, message: 'Ошибка удаления пользователя' });
    }
});

// Админ панель - промокоды
app.get('/api/admin/promo-codes', authenticateToken, (req, res) => {
    try {
        const user = users.find(u => u.id === req.user.userId);
        if (!user || !user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Доступ запрещен' });
        }

        res.json({ success: true, promoCodes });
    } catch (error) {
        console.error('Ошибка получения промокодов:', error);
        res.status(500).json({ success: false, message: 'Ошибка загрузки промокодов' });
    }
});

app.post('/api/admin/promo-codes', authenticateToken, (req, res) => {
    try {
        const user = users.find(u => u.id === req.user.userId);
        if (!user || !user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Доступ запрещен' });
        }

        const { code, reward } = req.body;

        if (!code || !reward) {
            return res.status(400).json({ success: false, message: 'Все поля обязательны' });
        }

        if (promoCodes.find(p => p.code === code)) {
            return res.status(400).json({ success: false, message: 'Промокод уже существует' });
        }

        const promoCode = {
            id: Date.now().toString(),
            code,
            reward: parseInt(reward),
            uses: 0,
            maxUses: 100,
            createdAt: new Date().toISOString()
        };

        promoCodes.push(promoCode);
        saveData();

        res.json({ success: true, message: 'Промокод создан', promoCode });
    } catch (error) {
        console.error('Ошибка создания промокода:', error);
        res.status(500).json({ success: false, message: 'Ошибка создания промокода' });
    }
});

// Активация промокода
app.post('/api/promo-codes/activate', authenticateToken, (req, res) => {
    try {
        const { code } = req.body;
        const userId = req.user.userId;

        const promoCode = promoCodes.find(p => p.code === code);
        if (!promoCode) {
            return res.status(404).json({ success: false, message: 'Промокод не найден' });
        }

        if (promoCode.uses >= promoCode.maxUses) {
            return res.status(400).json({ success: false, message: 'Промокод больше не действителен' });
        }

        const user = users.find(u => u.id === userId);
        user.eCoins += promoCode.reward;
        promoCode.uses++;

        saveData();

        res.json({ 
            success: true, 
            message: `Промокод активирован! Получено ${promoCode.reward} E-Coin`,
            newBalance: user.eCoins 
        });
    } catch (error) {
        console.error('Ошибка активации промокода:', error);
        res.status(500).json({ success: false, message: 'Ошибка активации промокода' });
    }
});

// Инициализация данных
function initializeData() {
    // Создание начальных подарков
    if (gifts.length === 0) {
        gifts = [
            {
                id: '1',
                name: 'Сердечко',
                price: 100,
                preview: '❤️'
            },
            {
                id: '2',
                name: 'Звезда',
                price: 200,
                preview: '⭐'
            },
            {
                id: '3',
                name: 'Подарок',
                price: 500,
                preview: '🎁'
            },
            {
                id: '4',
                name: 'Корона',
                price: 1000,
                preview: '👑'
            }
        ];
    }

    saveData();
}

// WebSocket соединения
io.on('connection', (socket) => {
    console.log('Пользователь подключился');

    socket.on('disconnect', () => {
        console.log('Пользователь отключился');
    });

    socket.on('joinChat', (chatId) => {
        socket.join(chatId);
    });

    socket.on('leaveChat', (chatId) => {
        socket.leave(chatId);
    });
});

// Защита маршрутов
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/about.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

// Запуск сервера
loadData();
initializeData();

server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`Epic Messenger готов к работе!`);
});
