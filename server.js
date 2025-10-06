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
    maxAge: 24 * 60 * 60 * 1000 // 24 часа
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

function validateInputLength(input, maxLength = 1000) {
  if (typeof input === 'string' && input.length > maxLength) {
    return { valid: false, message: `Слишком длинный текст. Максимум ${maxLength} символов` };
  }
  return { valid: true };
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bayrex_usernames (
        id VARCHAR(50) PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        assigned_to VARCHAR(50) REFERENCES users(id),
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

    // Создаем тестовых пользователей если их нет
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

// Middleware для логирования
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Session: ${req.session.userId || 'none'}`);
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
    const giftsCount = await pool.query('SELECT COUNT(*) FROM gifts WHERE deleted = false');
    const promocodesCount = await pool.query('SELECT COUNT(*) FROM promocodes WHERE deleted = false');

    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      users: parseInt(usersCount.rows[0].count),
      messages: parseInt(messagesCount.rows[0].count),
      posts: parseInt(postsCount.rows[0].count),
      gifts: parseInt(giftsCount.rows[0].count),
      promocodes: parseInt(promocodesCount.rows[0].count),
      session: req.session.userId ? 'active' : 'none'
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

    // Санитизация входных данных
    email = sanitizeInput(email?.trim().toLowerCase());
    username = sanitizeInput(username?.trim());
    displayName = sanitizeInput(displayName?.trim());

    if (!email || !username || !displayName || !password) {
      return res.json({ success: false, message: 'Все поля обязательны' });
    }

    // Проверка длины
    const emailValidation = validateInputLength(email, 255);
    const usernameValidation = validateInputLength(username, 50);
    const displayNameValidation = validateInputLength(displayName, 100);
    
    if (!emailValidation.valid) return res.json({ success: false, message: emailValidation.message });
    if (!usernameValidation.valid) return res.json({ success: false, message: usernameValidation.message });
    if (!displayNameValidation.valid) return res.json({ success: false, message: displayNameValidation.message });

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
    const hashedPassword = simpleHash(password);

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

    // Сохраняем пользователя в сессии
    req.session.userId = userId;
    req.session.username = username;
    req.session.save();

    console.log(`✅ Новый пользователь зарегистрирован: ${username} (ID: ${userId})`);

    res.json({ 
      success: true, 
      message: 'Регистрация успешна!', 
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
    const isPasswordValid = simpleHash(password) === userData.password;
    if (!isPasswordValid) {
      return res.json({ success: false, message: 'Неверный email/юзернейм или пароль' });
    }

    // Обновляем статус на онлайн
    await pool.query(
      'UPDATE users SET status = $1 WHERE id = $2',
      ['online', userData.id]
    );

    // Сохраняем пользователя в сессии
    req.session.userId = userData.id;
    req.session.username = userData.username;
    req.session.save();

    console.log(`✅ Пользователь вошел: ${userData.username} (ID: ${userData.id})`);

    res.json({ 
      success: true, 
      message: 'Вход выполнен!', 
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
      `SELECT id, username, display_name, status, verified, is_developer, avatar, description, coins, gifts, used_promocodes, created_at 
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

// Получение пользователя по ID
app.get('/api/user/:id', requireAuth, async (req, res) => {
  try {
    const user = await pool.query(
      `SELECT id, username, display_name, status, verified, is_developer, avatar, description, coins, gifts, used_promocodes, created_at 
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
    console.error('Error getting user:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения пользователя' });
  }
});

// Получение всех пользователей
app.get('/api/users', requireAuth, async (req, res) => {
  try {
    const users = await pool.query(
      'SELECT id, username, display_name as name, status, verified, is_developer, avatar, description, coins FROM users WHERE deleted = false AND id != $1',
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
      `SELECT id, username, display_name as name, avatar, verified, is_developer 
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
        u.avatar,
        u.status,
        u.verified,
        u.is_developer,
        (SELECT text FROM messages WHERE (user_id = $1 AND to_user_id = u.id) OR (user_id = u.id AND to_user_id = $1) ORDER BY timestamp DESC LIMIT 1) as last_message,
        (SELECT COUNT(*) FROM messages WHERE to_user_id = $1 AND user_id = u.id AND read = false) as unread_count
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
    const { senderId, receiverId, text, type = 'text' } = req.body;

    const messageId = Date.now().toString();
    
    const user = await pool.query(
      'SELECT username, display_name, verified, is_developer FROM users WHERE id = $1',
      [senderId]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    const userData = user.rows[0];

    await pool.query(
      `INSERT INTO messages (id, user_id, username, display_name, text, to_user_id, verified, is_developer, type) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [messageId, senderId, userData.username, userData.display_name, 
       sanitizeInput(text), receiverId, userData.verified, 
       userData.is_developer, type]
    );

    res.json({ 
      success: true, 
      message: {
        id: messageId,
        userId: senderId,
        username: userData.username,
        displayName: userData.display_name,
        text: sanitizeInput(text),
        toUserId: receiverId,
        timestamp: new Date().toISOString(),
        verified: userData.verified,
        isDeveloper: userData.is_developer,
        type
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
      SELECT p.*, u.username as user_name, u.display_name as user_display_name, u.avatar as user_avatar, 
             u.verified as user_verified, u.is_developer as user_is_developer
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE u.deleted = false
      ORDER BY p.timestamp DESC
    `);

    res.json(posts.rows.map(post => ({
      id: post.id,
      text: post.text,
      image: post.image,
      likes: post.likes || [],
      comments: post.comments || [],
      views: post.views || 0,
      createdAt: post.timestamp,
      userName: post.user_name,
      userDisplayName: post.user_display_name,
      userAvatar: post.user_avatar,
      userVerified: post.user_verified,
      userIsDeveloper: post.user_is_developer
    })));
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
    const gifts = await pool.query(`
      SELECT * FROM gifts WHERE deleted = false
    `);

    res.json(gifts.rows.map(gift => ({
      id: gift.id,
      name: gift.name,
      price: gift.price,
      image: gift.image,
      type: gift.type,
      preview: gift.image || '🎁'
    })));
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
    const user = await pool.query('SELECT coins, gifts FROM users WHERE id = $1', [userId]);
    
    if (user.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    const userData = user.rows[0];

    // Проверяем баланс
    if (userData.coins < giftData.price) {
      return res.status(400).json({ success: false, message: 'Недостаточно E-COIN' });
    }

    // Обновляем баланс и добавляем подарок
    const newCoins = userData.coins - giftData.price;
    const userGifts = userData.gifts || [];
    userGifts.push({
      id: giftData.id,
      name: giftData.name,
      price: giftData.price,
      purchasedAt: new Date().toISOString()
    });

    await pool.query(
      'UPDATE users SET coins = $1, gifts = $2 WHERE id = $3',
      [newCoins, JSON.stringify(userGifts), userId]
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

// Получение промокодов
app.get('/api/promo-codes', requireAuth, async (req, res) => {
  try {
    const promoCodes = await pool.query(`
      SELECT * FROM promocodes WHERE deleted = false
    `);

    res.json(promoCodes.rows);
  } catch (error) {
    console.error('Error getting promo codes:', error);
    res.status(500).json({ success: false, message: 'Ошибка получения промокодов' });
  }
});

// Создание промокода (только для разработчиков)
app.post('/api/promo-codes', requireAuth, async (req, res) => {
  try {
    const { code, type, value, maxUses = 1 } = req.body;
    const userId = req.session.userId;

    // Проверяем права разработчика
    const user = await pool.query('SELECT is_developer FROM users WHERE id = $1', [userId]);
    
    if (!user.rows[0]?.is_developer) {
      return res.status(403).json({ success: false, message: 'Только разработчики могут создавать промокоды' });
    }

    if (!code || !type || !value) {
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

    // Проверяем, не использовал ли пользователь уже этот промокод
    const usedBy = promoData.used_by || [];
    if (usedBy.includes(userId)) {
      return res.status(400).json({ success: false, message: 'Вы уже использовали этот промокод' });
    }

    // Начисляем монеты
    const user = await pool.query('SELECT coins, used_promocodes FROM users WHERE id = $1', [userId]);
    const userData = user.rows[0];

    const newCoins = userData.coins + promoData.coins;
    const newUsedPromocodes = userData.used_promocodes || [];
    newUsedPromocodes.push(promoData.code);

    // Обновляем баланс пользователя
    await pool.query(
      'UPDATE users SET coins = $1, used_promocodes = $2 WHERE id = $3',
      [newCoins, JSON.stringify(newUsedPromocodes), userId]
    );

    // Обновляем статистику промокода
    usedBy.push(userId);
    await pool.query(
      'UPDATE promocodes SET used_count = $1, used_by = $2 WHERE id = $3',
      [promoData.used_count + 1, JSON.stringify(usedBy), promoData.id]
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
    const giftsCount = await pool.query('SELECT COUNT(*) FROM gifts WHERE deleted = false');
    const promocodesCount = await pool.query('SELECT COUNT(*) FROM promocodes WHERE deleted = false');

    res.json({
      totalUsers: parseInt(usersCount.rows[0].count),
      totalMessages: parseInt(messagesCount.rows[0].count),
      totalPosts: parseInt(postsCount.rows[0].count),
      totalGifts: parseInt(giftsCount.rows[0].count),
      totalPromocodes: parseInt(promocodesCount.rows[0].count)
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
      SELECT id, username, display_name, email, status, verified, is_developer, coins, created_at,
             (SELECT COUNT(*) FROM posts WHERE user_id = users.id) as posts_count
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

      // ЗАЩИТА ОТ ОТПРАВКИ СООБЩЕНИЙ С ЗАПРЕЩЕННЫМИ ID
      const forbiddenIds = ['1759599444816', '1759656247835'];
      if (forbiddenIds.includes(userId) || forbiddenIds.includes(toUserId)) {
        socket.emit('error', { message: 'Отправка сообщений запрещена' });
        return;
      }

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
