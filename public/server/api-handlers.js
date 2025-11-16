const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

class ApiHandlers {
    constructor(dataManager, securitySystem, fileHandlers) {
        this.dataManager = dataManager;
        this.securitySystem = securitySystem;
        this.fileHandlers = fileHandlers;
    }

    processApiRequest(pathname, method, data, query, req, res) {
        console.log(`🔧 Processing API: ${method} ${pathname}`);
        
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
        };

        if (method === 'OPTIONS') {
            res.writeHead(204, headers);
            res.end();
            return;
        }

        try {
            switch (pathname) {
                case '/api/register':
                    if (method === 'POST') this.handleRegister(data, req, res);
                    break;
                case '/api/login':
                    if (method === 'POST') this.handleLogin(data, req, res);
                    break;
                case '/api/current-user':
                    if (method === 'GET') this.handleCurrentUser(req, res);
                    break;
                case '/api/users':
                    if (method === 'GET') this.handleGetUsers(req, res);
                    break;
                case '/api/users/search':
                    if (method === 'GET') this.handleSearchUsers(query, req, res);
                    break;
                case '/api/chats':
                    if (method === 'GET') this.handleGetChats(req, res);
                    break;
                case '/api/messages':
                    if (method === 'GET') this.handleGetMessages(query, req, res);
                    break;
                case '/api/messages/send':
                    if (method === 'POST') this.handleSendMessage(data, req, res);
                    break;
                case '/api/messages/mark-read':
                    if (method === 'POST') this.handleMarkAsRead(data, req, res);
                    break;
                case '/api/groups/create':
                    if (method === 'POST') this.handleCreateGroup(data, req, res);
                    break;
                case '/api/posts':
                    if (method === 'GET') this.handleGetPosts(req, res);
                    else if (method === 'POST') this.handleCreatePost(data, req, res);
                    else if (method === 'DELETE') this.handleDeletePost(query, req, res);
                    break;
                case '/api/posts/user':
                    if (method === 'GET') this.handleGetUserPosts(query, req, res);
                    break;
                case '/api/posts/like':
                    if (method === 'POST') this.handleLikePost(data, req, res);
                    break;
                case '/api/posts/comment':
                    if (method === 'POST') this.handleAddComment(data, req, res);
                    break;
                case '/api/posts/share':
                    if (method === 'POST') this.handleSharePost(data, req, res);
                    break;
                case '/api/gifts':
                    if (method === 'GET') this.handleGetGifts(req, res);
                    else if (method === 'POST') this.handleCreateGift(data, req, res);
                    else if (method === 'DELETE') this.handleDeleteGift(data, req, res);
                    break;
                case '/api/gifts/buy':
                    if (method === 'POST') this.handleBuyGift(data, req, res);
                    break;
                case '/api/gifts/user':
                    if (method === 'GET') this.handleGetUserGifts(query, req, res);
                    break;
                case '/api/promo-codes':
                    if (method === 'GET') this.handleGetPromoCodes(req, res);
                    else if (method === 'POST') this.handleCreatePromoCode(data, req, res);
                    else if (method === 'DELETE') this.handleDeletePromoCode(data, req, res);
                    break;
                case '/api/promo-codes/activate':
                    if (method === 'POST') this.handleActivatePromoCode(data, req, res);
                    break;
                case '/api/music':
                    if (method === 'GET') this.handleGetMusic(req, res);
                    break;
                case '/api/music/upload-full':
                    // Обрабатывается в file-handlers
                    break;
                case '/api/playlists':
                    if (method === 'GET') this.handleGetPlaylists(req, res);
                    else if (method === 'POST') this.handleCreatePlaylist(data, req, res);
                    break;
                case '/api/playlists/add-track':
                    if (method === 'POST') this.handleAddTrackToPlaylist(data, req, res);
                    break;
                case '/api/emoji':
                    if (method === 'GET') this.handleGetEmoji(req, res);
                    break;
                case '/api/admin/users':
                    if (method === 'GET') this.handleAdminGetUsers(req, res);
                    break;
                case '/api/admin/ban-user':
                    if (method === 'POST') this.handleAdminBanUser(data, req, res);
                    break;
                case '/api/admin/verify-user':
                    if (method === 'POST') this.handleAdminVerifyUser(data, req, res);
                    break;
                case '/api/admin/make-developer':
                    if (method === 'POST') this.handleAdminMakeDeveloper(data, req, res);
                    break;
                case '/api/admin/maintenance':
                    if (method === 'POST') this.handleAdminMaintenance(data, req, res);
                    break;
                case '/api/admin/export-database':
                    if (method === 'GET') this.handleAdminExportDatabase(req, res);
                    break;
                case '/api/admin/import-database':
                    // Обрабатывается в file-handlers
                    break;
                case '/api/admin/security-logs':
                    if (method === 'GET') this.handleAdminSecurityLogs(req, res);
                    break;
                case '/api/devices':
                    if (method === 'GET') this.handleGetDevices(req, res);
                    break;
                case '/api/devices/terminate':
                    if (method === 'POST') this.handleTerminateDevice(data, req, res);
                    break;
                case '/api/upload-avatar':
                case '/api/upload-post-image':
                case '/api/upload-file':
                case '/api/upload-gift':
                    // Обрабатывается в file-handlers
                    break;
                case '/api/debug-upload':
                    if (method === 'GET') this.handleDebugUpload(req, res);
                    break;
                case '/api/preview-avatar':
                    if (method === 'POST') this.handlePreviewAvatar(data, req, res);
                    break;
                default:
                    this.sendError(res, 'API endpoint not found', 404);
            }
        } catch (error) {
            console.error('❌ API Error:', error);
            this.sendError(res, 'Internal server error: ' + error.message, 500);
        }
    }

    // 🔥 НОВЫЕ МЕТОДЫ ДЛЯ ЧАТОВ И ГРУПП

    handleSearchUsers(query, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const searchTerm = query.q;
        if (!searchTerm || searchTerm.length < 2) {
            this.sendSuccess(res, { users: [] });
            return;
        }

        const filteredUsers = this.dataManager.users.filter(u => 
            u.id !== user.id && // Исключаем текущего пользователя
            (u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
             u.displayName.toLowerCase().includes(searchTerm.toLowerCase()))
        ).slice(0, 20); // Ограничиваем результаты

        this.sendSuccess(res, { users: filteredUsers });
    }

    handleCreateGroup(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const { name, username, members } = data;
        
        if (!name || !members || !Array.isArray(members)) {
            this.sendError(res, 'Неверные данные для создания группы', 400);
            return;
        }

        // Проверяем, что все участники существуют
        const validMembers = members.filter(memberId => 
            this.dataManager.users.find(u => u.id === memberId)
        );

        if (validMembers.length === 0) {
            this.sendError(res, 'Не выбраны действительные участники', 400);
            return;
        }

        // Проверяем уникальность username если указан
        if (username) {
            const existingGroup = this.dataManager.groups.find(g => g.username === username);
            if (existingGroup) {
                this.sendError(res, 'Группа с таким username уже существует', 400);
                return;
            }
        }

        // Создаем группу
        const groupId = this.dataManager.generateId();
        const group = {
            id: groupId,
            name: this.securitySystem.sanitizeContent(name),
            username: username ? this.securitySystem.sanitizeContent(username) : null,
            creatorId: user.id,
            members: [user.id, ...validMembers],
            avatar: null,
            createdAt: new Date(),
            isActive: true,
            isPublic: !!username // Группа публичная если есть username
        };

        this.dataManager.groups.push(group);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'CREATE_GROUP', `group:${name}, members:${validMembers.length}`);

        console.log(`👥 Пользователь ${user.displayName} создал группу: ${name} с ${validMembers.length} участниками`);

        this.sendSuccess(res, {
            group: group,
            message: 'Группа успешно создана'
        });
    }

    handleGetChats(req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        try {
            // Получаем личные чаты
            const personalChats = this.dataManager.users
                .filter(u => u.id !== user.id)
                .map(u => {
                    const messages = this.dataManager.messages.filter(m => 
                        (m.senderId === user.id && m.toUserId === u.id) ||
                        (m.senderId === u.id && m.toUserId === user.id)
                    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                    const lastMessage = messages[0] || null;
                    const unreadCount = messages.filter(m => 
                        m.senderId === u.id && !m.read
                    ).length;

                    return {
                        id: u.id,
                        displayName: u.displayName || 'Пользователь',
                        avatar: u.avatar,
                        verified: u.verified,
                        isDeveloper: u.isDeveloper,
                        status: u.status,
                        lastSeen: u.lastSeen,
                        lastMessage: lastMessage,
                        unreadCount: unreadCount,
                        isGroup: false
                    };
                })
                .filter(chat => chat.lastMessage !== null) // Показываем только чаты с сообщениями
                .sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));

            // Получаем групповые чаты
            const groupChats = this.dataManager.groups
                .filter(g => g.members.includes(user.id) && g.isActive)
                .map(g => {
                    const groupMessages = this.dataManager.messages.filter(m => 
                        m.toUserId === g.id
                    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                    const lastMessage = groupMessages[0] || null;
                    const unreadCount = groupMessages.filter(m => 
                        m.senderId !== user.id && !m.readBy?.includes(user.id)
                    ).length;

                    return {
                        id: g.id,
                        displayName: g.name,
                        avatar: g.avatar,
                        isGroup: true,
                        memberCount: g.members.length,
                        lastMessage: lastMessage,
                        unreadCount: unreadCount
                    };
                })
                .filter(chat => chat.lastMessage !== null)
                .sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));

            const allChats = [...personalChats, ...groupChats];

            this.sendSuccess(res, { chats: allChats });
        } catch (error) {
            console.error('❌ Ошибка получения чатов:', error);
            this.sendError(res, 'Ошибка получения чатов');
        }
    }

    handleGetMessages(query, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const { userId, toUserId } = query;
        
        if (!toUserId) {
            this.sendError(res, 'Не указан получатель', 400);
            return;
        }

        try {
            let messages;
            
            // Проверяем, является ли чат групповым
            const isGroupChat = this.dataManager.groups.some(g => g.id === toUserId && g.members.includes(user.id));
            
            if (isGroupChat) {
                // Групповые сообщения
                messages = this.dataManager.messages
                    .filter(m => m.toUserId === toUserId)
                    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            } else {
                // Личные сообщения
                messages = this.dataManager.messages
                    .filter(m => 
                        (m.senderId === user.id && m.toUserId === toUserId) ||
                        (m.senderId === toUserId && m.toUserId === user.id)
                    )
                    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            }

            this.sendSuccess(res, { messages: messages });
        } catch (error) {
            console.error('❌ Ошибка получения сообщений:', error);
            this.sendError(res, 'Ошибка получения сообщений');
        }
    }

    handleSendMessage(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const { toUserId, text, type = 'text', file, fileName, fileType } = data;
        
        if (!toUserId) {
            this.sendError(res, 'Не указан получатель', 400);
            return;
        }

        if (!text && !file) {
            this.sendError(res, 'Сообщение не может быть пустым', 400);
            return;
        }

        try {
            // Проверяем существование получателя (пользователя или группы)
            const isUser = this.dataManager.users.some(u => u.id === toUserId);
            const isGroup = this.dataManager.groups.some(g => g.id === toUserId && g.members.includes(user.id));
            
            if (!isUser && !isGroup) {
                this.sendError(res, 'Получатель не найден или у вас нет доступа к группе', 404);
                return;
            }

            let fileUrl = null;
            
            // Обработка файла если есть
            if (file && fileName && fileType) {
                const fileExt = path.extname(fileName) || this.getFileExtension(fileType);
                const uniqueFilename = `file_${user.id}_${Date.now()}${fileExt}`;
                let uploadDir = 'files';
                
                if (fileType === 'image') uploadDir = 'images';
                else if (fileType === 'video') uploadDir = 'videos';
                else if (fileType === 'audio') uploadDir = 'audio';
                
                const filePath = path.join(process.cwd(), 'public', 'uploads', uploadDir, uniqueFilename);
                
                // Сохраняем файл
                const base64Data = file.replace(/^data:[^;]+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                fs.writeFileSync(filePath, buffer);
                
                fileUrl = `/uploads/${uploadDir}/${uniqueFilename}`;
            }

            const message = {
                id: this.dataManager.generateId(),
                senderId: user.id,
                toUserId: toUserId,
                text: text ? this.securitySystem.sanitizeContent(text) : null,
                type: type,
                file: fileUrl,
                fileName: fileName,
                fileType: fileType,
                timestamp: new Date(),
                read: false,
                readBy: isGroup ? [user.id] : [] // Для групп отслеживаем кто прочитал
            };

            this.dataManager.messages.push(message);
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}, type:${type}`);

            console.log(`💬 Пользователь ${user.displayName} отправил сообщение ${isGroup ? 'в группу' : 'пользователю'} ${toUserId}`);

            this.sendSuccess(res, { message: message });
        } catch (error) {
            console.error('❌ Ошибка отправки сообщения:', error);
            this.sendError(res, 'Ошибка отправки сообщения: ' + error.message);
        }
    }

    handleMarkAsRead(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const { fromUserId } = data;
        
        if (!fromUserId) {
            this.sendError(res, 'Не указан отправитель', 400);
            return;
        }

        try {
            // Помечаем сообщения как прочитанные
            this.dataManager.messages.forEach(message => {
                if (message.senderId === fromUserId && message.toUserId === user.id && !message.read) {
                    message.read = true;
                }
                
                // Для групповых сообщений добавляем пользователя в список прочитавших
                if (message.toUserId === fromUserId && message.readBy && !message.readBy.includes(user.id)) {
                    message.readBy.push(user.id);
                }
            });

            this.dataManager.saveData();

            this.sendSuccess(res, { message: 'Сообщения помечены как прочитанные' });
        } catch (error) {
            console.error('❌ Ошибка отметки сообщений:', error);
            this.sendError(res, 'Ошибка отметки сообщений');
        }
    }

    // СУЩЕСТВУЮЩИЕ МЕТОДЫ

    authenticateRequest(req, res) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        
        if (!token) {
            this.sendError(res, 'Требуется авторизация', 401);
            return null;
        }

        const user = this.authenticateToken(token);
        if (!user) {
            this.sendError(res, 'Неверный токен', 401);
            return null;
        }

        return user;
    }

    authenticateToken(token) {
        try {
            const session = this.securitySystem.validateSession(token);
            if (!session) return null;

            const user = this.dataManager.users.find(u => u.id === session.userId);
            if (!user || user.banned) return null;

            // Обновляем lastSeen
            user.lastSeen = new Date();
            this.dataManager.saveData();

            return user;
        } catch (error) {
            return null;
        }
    }

    handleRegister(data, req, res) {
        const { username, password, displayName, email } = data;
        
        if (!username || !password || !displayName) {
            this.sendError(res, 'Все поля обязательны для заполнения', 400);
            return;
        }

        if (this.dataManager.users.find(u => u.username === username)) {
            this.sendError(res, 'Пользователь с таким именем уже существует', 400);
            return;
        }

        if (email && this.dataManager.users.find(u => u.email === email)) {
            this.sendError(res, 'Пользователь с таким email уже существует', 400);
            return;
        }

        const userId = this.dataManager.generateId();
        const hashedPassword = this.securitySystem.hashPassword(password);
        
        const user = {
            id: userId,
            username: this.securitySystem.sanitizeContent(username),
            displayName: this.securitySystem.sanitizeContent(displayName),
            email: email ? this.securitySystem.sanitizeContent(email) : null,
            password: hashedPassword,
            avatar: null,
            description: '',
            coins: 1000,
            verified: false,
            isDeveloper: username.toLowerCase() === 'bayrex',
            status: 'online',
            lastSeen: new Date(),
            createdAt: new Date(),
            friendsCount: 0,
            postsCount: 0,
            giftsCount: 0,
            banned: false
        };

        this.dataManager.users.push(user);
        this.dataManager.saveData();

        const token = this.securitySystem.createSession(userId);
        const device = this.dataManager.registerDevice(userId, req);

        this.securitySystem.logSecurityEvent(user, 'REGISTER', 'SUCCESS');

        console.log(`👤 Новый пользователь: ${displayName} (@${username})`);

        this.sendSuccess(res, {
            token: token,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                avatar: user.avatar,
                description: user.description,
                coins: user.coins,
                verified: user.verified,
                isDeveloper: user.isDeveloper,
                status: user.status,
                lastSeen: user.lastSeen,
                createdAt: user.createdAt,
                friendsCount: user.friendsCount,
                postsCount: user.postsCount,
                giftsCount: user.giftsCount,
                banned: user.banned
            },
            device: device
        });
    }

    handleLogin(data, req, res) {
        const { username, password } = data;
        
        if (!username || !password) {
            this.sendError(res, 'Введите имя пользователя и пароль', 400);
            return;
        }

        const user = this.dataManager.users.find(u => u.username === username);
        if (!user) {
            this.sendError(res, 'Неверное имя пользователя или пароль', 401);
            return;
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'LOGIN', 'SYSTEM', false);
            this.sendError(res, 'Ваш аккаунт заблокирован', 403);
            return;
        }

        if (!this.securitySystem.verifyPassword(password, user.password)) {
            this.securitySystem.logSecurityEvent(user, 'LOGIN', 'FAILED');
            this.sendError(res, 'Неверное имя пользователя или пароль', 401);
            return;
        }

        const token = this.securitySystem.createSession(user.id);
        const device = this.dataManager.registerDevice(user.id, req);

        user.status = 'online';
        user.lastSeen = new Date();
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'LOGIN', 'SUCCESS');

        console.log(`🔐 Пользователь ${user.displayName} вошел в систему`);

        this.sendSuccess(res, {
            token: token,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                avatar: user.avatar,
                description: user.description,
                coins: user.coins,
                verified: user.verified,
                isDeveloper: user.isDeveloper,
                status: user.status,
                lastSeen: user.lastSeen,
                createdAt: user.createdAt,
                friendsCount: user.friendsCount,
                postsCount: user.postsCount,
                giftsCount: user.giftsCount,
                banned: user.banned
            },
            device: device
        });
    }

    handleCurrentUser(req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        this.sendSuccess(res, {
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                avatar: user.avatar,
                description: user.description,
                coins: user.coins,
                verified: user.verified,
                isDeveloper: user.isDeveloper,
                status: user.status,
                lastSeen: user.lastSeen,
                createdAt: user.createdAt,
                friendsCount: user.friendsCount,
                postsCount: user.postsCount,
                giftsCount: user.giftsCount,
                banned: user.banned
            }
        });
    }

    handleGetUsers(req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const users = this.dataManager.users
            .filter(u => u.id !== user.id)
            .map(u => ({
                id: u.id,
                username: u.username,
                displayName: u.displayName,
                avatar: u.avatar,
                description: u.description,
                coins: u.coins,
                verified: u.verified,
                isDeveloper: u.isDeveloper,
                status: u.status,
                lastSeen: u.lastSeen,
                createdAt: u.createdAt,
                friendsCount: u.friendsCount,
                postsCount: u.postsCount,
                giftsCount: u.giftsCount,
                banned: u.banned
            }));

        this.sendSuccess(res, { users: users });
    }

    handleGetPosts(req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        try {
            const posts = this.dataManager.posts
                .filter(post => !post.banned)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map(post => {
                    const postUser = this.dataManager.users.find(u => u.id === post.userId);
                    return {
                        ...post,
                        userName: postUser ? postUser.displayName : 'Неизвестный пользователь',
                        userAvatar: postUser ? postUser.avatar : null,
                        userVerified: postUser ? postUser.verified : false,
                        userIsDeveloper: postUser ? postUser.isDeveloper : false
                    };
                });

            this.sendSuccess(res, { posts: posts });
        } catch (error) {
            console.error('❌ Ошибка получения постов:', error);
            this.sendError(res, 'Ошибка получения постов');
        }
    }

    handleGetUserPosts(query, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const { userId } = query;
        
        if (!userId) {
            this.sendError(res, 'Не указан пользователь', 400);
            return;
        }

        try {
            const posts = this.dataManager.posts
                .filter(post => post.userId === userId && !post.banned)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map(post => {
                    const postUser = this.dataManager.users.find(u => u.id === post.userId);
                    return {
                        ...post,
                        userName: postUser ? postUser.displayName : 'Неизвестный пользователь',
                        userAvatar: postUser ? postUser.avatar : null,
                        userVerified: postUser ? postUser.verified : false,
                        userIsDeveloper: postUser ? postUser.isDeveloper : false
                    };
                });

            this.sendSuccess(res, { posts: posts });
        } catch (error) {
            console.error('❌ Ошибка получения постов пользователя:', error);
            this.sendError(res, 'Ошибка получения постов пользователя');
        }
    }

    handleCreatePost(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const { text, image, file, fileName, fileType } = data;
        
        if (!text && !image && !file) {
            this.sendError(res, 'Пост не может быть пустым', 400);
            return;
        }

        try {
            const post = {
                id: this.dataManager.generateId(),
                userId: user.id,
                text: text ? this.securitySystem.sanitizeContent(text) : null,
                image: image || null,
                file: file || null,
                fileName: fileName || null,
                fileType: fileType || null,
                likes: [],
                comments: [],
                views: 0,
                createdAt: new Date(),
                banned: false
            };

            this.dataManager.posts.unshift(post);
            this.dataManager.saveData();

            // Обновляем счетчик постов пользователя
            user.postsCount = (user.postsCount || 0) + 1;
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'CREATE_POST', `post:${post.id}`);

            console.log(`📝 Пользователь ${user.displayName} создал пост`);

            this.sendSuccess(res, {
                post: {
                    ...post,
                    userName: user.displayName,
                    userAvatar: user.avatar,
                    userVerified: user.verified,
                    userIsDeveloper: user.isDeveloper
                },
                message: 'Пост успешно создан'
            });
        } catch (error) {
            console.error('❌ Ошибка создания поста:', error);
            this.sendError(res, 'Ошибка создания поста: ' + error.message);
        }
    }

    handleDeletePost(query, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const { postId } = query;
        
        if (!postId) {
            this.sendError(res, 'Не указан ID поста', 400);
            return;
        }

        try {
            const post = this.dataManager.posts.find(p => p.id === postId);
            if (!post) {
                this.sendError(res, 'Пост не найден', 404);
                return;
            }

            // Проверяем права на удаление
            if (post.userId !== user.id && !user.isDeveloper) {
                this.sendError(res, 'Недостаточно прав для удаления поста', 403);
                return;
            }

            // Удаляем пост
            this.dataManager.posts = this.dataManager.posts.filter(p => p.id !== postId);
            this.dataManager.saveData();

            // Обновляем счетчик постов пользователя
            if (post.userId === user.id) {
                const postUser = this.dataManager.users.find(u => u.id === user.id);
                if (postUser) {
                    postUser.postsCount = Math.max(0, (postUser.postsCount || 1) - 1);
                }
            }

            this.securitySystem.logSecurityEvent(user, 'DELETE_POST', `post:${postId}`);

            console.log(`🗑️ Пользователь ${user.displayName} удалил пост ${postId}`);

            this.sendSuccess(res, { message: 'Пост успешно удален' });
        } catch (error) {
            console.error('❌ Ошибка удаления поста:', error);
            this.sendError(res, 'Ошибка удаления поста');
        }
    }

    handleLikePost(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const { postId } = data;
        
        if (!postId) {
            this.sendError(res, 'Не указан ID поста', 400);
            return;
        }

        try {
            const post = this.dataManager.posts.find(p => p.id === postId);
            if (!post) {
                this.sendError(res, 'Пост не найден', 404);
                return;
            }

            const likeIndex = post.likes.indexOf(user.id);
            
            if (likeIndex === -1) {
                // Добавляем лайк
                post.likes.push(user.id);
            } else {
                // Убираем лайк
                post.likes.splice(likeIndex, 1);
            }

            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'LIKE_POST', `post:${postId}, action:${likeIndex === -1 ? 'like' : 'unlike'}`);

            this.sendSuccess(res, {
                likes: post.likes,
                liked: likeIndex === -1
            });
        } catch (error) {
            console.error('❌ Ошибка лайка поста:', error);
            this.sendError(res, 'Ошибка лайка поста');
        }
    }

    handleAddComment(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const { postId, text, parentCommentId } = data;
        
        if (!postId || !text) {
            this.sendError(res, 'Не указан пост или текст комментария', 400);
            return;
        }

        try {
            const post = this.dataManager.posts.find(p => p.id === postId);
            if (!post) {
                this.sendError(res, 'Пост не найден', 404);
                return;
            }

            if (!post.comments) {
                post.comments = [];
            }

            const comment = {
                id: this.dataManager.generateId(),
                userId: user.id,
                text: this.securitySystem.sanitizeContent(text),
                likes: [],
                replies: [],
                createdAt: new Date()
            };

            if (parentCommentId) {
                // Это ответ на комментарий
                const parentComment = post.comments.find(c => c.id === parentCommentId);
                if (parentComment) {
                    if (!parentComment.replies) {
                        parentComment.replies = [];
                    }
                    parentComment.replies.push(comment);
                } else {
                    this.sendError(res, 'Родительский комментарий не найден', 404);
                    return;
                }
            } else {
                // Это основной комментарий
                post.comments.push(comment);
            }

            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'ADD_COMMENT', `post:${postId}, comment:${comment.id}`);

            console.log(`💬 Пользователь ${user.displayName} добавил комментарий к посту ${postId}`);

            this.sendSuccess(res, {
                comment: {
                    ...comment,
                    userName: user.displayName,
                    userAvatar: user.avatar,
                    userVerified: user.verified,
                    userIsDeveloper: user.isDeveloper
                },
                message: 'Комментарий добавлен'
            });
        } catch (error) {
            console.error('❌ Ошибка добавления комментария:', error);
            this.sendError(res, 'Ошибка добавления комментария');
        }
    }

    handleSharePost(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const { postId } = data;
        
        if (!postId) {
            this.sendError(res, 'Не указан ID поста', 400);
            return;
        }

        try {
            const originalPost = this.dataManager.posts.find(p => p.id === postId);
            if (!originalPost) {
                this.sendError(res, 'Пост не найден', 404);
                return;
            }

            // Создаем репост
            const sharePost = {
                id: this.dataManager.generateId(),
                userId: user.id,
                text: `🔁 Репост: ${originalPost.text ? originalPost.text.substring(0, 100) + '...' : 'Пост'}`,
                originalPostId: postId,
                likes: [],
                comments: [],
                views: 0,
                createdAt: new Date(),
                banned: false,
                isShare: true
            };

            this.dataManager.posts.unshift(sharePost);
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'SHARE_POST', `post:${postId}, share:${sharePost.id}`);

            console.log(`🔁 Пользователь ${user.displayName} сделал репост ${postId}`);

            this.sendSuccess(res, {
                post: {
                    ...sharePost,
                    userName: user.displayName,
                    userAvatar: user.avatar,
                    userVerified: user.verified,
                    userIsDeveloper: user.isDeveloper
                },
                message: 'Пост успешно опубликован'
            });
        } catch (error) {
            console.error('❌ Ошибка репоста:', error);
            this.sendError(res, 'Ошибка репоста');
        }
    }

    handleGetGifts(req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        this.sendSuccess(res, { gifts: this.dataManager.gifts });
    }

    handleCreateGift(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        if (!user.isDeveloper) {
            this.sendError(res, 'Недостаточно прав', 403);
            return;
        }

        const { name, type, preview, price, image } = data;
        
        if (!name || !type || !price) {
            this.sendError(res, 'Все поля обязательны', 400);
            return;
        }

        try {
            const gift = {
                id: this.dataManager.generateId(),
                name: this.securitySystem.sanitizeContent(name),
                type: type,
                preview: preview || '🎁',
                price: parseInt(price),
                image: image || null
            };

            this.dataManager.gifts.push(gift);
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'CREATE_GIFT', `gift:${name}, price:${price}`);

            console.log(`🎁 Администратор ${user.displayName} создал подарок: ${name}`);

            this.sendSuccess(res, {
                gift: gift,
                message: 'Подарок успешно создан'
            });
        } catch (error) {
            console.error('❌ Ошибка создания подарка:', error);
            this.sendError(res, 'Ошибка создания подарка');
        }
    }

    handleDeleteGift(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        if (!user.isDeveloper) {
            this.sendError(res, 'Недостаточно прав', 403);
            return;
        }

        const { giftId } = data;
        
        if (!giftId) {
            this.sendError(res, 'Не указан ID подарка', 400);
            return;
        }

        try {
            const gift = this.dataManager.gifts.find(g => g.id === giftId);
            if (!gift) {
                this.sendError(res, 'Подарок не найден', 404);
                return;
            }

            this.dataManager.gifts = this.dataManager.gifts.filter(g => g.id !== giftId);
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'DELETE_GIFT', `gift:${giftId}`);

            console.log(`🗑️ Администратор ${user.displayName} удалил подарок: ${gift.name}`);

            this.sendSuccess(res, { message: 'Подарок успешно удален' });
        } catch (error) {
            console.error('❌ Ошибка удаления подарка:', error);
            this.sendError(res, 'Ошибка удаления подарка');
        }
    }

    handleBuyGift(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const { giftId, toUserId } = data;
        
        if (!giftId || !toUserId) {
            this.sendError(res, 'Не указан подарок или получатель', 400);
            return;
        }

        try {
            const gift = this.dataManager.gifts.find(g => g.id === giftId);
            if (!gift) {
                this.sendError(res, 'Подарок не найден', 404);
                return;
            }

            const toUser = this.dataManager.users.find(u => u.id === toUserId);
            if (!toUser) {
                this.sendError(res, 'Получатель не найден', 404);
                return;
            }

            if (user.coins < gift.price) {
                this.sendError(res, 'Недостаточно E-COIN для покупки', 400);
                return;
            }

            // Списание coins
            user.coins -= gift.price;
            
            // Создаем запись о отправленном подарке
            const sentGift = {
                id: this.dataManager.generateId(),
                fromUserId: user.id,
                toUserId: toUserId,
                giftId: giftId,
                giftName: gift.name,
                giftPreview: gift.preview,
                giftImage: gift.image,
                giftPrice: gift.price,
                sentAt: new Date()
            };

            if (!this.dataManager.sentGifts) {
                this.dataManager.sentGifts = [];
            }
            this.dataManager.sentGifts.push(sentGift);

            // Обновляем счетчики подарков
            user.giftsCount = (user.giftsCount || 0) + 1;
            toUser.giftsCount = (toUser.giftsCount || 0) + 1;

            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'BUY_GIFT', `gift:${gift.name}, to:${toUser.username}, price:${gift.price}`);

            console.log(`🎁 Пользователь ${user.displayName} отправил подарок ${gift.name} пользователю ${toUser.displayName}`);

            this.sendSuccess(res, {
                gift: sentGift,
                newBalance: user.coins,
                message: 'Подарок успешно отправлен!'
            });
        } catch (error) {
            console.error('❌ Ошибка покупки подарка:', error);
            this.sendError(res, 'Ошибка покупки подарка');
        }
    }

    handleGetUserGifts(query, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const { userId } = query;
        
        if (!userId) {
            this.sendError(res, 'Не указан пользователь', 400);
            return;
        }

        try {
            const sentGifts = this.dataManager.sentGifts || [];
            const userGifts = sentGifts.filter(gift => gift.toUserId === userId);

            // Добавляем информацию об отправителе
            const giftsWithSenders = userGifts.map(gift => {
                const fromUser = this.dataManager.users.find(u => u.id === gift.fromUserId);
                return {
                    ...gift,
                    fromUserName: fromUser ? fromUser.displayName : 'Неизвестный пользователь',
                    fromUserAvatar: fromUser ? fromUser.avatar : null
                };
            });

            this.sendSuccess(res, { gifts: giftsWithSenders });
        } catch (error) {
            console.error('❌ Ошибка получения подарков пользователя:', error);
            this.sendError(res, 'Ошибка получения подарков пользователя');
        }
    }

    handleGetPromoCodes(req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        if (!user.isDeveloper) {
            this.sendError(res, 'Недостаточно прав', 403);
            return;
        }

        this.sendSuccess(res, { promoCodes: this.dataManager.promoCodes });
    }

    handleCreatePromoCode(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        if (!user.isDeveloper) {
            this.sendError(res, 'Недостаточно прав', 403);
            return;
        }

        const { code, coins, max_uses } = data;
        
        if (!code || !coins) {
            this.sendError(res, 'Все поля обязательны', 400);
            return;
        }

        try {
            // Проверяем уникальность кода
            if (this.dataManager.promoCodes.find(p => p.code === code.toUpperCase())) {
                this.sendError(res, 'Промокод с таким кодом уже существует', 400);
                return;
            }

            const promoCode = {
                id: this.dataManager.generateId(),
                code: code.toUpperCase(),
                coins: parseInt(coins),
                max_uses: parseInt(max_uses) || 0,
                used_count: 0,
                created_at: new Date()
            };

            this.dataManager.promoCodes.push(promoCode);
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'CREATE_PROMO_CODE', `code:${code}, coins:${coins}`);

            console.log(`🎫 Администратор ${user.displayName} создал промокод: ${code}`);

            this.sendSuccess(res, {
                promoCode: promoCode,
                message: 'Промокод успешно создан'
            });
        } catch (error) {
            console.error('❌ Ошибка создания промокода:', error);
            this.sendError(res, 'Ошибка создания промокода');
        }
    }

    handleDeletePromoCode(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        if (!user.isDeveloper) {
            this.sendError(res, 'Недостаточно прав', 403);
            return;
        }

        const { promoCodeId } = data;
        
        if (!promoCodeId) {
            this.sendError(res, 'Не указан ID промокода', 400);
            return;
        }

        try {
            const promoCode = this.dataManager.promoCodes.find(p => p.id === promoCodeId);
            if (!promoCode) {
                this.sendError(res, 'Промокод не найден', 404);
                return;
            }

            this.dataManager.promoCodes = this.dataManager.promoCodes.filter(p => p.id !== promoCodeId);
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'DELETE_PROMO_CODE', `code:${promoCode.code}`);

            console.log(`🗑️ Администратор ${user.displayName} удалил промокод: ${promoCode.code}`);

            this.sendSuccess(res, { message: 'Промокод успешно удален' });
        } catch (error) {
            console.error('❌ Ошибка удаления промокода:', error);
            this.sendError(res, 'Ошибка удаления промокода');
        }
    }

    handleActivatePromoCode(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const { code } = data;
        
        if (!code) {
            this.sendError(res, 'Введите промокод', 400);
            return;
        }

        try {
            const promoCode = this.dataManager.promoCodes.find(p => p.code === code.toUpperCase());
            if (!promoCode) {
                this.sendError(res, 'Промокод не найден', 404);
                return;
            }

            // Проверяем лимит использований
            if (promoCode.max_uses > 0 && promoCode.used_count >= promoCode.max_uses) {
                this.sendError(res, 'Промокод уже использован максимальное количество раз', 400);
                return;
            }

            // Начисляем coins
            user.coins += promoCode.coins;
            promoCode.used_count += 1;

            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'ACTIVATE_PROMO_CODE', `code:${code}, coins:${promoCode.coins}`);

            console.log(`🎫 Пользователь ${user.displayName} активировал промокод: ${code}`);

            this.sendSuccess(res, {
                coins: promoCode.coins,
                newBalance: user.coins,
                message: `Промокод активирован! Начислено ${promoCode.coins} E-COIN`
            });
        } catch (error) {
            console.error('❌ Ошибка активации промокода:', error);
            this.sendError(res, 'Ошибка активации промокода');
        }
    }

    handleGetMusic(req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        try {
            const music = this.dataManager.music
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map(track => {
                    const trackUser = this.dataManager.users.find(u => u.id === track.userId);
                    return {
                        ...track,
                        userName: trackUser ? trackUser.displayName : 'Неизвестный пользователь',
                        userAvatar: trackUser ? trackUser.avatar : null,
                        userVerified: trackUser ? trackUser.verified : false
                    };
                });

            this.sendSuccess(res, { music: music });
        } catch (error) {
            console.error('❌ Ошибка получения музыки:', error);
            this.sendError(res, 'Ошибка получения музыки');
        }
    }

    handleGetPlaylists(req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        try {
            const playlists = this.dataManager.playlists
                .filter(playlist => playlist.userId === user.id)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            this.sendSuccess(res, { playlists: playlists });
        } catch (error) {
            console.error('❌ Ошибка получения плейлистов:', error);
            this.sendError(res, 'Ошибка получения плейлистов');
        }
    }

    handleCreatePlaylist(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const { name, description } = data;
        
        if (!name) {
            this.sendError(res, 'Введите название плейлиста', 400);
            return;
        }

        try {
            const playlist = {
                id: this.dataManager.generateId(),
                userId: user.id,
                name: this.securitySystem.sanitizeContent(name),
                description: description ? this.securitySystem.sanitizeContent(description) : '',
                tracks: [],
                createdAt: new Date()
            };

            this.dataManager.playlists.push(playlist);
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'CREATE_PLAYLIST', `playlist:${name}`);

            console.log(`🎵 Пользователь ${user.displayName} создал плейлист: ${name}`);

            this.sendSuccess(res, {
                playlist: playlist,
                message: 'Плейлист успешно создан'
            });
        } catch (error) {
            console.error('❌ Ошибка создания плейлиста:', error);
            this.sendError(res, 'Ошибка создания плейлиста');
        }
    }

    handleAddTrackToPlaylist(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const { playlistId, trackId } = data;
        
        if (!playlistId || !trackId) {
            this.sendError(res, 'Не указан плейлист или трек', 400);
            return;
        }

        try {
            const playlist = this.dataManager.playlists.find(p => p.id === playlistId && p.userId === user.id);
            if (!playlist) {
                this.sendError(res, 'Плейлист не найден', 404);
                return;
            }

            const track = this.dataManager.music.find(t => t.id === trackId);
            if (!track) {
                this.sendError(res, 'Трек не найден', 404);
                return;
            }

            if (!playlist.tracks.includes(trackId)) {
                playlist.tracks.push(trackId);
                this.dataManager.saveData();

                this.securitySystem.logSecurityEvent(user, 'ADD_TRACK_TO_PLAYLIST', `playlist:${playlistId}, track:${trackId}`);

                this.sendSuccess(res, {
                    message: 'Трек добавлен в плейлист'
                });
            } else {
                this.sendError(res, 'Трек уже есть в плейлисте', 400);
            }
        } catch (error) {
            console.error('❌ Ошибка добавления трека в плейлист:', error);
            this.sendError(res, 'Ошибка добавления трека в плейлист');
        }
    }

    handleGetEmoji(req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const emojiList = [
            { name: 'smile', url: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f600.png' },
            { name: 'heart', url: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/2764-fe0f.png' },
            { name: 'fire', url: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f525.png' },
            { name: 'thumbsup', url: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f44d.png' },
            { name: 'star', url: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/2b50.png' },
            { name: 'clap', url: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f44f.png' },
            { name: 'laughing', url: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f606.png' },
            { name: 'wink', url: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f609.png' },
            { name: 'cool', url: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f60e.png' },
            { name: 'kiss', url: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f618.png' }
        ];

        this.sendSuccess(res, { emoji: emojiList });
    }

    // АДМИН МЕТОДЫ

    handleAdminGetUsers(req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        if (!user.isDeveloper) {
            this.sendError(res, 'Недостаточно прав', 403);
            return;
        }

        this.sendSuccess(res, { users: this.dataManager.users });
    }

    handleAdminBanUser(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        if (!user.isDeveloper) {
            this.sendError(res, 'Недостаточно прав', 403);
            return;
        }

        const { userId, banned } = data;
        
        if (!userId) {
            this.sendError(res, 'Не указан пользователь', 400);
            return;
        }

        try {
            const targetUser = this.dataManager.users.find(u => u.id === userId);
            if (!targetUser) {
                this.sendError(res, 'Пользователь не найден', 404);
                return;
            }

            targetUser.banned = !!banned;
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'ADMIN_BAN_USER', `target:${targetUser.username}, banned:${banned}`);

            console.log(`🔨 Администратор ${user.displayName} ${banned ? 'заблокировал' : 'разблокировал'} пользователя ${targetUser.displayName}`);

            this.sendSuccess(res, {
                message: `Пользователь ${banned ? 'заблокирован' : 'разблокирован'}`,
                user: targetUser
            });
        } catch (error) {
            console.error('❌ Ошибка блокировки пользователя:', error);
            this.sendError(res, 'Ошибка блокировки пользователя');
        }
    }

    handleAdminVerifyUser(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        if (!user.isDeveloper) {
            this.sendError(res, 'Недостаточно прав', 403);
            return;
        }

        const { userId, verified } = data;
        
        if (!userId) {
            this.sendError(res, 'Не указан пользователь', 400);
            return;
        }

        try {
            const targetUser = this.dataManager.users.find(u => u.id === userId);
            if (!targetUser) {
                this.sendError(res, 'Пользователь не найден', 404);
                return;
            }

            targetUser.verified = !!verified;
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'ADMIN_VERIFY_USER', `target:${targetUser.username}, verified:${verified}`);

            console.log(`✅ Администратор ${user.displayName} ${verified ? 'верифицировал' : 'снял верификацию с'} пользователя ${targetUser.displayName}`);

            this.sendSuccess(res, {
                message: `Пользователь ${verified ? 'верифицирован' : 'лишен верификации'}`,
                user: targetUser
            });
        } catch (error) {
            console.error('❌ Ошибка верификации пользователя:', error);
            this.sendError(res, 'Ошибка верификации пользователя');
        }
    }

    handleAdminMakeDeveloper(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        if (!user.isDeveloper) {
            this.sendError(res, 'Недостаточно прав', 403);
            return;
        }

        const { userId, isDeveloper } = data;
        
        if (!userId) {
            this.sendError(res, 'Не указан пользователь', 400);
            return;
        }

        try {
            const targetUser = this.dataManager.users.find(u => u.id === userId);
            if (!targetUser) {
                this.sendError(res, 'Пользователь не найден', 404);
                return;
            }

            targetUser.isDeveloper = !!isDeveloper;
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'ADMIN_MAKE_DEVELOPER', `target:${targetUser.username}, developer:${isDeveloper}`);

            console.log(`👑 Администратор ${user.displayName} ${isDeveloper ? 'назначил' : 'снял'} права разработчика у пользователя ${targetUser.displayName}`);

            this.sendSuccess(res, {
                message: `Права разработчика ${isDeveloper ? 'назначены' : 'сняты'}`,
                user: targetUser
            });
        } catch (error) {
            console.error('❌ Ошибка назначения прав разработчика:', error);
            this.sendError(res, 'Ошибка назначения прав разработчика');
        }
    }

    handleAdminMaintenance(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        if (!user.isDeveloper) {
            this.sendError(res, 'Недостаточно прав', 403);
            return;
        }

        const { enabled } = data;
        
        this.dataManager.setMaintenanceMode(!!enabled);

        this.securitySystem.logSecurityEvent(user, 'ADMIN_MAINTENANCE', `enabled:${enabled}`);

        console.log(`🔧 Администратор ${user.displayName} ${enabled ? 'включил' : 'выключил'} режим технических работ`);

        this.sendSuccess(res, {
            message: `Режим технических работ ${enabled ? 'включен' : 'выключен'}`,
            maintenanceMode: this.dataManager.maintenanceMode
        });
    }

    handleAdminExportDatabase(req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        if (!user.isDeveloper) {
            this.sendError(res, 'Недостаточно прав', 403);
            return;
        }

        try {
            const exportData = {
                exportInfo: {
                    exportedAt: new Date().toISOString(),
                    exportedBy: user.username,
                    version: '1.0'
                },
                data: {
                    users: this.dataManager.users,
                    messages: this.dataManager.messages,
                    posts: this.dataManager.posts,
                    gifts: this.dataManager.gifts,
                    promoCodes: this.dataManager.promoCodes,
                    music: this.dataManager.music,
                    playlists: this.dataManager.playlists,
                    groups: this.dataManager.groups,
                    bannedIPs: Object.fromEntries(this.dataManager.bannedIPs),
                    devices: Object.fromEntries(this.dataManager.devices)
                }
            };

            this.securitySystem.logSecurityEvent(user, 'EXPORT_DATABASE', 'SUCCESS');

            console.log(`💾 Администратор ${user.displayName} экспортировал базу данных`);

            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Disposition': 'attachment; filename="epic-messenger-backup.json"'
            });
            res.end(JSON.stringify(exportData, null, 2));
        } catch (error) {
            console.error('❌ Ошибка экспорта базы данных:', error);
            this.sendError(res, 'Ошибка экспорта базы данных');
        }
    }

    handleAdminSecurityLogs(req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        if (!user.isDeveloper) {
            this.sendError(res, 'Недостаточно прав', 403);
            return;
        }

        try {
            const logs = this.securitySystem.getSecurityLogs();
            this.sendSuccess(res, { logs: logs });
        } catch (error) {
            console.error('❌ Ошибка получения логов безопасности:', error);
            this.sendError(res, 'Ошибка получения логов безопасности');
        }
    }

    handleGetDevices(req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        try {
            const devices = this.dataManager.getUserDevices(user.id);
            this.sendSuccess(res, { devices: devices });
        } catch (error) {
            console.error('❌ Ошибка получения устройств:', error);
            this.sendError(res, 'Ошибка получения устройств');
        }
    }

    handleTerminateDevice(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const { deviceId } = data;
        
        if (!deviceId) {
            this.sendError(res, 'Не указано устройство', 400);
            return;
        }

        try {
            const success = this.dataManager.terminateDevice(user.id, deviceId);
            
            if (success) {
                this.securitySystem.logSecurityEvent(user, 'TERMINATE_DEVICE', `device:${deviceId}`);
                this.sendSuccess(res, { message: 'Устройство отключено' });
            } else {
                this.sendError(res, 'Не удалось отключить устройство', 400);
            }
        } catch (error) {
            console.error('❌ Ошибка отключения устройства:', error);
            this.sendError(res, 'Ошибка отключения устройства');
        }
    }

    // ДОПОЛНИТЕЛЬНЫЕ МЕТОДЫ ДЛЯ ФАЙЛОВ

    handleDebugUpload(req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        this.sendSuccess(res, {
            message: 'Upload debug endpoint',
            user: user.username,
            timestamp: new Date().toISOString()
        });
    }

    handlePreviewAvatar(data, req, res) {
        const user = this.authenticateRequest(req, res);
        if (!user) return;

        const { avatar } = data;
        
        if (!avatar) {
            this.sendError(res, 'Не указан аватар', 400);
            return;
        }

        try {
            // Просто возвращаем данные для предпросмотра
            this.sendSuccess(res, {
                avatar: avatar,
                message: 'Предпросмотр аватара'
            });
        } catch (error) {
            console.error('❌ Ошибка предпросмотра аватара:', error);
            this.sendError(res, 'Ошибка предпросмотра аватара');
        }
    }

    sendSuccess(res, data) {
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ success: true, ...data }));
    }

    sendError(res, message, statusCode = 500) {
        res.writeHead(statusCode, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ success: false, message: message }));
    }
 
    getFileExtension(fileType) {
        const extensions = {
            'image': '.jpg',
            'video': '.mp4',
            'audio': '.mp3'
        };
        return extensions[fileType] || '.bin';
    }
}

module.exports = ApiHandlers;
