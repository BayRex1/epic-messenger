const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
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

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

// Инициализация базы данных
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('✅ Connected to SQLite database');
    initDatabase();
  }
});

// Инициализация таблиц
function initDatabase() {
  // Пользователи
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    status TEXT DEFAULT 'online',
    verified INTEGER DEFAULT 0,
    is_developer INTEGER DEFAULT 0,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Сообщения
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    file_name TEXT,
    file_data TEXT,
    file_type TEXT,
    file_size INTEGER,
    verified INTEGER DEFAULT 0,
    is_developer INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Настройки пользователей
  db.run(`CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    theme TEXT DEFAULT 'dark',
    notifications INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Создаем админа (только если нет пользователей)
  db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
    if (row.count === 0) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      db.run(`INSERT INTO users (id, email, username, password, verified, is_developer) 
              VALUES (?, ?, ?, ?, ?, ?)`, 
        ['admin', 'admin@epic.com', 'Admin', hashedPassword, 1, 1]);
      console.log('👑 Created admin user: admin@epic.com / admin123');
    }
  });
}

// API routes

// Регистрация
app.post('/api/register', (req, res) => {
  const { email, username, password } = req.body;
  
  if (!email || !username || !password) {
    return res.json({ success: false, message: 'Все поля обязательны' });
  }
  
  if (password.length < 3) {
    return res.json({ success: false, message: 'Пароль слишком короткий' });
  }
  
  // Проверяем существование пользователя
  db.get("SELECT * FROM users WHERE email = ? OR username = ?", [email, username], (err, row) => {
    if (err) {
      return res.json({ success: false, message: 'Ошибка базы данных' });
    }
    
    if (row) {
      const message = row.email === email ? 'Email уже занят' : 'Имя пользователя уже занято';
      return res.json({ success: false, message });
    }
    
    // Создаем нового пользователя
    const userId = Date.now().toString();
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    db.run(`INSERT INTO users (id, email, username, password) VALUES (?, ?, ?, ?)`,
      [userId, email, username, hashedPassword],
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
            email: email,
            verified: false,
            isDeveloper: false,
            avatar: null,
            status: 'online'
          } 
        });
      }
    );
  });
});

// Вход
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
    if (err || !user) {
      return res.json({ success: false, message: 'Неверный email или пароль' });
    }
    
    if (!bcrypt.compareSync(password, user.password)) {
      return res.json({ success: false, message: 'Неверный email или пароль' });
    }
    
    // Обновляем статус
    db.run("UPDATE users SET status = 'online' WHERE id = ?", [user.id]);
    
    res.json({ 
      success: true, 
      message: 'Вход выполнен!', 
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email,
        verified: !!user.verified,
        isDeveloper: !!user.is_developer,
        status: 'online',
        avatar: user.avatar
      } 
    });
  });
});

// Обновление профиля
app.post('/api/update-profile', (req, res) => {
  const { userId, username, status, avatarData } = req.body;
  
  if (!userId) {
    return res.json({ success: false, message: 'ID пользователя обязателен' });
  }
  
  // Проверяем уникальность имени пользователя
  db.get("SELECT id FROM users WHERE username = ? AND id != ?", [username, userId], (err, row) => {
    if (err) {
      return res.json({ success: false, message: 'Ошибка базы данных' });
    }
    
    if (row) {
      return res.json({ success: false, message: 'Имя пользователя уже занято' });
    }
    
    // Обновляем профиль
    const updates = [];
    const params = [];
    
    if (username) {
      updates.push("username = ?");
      params.push(username);
    }
    
    if (status) {
      updates.push("status = ?");
      params.push(status);
    }
    
    if (avatarData) {
      updates.push("avatar = ?");
      params.push(avatarData);
    }
    
    params.push(userId);
    
    if (updates.length > 0) {
      db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
        if (err) {
          return res.json({ success: false, message: 'Ошибка обновления профиля' });
        }
        
        // Получаем обновленные данные пользователя
        db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
          if (err || !user) {
            return res.json({ success: false, message: 'Ошибка загрузки данных' });
          }
          
          res.json({ 
            success: true, 
            message: 'Профиль обновлен',
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
              verified: !!user.verified,
              isDeveloper: !!user.is_developer,
              status: user.status,
              avatar: user.avatar
            }
          });
          
          // Уведомляем всех об обновлении
          io.emit('user_updated', {
            userId: user.id,
            username: user.username,
            status: user.status,
            avatar: user.avatar
          });
        });
      });
    } else {
      res.json({ success: false, message: 'Нет данных для обновления' });
    }
  });
});

// Поиск пользователей
app.get('/api/search-users', (req, res) => {
  const { query, currentUserId } = req.query;
  
  if (!query || !currentUserId) {
    return res.json([]);
  }
  
  const searchTerm = `%${query}%`;
  
  db.all(
    `SELECT id, username, email, verified, is_developer, status, avatar 
     FROM users 
     WHERE id != ? AND (username LIKE ? OR email LIKE ?)
     ORDER BY username`,
    [currentUserId, searchTerm, searchTerm],
    (err, rows) => {
      if (err) {
        console.error('Search error:', err);
        return res.json([]);
      }
      
      const users = rows.map(row => ({
        id: row.id,
        username: row.username,
        email: row.email,
        verified: !!row.verified,
        isDeveloper: !!row.is_developer,
        status: row.status,
        avatar: row.avatar
      }));
      
      res.json(users);
    }
  );
});

// Получение всех пользователей
app.get('/api/users', (req, res) => {
  const { currentUserId } = req.query;
  
  db.all(
    `SELECT id, username, email, verified, is_developer, status, avatar, created_at 
     FROM users 
     WHERE id != ? 
     ORDER BY username`,
    [currentUserId],
    (err, rows) => {
      if (err) {
        console.error('Users error:', err);
        return res.json([]);
      }
      
      const users = rows.map(row => ({
        id: row.id,
        username: row.username,
        email: row.email,
        verified: !!row.verified,
        isDeveloper: !!row.is_developer,
        status: row.status,
        avatar: row.avatar,
        createdAt: row.created_at
      }));
      
      res.json(users);
    }
  );
});

// Получение пользователя по ID
app.get('/api/user/:id', (req, res) => {
  db.get(
    `SELECT id, username, email, verified, is_developer, status, avatar, created_at 
     FROM users 
     WHERE id = ?`,
    [req.params.id],
    (err, row) => {
      if (err || !row) {
        return res.json({ success: false, message: 'Пользователь не найден' });
      }
      
      res.json({
        success: true,
        user: {
          id: row.id,
          username: row.username,
          verified: !!row.verified,
          isDeveloper: !!row.is_developer,
          status: row.status,
          avatar: row.avatar,
          createdAt: row.created_at
        }
      });
    }
  );
});

// Сохранение настроек
app.post('/api/save-settings', (req, res) => {
  const { userId, theme, notifications } = req.body;
  
  if (!userId) {
    return res.json({ success: false, message: 'ID пользователя обязателен' });
  }
  
  db.run(
    `INSERT OR REPLACE INTO user_settings (user_id, theme, notifications) 
     VALUES (?, ?, ?)`,
    [userId, theme, notifications ? 1 : 0],
    (err) => {
      if (err) {
        return res.json({ success: false, message: 'Ошибка сохранения настроек' });
      }
      
      res.json({ success: true, message: 'Настройки сохранены' });
    }
  );
});

// Получение настроек
app.get('/api/settings/:userId', (req, res) => {
  db.get(
    "SELECT theme, notifications FROM user_settings WHERE user_id = ?",
    [req.params.userId],
    (err, row) => {
      const settings = row ? {
        theme: row.theme || 'dark',
        notifications: !!row.notifications
      } : {
        theme: 'dark',
        notifications: true
      };
      
      res.json({ success: true, settings });
    }
  );
});

// Админка - получение всех пользователей
app.get('/api/admin/users', (req, res) => {
  db.all(
    "SELECT id, username, email, verified, is_developer, status, avatar, created_at FROM users",
    (err, rows) => {
      if (err) {
        return res.json([]);
      }
      
      const users = rows.map(row => ({
        id: row.id,
        username: row.username,
        email: row.email,
        verified: !!row.verified,
        isDeveloper: !!row.is_developer,
        status: row.status,
        avatar: row.avatar,
        createdAt: row.created_at
      }));
      
      res.json(users);
    }
  );
});

// Верификация пользователя
app.post('/api/admin/toggle-verify', (req, res) => {
  const { userId, verified } = req.body;
  
  db.run(
    "UPDATE users SET verified = ? WHERE id = ?",
    [verified ? 1 : 0, userId],
    function(err) {
      if (err) {
        return res.json({ success: false, message: 'Ошибка обновления' });
      }
      
      res.json({ 
        success: true, 
        message: `Аккаунт ${verified ? 'верифицирован' : 'деверифицирован'}` 
      });
      
      io.emit('user_verified', { userId, verified });
    }
  );
});

// Назначение разработчика
app.post('/api/admin/toggle-developer', (req, res) => {
  const { userId, isDeveloper } = req.body;
  
  db.run(
    "UPDATE users SET is_developer = ? WHERE id = ?",
    [isDeveloper ? 1 : 0, userId],
    function(err) {
      if (err) {
        return res.json({ success: false, message: 'Ошибка обновления' });
      }
      
      res.json({ 
        success: true, 
        message: `Роль разработчика ${isDeveloper ? 'назначена' : 'снята'}` 
      });
      
      io.emit('user_developer_updated', { userId, isDeveloper });
    }
  );
});

// Получение эмодзи (пустой массив - убрали эмодзи)
app.get('/api/emojis', (req, res) => {
  res.json({ success: true, emojis: [] });
});

// WebSocket соединения
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  socket.on('user_join', (userData) => {
    const onlineUser = {
      socketId: socket.id,
      username: userData.username,
      userId: userData.userId,
      status: 'online'
    };
    
    onlineUsers.set(socket.id, onlineUser);
    
    // Обновляем статус в базе
    db.run("UPDATE users SET status = 'online' WHERE id = ?", [userData.userId]);
    
    socket.broadcast.emit('user_online', onlineUser);
    io.emit('online_users', Array.from(onlineUsers.values()));
  });

  // Загрузка истории чата
  socket.on('load_chat_history', (data) => {
    db.all(
      `SELECT * FROM messages 
       WHERE (user_id = ? AND to_user_id = ?) OR (user_id = ? AND to_user_id = ?)
       ORDER BY timestamp ASC`,
      [data.userId, data.targetId, data.targetId, data.userId],
      (err, rows) => {
        if (err) {
          console.error('Chat history error:', err);
          return;
        }
        
        const messages = rows.map(row => ({
          id: row.id,
          userId: row.user_id,
          username: row.username,
          text: row.text,
          toUserId: row.to_user_id,
          timestamp: row.timestamp,
          verified: !!row.verified,
          isDeveloper: !!row.is_developer,
          type: row.type,
          fileData: row.file_data,
          fileName: row.file_name,
          fileType: row.file_type,
          fileSize: row.file_size
        }));
        
        socket.emit('chat_history_loaded', { targetId: data.targetId, messages });
      }
    );
  });

  // Отправка сообщения
  socket.on('send_message', (messageData) => {
    const onlineUser = onlineUsers.get(socket.id);
    if (!onlineUser) return;
    
    // Получаем данные пользователя
    db.get("SELECT verified, is_developer FROM users WHERE id = ?", [onlineUser.userId], (err, user) => {
      if (err || !user) return;
      
      const messageId = Date.now().toString();
      const message = {
        id: messageId,
        userId: onlineUser.userId,
        username: onlineUser.username,
        text: messageData.text,
        toUserId: messageData.toUserId,
        timestamp: new Date().toISOString(),
        verified: !!user.verified,
        isDeveloper: !!user.is_developer,
        type: messageData.type || 'text',
        fileData: messageData.fileData || null,
        fileName: messageData.fileName || null,
        fileType: messageData.fileType || null,
        fileSize: messageData.fileSize || 0
      };
      
      // Сохраняем в базу
      db.run(
        `INSERT INTO messages (id, user_id, username, to_user_id, text, type, file_name, file_data, file_type, file_size, verified, is_developer) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [message.id, message.userId, message.username, message.toUserId, message.text, 
         message.type, message.fileName, message.fileData, message.fileType, message.fileSize,
         message.verified ? 1 : 0, message.isDeveloper ? 1 : 0],
        (err) => {
          if (err) {
            console.error('Error saving message:', err);
            return;
          }
          
          console.log('💬 Сообщение сохранено в базе от', message.username, 'к', message.toUserId);
          
          // Отправляем отправителю
          socket.emit('new_message', message);
          
          // Отправляем получателю если онлайн
          const recipientEntry = Array.from(onlineUsers.entries())
            .find(([_, u]) => u.userId === messageData.toUserId);
          
          if (recipientEntry) {
            const [recipientSocketId, recipientUser] = recipientEntry;
            io.to(recipientSocketId).emit('new_message', message);
            console.log('📨 Сообщение доставлено пользователю:', recipientUser.username);
          }
        }
      );
    });
  });

  socket.on('disconnect', () => {
    const onlineUser = onlineUsers.get(socket.id);
    if (onlineUser) {
      // Обновляем статус в базе
      db.run("UPDATE users SET status = 'offline' WHERE id = ?", [onlineUser.userId]);
      
      onlineUsers.delete(socket.id);
      socket.broadcast.emit('user_offline', onlineUser.userId);
      io.emit('online_users', Array.from(onlineUsers.values()));
      
      console.log('👋 User disconnected:', onlineUser.username);
    }
  });
});

// Статические файлы
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/main.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'main.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Запуск сервера
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('=====================================');
  console.log('🚀 EPIC MESSENGER SERVER STARTED!');
  console.log('📡 Port:', PORT);
  console.log('💾 Database: SQLite (Persistent)');
  console.log('🔐 Authentication: ENABLED');
  console.log('✅ Verified system: ACTIVE');
  console.log('👨‍💻 Developer badges: ENABLED');
  console.log('🖼️ Avatar upload: ENABLED');
  console.log('📁 File sharing: ENABLED');
  console.log('🔍 User search: ENABLED');
  console.log('😊 Emoji keyboard: DISABLED');
  console.log('🔧 Admin panel: /admin.html');
  console.log('🔑 Admin: admin@epic.com / admin123');
  console.log('=====================================');
});