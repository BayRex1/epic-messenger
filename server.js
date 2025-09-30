const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
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

// Файлы для хранения данных
const USERS_FILE = 'users.json';
const MESSAGES_FILE = 'messages.json';
const POSTS_FILE = 'posts.json';

// Функции для работы с файлами
const loadData = (file, defaultValue) => {
  try {
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error loading ${file}:`, error);
  }
  
  saveData(file, defaultValue);
  return defaultValue;
};

const saveData = (file, data) => {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error saving ${file}:`, error);
    return false;
  }
};

// Инициализация данных
let users = loadData(USERS_FILE, []);
let messages = loadData(MESSAGES_FILE, []);
let posts = loadData(POSTS_FILE, []);
const onlineUsers = new Map();

// Создаем тестовых пользователей если нет пользователей
if (users.length === 0) {
  const testUsers = [
    {
      id: '1',
      email: 'admin@epic.com',
      username: 'admin',
      displayName: 'Администратор',
      password: '123',
      status: 'online',
      verified: true,
      isDeveloper: true,
      avatar: null,
      description: 'Главный администратор системы',
      createdAt: new Date().toISOString()
    },
    {
      id: '2',
      email: 'bayrex@epic.com',
      username: 'BayRex',
      displayName: 'BayRex',
      password: '123',
      status: 'online',
      verified: true,
      isDeveloper: true,
      avatar: null,
      description: 'Разработчик Epic Messenger',
      createdAt: new Date().toISOString()
    },
    {
      id: '3',
      email: 'test@mail.ru',
      username: 'testuser',
      displayName: 'Тестовый Пользователь',
      password: '123',
      status: 'online',
      verified: false,
      isDeveloper: false,
      avatar: null,
      description: 'Обычный пользователь',
      createdAt: new Date().toISOString()
    }
  ];
  
  users.push(...testUsers);
  saveData(USERS_FILE, users);
  console.log('👑 Created test users');
}

// API routes
app.post('/api/register', (req, res) => {
  const { email, username, displayName, password } = req.body;
  
  if (!email || !username || !displayName || !password) {
    return res.json({ success: false, message: 'Все поля обязательны' });
  }
  
  if (users.find(u => u.email === email)) {
    return res.json({ success: false, message: 'Email уже занят' });
  }
  
  if (users.find(u => u.username === username)) {
    return res.json({ success: false, message: 'Юзернейм уже занят' });
  }
  
  const userId = Date.now().toString();
  
  const newUser = {
    id: userId,
    email,
    username,
    displayName,
    password: password,
    status: 'online',
    verified: false,
    isDeveloper: false,
    avatar: null,
    description: 'Новый пользователь Epic Messenger',
    createdAt: new Date().toISOString()
  };
  
  users.push(newUser);
  saveData(USERS_FILE, users);
  
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
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  const user = users.find(u => (u.email === email || u.username === email) && u.password === password);
  if (!user) {
    return res.json({ success: false, message: 'Неверный email/юзернейм или пароль' });
  }
  
  user.status = 'online';
  saveData(USERS_FILE, users);
  
  res.json({ 
    success: true, 
    message: 'Вход выполнен!', 
    user: { 
      id: user.id, 
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      verified: user.verified,
      isDeveloper: user.isDeveloper,
      status: 'online',
      avatar: user.avatar,
      description: user.description
    } 
  });
});

app.get('/api/users', (req, res) => {
  const { currentUserId } = req.query;
  
  const filteredUsers = users.filter(u => u.id !== currentUserId);
  
  res.json(filteredUsers);
});

// Посты API
app.get('/api/posts', (req, res) => {
  const postsWithUsers = posts.map(post => {
    const user = users.find(u => u.id === post.userId);
    return {
      ...post,
      user: {
        username: user?.username,
        displayName: user?.displayName,
        avatar: user?.avatar,
        verified: user?.verified,
        isDeveloper: user?.isDeveloper
      }
    };
  });
  
  res.json(postsWithUsers.reverse());
});

app.post('/api/posts', (req, res) => {
  const { userId, text, image } = req.body;
  
  if (!userId || !text) {
    return res.json({ success: false, message: 'Текст поста обязателен' });
  }
  
  const user = users.find(u => u.id === userId);
  if (!user) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  const post = {
    id: Date.now().toString(),
    userId,
    text,
    image: image || null,
    likes: [],
    comments: [],
    timestamp: new Date().toISOString()
  };
  
  posts.push(post);
  saveData(POSTS_FILE, posts);
  
  res.json({ 
    success: true, 
    message: 'Пост опубликован',
    post: {
      ...post,
      user: {
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        verified: user.verified,
        isDeveloper: user.isDeveloper
      }
    }
  });
});

app.post('/api/posts/:id/like', (req, res) => {
  const { userId } = req.body;
  const postId = req.params.id;
  
  const postIndex = posts.findIndex(p => p.id === postId);
  if (postIndex === -1) {
    return res.json({ success: false, message: 'Пост не найден' });
  }
  
  const likeIndex = posts[postIndex].likes.indexOf(userId);
  if (likeIndex === -1) {
    posts[postIndex].likes.push(userId);
  } else {
    posts[postIndex].likes.splice(likeIndex, 1);
  }
  
  saveData(POSTS_FILE, posts);
  
  res.json({ 
    success: true, 
    likes: posts[postIndex].likes.length,
    isLiked: likeIndex === -1
  });
});

app.post('/api/posts/:id/comment', (req, res) => {
  const { userId, text } = req.body;
  const postId = req.params.id;
  
  const postIndex = posts.findIndex(p => p.id === postId);
  if (postIndex === -1) {
    return res.json({ success: false, message: 'Пост не найден' });
  }
  
  const user = users.find(u => u.id === userId);
  if (!user) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  const comment = {
    id: Date.now().toString(),
    userId,
    text,
    timestamp: new Date().toISOString(),
    user: {
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      verified: user.verified,
      isDeveloper: user.isDeveloper
    }
  };
  
  posts[postIndex].comments.push(comment);
  saveData(POSTS_FILE, posts);
  
  res.json({ 
    success: true, 
    message: 'Комментарий добавлен',
    comment
  });
});

// WebSocket соединения
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  socket.on('user_join', (userData) => {
    const user = users.find(u => u.id === userData.userId);
    if (!user) return;
    
    user.status = 'online';
    saveData(USERS_FILE, users);
    
    const onlineUser = {
      socketId: socket.id,
      username: user.username,
      displayName: user.displayName,
      userId: userData.userId,
      status: 'online'
    };
    
    onlineUsers.set(socket.id, onlineUser);
    
    socket.broadcast.emit('user_online', onlineUser);
  });

  socket.on('load_chat_history', (data) => {
    const chatMessages = messages.filter(msg => 
      (msg.userId === data.userId && msg.toUserId === data.targetId) ||
      (msg.userId === data.targetId && msg.toUserId === data.userId)
    );
    
    chatMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    socket.emit('chat_history_loaded', { targetId: data.targetId, messages: chatMessages });
  });

  socket.on('send_message', (messageData) => {
    const onlineUser = onlineUsers.get(socket.id);
    if (!onlineUser) return;
    
    const message = {
      id: Date.now().toString(),
      userId: onlineUser.userId,
      username: onlineUser.username,
      displayName: onlineUser.displayName,
      text: messageData.text,
      toUserId: messageData.toUserId,
      timestamp: new Date().toISOString(),
      verified: users.find(u => u.id === onlineUser.userId)?.verified || false,
      isDeveloper: users.find(u => u.id === onlineUser.userId)?.isDeveloper || false
    };
    
    messages.push(message);
    saveData(MESSAGES_FILE, messages);
    
    socket.emit('new_message', message);
    
    const recipientEntry = Array.from(onlineUsers.entries())
      .find(([_, u]) => u.userId === messageData.toUserId);
    
    if (recipientEntry) {
      const [recipientSocketId] = recipientEntry;
      io.to(recipientSocketId).emit('new_message', message);
    }
  });

  socket.on('disconnect', () => {
    const onlineUser = onlineUsers.get(socket.id);
    if (onlineUser) {
      const user = users.find(u => u.id === onlineUser.userId);
      if (user) {
        user.status = 'offline';
        saveData(USERS_FILE, users);
      }
      
      onlineUsers.delete(socket.id);
      socket.broadcast.emit('user_offline', onlineUser);
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

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Epic Messenger запущен на порту:', PORT);
});
