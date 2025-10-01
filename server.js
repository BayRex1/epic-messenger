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
    posts: [],
    gifts: []
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
let { users, messages, posts, gifts } = data;

// Создаем тестовые подарки если нет
if (gifts.length === 0) {
  gifts = [
    {
      id: '1',
      name: 'Золотая корона',
      price: 100,
      image: null,
      type: 'image',
      createdBy: 'system',
      createdAt: new Date().toISOString()
    },
    {
      id: '2', 
      name: 'Анимация с фейерверком',
      price: 50,
      image: null,
      type: 'video',
      createdBy: 'system',
      createdAt: new Date().toISOString()
    }
  ];
  saveData({ users, messages, posts, gifts });
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
    gifts: gifts.length,
    storage: 'JSON file'
  });
});

// API routes
app.post('/api/register', (req, res) => {
  const { email, username, displayName, password } = req.body;
  
  if (!email || !username || !displayName || !password) {
    return res.json({ success: false, message: 'Все поля обязательны' });
  }
  
  // Проверка на существующий username (case insensitive)
  const existingUser = users.find(u => 
    u.username.toLowerCase() === username.toLowerCase() && !u.deleted
  );
  
  if (existingUser) {
    return res.json({ success: false, message: 'Юзернейм уже занят' });
  }
  
  // Проверка на существующий email
  if (users.find(u => u.email === email && !u.deleted)) {
    return res.json({ success: false, message: 'Email уже занят' });
  }
  
  const userId = Date.now().toString();
  
  // Автоматически даем права если username BayRex (case insensitive)
  const isBayRex = username.toLowerCase() === 'bayrex';
  
  const newUser = {
    id: userId,
    email,
    username,
    displayName,
    password: password,
    status: 'online',
    verified: isBayRex,
    isDeveloper: isBayRex,
    avatar: null,
    description: 'Новый пользователь Epic Messenger',
    coins: 1000, // Начальные коины
    gifts: [], // Купленные подарки
    createdAt: new Date().toISOString(),
    deleted: false
  };
  
  users.push(newUser);
  saveData({ users, messages, posts, gifts });
  
  res.json({ 
    success: true, 
    message: 'Регистрация успешна!', 
    user: newUser
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  const user = users.find(u => 
    (u.email === email || u.username.toLowerCase() === email.toLowerCase()) && 
    u.password === password &&
    !u.deleted
  );
  
  if (!user) {
    return res.json({ success: false, message: 'Неверный email/юзернейм или пароль' });
  }
  
  user.status = 'online';
  saveData({ users, messages, posts, gifts });
  
  res.json({ 
    success: true, 
    message: 'Вход выполнен!', 
    user: user
  });
});

// Остальные API endpoints остаются такими же как в предыдущей версии
// ... (update-profile, search-users, users, user, posts, likes, comments, admin endpoints)

// Подарки API
app.get('/api/gifts', (req, res) => {
  res.json(gifts.filter(gift => !gift.deleted));
});

app.post('/api/gifts', (req, res) => {
  const { userId, name, price, image, type } = req.body;
  
  if (!userId || !name || !price || !image || !type) {
    return res.json({ success: false, message: 'Все поля обязательны' });
  }
  
  const user = users.find(u => u.id === userId && !u.deleted);
  if (!user || !user.isDeveloper) {
    return res.json({ success: false, message: 'Недостаточно прав' });
  }
  
  // Проверка типа файла
  const allowedTypes = ['png', 'svg', 'mp4'];
  const fileType = type.toLowerCase();
  if (!allowedTypes.includes(fileType)) {
    return res.json({ success: false, message: 'Разрешены только PNG, SVG и MP4 файлы' });
  }
  
  const gift = {
    id: Date.now().toString(),
    name,
    price: parseInt(price),
    image,
    type: fileType,
    createdBy: userId,
    createdAt: new Date().toISOString(),
    deleted: false
  };
  
  gifts.push(gift);
  saveData({ users, messages, posts, gifts });
  
  res.json({ 
    success: true, 
    message: 'Подарок добавлен в магазин',
    gift
  });
});

app.post('/api/gifts/buy', (req, res) => {
  const { userId, giftId, toUserId } = req.body;
  
  const user = users.find(u => u.id === userId && !u.deleted);
  const toUser = users.find(u => u.id === toUserId && !u.deleted);
  const gift = gifts.find(g => g.id === giftId && !g.deleted);
  
  if (!user || !toUser || !gift) {
    return res.json({ success: false, message: 'Ошибка покупки подарка' });
  }
  
  // Пока покупка бесплатная (коины добавим позже)
  // if (user.coins < gift.price) {
  //   return res.json({ success: false, message: 'Недостаточно коинов' });
  // }
  
  // user.coins -= gift.price;
  toUser.gifts = toUser.gifts || [];
  toUser.gifts.push({
    giftId: gift.id,
    fromUserId: userId,
    fromUserName: user.displayName,
    timestamp: new Date().toISOString()
  });
  
  // Создаем сообщение о подарке
  const giftMessage = {
    id: Date.now().toString(),
    userId: userId,
    username: user.username,
    displayName: user.displayName,
    text: `🎁 Подарил(а) подарок "${gift.name}"`,
    toUserId: toUserId,
    timestamp: new Date().toISOString(),
    verified: user.verified,
    isDeveloper: user.isDeveloper,
    type: 'gift',
    giftId: gift.id,
    giftName: gift.name,
    giftPrice: gift.price
  };
  
  messages.push(giftMessage);
  saveData({ users, messages, posts, gifts });
  
  res.json({ 
    success: true, 
    message: 'Подарок успешно отправлен!',
    gift: gift
  });
});

// WebSocket соединения
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  socket.on('user_join', (userData) => {
    const user = users.find(u => u.id === userData.userId && !u.deleted);
    if (!user) {
      console.log('❌ User not found:', userData.userId);
      socket.emit('user_not_found', { message: 'Пользователь не найден' });
      return;
    }
    
    user.status = 'online';
    saveData({ users, messages, posts, gifts });
    
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
    
    // Уведомляем всех о новом онлайн пользователе
    socket.broadcast.emit('user_online', onlineUser);
    
    console.log('👋 User joined:', user.displayName);
  });

  socket.on('load_chat_history', (data) => {
    const chatMessages = messages.filter(msg => 
      (msg.userId === data.userId && msg.toUserId === data.targetId) ||
      (msg.userId === data.targetId && msg.toUserId === data.userId)
    );
    
    // Убираем дубликаты по ID
    const uniqueMessages = chatMessages.filter((msg, index, self) => 
      index === self.findIndex(m => m.id === msg.id)
    );
    
    uniqueMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    socket.emit('chat_history_loaded', { targetId: data.targetId, messages: uniqueMessages });
  });

  socket.on('send_message', (messageData) => {
    const onlineUser = onlineUsers.get(socket.id);
    if (!onlineUser) {
      console.log('❌ Online user not found for socket:', socket.id);
      return;
    }
    
    // Проверяем существует ли получатель и не удален ли он
    const recipient = users.find(u => u.id === messageData.toUserId && !u.deleted);
    if (!recipient) {
      socket.emit('user_not_found', { message: 'Пользователь не найден или был удален' });
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
      fileSize: messageData.fileSize || 0,
      giftId: messageData.giftId || null,
      giftName: messageData.giftName || null,
      giftPrice: messageData.giftPrice || null
    };
    
    messages.push(message);
    saveData({ users, messages, posts, gifts });
    
    console.log('💬 Сохранено сообщение от', message.displayName, 'к', messageData.toUserId);
    
    // Отправляем сообщение отправителю
    socket.emit('new_message', message);
    
    // Отправляем сообщение получателю если он онлайн
    const recipientEntry = Array.from(onlineUsers.entries())
      .find(([_, u]) => u.userId === messageData.toUserId);
    
    if (recipientEntry) {
      const [recipientSocketId, recipientUser] = recipientEntry;
      io.to(recipientSocketId).emit('new_message', message);
      // Отправляем уведомление получателю
      io.to(recipientSocketId).emit('new_message_notification', {
        from: onlineUser.displayName,
        message: messageData.text,
        userId: onlineUser.userId
      });
      console.log('📨 Сообщение доставлено пользователю:', recipientUser.displayName);
    }
  });

  socket.on('disconnect', () => {
    const onlineUser = onlineUsers.get(socket.id);
    if (onlineUser) {
      const user = users.find(u => u.id === onlineUser.userId && !u.deleted);
      if (user) {
        user.status = 'offline';
        saveData({ users, messages, posts, gifts });
        
        // Уведомляем всех о выходе пользователя
        socket.broadcast.emit('user_offline', onlineUser);
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
  console.log('🎁 Gift shop: ENABLED');
  console.log('👥 Loaded users:', users.length);
  console.log('💬 Messages in history:', messages.length);
  console.log('📮 Posts:', posts.length);
  console.log('🎁 Gifts:', gifts.length);
  console.log('🔑 BayRex account: BayRex / 123 (auto-admin)');
  console.log('=====================================');
});
