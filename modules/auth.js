class AuthManager {
    constructor(server) {
        this.server = server;
    }

    authenticateToken(token) {
        if (!token) {
            return null;
        }

        const session = this.server.security.validateSession(token);
        if (!session) {
            return null;
        }
        
        const user = this.server.users.find(u => u.id === session.userId);
        return user;
    }

    isAdmin(user) {
        return user && user.isDeveloper && user.isAdmin;
    }

    isFriend(userId1, userId2) {
        return false;
    }

    handleLogin(data, req) {
        const { username, password } = data;
        
        if (!this.server.security.validateInput(username, 'username') || !password) {
            return { success: false, message: 'Некорректные данные для входа' };
        }

        const user = this.server.users.find(u => u.username === username);
        
        if (!user) {
            this.server.security.logSecurityEvent({ username }, 'LOGIN', 'SYSTEM', false);
            return { success: false, message: 'Неверное имя пользователя или пароль' };
        }

        // Проверяем пароль
        let isPasswordValid = false;
        try {
            // Для старых пользователей с SHA256 хэшем
            if (user.password && !user.password.includes(':')) {
                // Старый формат хэша (SHA256 без соли)
                const hashedPassword = this.server.security.hashPasswordSHA256(password);
                isPasswordValid = (user.password === hashedPassword);
                
                // Миграция на новый формат
                if (isPasswordValid) {
                    user.password = this.server.security.hashPassword(password);
                    this.server.saveData();
                }
            } else {
                // Новый формат хэша (PBKDF2 с солью)
                isPasswordValid = this.server.security.verifyPassword(password, user.password);
            }
        } catch (error) {
            console.error('Ошибка проверки пароля:', error);
            isPasswordValid = false;
        }

        if (!isPasswordValid) {
            this.server.security.logSecurityEvent(user, 'LOGIN', 'SYSTEM', false);
            return { success: false, message: 'Неверное имя пользователя или пароль' };
        }

        if (user.banned) {
            this.server.security.logSecurityEvent(user, 'LOGIN', 'SYSTEM', false);
            return { success: false, message: 'Аккаунт заблокирован' };
        }

        const clientIP = this.server.security.getClientIP(req);
        if (this.server.isIPBanned(clientIP)) {
            this.server.security.logSecurityEvent(user, 'LOGIN', 'SYSTEM', false);
            return { success: false, message: 'Ваш IP адрес заблокирован' };
        }

        // СОЗДАЕМ СЕССИЮ ПЕРЕД ОТВЕТОМ
        const sessionToken = this.server.security.createSession(user.id);
        const device = this.server.usersManager.registerDevice(user.id, req);

        user.status = 'online';
        user.lastSeen = new Date();
        this.server.saveData();

        this.server.security.logSecurityEvent(user, 'LOGIN', 'SYSTEM');

        return {
            success: true,
            token: sessionToken,
            deviceId: device.id,
            user: this.getSafeUserData(user)
        };
    }

    handleRegister(data, req) {
        const { username, displayName, email, password } = data;

        const clientIP = this.server.security.getClientIP(req);
        if (this.server.isIPBanned(clientIP)) {
            this.server.security.logSecurityEvent({ username }, 'REGISTER', 'SYSTEM', false);
            return { success: false, message: 'Ваш IP адрес заблокирован. Регистрация невозможна.' };
        }

        if (!username || !displayName || !email || !password) {
            return { success: false, message: 'Все поля обязательны для заполнения' };
        }

        if (!this.server.security.validateInput(username, 'username')) {
            return { success: false, message: 'Некорректное имя пользователя' };
        }
        if (!this.server.security.validateInput(displayName, 'displayName')) {
            return { success: false, message: 'Некорректное отображаемое имя' };
        }
        if (!this.server.security.validateInput(email, 'email')) {
            return { success: false, message: 'Некорректный email' };
        }

        if (username.length < 3) {
            return { success: false, message: 'Имя пользователя должно содержать минимум 3 символа' };
        }

        if (password.length < 6) {
            return { success: false, message: 'Пароль должен содержать минимум 6 символов' };
        }

        const sanitizedUsername = this.server.security.sanitizeContent(username);
        const sanitizedDisplayName = this.server.security.sanitizeContent(displayName);
        const sanitizedEmail = this.server.security.sanitizeContent(email);

        const existingUser = this.server.users.find(u => u.username === sanitizedUsername);
        if (existingUser) {
            return { success: false, message: 'Пользователь с таким именем уже существует' };
        }

        const existingEmail = this.server.users.find(u => u.email === sanitizedEmail);
        if (existingEmail) {
            return { success: false, message: 'Пользователь с таким email уже существует' };
        }

        const isBayRex = sanitizedUsername.toLowerCase() === 'bayrex';
        
        const newUser = {
            id: this.server.generateId(),
            username: sanitizedUsername,
            displayName: sanitizedDisplayName,
            email: sanitizedEmail,
            password: this.server.security.hashPassword(password),
            avatar: null,
            description: 'Новый пользователь Epic Messenger',
            coins: isBayRex ? 50000 : 1000,
            verified: isBayRex,
            isDeveloper: isBayRex,
            isAdmin: isBayRex,
            status: 'online',
            lastSeen: new Date(),
            createdAt: new Date(),
            gifts: [],
            isProtected: isBayRex,
            friendsCount: 0,
            postsCount: 0,
            giftsCount: 0,
            banned: false
        };

        this.server.users.push(newUser);

        // СОЗДАЕМ СЕССИЮ ПЕРЕД ОТВЕТОМ
        const sessionToken = this.server.security.createSession(newUser.id);
        const device = this.server.usersManager.registerDevice(newUser.id, req);
        
        this.server.saveData();

        this.server.security.logSecurityEvent(newUser, 'REGISTER', 'SYSTEM');

        if (isBayRex) {
            console.log(`👑 BayRex зарегистрирован с правами администратора!`);
        }

        return {
            success: true,
            message: isBayRex ? 
                'Аккаунт BayRex создан! Вы получили права администратора!' :
                'Аккаунт успешно создан! Добро пожаловать в Epic Messenger!',
            token: sessionToken,
            deviceId: device.id,
            user: this.getSafeUserData(newUser)
        };
    }

    getSafeUserData(user) {
        if (!user) return null;
        
        return {
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
        };
    }

    handleCheckAuth(token, req) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { authenticated: false };
        }

        if (user.banned) {
            this.server.security.logSecurityEvent(user, 'CHECK_AUTH', 'SYSTEM', false);
            return { authenticated: false, message: 'Аккаунт заблокирован' };
        }

        const clientIP = this.server.security.getClientIP(req);
        if (this.server.isIPBanned(clientIP)) {
            this.server.security.logSecurityEvent(user, 'CHECK_AUTH', 'SYSTEM', false);
            return { authenticated: false, message: 'IP адрес заблокирован' };
        }

        const deviceId = this.server.security.generateDeviceId(req);
        const device = this.server.devices.get(deviceId);
        if (device && device.userId === user.id) {
            device.lastActive = new Date();
            this.server.saveData();
        }

        this.server.security.logSecurityEvent(user, 'CHECK_AUTH', 'SYSTEM');

        return {
            authenticated: true,
            user: this.getSafeUserData(user)
        };
    }

    handleCurrentUser(token, req) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.server.security.logSecurityEvent(user, 'GET_CURRENT_USER', 'SYSTEM', false);
            return { success: false, message: 'Аккаунт заблокирован' };
        }

        const clientIP = this.server.security.getClientIP(req);
        if (this.server.isIPBanned(clientIP)) {
            this.server.security.logSecurityEvent(user, 'GET_CURRENT_USER', 'SYSTEM', false);
            return { success: false, message: 'IP адрес заблокирован' };
        }

        const deviceId = this.server.security.generateDeviceId(req);
        const device = this.server.devices.get(deviceId);
        if (device && device.userId === user.id) {
            device.lastActive = new Date();
            this.server.saveData();
        }

        this.server.security.logSecurityEvent(user, 'GET_CURRENT_USER', 'SYSTEM');

        return {
            success: true,
            user: this.getSafeUserData(user)
        };
    }
}

module.exports = AuthManager;
