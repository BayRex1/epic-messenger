const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { Pool } = require('pg');
const session = require('express-session');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Подключение к PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Настройка сессий
app.use(session({
  secret: process.env.SESSION_SECRET || 'epic-messenger-secret-key-2024',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Middleware для проверки авторизации
function requireAuth(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ success: false, message: 'Требуется авторизация' });
  }
}

// Простая функция хеширования пароля
function simpleHash(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
}

// Функции санитизации
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  const dangerousTags = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>|<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi;
  input = input.replace(dangerousTags, '');
  const map = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;',
    "/": '&#x2F;', "`": '&#x60;', "=": '&#x3D;'
  };
  const reg = /[&<>"'/`=]/ig;
  return input.replace(reg, (match) => map[match]);
}

// Улучшенное middleware для логирования (игнорирует статические файлы и favicon)
app.use((req, res, next) => {
  // Игнорируем запросы к статическим файлам и favicon
  if (req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|ttf)$/) || req.path === '/favicon.ico') {
    return next();
  }
  
  // Логируем только основные маршруты
  if (req.path === '/' || req.path.startsWith('/api') || req.path.endsWith('.html')) {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Session: ${req.session.userId || 'none'}`);
  }
  next();
});

// Базовые маршруты
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.sendFile(path.join(__dirname, 'main.html'));
  } else {
    res.sendFile(path.join(__dirname, 'login.html'));
  }
});

app.get('/main.html', (req, res) => {
  if (req.session.userId) {
    res.sendFile(path.join(__dirname, 'main.html'));
  } else {
    res.redirect('/login.html');
  }
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const usersCount = await pool.query('SELECT COUNT(*) FROM users WHERE deleted = false');
    const messagesCount = await pool.query('SELECT COUNT(*) FROM messages WHERE deleted = false');
    const postsCount = await pool.query('SELECT COUNT(*) FROM posts');

    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      users: parseInt(usersCount.rows[0].count),
      messages: parseInt(messagesCount.rows[0].count),
      posts: parseInt(postsCount.rows[0].count)
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

// Проверка авторизации
app.get('/api/check-auth', (req, res) => {
  if (req.session.userId) {
    res.json({ 
      success: true, 
      authenticated: true,
      userId: req.session.userId 
    });
  } else {
    res.json({ 
      success: true, 
      authenticated: false 
    });
  }
});

// API routes
app.post('/api/register', async (req, res) => {
  try {
    let { email, username, displayName, password } = req.body;

    if (!email || !username || !displayName || !password) {
      return res.json({ success: false, message: 'Все поля обязательны' });
    }

    // Проверка на существующий username
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND deleted = false',
      [username]
    );

    if (existingUser.rows.length > 0) {
      return res.json({ success: false, message: 'Юзернейм уже занят' });
    }

    // Хеширование пароля
    const hashedPassword = simpleHash(password);
    const userId = Date.now().toString();
    const isBayRex = username.toLowerCase() === 'bayrex';

    await pool.query(
      `INSERT INTO users (id, email, username, display_name, password, verified, is_developer, coins) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, email.toLowerCase(), username, displayName, hashedPassword, isBayRex, isBayRex, 1000]
    );

    // Сохраняем пользователя в сессии
    req.session.userId = userId;
    req.session.username = username;

    console.log(`✅ Новый пользователь: ${username}`);

    res.json({ 
      success: true, 
      message: 'Регистрация успешна!',
      user: {
        id: userId,
        username: username,
        displayName: displayName,
        verified: isBayRex,
        isDeveloper: isBayRex,
        coins: 1000
      }
    });
  } catch (error) {
    console.error('Error in register:', error);
    res.json({ success: false, message: 'Ошибка регистрации' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    let { email, password } = req.body;

    const user = await pool.query(
      `SELECT * FROM users WHERE 
       (email = $1 OR LOWER(username) = LOWER($1)) AND 
       deleted = false`,
      [email]
    );

    if (user.rows.length === 0) {
      return res.json({ success: false, message: 'Неверный email/юзернейм или пароль' });
    }

    const userData = user.rows[0];
    const isPasswordValid = simpleHash(password) === userData.password;
    
    if (!isPasswordValid) {
      return res.json({ success: false, message: 'Неверный email/юзернейм или пароль' });
    }

    // Сохраняем пользователя в сессии
    req.session.userId = userData.id;
    req.session.username = userData.username;

    console.log(`✅ Пользователь вошел: ${userData.username}`);

    res.json({ 
      success: true, 
      message: 'Вход выполнен!', 
      user: {
        id: userData.id,
        username: userData.username,
        displayName: userData.display_name,
        verified: userData.verified,
        isDeveloper: userData.is_developer,
        coins: userData.coins
      }
    });
  } catch (error) {
    console.error('Error in login:', error);
    res.json({ success: false, message: 'Ошибка входа' });
  }
});

// Выход
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.json({ success: false, message: 'Ошибка выхода' });
    }
    res.json({ success: true, message: 'Выход выполнен' });
  });
});

// Получение текущего пользователя
app.get('/api/current-user', requireAuth, async (req, res) => {
  try {
    const user = await pool.query(
      `SELECT id, username, display_name, verified, is_developer, coins 
       FROM users WHERE id = $1 AND deleted = false`,
      [req.session.userId]
    );

    if (user.rows.length === 0) {
      req.session.destroy();
      return res.status(401).json({ success: false, message: 'Пользователь не найден' });
    }

    const userData = user.rows[0];
    res.json({
      success: true,
      user: {
        id: userData.id,
        username: userData.username,
        displayName: userData.display_name,
        verified: userData.verified,
        isDeveloper: userData.is_developer,
        coins: userData.coins
      }
    });
  } catch (error) {
    console.error('Error getting current user:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения пользователя' });
  }
});

// Получение пользователя по ID
app.get('/api/user/:id', requireAuth, async (req, res) => {
  try {
    const user = await pool.query(
      `SELECT id, username, display_name, verified, is_developer, coins 
       FROM users WHERE id = $1 AND deleted = false`,
      [req.params.id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    const userData = user.rows[0];
    res.json({
      success: true,
      user: {
        id: userData.id,
        username: userData.username,
        displayName: userData.display_name,
        verified: userData.verified,
        isDeveloper: userData.is_developer,
        coins: userData.coins
      }
    });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения пользователя' });
  }
});

// Получение всех пользователей
app.get('/api/users', requireAuth, async (req, res) => {
  try {
    const users = await pool.query(
      'SELECT id, username, display_name as name FROM users WHERE deleted = false AND id != $1',
      [req.session.userId]
    );
    res.json(users.rows);
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения пользователей' });
  }
});

// Поиск пользователей
app.get('/api/search-users', requireAuth, async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.length < 2) {
      return res.json([]);
    }

    const users = await pool.query(
      `SELECT id, username, display_name as name
       FROM users 
       WHERE (LOWER(username) LIKE LOWER($1) OR LOWER(display_name) LIKE LOWER($1)) 
       AND deleted = false AND id != $2
       LIMIT 10`,
      [`%${query}%`, req.session.userId]
    );

    res.json(users.rows);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ success: false, message: 'Ошибка поиска пользователей' });
  }
});

// Получение чатов пользователя
app.get('/api/chats', requireAuth, async (req, res) => {
  try {
    const chats = await pool.query(`
      SELECT DISTINCT 
        u.id,
        u.username,
        u.display_name as name,
        (SELECT text FROM messages WHERE (user_id = $1 AND to_user_id = u.id) OR (user_id = u.id AND to_user_id = $1) ORDER BY timestamp DESC LIMIT 1) as last_message,
        (SELECT COUNT(*) FROM messages WHERE to_user_id = $1 AND user_id = u.id) as unread_count
      FROM users u
      WHERE u.id != $1 AND u.deleted = false
      ORDER BY (SELECT timestamp FROM messages WHERE (user_id = $1 AND to_user_id = u.id) OR (user_id = u.id AND to_user_id = $1) ORDER BY timestamp DESC LIMIT 1) DESC NULLS LAST
    `, [req.session.userId]);

    res.json(chats.rows);
  } catch (error) {
    console.error('Error getting user chats:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения чатов' });
  }
});

// Получение сообщений
app.get('/api/messages', requireAuth, async (req, res) => {
  try {
    const { userId, toUserId } = req.query;
    const messages = await pool.query(`
      SELECT * FROM messages 
      WHERE ((user_id = $1 AND to_user_id = $2) OR (user_id = $2 AND to_user_id = $1)) 
      AND deleted = false 
      ORDER BY timestamp ASC
    `, [userId, toUserId]);
    res.json(messages.rows);
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения сообщений' });
  }
});

// Отправка сообщения
app.post('/api/messages', requireAuth, async (req, res) => {
  try {
    const { senderId, receiverId, text } = req.body;
    const messageId = Date.now().toString();
    
    const user = await pool.query(
      'SELECT username, display_name FROM users WHERE id = $1',
      [senderId]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    const userData = user.rows[0];

    await pool.query(
      `INSERT INTO messages (id, user_id, username, display_name, text, to_user_id) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [messageId, senderId, userData.username, userData.display_name, text, receiverId]
    );

    res.json({ 
      success: true, 
      message: {
        id: messageId,
        userId: senderId,
        username: userData.username,
        displayName: userData.display_name,
        text: text,
        toUserId: receiverId,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, message: 'Ошибка отправки сообщения' });
  }
});

// Получение постов
app.get('/api/posts', requireAuth, async (req, res) => {
  try {
    const posts = await pool.query(`
      SELECT p.*, u.username as user_name, u.display_name as user_display_name
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE u.deleted = false
      ORDER BY p.timestamp DESC
      LIMIT 20
    `);
    
    const formattedPosts = posts.rows.map(post => ({
      id: post.id,
      text: post.text,
      image: post.image,
      likes: post.likes || [],
      comments: post.comments || [],
      views: post.views || 0,
      createdAt: post.timestamp,
      userName: post.user_name,
      userDisplayName: post.user_display_name
    }));
    
    res.json(formattedPosts);
  } catch (error) {
    console.error('Error getting posts:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения постов' });
  }
});

// Создание поста
app.post('/api/posts', requireAuth, async (req, res) => {
  try {
    const { text, image } = req.body;
    const userId = req.session.userId;

    if (!text) {
      return res.status(400).json({ success: false, message: 'Текст поста обязателен' });
    }

    const postId = Date.now().toString();

    await pool.query(
      'INSERT INTO posts (id, user_id, text, image) VALUES ($1, $2, $3, $4)',
      [postId, userId, sanitizeInput(text), image]
    );

    res.json({ 
      success: true, 
      message: 'Пост создан',
      post: {
        id: postId,
        text: sanitizeInput(text),
        image: image,
        likes: [],
        comments: [],
        views: 0,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ success: false, message: 'Ошибка создания поста' });
  }
});

// Лайк поста
app.post('/api/posts/:id/like', requireAuth, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.session.userId;

    const post = await pool.query('SELECT likes FROM posts WHERE id = $1', [postId]);
    
    if (post.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Пост не найден' });
    }

    let likes = post.rows[0].likes || [];
    const likeIndex = likes.indexOf(userId);

    if (likeIndex > -1) {
      // Убираем лайк
      likes.splice(likeIndex, 1);
    } else {
      // Добавляем лайк
      likes.push(userId);
    }

    await pool.query('UPDATE posts SET likes = $1 WHERE id = $2', [JSON.stringify(likes), postId]);

    res.json({ 
      success: true, 
      likes: likes.length
    });
  } catch (error) {
    console.error('Error liking post:', error);
    res.status(500).json({ success: false, message: 'Ошибка при установке лайка' });
  }
});

// Получение подарков
app.get('/api/gifts', requireAuth, async (req, res) => {
  try {
    const gifts = await pool.query('SELECT * FROM gifts WHERE deleted = false');
    
    const formattedGifts = gifts.rows.map(gift => ({
      id: gift.id,
      name: gift.name,
      price: gift.price,
      image: gift.image,
      type: gift.type,
      preview: gift.image || '🎁'
    }));
    
    res.json(formattedGifts);
  } catch (error) {
    console.error('Error getting gifts:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения подарков' });
  }
});

// Покупка подарка
app.post('/api/gifts/:id/buy', requireAuth, async (req, res) => {
  try {
    const giftId = req.params.id;
    const userId = req.session.userId;

    // Получаем подарок
    const gift = await pool.query('SELECT * FROM gifts WHERE id = $1 AND deleted = false', [giftId]);
    
    if (gift.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Подарок не найден' });
    }

    const giftData = gift.rows[0];

    // Получаем пользователя
    const user = await pool.query('SELECT coins FROM users WHERE id = $1', [userId]);
    
    if (user.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    const userData = user.rows[0];

    // Проверяем баланс
    if (userData.coins < giftData.price) {
      return res.status(400).json({ success: false, message: 'Недостаточно E-COIN' });
    }

    // Обновляем баланс
    const newCoins = userData.coins - giftData.price;
    await pool.query('UPDATE users SET coins = $1 WHERE id = $2', [newCoins, userId]);

    res.json({ 
      success: true, 
      message: 'Подарок успешно куплен!',
      giftName: giftData.name,
      newBalance: newCoins
    });
  } catch (error) {
    console.error('Error buying gift:', error);
    res.status(500).json({ success: false, message: 'Ошибка покупки подарка' });
  }
});

// Получение промокодов
app.get('/api/promo-codes', requireAuth, async (req, res) => {
  try {
    const promoCodes = await pool.query('SELECT * FROM promocodes WHERE deleted = false');
    res.json(promoCodes.rows);
  } catch (error) {
    console.error('Error getting promo codes:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения промокодов' });
  }
});

// Создание промокода (только для разработчиков)
app.post('/api/promo-codes', requireAuth, async (req, res) => {
  try {
    const { code, value, maxUses = 1 } = req.body;
    const userId = req.session.userId;

    // Проверяем права разработчика
    const user = await pool.query('SELECT is_developer FROM users WHERE id = $1', [userId]);
    
    if (!user.rows[0]?.is_developer) {
      return res.status(403).json({ success: false, message: 'Только разработчики могут создавать промокоды' });
    }

    if (!code || !value) {
      return res.status(400).json({ success: false, message: 'Все поля обязательны' });
    }

    const promoId = Date.now().toString();

    await pool.query(
      'INSERT INTO promocodes (id, code, coins, max_uses, created_by) VALUES ($1, $2, $3, $4, $5)',
      [promoId, code.toUpperCase(), parseInt(value), parseInt(maxUses), userId]
    );

    res.json({ 
      success: true, 
      message: 'Промокод создан'
    });
  } catch (error) {
    console.error('Error creating promo code:', error);
    res.status(500).json({ success: false, message: 'Ошибка создания промокода' });
  }
});

// Активация промокода
app.post('/api/promo-codes/activate', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.session.userId;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Введите промокод' });
    }

    // Ищем промокод
    const promo = await pool.query('SELECT * FROM promocodes WHERE code = $1 AND deleted = false', [code.toUpperCase()]);
    
    if (promo.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Промокод не найден' });
    }

    const promoData = promo.rows[0];

    // Проверяем лимит использований
    if (promoData.max_uses > 0 && promoData.used_count >= promoData.max_uses) {
      return res.status(400).json({ success: false, message: 'Промокод уже использован' });
    }

    // Начисляем монеты
    const user = await pool.query('SELECT coins FROM users WHERE id = $1', [userId]);
    const userData = user.rows[0];

    const newCoins = userData.coins + promoData.coins;

    // Обновляем баланс пользователя
    await pool.query('UPDATE users SET coins = $1 WHERE id = $2', [newCoins, userId]);

    // Обновляем статистику промокода
    await pool.query(
      'UPDATE promocodes SET used_count = $1 WHERE id = $2',
      [promoData.used_count + 1, promoData.id]
    );

    res.json({ 
      success: true, 
      message: `Промокод активирован! Начислено ${promoData.coins} E-COIN`,
      coins: promoData.coins,
      newBalance: newCoins
    });
  } catch (error) {
    console.error('Error activating promo code:', error);
    res.status(500).json({ success: false, message: 'Ошибка активации промокода' });
  }
});

// Обновление профиля
app.put('/api/user/:id', requireAuth, async (req, res) => {
  try {
    const { name, username, bio } = req.body;
    const userId = req.params.id;

    // Проверяем, что пользователь обновляет свой профиль
    if (userId !== req.session.userId) {
      return res.status(403).json({ success: false, message: 'Недостаточно прав' });
    }

    await pool.query(
      'UPDATE users SET display_name = $1, username = $2, description = $3 WHERE id = $4',
      [sanitizeInput(name), sanitizeInput(username), sanitizeInput(bio), userId]
    );

    res.json({ 
      success: true, 
      message: 'Профиль обновлен'
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ success: false, message: 'Ошибка обновления профиля' });
  }
});

// Админ endpoints
app.get('/api/admin/stats', requireAuth, async (req, res) => {
  try {
    const user = await pool.query('SELECT is_developer FROM users WHERE id = $1', [req.session.userId]);
    
    if (!user.rows[0]?.is_developer) {
      return res.status(403).json({ success: false, message: 'Недостаточно прав' });
    }

    const usersCount = await pool.query('SELECT COUNT(*) FROM users WHERE deleted = false');
    const messagesCount = await pool.query('SELECT COUNT(*) FROM messages WHERE deleted = false');
    const postsCount = await pool.query('SELECT COUNT(*) FROM posts');

    res.json({
      totalUsers: parseInt(usersCount.rows[0].count),
      totalMessages: parseInt(messagesCount.rows[0].count),
      totalPosts: parseInt(postsCount.rows[0].count)
    });
  } catch (error) {
    console.error('Error getting admin stats:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения статистики' });
  }
});

app.get('/api/admin/users', requireAuth, async (req, res) => {
  try {
    const user = await pool.query('SELECT is_developer FROM users WHERE id = $1', [req.session.userId]);
    
    if (!user.rows[0]?.is_developer) {
      return res.status(403).json({ success: false, message: 'Недостаточно прав' });
    }

    const users = await pool.query(`
      SELECT id, username, display_name, email, verified, is_developer, coins, created_at
      FROM users 
      WHERE deleted = false
      ORDER BY created_at DESC
    `);

    res.json(users.rows);
  } catch (error) {
    console.error('Error getting admin users:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения пользователей' });
  }
});

// Инициализация базы данных
async function initDatabase() {
  try {
    console.log('🔄 Инициализация базы данных...');

    // Создаем таблицы если их нет
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        password VARCHAR(255) NOT NULL,
        verified BOOLEAN DEFAULT false,
        is_developer BOOLEAN DEFAULT false,
        coins INTEGER DEFAULT 1000,
        description TEXT DEFAULT 'Новый пользователь Epic Messenger',
        created_at TIMESTAMP DEFAULT NOW(),
        deleted BOOLEAN DEFAULT false
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) REFERENCES users(id),
        username VARCHAR(50) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        text TEXT NOT NULL,
        to_user_id VARCHAR(50) REFERENCES users(id),
        timestamp TIMESTAMP DEFAULT NOW(),
        deleted BOOLEAN DEFAULT false
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) REFERENCES users(id),
        text TEXT NOT NULL,
        image TEXT,
        likes JSONB DEFAULT '[]',
        comments JSONB DEFAULT '[]',
        views INTEGER DEFAULT 0,
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS gifts (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price INTEGER NOT NULL,
        image TEXT,
        type VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        deleted BOOLEAN DEFAULT false
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS promocodes (
        id VARCHAR(50) PRIMARY KEY,
        code VARCHAR(100) UNIQUE NOT NULL,
        coins INTEGER NOT NULL,
        max_uses INTEGER DEFAULT 1,
        used_count INTEGER DEFAULT 0,
        created_by VARCHAR(50) REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        deleted BOOLEAN DEFAULT false
      )
    `);

    // Создаем тестовые данные
    const usersCount = await pool.query('SELECT COUNT(*) FROM users WHERE deleted = false');
    if (parseInt(usersCount.rows[0].count) === 0) {
      const testUsers = [
        { id: '1', email: 'admin@gmail.com', username: 'admin', displayName: 'Администратор', password: '123', isDeveloper: true, verified: true },
        { id: '2', email: 'bayrex@gmail.com', username: 'BayRex', displayName: 'BayRex Developer', password: '123', isDeveloper: true, verified: true },
        { id: '3', email: 'testuser@gmail.com', username: 'testuser', displayName: 'Тестовый Пользователь', password: '123' }
      ];

      for (const user of testUsers) {
        const hashedPassword = simpleHash(user.password);
        await pool.query(
          `INSERT INTO users (id, email, username, display_name, password, verified, is_developer, coins) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [user.id, user.email, user.username, user.displayName, hashedPassword, 
           user.verified || false, user.isDeveloper || false, 1000]
        );
      }
    }

    const giftsCount = await pool.query('SELECT COUNT(*) FROM gifts WHERE deleted = false');
    if (parseInt(giftsCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO gifts (id, name, price, type) VALUES
        ('1', 'Золотая корона', 100, 'image'),
        ('2', 'Анимация с фейерверком', 50, 'gif'),
        ('3', 'Волшебный шар', 75, 'image'),
        ('4', 'Сердце любви', 25, 'image'),
        ('5', 'Золотая звезда', 150, 'image')
      `);
    }

    console.log('✅ База данных инициализирована');
  } catch (error) {
    console.error('❌ Ошибка инициализации базы данных:', error);
  }
}

initDatabase();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

const onlineUsers = new Map();

// Socket.IO
io.on('connection', (socket) => {
  console.log('🔌 Новое подключение:', socket.id);

  socket.on('user_online', async (userId) => {
    try {
      onlineUsers.set(socket.id, userId);
      socket.broadcast.emit('user_status_changed', { userId, status: 'online' });
    } catch (error) {
      console.error('Error setting user online:', error);
    }
  });

  socket.on('send_message', async (data) => {
    try {
      const { userId, toUserId, text } = data;
      const messageId = Date.now().toString();

      const user = await pool.query(
        'SELECT username, display_name FROM users WHERE id = $1 AND deleted = false',
        [userId]
      );

      if (user.rows.length === 0) return;

      const userData = user.rows[0];

      await pool.query(
        `INSERT INTO messages (id, user_id, username, display_name, text, to_user_id) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [messageId, userId, userData.username, userData.display_name, text, toUserId]
      );

      const message = {
        id: messageId,
        userId,
        username: userData.username,
        displayName: userData.display_name,
        text: text,
        toUserId,
        timestamp: new Date().toISOString()
      };

      socket.emit('new_message', message);
      socket.to(toUserId).emit('new_message', message);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  socket.on('disconnect', async () => {
    try {
      const userId = onlineUsers.get(socket.id);
      if (userId) {
        onlineUsers.delete(socket.id);
        socket.broadcast.emit('user_status_changed', { userId, status: 'offline' });
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
