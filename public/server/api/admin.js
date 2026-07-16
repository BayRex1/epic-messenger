class AdminHandler {
    constructor(dataManager, securitySystem, fileHandlers, authHandler) {
        this.dataManager = dataManager;
        this.securitySystem = securitySystem;
        this.fileHandlers = fileHandlers;
        this.authHandler = authHandler;
    }

    authenticateToken(token) {
        return this.authHandler?.authenticateToken(token) || null;
    }

    isAdmin(user) {
        return user && (user.isDeveloper === true || user.verified === true);
    }

    // ============================================
    // СТАТИСТИКА
    // ============================================

    handleAdminStats(token) {
        const user = this.authenticateToken(token);
        if (!user || !this.isAdmin(user)) {
            this.securitySystem.logSecurityEvent(user, 'ADMIN_STATS', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const stats = {
            totalUsers: this.dataManager.users.length,
            totalPosts: this.dataManager.posts.length,
            totalGifts: this.dataManager.gifts.length,
            totalPromoCodes: this.dataManager.promoCodes.length,
            onlineUsers: this.dataManager.users.filter(u => u.status === 'online').length,
            totalMessages: this.dataManager.messages.length,
            totalChats: this.dataManager.chats.length
        };

        this.securitySystem.logSecurityEvent(user, 'ADMIN_STATS', `stats:${JSON.stringify(stats)}`);

        return { success: true, stats: stats };
    }

    handleAdminStatistics(token) {
        return this.handleAdminStats(token);
    }

    // ============================================
    // ПОЛЬЗОВАТЕЛИ
    // ============================================

    handleAdminGetUsers(token) {
        const user = this.authenticateToken(token);
        if (!user || !this.isAdmin(user)) {
            this.securitySystem.logSecurityEvent(user, 'ADMIN_GET_USERS', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const users = this.dataManager.users.map(u => ({
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            avatar: u.avatar,
            verified: u.verified || false,
            isDeveloper: u.isDeveloper || false,
            banned: u.banned || false,
            status: u.status || 'offline',
            coins: u.coins || 0,
            createdAt: u.createdAt
        }));

        this.securitySystem.logSecurityEvent(user, 'ADMIN_GET_USERS', `count:${users.length}`);

        return { success: true, users: users };
    }

    // ============================================
    // ★★★ БАН / РАЗБАН ★★★
    // ============================================

    handleBanUser(token, data) {
        const admin = this.authenticateToken(token);
        if (!admin || !this.isAdmin(admin)) {
            this.securitySystem.logSecurityEvent(admin, 'BAN_USER', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        if (!userId) {
            return { success: false, message: 'Не указан пользователь' };
        }

        const user = this.dataManager.users.find(u => u.id === userId);
        if (!user) {
            return { success: false, message: 'Пользователь не найден' };
        }

        // ★★★ НЕЛЬЗЯ ЗАБАНИТЬ BayRex ★★★
        if (user.username === 'BayRex') {
            this.securitySystem.logSecurityEvent(admin, 'BAN_USER', `target:${user.username}`, false);
            return { success: false, message: 'Нельзя заблокировать BayRex' };
        }

        // ★★★ НЕЛЬЗЯ ЗАБАНИТЬ СЕБЯ ★★★
        if (user.id === admin.id) {
            this.securitySystem.logSecurityEvent(admin, 'BAN_USER', 'self', false);
            return { success: false, message: 'Нельзя заблокировать себя' };
        }

        // ★★★ УСТАНАВЛИВАЕМ БАН ★★★
        user.banned = true;
        user.status = 'offline';
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(admin, 'BAN_USER', `user:${user.username}`);

        console.log(`🔒 Администратор ${admin.displayName} заблокировал пользователя ${user.displayName}`);

        return {
            success: true,
            message: 'Пользователь успешно заблокирован',
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                banned: user.banned
            }
        };
    }

    handleUnbanUser(token, data) {
        const admin = this.authenticateToken(token);
        if (!admin || !this.isAdmin(admin)) {
            this.securitySystem.logSecurityEvent(admin, 'UNBAN_USER', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        if (!userId) {
            return { success: false, message: 'Не указан пользователь' };
        }

        const user = this.dataManager.users.find(u => u.id === userId);
        if (!user) {
            return { success: false, message: 'Пользователь не найден' };
        }

        // ★★★ ПРОВЕРЯЕМ, ЗАБЛОКИРОВАН ЛИ ★★★
        if (user.banned !== true) {
            return { success: false, message: 'Пользователь не заблокирован' };
        }

        // ★★★ СНИМАЕМ БАН ★★★
        user.banned = false;
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(admin, 'UNBAN_USER', `user:${user.username}`);

        console.log(`🔓 Администратор ${admin.displayName} разблокировал пользователя ${user.displayName}`);

        return {
            success: true,
            message: 'Пользователь успешно разблокирован',
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                banned: user.banned
            }
        };
    }

    // ============================================
    // ВЕРИФИКАЦИЯ
    // ============================================

    handleToggleVerification(token, data) {
        const admin = this.authenticateToken(token);
        if (!admin || !this.isAdmin(admin)) {
            this.securitySystem.logSecurityEvent(admin, 'TOGGLE_VERIFICATION', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        if (!userId) {
            return { success: false, message: 'Не указан пользователь' };
        }

        const user = this.dataManager.users.find(u => u.id === userId);
        if (!user) {
            return { success: false, message: 'Пользователь не найден' };
        }

        // ★★★ НЕЛЬЗЯ МЕНЯТЬ BayRex ★★★
        if (user.username === 'BayRex') {
            this.securitySystem.logSecurityEvent(admin, 'TOGGLE_VERIFICATION', `target:${user.username}`, false);
            return { success: false, message: 'Нельзя изменять права BayRex' };
        }

        user.verified = !user.verified;
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(admin, 'TOGGLE_VERIFICATION', `user:${user.username}, verified:${user.verified}`);

        console.log(`✅ Администратор ${admin.displayName} ${user.verified ? 'верифицировал' : 'снял верификацию'} с ${user.displayName}`);

        return {
            success: true,
            message: user.verified ? 'Пользователь верифицирован' : 'Верификация снята',
            verified: user.verified,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                verified: user.verified
            }
        };
    }

    // ============================================
    // РАЗРАБОТЧИК
    // ============================================

    handleToggleDeveloper(token, data) {
        const admin = this.authenticateToken(token);
        if (!admin || !this.isAdmin(admin)) {
            this.securitySystem.logSecurityEvent(admin, 'TOGGLE_DEVELOPER', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        if (!userId) {
            return { success: false, message: 'Не указан пользователь' };
        }

        const user = this.dataManager.users.find(u => u.id === userId);
        if (!user) {
            return { success: false, message: 'Пользователь не найден' };
        }

        // ★★★ НЕЛЬЗЯ МЕНЯТЬ BayRex ★★★
        if (user.username === 'BayRex') {
            this.securitySystem.logSecurityEvent(admin, 'TOGGLE_DEVELOPER', `target:${user.username}`, false);
            return { success: false, message: 'Нельзя изменять права BayRex' };
        }

        user.isDeveloper = !user.isDeveloper;
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(admin, 'TOGGLE_DEVELOPER', `user:${user.username}, isDeveloper:${user.isDeveloper}`);

        console.log(`👑 Администратор ${admin.displayName} ${user.isDeveloper ? 'сделал разработчиком' : 'снял права разработчика'} с ${user.displayName}`);

        return {
            success: true,
            message: user.isDeveloper ? 'Пользователь назначен разработчиком' : 'Права разработчика сняты',
            isDeveloper: user.isDeveloper,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                isDeveloper: user.isDeveloper
            }
        };
    }

    // ============================================
    // ДРУГИЕ МЕТОДЫ
    // ============================================

    handleDeleteUser(token, data) {
        const admin = this.authenticateToken(token);
        if (!admin || !this.isAdmin(admin)) {
            this.securitySystem.logSecurityEvent(admin, 'DELETE_USER', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        if (!userId) {
            return { success: false, message: 'Не указан пользователь' };
        }

        const userIndex = this.dataManager.users.findIndex(u => u.id === userId);
        if (userIndex === -1) {
            return { success: false, message: 'Пользователь не найден' };
        }

        const user = this.dataManager.users[userIndex];
        
        // ★★★ НЕЛЬЗЯ УДАЛИТЬ BayRex ★★★
        if (user.username === 'BayRex') {
            this.securitySystem.logSecurityEvent(admin, 'DELETE_USER', `target:${user.username}`, false);
            return { success: false, message: 'Нельзя удалить BayRex' };
        }

        if (user.id === admin.id) {
            this.securitySystem.logSecurityEvent(admin, 'DELETE_USER', 'self', false);
            return { success: false, message: 'Нельзя удалить себя' };
        }

        this.dataManager.users.splice(userIndex, 1);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(admin, 'DELETE_USER', `user:${user.username}`);

        console.log(`🗑️ Администратор ${admin.displayName} удалил пользователя ${user.displayName}`);

        return { success: true, message: 'Пользователь удален' };
    }

    handleExportDatabase(token, res) {
        const user = this.authenticateToken(token);
        if (!user || !this.isAdmin(user)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Доступ запрещен' }));
            return;
        }

        try {
            const data = {
                exportInfo: {
                    exportedAt: new Date().toISOString(),
                    exportedBy: user.username,
                    version: '1.0'
                },
                data: {
                    users: this.dataManager.users.map(u => ({
                        ...u,
                        password: '***HIDDEN***'
                    })),
                    messages: this.dataManager.messages,
                    posts: this.dataManager.posts,
                    gifts: this.dataManager.gifts,
                    promoCodes: this.dataManager.promoCodes,
                    music: this.dataManager.music,
                    playlists: this.dataManager.playlists,
                    groups: this.dataManager.groups,
                    chats: this.dataManager.chats,
                    bannedIPs: Object.fromEntries(this.dataManager.bannedIPs),
                    devices: Object.fromEntries(this.dataManager.devices)
                }
            };

            const json = JSON.stringify(data, null, 2);
            
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="epic-database-${Date.now()}.json"`
            });
            res.end(json);

            this.securitySystem.logSecurityEvent(user, 'EXPORT_DATABASE', `size:${json.length}`);

        } catch (error) {
            console.error('❌ Ошибка экспорта БД:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Ошибка экспорта' }));
        }
    }

    handleMaintenanceMode(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !this.isAdmin(user)) {
            this.securitySystem.logSecurityEvent(user, 'MAINTENANCE_MODE', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { enabled } = data;
        if (enabled === undefined) {
            return { success: false, message: 'Не указан режим' };
        }

        this.dataManager.setMaintenanceMode(enabled);

        this.securitySystem.logSecurityEvent(user, 'MAINTENANCE_MODE', `enabled:${enabled}`);

        return {
            success: true,
            message: enabled ? 'Режим технических работ включен' : 'Режим технических работ выключен',
            maintenanceMode: this.dataManager.isMaintenanceMode()
        };
    }

    handleGetMaintenanceStatus(token) {
        const user = this.authenticateToken(token);
        if (!user || !this.isAdmin(user)) {
            return { success: false, message: 'Доступ запрещен' };
        }

        return {
            success: true,
            maintenanceMode: this.dataManager.isMaintenanceMode()
        };
    }

    handleGetMaintenanceStatusPublic(token) {
        return {
            success: true,
            maintenanceMode: this.dataManager.isMaintenanceMode()
        };
    }

    handleAdminSecurityLogs(token) {
        const user = this.authenticateToken(token);
        if (!user || !this.isAdmin(user)) {
            this.securitySystem.logSecurityEvent(user, 'ADMIN_SECURITY_LOGS', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const logs = this.securitySystem.getSecurityLogs ? this.securitySystem.getSecurityLogs() : [];

        return {
            success: true,
            logs: logs
        };
    }

    handleAdminVerifyUser(token, data) {
        return this.handleToggleVerification(token, data);
    }

    handleAdminMakeDeveloper(token, data) {
        return this.handleToggleDeveloper(token, data);
    }
}

module.exports = AdminHandler;
