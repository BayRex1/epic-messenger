const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: ["https://epic-messenger.onrender.com", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors({
  origin: ["https://epic-messenger.onrender.com", "http://localhost:3000"],
  credentials: true
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.static(__dirname));

// Инициализация базы данных
const db = new sqlite3.Database(':memory:', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('✅ Connected to SQLite database');
    initializeDatabase();
  }
});

// Инициализация таблиц
function initializeDatabase() {
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

// API routes
app.post('/api/register', (req, res) => {
  const { email, username, displayName, password } = req.body;
  
  if (!email || !username || !displayName || !password) {
    return res.json({ success: false, message: 'Все поля обязательны' });
  }
  
  // Проверяем существование пользователя
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
  
  console.log('Login attempt:', { email, passwordLength: password?.length });
  
  db.get(
    'SELECT * FROM users WHERE (email = ? OR username = ?) AND password = ?',
    [email, email, password],
    (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.json({ success: false, message: 'Ошибка базы данных' });
      }
      
      if (!user) {
        console.log('Login failed: user not found or wrong password');
        return res.json({ success: false, message: 'Неверный email/юзернейм или пароль' });
      }
      
      // Обновляем статус пользователя
      db.run('UPDATE users SET status = ? WHERE id = ?', ['online', user.id]);
      
      console.log('Login successful:', user.username);
      
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

app.post('/api/update-profile', (req, res) => {
  const { userId, username, displayName, description, status, avatarData } = req.body;
  
  if (!userId) {
    return res.json({ success: false, message: 'ID пользователя обязателен' });
  }
  
  // Проверяем уникальность username
  if (username) {
    db.get('SELECT id FROM users WHERE username = ? AND id != ?', [username, userId], (err, row) => {
      if (err) {
        return res.json({ success: false, message: 'Ошибка базы данных' });
      }
      
      if (row) {
        return res.json({ success: false, message: 'Юзернейм уже занят' });
      }
      
      updateUserProfile();
    });
  } else {
    updateUserProfile();
  }
  
  function updateUserProfile() {
    const updates = [];
    const params = [];
    
    if (username) {
      updates.push('username = ?');
      params.push(username);
    }
    
    if (displayName) {
      updates.push('displayName = ?');
      params.push(displayName);
    }
    
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    
    if (status) {
      updates.push('status = ?');
      params.push(status);
    }
    
    if (avatarData) {
      updates.push('avatar = ?');
      params.push(avatarData);
    }
    
    params.push(userId);
    
    if (updates.length === 0) {
      return res.json({ success: false, message: 'Нет данных для обновления' });
    }
    
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    
    db.run(query, params, function(err) {
      if (err) {
        return res.json({ success: false, message: 'Ошибка обновления профиля' });
      }
      
      // Получаем обновленные данные пользователя
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, updatedUser) => {
        if (err) {
          return res.json({ success: false, message: 'Ошибка получения данных пользователя' });
        }
        
        // Обновляем онлайн пользователей
        const onlineUserEntry = Array.from(onlineUsers.entries())
          .find(([_, u]) => u.userId === userId);
        
        if (onlineUserEntry) {
          const [socketId, onlineUser] = onlineUserEntry;
          if (username) onlineUser.username = username;
          if (displayName) onlineUser.displayName = displayName;
          if (status) onlineUser.status = status;
          if (avatarData) onlineUser.avatar = avatarData;
          
          io.emit('user_updated', { 
            userId, 
            username: username || onlineUser.username,
            displayName: displayName || onlineUser.displayName,
            status: status || onlineUser.status 
          });
          
          if (avatarData) {
            io.emit('user_avatar_updated', { userId, avatar: avatarData });
          }
        }
        
        res.json({ 
          success: true, 
          message: 'Профиль обновлен',
          user: {
            id: updatedUser.id,
            username: updatedUser.username,
            displayName: updatedUser.displayName,
            email: updatedUser.email,
            verified: Boolean(updatedUser.verified),
            isDeveloper: Boolean(updatedUser.isDeveloper),
            status: updatedUser.status,
            avatar: updatedUser.avatar,
            description: updatedUser.description
          }
        });
      });
    });
  }
});

app.get('/api/search-users', (req, res) => {
  const { query, currentUserId } = req.query;
  
  if (!query || !currentUserId) {
    return res.json([]);
  }
  
  const searchTerm = `%${query.toLowerCase().trim()}%`;
  
  db.all(
    `SELECT * FROM users 
     WHERE id != ? AND (username LIKE ? OR displayName LIKE ? OR email LIKE ?)
     ORDER BY username`,
    [currentUserId, searchTerm, searchTerm, searchTerm],
    (err, users) => {
      if (err) {
        console.error('Search error:', err);
        return res.json([]);
      }
      
      const usersWithData = users.map(u => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        email: u.email,
        verified: Boolean(u.verified),
        isDeveloper: Boolean(u.isDeveloper),
        status: u.status,
        avatar: u.avatar,
        description: u.description
      }));
      
      res.json(usersWithData);
    }
  );
});

app.get('/api/users', (req, res) => {
  const { currentUserId } = req.query;
  
  db.all(
    'SELECT * FROM users WHERE id != ? ORDER BY username',
    [currentUserId],
    (err, users) => {
      if (err) {
        console.error('Users error:', err);
        return res.json([]);
      }
      
      const usersWithData = users.map(u => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        email: u.email,
        verified: Boolean(u.verified),
        isDeveloper: Boolean(u.isDeveloper),
        status: u.status,
        avatar: u.avatar,
        description: u.description,
        createdAt: u.createdAt
      }));
      
      res.json(usersWithData);
    }
  );
});

app.get('/api/user/:id', (req, res) => {
  const userId = req.params.id;
  
  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) {
      return res.json({ success: false, message: 'Пользователь не найден' });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        verified: Boolean(user.verified),
        isDeveloper: Boolean(user.isDeveloper),
        status: user.status,
        avatar: user.avatar,
        description: user.description,
        createdAt: user.createdAt
      }
    });
  });
});

// Посты API
app.get('/api/posts', (req, res) => {
  const query = `
    SELECT 
      p.*,
      u.username,
      u.displayName,
      u.avatar,
      u.verified,
      u.isDeveloper,
      (SELECT COUNT(*) FROM post_likes WHERE postId = p.id) as likesCount,
      (SELECT COUNT(*) FROM post_comments WHERE postId = p.id) as commentsCount,
      EXISTS(SELECT 1 FROM post_likes WHERE postId = p.id AND userId = ?) as isLiked
    FROM posts p
    LEFT JOIN users u ON p.userId = u.id
    ORDER BY p.timestamp DESC
  `;
  
  // Для isLiked нужен userId, используем временный ID если не передан
  const currentUserId = req.query.userId || '0';
  
  db.all(query, [currentUserId], (err, posts) => {
    if (err) {
      console.error('Posts error:', err);
      return res.json([]);
    }
    
    const postsWithComments = posts.map(post => ({
      id: post.id,
      userId: post.userId,
      text: post.text,
      image: post.image,
      timestamp: post.timestamp,
      user: {
        username: post.username,
        displayName: post.displayName,
        avatar: post.avatar,
        verified: Boolean(post.verified),
        isDeveloper: Boolean(post.isDeveloper)
      },
      likes: Array(post.likesCount).fill(''), // Заглушка для совместимости
      comments: []
    }));
    
    // Загружаем комментарии для каждого поста
    let postsProcessed = 0;
    
    if (postsWithComments.length === 0) {
      return res.json([]);
    }
    
    postsWithComments.forEach(post => {
      db.all(
        `SELECT pc.*, u.username, u.displayName, u.avatar, u.verified, u.isDeveloper
         FROM post_comments pc
         LEFT JOIN users u ON pc.userId = u.id
         WHERE pc.postId = ?
         ORDER BY pc.timestamp ASC`,
        [post.id],
        (err, comments) => {
          if (!err && comments) {
            post.comments = comments.map(comment => ({
              id: comment.id,
              userId: comment.userId,
              text: comment.text,
              timestamp: comment.timestamp,
              user: {
                username: comment.username,
                displayName: comment.displayName,
                avatar: comment.avatar,
                verified: Boolean(comment.verified),
                isDeveloper: Boolean(comment.isDeveloper)
              }
            }));
          }
          
          postsProcessed++;
          if (postsProcessed === postsWithComments.length) {
            res.json(postsWithComments);
          }
        }
      );
    });
  });
});

app.post('/api/posts', (req, res) => {
  const { userId, text, image } = req.body;
  
  if (!userId || !text) {
    return res.json({ success: false, message: 'Текст поста обязателен' });
  }
  
  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) {
      return res.json({ success: false, message: 'Пользователь не найден' });
    }
    
    const postId = Date.now().toString();
    
    db.run(
      'INSERT INTO posts (id, userId, text, image) VALUES (?, ?, ?, ?)',
      [postId, userId, text, image || null],
      function(err) {
        if (err) {
          return res.json({ success: false, message: 'Ошибка публикации поста' });
        }
        
        res.json({ 
          success: true, 
          message: 'Пост опубликован',
          post: {
            id: postId,
            userId,
            text,
            image: image || null,
            timestamp: new Date().toISOString(),
            user: {
              username: user.username,
              displayName: user.displayName,
              avatar: user.avatar,
              verified: Boolean(user.verified),
              isDeveloper: Boolean(user.isDeveloper)
            },
            likes: [],
            comments: []
          }
        });
      }
    );
  });
});

app.post('/api/posts/:id/like', (req, res) => {
  const { userId } = req.body;
  const postId = req.params.id;
  
  if (!userId) {
    return res.json({ success: false, message: 'ID пользователя обязателен' });
  }
  
  // Проверяем, лайкнул ли уже пользователь
  db.get(
    'SELECT id FROM post_likes WHERE postId = ? AND userId = ?',
    [postId, userId],
    (err, row) => {
      if (err) {
        return res.json({ success: false, message: 'Ошибка базы данных' });
      }
      
      if (row) {
        // Убираем лайк
        db.run(
          'DELETE FROM post_likes WHERE postId = ? AND userId = ?',
          [postId, userId],
          function(err) {
            if (err) {
              return res.json({ success: false, message: 'Ошибка удаления лайка' });
            }
            
            // Получаем количество лайков
            db.get(
              'SELECT COUNT(*) as count FROM post_likes WHERE postId = ?',
              [postId],
              (err, result) => {
                res.json({ 
                  success: true, 
                  likes: result.count,
                  isLiked: false
                });
              }
            );
          }
        );
      } else {
        // Добавляем лайк
        const likeId = Date.now().toString();
        db.run(
          'INSERT INTO post_likes (id, postId, userId) VALUES (?, ?, ?)',
          [likeId, postId, userId],
          function(err) {
            if (err) {
              return res.json({ success: false, message: 'Ошибка добавления лайка' });
            }
            
            // Получаем количество лайков
            db.get(
              'SELECT COUNT(*) as count FROM post_likes WHERE postId = ?',
              [postId],
              (err, result) => {
                res.json({ 
                  success: true, 
                  likes: result.count,
                  isLiked: true
                });
              }
            );
          }
        );
      }
    }
  );
});

app.post('/api/posts/:id/comment', (req, res) => {
  const { userId, text } = req.body;
  const postId = req.params.id;
  
  if (!userId || !text) {
    return res.json({ success: false, message: 'Данные комментария обязательны' });
  }
  
  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) {
      return res.json({ success: false, message: 'Пользователь не найден' });
    }
    
    const commentId = Date.now().toString();
    
    db.run(
      'INSERT INTO post_comments (id, postId, userId, text) VALUES (?, ?, ?, ?)',
      [commentId, postId, userId, text],
      function(err) {
        if (err) {
          return res.json({ success: false, message: 'Ошибка добавления комментария' });
        }
        
        const comment = {
          id: commentId,
          userId,
          text,
          timestamp: new Date().toISOString(),
          user: {
            username: user.username,
            displayName: user.displayName,
            avatar: user.avatar,
            verified: Boolean(user.verified),
            isDeveloper: Boolean(user.isDeveloper)
          }
        };
        
        res.json({ 
          success: true, 
          message: 'Комментарий добавлен',
          comment
        });
      }
    );
  });
});

app.delete('/api/posts/:id', (req, res) => {
  const postId = req.params.id;
  const { userId } = req.body;
  
  if (!userId) {
    return res.json({ success: false, message: 'ID пользователя обязателен' });
  }
  
  // Проверяем владельца поста
  db.get('SELECT userId FROM posts WHERE id = ?', [postId], (err, post) => {
    if (err || !post) {
      return res.json({ success: false, message: 'Пост не найден' });
    }
    
    if (post.userId !== userId) {
      return res.json({ success: false, message: 'Вы можете удалять только свои посты' });
    }
    
    // Удаляем пост и связанные данные в транзакции
    db.serialize(() => {
      db.run('DELETE FROM post_likes WHERE postId = ?', [postId]);
      db.run('DELETE FROM post_comments WHERE postId = ?', [postId]);
      db.run('DELETE FROM posts WHERE id = ?', [postId], function(err) {
        if (err) {
          return res.json({ success: false, message: 'Ошибка удаления поста' });
        }
        
        res.json({ 
          success: true, 
          message: 'Пост удален'
        });
      });
    });
  });
});

// Админ endpoints
app.get('/api/admin/users', (req, res) => {
  db.all('SELECT * FROM users ORDER BY username', [], (err, users) => {
    if (err) {
      console.error('Admin users error:', err);
      return res.json([]);
    }
    
    const usersWithData = users.map(u => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      verified: Boolean(u.verified),
      isDeveloper: Boolean(u.isDeveloper),
      status: u.status,
      avatar: u.avatar,
      description: u.description,
      createdAt: u.createdAt
    }));
    
    res.json(usersWithData);
  });
});

app.post('/api/admin/toggle-verify', (req, res) => {
  const { userId, verified } = req.body;
  
  db.run(
    'UPDATE users SET verified = ? WHERE id = ?',
    [verified ? 1 : 0, userId],
    function(err) {
      if (err) {
        return res.json({ success: false, message: 'Ошибка обновления' });
      }
      
      if (this.changes === 0) {
        return res.json({ success: false, message: 'Пользователь не найден' });
      }
      
      const onlineUserEntry = Array.from(onlineUsers.entries())
        .find(([_, u]) => u.userId === userId);
      
      if (onlineUserEntry) {
        const [socketId, onlineUser] = onlineUserEntry;
        onlineUser.verified = verified;
        io.emit('user_verified', { userId, verified });
      }
      
      res.json({ 
        success: true, 
        message: `Аккаунт ${verified ? 'верифицирован' : 'деверифицирован'}` 
      });
    }
  );
});

app.post('/api/admin/toggle-developer', (req, res) => {
  const { userId, isDeveloper } = req.body;
  
  db.run(
    'UPDATE users SET isDeveloper = ? WHERE id = ?',
    [isDeveloper ? 1 : 0, userId],
    function(err) {
      if (err) {
        return res.json({ success: false, message: 'Ошибка обновления' });
      }
      
      if (this.changes === 0) {
        return res.json({ success: false, message: 'Пользователь не найден' });
      }
      
      const onlineUserEntry = Array.from(onlineUsers.entries())
        .find(([_, u]) => u.userId === userId);
      
      if (onlineUserEntry) {
        const [socketId, onlineUser] = onlineUserEntry;
        onlineUser.isDeveloper = isDeveloper;
        io.emit('user_developer_updated', { userId, isDeveloper });
      }
      
      res.json({ 
        success: true, 
        message: `Роль разработчика ${isDeveloper ? 'назначена' : 'снята'}` 
      });
    }
  );
});

app.post('/api/admin/delete-user', (req, res) => {
  const { userId, adminId } = req.body;
  
  // Проверяем права администратора
  db.get('SELECT isDeveloper FROM users WHERE id = ?', [adminId], (err, admin) => {
    if (err || !admin || !admin.isDeveloper) {
      return res.json({ success: false, message: 'Недостаточно прав' });
    }
    
    if (userId === adminId) {
      return res.json({ success: false, message: 'Нельзя удалить самого себя' });
    }
    
    // Удаляем пользователя и все связанные данные в транзакции
    db.serialize(() => {
      // Удаляем лайки пользователя
      db.run('DELETE FROM post_likes WHERE userId = ?', [userId]);
      
      // Удаляем комментарии пользователя
      db.run('DELETE FROM post_comments WHERE userId = ?', [userId]);
      
      // Удаляем посты пользователя и связанные с ними лайки и комментарии
      db.all('SELECT id FROM posts WHERE userId = ?', [userId], (err, userPosts) => {
        if (!err && userPosts) {
          userPosts.forEach(post => {
            db.run('DELETE FROM post_likes WHERE postId = ?', [post.id]);
            db.run('DELETE FROM post_comments WHERE postId = ?', [post.id]);
          });
        }
        
        db.run('DELETE FROM posts WHERE userId = ?', [userId]);
      });
      
      // Удаляем сообщения пользователя
      db.run('DELETE FROM messages WHERE userId = ? OR toUserId = ?', [userId, userId]);
      
      // Удаляем пользователя
      db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
        if (err) {
          return res.json({ success: false, message: 'Ошибка удаления пользователя' });
        }
        
        if (this.changes === 0) {
          return res.json({ success: false, message: 'Пользователь не найден' });
        }
        
        // Отключаем пользователя если он онлайн
        const onlineUserEntry = Array.from(onlineUsers.entries())
          .find(([_, u]) => u.userId === userId);
        
        if (onlineUserEntry) {
          const [socketId, onlineUser] = onlineUserEntry;
          io.to(socketId).emit('user_deleted', { message: 'Ваш аккаунт был удален администратором' });
          onlineUsers.delete(socketId);
        }
        
        res.json({ 
          success: true, 
          message: 'Пользователь удален' 
        });
      });
    });
  });
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
      
      // Уведомляем всех о новом онлайн пользователе
      socket.broadcast.emit('user_online', onlineUser);
      
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
      
      // Уведомляем всех о выходе пользователя
      socket.broadcast.emit('user_offline', onlineUser);
      
      console.log('👋 User disconnected:', onlineUser.displayName);
    }
  });
});

// Статические файлы
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
  db.get('SELECT COUNT(*) as userCount FROM users', (err, userResult) => {
    db.get('SELECT COUNT(*) as messageCount FROM messages', (err, messageResult) => {
      db.get('SELECT COUNT(*) as postCount FROM posts', (err, postResult) => {
        res.json({ 
          status: 'OK', 
          timestamp: new Date().toISOString(),
          users: userResult.userCount,
          messages: messageResult.messageCount,
          posts: postResult.postCount,
          database: 'SQLite'
        });
      });
    });
  });
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
  console.log('✅ Verified system: ACTIVE');
  console.log('👨‍💻 Developer badges: ENABLED');
  console.log('🖼️ Avatar upload: ENABLED');
  console.log('📁 File sharing: ENABLED');
  console.log('🔍 User search: ENABLED');
  console.log('📝 Posts system: ENABLED');
  console.log('=====================================');
});
