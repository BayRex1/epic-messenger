const fs = require('fs');

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

    handleAdminStats(token) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'VIEW_ADMIN_STATS', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        this.securitySystem.logSecurityEvent(user, 'VIEW_ADMIN_STATS', 'SYSTEM');

        return {
            success: true,
            stats: {
                totalUsers: this.dataManager.users.length,
                totalMessages: this.dataManager.messages.length,
                totalPosts: this.dataManager.posts.length,
                totalGifts: this.dataManager.gifts.length,
                totalPromoCodes: this.dataManager.promoCodes.length,
                totalMusic: this.dataManager.music.length,
                totalPlaylists: this.dataManager.playlists.length,
                totalGroups: this.dataManager.groups.length,
                onlineUsers: this.dataManager.users.filter(u => u.status === 'online').length,
                bannedUsers: this.dataManager.users.filter(u => u.banned).length,
                bannedIPs: this.dataManager.bannedIPs.size,
                activeDevices: this.dataManager.devices.size,
                maintenanceMode: this.dataManager.isMaintenanceMode ? this.dataManager.isMaintenanceMode() : false
            }
        };
    }

    handleAdminStatistics(token) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const stats = {
            totalUsers: this.dataManager.users.length,
            totalMessages: this.dataManager.messages.length,
            totalPosts: this.dataManager.posts.length,
            totalGifts: this.dataManager.gifts.length,
            totalMusic: this.dataManager.music.length,
            totalGroups: this.dataManager.groups.length,
            onlineUsers: this.dataManager.users.filter(u => u.status === 'online').length,
            bannedIPs: this.dataManager.bannedIPs.size,
            maintenanceMode: this.dataManager.maintenanceMode,
            dataFileSize: this.getFileSize(this.dataManager.dataFile)
        };

        return { success: true, message: 'Статистика получена', statistics: stats };
    }

    getFileSize(filePath) {
        try {
            const stats = fs.statSync(filePath);
            return (stats.size / 1024 / 1024).toFixed(2) + ' MB';
        } catch (error) {
            return 'Unknown';
        }
    }

    handleDeleteUser(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'DELETE_USER', 'SYSTEM', false);
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
        if (targetUser.cover && targetUser.cover.startsWith('/uploads/covers/')) {
            this.fileHandlers.deleteFile(targetUser.cover);
        }

        Array.from(this.dataManager.devices.entries()).forEach(([deviceId, device]) => {
            if (device.userId === userId) {
                this.dataManager.devices.delete(deviceId);
            }
        });

        this.dataManager.users = this.dataManager.users.filter(u => u.id !== userId);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'DELETE_USER', `user:${targetUser.username}`);

        console.log(`🗑️ Администратор ${user.displayName} удалил аккаунт: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} успешно удален`
        };
    }

    handleBanUser(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'BAN_USER', 'SYSTEM', false);
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

        const userDevices = this.dataManager.getUserDevices(userId);
        if (userDevices.length > 0) {
            const lastDevice = userDevices[userDevices.length - 1];
            this.dataManager.banIP(lastDevice.ip);
        }

        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'BAN_USER', `user:${targetUser.username}, reason:${reason}`);

        console.log(`🔒 Администратор ${user.displayName} заблокировал аккаунт: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} заблокирован`
        };
    }

    handleUnbanUser(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'UNBAN_USER', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { ip } = data;
        if (!ip) {
            return { success: false, message: 'IP не указан' };
        }

        this.dataManager.bannedIPs.delete(ip);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'UNBAN_USER', `ip:${ip}`);

        return { success: true, message: `IP ${ip} разбанен` };
    }

    handleToggleVerification(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'TOGGLE_VERIFICATION', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        targetUser.verified = !targetUser.verified;
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'TOGGLE_VERIFICATION', `user:${targetUser.username}, status:${targetUser.verified}`);

        console.log(`✅ Администратор ${user.displayName} ${targetUser.verified ? 'верифицировал' : 'снял верификацию с'} аккаунта: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} ${targetUser.verified ? 'верифицирован' : 'лишен верификации'}`,
            verified: targetUser.verified
        };
    }

    handleToggleDeveloper(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'TOGGLE_DEVELOPER', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        targetUser.isDeveloper = !targetUser.isDeveloper;
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'TOGGLE_DEVELOPER', `user:${targetUser.username}, status:${targetUser.isDeveloper}`);

        console.log(`👑 Администратор ${user.displayName} ${targetUser.isDeveloper ? 'дал права разработчика' : 'забрал права разработчика'} у: ${targetUser.username}`);

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
            avatar: u.avatar,
            cover: u.cover || null,
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

    handleAdminVerifyUser(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Недостаточно прав' };
        }

        const { userId, verified } = data;
        if (!userId) {
            return { success: false, message: 'Не указан пользователь' };
        }

        try {
            const targetUser = this.dataManager.users.find(u => u.id === userId);
            if (!targetUser) {
                return { success: false, message: 'Пользователь не найден' };
            }

            targetUser.verified = !!verified;
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'ADMIN_VERIFY_USER', `target:${targetUser.username}, verified:${verified}`);

            console.log(`✅ Администратор ${user.displayName} ${verified ? 'верифицировал' : 'снял верификацию с'} пользователя ${targetUser.displayName}`);

            return {
                success: true,
                message: `Пользователь ${verified ? 'верифицирован' : 'лишен верификации'}`,
                user: targetUser
            };
        } catch (error) {
            console.error('❌ Ошибка верификации пользователя:', error);
            return { success: false, message: 'Ошибка верификации пользователя' };
        }
    }

    handleAdminMakeDeveloper(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Недостаточно прав' };
        }

        const { userId, isDeveloper } = data;
        if (!userId) {
            return { success: false, message: 'Не указан пользователь' };
        }

        try {
            const targetUser = this.dataManager.users.find(u => u.id === userId);
            if (!targetUser) {
                return { success: false, message: 'Пользователь не найден' };
            }

            targetUser.isDeveloper = !!isDeveloper;
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'ADMIN_MAKE_DEVELOPER', `target:${targetUser.username}, developer:${isDeveloper}`);

            console.log(`👑 Администратор ${user.displayName} ${isDeveloper ? 'назначил' : 'снял'} права разработчика у пользователя ${targetUser.displayName}`);

            return {
                success: true,
                message: `Права разработчика ${isDeveloper ? 'назначены' : 'сняты'}`,
                user: targetUser
            };
        } catch (error) {
            console.error('❌ Ошибка назначения прав разработчика:', error);
            return { success: false, message: 'Ошибка назначения прав разработчика' };
        }
    }

    handleAdminSecurityLogs(token) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Недостаточно прав' };
        }

        try {
            const logs = this.securitySystem.getSecurityLogs();
            return { success: true, logs: logs };
        } catch (error) {
            console.error('❌ Ошибка получения логов безопасности:', error);
            return { success: false, message: 'Ошибка получения логов безопасности' };
        }
    }

    handleExportDatabase(token, res) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'EXPORT_DATABASE', 'SYSTEM', false);
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
                    playlists: this.dataManager.playlists,
                    groups: this.dataManager.groups,
                    bannedIPs: Object.fromEntries(this.dataManager.bannedIPs),
                    devices: Object.fromEntries(this.dataManager.devices)
                }
            };

            const filename = `epic-messenger-backup-${new Date().toISOString().split('T')[0]}.json`;
            
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Access-Control-Expose-Headers': 'Content-Disposition'
            });

            res.end(JSON.stringify(exportData, null, 2));

            this.securitySystem.logSecurityEvent(user, 'EXPORT_DATABASE', `file:${filename}`);

            console.log(`💾 Администратор ${user.username} экспортировал базу данных: ${filename}`);

        } catch (error) {
            console.error('❌ Ошибка экспорта базы данных:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Ошибка экспорта базы данных' }));
        }
    }

    handleImportDatabase(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        return { success: true, message: 'Импорт БД выполнен (обрабатывается в file-handlers)' };
    }

    handleMaintenanceMode(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'MAINTENANCE_MODE', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { enabled } = data;
        this.dataManager.setMaintenanceMode(enabled);
        this.securitySystem.logSecurityEvent(user, 'MAINTENANCE_MODE', `enabled:${enabled}`);
        
        console.log(`🔧 Администратор ${user.username} ${enabled ? 'ВКЛЮЧИЛ' : 'выключил'} режим технических работ`);
        
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

    handleGetMaintenanceStatusPublic(token) {
        const status = {
            maintenance: this.dataManager.isMaintenanceMode(),
            message: this.dataManager.isMaintenanceMode() ? 
                'Ведутся технические работы' : 'Сервер работает нормально'
        };

        return { success: true, ...status };
    }
}

module.exports = AdminHandler;
