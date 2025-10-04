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
    gifts: [],
    promocodes: []
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
let { users, messages, posts, gifts, promocodes } = data;

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
      createdAt: new Date().toISOString(),
      deleted: false
    },
    {
      id: '2', 
      name: 'Анимация с фейерверком',
      price: 50,
      image: null,
      type: 'gif',
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      deleted: false
    }
  ];
  saveData({ users, messages, posts, gifts, promocodes });
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

// Health check для Render.com
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    users: users.length,
    messages: messages.length,
    posts: posts.length,
    gifts: gifts.length,
    promocodes: promocodes.length,
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
    usedPromocodes: [], // Использованные промокоды
    createdAt: new Date().toISOString(),
    deleted: false
  };
  
  users.push(newUser);
  saveData({ users, messages, posts, gifts, promocodes });
  
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
  saveData({ users, messages, posts, gifts, promocodes });
  
  res.json({ 
    success: true, 
    message: 'Вход выполнен!', 
    user: user
  });
});

// НОВЫЙ МАРШРУТ: Загрузка файлов
app.post('/api/upload', (req, res) => {
  const { fileData, fileName, fileType } = req.body;
  
  if (!fileData) {
    return res.json({ success: false, message: 'Нет данных файла' });
  }
  
  // В реальном приложении здесь нужно сохранять файлы на сервер
  // Пока просто возвращаем данные файла
  const fileUrl = fileData;
  
  res.json({ 
    success: true, 
    fileUrl: fileUrl,
    message: 'Файл загружен'
  });
});

app.post('/api/update-profile', (req, res) => {
  const { userId, username, displayName, description, status, avatarData } = req.body;
  
  if (!userId) {
    return res.json({ success: false, message: 'ID пользователя обязателен' });
  }
  
  const userIndex = users.findIndex(u => u.id === userId && !u.deleted);
  if (userIndex === -1) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  if (username) {
    const existingUser = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.id !== userId && !u.deleted);
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
  
  saveData({ users, messages, posts, gifts, promocodes });
  
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
    !u.deleted &&
    (u.username.toLowerCase().includes(searchTerm) ||
     u.displayName.toLowerCase().includes(searchTerm) ||
     u.email.toLowerCase().includes(searchTerm))
  );
  
  res.json(filteredUsers);
});

app.get('/api/users', (req, res) => {
  const { currentUserId } = req.query;
  
  const filteredUsers = users.filter(u => u.id !== currentUserId && !u.deleted);
  res.json(filteredUsers);
});

app.get('/api/user-chats', (req, res) => {
  const { currentUserId } = req.query;
  
  if (!currentUserId) {
    return res.json([]);
  }
  
  // Для обычных пользователей показываем только тех, с кем есть переписка
  const userMessages = messages.filter(msg => 
    (msg.userId === currentUserId || msg.toUserId === currentUserId) &&
    !msg.deleted
  );
  
  const chatUserIds = [...new Set(userMessages.map(msg => 
    msg.userId === currentUserId ? msg.toUserId : msg.userId
  ))];
  
  const chatUsers = users.filter(u => 
    chatUserIds.includes(u.id) && 
    u.id !== currentUserId && 
    !u.deleted
  );
  
  res.json(chatUsers);
});

app.get('/api/user/:id', (req, res) => {
  const user = users.find(u => u.id === req.params.id && !u.deleted);
  if (!user) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  // Скрываем баланс коинов для других пользователей
  const userResponse = {
    ...user,
    coins: undefined // Скрываем баланс
  };
  
  res.json({
    success: true,
    user: userResponse
  });
});

// Посты API
app.get('/api/posts', (req, res) => {
  const postsWithUsers = posts.map(post => {
    const user = users.find(u => u.id === post.userId && !u.deleted);
    return {
      ...post,
      user: user ? {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        verified: user.verified,
        isDeveloper: user.isDeveloper
      } : {
        id: 'deleted',
        username: 'deleted_user',
        displayName: 'Удаленный пользователь',
        avatar: null,
        verified: false,
        isDeveloper: false
      }
    };
  });
  
  res.json(postsWithUsers.reverse());
});

// ОБНОВЛЕННЫЙ МАРШРУТ: Создание постов с просмотрами
app.post('/api/posts', (req, res) => {
  const { userId, text, image } = req.body;
  
  if (!userId || !text) {
    return res.json({ success: false, message: 'Текст поста обязателен' });
  }
  
  const user = users.find(u => u.id === userId && !u.deleted);
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
    views: 0, // Начальное количество просмотров
    timestamp: new Date().toISOString()
  };
  
  posts.push(post);
  saveData({ users, messages, posts, gifts, promocodes });
  
  res.json({ 
    success: true, 
    message: 'Пост опубликован',
    post: {
      ...post,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        verified: user.verified,
        isDeveloper: user.isDeveloper
      }
    }
  });
});

// НОВЫЙ МАРШРУТ: Увеличение просмотров
app.post('/api/posts/:id/view', (req, res) => {
  const postId = req.params.id;
  
  const postIndex = posts.findIndex(p => p.id === postId);
  if (postIndex === -1) {
    return res.json({ success: false, message: 'Пост не найден' });
  }
  
  posts[postIndex].views = (posts[postIndex].views || 0) + 1;
  saveData({ users, messages, posts, gifts, promocodes });
  
  res.json({ 
    success: true, 
    views: posts[postIndex].views
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
  
  saveData({ users, messages, posts, gifts, promocodes });
  
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
  
  const user = users.find(u => u.id === userId && !u.deleted);
  if (!user) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  const comment = {
    id: Date.now().toString(),
    userId,
    text,
    timestamp: new Date().toISOString(),
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      verified: user.verified,
      isDeveloper: user.isDeveloper
    }
  };
  
  posts[postIndex].comments.push(comment);
  saveData({ users, messages, posts, gifts, promocodes });
  
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
  saveData({ users, messages, posts, gifts, promocodes });
  
  res.json({ 
    success: true, 
    message: 'Пост удален'
  });
});

// Подарки API
app.get('/api/gifts', (req, res) => {
  const availableGifts = gifts.filter(gift => !gift.deleted);
  res.json(availableGifts);
});

app.post('/api/gifts', (req, res) => {
  const { userId, name, price, image, type } = req.body;
  
  if (!userId || !name || !price || !type) {
    return res.json({ success: false, message: 'Все поля обязательны' });
  }
  
  const user = users.find(u => u.id === userId && !u.deleted);
  if (!user || !user.isDeveloper) {
    return res.json({ success: false, message: 'Недостаточно прав' });
  }
  
  // Проверка типа файла
  const allowedTypes = ['png', 'svg', 'gif', 'webp'];
  const fileType = type.toLowerCase();
  if (!allowedTypes.includes(fileType)) {
    return res.json({ success: false, message: 'Разрешены только PNG, SVG, GIF и WebP файлы' });
  }
  
  const gift = {
    id: Date.now().toString(),
    name,
    price: parseInt(price),
    image: image || null,
    type: fileType,
    createdBy: userId,
    createdAt: new Date().toISOString(),
    deleted: false
  };
  
  gifts.push(gift);
  saveData({ users, messages, posts, gifts, promocodes });
  
  res.json({ 
    success: true, 
    message: 'Подарок добавлен в магазин',
    gift
  });
});

app.post('/api/gifts/buy', (req, res) => {
  const { userId, giftId, toUserId, message } = req.body;
  
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
    text: message ? `🎁 Подарил(а) подарок "${gift.name}": ${message}` : `🎁 Подарил(а) подарок "${gift.name}"`,
    toUserId: toUserId,
    timestamp: new Date().toISOString(),
    verified: user.verified,
    isDeveloper: user.isDeveloper,
    type: 'gift',
    giftId: gift.id,
    giftName: gift.name,
    giftPrice: gift.price,
    giftImage: gift.image,
    giftType: gift.type
  };
  
  messages.push(giftMessage);
  saveData({ users, messages, posts, gifts, promocodes });
  
  // Отправляем уведомление получателю если он онлайн
  const recipientEntry = Array.from(onlineUsers.entries())
    .find(([_, u]) => u.userId === toUserId);
  
  if (recipientEntry) {
    const [recipientSocketId, recipientUser] = recipientEntry;
    io.to(recipientSocketId).emit('new_message', giftMessage);
    
    // Отправляем отдельное уведомление о подарке
    io.to(recipientSocketId).emit('gift_received', {
      fromUser: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        verified: user.verified,
        isDeveloper: user.isDeveloper
      },
      gift: gift,
      message: message,
      timestamp: new Date().toISOString()
    });
  }
  
  // Отправляем уведомление отправителю
  const senderEntry = Array.from(onlineUsers.entries())
    .find(([_, u]) => u.userId === userId);
  
  if (senderEntry) {
    const [senderSocketId] = senderEntry;
    io.to(senderSocketId).emit('gift_sent', {
      toUser: {
        id: toUser.id,
        username: toUser.username,
        displayName: toUser.displayName,
        avatar: toUser.avatar
      },
      gift: gift,
      message: message,
      timestamp: new Date().toISOString()
    });
  }
  
  res.json({ 
    success: true, 
    message: 'Подарок успешно отправлен!',
    gift: gift
  });
});

// Промокоды API
app.get('/api/promocodes', (req, res) => {
  const { userId } = req.query;
  
  const user = users.find(u => u.id === userId && !u.deleted);
  if (!user || !user.isDeveloper) {
    return res.json({ success: false, message: 'Недостаточно прав' });
  }
  
  res.json(promocodes);
});

app.post('/api/promocodes', (req, res) => {
  const { userId, code, coins, maxUses } = req.body;
  
  const user = users.find(u => u.id === userId && !u.deleted);
  if (!user || !user.isDeveloper) {
    return res.json({ success: false, message: 'Недостаточно прав' });
  }
  
  if (!code || !coins) {
    return res.json({ success: false, message: 'Код и количество коинов обязательны' });
  }
  
  const existingPromo = promocodes.find(p => p.code === code && !p.deleted);
  if (existingPromo) {
    return res.json({ success: false, message: 'Промокод уже существует' });
  }
  
  const promocode = {
    id: Date.now().toString(),
    code: code.toUpperCase(),
    coins: parseInt(coins),
    maxUses: maxUses || 1,
    usedCount: 0,
    usedBy: [],
    createdBy: userId,
    createdAt: new Date().toISOString(),
    deleted: false
  };
  
  promocodes.push(promocode);
  saveData({ users, messages, posts, gifts, promocodes });
  
  res.json({ 
    success: true, 
    message: 'Промокод создан',
    promocode
  });
});

app.post('/api/promocodes/use', (req, res) => {
  const { userId, code } = req.body;
  
  const user = users.find(u => u.id === userId && !u.deleted);
  if (!user) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  const promocode = promocodes.find(p => 
    p.code === code.toUpperCase() && 
    !p.deleted && 
    p.usedCount < p.maxUses
  );
  
  if (!promocode) {
    return res.json({ success: false, message: 'Промокод не найден или достиг лимита использований' });
  }
  
  if (promocode.usedBy.includes(userId)) {
    return res.json({ success: false, message: 'Вы уже использовали этот промокод' });
  }
  
  // Начисляем коины
  user.coins = (user.coins || 0) + promocode.coins;
  promocode.usedCount += 1;
  promocode.usedBy.push(userId);
  
  user.usedPromocodes = user.usedPromocodes || [];
  user.usedPromocodes.push({
    code: promocode.code,
    coins: promocode.coins,
    usedAt: new Date().toISOString()
  });
  
  saveData({ users, messages, posts, gifts, promocodes });
  
  res.json({ 
    success: true, 
    message: `Промокод активирован! Получено ${promocode.coins} E-COIN`,
    coins: user.coins
  });
});

app.delete('/api/promocodes/:id', (req, res) => {
  const { userId } = req.body;
  const promocodeId = req.params.id;
  
  const user = users.find(u => u.id === userId && !u.deleted);
  if (!user || !user.isDeveloper) {
    return res.json({ success: false, message: 'Недостаточно прав' });
  }
  
  const promocodeIndex = promocodes.findIndex(p => p.id === promocodeId && !p.deleted);
  if (promocodeIndex === -1) {
    return res.json({ success: false, message: 'Промокод не найден' });
  }
  
  promocodes[promocodeIndex].deleted = true;
  saveData({ users, messages, posts, gifts, promocodes });
  
  res.json({ 
    success: true, 
    message: 'Промокод удален'
  });
});

// Админ endpoints
app.get('/api/admin/users', (req, res) => {
  res.json(users);
});

app.post('/api/admin/toggle-verify', (req, res) => {
  const { userId, verified } = req.body;
  
  const userIndex = users.findIndex(u => u.id === userId && !u.deleted);
  if (userIndex === -1) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  users[userIndex].verified = verified;
  saveData({ users, messages, posts, gifts, promocodes });
  
  // Отправляем уведомление пользователю если он онлайн
  const userEntry = Array.from(onlineUsers.entries())
    .find(([_, u]) => u.userId === userId);
  
  if (userEntry) {
    const [userSocketId] = userEntry;
    io.to(userSocketId).emit('user_verified', { 
      userId: userId, 
      verified: verified 
    });
  }
  
  res.json({ 
    success: true, 
    message: `Аккаунт ${verified ? 'верифицирован' : 'деверифицирован'}` 
  });
});

app.post('/api/admin/toggle-developer', (req, res) => {
  const { userId, isDeveloper } = req.body;
  
  const userIndex = users.findIndex(u => u.id === userId && !u.deleted);
  if (userIndex === -1) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  users[userIndex].isDeveloper = isDeveloper;
  saveData({ users, messages, posts, gifts, promocodes });
  
  // Отправляем уведомление пользователю если он онлайн
  const userEntry = Array.from(onlineUsers.entries())
    .find(([_, u]) => u.userId === userId);
  
  if (userEntry) {
    const [userSocketId] = userEntry;
    io.to(userSocketId).emit('user_developer_updated', { 
      userId: userId, 
      isDeveloper: isDeveloper 
    });
  }
  
  res.json({ 
    success: true, 
    message: `Роль разработчика ${isDeveloper ? 'назначена' : 'снята'}` 
  });
});

app.post('/api/admin/delete-user', (req, res) => {
  const { userId, adminId } = req.body;
  
  const adminUser = users.find(u => u.id === adminId && !u.deleted);
  if (!adminUser || !adminUser.isDeveloper) {
    return res.json({ success: false, message: 'Недостаточно прав' });
  }
  
  const userIndex = users.findIndex(u => u.id === userId && !u.deleted);
  if (userIndex === -1) {
    return res.json({ success: false, message: 'Пользователь не найден' });
  }
  
  // ЗАЩИТА: BayRex нельзя удалить
  const userToDelete = users[userIndex];
  if (userToDelete.username.toLowerCase() === 'bayrex') {
    return res.json({ success: false, message: 'Нельзя удалить создателя системы BayRex' });
  }
  
  if (userId === adminId) {
    return res.json({ success: false, message: 'Нельзя удалить самого себя' });
  }
  
  // Помечаем пользователя как удаленного вместо полного удаления
  users[userIndex].deleted = true;
  users[userIndex].displayName = 'Удаленный пользователь';
  users[userIndex].username = 'deleted_' + Date.now();
  users[userIndex].email = 'deleted_' + Date.now() + '@deleted.com';
  users[userIndex].avatar = null;
  users[userIndex].description = 'Этот аккаунт был удален';
  users[userIndex].status = 'offline';
  users[userIndex].verified = false;
  users[userIndex].isDeveloper = false;
  
  saveData({ users, messages, posts, gifts, promocodes });
  
  // Уведомляем всех онлайн пользователей об удалении
  io.emit('user_deleted', { 
    userId: userId,
    message: 'Пользователь был удален' 
  });
  
  // Отключаем пользователя если он онлайн
  const userEntry = Array.from(onlineUsers.entries())
    .find(([_, u]) => u.userId === userId);
  
  if (userEntry) {
    const [userSocketId] = userEntry;
    io.to(userSocketId).emit('user_deleted', { 
      message: 'Ваш аккаунт был удален администратором' 
    });
    onlineUsers.delete(userSocketId);
  }
  
  res.json({ 
    success: true, 
    message: 'Пользователь удален' 
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
    saveData({ users, messages, posts, gifts, promocodes });
    
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
      ((msg.userId === data.userId && msg.toUserId === data.targetId) ||
      (msg.userId === data.targetId && msg.toUserId === data.userId)) &&
      !msg.deleted
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
      giftPrice: messageData.giftPrice || null,
      deleted: false
    };
    
    messages.push(message);
    saveData({ users, messages, posts, gifts, promocodes });
    
    console.log('💬 Сохранено сообщение от', message.displayName, 'к', messageData.toUserId);
    
    // Отправляем сообщение отправителю
    socket.emit('new_message', message);
    socket.emit('message_sent', { success: true });
    
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

  socket.on('delete_message', (data) => {
    const { messageId, userId } = data;
    
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) {
      socket.emit('message_delete_error', { message: 'Сообщение не найдено' });
      return;
    }
    
    const message = messages[messageIndex];
    
    // Проверяем права на удаление (только отправитель или получатель)
    if (message.userId !== userId && message.toUserId !== userId) {
      socket.emit('message_delete_error', { message: 'Вы не можете удалить это сообщение' });
      return;
    }
    
    // Помечаем сообщение как удаленное
    messages[messageIndex].deleted = true;
    saveData({ users, messages, posts, gifts, promocodes });
    
    // Уведомляем всех участников чата об удалении
    const participants = [message.userId, message.toUserId];
    
    participants.forEach(participantId => {
      const participantEntry = Array.from(onlineUsers.entries())
        .find(([_, u]) => u.userId === participantId);
      
      if (participantEntry) {
        const [participantSocketId] = participantEntry;
        io.to(participantSocketId).emit('message_deleted', { 
          messageId: messageId,
          deletedBy: userId
        });
      }
    });
    
    socket.emit('message_deleted', { 
      messageId: messageId,
      success: true 
    });
    
    console.log('🗑️ Сообщение удалено:', messageId);
  });

  socket.on('disconnect', () => {
    const onlineUser = onlineUsers.get(socket.id);
    if (onlineUser) {
      const user = users.find(u => u.id === onlineUser.userId && !u.deleted);
      if (user) {
        user.status = 'offline';
        saveData({ users, messages, posts, gifts, promocodes });
        
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
  console.log('💰 Promocodes system: ENABLED');
  console.log('🗑️ Message deletion: ENABLED');
  console.log('🛡️ BayRex account: PROTECTED FROM DELETION');
  console.log('📱 Mobile version: FIXED KEYBOARD ISSUES');
  console.log('👥 Loaded users:', users.length);
  console.log('💬 Messages in history:', messages.length);
  console.log('📰 Posts:', posts.length);
  console.log('🎁 Gifts:', gifts.length);
  console.log('🏷️ Promocodes:', promocodes.length);
  console.log('=====================================');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  
  // Сохраняем данные перед выходом
  saveData({ users, messages, posts, gifts, promocodes });
  
  console.log('💾 All data saved');
  console.log('👋 Goodbye!');
  process.exit(0);
});
