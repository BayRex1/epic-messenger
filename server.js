const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');

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
  ssl: {
    rejectUnauthorized: false
  }
});

// Простая система сессий в памяти
const sessions = new Map();

// Middleware для проверки авторизации
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token && sessions.has(token)) {
    req.userId = sessions.get(token);
    next();
  } else {
    res.status(401).json({ success: false, message: 'Требуется авторизация' });
  }
}

// Функции санитизации и валидации
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

function validateEmail(email) {
  const emailRegex = /^[a-z0-9]+@gmail\.com$/;
  const forbiddenWords = ['test', 'user', 'admin', 'temp', 'fake'];
  
  if (!emailRegex.test(email)) {
    return { valid: false, message: 'Только Gmail адреса разрешены (example@gmail.com)' };
  }
  
  const username = email.split('@')[0];
  if (forbiddenWords.some(word => username.includes(word))) {
    return { valid: false, message: 'Email содержит запрещенные слова' };
  }
  
  return { valid: true };
}

function validateUsername(username) {
  const forbiddenChars = ['?', '*', '%', '!', '@', '>', '<'];
  const forbiddenWords = ['admin', 'root', 'system', 'test', 'user'];
  
  if (username.length < 3 || username.length > 20) {
    return { valid: false, message: 'Юзернейм должен быть от 3 до 20 символов' };
  }
  
  if (forbiddenChars.some(char => username.includes(char))) {
    return { valid: false, message: 'Юзернейм содержит запрещенные символы' };
  }
  
  if (forbiddenWords.some(word => username.toLowerCase().includes(word))) {
    return { valid: false, message: 'Юзернейм содержит запрещенные слова' };
  }
  
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { valid: false, message: 'Юзернейм может содержать только буквы, цифры и подчеркивания' };
  }
  
  return { valid: true };
}

// Инициализация базы данных
async function initDatabase() {
  try {
    console.log('🔄 Инициализация базы данных...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        password VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'online',
        verified BOOLEAN DEFAULT false,
        is_developer BOOLEAN DEFAULT false,
        avatar TEXT,
        description TEXT DEFAULT 'Новый пользователь Epic Messenger',
        coins INTEGER DEFAULT 1000,
        gifts JSONB DEFAULT '[]',
        used_promocodes JSONB DEFAULT '[]',
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
        verified BOOLEAN DEFAULT false,
        is_developer BOOLEAN DEFAULT false,
        type VARCHAR(20) DEFAULT 'text',
        file_data TEXT,
        file_name VARCHAR(255),
        file_type VARCHAR(50),
        file_size INTEGER DEFAULT 0,
        gift_id VARCHAR(50),
        gift_name VARCHAR(255),
        gift_price INTEGER,
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
        created_by VARCHAR(50) REFERENCES users(id),
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
        used_by JSONB DEFAULT '[]',
        created_by VARCHAR(50) REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        deleted BOOLEAN DEFAULT false
      )
    `);

    // Создаем тестовые подарки если их нет
    const giftsCount = await pool.query('SELECT COUNT(*) FROM gifts WHERE deleted = false');
    if (parseInt(giftsCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO gifts (id, name, price, image, type, created_by, created_at) VALUES
        ('1', 'Золотая корона', 100, null, 'image', 'system', NOW()),
        ('2', 'Анимация с фейерверком', 50, null, 'gif', 'system', NOW()),
        ('3', 'Волшебный шар', 75, null, 'image', 'system', NOW()),
        ('4', 'Сердце любви', 25, null, 'image', 'system', NOW()),
        ('5', 'Золотая звезда', 150, null, 'image', 'system', NOW())
      `);
    }

    // Создаем тестовых пользователей
    const usersCount = await pool.query('SELECT COUNT(*) FROM users WHERE deleted = false');
    if (parseInt(usersCount.rows[0].count) === 0) {
      const testUsers = [
        {
          id: '1',
          email: 'admin@gmail.com',
          username: 'admin',
          display_name: 'Администратор',
          password: await bcrypt.hash('123', 10),
          verified: true,
          is_developer: true,
          coins: 5000
        },
        {
          id: '2',
          email: 'bayrex@gmail.com',
          username: 'BayRex',
          display_name: 'Разработчик',
          password: await bcrypt.hash('123', 10),
          verified: true,
          is_developer: true,
          coins: 5000
        },
        {
          id: '3',
          email: 'test@gmail.com',
          username: 'testuser',
          display_name: 'Тестовый Пользователь',
          password: await bcrypt.hash('123', 10),
          verified: false,
          is_developer: false,
          coins: 1000
        }
      ];

      for (const user of testUsers) {
        await pool.query(
          `INSERT INTO users (id, email, username, display_name, password, verified, is_developer, coins, gifts, used_promocodes) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [user.id, user.email, user.username, user.display_name, user.password, 
           user.verified, user.is_developer, user.coins, '[]', '[]']
        );
      }
    }

    console.log('✅ База данных инициализирована');
  } catch (error) {
    console.error('❌ Ошибка инициализации базы данных:', error);
  }
}

initDatabase();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

const onlineUsers = new Map();

// Middleware для логирования
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Базовые маршруты
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/main.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'main.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
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
app.get('/api/check-auth', requireAuth, async (req, res) => {
  res.json({ 
    success: true, 
    authenticated: true,
    userId: req.userId 
  });
});

// API routes
app.post('/api/register', async (req, res) => {
  try {
    let { email, username, displayName, password } = req.body;

    // Санитизация входных данных
    email = sanitizeInput(email?.trim().toLowerCase());
    username = sanitizeInput(username?.trim());
    displayName = sanitizeInput(displayName?.trim());

    if (!email || !username || !displayName || !password) {
      return res.json({ success: false, message: 'Все поля обязательны' });
    }

    // Валидация email
    const emailValidationResult = validateEmail(email);
    if (!emailValidationResult.valid) {
      return res.json({ success: false, message: emailValidationResult.message });
    }

    // Валидация username
    const usernameValidationResult = validateUsername(username);
    if (!usernameValidationResult.valid) {
      return res.json({ success: false, message: usernameValidationResult.message });
    }

    // Проверка на существующий username (case insensitive)
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND deleted = false',
      [username]
    );

    if (existingUser.rows.length > 0) {
      return res.json({ success: false, message: 'Юзернейм уже занят' });
    }

    // Проверка на существующий email
    const existingEmail = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND deleted = false',
      [email]
    );

    if (existingEmail.rows.length > 0) {
      return res.json({ success: false, message: 'Email уже занят' });
    }

    // Хеширование пароля
    const hashedPassword = await bcrypt.hash(password, 10);

    const userId = Date.now().toString();

    // Автоматически даем права если username BayRex (case insensitive)
    const isBayRex = username.toLowerCase() === 'bayrex';

    const newUser = {
      id: userId,
      email,
      username,
      display_name: displayName,
      password: hashedPassword,
      verified: isBayRex,
      is_developer: isBayRex,
      coins: 1000,
      gifts: [],
      used_promocodes: []
    };

    await pool.query(
      `INSERT INTO users (id, email, username, display_name, password, verified, is_developer, coins, gifts, used_promocodes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [newUser.id, newUser.email, newUser.username, newUser.display_name, newUser.password, 
       newUser.verified, newUser.is_developer, newUser.coins, JSON.stringify(newUser.gifts), 
       JSON.stringify(newUser.used_promocodes)]
    );

    // Создаем сессию
    const sessionToken = Math.random().toString(36).substring(2);
    sessions.set(sessionToken, userId);

    console.log(`✅ Новый пользователь зарегистрирован: ${username} (ID: ${userId})`);

    res.json({ 
      success: true, 
      message: 'Регистрация успешна!',
      token: sessionToken,
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        displayName: newUser.display_name,
        verified: newUser.verified,
        isDeveloper: newUser.is_developer,
        coins: newUser.coins,
        gifts: newUser.gifts,
        usedPromocodes: newUser.used_promocodes,
        status: 'online',
        avatar: null,
        description: 'Новый пользователь Epic Messenger',
        createdAt: new Date().toISOString()
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

    // Санитизация входных данных
    email = sanitizeInput(email?.trim());
    password = sanitizeInput(password);

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

    // Проверка пароля
    const isPasswordValid = await bcrypt.compare(password, userData.password);
    if (!isPasswordValid) {
      return res.json({ success: false, message: 'Неверный email/юзернейм или пароль' });
    }

    // Обновляем статус на онлайн
    await pool.query(
      'UPDATE users SET status = $1 WHERE id = $2',
      ['online', userData.id]
    );

    // Создаем сессию
    const sessionToken = Math.random().toString(36).substring(2);
    sessions.set(sessionToken, userData.id);

    console.log(`✅ Пользователь вошел: ${userData.username} (ID: ${userData.id})`);

    res.json({ 
      success: true, 
      message: 'Вход выполнен!',
      token: sessionToken,
      user: {
        id: userData.id,
        email: userData.email,
        username: userData.username,
        displayName: userData.display_name,
        status: 'online',
        verified: userData.verified,
        isDeveloper: userData.is_developer,
        avatar: userData.avatar,
        description: userData.description,
        coins: userData.coins,
        gifts: userData.gifts || [],
        usedPromocodes: userData.used_promocodes || [],
        createdAt: userData.created_at
      }
    });
  } catch (error) {
    console.error('Error in login:', error);
    res.json({ success: false, message: 'Ошибка входа' });
  }
});

// Выход
app.post('/api/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    sessions.delete(token);
  }
  res.json({ success: true, message: 'Выход выполнен' });
});

// Получение текущего пользователя
app.get('/api/current-user', requireAuth, async (req, res) => {
  try {
    const user = await pool.query(
      `SELECT id, username, display_name, status, verified, is_developer, avatar, description, coins, gifts, used_promocodes, created_at 
       FROM users WHERE id = $1 AND deleted = false`,
      [req.userId]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Пользователь не найден' });
    }

    const userData = user.rows[0];

    res.json({
      success: true,
      user: {
        id: userData.id,
        username: userData.username,
        displayName: userData.display_name,
        status: userData.status,
        verified: userData.verified,
        isDeveloper: userData.is_developer,
        avatar: userData.avatar,
        description: userData.description,
        coins: userData.coins,
        gifts: userData.gifts || [],
        usedPromocodes: userData.used_promocodes || [],
        createdAt: userData.created_at
      }
    });
  } catch (error) {
    console.error('Error getting current user:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения пользователя' });
  }
});

// Получение всех пользователей
app.get('/api/users', requireAuth, async (req, res) => {
  try {
    const users = await pool.query(
      `SELECT id, username, display_name, status, verified, is_developer, avatar, description, coins, created_at 
       FROM users WHERE deleted = false AND id != $1`,
      [req.userId]
    );

    res.json({
      success: true,
      users: users.rows.map(user => ({
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        status: user.status,
        verified: user.verified,
        isDeveloper: user.is_developer,
        avatar: user.avatar,
        description: user.description,
        coins: user.coins,
        createdAt: user.created_at
      }))
    });
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
      return res.json({ success: true, users: [] });
    }

    const users = await pool.query(
      `SELECT id, username, display_name, status, verified, is_developer, avatar, description, coins
       FROM users 
       WHERE (LOWER(username) LIKE LOWER($1) OR LOWER(display_name) LIKE LOWER($1)) 
       AND deleted = false AND id != $2
       LIMIT 20`,
      [`%${query}%`, req.userId]
    );

    res.json({
      success: true,
      users: users.rows
    });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ success: false, message: 'Ошибка поиска пользователей' });
  }
});

// Получение сообщений
app.get('/api/messages', requireAuth, async (req, res) => {
  try {
    const { userId, toUserId } = req.query;

    const messages = await pool.query(
      `SELECT * FROM messages 
       WHERE ((user_id = $1 AND to_user_id = $2) OR (user_id = $2 AND to_user_id = $1)) 
       AND deleted = false 
       ORDER BY timestamp ASC`,
      [userId, toUserId]
    );

    res.json({
      success: true,
      messages: messages.rows.map(msg => ({
        id: msg.id,
        senderId: msg.user_id,
        receiverId: msg.to_user_id,
        text: msg.text,
        type: msg.type,
        timestamp: msg.timestamp,
        username: msg.username,
        displayName: msg.display_name,
        verified: msg.verified,
        isDeveloper: msg.is_developer,
        fileData: msg.file_data,
        fileName: msg.file_name,
        fileType: msg.file_type,
        fileSize: msg.file_size
      }))
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения сообщений' });
  }
});

// Получение постов
app.get('/api/posts', requireAuth, async (req, res) => {
  try {
    const posts = await pool.query(`
      SELECT p.*, u.username, u.display_name, u.avatar, u.verified, u.is_developer 
      FROM posts p 
      JOIN users u ON p.user_id = u.id 
      ORDER BY p.timestamp DESC
    `);

    res.json({
      success: true,
      posts: posts.rows.map(post => ({
        id: post.id,
        userId: post.user_id,
        text: post.text,
        image: post.image,
        likes: post.likes || [],
        comments: post.comments || [],
        views: post.views || 0,
        createdAt: post.timestamp,
        userName: post.display_name,
        userAvatar: post.avatar,
        userVerified: post.verified,
        userDeveloper: post.is_developer
      }))
    });
  } catch (error) {
    console.error('Error getting posts:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения постов' });
  }
});

// Создание поста
app.post('/api/posts', requireAuth, async (req, res) => {
  try {
    const { text, image } = req.body;
    const userId = req.userId;

    if (!text || text.trim().length === 0) {
      return res.json({ success: false, message: 'Текст поста не может быть пустым' });
    }

    const postId = Date.now().toString();

    await pool.query(
      `INSERT INTO posts (id, user_id, text, image, likes, comments, views) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [postId, userId, sanitizeInput(text.trim()), image, '[]', '[]', 0]
    );

    // Получаем созданный пост с информацией о пользователе
    const newPost = await pool.query(`
      SELECT p.*, u.username, u.display_name, u.avatar, u.verified, u.is_developer 
      FROM posts p 
      JOIN users u ON p.user_id = u.id 
      WHERE p.id = $1
    `, [postId]);

    res.json({
      success: true,
      message: 'Пост создан успешно!',
      post: {
        id: newPost.rows[0].id,
        userId: newPost.rows[0].user_id,
        text: newPost.rows[0].text,
        image: newPost.rows[0].image,
        likes: newPost.rows[0].likes || [],
        comments: newPost.rows[0].comments || [],
        views: newPost.rows[0].views || 0,
        createdAt: newPost.rows[0].timestamp,
        userName: newPost.rows[0].display_name,
        userAvatar: newPost.rows[0].avatar,
        userVerified: newPost.rows[0].verified,
        userDeveloper: newPost.rows[0].is_developer
      }
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ success: false, message: 'Ошибка создания поста' });
  }
});

// Лайк поста
app.post('/api/posts/:postId/like', requireAuth, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId;

    const post = await pool.query('SELECT likes FROM posts WHERE id = $1', [postId]);
    
    if (post.rows.length === 0) {
      return res.json({ success: false, message: 'Пост не найден' });
    }

    let likes = post.rows[0].likes || [];
    
    // Проверяем, лайкал ли уже пользователь
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
      likes: likes.length,
      liked: likeIndex === -1 // true если только что лайкнули, false если убрали лайк
    });
  } catch (error) {
    console.error('Error liking post:', error);
    res.status(500).json({ success: false, message: 'Ошибка при установке лайка' });
  }
});

// Получение подарков
app.get('/api/gifts', requireAuth, async (req, res) => {
  try {
    const gifts = await pool.query(
      'SELECT * FROM gifts WHERE deleted = false ORDER BY price ASC'
    );

    res.json({
      success: true,
      gifts: gifts.rows.map(gift => ({
        id: gift.id,
        name: gift.name,
        price: gift.price,
        image: gift.image,
        type: gift.type,
        preview: gift.type === 'gif' ? '🎆' : '🎁'
      }))
    });
  } catch (error) {
    console.error('Error getting gifts:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения подарков' });
  }
});

// Покупка подарка
app.post('/api/gifts/:giftId/buy', requireAuth, async (req, res) => {
  try {
    const { giftId } = req.params;
    const { toUserId } = req.body;
    const userId = req.userId;

    // Получаем информацию о подарке
    const gift = await pool.query('SELECT * FROM gifts WHERE id = $1 AND deleted = false', [giftId]);
    
    if (gift.rows.length === 0) {
      return res.json({ success: false, message: 'Подарок не найден' });
    }

    const giftData = gift.rows[0];

    // Проверяем баланс пользователя
    const user = await pool.query('SELECT coins, gifts FROM users WHERE id = $1', [userId]);
    const userData = user.rows[0];

    if (userData.coins < giftData.price) {
      return res.json({ success: false, message: 'Недостаточно E-COIN для покупки' });
    }

    // Обновляем баланс пользователя
    const newCoins = userData.coins - giftData.price;
    await pool.query('UPDATE users SET coins = $1 WHERE id = $2', [newCoins, userId]);

    // Добавляем подарок пользователю
    let userGifts = userData.gifts || [];
    userGifts.push({
      giftId: giftData.id,
      giftName: giftData.name,
      giftType: giftData.type,
      purchasedAt: new Date().toISOString(),
      fromUser: userId,
      toUser: toUserId || userId
    });

    await pool.query('UPDATE users SET gifts = $1 WHERE id = $2', [JSON.stringify(userGifts), toUserId || userId]);

    // Создаем сообщение о подарке
    const messageId = Date.now().toString();
    const userInfo = await pool.query('SELECT username, display_name FROM users WHERE id = $1', [userId]);

    await pool.query(
      `INSERT INTO messages (id, user_id, username, display_name, text, to_user_id, type, gift_id, gift_name, gift_price) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [messageId, userId, userInfo.rows[0].username, userInfo.rows[0].display_name, 
       `отправил(а) подарок: ${giftData.name}`, toUserId || userId, 'gift', 
       giftData.id, giftData.name, giftData.price]
    );

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

// Обновление профиля
app.post('/api/update-profile', requireAuth, async (req, res) => {
  try {
    const { displayName, description, avatar } = req.body;
    const userId = req.userId;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (displayName) {
      updates.push(`display_name = $${paramCount}`);
      values.push(sanitizeInput(displayName.trim()));
      paramCount++;
    }

    if (description) {
      updates.push(`description = $${paramCount}`);
      values.push(sanitizeInput(description.trim()));
      paramCount++;
    }

    if (avatar) {
      updates.push(`avatar = $${paramCount}`);
      values.push(avatar);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.json({ success: false, message: 'Нет данных для обновления' });
    }

    values.push(userId);

    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    // Получаем обновленные данные пользователя
    const updatedUser = await pool.query(
      'SELECT id, username, display_name, avatar, description FROM users WHERE id = $1',
      [userId]
    );

    res.json({
      success: true,
      message: 'Профиль обновлен успешно!',
      user: updatedUser.rows[0]
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ success: false, message: 'Ошибка обновления профиля' });
  }
});

// Промокоды
app.get('/api/promo-codes', requireAuth, async (req, res) => {
  try {
    const promoCodes = await pool.query(
      'SELECT * FROM promocodes WHERE deleted = false ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      promoCodes: promoCodes.rows
    });
  } catch (error) {
    console.error('Error getting promo codes:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения промокодов' });
  }
});

app.post('/api/promo-codes/activate', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.userId;

    const promoCode = await pool.query(
      'SELECT * FROM promocodes WHERE code = $1 AND deleted = false',
      [code.toUpperCase()]
    );

    if (promoCode.rows.length === 0) {
      return res.json({ success: false, message: 'Промокод не найден' });
    }

    const promo = promoCode.rows[0];

    // Проверяем лимит использований
    if (promo.max_uses > 0 && promo.used_count >= promo.max_uses) {
      return res.json({ success: false, message: 'Промокод уже использован максимальное количество раз' });
    }

    // Проверяем, использовал ли пользователь уже этот промокод
    const usedBy = promo.used_by || [];
    if (usedBy.includes(userId)) {
      return res.json({ success: false, message: 'Вы уже использовали этот промокод' });
    }

    // Начисляем E-COIN
    const user = await pool.query('SELECT coins FROM users WHERE id = $1', [userId]);
    const newCoins = user.rows[0].coins + promo.coins;

    await pool.query('UPDATE users SET coins = $1 WHERE id = $2', [newCoins, userId]);

    // Обновляем информацию о промокоде
    usedBy.push(userId);
    await pool.query(
      'UPDATE promocodes SET used_count = $1, used_by = $2 WHERE id = $3',
      [promo.used_count + 1, JSON.stringify(usedBy), promo.id]
    );

    res.json({
      success: true,
      message: `Промокод активирован! Получено ${promo.coins} E-COIN`,
      coins: promo.coins,
      newBalance: newCoins
    });
  } catch (error) {
    console.error('Error activating promo code:', error);
    res.status(500).json({ success: false, message: 'Ошибка активации промокода' });
  }
});

// Создание промокода (админ)
app.post('/api/promo-codes', requireAuth, async (req, res) => {
  try {
    const { code, coins, maxUses } = req.body;
    const userId = req.userId;

    // Проверяем права администратора
    const user = await pool.query('SELECT is_developer FROM users WHERE id = $1', [userId]);
    if (!user.rows[0].is_developer) {
      return res.status(403).json({ success: false, message: 'Доступ запрещен' });
    }

    if (!code || !coins) {
      return res.json({ success: false, message: 'Заполните обязательные поля' });
    }

    const promoId = Date.now().toString();

    await pool.query(
      'INSERT INTO promocodes (id, code, coins, max_uses, created_by) VALUES ($1, $2, $3, $4, $5)',
      [promoId, code.toUpperCase(), parseInt(coins), parseInt(maxUses) || 0, userId]
    );

    res.json({
      success: true,
      message: 'Промокод создан успешно!'
    });
  } catch (error) {
    console.error('Error creating promo code:', error);
    res.status(500).json({ success: false, message: 'Ошибка создания промокода' });
  }
});

// Админские функции
app.get('/api/admin/stats', requireAuth, async (req, res) => {
  try {
    const user = await pool.query('SELECT is_developer FROM users WHERE id = $1', [req.userId]);
    
    if (!user.rows[0].is_developer) {
      return res.status(403).json({ success: false, message: 'Доступ запрещен' });
    }

    const usersCount = await pool.query('SELECT COUNT(*) FROM users WHERE deleted = false');
    const messagesCount = await pool.query('SELECT COUNT(*) FROM messages WHERE deleted = false');
    const postsCount = await pool.query('SELECT COUNT(*) FROM posts');
    const giftsCount = await pool.query('SELECT COUNT(*) FROM gifts WHERE deleted = false');
    const promocodesCount = await pool.query('SELECT COUNT(*) FROM promocodes WHERE deleted = false');

    res.json({
      success: true,
      stats: {
        totalUsers: parseInt(usersCount.rows[0].count),
        totalMessages: parseInt(messagesCount.rows[0].count),
        totalPosts: parseInt(postsCount.rows[0].count),
        totalGifts: parseInt(giftsCount.rows[0].count),
        totalPromocodes: parseInt(promocodesCount.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Error getting admin stats:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения статистики' });
  }
});

// Socket.IO соединения
io.on('connection', (socket) => {
  console.log('🔌 Новое подключение:', socket.id);

  socket.on('user_online', async (userId) => {
    try {
      onlineUsers.set(socket.id, userId);
      
      await pool.query(
        'UPDATE users SET status = $1 WHERE id = $2',
        ['online', userId]
      );

      socket.broadcast.emit('user_status_changed', {
        userId,
        status: 'online'
      });
    } catch (error) {
      console.error('Error setting user online:', error);
    }
  });

  socket.on('send_message', async (data) => {
    try {
      const { userId, toUserId, text, type = 'text' } = data;

      const user = await pool.query(
        'SELECT * FROM users WHERE id = $1 AND deleted = false',
        [userId]
      );

      if (user.rows.length === 0) {
        return;
      }

      const userData = user.rows[0];
      const messageId = Date.now().toString();

      await pool.query(
        `INSERT INTO messages (id, user_id, username, display_name, text, to_user_id, verified, is_developer, type) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [messageId, userId, userData.username, userData.display_name, 
         sanitizeInput(text), toUserId, userData.verified, 
         userData.is_developer, type]
      );

      const message = {
        id: messageId,
        userId,
        username: userData.username,
        displayName: userData.display_name,
        text: sanitizeInput(text),
        toUserId,
        timestamp: new Date().toISOString(),
        verified: userData.verified,
        isDeveloper: userData.is_developer,
        type
      };

      // Отправляем сообщение отправителю и получателю
      socket.emit('new_message', message);
      socket.to(toUserId).emit('new_message', message);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  socket.on('user_typing', (data) => {
    socket.to(data.toUserId).emit('user_typing', {
      userId: data.userId,
      isTyping: data.isTyping
    });
  });

  socket.on('disconnect', async () => {
    try {
      const userId = onlineUsers.get(socket.id);
      if (userId) {
        onlineUsers.delete(socket.id);
        
        await pool.query(
          'UPDATE users SET status = $1 WHERE id = $2',
          ['offline', userId]
        );

        socket.broadcast.emit('user_status_changed', {
          userId,
          status: 'offline'
        });
      }
      console.log('🔌 Отключение:', socket.id);
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📊 Панель мониторинга: http://localhost:${PORT}/health`);
});
