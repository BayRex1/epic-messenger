const path = require('path');
const fs = require('fs');

class UsersHandler {
    constructor(dataManager, securitySystem, fileHandlers, authHandler) {
        this.dataManager = dataManager;
        this.securitySystem = securitySystem;
        this.fileHandlers = fileHandlers;
        this.authHandler = authHandler;
    }

    authenticateToken(token) {
        return this.authHandler?.authenticateToken(token) || null;
    }

    // ============================================
    // === ПОЛУЧЕНИЕ ПОЛЬЗОВАТЕЛЕЙ ===
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
                status: u.status,
                lastSeen: u.lastSeen,
                createdAt: u.createdAt,
                friendsCount: u.friendsCount || 0,
                postsCount: u.postsCount || 0,
                giftsCount: u.giftsCount || 0,
                banned: u.banned || false
            }));

        this.securitySystem.logSecurityEvent(user, 'GET_USERS_LIST', `count:${otherUsers.length}`);

        return {
            success: true,
            users: otherUsers
        };
    }

    handleGetUser(token, userId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.id !== userId && !this.securitySystem.isFriend(user.id, userId)) {
            this.securitySystem.logSecurityEvent(user, 'GET_USER', `user:${userId}`, false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        this.securitySystem.logSecurityEvent(user, 'GET_USER', `user:${userId}`);

        return {
            success: true,
            user: {
                id: targetUser.id,
                username: targetUser.username,
                displayName: targetUser.displayName,
                avatar: targetUser.avatar,
                cover: targetUser.cover || null,
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

        const userGifts = this.dataManager.messages
            .filter(msg => msg.type === 'gift' && msg.receiverId === targetUser.id)
            .map(msg => ({
                id: msg.id,
                giftId: msg.giftId,
                giftName: msg.giftName,
                giftImage: msg.giftImage,
                fromUserId: msg.senderId,
                fromUserName: msg.displayName,
                timestamp: msg.timestamp
            }));

        const userPosts = this.dataManager.posts.filter(post => post.userId === targetUser.id);

        return {
            success: true,
            user: {
                id: targetUser.id,
                username: targetUser.username,
                displayName: targetUser.displayName,
                avatar: targetUser.avatar,
                cover: targetUser.cover || null,
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
            },
            gifts: userGifts,
            posts: userPosts
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

        const userData = {
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
            postsCount: this.dataManager.posts.filter(p => p.userId === targetUser.id).length,
            followersCount: targetUser.followers ? targetUser.followers.length : 0,
            followingCount: targetUser.following ? targetUser.following.length : 0
        };

        return { success: true, message: 'Данные пользователя получены', user: userData };
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

        if (this.dataManager.isMaintenanceMode && this.dataManager.isMaintenanceMode() && !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'UPDATE_PROFILE_DURING_MAINTENANCE', 'SYSTEM', false);
            return { 
                success: false, 
                message: 'В настоящее время ведутся технические работы. Функция обновления профиля временно недоступна.' 
            };
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

        console.log(`📝 Пользователь ${user.username} обновил профиль`);

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

        if (this.dataManager.isMaintenanceMode && this.dataManager.isMaintenanceMode() && !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'UPDATE_AVATAR_DURING_MAINTENANCE', 'SYSTEM', false);
            return { 
                success: false, 
                message: 'В настоящее время ведутся технические работы. Функция обновления аватара временно недоступна.' 
            };
        }

        const { avatar } = data;

        if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
            this.fileHandlers.deleteFile(user.avatar);
        }

        user.avatar = avatar;
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'UPDATE_AVATAR', 'SYSTEM');

        console.log(`🖼️ Пользователь ${user.username} обновил аватар`);

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

    async handleUploadAvatar(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_AVATAR', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { fileData, filename } = data;

        if (!fileData || !filename) {
            return { success: false, message: 'Файл не передан' };
        }

        if (!this.fileHandlers.validateAvatarFile(filename)) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_AVATAR', `file:${filename}`, false);
            return { success: false, message: 'Недопустимый формат файла для аватара' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `avatar_${user.id}_${Date.now()}${fileExt}`;
            const fileUrl = await this.fileHandlers.saveBufferToFolder(fileData, 'avatars', uniqueFilename);

            if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
                this.fileHandlers.deleteFile(user.avatar);
            }

            user.avatar = fileUrl;
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'UPLOAD_AVATAR', `file:${filename}`);

            console.log(`🖼️ Пользователь ${user.username} загрузил аватар: ${filename}`);

            return {
                success: true,
                avatarUrl: fileUrl,
                user: {
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    avatar: fileUrl
                }
            };
        } catch (error) {
            console.error('Ошибка загрузки аватара:', error);
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_AVATAR', `file:${filename}`, false);
            return { success: false, message: 'Ошибка загрузки файла: ' + error.message };
        }
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

    // ============================================
    // === ОБЛОЖКА ПРОФИЛЯ ===
    // ============================================

    handleUpdateCover(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'UPDATE_COVER', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { cover, fileData, filename } = data;

        if (cover) {
            if (user.cover && user.cover.startsWith('/uploads/covers/')) {
                this.fileHandlers.deleteFile(user.cover);
            }

            user.cover = cover;
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'UPDATE_COVER', 'SYSTEM');

            return {
                success: true,
                coverUrl: cover,
                user: {
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    cover: cover
                }
            };
        }

        if (fileData && filename) {
            if (!this.fileHandlers.validateCoverFile(filename)) {
                this.securitySystem.logSecurityEvent(user, 'UPDATE_COVER', `file:${filename}`, false);
                return { success: false, message: 'Недопустимый формат файла для обложки' };
            }

            try {
                const fileExt = path.extname(filename);
                const uniqueFilename = `cover_${user.id}_${Date.now()}${fileExt}`;
                const fileUrl = await this.fileHandlers.saveBufferToFolder(fileData, 'covers', uniqueFilename);

                if (user.cover && user.cover.startsWith('/uploads/covers/')) {
                    this.fileHandlers.deleteFile(user.cover);
                }

                user.cover = fileUrl;
                this.dataManager.saveData();

                this.securitySystem.logSecurityEvent(user, 'UPDATE_COVER', `file:${filename}`);

                console.log(`🖼️ Пользователь ${user.username} загрузил обложку профиля: ${filename}`);

                return {
                    success: true,
                    coverUrl: fileUrl,
                    user: {
                        id: user.id,
                        username: user.username,
                        displayName: user.displayName,
                        cover: fileUrl
                    }
                };
            } catch (error) {
                console.error('Ошибка загрузки обложки:', error);
                this.securitySystem.logSecurityEvent(user, 'UPDATE_COVER', `file:${filename}`, false);
                return { success: false, message: 'Ошибка загрузки файла' };
            }
        }

        return { success: false, message: 'Не указана обложка или файл' };
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
