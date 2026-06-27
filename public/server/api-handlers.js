const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getClientIP, getDeviceInfo, generateDeviceId } = require('./utils');

class ApiHandlers {
    constructor(dataManager, securitySystem, fileHandlers) {
        this.dataManager = dataManager;
        this.securitySystem = securitySystem;
        this.fileHandlers = fileHandlers;
    }

    // 🔥 АУТЕНТИФИКАЦИЯ ТОКЕНА
    authenticateToken(token) {
        if (!token) return null;
        
        try {
            // Пробуем новый формат (base64 JSON)
            let userId, sessionId;
            try {
                const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
                userId = decoded.userId;
                sessionId = decoded.sessionId;
            } catch {
                // Старый формат (session token)
                const session = this.securitySystem.validateSession(token);
                if (!session) return null;
                userId = session.userId;
                sessionId = session.id;
            }
            
            const user = this.dataManager.users.find(u => u.id === userId);
            if (user && user.sessionId === sessionId) {
                user.lastSeen = new Date();
                return user;
            }
        } catch (error) {
            console.log('❌ Ошибка аутентификации токена:', error);
        }
        return null;
    }

    processApiRequest(pathname, method, data, query, req, res) {
        console.log(`🔄 Processing API: ${method} ${pathname}`);
        console.log(`📦 Request data keys:`, Object.keys(data));
        console.log(`❓ Query params:`, query);
        
        const headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Content-Length, Accept, Origin',
            'Access-Control-Allow-Credentials': 'true'
        };

        // 🔐 Устанавливаем безопасные заголовки
        this.securitySystem.setSecurityHeaders(res);

        if (method === 'OPTIONS') {
            res.writeHead(204, headers);
            res.end();
            return;
        }

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

        let response;

        try {
            switch (pathname) {
                // === АУТЕНТИФИКАЦИЯ ===
                case '/api/login':
                    if (method === 'POST') response = this.handleLogin(data, req);
                    break;
                case '/api/register':
                    if (method === 'POST') response = this.handleRegister(data, req);
                    break;
                case '/api/check-auth':
                    if (method === 'GET') response = this.handleCheckAuth(token, req);
                    break;
                case '/api/current-user':
                    if (method === 'GET') response = this.handleCurrentUser(token, req);
                    break;
                case '/api/logout':
                    if (method === 'POST') response = this.handleLogout(token);
                    break;

                // === ПОЛЬЗОВАТЕЛИ ===
                case '/api/users':
                    if (method === 'GET') response = this.handleGetUsers(token);
                    break;
                case '/api/users/search':
                    if (method === 'GET') response = this.handleSearchUsers(token, query);
                    break;
                case '/api/user-by-username':
                    if (method === 'POST') response = this.handleGetUserByUsername(token, data);
                    break;
                case '/api/update-profile':
                    if (method === 'POST') response = this.handleUpdateProfile(token, data);
                    break;
                case '/api/update-avatar':
                    if (method === 'POST') response = this.handleUpdateAvatar(token, data);
                    break;

                // === ПОСТЫ ===
                case '/api/posts':
                    if (method === 'GET') response = this.handleGetPosts(token);
                    else if (method === 'POST') response = this.handleCreatePost(token, data);
                    else if (method === 'DELETE') response = this.handleDeletePost(token, query);
                    break;
                case '/api/posts/user':
                    if (method === 'GET') response = this.handleGetUserPosts(token, query);
                    break;
                case '/api/posts/like':
                    if (method === 'POST') response = this.handleLikePost(token, data);
                    break;

                // === КОММЕНТАРИИ ===
                case '/api/posts/comments':
                    if (method === 'GET') response = this.handleGetComments(token, query);
                    else if (method === 'POST') response = this.handleAddComment(token, data);
                    break;

                // === ЧАТЫ И СООБЩЕНИЯ ===
                case '/api/chats':
                    if (method === 'GET') response = this.handleGetChats(token);
                    break;
                case '/api/chats/start':
                    if (method === 'POST') response = this.handleStartChat(token, data);
                    break;
                case '/api/messages':
                    if (method === 'GET') response = this.handleGetMessages(token, query);
                    break;
                case '/api/messages/send':
                    if (method === 'POST') response = this.handleSendMessage(token, data);
                    break;
                case '/api/messages/mark-read':
                    if (method === 'POST') response = this.handleMarkAsRead(token, data);
                    break;
                case '/api/messages/edit':
                    if (method === 'POST') response = this.handleEditMessage(token, data);
                    break;
                case '/api/messages/delete':
                    if (method === 'POST') response = this.handleDeleteMessage(token, data);
                    break;

                // === ГРУППЫ ===
                case '/api/groups/create':
                    if (method === 'POST') response = this.handleCreateGroup(token, data);
                    break;
                case '/api/groups':
                    if (method === 'GET') response = this.handleGetUserGroups(token);
                    break;
                case '/api/groups/add-member':
                    if (method === 'POST') response = this.handleAddToGroup(token, data);
                    break;
                case '/api/groups/join':
                    if (method === 'POST') response = this.handleJoinGroup(token, data);
                    break;
                case '/api/groups/leave':
                    if (method === 'POST') response = this.handleLeaveGroup(token, data);
                    break;

                // === ПОДАРКИ ===
                case '/api/gifts':
                    if (method === 'GET') response = this.handleGetGifts(token);
                    else if (method === 'POST') response = this.handleCreateGift(token, data);
                    else if (method === 'DELETE') response = this.handleDeleteGift(token, data);
                    break;
                case '/api/gifts/buy':
                    if (method === 'POST') response = this.handleBuyGift(token, data);
                    break;
                case '/api/my-gifts':
                    if (method === 'GET') response = this.handleGetMyGifts(token);
                    break;

                // === ПРОМОКОДЫ ===
                case '/api/promo-codes':
                    if (method === 'GET') response = this.handleGetPromoCodes(token);
                    else if (method === 'DELETE') response = this.handleDeletePromoCode(token, data);
                    break;
                case '/api/promo-codes/create':
                    if (method === 'POST') response = this.handleCreatePromoCode(token, data);
                    break;
                case '/api/promo-codes/activate':
                    if (method === 'POST') response = this.handleActivatePromoCode(token, data);
                    break;

                // === ЭМОДЗИ ===
                case '/api/emoji':
                    if (method === 'GET') response = this.handleGetEmoji(token);
                    break;

                // === УСТРОЙСТВА ===
                case '/api/devices':
                    if (method === 'GET') response = this.handleGetDevices(token);
                    break;
                case '/api/devices/terminate':
                    if (method === 'POST') response = this.handleTerminateDevice(token, data);
                    break;

                // === E-COIN ===
                case '/api/ecoins/balance':
                    if (method === 'GET') response = this.handleGetBalance(token);
                    break;

                // === МУЗЫКА ===
                case '/api/music':
                    if (method === 'GET') response = this.handleGetMusic(token);
                    break;
                case '/api/music/upload-full':
                    if (method === 'POST') response = this.handleUploadMusicFull(token, data);
                    break;
                case '/api/music/delete':
                    if (method === 'POST') response = this.handleDeleteMusic(token, data);
                    break;
                case '/api/music/search':
                    if (method === 'GET') response = this.handleSearchMusic(token, query);
                    break;

                // === АДМИН ===
                case '/api/admin/stats':
                    if (method === 'GET') response = this.handleAdminStats(token);
                    break;
                case '/api/admin/delete-user':
                    if (method === 'POST') response = this.handleDeleteUser(token, data);
                    break;
                case '/api/admin/ban-user':
                    if (method === 'POST') response = this.handleBanUser(token, data);
                    break;
                case '/api/admin/toggle-verification':
                    if (method === 'POST') response = this.handleToggleVerification(token, data);
                    break;
                case '/api/admin/toggle-developer':
                    if (method === 'POST') response = this.handleToggleDeveloper(token, data);
                    break;
                case '/api/admin/export-database':
                    if (method === 'GET') response = this.handleExportDatabase(token, res);
                    return;
                case '/api/admin/import-database':
                    if (method === 'POST') response = this.handleImportDatabase(token, data);
                    break;
                case '/api/admin/users':
                    if (method === 'GET') response = this.handleAdminGetUsers(token);
                    break;
                case '/api/admin/maintenance':
                    if (method === 'POST') response = this.handleMaintenanceMode(token, data);
                    else if (method === 'GET') response = this.handleGetMaintenanceStatus(token);
                    break;

                default:
                    // 🔥 Обработка /api/posts/:id (получение одного поста)
                    if (pathname.startsWith('/api/posts/') && method === 'GET') {
                        const postId = pathname.split('/')[3];
                        if (postId) {
                            response = this.handleGetPostById(token, postId);
                            break;
                        }
                    }
                    // 🔥 Обработка /api/posts/:postId/comments
                    if (pathname.startsWith('/api/posts/') && pathname.includes('/comments')) {
                        const parts = pathname.split('/');
                        const postId = parts[3];
                        if (parts.length === 5 && parts[4] === 'comments') {
                            if (method === 'GET') response = this.handleGetPostComments(token, postId);
                            else if (method === 'POST') response = this.handleAddPostComment(token, postId, data);
                        } else if (parts.length === 6 && parts[5] === 'like' && method === 'POST') {
                            const commentId = parts[4];
                            response = this.handleLikeComment(token, postId, commentId);
                        } else if (parts.length === 7 && parts[5] === 'reply' && method === 'POST') {
                            const commentId = parts[4];
                            response = this.handleAddReply(token, postId, commentId, data);
                        } else if (parts.length === 8 && parts[7] === 'like' && method === 'POST') {
                            const commentId = parts[4];
                            const replyId = parts[6];
                            response = this.handleLikeReply(token, postId, commentId, replyId);
                        } else {
                            response = { success: false, message: 'API endpoint not found' };
                        }
                        break;
                    }
                    // 🔥 Обработка /api/gifts/:giftId/buy
                    if (pathname.startsWith('/api/gifts/') && pathname.endsWith('/buy') && method === 'POST') {
                        const giftId = pathname.split('/')[3];
                        response = this.handleBuyGift(token, { giftId, ...data });
                        break;
                    }
                    response = { success: false, message: 'API endpoint not found' };
            }
        } catch (error) {
            console.error('API Error:', error);
            response = { success: false, message: error.message };
        }

        if (!response) {
            response = { success: false, message: 'Method not allowed' };
        }

        console.log(`📤 Response data:`, response);
        
        res.writeHead(response.success ? 200 : 400, headers);
        res.end(JSON.stringify(response));
    }

    // ============================================
    // === АУТЕНТИФИКАЦИЯ ===
    // ============================================

    handleLogin(data, req) {
        const { username, password } = data;
        
        if (!this.securitySystem.validateInput(username, 'username') || !password) {
            return { success: false, message: 'Некорректные данные для входа' };
        }

        const hashedPassword = this.securitySystem.hashPassword(password);
        const user = this.dataManager.users.find(u => u.username === username && u.password === hashedPassword);
        
        if (!user) {
            this.securitySystem.logSecurityEvent({ username }, 'LOGIN', 'SYSTEM', false);
            return { success: false, message: 'Неверное имя пользователя или пароль' };
        }

        // 🔧 ПРОВЕРКА ТЕХНИЧЕСКИХ РАБОТ
        if (this.dataManager.isMaintenanceMode && this.dataManager.isMaintenanceMode() && !user.isDeveloper) {
            return { 
                success: false, 
                message: 'В настоящее время ведутся технические работы. Пожалуйста, попробуйте позже.' 
            };
        }

        if (user.banned) {
            return { success: false, message: 'Аккаунт заблокирован' };
        }

        const clientIP = getClientIP(req);
        if (this.dataManager.isIPBanned(clientIP)) {
            return { success: false, message: 'Ваш IP адрес заблокирован' };
        }

        // Обновляем сессию
        user.sessionId = crypto.randomBytes(16).toString('hex');
        const device = this.dataManager.registerDevice(user.id, req);
        
        user.status = 'online';
        user.lastSeen = new Date();
        this.dataManager.saveData();

        const token = Buffer.from(JSON.stringify({
            userId: user.id,
            sessionId: user.sessionId
        })).toString('base64');

        this.securitySystem.logSecurityEvent(user, 'LOGIN', 'SYSTEM');

        return {
            success: true,
            token: token,
            deviceId: device.id,
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
                friendsCount: user.friendsCount || 0,
                postsCount: user.postsCount || 0,
                giftsCount: user.giftsCount || 0,
                banned: user.banned || false
            }
        };
    }

    handleRegister(data, req) {
        const { username, displayName, email, password } = data;

        const clientIP = getClientIP(req);
        if (this.dataManager.isIPBanned(clientIP)) {
            return { success: false, message: 'Ваш IP адрес заблокирован. Регистрация невозможна.' };
        }

        if (this.dataManager.isMaintenanceMode && this.dataManager.isMaintenanceMode()) {
            return { 
                success: false, 
                message: 'В настоящее время ведутся технические работы. Регистрация временно недоступна.' 
            };
        }

        if (!username || !displayName || !email || !password) {
            return { success: false, message: 'Все поля обязательны для заполнения' };
        }

        if (!this.securitySystem.validateInput(username, 'username')) {
            return { success: false, message: 'Некорректное имя пользователя' };
        }
        if (!this.securitySystem.validateInput(displayName, 'displayName')) {
            return { success: false, message: 'Некорректное отображаемое имя' };
        }
        if (!this.securitySystem.validateInput(email, 'email')) {
            return { success: false, message: 'Некорректный email' };
        }

        if (username.length < 3) {
            return { success: false, message: 'Имя пользователя должно содержать минимум 3 символа' };
        }

        if (password.length < 6) {
            return { success: false, message: 'Пароль должен содержать минимум 6 символов' };
        }

        const sanitizedUsername = this.securitySystem.sanitizeContent(username);
        const sanitizedDisplayName = this.securitySystem.sanitizeContent(displayName);
        const sanitizedEmail = this.securitySystem.sanitizeContent(email);

        const existingUser = this.dataManager.users.find(u => u.username === sanitizedUsername);
        if (existingUser) {
            return { success: false, message: 'Пользователь с таким именем уже существует' };
        }

        const existingEmail = this.dataManager.users.find(u => u.email === sanitizedEmail);
        if (existingEmail) {
            return { success: false, message: 'Пользователь с таким email уже существует' };
        }

        const isBayRex = sanitizedUsername.toLowerCase() === 'bayrex';
        
        const newUser = {
            id: this.dataManager.generateId(),
            username: sanitizedUsername,
            displayName: sanitizedDisplayName,
            email: sanitizedEmail,
            password: this.securitySystem.hashPassword(password),
            avatar: null,
            description: 'Новый пользователь Epic Messenger',
            coins: isBayRex ? 50000 : 1000,
            verified: isBayRex,
            isDeveloper: isBayRex,
            isAdmin: isBayRex,
            status: 'online',
            lastSeen: new Date(),
            createdAt: new Date(),
            sessionId: crypto.randomBytes(16).toString('hex'),
            gifts: [],
            isProtected: isBayRex,
            friendsCount: 0,
            postsCount: 0,
            giftsCount: 0,
            banned: false,
            followers: [],
            following: []
        };

        this.dataManager.users.push(newUser);

        const device = this.dataManager.registerDevice(newUser.id, req);
        
        const token = Buffer.from(JSON.stringify({
            userId: newUser.id,
            sessionId: newUser.sessionId
        })).toString('base64');
        
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(newUser, 'REGISTER', 'SYSTEM');

        if (isBayRex) {
            console.log(`👑 BayRex зарегистрирован с правами администратора!`);
        }

        return {
            success: true,
            message: isBayRex ? 
                'Аккаунт BayRex создан! Вы получили права администратора!' :
                'Аккаунт успешно создан! Добро пожаловать в Epic Messenger!',
            token: token,
            deviceId: device.id,
            user: {
                id: newUser.id,
                username: newUser.username,
                displayName: newUser.displayName,
                email: newUser.email,
                avatar: newUser.avatar,
                description: newUser.description,
                coins: newUser.coins,
                verified: newUser.verified,
                isDeveloper: newUser.isDeveloper,
                status: newUser.status,
                lastSeen: newUser.lastSeen,
                createdAt: newUser.createdAt,
                friendsCount: newUser.friendsCount,
                postsCount: newUser.postsCount,
                giftsCount: newUser.giftsCount,
                banned: newUser.banned
            }
        };
    }

    handleCheckAuth(token, req) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { authenticated: false };
        }

        if (user.banned) {
            return { authenticated: false, message: 'Аккаунт заблокирован' };
        }

        return {
            authenticated: true,
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
                friendsCount: user.friendsCount || 0,
                postsCount: user.postsCount || 0,
                giftsCount: user.giftsCount || 0,
                banned: user.banned || false
            }
        };
    }

    handleCurrentUser(token, req) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            return { success: false, message: 'Аккаунт заблокирован' };
        }

        return {
            success: true,
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
                friendsCount: user.friendsCount || 0,
                postsCount: user.postsCount || 0,
                giftsCount: user.giftsCount || 0,
                banned: user.banned || false
            }
        };
    }

    handleLogout(token) {
        const user = this.authenticateToken(token);
        if (user) {
            user.sessionId = crypto.randomBytes(16).toString('hex');
            user.status = 'offline';
            this.dataManager.saveData();
        }
        return { success: true, message: 'Выход выполнен' };
    }

    // ============================================
    // === ПОЛЬЗОВАТЕЛИ ===
    // ============================================

    handleGetUsers(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const otherUsers = this.dataManager.users
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
                friendsCount: u.friendsCount || 0,
                postsCount: u.postsCount || 0,
                giftsCount: u.giftsCount || 0,
                banned: u.banned || false
            }));

        return { success: true, users: otherUsers };
    }

    handleSearchUsers(token, query) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const searchTerm = query.q;
        if (!searchTerm || searchTerm.length < 2) {
            return { success: true, users: [] };
        }

        const filteredUsers = this.dataManager.users.filter(u => 
            u.id !== user.id &&
            (u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
             u.displayName.toLowerCase().includes(searchTerm.toLowerCase()))
        ).slice(0, 20).map(u => ({
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
            friendsCount: u.friendsCount || 0,
            postsCount: u.postsCount || 0,
            giftsCount: u.giftsCount || 0,
            banned: u.banned || false
        }));

        return { success: true, users: filteredUsers };
    }

    handleGetUserByUsername(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { username } = data;
        
        if (!this.securitySystem.validateInput(username, 'username')) {
            return { success: false, message: 'Некорректное имя пользователя' };
        }

        const targetUser = this.dataManager.users.find(u => u.username === username);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        return {
            success: true,
            user: {
                id: targetUser.id,
                username: targetUser.username,
                displayName: targetUser.displayName,
                avatar: targetUser.avatar,
                description: targetUser.description,
                coins: targetUser.coins,
                verified: targetUser.verified,
                isDeveloper: targetUser.isDeveloper,
                status: targetUser.status,
                lastSeen: targetUser.lastSeen,
                createdAt: targetUser.createdAt,
                friendsCount: targetUser.friendsCount || 0,
                postsCount: targetUser.postsCount || 0,
                giftsCount: targetUser.giftsCount || 0,
                banned: targetUser.banned || false
            }
        };
    }

    handleUpdateProfile(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { displayName, description, username, email } = data;

        if (displayName && displayName.trim()) {
            if (!this.securitySystem.validateInput(displayName, 'displayName')) {
                return { success: false, message: 'Некорректное отображаемое имя' };
            }
            user.displayName = this.securitySystem.sanitizeContent(displayName.trim());
        }

        if (description !== undefined) {
            user.description = this.securitySystem.sanitizeContent(description);
        }

        if (username && username.trim() && username !== user.username) {
            const sanitizedUsername = this.securitySystem.sanitizeContent(username.trim());
            if (!this.securitySystem.validateInput(sanitizedUsername, 'username')) {
                return { success: false, message: 'Некорректное имя пользователя' };
            }
            const existingUser = this.dataManager.users.find(u => u.username === sanitizedUsername && u.id !== user.id);
            if (existingUser) {
                return { success: false, message: 'Имя пользователя уже занято' };
            }
            user.username = sanitizedUsername;
        }

        if (email && email.trim() && email !== user.email) {
            const sanitizedEmail = this.securitySystem.sanitizeContent(email.trim());
            if (!this.securitySystem.validateInput(sanitizedEmail, 'email')) {
                return { success: false, message: 'Некорректный email' };
            }
            const existingEmail = this.dataManager.users.find(u => u.email === sanitizedEmail && u.id !== user.id);
            if (existingEmail) {
                return { success: false, message: 'Email уже используется' };
            }
            user.email = sanitizedEmail;
        }

        this.dataManager.saveData();
        this.securitySystem.logSecurityEvent(user, 'UPDATE_PROFILE', 'SYSTEM');

        return {
            success: true,
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
                friendsCount: user.friendsCount || 0,
                postsCount: user.postsCount || 0,
                giftsCount: user.giftsCount || 0,
                banned: user.banned || false
            }
        };
    }

    handleUpdateAvatar(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { avatar } = data;

        if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
            this.fileHandlers.deleteFile(user.avatar);
        }

        user.avatar = avatar;
        this.dataManager.saveData();

        return {
            success: true,
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
                friendsCount: user.friendsCount || 0,
                postsCount: user.postsCount || 0,
                giftsCount: user.giftsCount || 0,
                banned: user.banned || false
            }
        };
    }

    // ============================================
    // === ПОСТЫ ===
    // ============================================

    handleGetPosts(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const postsWithUserInfo = this.dataManager.posts.map(post => {
            if (post.userId === 'system') {
                return {
                    ...post,
                    userName: 'Epic Messenger',
                    userAvatar: null,
                    userVerified: true,
                    userDeveloper: true
                };
            }
            const postUser = this.dataManager.users.find(u => u.id === post.userId);
            return {
                ...post,
                userName: postUser ? postUser.displayName : 'Неизвестный',
                userAvatar: postUser ? postUser.avatar : null,
                userVerified: postUser ? postUser.verified : false,
                userDeveloper: postUser ? postUser.isDeveloper : false
            };
        });

        postsWithUserInfo.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return { success: true, posts: postsWithUserInfo };
    }

    handleGetPostById(token, postId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const post = this.dataManager.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

        // Увеличиваем просмотры
        post.views = (post.views || 0) + 1;
        this.dataManager.saveData();

        // Добавляем информацию о пользователе
        const postUser = this.dataManager.users.find(u => u.id === post.userId);
        const postWithUser = {
            ...post,
            userName: postUser ? postUser.displayName : 'Неизвестный',
            userAvatar: postUser ? postUser.avatar : null,
            userVerified: postUser ? postUser.verified : false,
            userDeveloper: postUser ? postUser.isDeveloper : false,
            comments: (post.comments || []).map(comment => {
                const commentUser = this.dataManager.users.find(u => u.id === comment.userId);
                return {
                    ...comment,
                    userName: commentUser ? commentUser.displayName : 'Неизвестный',
                    userAvatar: commentUser ? commentUser.avatar : null,
                    replies: (comment.replies || []).map(reply => {
                        const replyUser = this.dataManager.users.find(u => u.id === reply.userId);
                        return {
                            ...reply,
                            userName: replyUser ? replyUser.displayName : 'Неизвестный',
                            userAvatar: replyUser ? replyUser.avatar : null
                        };
                    })
                };
            })
        };

        return { success: true, post: postWithUser };
    }

    handleGetUserPosts(token, query) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId } = query;
        if (!userId) {
            return { success: false, message: 'Не указан пользователь' };
        }

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

        return { success: true, posts: posts };
    }

    handleCreatePost(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { text, image, file, fileName, fileType } = data;
        
        if ((!text || text.trim() === '') && !file && !image) {
            return { success: false, message: 'Текст поста не может быть пустым' };
        }

        let sanitizedText = '';
        if (text && text.trim() !== '') {
            sanitizedText = this.securitySystem.sanitizeContent(text.trim());
            if (sanitizedText.length === 0 && !file && !image) {
                return { success: false, message: 'Текст поста содержит запрещенный контент' };
            }
        }

        const post = {
            id: this.dataManager.generateId(),
            userId: user.id,
            text: sanitizedText,
            image: image,
            file: file,
            fileName: fileName,
            fileType: fileType,
            likes: [],
            comments: [],
            views: 0,
            createdAt: new Date()
        };

        this.dataManager.posts.unshift(post);
        user.postsCount = (user.postsCount || 0) + 1;
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'CREATE_POST', `chars:${sanitizedText.length}`);

        return {
            success: true,
            post: {
                ...post,
                userName: user.displayName,
                userAvatar: user.avatar,
                userVerified: user.verified,
                userDeveloper: user.isDeveloper
            }
        };
    }

    handleDeletePost(token, query) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { postId } = query;
        const postIndex = this.dataManager.posts.findIndex(p => p.id === postId);
        if (postIndex === -1) {
            return { success: false, message: 'Пост не найден' };
        }

        const post = this.dataManager.posts[postIndex];
        if (post.userId === 'system') {
            return { success: false, message: 'Нельзя удалить системный пост' };
        }

        if (post.image && post.image.startsWith('/uploads/posts/')) {
            this.fileHandlers.deleteFile(post.image);
        }
        if (post.file && post.file.startsWith('/uploads/')) {
            this.fileHandlers.deleteFile(post.file);
        }

        this.dataManager.posts.splice(postIndex, 1);
        const postUser = this.dataManager.users.find(u => u.id === post.userId);
        if (postUser && postUser.postsCount > 0) {
            postUser.postsCount--;
        }
        this.dataManager.saveData();

        return { success: true, message: 'Пост успешно удален' };
    }

    handleLikePost(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { postId } = data;
        if (!postId) {
            return { success: false, message: 'Не указан ID поста' };
        }

        const post = this.dataManager.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

        const likeIndex = post.likes.indexOf(user.id);
        if (likeIndex === -1) {
            post.likes.push(user.id);
        } else {
            post.likes.splice(likeIndex, 1);
        }

        this.dataManager.saveData();
        return { success: true, likes: post.likes, liked: likeIndex === -1 };
    }

    // ============================================
    // === КОММЕНТАРИИ ===
    // ============================================

    handleGetComments(token, query) {
        const { postId } = query;
        return this.handleGetPostComments(token, postId);
    }

    handleGetPostComments(token, postId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const post = this.dataManager.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

        const commentsWithUserInfo = (post.comments || []).map(comment => {
            const commentUser = this.dataManager.users.find(u => u.id === comment.userId);
            const repliesWithUserInfo = (comment.replies || []).map(reply => {
                const replyUser = this.dataManager.users.find(u => u.id === reply.userId);
                return {
                    ...reply,
                    userName: replyUser ? replyUser.displayName : 'Неизвестный',
                    userAvatar: replyUser ? replyUser.avatar : null,
                    userVerified: replyUser ? replyUser.verified : false
                };
            });
            return {
                ...comment,
                userName: commentUser ? commentUser.displayName : 'Неизвестный',
                userAvatar: commentUser ? commentUser.avatar : null,
                userVerified: commentUser ? commentUser.verified : false,
                replies: repliesWithUserInfo
            };
        });

        return { success: true, comments: commentsWithUserInfo };
    }

    handleAddComment(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { postId, text, parentCommentId } = data;
        if (!postId || !text) {
            return { success: false, message: 'Не указан пост или текст комментария' };
        }

        const post = this.dataManager.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

        const sanitizedText = this.securitySystem.sanitizeContent(text);
        const comment = {
            id: this.dataManager.generateId(),
            userId: user.id,
            text: sanitizedText,
            likes: [],
            replies: [],
            createdAt: new Date()
        };

        if (parentCommentId) {
            const parentComment = post.comments.find(c => c.id === parentCommentId);
            if (parentComment) {
                if (!parentComment.replies) parentComment.replies = [];
                parentComment.replies.push(comment);
            } else {
                return { success: false, message: 'Родительский комментарий не найден' };
            }
        } else {
            if (!post.comments) post.comments = [];
            post.comments.push(comment);
        }

        this.dataManager.saveData();
        return {
            success: true,
            comment: {
                ...comment,
                userName: user.displayName,
                userAvatar: user.avatar,
                userVerified: user.verified,
                userIsDeveloper: user.isDeveloper
            }
        };
    }

    handleAddPostComment(token, postId, data) {
        return this.handleAddComment(token, { postId, ...data });
    }

    handleAddReply(token, postId, commentId, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { text } = data;
        if (!text || text.trim() === '') {
            return { success: false, message: 'Текст ответа не может быть пустым' };
        }

        const post = this.dataManager.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

        const comment = post.comments.find(c => c.id === commentId);
        if (!comment) {
            return { success: false, message: 'Комментарий не найден' };
        }

        const sanitizedText = this.securitySystem.sanitizeContent(text.trim());
        const reply = {
            id: this.dataManager.generateId(),
            userId: user.id,
            text: sanitizedText,
            likes: [],
            createdAt: new Date()
        };

        if (!comment.replies) comment.replies = [];
        comment.replies.push(reply);
        this.dataManager.saveData();

        return {
            success: true,
            reply: {
                ...reply,
                userName: user.displayName,
                userAvatar: user.avatar,
                userVerified: user.verified
            }
        };
    }

    handleLikeComment(token, postId, commentId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const post = this.dataManager.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

        const comment = post.comments.find(c => c.id === commentId);
        if (!comment) {
            return { success: false, message: 'Комментарий не найден' };
        }

        const likeIndex = comment.likes.indexOf(user.id);
        if (likeIndex === -1) {
            comment.likes.push(user.id);
        } else {
            comment.likes.splice(likeIndex, 1);
        }

        this.dataManager.saveData();
        return { success: true, likes: comment.likes };
    }

    handleLikeReply(token, postId, commentId, replyId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const post = this.dataManager.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

        const comment = post.comments.find(c => c.id === commentId);
        if (!comment) {
            return { success: false, message: 'Комментарий не найден' };
        }

        const reply = comment.replies.find(r => r.id === replyId);
        if (!reply) {
            return { success: false, message: 'Ответ не найден' };
        }

        const likeIndex = reply.likes.indexOf(user.id);
        if (likeIndex === -1) {
            reply.likes.push(user.id);
        } else {
            reply.likes.splice(likeIndex, 1);
        }

        this.dataManager.saveData();
        return { success: true, likes: reply.likes };
    }

    // ============================================
    // === ЧАТЫ И СООБЩЕНИЯ ===
    // ============================================

    handleGetChats(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // Личные чаты
        const personalChats = this.dataManager.users
            .filter(u => u.id !== user.id)
            .map(u => {
                const messages = this.dataManager.messages.filter(m => 
                    (m.senderId === user.id && m.receiverId === u.id) ||
                    (m.senderId === u.id && m.receiverId === user.id)
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
            .filter(chat => chat.lastMessage !== null)
            .sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));

        // Групповые чаты
        const groupChats = this.dataManager.groups
            .filter(g => g.members.includes(user.id) && g.isActive !== false)
            .map(g => {
                const groupMessages = this.dataManager.messages.filter(m => 
                    m.receiverId === g.id
                ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                const lastMessage = groupMessages[0] || null;
                const unreadCount = groupMessages.filter(m => {
                    if (m.senderId === user.id) return false;
                    if (!m.readBy) return true;
                    return !m.readBy.includes(user.id);
                }).length;

                return {
                    id: g.id,
                    displayName: g.name,
                    avatar: g.avatar,
                    isGroup: true,
                    memberCount: g.members.length,
                    lastMessage: lastMessage,
                    unreadCount: unreadCount,
                    creatorId: g.creatorId,
                    members: g.members,
                    createdAt: g.createdAt
                };
            })
            .sort((a, b) => {
                const dateA = a.lastMessage ? new Date(a.lastMessage.timestamp) : new Date(a.createdAt || 0);
                const dateB = b.lastMessage ? new Date(b.lastMessage.timestamp) : new Date(b.createdAt || 0);
                return dateB - dateA;
            });

        const allChats = [...personalChats, ...groupChats];
        return { success: true, chats: allChats };
    }

    handleStartChat(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId } = data;
        if (!userId) {
            return { success: false, message: 'User ID не указан' };
        }

        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        return {
            success: true,
            chatId: userId,
            user: {
                id: targetUser.id,
                displayName: targetUser.displayName,
                avatar: targetUser.avatar,
                verified: targetUser.verified,
                isDeveloper: targetUser.isDeveloper,
                status: targetUser.status
            }
        };
    }

    handleGetMessages(token, query) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId } = query;
        if (!userId) {
            return { success: false, message: 'Не указан получатель' };
        }

        const isGroupChat = this.dataManager.groups.some(g => g.id === userId && g.members.includes(user.id));
        
        let messages;
        if (isGroupChat) {
            messages = this.dataManager.messages
                .filter(m => m.receiverId === userId)
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        } else {
            messages = this.dataManager.messages
                .filter(m => 
                    (m.senderId === user.id && m.receiverId === userId) ||
                    (m.senderId === userId && m.receiverId === user.id)
                )
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        }

        const messagesWithInfo = messages.map(msg => ({
            ...msg,
            isOutgoing: msg.senderId === user.id
        }));

        return { success: true, messages: messagesWithInfo };
    }

    handleSendMessage(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { toUserId, text, type = 'text', file, fileName, fileType } = data;
        if (!toUserId) {
            return { success: false, message: 'Не указан получатель' };
        }

        if (!text && !file) {
            return { success: false, message: 'Сообщение не может быть пустым' };
        }

        const isUser = this.dataManager.users.some(u => u.id === toUserId);
        const isGroup = this.dataManager.groups.some(g => g.id === toUserId && g.members.includes(user.id));
        
        if (!isUser && !isGroup) {
            return { success: false, message: 'Получатель не найден или у вас нет доступа к группе' };
        }

        let fileUrl = null;
        if (file && fileName && fileType) {
            const fileExt = path.extname(fileName) || this.getFileExtension(fileType);
            const uniqueFilename = `file_${user.id}_${Date.now()}${fileExt}`;
            let uploadDir = 'files';
            if (fileType === 'image') uploadDir = 'images';
            else if (fileType === 'video') uploadDir = 'videos';
            else if (fileType === 'audio') uploadDir = 'audio';
            
            const isProduction = process.env.NODE_ENV === 'production';
            const baseDir = isProduction ? '/tmp/uploads' : path.join(process.cwd(), 'public', 'uploads');
            const filePath = path.join(baseDir, uploadDir, uniqueFilename);
            
            const base64Data = file.replace(/^data:[^;]+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            
            if (!fs.existsSync(path.join(baseDir, uploadDir))) {
                fs.mkdirSync(path.join(baseDir, uploadDir), { recursive: true });
            }
            
            fs.writeFileSync(filePath, buffer);
            fileUrl = `/uploads/${uploadDir}/${uniqueFilename}`;
        }

        const message = {
            id: this.dataManager.generateId(),
            senderId: user.id,
            receiverId: toUserId,
            text: text ? this.securitySystem.sanitizeContent(text) : null,
            type: type,
            file: fileUrl,
            fileName: fileName,
            fileType: fileType,
            timestamp: new Date(),
            read: false,
            readBy: isGroup ? [user.id] : []
        };

        this.dataManager.messages.push(message);
        this.dataManager.saveData();

        return { success: true, message: message };
    }

    handleMarkAsRead(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { fromUserId } = data;
        if (!fromUserId) {
            return { success: false, message: 'Не указан отправитель' };
        }

        this.dataManager.messages.forEach(message => {
            if (message.senderId === fromUserId && message.receiverId === user.id && !message.read) {
                message.read = true;
            }
            if (message.receiverId === fromUserId && message.readBy && !message.readBy.includes(user.id)) {
                message.readBy.push(user.id);
            }
        });

        this.dataManager.saveData();
        return { success: true, message: 'Сообщения помечены как прочитанные' };
    }

    handleEditMessage(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { messageId, newText } = data;
        if (!messageId || !newText) {
            return { success: false, message: 'Заполните все поля' };
        }

        const message = this.dataManager.messages.find(msg => msg.id === messageId);
        if (!message) {
            return { success: false, message: 'Сообщение не найдено' };
        }

        if (message.senderId !== user.id) {
            return { success: false, message: 'Нет прав для редактирования этого сообщения' };
        }

        message.text = newText;
        message.edited = true;
        this.dataManager.saveData();

        return { success: true, message: 'Сообщение отредактировано' };
    }

    handleDeleteMessage(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { messageId } = data;
        if (!messageId) {
            return { success: false, message: 'Message ID не указан' };
        }

        const messageIndex = this.dataManager.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) {
            return { success: false, message: 'Сообщение не найдено' };
        }

        const message = this.dataManager.messages[messageIndex];
        if (message.senderId !== user.id && !user.isDeveloper) {
            return { success: false, message: 'Нет прав для удаления этого сообщения' };
        }

        this.dataManager.messages.splice(messageIndex, 1);
        this.dataManager.saveData();

        return { success: true, message: 'Сообщение удалено' };
    }

    // ============================================
    // === ГРУППЫ ===
    // ============================================

    handleCreateGroup(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { name, username, members, description, isPrivate } = data;
        if (!name) {
            return { success: false, message: 'Неверные данные для создания группы' };
        }

        const validMembers = members ? members.filter(memberId => 
            this.dataManager.users.find(u => u.id === memberId)
        ) : [];

        if (username) {
            const existingGroup = this.dataManager.groups.find(g => g.username === username);
            if (existingGroup) {
                return { success: false, message: 'Группа с таким username уже существует' };
            }
        }

        const groupId = this.dataManager.generateId();
        const group = {
            id: groupId,
            name: this.securitySystem.sanitizeContent(name),
            username: username ? this.securitySystem.sanitizeContent(username) : null,
            description: description ? this.securitySystem.sanitizeContent(description) : '',
            creatorId: user.id,
            members: [user.id, ...validMembers],
            admins: [user.id],
            avatar: null,
            createdAt: new Date(),
            isActive: true,
            isPublic: !isPrivate,
            isPrivate: isPrivate || false,
            inviteLink: crypto.randomBytes(8).toString('hex')
        };

        this.dataManager.groups.push(group);
        this.dataManager.saveData();

        return {
            success: true,
            group: group,
            message: 'Группа успешно создана'
        };
    }

    handleGetUserGroups(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const userGroups = this.dataManager.groups.filter(group => 
            group.members.includes(user.id)
        );

        return { success: true, groups: userGroups };
    }

    handleAddToGroup(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { groupId, userId } = data;
        const group = this.dataManager.groups.find(g => g.id === groupId);
        if (!group) {
            return { success: false, message: 'Группа не найдена' };
        }

        if (!group.admins.includes(user.id)) {
            return { success: false, message: 'Недостаточно прав' };
        }

        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        if (group.members.includes(userId)) {
            return { success: false, message: 'Пользователь уже в группе' };
        }

        group.members.push(userId);
        this.dataManager.saveData();

        return { success: true, message: 'Пользователь добавлен в группу' };
    }

    handleJoinGroup(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { groupId, inviteLink } = data;
        if (!groupId && !inviteLink) {
            return { success: false, message: 'Укажите группу или пригласительную ссылку' };
        }

        let group;
        if (groupId) {
            group = this.dataManager.groups.find(g => g.id === groupId);
        } else {
            group = this.dataManager.groups.find(g => g.inviteLink === inviteLink);
        }

        if (!group) {
            return { success: false, message: 'Группа не найдена' };
        }

        if (group.members.includes(user.id)) {
            return { success: false, message: 'Вы уже в этой группе' };
        }

        if (group.isPrivate && !inviteLink) {
            return { success: false, message: 'Для вступления в приватную группу нужна пригласительная ссылка' };
        }

        group.members.push(user.id);
        this.dataManager.saveData();

        return { success: true, message: 'Вы присоединились к группе' };
    }

    handleLeaveGroup(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { groupId } = data;
        if (!groupId) {
            return { success: false, message: 'Group ID не указан' };
        }

        const group = this.dataManager.groups.find(g => g.id === groupId);
        if (!group) {
            return { success: false, message: 'Группа не найдена' };
        }

        const memberIndex = group.members.indexOf(user.id);
        if (memberIndex === -1) {
            return { success: false, message: 'Вы не состоите в этой группе' };
        }

        group.members.splice(memberIndex, 1);
        if (group.members.length === 0) {
            const groupIndex = this.dataManager.groups.findIndex(g => g.id === groupId);
            this.dataManager.groups.splice(groupIndex, 1);
        }

        this.dataManager.saveData();
        return { success: true, message: 'Вы вышли из группы' };
    }

    // ============================================
    // === ПОДАРКИ ===
    // ============================================

    handleGetGifts(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        return { success: true, gifts: this.dataManager.gifts };
    }

    handleCreateGift(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { name, price, type, image } = data;
        if (!name || !price) {
            return { success: false, message: 'Название и цена обязательны' };
        }

        const gift = {
            id: this.dataManager.generateId(),
            name: this.securitySystem.sanitizeContent(name),
            type: type || 'custom',
            preview: image ? '🖼️' : '🎁',
            price: parseInt(price),
            image: image,
            createdAt: new Date()
        };

        this.dataManager.gifts.push(gift);
        this.dataManager.saveData();

        return { success: true, gift: gift };
    }

    handleDeleteGift(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { giftId } = data;
        const giftIndex = this.dataManager.gifts.findIndex(g => g.id === giftId);
        if (giftIndex === -1) {
            return { success: false, message: 'Подарок не найден' };
        }

        const gift = this.dataManager.gifts[giftIndex];
        if (gift.image && gift.image.startsWith('/uploads/gifts/')) {
            this.fileHandlers.deleteFile(gift.image);
        }

        this.dataManager.gifts.splice(giftIndex, 1);
        this.dataManager.saveData();

        return { success: true, message: 'Подарок успешно удален' };
    }

    handleBuyGift(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { giftId, toUserId } = data;
        const gift = this.dataManager.gifts.find(g => g.id === giftId);
        if (!gift) {
            return { success: false, message: 'Подарок не найден' };
        }

        if (user.coins < gift.price) {
            return { success: false, message: 'Недостаточно E-COIN для покупки подарка' };
        }

        const recipient = this.dataManager.users.find(u => u.id === toUserId);
        if (!recipient) {
            return { success: false, message: 'Получатель не найден' };
        }

        if (recipient.banned) {
            return { success: false, message: 'Нельзя отправлять подарки заблокированным пользователям' };
        }

        user.coins -= gift.price;

        const giftMessage = {
            id: this.dataManager.generateId(),
            senderId: user.id,
            receiverId: toUserId,
            text: '',
            type: 'gift',
            giftId: gift.id,
            giftName: gift.name,
            giftPrice: gift.price,
            giftImage: gift.image,
            giftPreview: gift.preview,
            timestamp: new Date(),
            displayName: user.displayName,
            read: false
        };

        this.dataManager.messages.push(giftMessage);

        if (!recipient.gifts) recipient.gifts = [];
        recipient.gifts.push({
            id: this.dataManager.generateId(),
            giftId: gift.id,
            fromUserId: user.id,
            fromUserName: user.displayName,
            receivedAt: new Date()
        });

        recipient.giftsCount = (recipient.giftsCount || 0) + 1;
        this.dataManager.saveData();

        return {
            success: true,
            message: `Подарок "${gift.name}" успешно отправлен!`,
            gift: gift,
            user: { coins: user.coins }
        };
    }

    handleGetMyGifts(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const myGifts = this.dataManager.messages
            .filter(msg => msg.type === 'gift' && msg.receiverId === user.id)
            .map(msg => ({
                id: msg.id,
                giftId: msg.giftId,
                giftName: msg.giftName,
                giftImage: msg.giftImage,
                giftPreview: msg.giftPreview,
                fromUserId: msg.senderId,
                fromUserName: msg.displayName,
                timestamp: msg.timestamp,
                giftPrice: msg.giftPrice
            }))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return { success: true, gifts: myGifts };
    }

    // ============================================
    // === ПРОМОКОДЫ ===
    // ============================================

    handleGetPromoCodes(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        return { success: true, promoCodes: this.dataManager.promoCodes };
    }

    handleCreatePromoCode(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { code, coins, max_uses } = data;
        if (!code || !coins) {
            return { success: false, message: 'Код и количество коинов обязательны' };
        }

        const sanitizedCode = this.securitySystem.sanitizeContent(code.toUpperCase());
        const existingPromo = this.dataManager.promoCodes.find(p => p.code === sanitizedCode);
        if (existingPromo) {
            return { success: false, message: 'Промокод с таким кодом уже существует' };
        }

        const promoCode = {
            id: this.dataManager.generateId(),
            code: sanitizedCode,
            coins: parseInt(coins),
            max_uses: max_uses || 0,
            used_count: 0,
            created_at: new Date()
        };

        this.dataManager.promoCodes.push(promoCode);
        this.dataManager.saveData();

        return { success: true, promoCode: promoCode };
    }

    handleDeletePromoCode(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { promoCodeId } = data;
        const promoIndex = this.dataManager.promoCodes.findIndex(p => p.id === promoCodeId);
        if (promoIndex === -1) {
            return { success: false, message: 'Промокод не найден' };
        }

        this.dataManager.promoCodes.splice(promoIndex, 1);
        this.dataManager.saveData();

        return { success: true, message: 'Промокод успешно удален' };
    }

    handleActivatePromoCode(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { code } = data;
        if (!this.securitySystem.validateInput(code, 'text')) {
            return { success: false, message: 'Некорректный промокод' };
        }

        const sanitizedCode = this.securitySystem.sanitizeContent(code.toUpperCase());
        const promoCode = this.dataManager.promoCodes.find(p => p.code === sanitizedCode);

        if (!promoCode) {
            return { success: false, message: 'Промокод не найден' };
        }

        if (promoCode.max_uses > 0 && promoCode.used_count >= promoCode.max_uses) {
            return { success: false, message: 'Промокод уже использован максимальное количество раз' };
        }

        user.coins += promoCode.coins;
        promoCode.used_count++;
        this.dataManager.saveData();

        return {
            success: true,
            message: `Промокод активирован! Начислено ${promoCode.coins} E-COIN`,
            coins: promoCode.coins,
            user: { coins: user.coins }
        };
    }

    // ============================================
    // === ЭМОДЗИ ===
    // ============================================

    handleGetEmoji(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        try {
            const emojiPath = path.join(process.cwd(), 'public', 'assets', 'emoji');
            if (!fs.existsSync(emojiPath)) {
                return { success: true, emoji: [] };
            }
            
            const files = fs.readdirSync(emojiPath);
            const emojiList = files.filter(file => 
                file.endsWith('.png') || file.endsWith('.svg') || file.endsWith('.gif')
            ).map(file => ({
                name: file,
                url: `/assets/emoji/${file}`
            }));

            return { success: true, emoji: emojiList };
        } catch (error) {
            return { success: true, emoji: [] };
        }
    }

    // ============================================
    // === УСТРОЙСТВА ===
    // ============================================

    handleGetDevices(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const devices = this.dataManager.getUserDevices(user.id);
        return { success: true, devices: devices };
    }

    handleTerminateDevice(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { deviceId } = data;
        const success = this.dataManager.terminateDevice(user.id, deviceId);

        if (success) {
            return { success: true, message: 'Сеанс устройства завершен' };
        } else {
            return { success: false, message: 'Не удалось завершить сеанс устройства' };
        }
    }

    // ============================================
    // === E-COIN ===
    // ============================================

    handleGetBalance(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        return { success: true, balance: user.coins || 0 };
    }

    // ============================================
    // === МУЗЫКА ===
    // ============================================

    handleGetMusic(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const musicWithUserInfo = this.dataManager.music.map(track => {
            const trackUser = this.dataManager.users.find(u => u.id === track.userId);
            return {
                ...track,
                userName: trackUser ? trackUser.displayName : 'Неизвестный',
                userAvatar: trackUser ? trackUser.avatar : null,
                userVerified: trackUser ? trackUser.verified : false
            };
        });

        return { success: true, music: musicWithUserInfo };
    }

    handleUploadMusicFull(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { title, artist, fileUrl, coverUrl, genre } = data;
        if (!title || !artist || !fileUrl) {
            return { success: false, message: 'Название, исполнитель и файл обязательны' };
        }

        const track = {
            id: this.dataManager.generateId(),
            userId: user.id,
            title: this.securitySystem.sanitizeContent(title),
            artist: this.securitySystem.sanitizeContent(artist),
            genre: genre ? this.securitySystem.sanitizeContent(genre) : 'Не указан',
            fileUrl: fileUrl,
            coverUrl: coverUrl || '/assets/default-cover.png',
            duration: 0,
            plays: 0,
            likes: [],
            createdAt: new Date()
        };

        this.dataManager.music.unshift(track);
        this.dataManager.saveData();

        return {
            success: true,
            track: {
                ...track,
                userName: user.displayName,
                userAvatar: user.avatar,
                userVerified: user.verified
            }
        };
    }

    handleDeleteMusic(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { trackId } = data;
        const trackIndex = this.dataManager.music.findIndex(t => t.id === trackId);
        if (trackIndex === -1) {
            return { success: false, message: 'Трек не найден' };
        }

        const track = this.dataManager.music[trackIndex];
        if (track.userId !== user.id && !user.isDeveloper) {
            return { success: false, message: 'Вы можете удалять только свои треки' };
        }

        if (track.fileUrl && track.fileUrl.startsWith('/uploads/music/')) {
            this.fileHandlers.deleteFile(track.fileUrl);
        }

        this.dataManager.music.splice(trackIndex, 1);
        this.dataManager.saveData();

        return { success: true, message: 'Трек успешно удален' };
    }

    handleSearchMusic(token, query) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { q } = query;
        if (!q || q.trim() === '') {
            return this.handleGetMusic(token);
        }

        const searchTerm = q.toLowerCase().trim();
        const filteredMusic = this.dataManager.music.filter(track => 
            track.title.toLowerCase().includes(searchTerm) ||
            track.artist.toLowerCase().includes(searchTerm) ||
            track.genre.toLowerCase().includes(searchTerm)
        );

        const musicWithUserInfo = filteredMusic.map(track => {
            const trackUser = this.dataManager.users.find(u => u.id === track.userId);
            return {
                ...track,
                userName: trackUser ? trackUser.displayName : 'Неизвестный',
                userAvatar: trackUser ? trackUser.avatar : null,
                userVerified: trackUser ? trackUser.verified : false
            };
        });

        return { success: true, music: musicWithUserInfo };
    }

    // ============================================
    // === АДМИН ===
    // ============================================

    handleAdminStats(token) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        return {
            success: true,
            stats: {
                totalUsers: this.dataManager.users.length,
                totalMessages: this.dataManager.messages.length,
                totalPosts: this.dataManager.posts.length,
                totalGifts: this.dataManager.gifts.length,
                totalPromoCodes: this.dataManager.promoCodes.length,
                totalMusic: this.dataManager.music.length,
                totalGroups: this.dataManager.groups.length,
                onlineUsers: this.dataManager.users.filter(u => u.status === 'online').length,
                bannedUsers: this.dataManager.users.filter(u => u.banned).length,
                maintenanceMode: this.dataManager.isMaintenanceMode ? this.dataManager.isMaintenanceMode() : false
            }
        };
    }

    handleDeleteUser(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        if (targetUser.isProtected) {
            return { success: false, message: 'Нельзя удалить защищенного пользователя' };
        }

        if (targetUser.id === user.id) {
            return { success: false, message: 'Нельзя удалить свой собственный аккаунт' };
        }

        if (targetUser.avatar && targetUser.avatar.startsWith('/uploads/avatars/')) {
            this.fileHandlers.deleteFile(targetUser.avatar);
        }

        Array.from(this.dataManager.devices.entries()).forEach(([deviceId, device]) => {
            if (device.userId === userId) {
                this.dataManager.devices.delete(deviceId);
            }
        });

        this.dataManager.users = this.dataManager.users.filter(u => u.id !== userId);
        this.dataManager.saveData();

        return { success: true, message: `Пользователь ${targetUser.username} успешно удален` };
    }

    handleBanUser(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId, reason } = data;
        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        if (targetUser.isProtected) {
            return { success: false, message: 'Нельзя заблокировать защищенного пользователя' };
        }

        targetUser.banned = true;
        this.dataManager.saveData();

        return { success: true, message: `Пользователь ${targetUser.username} заблокирован` };
    }

    handleToggleVerification(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        targetUser.verified = !targetUser.verified;
        this.dataManager.saveData();

        return {
            success: true,
            message: `Пользователь ${targetUser.username} ${targetUser.verified ? 'верифицирован' : 'лишен верификации'}`,
            verified: targetUser.verified
        };
    }

    handleToggleDeveloper(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        targetUser.isDeveloper = !targetUser.isDeveloper;
        this.dataManager.saveData();

        return {
            success: true,
            message: `Пользователь ${targetUser.username} ${targetUser.isDeveloper ? 'получил права разработчика' : 'лишен прав разработчика'}`,
            isDeveloper: targetUser.isDeveloper
        };
    }

    handleAdminGetUsers(token) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Недостаточно прав' };
        }

        const users = this.dataManager.users.map(u => ({
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            coins: u.coins,
            verified: u.verified,
            isDeveloper: u.isDeveloper,
            status: u.status,
            lastSeen: u.lastSeen,
            createdAt: u.createdAt,
            postsCount: this.dataManager.posts.filter(p => p.userId === u.id).length,
            messagesCount: this.dataManager.messages.filter(m => m.senderId === u.id).length
        }));

        return { success: true, users: users };
    }

    handleExportDatabase(token, res) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Доступ запрещен' }));
            return;
        }

        try {
            const exportData = {
                exportInfo: {
                    version: '1.0',
                    exportedAt: new Date().toISOString(),
                    exportedBy: user.username,
                    totalUsers: this.dataManager.users.length,
                    totalMessages: this.dataManager.messages.length,
                    totalPosts: this.dataManager.posts.length,
                    totalGifts: this.dataManager.gifts.length,
                    totalMusic: this.dataManager.music.length
                },
                data: {
                    users: this.dataManager.users.map(u => ({ ...u, password: '[ENCRYPTED]' })),
                    messages: this.dataManager.messages,
                    posts: this.dataManager.posts,
                    gifts: this.dataManager.gifts,
                    promoCodes: this.dataManager.promoCodes,
                    music: this.dataManager.music,
                    groups: this.dataManager.groups,
                    bannedIPs: Object.fromEntries(this.dataManager.bannedIPs),
                    devices: Object.fromEntries(this.dataManager.devices)
                }
            };

            const filename = `epic-messenger-backup-${new Date().toISOString().split('T')[0]}.json`;
            
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="${filename}"`
            });
            res.end(JSON.stringify(exportData, null, 2));

        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Ошибка экспорта базы данных' }));
        }
    }

    handleImportDatabase(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        return { success: true, message: 'Импорт БД выполнен' };
    }

    handleMaintenanceMode(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const { enabled } = data;
        this.dataManager.setMaintenanceMode(enabled);

        return {
            success: true,
            message: `Режим технических работ ${enabled ? 'ВКЛЮЧЕН' : 'выключен'}`,
            maintenanceMode: enabled
        };
    }

    handleGetMaintenanceStatus(token) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        return {
            success: true,
            maintenanceMode: this.dataManager.isMaintenanceMode ? this.dataManager.isMaintenanceMode() : false
        };
    }

    // ============================================
    // === ВСПОМОГАТЕЛЬНЫЕ ===
    // ============================================

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
