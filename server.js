const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

// Файлы для хранения данных
const DATA_FILE = 'data.json';

// Функции для работы с файлами
const loadData = () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading data:', error);
  }
  
  // Возвращаем данные по умолчанию
  return {
    users: [],
    messages: [],
    posts: []
  };
};

const saveData = (data) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log('💾 Data saved');
  } catch (error) {
    console.error('Error saving data:', error);
  }
};

// Загружаем данные
let data = loadData();
let { users, messages, posts } = data;

// Создаем тестовых пользователей если нет пользователей
if (users.length === 0) {
  users = [
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
  
  // Сохраняем начальные данные
  saveData({ users, messages, posts });
  console.log('👑 Created test users');
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
    users: users.length,
    messages: messages.length,
    posts: posts.length,
    storage: 'JSON file'
  });
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
  saveData({ users, messages, posts });
  
  res.json({ 
    success: true, 
    message: 'Регистрация успешна!', 
    user: newUser
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  const user = users.find(u => (u.email === email || u.username === email) && u.password === password);
  if (!user) {
    return res.json({ success: false, message: 'Неверный email/юзернейм или пароль' });
  }
  
  user.status = 'online';
  saveData({ users, messages, posts });
  
  res.json({ 
    success: true, 
    message: 'Вход выполнен!', 
    user: user
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
    users[userIndex].avatar = avatarData;
  }
  
  saveData({ users, messages, posts });
  
  res.json({ 
    success: true, 
    message: 'Профиль обновлен',
    user: users[userIndex]
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
  
  res.json(filteredUsers);
});

app.get('/api/users', (req, res) => {
  const { currentUserId } = req.query;
  
  const filteredUsers = users.filter(u => u.id !== currentUserId);
  res.json(filteredUsers);
});

app.get('/api/user/:id', (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  if (!user) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  res.json({
    success: true,
    user: user
  });
});

// Посты API
app.get('/api/posts', (req, res) => {
  const postsWithUsers = posts.map(post => {
    const user = users.find(u => u.id === post.userId);
    return {
      ...post,
      user: user ? {
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        verified: user.verified,
        isDeveloper: user.isDeveloper
      } : null
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
  saveData({ users, messages, posts });
  
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
  
  saveData({ users, messages, posts });
  
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
  saveData({ users, messages, posts });
  
  res.json({ 
    success: true, 
    message: 'Комментарий добавлен',
    comment
  });
});

app.delete('/api/posts/:id', (req, res) => {
  const postId = req.params.id;
  const { userId } = req.body;
  
  const postIndex = posts.findIndex(p => p.id === postId);
  if (postIndex === -1) {
    return res.json({ success: false, message: 'Пост не найден' });
  }
  
  const post = posts[postIndex];
  if (post.userId !== userId) {
    return res.json({ success: false, message: 'Вы можете удалять только свои посты' });
  }
  
  posts.splice(postIndex, 1);
  saveData({ users, messages, posts });
  
  res.json({ 
    success: true, 
    message: 'Пост удален'
  });
});

// Админ endpoints
app.get('/api/admin/users', (req, res) => {
  res.json(users);
});

app.post('/api/admin/toggle-verify', (req, res) => {
  const { userId, verified } = req.body;
  
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  users[userIndex].verified = verified;
  saveData({ users, messages, posts });
  
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
  saveData({ users, messages, posts });
  
  res.json({ 
    success: true, 
    message: `Роль разработчика ${isDeveloper ? 'назначена' : 'снята'}` 
  });
});

app.post('/api/admin/delete-user', (req, res) => {
  const { userId, adminId } = req.body;
  
  const adminUser = users.find(u => u.id === adminId);
  if (!adminUser || !adminUser.isDeveloper) {
    return res.json({ success: false, message: 'Недостаточно прав' });
  }
  
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  if (userId === adminId) {
    return res.json({ success: false, message: 'Нельзя удалить самого себя' });
  }
  
  users.splice(userIndex, 1);
  
  // Удаляем сообщения пользователя
  messages = messages.filter(msg => msg.userId !== userId && msg.toUserId !== userId);
  
  // Удаляем посты пользователя
  posts = posts.filter(post => post.userId !== userId);
  
  saveData({ users, messages, posts });
  
  res.json({ 
    success: true, 
    message: 'Пользователь удален' 
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
    saveData({ users, messages, posts });
    
    const onlineUser = {
      socketId: socket.id,
      username: user.username,
      displayName: user.displayName,
      userId: userData.userId,
      status: 'online',
      verified: user.verified,
      isDeveloper: user.isDeveloper,
      avatar: user.avatar
    };
    
    onlineUsers.set(socket.id, onlineUser);
    
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
    saveData({ users, messages, posts });
    
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
        saveData({ users, messages, posts });
      }
      
      onlineUsers.delete(socket.id);
      
      console.log('👋 User disconnected:', onlineUser.displayName);
    }
  });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log('=====================================');
  console.log('🚀 EPIC MESSENGER SERVER STARTED!');
  console.log('📡 Port:', PORT);
  console.log('🌐 Environment:', process.env.NODE_ENV || 'development');
  console.log('💾 Storage: JSON file');
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
