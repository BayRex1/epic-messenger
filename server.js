const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { Pool } = require('pg');

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

// Простая функция хеширования пароля (для демонстрации)
function simpleHash(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

// Инициализация базы данных
async function initDatabase() {
  try {
    console.log('🔄 Инициализация базы данных...');

    // Создаем таблицу пользователей
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

    // Создаем таблицу сообщений
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

    // Создаем таблицу постов
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

    // Создаем таблицу подарков
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

    // Создаем таблицу промокодов
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
        ('2', 'Анимация с фейерверком', 50, null, 'gif', 'system', NOW())
      `);
    }

    console.log('✅ База данных инициализирована');
  } catch (error) {
    console.error('❌ Ошибка инициализации базы данных:', error);
  }
}

// Функция для проверки и исправления структуры базы данных
async function checkAndFixDatabase() {
  try {
    console.log('🔍 Проверка структуры базы данных...');

    // Проверяем есть ли колонка views в posts
    const checkViews = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='posts' and column_name='views'
    `);

    if (checkViews.rows.length === 0) {
      console.log('🔄 Добавляем колонку views в таблицу posts...');
      await pool.query('ALTER TABLE posts ADD COLUMN views INTEGER DEFAULT 0');
      console.log('✅ Колонка views добавлена');
    }

    console.log('✅ Структура базы данных проверена');
  } catch (error) {
    console.error('❌ Ошибка проверки базы данных:', error);
  }
}

// Запускаем инициализацию
initDatabase().then(() => {
  checkAndFixDatabase();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

const onlineUsers = new Map();

// Middleware для логирования
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Функции валидации
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

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    "/": '&#x2F;'
  };
  
  const reg = /[&<>"'/]/ig;
  return input.replace(reg, (match) => map[match]);
}

// Базовые маршруты
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/main.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'main.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Health check для Render.com
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
      storage: 'PostgreSQL'
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message });
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

    // Валидация email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return res.json({ success: false, message: emailValidation.message });
    }

    // Валидация username
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return res.json({ success: false, message: usernameValidation.message });
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

app.post('/api/update-profile', async (req, res) => {
  try {
    let { userId, username, displayName, description, status, avatarData } = req.body;

    // Санитизация входных данных
    username = sanitizeInput(username?.trim());
    displayName = sanitizeInput(displayName?.trim());
    description = sanitizeInput(description?.trim());

    if (!userId) {
      return res.json({ success: false, message: 'ID пользователя обязателен' });
    }

    // Получаем текущего пользователя
    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND deleted = false',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.json({ success: false, message: 'Пользователь не найден' });
    }

    const currentUser = userResult.rows[0];

    // Проверяем username на уникальность если он меняется
    if (username && username !== currentUser.username) {
      const usernameValidation = validateUsername(username);
      if (!usernameValidation.valid) {
        return res.json({ success: false, message: usernameValidation.message });
      }

      const existingUser = await pool.query(
        'SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND id != $2 AND deleted = false',
        [username, userId]
      );

      if (existingUser.rows.length > 0) {
        return res.json({ success: false, message: 'Юзернейм уже занят' });
      }
    }

    // Формируем запрос для обновления
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (username) {
      updates.push(`username = $${paramCount}`);
      values.push(username);
      paramCount++;
    }

    if (displayName) {
      updates.push(`display_name = $${paramCount}`);
      values.push(displayName);
      paramCount++;
    }

    if (description !== undefined) {
      updates.push(`description = $${paramCount}`);
      values.push(description);
      paramCount++;
    }

    if (status) {
      updates.push(`status = $${paramCount}`);
      values.push(status);
      paramCount++;
    }

    if (avatarData !== undefined) {
      updates.push(`avatar = $${paramCount}`);
      values.push(avatarData);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.json({ success: false, message: 'Нет данных для обновления' });
    }

    // Добавляем userId в values
    values.push(userId);

    // Выполняем обновление
    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    // Получаем обновленного пользователя
    const updatedUserResult = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND deleted = false',
      [userId]
    );

    const updatedUser = updatedUserResult.rows[0];

    res.json({ 
      success: true, 
      message: 'Профиль обновлен',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        displayName: updatedUser.display_name,
        status: updatedUser.status,
        verified: updatedUser.verified,
        isDeveloper: updatedUser.is_developer,
        avatar: updatedUser.avatar,
        description: updatedUser.description,
        coins: updatedUser.coins,
        gifts: updatedUser.gifts || [],
        usedPromocodes: updatedUser.used_promocodes || [],
        createdAt: updatedUser.created_at
      }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.json({ success: false, message: 'Ошибка при обновлении профиля' });
  }
});

app.get('/api/search-users', async (req, res) => {
  try {
    const { query, currentUserId } = req.query;

    if (!query || !currentUserId) {
      return res.json([]);
    }

    const searchTerm = `%${sanitizeInput(query.toLowerCase().trim())}%`;
    const usersResult = await pool.query(
      `SELECT id, username, display_name, status, verified, is_developer, avatar, description, coins FROM users WHERE 
       id != $1 AND deleted = false AND
       (LOWER(username) LIKE $2 OR
        LOWER(display_name) LIKE $2)`,
      [currentUserId, searchTerm]
    );

    const usersFormatted = usersResult.rows.map(user => ({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      status: user.status,
      verified: user.verified,
      isDeveloper: user.is_developer,
      avatar: user.avatar,
      description: user.description,
      coins: user.coins
    }));

    res.json(usersFormatted);
  } catch (error) {
    console.error('Error searching users:', error);
    res.json([]);
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const { currentUserId } = req.query;
    
    if (!currentUserId) {
      return res.status(400).json({ error: 'Требуется currentUserId' });
    }

    const users = await pool.query(
      `SELECT id, username, display_name, status, verified, is_developer, avatar, description, coins, created_at 
       FROM users WHERE id != $1 AND deleted = false`,
      [currentUserId]
    );

    const usersFormatted = users.rows.map(user => ({
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
    }));

    res.json(usersFormatted);
  } catch (error) {
    console.error('Error getting users:', error);
    res.json([]);
  }
});

app.get('/api/user-chats', async (req, res) => {
  try {
    const { currentUserId } = req.query;

    if (!currentUserId) {
      return res.json([]);
    }

    // Находим пользователей, с которыми есть переписка
    const chatsResult = await pool.query(
      `SELECT DISTINCT u.id, u.username, u.display_name, u.status, u.verified, u.is_developer, u.avatar, u.description, u.coins
       FROM users u
       JOIN messages m ON (u.id = m.user_id OR u.id = m.to_user_id)
       WHERE (m.user_id = $1 OR m.to_user_id = $1) 
       AND u.id != $1 AND u.deleted = false
       AND m.deleted = false`,
      [currentUserId]
    );

    const chatUsers = chatsResult.rows.map(user => ({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      status: user.status,
      verified: user.verified,
      isDeveloper: user.is_developer,
      avatar: user.avatar,
      description: user.description,
      coins: user.coins
    }));

    res.json(chatUsers);
  } catch (error) {
    console.error('Error getting user chats:', error);
    res.json([]);
  }
});

app.get('/api/user/:id', async (req, res) => {
  try {
    const user = await pool.query(
      `SELECT id, username, display_name, status, verified, is_developer, avatar, description, coins, created_at 
       FROM users WHERE id = $1 AND deleted = false`,
      [req.params.id]
    );

    if (user.rows.length === 0) {
      return res.json({ success: false, message: 'Пользователь не найден' });
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
        createdAt: userData.created_at
      }
    });
  } catch (error) {
    console.error('Error getting user:', error);
    res.json({ success: false, message: 'Ошибка получения пользователя' });
  }
});

// Посты API
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await pool.query(`
      SELECT p.*, u.username, u.display_name, u.avatar, u.verified, u.is_developer 
      FROM posts p 
      LEFT JOIN users u ON p.user_id = u.id AND u.deleted = false 
      ORDER BY p.timestamp DESC
    `);

    const postsWithUsers = posts.rows.map(post => ({
      id: post.id,
      userId: post.user_id,
      text: sanitizeInput(post.text),
      image: post.image,
      likes: post.likes || [],
      comments: (post.comments || []).map(comment => ({
        ...comment,
        text: sanitizeInput(comment.text)
      })),
      views: post.views || 0,
      timestamp: post.timestamp,
      user: {
        id: post.user_id,
        username: post.username || 'deleted_user',
        displayName: post.display_name || 'Удаленный пользователь',
        avatar: post.avatar,
        verified: post.verified || false,
        isDeveloper: post.is_developer || false
      }
    }));

    res.json(postsWithUsers);
  } catch (error) {
    console.error('Error getting posts:', error);
    res.json([]);
  }
});

app.post('/api/posts', async (req, res) => {
  try {
    const { userId, text, image } = req.body;

    if (!userId || !text) {
      return res.json({ success: false, message: 'Текст поста обязателен' });
    }

    const user = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND deleted = false',
      [userId]
    );

    if (user.rows.length === 0) {
      return res.json({ success: false, message: 'Пользователь не найден' });
    }

    const userData = user.rows[0];
    const postId = Date.now().toString();

    await pool.query(
      'INSERT INTO posts (id, user_id, text, image, likes, comments, views) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [postId, userId, sanitizeInput(text), image || null, JSON.stringify([]), JSON.stringify([]), 0]
    );

    // Получаем только что созданный пост с информацией о пользователе
    const newPost = await pool.query(`
      SELECT p.*, u.username, u.display_name, u.avatar, u.verified, u.is_developer 
      FROM posts p 
      LEFT JOIN users u ON p.user_id = u.id 
      WHERE p.id = $1
    `, [postId]);

    const postData = newPost.rows[0];

    res.json({ 
      success: true, 
      message: 'Пост опубликован',
      post: {
        id: postData.id,
        userId: postData.user_id,
        text: sanitizeInput(postData.text),
        image: postData.image,
        likes: postData.likes || [],
        comments: postData.comments || [],
        views: postData.views || 0,
        timestamp: postData.timestamp,
        user: {
          id: postData.user_id,
          username: postData.username,
          displayName: postData.display_name,
          avatar: postData.avatar,
          verified: postData.verified,
          isDeveloper: postData.is_developer
        }
      }
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.json({ success: false, message: 'Ошибка создания поста' });
  }
});

app.post('/api/posts/:id/like', async (req, res) => {
  try {
    const { userId } = req.body;
    const postId = req.params.id;

    const post = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
    if (post.rows.length === 0) {
      return res.json({ success: false, message: 'Пост не найден' });
    }

    const postData = post.rows[0];
    const likes = postData.likes || [];
    const likeIndex = likes.indexOf(userId);

    if (likeIndex === -1) {
      likes.push(userId);
    } else {
      likes.splice(likeIndex, 1);
    }

    await pool.query(
      'UPDATE posts SET likes = $1 WHERE id = $2',
      [JSON.stringify(likes), postId]
    );

    res.json({ 
      success: true, 
      likes: likes.length,
      isLiked: likeIndex === -1
    });
  } catch (error) {
    console.error('Error liking post:', error);
    res.json({ success: false, message: 'Ошибка' });
  }
});

app.post('/api/posts/:id/comment', async (req, res) => {
  try {
    const { userId, text } = req.body;
    const postId = req.params.id;

    if (!userId || !text) {
      return res.json({ success: false, message: 'Текст комментария обязателен' });
    }

    const post = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
    if (post.rows.length === 0) {
      return res.json({ success: false, message: 'Пост не найден' });
    }

    const user = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND deleted = false',
      [userId]
    );

    if (user.rows.length === 0) {
      return res.json({ success: false, message: 'Пользователь не найден' });
    }

    const userData = user.rows[0];
    const postData = post.rows[0];
    const comments = postData.comments || [];

    const comment = {
      id: Date.now().toString(),
      userId,
      text: sanitizeInput(text),
      timestamp: new Date().toISOString(),
      user: {
        id: userData.id,
        username: userData.username,
        displayName: userData.display_name,
        avatar: userData.avatar,
        verified: userData.verified,
        isDeveloper: userData.is_developer
      }
    };

    comments.push(comment);

    await pool.query(
      'UPDATE posts SET comments = $1 WHERE id = $2',
      [JSON.stringify(comments), postId]
    );

    res.json({ 
      success: true, 
      message: 'Комментарий добавлен',
      comment: comment
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.json({ success: false, message: 'Ошибка добавления комментария' });
  }
});

app.post('/api/posts/:id/view', async (req, res) => {
  try {
    const postId = req.params.id;

    // Увеличиваем счетчик просмотров
    await pool.query(
      'UPDATE posts SET views = COALESCE(views, 0) + 1 WHERE id = $1',
      [postId]
    );

    // Получаем обновленное количество просмотров
    const post = await pool.query('SELECT views FROM posts WHERE id = $1', [postId]);

    res.json({ 
      success: true, 
      message: 'Просмотр засчитан',
      views: post.rows[0]?.views || 0
    });
  } catch (error) {
    console.error('Error counting view:', error);
    res.json({ success: false, message: 'Ошибка' });
  }
});

app.delete('/api/posts/:id', async (req, res) => {
  try {
    const postId = req.params.id;
    const { userId } = req.body;

    const post = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
    if (post.rows.length === 0) {
      return res.json({ success: false, message: 'Пост не найден' });
    }

    const postData = post.rows[0];
    if (postData.user_id !== userId) {
      return res.json({ success: false, message: 'Вы можете удалять только свои посты' });
    }

    await pool.query('DELETE FROM posts WHERE id = $1', [postId]);

    res.json({ 
      success: true, 
      message: 'Пост удален'
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.json({ success: false, message: 'Ошибка' });
  }
});

// Подарки API
app.get('/api/gifts', async (req, res) => {
  try {
    const gifts = await pool.query('SELECT * FROM gifts WHERE deleted = false');
    res.json(gifts.rows);
  } catch (error) {
    console.error('Error getting gifts:', error);
    res.json([]);
  }
});

app.post('/api/gifts', async (req, res) => {
  try {
    const { userId, name, price, image, type } = req.body;

    if (!userId || !name || !price || !image || !type) {
      return res.json({ success: false, message: 'Все поля обязательны' });
    }

    const user = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND deleted = false',
      [userId]
    );

    if (user.rows.length === 0 || !user.rows[0].is_developer) {
      return res.json({ success: false, message: 'Недостаточно прав' });
    }

    // Проверка типа файла
    const allowedTypes = ['png', 'svg', 'gif', 'webp'];
    const fileType = type.toLowerCase();
    if (!allowedTypes.includes(fileType)) {
      return res.json({ success: false, message: 'Разрешены только PNG, SVG, GIF и WebP файлы' });
    }

    const giftId = Date.now().toString();

    await pool.query(
      'INSERT INTO gifts (id, name, price, image, type, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
      [giftId, sanitizeInput(name), parseInt(price), image, fileType, userId]
    );

    const gift = {
      id: giftId,
      name: sanitizeInput(name),
      price: parseInt(price),
      image,
      type: fileType,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      deleted: false
    };

    res.json({ 
      success: true, 
      message: 'Подарок добавлен в магазин',
      gift
    });
  } catch (error) {
    console.error('Error creating gift:', error);
    res.json({ success: false, message: 'Ошибка' });
  }
});

app.post('/api/gifts/buy', async (req, res) => {
  try {
    const { userId, giftId, toUserId, message } = req.body;

    const user = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND deleted = false',
      [userId]
    );
    const toUser = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND deleted = false',
      [toUserId]
    );
    const gift = await pool.query(
      'SELECT * FROM gifts WHERE id = $1 AND deleted = false',
      [giftId]
    );

    if (user.rows.length === 0 || toUser.rows.length === 0 || gift.rows.length === 0) {
      return res.json({ success: false, message: 'Ошибка покупки подарка' });
    }

    const userData = user.rows[0];
    const toUserData = toUser.rows[0];
    const giftData = gift.rows[0];

    // Обновляем подарки получателя
    const toUserGifts = toUserData.gifts || [];
    toUserGifts.push({
      giftId: giftData.id,
      fromUserId: userId,
      fromUserName: userData.display_name,
      timestamp: new Date().toISOString()
    });

    await pool.query(
      'UPDATE users SET gifts = $1 WHERE id = $2',
      [JSON.stringify(toUserGifts), toUserId]
    );

    // Создаем сообщение о подарке
    const messageId = Date.now().toString();
    await pool.query(
      `INSERT INTO messages (id, user_id, username, display_name, text, to_user_id, verified, is_developer, type, gift_id, gift_name, gift_price) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [messageId, userId, userData.username, userData.display_name, 
       sanitizeInput(message || 'Подарок!'), toUserId, userData.verified, 
       userData.is_developer, 'gift', giftData.id, giftData.name, giftData.price]
    );

    res.json({ 
      success: true, 
      message: 'Подарок отправлен!'
    });
  } catch (error) {
    console.error('Error buying gift:', error);
    res.json({ success: false, message: 'Ошибка' });
  }
});

app.delete('/api/gifts/:id', async (req, res) => {
  try {
    const giftId = req.params.id;
    const { userId } = req.body;

    const user = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND deleted = false',
      [userId]
    );

    if (user.rows.length === 0 || !user.rows[0].is_developer) {
      return res.json({ success: false, message: 'Недостаточно прав' });
    }

    await pool.query(
      'UPDATE gifts SET deleted = true WHERE id = $1',
      [giftId]
    );

    res.json({ 
      success: true, 
      message: 'Подарок удален'
    });
  } catch (error) {
    console.error('Error deleting gift:', error);
    res.json({ success: false, message: 'Ошибка' });
  }
});

// Промокоды API
app.get('/api/promocodes', async (req, res) => {
  try {
    const promocodes = await pool.query('SELECT * FROM promocodes WHERE deleted = false');
    res.json(promocodes.rows);
  } catch (error) {
    console.error('Error getting promocodes:', error);
    res.json([]);
  }
});

app.post('/api/promocodes', async (req, res) => {
  try {
    const { userId, code, coins } = req.body;

    if (!userId || !code || !coins) {
      return res.json({ success: false, message: 'Все поля обязательны' });
    }

    const user = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND deleted = false',
      [userId]
    );

    if (user.rows.length === 0 || !user.rows[0].is_developer) {
      return res.json({ success: false, message: 'Недостаточно прав' });
    }

    // Проверяем на существующий промокод
    const existingPromo = await pool.query(
      'SELECT * FROM promocodes WHERE LOWER(code) = LOWER($1) AND deleted = false',
      [code]
    );

    if (existingPromo.rows.length > 0) {
      return res.json({ success: false, message: 'Промокод уже существует' });
    }

    const promocodeId = Date.now().toString();

    await pool.query(
      'INSERT INTO promocodes (id, code, coins, max_uses, used_count, used_by, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [promocodeId, sanitizeInput(code.toUpperCase()), parseInt(coins), 1, 0, JSON.stringify([]), userId]
    );

    const promocode = {
      id: promocodeId,
      code: sanitizeInput(code.toUpperCase()),
      coins: parseInt(coins),
      maxUses: 1,
      usedCount: 0,
      usedBy: [],
      createdBy: userId,
      createdAt: new Date().toISOString(),
      deleted: false
    };

    res.json({ 
      success: true, 
      message: 'Промокод создан',
      promocode
    });
  } catch (error) {
    console.error('Error creating promocode:', error);
    res.json({ success: false, message: 'Ошибка' });
  }
});

app.post('/api/promocodes/use', async (req, res) => {
  try {
    const { userId, code } = req.body;

    if (!userId || !code) {
      return res.json({ success: false, message: 'Все поля обязательны' });
    }

    const user = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND deleted = false',
      [userId]
    );

    if (user.rows.length === 0) {
      return res.json({ success: false, message: 'Пользователь не найден' });
    }

    const userData = user.rows[0];
    const promocode = await pool.query(
      'SELECT * FROM promocodes WHERE LOWER(code) = LOWER($1) AND deleted = false',
      [code]
    );

    if (promocode.rows.length === 0) {
      return res.json({ success: false, message: 'Промокод не найден' });
    }

    const promocodeData = promocode.rows[0];

    // Проверяем использовал ли уже пользователь этот промокод
    const usedPromocodes = userData.used_promocodes || [];
    if (usedPromocodes.includes(promocodeData.code)) {
      return res.json({ success: false, message: 'Вы уже использовали этот промокод' });
    }

    // Проверяем лимит использования
    if (promocodeData.used_count >= promocodeData.max_uses) {
      return res.json({ success: false, message: 'Промокод уже использован' });
    }

    // Обновляем данные промокода
    const usedBy = promocodeData.used_by || [];
    usedBy.push({
      userId,
      username: userData.username,
      timestamp: new Date().toISOString()
    });

    await pool.query(
      'UPDATE promocodes SET used_count = $1, used_by = $2 WHERE id = $3',
      [promocodeData.used_count + 1, JSON.stringify(usedBy), promocodeData.id]
    );

    // Обновляем данные пользователя
    usedPromocodes.push(promocodeData.code);
    const newCoins = (userData.coins || 0) + promocodeData.coins;

    await pool.query(
      'UPDATE users SET coins = $1, used_promocodes = $2 WHERE id = $3',
      [newCoins, JSON.stringify(usedPromocodes), userId]
    );

    res.json({ 
      success: true, 
      message: `Промокод активирован! Получено ${promocodeData.coins} монет`,
      coins: newCoins
    });
  } catch (error) {
    console.error('Error using promocode:', error);
    res.json({ success: false, message: 'Ошибка' });
  }
});

app.delete('/api/promocodes/:id', async (req, res) => {
  try {
    const promocodeId = req.params.id;
    const { userId } = req.body;

    const user = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND deleted = false',
      [userId]
    );

    if (user.rows.length === 0 || !user.rows[0].is_developer) {
      return res.json({ success: false, message: 'Недостаточно прав' });
    }

    await pool.query(
      'UPDATE promocodes SET deleted = true WHERE id = $1',
      [promocodeId]
    );

    res.json({ 
      success: true, 
      message: 'Промокод удален'
    });
  } catch (error) {
    console.error('Error deleting promocode:', error);
    res.json({ success: false, message: 'Ошибка' });
  }
});

// Сообщения API
app.get('/api/messages', async (req, res) => {
  try {
    const { userId, toUserId } = req.query;

    if (!userId || !toUserId) {
      return res.json([]);
    }

    const messages = await pool.query(`
      SELECT m.*, u.verified, u.is_developer 
      FROM messages m 
      LEFT JOIN users u ON m.user_id = u.id AND u.deleted = false 
      WHERE m.deleted = false AND 
      ((m.user_id = $1 AND m.to_user_id = $2) OR 
       (m.user_id = $2 AND m.to_user_id = $1)) 
      ORDER BY m.timestamp ASC
    `, [userId, toUserId]);

    const messagesFormatted = messages.rows.map(msg => ({
      id: msg.id,
      userId: msg.user_id,
      username: msg.username,
      displayName: msg.display_name,
      text: msg.text,
      toUserId: msg.to_user_id,
      timestamp: msg.timestamp,
      verified: msg.verified,
      isDeveloper: msg.is_developer,
      type: msg.type || 'text',
      fileData: msg.file_data,
      fileName: msg.file_name,
      fileType: msg.file_type,
      fileSize: msg.file_size,
      giftId: msg.gift_id,
      giftName: msg.gift_name,
      giftPrice: msg.gift_price
    }));

    res.json(messagesFormatted);
  } catch (error) {
    console.error('Error getting messages:', error);
    res.json([]);
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
      const { userId, toUserId, text, type = 'text', fileData, fileName, fileType, fileSize } = data;

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
        `INSERT INTO messages (id, user_id, username, display_name, text, to_user_id, verified, is_developer, type, file_data, file_name, file_type, file_size) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [messageId, userId, userData.username, userData.display_name, 
         sanitizeInput(text), toUserId, userData.verified, 
         userData.is_developer, type, fileData, fileName, fileType, fileSize]
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
        type,
        fileData,
        fileName,
        fileType,
        fileSize
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
