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
    origin: ["https://epic-messenger.onrender.com", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors({
  origin: ["https://epic-messenger.onrender.com", "http://localhost:3000"],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

// Файлы для хранения данных
const USERS_FILE = 'users.json';
const MESSAGES_FILE = 'messages.json';
const AVATARS_FILE = 'avatars.json';
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
    console.log(`💾 ${file} saved`);
    return true;
  } catch (error) {
    console.error(`Error saving ${file}:`, error);
    return false;
  }
};

// Инициализация данных
let users = loadData(USERS_FILE, []);
let messages = loadData(MESSAGES_FILE, []);
let avatars = loadData(AVATARS_FILE, {});
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
  
  console.log('Login attempt:', { email, passwordLength: password?.length });
  
  const user = users.find(u => (u.email === email || u.username === email) && u.password === password);
  if (!user) {
    console.log('Login failed: user not found or wrong password');
    return res.json({ success: false, message: 'Неверный email/юзернейм или пароль' });
  }
  
  user.status = 'online';
  saveData(USERS_FILE, users);
  
  let userAvatar = null;
  if (user.avatar && avatars[user.avatar]) {
    userAvatar = avatars[user.avatar];
  }
  
  console.log('Login successful:', user.username);
  
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
      avatar: userAvatar,
      description: user.description
    } 
  });
});

app.post('/api/update-profile', (req, res) => {
  const { userId, username, displayName, description, status, avatarData } = req.body;
  
  if (!userId) {
    return res.json({ success: false, message: 'ID пользователя обязателен' });
  }
  
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  if (username) {
    const existingUser = users.find(u => u.username === username && u.id !== userId);
    if (existingUser) {
      return res.json({ success: false, message: 'Юзернейм уже занят' });
    }
    users[userIndex].username = username;
  }
  
  if (displayName) {
    users[userIndex].displayName = displayName;
  }
  
  if (description !== undefined) {
    users[userIndex].description = description;
  }
  
  if (status) {
    users[userIndex].status = status;
  }
  
  if (avatarData) {
    const avatarId = userId;
    avatars[avatarId] = avatarData;
    users[userIndex].avatar = avatarId;
    saveData(AVATARS_FILE, avatars);
  }
  
  saveData(USERS_FILE, users);
  
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
  
  const updatedUser = users[userIndex];
  let userAvatar = null;
  if (updatedUser.avatar && avatars[updatedUser.avatar]) {
    userAvatar = avatars[updatedUser.avatar];
  }
  
  res.json({ 
    success: true, 
    message: 'Профиль обновлен',
    user: {
      id: userId,
      username: updatedUser.username,
      displayName: updatedUser.displayName,
      email: updatedUser.email,
      verified: updatedUser.verified,
      isDeveloper: updatedUser.isDeveloper,
      status: updatedUser.status,
      avatar: userAvatar,
      description: updatedUser.description
    }
  });
});

app.get('/api/search-users', (req, res) => {
  const { query, currentUserId } = req.query;
  
  if (!query || !currentUserId) {
    return res.json([]);
  }
  
  const searchTerm = query.toLowerCase().trim();
  const filteredUsers = users.filter(u => 
    u.id !== currentUserId &&
    (u.username.toLowerCase().includes(searchTerm) ||
     u.displayName.toLowerCase().includes(searchTerm) ||
     u.email.toLowerCase().includes(searchTerm))
  );
  
  const usersWithAvatars = filteredUsers.map(u => {
    let userAvatar = null;
    if (u.avatar && avatars[u.avatar]) {
      userAvatar = avatars[u.avatar];
    }
    
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      verified: u.verified,
      isDeveloper: u.isDeveloper,
      status: u.status,
      avatar: userAvatar,
      description: u.description
    };
  });
  
  res.json(usersWithAvatars);
});

app.get('/api/users', (req, res) => {
  const { currentUserId } = req.query;
  
  const filteredUsers = users.filter(u => u.id !== currentUserId);
  
  const usersWithAvatars = filteredUsers.map(u => {
    let userAvatar = null;
    if (u.avatar && avatars[u.avatar]) {
      userAvatar = avatars[u.avatar];
    }
    
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      verified: u.verified,
      isDeveloper: u.isDeveloper,
      status: u.status,
      avatar: userAvatar,
      description: u.description,
      createdAt: u.createdAt
    };
  });
  
  res.json(usersWithAvatars);
});

app.get('/api/user/:id', (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  if (!user) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  let userAvatar = null;
  if (user.avatar && avatars[user.avatar]) {
    userAvatar = avatars[user.avatar];
  }
  
  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      verified: user.verified,
      isDeveloper: user.isDeveloper,
      status: user.status,
      avatar: userAvatar,
      description: user.description,
      createdAt: user.createdAt
    }
  });
});

app.get('/api/user-profile/:id', (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  if (!user) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  let userAvatar = null;
  if (user.avatar && avatars[user.avatar]) {
    userAvatar = avatars[user.avatar];
  }
  
  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      verified: user.verified,
      isDeveloper: user.isDeveloper,
      status: user.status,
      avatar: userAvatar,
      description: user.description,
      createdAt: user.createdAt
    }
  });
});

// Посты API
app.get('/api/posts', (req, res) => {
  const postsWithAvatars = posts.map(post => {
    const user = users.find(u => u.id === post.userId);
    let userAvatar = null;
    if (user && user.avatar && avatars[user.avatar]) {
      userAvatar = avatars[user.avatar];
    }
    
    return {
      ...post,
      user: {
        username: user?.username,
        displayName: user?.displayName,
        avatar: userAvatar,
        verified: user?.verified,
        isDeveloper: user?.isDeveloper
      }
    };
  });
  
  res.json(postsWithAvatars.reverse()); // Новые посты первыми
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
        avatar: user.avatar && avatars[user.avatar] ? avatars[user.avatar] : null,
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
    // Лайк
    posts[postIndex].likes.push(userId);
  } else {
    // Убрать лайк
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
      avatar: user.avatar && avatars[user.avatar] ? avatars[user.avatar] : null,
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

// Админ endpoints
app.get('/api/admin/users', (req, res) => {
  const usersWithAvatars = users.map(u => {
    let userAvatar = null;
    if (u.avatar && avatars[u.avatar]) {
      userAvatar = avatars[u.avatar];
    }
    
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      verified: u.verified,
      isDeveloper: u.isDeveloper,
      status: u.status,
      avatar: userAvatar,
      description: u.description,
      createdAt: u.createdAt
    };
  });
  
  res.json(usersWithAvatars);
});

app.post('/api/admin/toggle-verify', (req, res) => {
  const { userId, verified } = req.body;
  
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  users[userIndex].verified = verified;
  saveData(USERS_FILE, users);
  
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
});

app.post('/api/admin/toggle-developer', (req, res) => {
  const { userId, isDeveloper } = req.body;
  
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  users[userIndex].isDeveloper = isDeveloper;
  saveData(USERS_FILE, users);
  
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
});

// WebSocket соединения
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  socket.on('user_join', (userData) => {
    const user = users.find(u => u.id === userData.userId);
    if (!user) {
      console.log('❌ User not found:', userData.userId);
      return;
    }
    
    user.status = 'online';
    saveData(USERS_FILE, users);
    
    let userAvatar = null;
    if (user.avatar && avatars[user.avatar]) {
      userAvatar = avatars[user.avatar];
    }
    
    const onlineUser = {
      socketId: socket.id,
      username: user.username,
      displayName: user.displayName,
      userId: userData.userId,
      status: 'online',
      verified: user.verified,
      isDeveloper: user.isDeveloper,
      avatar: userAvatar
    };
    
    onlineUsers.set(socket.id, onlineUser);
    
    // Уведомляем всех о новом онлайн пользователе
    socket.broadcast.emit('user_online', onlineUser);
    
    console.log('👋 User joined:', user.displayName);
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
    if (!onlineUser) {
      console.log('❌ Online user not found for socket:', socket.id);
      return;
    }
    
    const message = {
      id: Date.now().toString(),
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
    
    messages.push(message);
    saveData(MESSAGES_FILE, messages);
    
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
      
      // Уведомляем всех о выходе пользователя
      socket.broadcast.emit('user_offline', onlineUser);
      
      console.log('👋 User disconnected:', onlineUser.displayName);
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

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Health check для Render.com
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    users: users.length,
    messages: messages.length,
    posts: posts.length
  });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log('=====================================');
  console.log('🚀 EPIC MESSENGER SERVER STARTED!');
  console.log('📡 Port:', PORT);
  console.log('🌐 Environment:', process.env.NODE_ENV || 'development');
  console.log('💾 Storage: JSON files');
  console.log('🔐 Authentication: ENABLED');
  console.log('✅ Verified system: ACTIVE');
  console.log('👨‍💻 Developer badges: ENABLED');
  console.log('🖼️ Avatar upload: ENABLED');
  console.log('📁 File sharing: ENABLED');
  console.log('🔍 User search: ENABLED');
  console.log('📝 Posts system: ENABLED');
  console.log('👥 Loaded users:', users.length);
  console.log('💬 Messages in history:', messages.length);
  console.log('📮 Posts:', posts.length);
  console.log('🔑 Test accounts: admin / 123, BayRex / 123, testuser / 123');
  console.log('=====================================');
});
