const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware для парсинга JSON - ДОБАВЬТЕ ЭТО!
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Basic logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Session: ${req.session?.id || 'none'}`);
    next();
});

// Data file paths
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'data', 'messages.json');
const POSTS_FILE = path.join(__dirname, 'data', 'posts.json');
const GIFTS_FILE = path.join(__dirname, 'data', 'gifts.json');
const PROMO_CODES_FILE = path.join(__dirname, 'data', 'promoCodes.json');

// Ensure data directory exists
async function ensureDataDirectory() {
    try {
        await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    } catch (error) {
        console.error('Error creating data directory:', error);
    }
}

// Helper functions for file operations
async function readJSONFile(filePath) {
    try {
        await fs.access(filePath);
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

async function writeJSONFile(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error writing to ${filePath}:`, error);
        return false;
    }
}

// Initialize data files
async function initializeData() {
    await ensureDataDirectory();
    
    // Initialize users if empty
    const users = await readJSONFile(USERS_FILE);
    if (users.length === 0) {
        const defaultUsers = [
            {
                id: '1',
                email: 'admin@gmail.com',
                username: 'admin',
                displayName: 'Администратор',
                password: await bcrypt.hash('admin123', 10),
                verified: true,
                isDeveloper: true,
                coins: 1000,
                avatar: null,
                description: 'Системный администратор',
                createdAt: new Date().toISOString()
            }
        ];
        await writeJSONFile(USERS_FILE, defaultUsers);
    }

    // Initialize other data files if empty
    const filesToInitialize = [
        { file: MESSAGES_FILE, defaultData: [] },
        { file: POSTS_FILE, defaultData: [] },
        { file: GIFTS_FILE, defaultData: [] },
        { file: PROMO_CODES_FILE, defaultData: [] }
    ];

    for (const { file, defaultData } of filesToInitialize) {
        const data = await readJSONFile(file);
        if (data.length === 0) {
            await writeJSONFile(file, defaultData);
        }
    }
}

// JWT token generation
function generateToken(user) {
    return jwt.sign(
        { 
            userId: user.id, 
            email: user.email,
            username: user.username 
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Требуется авторизация' 
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ 
                success: false, 
                message: 'Недействительный токен' 
            });
        }
        req.user = user;
        next();
    });
}

// Routes

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/main.html'));
});

// Check authentication
app.get('/api/check-auth', authenticateToken, (req, res) => {
    res.json({ 
        authenticated: true,
        user: req.user
    });
});

// Get current user
app.get('/api/current-user', authenticateToken, async (req, res) => {
    try {
        const users = await readJSONFile(USERS_FILE);
        const user = users.find(u => u.id === req.user.userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Пользователь не найден'
            });
        }

        // Remove password from response
        const { password, ...userWithoutPassword } = user;
        res.json({
            success: true,
            user: userWithoutPassword
        });
    } catch (error) {
        console.error('Error getting current user:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера'
        });
    }
});

// Registration endpoint
app.post('/api/register', async (req, res) => {
    try {
        console.log('Registration request body:', req.body); // Debug log

        const { email, username, displayName, password } = req.body;

        // Validation
        if (!email || !username || !displayName || !password) {
            return res.status(400).json({
                success: false,
                message: 'Все поля обязательны для заполнения'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Пароль должен содержать минимум 6 символов'
            });
        }

        if (!email.endsWith('@gmail.com')) {
            return res.status(400).json({
                success: false,
                message: 'Разрешены только Gmail адреса'
            });
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return res.status(400).json({
                success: false,
                message: 'Имя пользователя может содержать только буквы, цифры и подчеркивания'
            });
        }

        // Check if user already exists
        const users = await readJSONFile(USERS_FILE);
        const existingUser = users.find(u => u.email === email || u.username === username);
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Пользователь с таким email или именем уже существует'
            });
        }

        // Create new user
        const newUser = {
            id: Date.now().toString(),
            email,
            username,
            displayName,
            password: await bcrypt.hash(password, 10),
            verified: false,
            isDeveloper: false,
            coins: 100, // Starting balance
            avatar: null,
            description: '',
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        await writeJSONFile(USERS_FILE, users);

        // Generate token
        const token = generateToken(newUser);

        // Remove password from response
        const { password: _, ...userWithoutPassword } = newUser;

        res.json({
            success: true,
            message: 'Регистрация успешна',
            user: userWithoutPassword,
            token
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при регистрации'
        });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        console.log('Login request body:', req.body); // Debug log

        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email и пароль обязательны'
            });
        }

        // Find user
        const users = await readJSONFile(USERS_FILE);
        const user = users.find(u => u.email === email);

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Неверный email или пароль'
            });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Неверный email или пароль'
            });
        }

        // Generate token
        const token = generateToken(user);

        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;

        res.json({
            success: true,
            message: 'Вход выполнен успешно',
            user: userWithoutPassword,
            token
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка сервера при входе'
        });
    }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
    res.json({
        success: true,
        message: 'Выход выполнен успешно'
    });
});

// Get chats
app.get('/api/chats', authenticateToken, async (req, res) => {
    try {
        const users = await readJSONFile(USERS_FILE);
        const messages = await readJSONFile(MESSAGES_FILE);
        
        // Get unique user IDs from messages
        const chatUserIds = [...new Set(messages
            .filter(m => m.senderId === req.user.userId || m.receiverId === req.user.userId)
            .map(m => m.senderId === req.user.userId ? m.receiverId : m.senderId)
        )];

        const chats = chatUserIds.map(userId => {
            const user = users.find(u => u.id === userId);
            if (!user) return null;

            const userMessages = messages.filter(m => 
                (m.senderId === req.user.userId && m.receiverId === userId) ||
                (m.senderId === userId && m.receiverId === req.user.userId)
            ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            const lastMessage = userMessages[0];
            const unreadCount = userMessages.filter(m => 
                m.senderId === userId && !m.read
            ).length;

            return {
                id: userId,
                name: user.displayName,
                avatar: user.avatar,
                last_message: lastMessage?.text || 'Нет сообщений',
                unread_count: unreadCount,
                lastActivity: lastMessage?.timestamp
            };
        }).filter(chat => chat !== null);

        res.json(chats);
    } catch (error) {
        console.error('Error loading chats:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка загрузки чатов'
        });
    }
});

// Get messages
app.get('/api/messages', authenticateToken, async (req, res) => {
    try {
        const { toUserId } = req.query;
        
        if (!toUserId) {
            return res.status(400).json({
                success: false,
                message: 'ID пользователя обязателен'
            });
        }

        const messages = await readJSONFile(MESSAGES_FILE);
        const userMessages = messages.filter(m => 
            (m.senderId === req.user.userId && m.receiverId === toUserId) ||
            (m.senderId === toUserId && m.receiverId === req.user.userId)
        ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        res.json(userMessages);
    } catch (error) {
        console.error('Error loading messages:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка загрузки сообщений'
        });
    }
});

// Send message
app.post('/api/messages', authenticateToken, async (req, res) => {
    try {
        const { receiverId, text } = req.body;

        if (!receiverId || !text) {
            return res.status(400).json({
                success: false,
                message: 'ID получателя и текст сообщения обязательны'
            });
        }

        const messages = await readJSONFile(MESSAGES_FILE);
        
        const newMessage = {
            id: Date.now().toString(),
            senderId: req.user.userId,
            receiverId,
            text,
            timestamp: new Date().toISOString(),
            read: false
        };

        messages.push(newMessage);
        await writeJSONFile(MESSAGES_FILE, messages);

        res.json({
            success: true,
            message: 'Сообщение отправлено',
            message: newMessage
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка отправки сообщения'
        });
    }
});

// Get posts
app.get('/api/posts', authenticateToken, async (req, res) => {
    try {
        const posts = await readJSONFile(POSTS_FILE);
        const users = await readJSONFile(USERS_FILE);

        const postsWithUserInfo = posts.map(post => {
            const user = users.find(u => u.id === post.userId);
            return {
                ...post,
                userDisplayName: user?.displayName || 'Неизвестный пользователь',
                userName: user?.username || 'unknown'
            };
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json(postsWithUserInfo);
    } catch (error) {
        console.error('Error loading posts:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка загрузки постов'
        });
    }
});

// Like post
app.post('/api/posts/:postId/like', authenticateToken, async (req, res) => {
    try {
        const { postId } = req.params;
        
        const posts = await readJSONFile(POSTS_FILE);
        const post = posts.find(p => p.id === postId);
        
        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Пост не найден'
            });
        }

        if (!post.likes) {
            post.likes = [];
        }

        const likeIndex = post.likes.indexOf(req.user.userId);
        if (likeIndex > -1) {
            post.likes.splice(likeIndex, 1);
        } else {
            post.likes.push(req.user.userId);
        }

        await writeJSONFile(POSTS_FILE, posts);

        res.json({
            success: true,
            likes: post.likes.length
        });
    } catch (error) {
        console.error('Error liking post:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка при установке лайка'
        });
    }
});

// Get gifts
app.get('/api/gifts', authenticateToken, async (req, res) => {
    try {
        const gifts = await readJSONFile(GIFTS_FILE);
        
        // If no gifts, create some default ones
        if (gifts.length === 0) {
            const defaultGifts = [
                {
                    id: '1',
                    name: 'Сердечко',
                    preview: '❤️',
                    price: 10,
                    description: 'Отправьте сердечко другу'
                },
                {
                    id: '2',
                    name: 'Звезда',
                    preview: '⭐',
                    price: 20,
                    description: 'Сияющая звезда'
                },
                {
                    id: '3',
                    name: 'Подарок',
                    preview: '🎁',
                    price: 50,
                    description: 'Красивый подарок'
                },
                {
                    id: '4',
                    name: 'Корона',
                    preview: '👑',
                    price: 100,
                    description: 'Королевская корона'
                }
            ];
            await writeJSONFile(GIFTS_FILE, defaultGifts);
            res.json(defaultGifts);
        } else {
            res.json(gifts);
        }
    } catch (error) {
        console.error('Error loading gifts:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка загрузки подарков'
        });
    }
});

// Buy gift
app.post('/api/gifts/:giftId/buy', authenticateToken, async (req, res) => {
    try {
        const { giftId } = req.params;
        
        const gifts = await readJSONFile(GIFTS_FILE);
        const users = await readJSONFile(USERS_FILE);
        
        const gift = gifts.find(g => g.id === giftId);
        const user = users.find(u => u.id === req.user.userId);
        
        if (!gift) {
            return res.status(404).json({
                success: false,
                message: 'Подарок не найден'
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Пользователь не найден'
            });
        }

        if (user.coins < gift.price) {
            return res.status(400).json({
                success: false,
                message: 'Недостаточно E-COIN для покупки'
            });
        }

        // Deduct coins
        user.coins -= gift.price;
        await writeJSONFile(USERS_FILE, users);

        res.json({
            success: true,
            message: `Подарок "${gift.name}" успешно куплен!`,
            giftName: gift.name,
            newBalance: user.coins
        });
    } catch (error) {
        console.error('Error buying gift:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка покупки подарка'
        });
    }
});

// Update user profile
app.put('/api/user/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const { name, username, bio } = req.body;

        if (userId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'Недостаточно прав'
            });
        }

        const users = await readJSONFile(USERS_FILE);
        const userIndex = users.findIndex(u => u.id === userId);
        
        if (userIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Пользователь не найден'
            });
        }

        // Update user data
        if (name) users[userIndex].displayName = name;
        if (username) users[userIndex].username = username;
        if (bio) users[userIndex].description = bio;

        await writeJSONFile(USERS_FILE, users);

        const { password, ...updatedUser } = users[userIndex];

        res.json({
            success: true,
            message: 'Профиль обновлен',
            user: updatedUser
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка обновления профиля'
        });
    }
});

// Get all users (admin)
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const users = await readJSONFile(USERS_FILE);
        const usersWithoutPasswords = users.map(user => {
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });
        res.json(usersWithoutPasswords);
    } catch (error) {
        console.error('Error loading users:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка загрузки пользователей'
        });
    }
});

// Admin stats
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
    try {
        const users = await readJSONFile(USERS_FILE);
        const messages = await readJSONFile(MESSAGES_FILE);
        const posts = await readJSONFile(POSTS_FILE);

        // Check if user is developer
        const currentUser = users.find(u => u.id === req.user.userId);
        if (!currentUser || !currentUser.isDeveloper) {
            return res.status(403).json({
                success: false,
                message: 'Недостаточно прав'
            });
        }

        res.json({
            totalUsers: users.length,
            totalMessages: messages.length,
            totalPosts: posts.length
        });
    } catch (error) {
        console.error('Error loading admin stats:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка загрузки статистики'
        });
    }
});

// Admin users
app.get('/api/admin/users', authenticateToken, async (req, res) => {
    try {
        const users = await readJSONFile(USERS_FILE);

        // Check if user is developer
        const currentUser = users.find(u => u.id === req.user.userId);
        if (!currentUser || !currentUser.isDeveloper) {
            return res.status(403).json({
                success: false,
                message: 'Недостаточно прав'
            });
        }

        const usersWithoutPasswords = users.map(user => {
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });

        res.json(usersWithoutPasswords);
    } catch (error) {
        console.error('Error loading admin users:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка загрузки пользователей'
        });
    }
});

// Activate promo code
app.post('/api/promo-codes/activate', authenticateToken, async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Промокод обязателен'
            });
        }

        // For now, return a mock response
        // In a real app, you would validate the promo code from database
        res.json({
            success: true,
            message: 'Промокод активирован! Вы получили 50 E-COIN',
            reward: {
                type: 'ecoins',
                amount: 50
            }
        });
    } catch (error) {
        console.error('Error activating promo code:', error);
        res.status(500).json({
            success: false,
            message: 'Ошибка активации промокода'
        });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Маршрут не найден'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        message: 'Внутренняя ошибка сервера'
    });
});

// Initialize and start server
async function startServer() {
    try {
        await initializeData();
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Open http://localhost:${PORT} in your browser`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
