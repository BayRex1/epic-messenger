const path = require('path');

class UsersManager {
    constructor(server) {
        this.server = server;
    }

    handleGetUsers(token) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const otherUsers = this.server.users
            .filter(u => u.id !== user.id)
            .map(u => this.server.auth.getSafeUserData(u));

        this.server.security.logSecurityEvent(user, 'GET_USERS_LIST', `count:${otherUsers.length}`);

        return {
            success: true,
            users: otherUsers
        };
    }

    handleGetUser(token, userId) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.id !== userId && !this.server.auth.isFriend(user.id, userId)) {
            this.server.security.logSecurityEvent(user, 'GET_USER', `user:${userId}`, false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const targetUser = this.server.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        this.server.security.logSecurityEvent(user, 'GET_USER', `user:${userId}`);

        return {
            success: true,
            user: this.server.auth.getSafeUserData(targetUser)
        };
    }

    handleGetUserByUsername(token, data) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { username } = data;
        
        if (!this.server.security.validateInput(username, 'username')) {
            return { success: false, message: 'Некорректное имя пользователя' };
        }

        const targetUser = this.server.users.find(u => u.username === username);
        
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        const userGifts = this.server.messages
            .filter(msg => msg.type === 'gift' && msg.toUserId === targetUser.id)
            .map(msg => ({
                id: msg.id,
                giftId: msg.giftId,
                giftName: msg.giftName,
                giftImage: msg.giftImage,
                fromUserId: msg.senderId,
                fromUserName: msg.displayName,
                timestamp: msg.timestamp
            }));

        const userPosts = this.server.posts.filter(post => post.userId === targetUser.id);

        return {
            success: true,
            user: this.server.auth.getSafeUserData(targetUser),
            gifts: userGifts,
            posts: userPosts
        };
    }

    handleUpdateProfile(token, data) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.server.security.logSecurityEvent(user, 'UPDATE_PROFILE', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { displayName, description, username, email } = data;

        if (displayName && displayName.trim()) {
            if (!this.server.security.validateInput(displayName, 'displayName')) {
                return { success: false, message: 'Некорректное отображаемое имя' };
            }
            user.displayName = this.server.security.sanitizeContent(displayName.trim());
        }

        if (description !== undefined) {
            user.description = this.server.security.sanitizeContent(description);
        }

        if (username && username.trim() && username !== user.username) {
            const sanitizedUsername = this.server.security.sanitizeContent(username.trim());
            
            if (!this.server.security.validateInput(sanitizedUsername, 'username')) {
                return { success: false, message: 'Некорректное имя пользователя' };
            }
            
            const existingUser = this.server.users.find(u => u.username === sanitizedUsername && u.id !== user.id);
            if (existingUser) {
                this.server.security.logSecurityEvent(user, 'UPDATE_PROFILE', `username:${sanitizedUsername}`, false);
                return { success: false, message: 'Имя пользователя уже занято' };
            }
            user.username = sanitizedUsername;
        }

        if (email && email.trim() && email !== user.email) {
            const sanitizedEmail = this.server.security.sanitizeContent(email.trim());
            
            if (!this.server.security.validateInput(sanitizedEmail, 'email')) {
                return { success: false, message: 'Некорректный email' };
            }
            
            const existingEmail = this.server.users.find(u => u.email === sanitizedEmail && u.id !== user.id);
            if (existingEmail) {
                this.server.security.logSecurityEvent(user, 'UPDATE_PROFILE', `email:${sanitizedEmail}`, false);
                return { success: false, message: 'Email уже используется' };
            }
            user.email = sanitizedEmail;
        }

        this.server.saveData();

        this.server.security.logSecurityEvent(user, 'UPDATE_PROFILE', 'SYSTEM');

        console.log(`📝 Пользователь ${user.username} обновил профиль`);

        return {
            success: true,
            user: this.server.auth.getSafeUserData(user)
        };
    }

    handleUpdateAvatar(token, data) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.server.security.logSecurityEvent(user, 'UPDATE_AVATAR', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { avatar } = data;

        if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
            this.server.files.deleteFile(user.avatar);
        }

        user.avatar = avatar;
        this.server.saveData();

        this.server.security.logSecurityEvent(user, 'UPDATE_AVATAR', 'SYSTEM');

        console.log(`🖼️ Пользователь ${user.username} обновил аватар`);

        return {
            success: true,
            user: this.server.auth.getSafeUserData(user)
        };
    }

    async handleUploadAvatar(token, data) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.server.security.logSecurityEvent(user, 'UPDATE_AVATAR', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { fileData, filename } = data;

        if (!this.server.files.validateAvatarFile(filename)) {
            this.server.security.logSecurityEvent(user, 'UPDATE_AVATAR', `file:${filename}`, false);
            return { success: false, message: 'Недопустимый формат файла для аватара' };
        }

        const maxSize = 5 * 1024 * 1024;
        if (!fileData || fileData.length > maxSize) {
            return { success: false, message: 'Размер файла не должен превышать 5 МБ' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `avatar_${user.id}_${Date.now()}${fileExt}`;
            
            console.log('💾 Сохранение аватара...');
            const fileUrl = await this.server.files.saveFile(fileData, uniqueFilename, 'avatar');
            console.log('✅ Аватар сохранен:', fileUrl);

            if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
                this.server.files.deleteFile(user.avatar);
            }

            user.avatar = fileUrl;
            this.server.saveData();

            this.server.security.logSecurityEvent(user, 'UPDATE_AVATAR', `file:${filename}`);

            console.log(`🖼️ Пользователь ${user.username} загрузил аватар: ${filename}`);

            return {
                success: true,
                avatarUrl: fileUrl,
                user: this.server.auth.getSafeUserData(user)
            };
        } catch (error) {
            console.error('Ошибка загрузки аватара:', error);
            this.server.security.logSecurityEvent(user, 'UPDATE_AVATAR', `file:${filename}`, false);
            return { success: false, message: 'Ошибка загрузки файла: ' + error.message };
        }
    }

    registerDevice(userId, req) {
        const deviceId = this.server.security.generateDeviceId(req);
        const deviceInfo = this.server.security.getDeviceInfo(req);
        const ip = this.server.security.getClientIP(req);
        
        const device = {
            id: deviceId,
            userId: userId,
            name: `${deviceInfo.browser} on ${deviceInfo.os}`,
            browser: deviceInfo.browser,
            os: deviceInfo.os,
            ip: ip,
            userAgent: deviceInfo.userAgent,
            lastActive: new Date(),
            createdAt: new Date(),
            isOwner: false
        };
        
        const userDevices = Array.from(this.server.devices.values()).filter(d => d.userId === userId);
        if (userDevices.length === 0) {
            device.isOwner = true;
        }
        
        this.server.devices.set(deviceId, device);
        this.server.saveData();
        return device;
    }

    getUserDevices(userId) {
        return Array.from(this.server.devices.values()).filter(device => device.userId === userId);
    }

    terminateDevice(userId, deviceId) {
        const device = this.server.devices.get(deviceId);
        if (!device || device.userId !== userId) {
            return false;
        }
        
        const userDevices = this.getUserDevices(userId);
        const isOwner = userDevices.some(d => d.isOwner);
        const targetDevice = userDevices.find(d => d.id === deviceId);
        
        if (!targetDevice) return false;
        
        if (targetDevice.isOwner || isOwner) {
            this.server.devices.delete(deviceId);
            this.server.saveData();
            return true;
        } else {
            const timeDiff = Date.now() - new Date(targetDevice.createdAt).getTime();
            if (timeDiff > 24 * 60 * 60 * 1000) {
                this.server.devices.delete(deviceId);
                this.server.saveData();
                return true;
            }
            return false;
        }
    }

    handleGetDevices(token) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const devices = this.getUserDevices(user.id);
        
        this.server.security.logSecurityEvent(user, 'GET_DEVICES', `count:${devices.length}`);

        return {
            success: true,
            devices: devices
        };
    }

    handleTerminateDevice(token, data) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { deviceId } = data;
        const success = this.terminateDevice(user.id, deviceId);

        if (success) {
            this.server.security.logSecurityEvent(user, 'TERMINATE_DEVICE', `device:${deviceId}`);
            return {
                success: true,
                message: 'Сеанс устройства завершен'
            };
        } else {
            this.server.security.logSecurityEvent(user, 'TERMINATE_DEVICE', `device:${deviceId}`, false);
            return {
                success: false,
                message: 'Не удалось завершить сеанс устройства'
            };
        }
    }

    handleGetMyGifts(token) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const myGifts = this.server.messages
            .filter(msg => msg.type === 'gift' && msg.toUserId === user.id)
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
            }));

        return {
            success: true,
            gifts: myGifts
        };
    }
}

module.exports = UsersManager;
