const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Упрощаем CORS настройки для Render.com
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.static(__dirname));

// Используем файловую базу данных вместо памяти
const db = new sqlite3.Database('epic_messenger.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('✅ Connected to SQLite database');
    initializeDatabase();
  }
});

// Инициализация таблиц
function initializeDatabase() {
  db.serialize(() => {
    // Таблица пользователей
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      username TEXT UNIQUE,
      displayName TEXT,
      password TEXT,
      status TEXT DEFAULT 'online',
      verified INTEGER DEFAULT 0,
      isDeveloper INTEGER DEFAULT 0,
      avatar TEXT,
      description TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица сообщений
    db.run(`CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      userId TEXT,
      username TEXT,
      displayName TEXT,
      text TEXT,
      toUserId TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      verified INTEGER DEFAULT 0,
      isDeveloper INTEGER DEFAULT 0,
      type TEXT DEFAULT 'text',
      fileData TEXT,
      fileName TEXT,
      fileType TEXT,
      fileSize INTEGER DEFAULT 0,
      FOREIGN KEY (userId) REFERENCES users (id)
    )`);

    // Таблица постов
    db.run(`CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      userId TEXT,
      text TEXT,
      image TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users (id)
    )`);

    // Таблица лайков постов
    db.run(`CREATE TABLE IF NOT EXISTS post_likes (
      id TEXT PRIMARY KEY,
      postId TEXT,
      userId TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (postId) REFERENCES posts (id),
      FOREIGN KEY (userId) REFERENCES users (id),
      UNIQUE(postId, userId)
    )`);

    // Таблица комментариев
    db.run(`CREATE TABLE IF NOT EXISTS post_comments (
      id TEXT PRIMARY KEY,
      postId TEXT,
      userId TEXT,
      text TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (postId) REFERENCES posts (id),
      FOREIGN KEY (userId) REFERENCES users (id)
    )`);

    // Создаем тестовых пользователей
    createTestUsers();
  });
}

function createTestUsers() {
  const testUsers = [
    {
      id: '1',
      email: 'admin@epic.com',
      username: 'admin',
      displayName: 'Администратор',
      password: '123',
      status: 'online',
      verified: 1,
      isDeveloper: 1,
      avatar: null,
      description: 'Главный администратор системы'
    },
    {
      id: '2',
      email: 'bayrex@epic.com',
      username: 'BayRex',
      displayName: 'BayRex',
      password: '123',
      status: 'online',
      verified: 1,
      isDeveloper: 1,
      avatar: null,
      description: 'Разработчик Epic Messenger'
    },
    {
      id: '3',
      email: 'test@mail.ru',
      username: 'testuser',
      displayName: 'Тестовый Пользователь',
      password: '123',
      status: 'online',
      verified: 0,
      isDeveloper: 0,
      avatar: null,
      description: 'Обычный пользователь'
    }
  ];

  testUsers.forEach(user => {
    db.get('SELECT id FROM users WHERE id = ?', [user.id], (err, row) => {
      if (err) {
        console.error('Error checking user:', err);
        return;
      }
      
      if (!row) {
        db.run(
          `INSERT INTO users (id, email, username, displayName, password, status, verified, isDeveloper, avatar, description) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [user.id, user.email, user.username, user.displayName, user.password, user.status, 
           user.verified, user.isDeveloper, user.avatar, user.description],
          (err) => {
            if (err) {
              console.error('Error creating test user:', err);
            } else {
              console.log('👑 Created test user:', user.username);
            }
          }
        );
      }
    });
  });
}

const onlineUsers = new Map();

// Middleware для логирования
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

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
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'SQLite'
  });
});

// API routes
app.post('/api/register', (req, res) => {
  const { email, username, displayName, password } = req.body;
  
  if (!email || !username || !displayName || !password) {
    return res.json({ success: false, message: 'Все поля обязательны' });
  }
  
  db.get('SELECT id FROM users WHERE email = ? OR username = ?', [email, username], (err, row) => {
    if (err) {
      return res.json({ success: false, message: 'Ошибка базы данных' });
    }
    
    if (row) {
      return res.json({ success: false, message: 'Email или юзернейм уже занят' });
    }
    
    const userId = Date.now().toString();
    
    db.run(
      `INSERT INTO users (id, email, username, displayName, password, description) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, email, username, displayName, password, 'Новый пользователь Epic Messenger'],
      function(err) {
        if (err) {
          return res.json({ success: false, message: 'Ошибка регистрации' });
        }
        
        res.json({ 
          success: true, 
          message: 'Регистрация успешна!', 
          user: { 
            id: userId, 
            username: username,
            displayName: displayName,
            email: email,
            verified: false,
            isDeveloper: false,
            avatar: null,
            status: 'online',
            description: 'Новый пользователь Epic Messenger'
          } 
        });
      }
    );
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  db.get(
    'SELECT * FROM users WHERE (email = ? OR username = ?) AND password = ?',
    [email, email, password],
    (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.json({ success: false, message: 'Ошибка базы данных' });
      }
      
      if (!user) {
        return res.json({ success: false, message: 'Неверный email/юзернейм или пароль' });
      }
      
      // Обновляем статус пользователя
      db.run('UPDATE users SET status = ? WHERE id = ?', ['online', user.id]);
      
      res.json({ 
        success: true, 
        message: 'Вход выполнен!', 
        user: { 
          id: user.id, 
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          verified: Boolean(user.verified),
          isDeveloper: Boolean(user.isDeveloper),
          status: 'online',
          avatar: user.avatar,
          description: user.description
        } 
      });
    }
  );
});

// WebSocket соединения
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  socket.on('user_join', (userData) => {
    const userId = userData.userId;
    
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
      if (err || !user) {
        console.log('❌ User not found:', userId);
        return;
      }
      
      // Обновляем статус пользователя
      db.run('UPDATE users SET status = ? WHERE id = ?', ['online', userId]);
      
      const onlineUser = {
        socketId: socket.id,
        username: user.username,
        displayName: user.displayName,
        userId: userId,
        status: 'online',
        verified: Boolean(user.verified),
        isDeveloper: Boolean(user.isDeveloper),
        avatar: user.avatar
      };
      
      onlineUsers.set(socket.id, onlineUser);
      
      console.log('👋 User joined:', user.displayName);
    });
  });

  socket.on('load_chat_history', (data) => {
    const { userId, targetId } = data;
    
    db.all(
      `SELECT * FROM messages 
       WHERE (userId = ? AND toUserId = ?) OR (userId = ? AND toUserId = ?)
       ORDER BY timestamp ASC`,
      [userId, targetId, targetId, userId],
      (err, messages) => {
        if (err) {
          console.error('Chat history error:', err);
          return;
        }
        
        socket.emit('chat_history_loaded', { 
          targetId: targetId, 
          messages: messages.map(msg => ({
            ...msg,
            verified: Boolean(msg.verified),
            isDeveloper: Boolean(msg.isDeveloper)
          }))
        });
      }
    );
  });

  socket.on('send_message', (messageData) => {
    const onlineUser = onlineUsers.get(socket.id);
    if (!onlineUser) {
      console.log('❌ Online user not found for socket:', socket.id);
      return;
    }
    
    const messageId = Date.now().toString();
    const message = {
      id: messageId,
      userId: onlineUser.userId,
      username: onlineUser.username,
      displayName: onlineUser.displayName,
      text: messageData.text,
      toUserId: messageData.toUserId,
      timestamp: new Date().toISOString(),
      verified: onlineUser.verified,
      isDeveloper: onlineUser.isDeveloper,
      type: messageData.type || 'text',
      fileData: messageData.fileData || null,
      fileName: messageData.fileName || null,
      fileType: messageData.fileType || null,
      fileSize: messageData.fileSize || 0
    };
    
    db.run(
      `INSERT INTO messages (id, userId, username, displayName, text, toUserId, timestamp, 
       verified, isDeveloper, type, fileData, fileName, fileType, fileSize) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [message.id, message.userId, message.username, message.displayName, message.text, 
       message.toUserId, message.timestamp, message.verified ? 1 : 0, 
       message.isDeveloper ? 1 : 0, message.type, message.fileData, 
       message.fileName, message.fileType, message.fileSize],
      (err) => {
        if (err) {
          console.error('Error saving message:', err);
          return;
        }
        
        console.log('💬 Сохранено сообщение от', message.displayName, 'к', messageData.toUserId);
        
        // Отправляем сообщение отправителю
        socket.emit('new_message', message);
        
        // Отправляем сообщение получателю если он онлайн
        const recipientEntry = Array.from(onlineUsers.entries())
          .find(([_, u]) => u.userId === messageData.toUserId);
        
        if (recipientEntry) {
          const [recipientSocketId, recipientUser] = recipientEntry;
          io.to(recipientSocketId).emit('new_message', message);
          console.log('📨 Сообщение доставлено пользователю:', recipientUser.displayName);
        }
      }
    );
  });

  socket.on('disconnect', () => {
    const onlineUser = onlineUsers.get(socket.id);
    if (onlineUser) {
      db.run('UPDATE users SET status = ? WHERE id = ?', ['offline', onlineUser.userId]);
      
      onlineUsers.delete(socket.id);
      
      console.log('👋 User disconnected:', onlineUser.displayName);
    }
  });
});

// Обработка ошибок
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Запуск сервера
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log('=====================================');
  console.log('🚀 EPIC MESSENGER SERVER STARTED!');
  console.log('📡 Port:', PORT);
  console.log('🌐 Environment:', process.env.NODE_ENV || 'development');
  console.log('💾 Storage: SQLite Database');
  console.log('🔐 Authentication: ENABLED');
  console.log('=====================================');
});
