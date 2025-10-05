const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        // Разрешаем все типы файлов для подарков
        if (req.path.includes('/gifts') || req.path.includes('/upload-gift')) {
            cb(null, true);
        } else if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image and video files are allowed!'), false);
        }
    }
});

// Подключение к MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/epic-messenger', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

// Схемы MongoDB
const userSchema = new mongoose.Schema({
    name: String,
    username: { type: String, unique: true },
    email: { type: String, unique: true },
    password: String,
    avatar: String,
    bio: String,
    verified: { type: Boolean, default: false },
    developer: { type: Boolean, default: false },
    ecoins: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const postSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    text: String,
    media: {
        type: { type: String },
        url: String
    },
    likes: [{ type: mongoose.Schema.Types.ObjectId }],
    comments: [{
        userId: mongoose.Schema.Types.ObjectId,
        text: String,
        createdAt: { type: Date, default: Date.now }
    }],
    views: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
    senderId: mongoose.Schema.Types.ObjectId,
    receiverId: mongoose.Schema.Types.ObjectId,
    text: String,
    type: { type: String, default: 'text' },
    fileUrl: String,
    fileName: String,
    fileSize: Number,
    fileType: String,
    timestamp: { type: Date, default: Date.now }
});

const chatSchema = new mongoose.Schema({
    participants: [{ type: mongoose.Schema.Types.ObjectId }],
    lastMessage: String,
    lastMessageTime: { type: Date, default: Date.now },
    unreadCount: { type: Map, of: Number }
});

const giftSchema = new mongoose.Schema({
    name: String,
    description: String,
    price: Number,
    preview: String, // SVG, PNG, GIF - любой формат
    fileUrl: String, // URL файла подарка
    fileType: String, // Тип файла
    ownerId: mongoose.Schema.Types.ObjectId,
    fromUserId: mongoose.Schema.Types.ObjectId,
    createdAt: { type: Date, default: Date.now }
});

const promoCodeSchema = new mongoose.Schema({
    code: { type: String, unique: true },
    type: String, // 'ecoins', 'gift', 'badge'
    value: Number,
    maxUses: { type: Number, default: 0 },
    usedCount: { type: Number, default: 0 },
    usedBy: [{ type: mongoose.Schema.Types.ObjectId }],
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date
});

const transactionSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    type: String, // 'deposit', 'purchase', 'reward'
    amount: Number,
    description: String,
    date: { type: Date, default: Date.now }
});

// Модели
const User = mongoose.model('User', userSchema);
const Post = mongoose.model('Post', postSchema);
const Message = mongoose.model('Message', messageSchema);
const Chat = mongoose.model('Chat', chatSchema);
const Gift = mongoose.model('Gift', giftSchema);
const PromoCode = mongoose.model('PromoCode', promoCodeSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

// Middleware для проверки JWT токена
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Токен не предоставлен' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ message: 'Пользователь не найден' });
        }
        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({ message: 'Неверный токен' });
    }
};

// Проверка прав разработчика
const requireDeveloper = (req, res, next) => {
    if (!req.user.developer) {
        return res.status(403).json({ message: 'Требуются права разработчика' });
    }
    next();
};

// Routes

// Регистрация
app.post('/api/register', async (req, res) => {
    try {
        const { name, username, email, password } = req.body;

        // Проверяем, существует ли пользователь
        const existingUser = await User.findOne({ 
            $or: [{ email }, { username }] 
        });

        if (existingUser) {
            return res.status(400).json({ 
                message: 'Пользователь с таким email или username уже существует' 
            });
        }

        // Хешируем пароль
        const hashedPassword = await bcrypt.hash(password, 10);

        // Создаем пользователя
        const user = new User({
            name,
            username,
            email,
            password: hashedPassword
        });

        await user.save();

        // Создаем JWT токен
        const token = jwt.sign({ id: user._id }, JWT_SECRET);

        res.status(201).json({
            message: 'Пользователь создан успешно',
            token,
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                verified: user.verified,
                developer: user.developer,
                ecoins: user.ecoins
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Авторизация
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Находим пользователя
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Неверный email или пароль' });
        }

        // Проверяем пароль
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ message: 'Неверный email или пароль' });
        }

        // Создаем JWT токен
        const token = jwt.sign({ id: user._id }, JWT_SECRET);

        res.json({
            message: 'Вход выполнен успешно',
            token,
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                avatar: user.avatar,
                bio: user.bio,
                verified: user.verified,
                developer: user.developer,
                ecoins: user.ecoins
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Проверка токена
app.get('/api/verify-token', authenticateToken, (req, res) => {
    res.json({
        user: {
            id: req.user._id,
            name: req.user.name,
            username: req.user.username,
            email: req.user.email,
            avatar: req.user.avatar,
            bio: req.user.bio,
            verified: req.user.verified,
            developer: req.user.developer,
            ecoins: req.user.ecoins
        }
    });
});

// Получение пользователя по ID
app.get('/api/user/:id', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }
        res.json(user);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Обновление пользователя
app.put('/api/user/:id', authenticateToken, async (req, res) => {
    try {
        const { name, username, bio } = req.body;

        // Проверяем, что пользователь обновляет свой профиль
        if (req.user._id.toString() !== req.params.id) {
            return res.status(403).json({ message: 'Недостаточно прав' });
        }

        // Проверяем, не занят ли username другим пользователем
        if (username) {
            const existingUser = await User.findOne({ 
                username, 
                _id: { $ne: req.params.id } 
            });
            if (existingUser) {
                return res.status(400).json({ message: 'Username уже занят' });
            }
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            { name, username, bio },
            { new: true }
        ).select('-password');

        res.json(updatedUser);
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Загрузка аватара
app.post('/api/user/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Файл не загружен' });
        }

        const avatarUrl = `/uploads/${req.file.filename}`;
        
        await User.findByIdAndUpdate(req.user._id, { avatar: avatarUrl });

        res.json({ message: 'Аватар обновлен', avatar: avatarUrl });
    } catch (error) {
        console.error('Avatar upload error:', error);
        res.status(500).json({ message: 'Ошибка загрузки аватара' });
    }
});

// Получение всех пользователей
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Получение сообщений
app.get('/api/messages', authenticateToken, async (req, res) => {
    try {
        const { userId, toUserId } = req.query;

        // ЗАПРЕТ ДОСТУПА К ЗАПРЕЩЕННЫМ ID
        const forbiddenIds = ['1759599444816', '1759656247835'];
        if (forbiddenIds.includes(userId) || forbiddenIds.includes(toUserId)) {
            return res.status(403).json({ message: 'Доступ запрещен' });
        }

        // Проверяем, что пользователь запрашивает свои сообщения
        if (req.user._id.toString() !== userId && req.user._id.toString() !== toUserId) {
            return res.status(403).json({ message: 'Недостаточно прав' });
        }

        const messages = await Message.find({
            $or: [
                { senderId: userId, receiverId: toUserId },
                { senderId: toUserId, receiverId: userId }
            ]
        }).sort({ timestamp: 1 });

        res.json(messages);
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Отправка сообщения
app.post('/api/messages', authenticateToken, async (req, res) => {
    try {
        const { senderId, receiverId, text, type, fileUrl, fileName, fileSize, fileType } = req.body;

        // Проверяем, что отправитель - текущий пользователь
        if (req.user._id.toString() !== senderId) {
            return res.status(403).json({ message: 'Недостаточно прав' });
        }

        // ЗАПРЕТ ОТПРАВКИ СООБЩЕНИЙ С ЗАПРЕЩЕННЫМИ ID
        const forbiddenIds = ['1759599444816', '1759656247835'];
        if (forbiddenIds.includes(senderId) || forbiddenIds.includes(receiverId)) {
            return res.status(403).json({ message: 'Отправка сообщений запрещена' });
        }

        const message = new Message({
            senderId,
            receiverId,
            text,
            type: type || 'text',
            fileUrl,
            fileName,
            fileSize,
            fileType
        });

        await message.save();

        // Обновляем чат
        await updateChat(senderId, receiverId, text);

        res.status(201).json(message);
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ message: 'Ошибка отправки сообщения' });
    }
});

// Функция обновления чата
async function updateChat(userId1, userId2, lastMessage) {
    try {
        const participants = [userId1, userId2].sort();
        
        let chat = await Chat.findOne({ participants });
        
        if (chat) {
            chat.lastMessage = lastMessage;
            chat.lastMessageTime = new Date();
            
            // Обновляем счетчик непрочитанных
            const otherUserId = userId1 === participants[0] ? participants[1] : participants[0];
            const currentCount = chat.unreadCount.get(otherUserId) || 0;
            chat.unreadCount.set(otherUserId, currentCount + 1);
        } else {
            chat = new Chat({
                participants,
                lastMessage,
                unreadCount: new Map()
            });
            chat.unreadCount.set(participants[1], 1);
        }
        
        await chat.save();
    } catch (error) {
        console.error('Update chat error:', error);
    }
}

// Получение чатов пользователя
app.get('/api/chats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user._id;

        const chats = await Chat.find({ participants: userId })
            .populate('participants', 'name username avatar verified developer')
            .sort({ lastMessageTime: -1 });

        const formattedChats = await Promise.all(chats.map(async (chat) => {
            const otherParticipant = chat.participants.find(p => p._id.toString() !== userId.toString());
            const unreadCount = chat.unreadCount.get(userId.toString()) || 0;

            // Сбрасываем счетчик непрочитанных при запросе чатов
            if (unreadCount > 0) {
                chat.unreadCount.set(userId.toString(), 0);
                await chat.save();
            }

            return {
                id: otherParticipant._id,
                name: otherParticipant.name,
                username: otherParticipant.username,
                avatar: otherParticipant.avatar,
                verified: otherParticipant.verified,
                developer: otherParticipant.developer,
                lastMessage: chat.lastMessage,
                lastMessageTime: chat.lastMessageTime,
                unreadCount: unreadCount
            };
        }));

        res.json(formattedChats);
    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ message: 'Ошибка загрузки чатов' });
    }
});

// Получение постов
app.get('/api/posts', authenticateToken, async (req, res) => {
    try {
        const posts = await Post.find()
            .populate('userId', 'name username avatar verified developer')
            .sort({ createdAt: -1 });

        res.json(posts);
    } catch (error) {
        console.error('Get posts error:', error);
        res.status(500).json({ message: 'Ошибка загрузки постов' });
    }
});

// Создание поста
app.post('/api/posts', authenticateToken, async (req, res) => {
    try {
        const { text, media } = req.body;

        const post = new Post({
            userId: req.user._id,
            text,
            media
        });

        await post.save();
        await post.populate('userId', 'name username avatar verified developer');

        res.status(201).json(post);
    } catch (error) {
        console.error('Create post error:', error);
        res.status(500).json({ message: 'Ошибка создания поста' });
    }
});

// Лайк поста
app.post('/api/posts/:id/like', authenticateToken, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ message: 'Пост не найден' });
        }

        const userId = req.user._id;
        const likeIndex = post.likes.indexOf(userId);

        if (likeIndex > -1) {
            // Убираем лайк
            post.likes.splice(likeIndex, 1);
        } else {
            // Добавляем лайк
            post.likes.push(userId);
        }

        await post.save();
        res.json({ likes: post.likes.length });
    } catch (error) {
        console.error('Like post error:', error);
        res.status(500).json({ message: 'Ошибка при установке лайка' });
    }
});

// Получение постов пользователя
app.get('/api/user/:id/posts', authenticateToken, async (req, res) => {
    try {
        const posts = await Post.find({ userId: req.params.id })
            .populate('userId', 'name username avatar verified developer')
            .sort({ createdAt: -1 });

        res.json(posts);
    } catch (error) {
        console.error('Get user posts error:', error);
        res.status(500).json({ message: 'Ошибка загрузки постов' });
    }
});

// Получение подарков
app.get('/api/gifts', authenticateToken, async (req, res) => {
    try {
        const gifts = await Gift.find()
            .populate('ownerId', 'name username')
            .populate('fromUserId', 'name username');

        res.json(gifts);
    } catch (error) {
        console.error('Get gifts error:', error);
        res.status(500).json({ message: 'Ошибка загрузки подарков' });
    }
});

// Покупка подарка
app.post('/api/gifts/:id/buy', authenticateToken, async (req, res) => {
    try {
        const gift = await Gift.findById(req.params.id);
        if (!gift) {
            return res.status(404).json({ message: 'Подарок не найден' });
        }

        if (gift.ownerId) {
            return res.status(400).json({ message: 'Подарок уже куплен' });
        }

        // Проверяем баланс пользователя
        if (req.user.ecoins < gift.price) {
            return res.status(400).json({ message: 'Недостаточно E-COIN' });
        }

        // Списываем средства
        req.user.ecoins -= gift.price;
        await req.user.save();

        // Назначаем подарок пользователю
        gift.ownerId = req.user._id;
        await gift.save();

        // Создаем транзакцию
        const transaction = new Transaction({
            userId: req.user._id,
            type: 'purchase',
            amount: -gift.price,
            description: `Покупка подарка: ${gift.name}`
        });
        await transaction.save();

        res.json({ 
            message: 'Подарок успешно куплен', 
            giftName: gift.name,
            newBalance: req.user.ecoins
        });
    } catch (error) {
        console.error('Buy gift error:', error);
        res.status(500).json({ message: 'Ошибка покупки подарка' });
    }
});

// Загрузка подарка (для разработчиков)
app.post('/api/upload-gift', authenticateToken, requireDeveloper, upload.single('gift'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Файл не загружен' });
        }

        const { name, description, price } = req.body;

        const gift = new Gift({
            name,
            description,
            price: parseInt(price),
            preview: `/uploads/${req.file.filename}`,
            fileUrl: `/uploads/${req.file.filename}`,
            fileType: req.file.mimetype
        });

        await gift.save();

        res.json({ message: 'Подарок загружен успешно', gift });
    } catch (error) {
        console.error('Upload gift error:', error);
        res.status(500).json({ message: 'Ошибка загрузки подарка' });
    }
});

// Получение промокодов
app.get('/api/promo-codes', authenticateToken, async (req, res) => {
    try {
        const promoCodes = await PromoCode.find();
        res.json(promoCodes);
    } catch (error) {
        console.error('Get promo codes error:', error);
        res.status(500).json({ message: 'Ошибка загрузки промокодов' });
    }
});

// Создание промокода (только для разработчиков)
app.post('/api/promo-codes', authenticateToken, requireDeveloper, async (req, res) => {
    try {
        const { code, type, value, maxUses } = req.body;

        // Проверяем, существует ли промокод
        const existingPromo = await PromoCode.findOne({ code });
        if (existingPromo) {
            return res.status(400).json({ message: 'Промокод уже существует' });
        }

        const promoCode = new PromoCode({
            code,
            type,
            value: parseInt(value),
            maxUses: parseInt(maxUses) || 0
        });

        await promoCode.save();

        res.status(201).json({ message: 'Промокод создан успешно', promoCode });
    } catch (error) {
        console.error('Create promo code error:', error);
        res.status(500).json({ message: 'Ошибка создания промокода' });
    }
});

// Активация промокода
app.post('/api/promo-codes/activate', authenticateToken, async (req, res) => {
    try {
        const { code, userId } = req.body;

        // Проверяем, что пользователь активирует промокод для себя
        if (req.user._id.toString() !== userId) {
            return res.status(403).json({ message: 'Недостаточно прав' });
        }

        const promoCode = await PromoCode.findOne({ code });
        if (!promoCode) {
            return res.status(404).json({ message: 'Промокод не найден' });
        }

        // Проверяем срок действия
        if (promoCode.expiresAt && promoCode.expiresAt < new Date()) {
            return res.status(400).json({ message: 'Промокод истек' });
        }

        // Проверяем лимит использований
        if (promoCode.maxUses > 0 && promoCode.usedCount >= promoCode.maxUses) {
            return res.status(400).json({ message: 'Промокод уже использован максимальное количество раз' });
        }

        // Проверяем, использовал ли пользователь уже этот промокод
        if (promoCode.usedBy.includes(userId)) {
            return res.status(400).json({ message: 'Вы уже использовали этот промокод' });
        }

        // Активируем промокод
        let rewardMessage = '';
        
        switch (promoCode.type) {
            case 'ecoins':
                req.user.ecoins += promoCode.value;
                await req.user.save();
                
                // Создаем транзакцию
                const transaction = new Transaction({
                    userId: req.user._id,
                    type: 'reward',
                    amount: promoCode.value,
                    description: `Активация промокода: ${code}`
                });
                await transaction.save();
                
                rewardMessage = `Начислено ${promoCode.value} E-COIN`;
                break;
                
            case 'gift':
                // Создаем подарок для пользователя
                const gift = new Gift({
                    name: `Подарок из промокода`,
                    description: `Получено по промокоду: ${code}`,
                    price: 0,
                    preview: '🎁',
                    ownerId: userId,
                    fromUserId: null
                });
                await gift.save();
                rewardMessage = `Получен специальный подарок!`;
                break;
                
            case 'badge':
                // Здесь можно добавить логику для выдачи бейджей
                rewardMessage = `Получен специальный бейдж!`;
                break;
        }

        // Обновляем данные промокода
        promoCode.usedCount += 1;
        promoCode.usedBy.push(userId);
        await promoCode.save();

        res.json({ 
            message: `Промокод активирован успешно! ${rewardMessage}`,
            type: promoCode.type,
            value: promoCode.value
        });
    } catch (error) {
        console.error('Activate promo code error:', error);
        res.status(500).json({ message: 'Ошибка активации промокода' });
    }
});

// Удаление промокода (только для разработчиков)
app.delete('/api/promo-codes/:code', authenticateToken, requireDeveloper, async (req, res) => {
    try {
        const promoCode = await PromoCode.findOneAndDelete({ code: req.params.code });
        if (!promoCode) {
            return res.status(404).json({ message: 'Промокод не найден' });
        }

        res.json({ message: 'Промокод удален' });
    } catch (error) {
        console.error('Delete promo code error:', error);
        res.status(500).json({ message: 'Ошибка удаления промокода' });
    }
});

// Пополнение E-COIN баланса
app.post('/api/user/add-ecoins', authenticateToken, async (req, res) => {
    try {
        const { userId, amount } = req.body;

        // Проверяем, что пользователь пополняет свой баланс
        if (req.user._id.toString() !== userId) {
            return res.status(403).json({ message: 'Недостаточно прав' });
        }

        req.user.ecoins += parseInt(amount);
        await req.user.save();

        // Создаем транзакцию
        const transaction = new Transaction({
            userId: req.user._id,
            type: 'deposit',
            amount: parseInt(amount),
            description: `Пополнение баланса`
        });
        await transaction.save();

        res.json({ 
            message: 'Баланс пополнен успешно',
            newBalance: req.user.ecoins
        });
    } catch (error) {
        console.error('Add ecoins error:', error);
        res.status(500).json({ message: 'Ошибка пополнения баланса' });
    }
});

// Получение истории транзакций
app.get('/api/user/:id/transactions', authenticateToken, async (req, res) => {
    try {
        // Проверяем, что пользователь запрашивает свою историю
        if (req.user._id.toString() !== req.params.id) {
            return res.status(403).json({ message: 'Недостаточно прав' });
        }

        const transactions = await Transaction.find({ userId: req.params.id })
            .sort({ date: -1 });

        res.json(transactions);
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ message: 'Ошибка загрузки истории транзакций' });
    }
});

// Админ: получение статистики
app.get('/api/admin/stats', authenticateToken, requireDeveloper, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalMessages = await Message.countDocuments();
        const totalPosts = await Post.countDocuments();
        const totalGifts = await Gift.countDocuments();
        const totalTransactions = await Transaction.countDocuments();

        res.json({
            totalUsers,
            totalMessages,
            totalPosts,
            totalGifts,
            totalTransactions
        });
    } catch (error) {
        console.error('Get admin stats error:', error);
        res.status(500).json({ message: 'Ошибка загрузки статистики' });
    }
});

// Админ: получение всех пользователей
app.get('/api/admin/users', authenticateToken, requireDeveloper, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        console.error('Get admin users error:', error);
        res.status(500).json({ message: 'Ошибка загрузки пользователей' });
    }
});

// Админ: удаление пользователя
app.delete('/api/user/:id', authenticateToken, async (req, res) => {
    try {
        // Только разработчики или сам пользователь могут удалить аккаунт
        if (!req.user.developer && req.user._id.toString() !== req.params.id) {
            return res.status(403).json({ message: 'Недостаточно прав' });
        }

        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        // Удаляем связанные данные
        await Post.deleteMany({ userId: req.params.id });
        await Message.deleteMany({ 
            $or: [
                { senderId: req.params.id },
                { receiverId: req.params.id }
            ]
        });
        await Gift.updateMany(
            { ownerId: req.params.id },
            { $unset: { ownerId: 1 } }
        );
        await Transaction.deleteMany({ userId: req.params.id });

        res.json({ message: 'Пользователь удален' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ message: 'Ошибка удаления пользователя' });
    }
});

// API для bayrex-usernames (защищенный)
app.get('/api/bayrex-usernames', authenticateToken, async (req, res) => {
    try {
        // ЗАПРЕТ ДОСТУПА ДЛЯ ОБЫЧНЫХ ПОЛЬЗОВАТЕЛЕЙ
        if (!req.user.developer) {
            return res.status(403).json({ message: 'Доступ запрещен' });
        }

        const users = await User.find({}, 'username name verified developer');
        res.json(users);
    } catch (error) {
        console.error('Get bayrex usernames error:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Обслуживание статических файлов из папки uploads
app.use('/uploads', express.static('uploads'));

// Обслуживание статических файлов из папки public
app.use(express.static('public'));

// Маршрут для главной страницы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Обработка ошибок multer
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'Файл слишком большой' });
        }
    }
    res.status(500).json({ message: error.message });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Создание тестовых данных при первом запуске
async function createTestData() {
    try {
        const userCount = await User.countDocuments();
        if (userCount === 0) {
            // Создаем тестового пользователя-разработчика
            const hashedPassword = await bcrypt.hash('developer123', 10);
            const developer = new User({
                name: 'Developer',
                username: 'developer',
                email: 'developer@example.com',
                password: hashedPassword,
                verified: true,
                developer: true,
                ecoins: 1000
            });
            await developer.save();

            // Создаем тестовые подарки
            const gifts = [
                {
                    name: 'Золотая корона',
                    description: 'Роскошная золотая корона для настоящих королей',
                    price: 500,
                    preview: '👑'
                },
                {
                    name: 'Волшебный шар',
                    description: 'Магический шар, предсказывающий будущее',
                    price: 300,
                    preview: '🔮'
                },
                {
                    name: 'Сердце',
                    description: 'Подарите любовь и заботу своим друзьям',
                    price: 100,
                    preview: '💖'
                },
                {
                    name: 'Звезда',
                    description: 'Сияющая звезда для особенных достижений',
                    price: 200,
                    preview: '⭐'
                }
            ];

            for (const giftData of gifts) {
                const gift = new Gift(giftData);
                await gift.save();
            }

            // Создаем тестовые промокоды
            const promoCodes = [
                {
                    code: 'WELCOME100',
                    type: 'ecoins',
                    value: 100,
                    maxUses: 100
                },
                {
                    code: 'FIRSTGIFT',
                    type: 'gift',
                    value: 1, // ID первого подарка
                    maxUses: 50
                }
            ];

            for (const promoData of promoCodes) {
                const promoCode = new PromoCode(promoData);
                await promoCode.save();
            }

            console.log('Тестовые данные созданы');
        }
    } catch (error) {
        console.error('Error creating test data:', error);
    }
}

// Вызываем создание тестовых данных при запуске
createTestData();
