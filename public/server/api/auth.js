const crypto = require('crypto');
const { getClientIP, generateDeviceId } = require('../utils');

class AuthHandler {
    constructor(dataManager, securitySystem) {
        this.dataManager = dataManager;
        this.securitySystem = securitySystem;
    }

    authenticateToken(token) {
        if (!token) return null;
        
        try {
            let userId, sessionId;
            
            try {
                const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
                userId = decoded.userId;
                sessionId = decoded.sessionId;
            } catch {
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

        if (this.dataManager.isMaintenanceMode && this.dataManager.isMaintenanceMode() && !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'LOGIN_DURING_MAINTENANCE', 'SYSTEM', false);
            return { 
                success: false, 
                message: 'В настоящее время ведутся технические работы. Пожалуйста, попробуйте позже.' 
            };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'LOGIN', 'SYSTEM', false);
            return { success: false, message: 'Аккаунт заблокирован' };
        }

        const clientIP = getClientIP(req);
        if (this.dataManager.isIPBanned(clientIP)) {
            this.securitySystem.logSecurityEvent(user, 'LOGIN', 'SYSTEM', false);
            return { success: false, message: 'Ваш IP адрес заблокирован' };
        }

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

    handleRegister(data, req) {
        const { username, displayName, email, password } = data;

        const clientIP = getClientIP(req);
        if (this.dataManager.isIPBanned(clientIP)) {
            this.securitySystem.logSecurityEvent({ username }, 'REGISTER', 'SYSTEM', false);
            return { success: false, message: 'Ваш IP адрес заблокирован. Регистрация невозможна.' };
        }

        if (this.dataManager.isMaintenanceMode && this.dataManager.isMaintenanceMode()) {
            this.securitySystem.logSecurityEvent({ username }, 'REGISTER_DURING_MAINTENANCE', 'SYSTEM', false);
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
            cover: null,
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
                cover: newUser.cover,
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
            this.securitySystem.logSecurityEvent(user, 'CHECK_AUTH', 'SYSTEM', false);
            return { authenticated: false, message: 'Аккаунт заблокирован' };
        }

        const clientIP = getClientIP(req);
        if (this.dataManager.isIPBanned(clientIP)) {
            this.securitySystem.logSecurityEvent(user, 'CHECK_AUTH', 'SYSTEM', false);
            return { authenticated: false, message: 'IP адрес заблокирован' };
        }

        const deviceId = generateDeviceId(req);
        const device = this.dataManager.devices.get(deviceId);
        if (device && device.userId === user.id) {
            device.lastActive = new Date();
            this.dataManager.saveData();
        }

        this.securitySystem.logSecurityEvent(user, 'CHECK_AUTH', 'SYSTEM');

        return {
            authenticated: true,
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

    handleCurrentUser(token, req) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'GET_CURRENT_USER', 'SYSTEM', false);
            return { success: false, message: 'Аккаунт заблокирован' };
        }

        const clientIP = getClientIP(req);
        if (this.dataManager.isIPBanned(clientIP)) {
            this.securitySystem.logSecurityEvent(user, 'GET_CURRENT_USER', 'SYSTEM', false);
            return { success: false, message: 'IP адрес заблокирован' };
        }

        const deviceId = generateDeviceId(req);
        const device = this.dataManager.devices.get(deviceId);
        if (device && device.userId === user.id) {
            device.lastActive = new Date();
            this.dataManager.saveData();
        }

        this.securitySystem.logSecurityEvent(user, 'GET_CURRENT_USER', 'SYSTEM');

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

    handleLogout(token) {
        const user = this.authenticateToken(token);
        if (user) {
            user.sessionId = crypto.randomBytes(16).toString('hex');
            user.status = 'offline';
            this.dataManager.saveData();
        }
        return { success: true, message: 'Выход выполнен' };
    }
}

module.exports = AuthHandler;
