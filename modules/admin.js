class AdminManager {
    constructor(server) {
        this.server = server;
    }

    handleAdminStats(token) {
        const user = this.server.auth.authenticateToken(token);
        
        if (!user || !this.server.auth.isAdmin(user)) {
            this.server.security.logSecurityEvent(user, 'VIEW_ADMIN_STATS', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        this.server.security.logSecurityEvent(user, 'VIEW_ADMIN_STATS', 'SYSTEM');

        return {
            success: true,
            stats: {
                totalUsers: this.server.users.length,
                totalMessages: this.server.messages.length,
                totalPosts: this.server.posts.length,
                totalGifts: this.server.gifts.length,
                totalPromoCodes: this.server.promoCodes.length,
                totalMusic: this.server.music.length,
                totalPlaylists: this.server.playlists.length,
                totalGroups: this.server.groups.length,
                onlineUsers: this.server.users.filter(u => u.status === 'online').length,
                bannedUsers: this.server.users.filter(u => u.banned).length,
                bannedIPs: this.server.bannedIPs.size,
                activeDevices: this.server.devices.size
            }
        };
    }

    handleDeleteUser(token, data) {
        const user = this.server.auth.authenticateToken(token);
        
        if (!user || !this.server.auth.isAdmin(user)) {
            this.server.security.logSecurityEvent(user, 'DELETE_USER', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        
        const targetUser = this.server.users.find(u => u.id === userId);
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
            this.server.files.deleteFile(targetUser.avatar);
        }

        Array.from(this.server.devices.entries()).forEach(([deviceId, device]) => {
            if (device.userId === userId) {
                this.server.devices.delete(deviceId);
            }
        });

        this.server.users = this.server.users.filter(u => u.id !== userId);
        this.server.saveData();

        this.server.security.logSecurityEvent(user, 'DELETE_USER', `user:${targetUser.username}`);

        console.log(`🗑️ Администратор ${user.displayName} удалил аккаунт: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} успешно удален`
        };
    }

    handleBanUser(token, data) {
        const user = this.server.auth.authenticateToken(token);
        
        if (!user || !this.server.auth.isAdmin(user)) {
            this.server.security.logSecurityEvent(user, 'BAN_USER', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId, banned } = data;
        
        const targetUser = this.server.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        if (targetUser.isProtected) {
            return { success: false, message: 'Нельзя заблокировать защищенного пользователя' };
        }

        targetUser.banned = banned;

        if (banned) {
            // ИСПРАВЛЕНО: правильное имя метода
            const userDevices = this.server.usersManager.getUserDevices(userId);
            if (userDevices.length > 0) {
                const lastDevice = userDevices[userDevices.length - 1];
                this.server.banIP(lastDevice.ip);
            }
        }

        this.server.saveData();

        this.server.security.logSecurityEvent(user, banned ? 'BAN_USER' : 'UNBAN_USER', `user:${targetUser.username}`);

        console.log(`🔒 Администратор ${user.displayName} ${banned ? 'заблокировал' : 'разблокировал'} аккаунт: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} ${banned ? 'заблокирован' : 'разблокирован'}`
        };
    }

    handleToggleVerification(token, data) {
        const user = this.server.auth.authenticateToken(token);
        
        if (!user || !this.server.auth.isAdmin(user)) {
            this.server.security.logSecurityEvent(user, 'TOGGLE_VERIFICATION', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        
        const targetUser = this.server.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        targetUser.verified = !targetUser.verified;
        this.server.saveData();

        this.server.security.logSecurityEvent(user, 'TOGGLE_VERIFICATION', `user:${targetUser.username}, status:${targetUser.verified}`);

        console.log(`✅ Администратор ${user.displayName} ${targetUser.verified ? 'верифицировал' : 'снял верификацию с'} аккаунта: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} ${targetUser.verified ? 'верифицирован' : 'лишен верификации'}`,
            verified: targetUser.verified
        };
    }

    handleToggleDeveloper(token, data) {
        const user = this.server.auth.authenticateToken(token);
        
        if (!user || !this.server.auth.isAdmin(user)) {
            this.server.security.logSecurityEvent(user, 'TOGGLE_DEVELOPER', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        
        const targetUser = this.server.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        targetUser.isDeveloper = !targetUser.isDeveloper;
        this.server.saveData();

        this.server.security.logSecurityEvent(user, 'TOGGLE_DEVELOPER', `user:${targetUser.username}, status:${targetUser.isDeveloper}`);

        console.log(`👑 Администратор ${user.displayName} ${targetUser.isDeveloper ? 'дал права разработчика' : 'забрал права разработчика'} у: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} ${targetUser.isDeveloper ? 'получил права разработчика' : 'лишен прав разработчика'}`,
            isDeveloper: targetUser.isDeveloper
        };
    }
}

module.exports = AdminManager;
