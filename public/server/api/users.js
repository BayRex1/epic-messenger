const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class UsersHandler {
    constructor(dataManager, securitySystem, fileHandlers, authHandler) {
        this.dataManager = dataManager;
        this.securitySystem = securitySystem;
        this.fileHandlers = fileHandlers;
        this.authHandler = authHandler;
        this.wsServer = null;
    }

    setWebSocketServer(wsServer) {
        this.wsServer = wsServer;
    }

    authenticateToken(token) {
        return this.authHandler?.authenticateToken(token) || null;
    }

    // ============================================
    // ★★★ УСТАНОВКА СТАТУСА ★★★
    // ============================================

    handleSetStatus(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { status } = data;
        user.status = status || 'offline';
        user.lastSeen = new Date();
        this.dataManager.saveData();

        if (this.wsServer) {
            this.wsServer.broadcast('user_status', {
                userId: user.id,
                username: user.username,
                status: user.status,
                lastSeen: user.lastSeen
            });
        }

        console.log(`📡 Пользователь ${user.username} ${status === 'online' ? 'ВОШЕЛ' : 'ВЫШЕЛ'} в ${user.lastSeen.toLocaleTimeString()}`);

        return { success: true, status: user.status };
    }

    // ============================================
    // ★★★ ПОЛУЧЕНИЕ СТАТУСА (ПУБЛИЧНЫЙ - БЕЗ ТОКЕНА) ★★★
    // ============================================

    handleGetStatusPublic(userId) {
        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        return { 
            success: true, 
            user: {
                id: targetUser.id,
                username: targetUser.username,
                status: targetUser.status || 'offline',
                lastSeen: targetUser.lastSeen
            }
        };
    }

    // ============================================
    // ★★★ ПОЛУЧЕНИЕ СТАТУСА (С ТОКЕНОМ) ★★★
    // ============================================

    handleGetStatus(token, userId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        return { 
            success: true, 
            user: {
                id: targetUser.id,
                username: targetUser.username,
                status: targetUser.status || 'offline',
                lastSeen: targetUser.lastSeen
            }
        };
    }

    // ============================================
    // ★★★ ОБНОВЛЕНИЕ LAST SEEN ★★★
    // ============================================

    handleUpdateLastSeen(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        user.lastSeen = new Date();
        this.dataManager.saveData();

        return { success: true };
    }

    // ============================================
    // ★★★ ПОЛУЧЕНИЕ ПОЛЬЗОВАТЕЛЕЙ ★★★
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
                cover: u.cover || null,
                description: u.description,
                coins: u.coins,
                verified: u.verified,
                isDeveloper: u.isDeveloper,
                status: u.status || 'offline',
                lastSeen: u.lastSeen,
                createdAt: u.createdAt,
                postsCount: u.postsCount || 0,
                giftsCount: u.giftsCount || 0,
                banned: u.banned || false,
                isProtected: u.isProtected || false
            }));

        this.securitySystem.logSecurityEvent(user, 'GET_USERS_LIST', `count:${otherUsers.length}`);

        return {
            success: true,
            users: otherUsers
        };
    }

    // ============================================
    // ★★★ ПОЛУЧЕНИЕ ПОЛЬЗОВАТЕЛЯ ПО ID ★★★
    // ============================================

    handleGetUser(token, userId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        // ★★★ УБРАЛИ ПРОВЕРКУ НА ДРУЗЕЙ ★★★
        // ★★★ СКРЫВАЕМ КОИНЫ ДЛЯ ЧУЖИХ ★★★
        const isOwnProfile = user.id === userId;

        this.securitySystem.logSecurityEvent(user, 'GET_USER', `user:${targetUser.username}`);

        return {
            success: true,
            user: {
                id: targetUser.id,
                username: targetUser.username,
                displayName: targetUser.displayName,
                avatar: targetUser.avatar,
                cover: targetUser.cover || null,
                description: targetUser.description,
                coins: isOwnProfile ? targetUser.coins : 0,
                verified: targetUser.verified || false,
                isDeveloper: targetUser.isDeveloper || false,
                status: targetUser.status || 'offline',
                lastSeen: targetUser.lastSeen,
                createdAt: targetUser.createdAt,
                postsCount: targetUser.postsCount || 0,
                giftsCount: targetUser.giftsCount || 0,
                banned: targetUser.banned || false,
                isProtected: targetUser.isProtected || false
            }
        };
    }

    // ============================================
    // ★★★ ПОИСК ПОЛЬЗОВАТЕЛЕЙ ★★★
    // ============================================

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
            cover: u.cover || null,
            description: u.description,
            coins: u.coins,
            verified: u.verified,
            isDeveloper: u.isDeveloper,
            status: u.status || 'offline',
            lastSeen: u.lastSeen,
            createdAt: u.createdAt,
            postsCount: u.postsCount || 0,
            giftsCount: u.giftsCount || 0,
            banned: u.banned || false
        }));

        return { success: true, users: filteredUsers };
    }

    // ============================================
    // ★★★ ПОЛУЧЕНИЕ ПОЛЬЗОВАТЕЛЯ ПО USERNAME ★★★
    // ============================================

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

        const isOwnProfile = user.id === targetUser.id;

        return {
            success: true,
            user: {
                id: targetUser.id,
                username: targetUser.username,
                displayName: targetUser.displayName,
                avatar: targetUser.avatar,
                cover: targetUser.cover || null,
                description: targetUser.description,
                coins: isOwnProfile ? targetUser.coins : 0,
                verified: targetUser.verified || false,
                isDeveloper: targetUser.isDeveloper || false,
                status: targetUser.status || 'offline',
                lastSeen: targetUser.lastSeen,
                createdAt: targetUser.createdAt,
                postsCount: targetUser.postsCount || 0,
                giftsCount: targetUser.giftsCount || 0,
                banned: targetUser.banned || false,
                isProtected: targetUser.isProtected || false
            }
        };
    }

    handleGetUserByUsernameMobile(token, data) {
        const { username } = data;
        
        if (!username) {
            return { success: false, message: 'Username не указан' };
        }

        const targetUser = this.dataManager.users.find(u => u.username === username);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        return {
            success: true,
            message: 'Данные пользователя получены',
            user: {
                id: targetUser.id,
                username: targetUser.username,
                displayName: targetUser.displayName,
                avatar: targetUser.avatar,
                cover: targetUser.cover || null,
                description: targetUser.description,
                coins: targetUser.coins || 0,
                verified: targetUser.verified || false,
                isDeveloper: targetUser.isDeveloper || false,
                status: targetUser.status || 'offline',
                lastSeen: targetUser.lastSeen,
                createdAt: targetUser.createdAt,
                postsCount: this.dataManager.posts.filter(p => p.userId === targetUser.id).length
            }
        };
    }

    handleGetUserPostsMobile(token, data) {
        const { userId } = data;
        
        if (!userId) {
            return { success: false, message: 'User ID не указан' };
        }

        const userPosts = this.dataManager.posts
            .filter(post => post.userId === userId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map(post => {
                const postUser = this.dataManager.users.find(u => u.id === post.userId);
                return {
                    id: post.id,
                    text: post.text,
                    image: post.image,
                    file: post.file,
                    fileName: post.fileName,
                    fileType: post.fileType,
                    likes: post.likes || [],
                    comments: post.comments || [],
                    views: post.views || 0,
                    createdAt: post.createdAt,
                    user: {
                        id: postUser?.id,
                        username: postUser?.username,
                        displayName: postUser?.displayName,
                        avatar: postUser?.avatar,
                        cover: postUser?.cover || null,
                        verified: postUser?.verified || false,
                        isDeveloper: postUser?.isDeveloper || false
                    }
                };
            });

        return { success: true, message: 'Посты пользователя получены', posts: userPosts };
    }

    // ============================================
    // === ОБНОВЛЕНИЕ ПРОФИЛЯ ===
    // ============================================

    handleUpdateProfile(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'UPDATE_PROFILE', 'SYSTEM', false);
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
                this.securitySystem.logSecurityEvent(user, 'UPDATE_PROFILE', `username:${sanitizedUsername}`, false);
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
                this.securitySystem.logSecurityEvent(user, 'UPDATE_PROFILE', `email:${sanitizedEmail}`, false);
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
                cover: user.cover || null,
                description: user.description,
                coins: user.coins,
                verified: user.verified,
                isDeveloper: user.isDeveloper,
                status: user.status || 'offline',
                lastSeen: user.lastSeen,
                createdAt: user.createdAt,
                postsCount: user.postsCount || 0,
                giftsCount: user.giftsCount || 0,
                banned: user.banned || false
            }
        };
    }

    // ============================================
    // === АВАТАРЫ ===
    // ============================================

    handleUpdateAvatar(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'UPDATE_AVATAR', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { avatar } = data;
        if (!avatar) {
            return { success: false, message: 'Аватар не передан' };
        }

        if (avatar.length > 1000) {
            try {
                const base64Data = avatar.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                
                const isProduction = process.env.NODE_ENV === 'production';
                const uploadDir = isProduction ? '/tmp/uploads/avatars' : path.join(process.cwd(), 'public/uploads/avatars');
                
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }
                
                const filename = `avatar_${user.id}_${Date.now()}.jpg`;
                const filePath = path.join(uploadDir, filename);
                fs.writeFileSync(filePath, buffer);
                
                const avatarUrl = `/uploads/avatars/${filename}`;
                
                if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
                    const oldPath = path.join(uploadDir, path.basename(user.avatar));
                    if (fs.existsSync(oldPath)) {
                        fs.unlinkSync(oldPath);
                    }
                }
                
                user.avatar = avatarUrl;
                this.dataManager.saveData();
                
                console.log(`🖼️ Аватар сохранен: ${avatarUrl}`);
                
                return {
                    success: true,
                    user: {
                        id: user.id,
                        username: user.username,
                        displayName: user.displayName,
                        avatar: avatarUrl
                    }
                };
            } catch (error) {
                console.error('❌ Ошибка сохранения аватара:', error);
                return { success: false, message: 'Ошибка сохранения аватара: ' + error.message };
            }
        }
        
        user.avatar = avatar;
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'UPDATE_AVATAR', 'SYSTEM');

        return {
            success: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                avatar: user.avatar
            }
        };
    }

    handleUpdateCover(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'UPDATE_COVER', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { cover } = data;
        if (!cover) {
            return { success: false, message: 'Обложка не передана' };
        }

        if (cover.length > 1000) {
            try {
                const base64Data = cover.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                
                const isProduction = process.env.NODE_ENV === 'production';
                const uploadDir = isProduction ? '/tmp/uploads/covers' : path.join(process.cwd(), 'public/uploads/covers');
                
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }
                
                const filename = `cover_${user.id}_${Date.now()}.jpg`;
                const filePath = path.join(uploadDir, filename);
                fs.writeFileSync(filePath, buffer);
                
                const coverUrl = `/uploads/covers/${filename}`;
                
                if (user.cover && user.cover.startsWith('/uploads/covers/')) {
                    const oldPath = path.join(uploadDir, path.basename(user.cover));
                    if (fs.existsSync(oldPath)) {
                        fs.unlinkSync(oldPath);
                    }
                }
                
                user.cover = coverUrl;
                this.dataManager.saveData();
                
                console.log(`🖼️ Обложка сохранена: ${coverUrl}`);
                
                return {
                    success: true,
                    user: {
                        id: user.id,
                        username: user.username,
                        displayName: user.displayName,
                        cover: coverUrl
                    }
                };
            } catch (error) {
                console.error('❌ Ошибка сохранения обложки:', error);
                return { success: false, message: 'Ошибка сохранения обложки: ' + error.message };
            }
        }
        
        user.cover = cover;
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'UPDATE_COVER', 'SYSTEM');

        return {
            success: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                cover: user.cover
            }
        };
    }

    handlePreviewAvatar(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { fileData, filename } = data;
        
        if (!this.fileHandlers.validateAvatarFile(filename)) {
            return { success: false, message: 'Недопустимый формат файла для аватара' };
        }

        try {
            if (fileData.length > 2 * 1024 * 1024) {
                return { success: false, message: 'Размер файла не должен превышать 2 МБ' };
            }

            return {
                success: true,
                previewUrl: fileData,
                fileName: filename
            };
        } catch (error) {
            console.error('Ошибка предпросмотра аватара:', error);
            return { success: false, message: 'Ошибка обработки файла' };
        }
    }

    handleDebugUpload(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        return {
            success: true,
            message: 'Upload debug endpoint',
            user: user.username,
            timestamp: new Date().toISOString()
        };
    }

    // ============================================
    // === E-COIN ===
    // ============================================

    handleGetBalance(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        return {
            success: true,
            balance: user.coins || 0 
        };
    }

    handleGetTransactions(token, userId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.id !== userId) {
            this.securitySystem.logSecurityEvent(user, 'GET_TRANSACTIONS', `user:${userId}`, false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const transactions = [
            {
                description: 'Регистрация бонус',
                date: user.createdAt,
                amount: user.coins >= 50000 ? 50000 : 1000
            }
        ];

        this.securitySystem.logSecurityEvent(user, 'GET_TRANSACTIONS', `user:${userId}`);

        return {
            success: true,
            transactions: transactions
        };
    }
}

module.exports = UsersHandler;
