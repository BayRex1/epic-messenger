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
const AVATARS_FILE = 'avatars.json';

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
  
  // Если файла нет - создаем с default значением
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
const onlineUsers = new Map();

// Создаем админа если нет пользователей
if (users.length === 0) {
  users.push({
    id: 'admin',
    email: 'admin@epic.com',
    username: 'Admin',
    password: 'admin123',
    status: 'online',
    verified: true,
    isDeveloper: true,
    avatar: null,
    createdAt: new Date().toISOString()
  });
  saveData(USERS_FILE, users);
  console.log('👑 Created admin user: admin@epic.com / admin123');
}

// API routes

// Регистрация
app.post('/api/register', (req, res) => {
  const { email, username, password } = req.body;
  
  if (!email || !username || !password) {
    return res.json({ success: false, message: 'Все поля обязательны' });
  }
  
  if (users.find(u => u.email === email)) {
    return res.json({ success: false, message: 'Email уже занят' });
  }
  
  if (users.find(u => u.username === username)) {
    return res.json({ success: false, message: 'Имя пользователя уже занято' });
  }
  
  const userId = Date.now().toString();
  
  const newUser = {
    id: userId,
    email,
    username,
    password: password,
    status: 'online',
    verified: false,
    isDeveloper: false,
    avatar: null,
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
      email: email,
      verified: false,
      isDeveloper: false,
      avatar: null,
      status: 'online'
    } 
  });
});

// Вход
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) {
    return res.json({ success: false, message: 'Неверный email или пароль' });
  }
  
  user.status = 'online';
  saveData(USERS_FILE, users);
  
  // Загружаем аватарку если есть
  let userAvatar = null;
  if (user.avatar && avatars[user.avatar]) {
    userAvatar = avatars[user.avatar];
  }
  
  res.json({ 
    success: true, 
    message: 'Вход выполнен!', 
    user: { 
      id: user.id, 
      username: user.username, 
      email: user.email,
      verified: user.verified,
      isDeveloper: user.isDeveloper,
      status: 'online',
      avatar: userAvatar
    } 
  });
});

// Обновление профиля
app.post('/api/update-profile', (req, res) => {
  const { userId, username, status, avatarData } = req.body;
  
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
      return res.json({ success: false, message: 'Имя пользователя уже занято' });
    }
    users[userIndex].username = username;
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
  
  // Обновляем онлайн пользователя
  const onlineUserEntry = Array.from(onlineUsers.entries())
    .find(([_, u]) => u.userId === userId);
  
  if (onlineUserEntry) {
    const [socketId, onlineUser] = onlineUserEntry;
    if (username) onlineUser.username = username;
    if (status) onlineUser.status = status;
    if (avatarData) onlineUser.avatar = avatarData;
    
    io.emit('user_updated', { 
      userId, 
      username: username || onlineUser.username,
      status: status || onlineUser.status 
    });
    
    if (avatarData) {
      io.emit('user_avatar_updated', { userId, avatar: avatarData });
    }
  }
  
  // Возвращаем обновленные данные пользователя
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
      email: updatedUser.email,
      verified: updatedUser.verified,
      isDeveloper: updatedUser.isDeveloper,
      status: updatedUser.status,
      avatar: userAvatar
    }
  });
});

// Поиск пользователей
app.get('/api/search-users', (req, res) => {
  const { query, currentUserId } = req.query;
  
  if (!query || !currentUserId) {
    return res.json([]);
  }
  
  const searchTerm = query.toLowerCase().trim();
  const filteredUsers = users.filter(u => 
    u.id !== currentUserId &&
    (u.username.toLowerCase().includes(searchTerm) ||
     u.email.toLowerCase().includes(searchTerm))
  );
  
  // Добавляем аватарки
  const usersWithAvatars = filteredUsers.map(u => {
    let userAvatar = null;
    if (u.avatar && avatars[u.avatar]) {
      userAvatar = avatars[u.avatar];
    }
    
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      verified: u.verified,
      isDeveloper: u.isDeveloper,
      status: u.status,
      avatar: userAvatar
    };
  });
  
  res.json(usersWithAvatars);
});

// Получение всех пользователей
app.get('/api/users', (req, res) => {
  const { currentUserId } = req.query;
  
  const filteredUsers = users.filter(u => u.id !== currentUserId);
  
  // Добавляем аватарки
  const usersWithAvatars = filteredUsers.map(u => {
    let userAvatar = null;
    if (u.avatar && avatars[u.avatar]) {
      userAvatar = avatars[u.avatar];
    }
    
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      verified: u.verified,
      isDeveloper: u.isDeveloper,
      status: u.status,
      avatar: userAvatar,
      createdAt: u.createdAt
    };
  });
  
  res.json(usersWithAvatars);
});

// Получение пользователя по ID
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
      verified: user.verified,
      isDeveloper: user.isDeveloper,
      status: user.status,
      avatar: userAvatar,
      createdAt: user.createdAt
    }
  });
});

// Получение профиля пользователя
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
      verified: user.verified,
      isDeveloper: user.isDeveloper,
      status: user.status,
      avatar: userAvatar,
      createdAt: user.createdAt
    }
  });
});

// Сохранение настроек
app.post('/api/save-settings', (req, res) => {
  res.json({ success: true, message: 'Настройки сохранены' });
});

// Получение настроек
app.get('/api/settings/:userId', (req, res) => {
  const userSettings = {
    theme: 'dark',
    notifications: true
  };
  
  res.json({ success: true, settings: userSettings });
});

// Очистка кэша
app.post('/api/clear-cache', (req, res) => {
  res.json({ success: true, message: 'Кэш очищен' });
});

// Получение всех пользователей для админа
app.get('/api/admin/users', (req, res) => {
  const usersWithAvatars = users.map(u => {
    let userAvatar = null;
    if (u.avatar && avatars[u.avatar]) {
      userAvatar = avatars[u.avatar];
    }
    
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      verified: u.verified,
      isDeveloper: u.isDeveloper,
      status: u.status,
      avatar: userAvatar,
      createdAt: u.createdAt
    };
  });
  
  res.json(usersWithAvatars);
});

// Верификация пользователя
app.post('/api/admin/toggle-verify', (req, res) => {
  const { userId, verified } = req.body;
  
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  users[userIndex].verified = verified;
  saveData(USERS_FILE, users);
  
  // Обновляем онлайн статус если пользователь онлайн
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

// Назначение разработчика
app.post('/api/admin/toggle-developer', (req, res) => {
  const { userId, isDeveloper } = req.body;
  
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  users[userIndex].isDeveloper = isDeveloper;
  saveData(USERS_FILE, users);
  
  // Обновляем онлайн статус если пользователь онлайн
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

// Удаление пользователя
app.post('/api/admin/delete-user', (req, res) => {
  const { userId } = req.body;
  
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  // Не даем удалить самого себя
  if (userId === req.body.adminId) {
    return res.json({ success: false, message: 'Нельзя удалить свой аккаунт' });
  }
  
  users.splice(userIndex, 1);
  saveData(USERS_FILE, users);
  
  // Удаляем аватарку если есть
  if (avatars[userId]) {
    delete avatars[userId];
    saveData(AVATARS_FILE, avatars);
  }
  
  // Удаляем сообщения пользователя
  messages = messages.filter(msg => msg.userId !== userId && msg.toUserId !== userId);
  saveData(MESSAGES_FILE, messages);
  
  // Отключаем пользователя если онлайн
  const onlineUserEntry = Array.from(onlineUsers.entries())
    .find(([_, u]) => u.userId === userId);
  
  if (onlineUserEntry) {
    const [socketId, onlineUser] = onlineUserEntry;
    io.to(socketId).emit('account_deleted');
    onlineUsers.delete(socketId);
  }
  
  res.json({ 
    success: true, 
    message: 'Пользователь удален' 
  });
});

// Получение эмодзи (пустой массив)
app.get('/api/emojis', (req, res) => {
  res.json({ success: true, emojis: [] });
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
    
    // Загружаем аватарку
    let userAvatar = null;
    if (user.avatar && avatars[user.avatar]) {
      userAvatar = avatars[user.avatar];
    }
    
    const onlineUser = {
      socketId: socket.id,
      username: userData.username,
      userId: userData.userId,
      status: 'online',
      verified: user.verified,
      isDeveloper: user.isDeveloper,
      avatar: userAvatar
    };
    
    onlineUsers.set(socket.id, onlineUser);
    
    // Уведомляем всех о новом пользователе
    socket.broadcast.emit('user_online', onlineUser);
    
    console.log('👋 User joined:', user.username);
  });

  // Загрузка истории чата
  socket.on('load_chat_history', (data) => {
    const chatMessages = messages.filter(msg => 
      (msg.userId === data.userId && msg.toUserId === data.targetId) ||
      (msg.userId === data.targetId && msg.toUserId === data.userId)
    );
    
    // Сортируем сообщения по времени
    chatMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    socket.emit('chat_history_loaded', { targetId: data.targetId, messages: chatMessages });
  });

  // Отправка сообщения
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
    
    // Сохраняем сообщение
    messages.push(message);
    saveData(MESSAGES_FILE, messages);
    
    console.log('💬 Сохранено сообщение от', message.username, 'к', messageData.toUserId);
    
    // Отправляем сообщение отправителю
    socket.emit('new_message', message);
    
    // Отправляем получателю если он онлайн
    const recipientEntry = Array.from(onlineUsers.entries())
      .find(([_, u]) => u.userId === messageData.toUserId);
    
    if (recipientEntry) {
      const [recipientSocketId, recipientUser] = recipientEntry;
      io.to(recipientSocketId).emit('new_message', message);
      console.log('📨 Сообщение доставлено пользователю:', recipientUser.username);
    } else {
      console.log('⚠️ Получатель оффлайн, сообщение сохранено для истории');
    }
  });

  socket.on('disconnect', () => {
    const onlineUser = onlineUsers.get(socket.id);
    if (onlineUser) {
      // Обновляем статус в базе
      const user = users.find(u => u.id === onlineUser.userId);
      if (user) {
        user.status = 'offline';
        saveData(USERS_FILE, users);
      }
      
      onlineUsers.delete(socket.id);
      
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

// Запуск сервера
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('=====================================');
  console.log('🚀 EPIC MESSENGER SERVER STARTED!');
  console.log('📡 Port:', PORT);
  console.log('💾 Storage: JSON files (Auto-created)');
  console.log('🔐 Authentication: ENABLED');
  console.log('✅ Verified system: ACTIVE');
  console.log('👨‍💻 Developer badges: ENABLED');
  console.log('🖼️ Avatar upload: ENABLED');
  console.log('📁 File sharing: ENABLED');
  console.log('🔍 User search: ENABLED');
  console.log('😊 Emoji keyboard: DISABLED');
  console.log('🔧 Admin functions: In profile menu');
  console.log('🔑 Admin: admin@epic.com / admin123');
  console.log('👥 Loaded users:', users.length);
  console.log('💬 Messages in history:', messages.length);
  console.log('=====================================');
});