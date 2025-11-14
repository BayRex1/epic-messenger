const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ensureUploadDirs } = require('./utils');

class DataManager {
    constructor() {
        // Используем текущую директорию вместо /tmp для Render
        this.dataFile = path.join(process.cwd(), 'epic-messenger-data.json');
        console.log(`💾 Data file: ${this.dataFile}`);
        this.encryptionKey = crypto.randomBytes(32);
        
        this.bannedIPs = new Map();
        this.devices = new Map();
        
        this.ensureUploadDirs();
        this.loadData();
    }

    ensureUploadDirs() {
        ensureUploadDirs();
    }

    loadData() {
        try {
            if (fs.existsSync(this.dataFile)) {
                console.log(`📂 Loading data from: ${this.dataFile}`);
                const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
                this.users = data.users || [];
                this.messages = data.messages || [];
                this.posts = data.posts || [];
                this.gifts = data.gifts || [];
                this.promoCodes = data.promoCodes || [];
                this.music = data.music || [];
                this.playlists = data.playlists || [];
                this.groups = data.groups || [];
                this.bannedIPs = new Map(Object.entries(data.bannedIPs || {}));
                this.devices = new Map(Object.entries(data.devices || {}));
                this.maintenanceMode = data.maintenanceMode || false;
                
                // Восстанавливаем даты
                this.restoreDates();
                
                console.log('✅ Данные загружены из файла');
                console.log(`📊 Статистика: ${this.users.length} пользователей, ${this.messages.length} сообщений, ${this.posts.length} постов, ${this.groups.length} групп`);
                console.log(`🔧 Режим технических работ: ${this.maintenanceMode ? 'ВКЛЮЧЕН' : 'выключен'}`);
            } else {
                console.log('📁 Файл данных не найден, инициализируем пустые данные');
                this.initializeData();
            }
        } catch (error) {
            console.log('❌ Ошибка загрузки данных:', error);
            console.log('🔄 Инициализируем пустые данные');
            this.initializeData();
        }
    }

    restoreDates() {
        this.messages.forEach(msg => msg.timestamp = new Date(msg.timestamp));
        this.posts.forEach(post => post.createdAt = new Date(post.createdAt));
        this.users.forEach(user => {
            user.lastSeen = new Date(user.lastSeen);
            user.createdAt = new Date(user.createdAt);
        });
        this.music.forEach(track => track.createdAt = new Date(track.createdAt));
        this.playlists.forEach(playlist => playlist.createdAt = new Date(playlist.createdAt));
        this.groups.forEach(group => group.createdAt = new Date(group.createdAt));
    }

    saveData() {
        try {
            const data = {
                users: this.users,
                messages: this.messages,
                posts: this.posts,
                gifts: this.gifts,
                promoCodes: this.promoCodes,
                music: this.music,
                playlists: this.playlists,
                groups: this.groups,
                bannedIPs: Object.fromEntries(this.bannedIPs),
                devices: Object.fromEntries(this.devices),
                maintenanceMode: this.maintenanceMode,
                lastSave: new Date().toISOString()
            };
            
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
            console.log('💾 Данные сохранены');
        } catch (error) {
            console.log('❌ Ошибка сохранения данных:', error);
        }
    }

    initializeData() {
        this.users = [];

        this.gifts = [
            {
                id: '1',
                name: 'Золотая корона',
                type: 'crown',
                preview: '👑',
                price: 500,
                image: null
            },
            {
                id: '2',
                name: 'Сердечко',
                type: 'heart',
                preview: '❤️',
                price: 100,
                image: null
            },
            {
                id: '3',
                name: 'Звезда',
                type: 'star',
                preview: '⭐',
                price: 200,
                image: null
            }
        ];

        this.promoCodes = [
            {
                id: '1',
                code: 'WELCOME1000',
                coins: 1000,
                max_uses: 0,
                used_count: 0,
                created_at: new Date()
            }
        ];

        this.posts = [
            {
                id: '1',
                userId: 'system',
                text: 'Добро пожаловать в Epic Messenger! 🚀',
                image: null,
                file: null,
                fileName: null,
                fileType: null,
                likes: [],
                comments: [],
                views: 0,
                createdAt: new Date()
            }
        ];

        this.music = [];
        this.playlists = [];
        this.groups = [];

        this.messages = [];
        this.bannedIPs = new Map();
        this.devices = new Map();
        this.maintenanceMode = false;
    }

    generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    decrypt(encryptedText) {
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    isIPBanned(ip) {
        const banInfo = this.bannedIPs.get(ip);
        if (!banInfo) return false;
        
        if (banInfo.expires && banInfo.expires < Date.now()) {
            this.bannedIPs.delete(ip);
            return false;
        }
        
        return true;
    }

    banIP(ip, duration = 30 * 24 * 60 * 60 * 1000) {
        this.bannedIPs.set(ip, {
            bannedAt: new Date(),
            expires: Date.now() + duration
        });
        this.saveData();
    }

    registerDevice(userId, req) {
        const { generateDeviceId, getDeviceInfo, getClientIP } = require('./utils');
        const deviceId = generateDeviceId(req);
        const deviceInfo = getDeviceInfo(req);
        const ip = getClientIP(req);
        
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
        
        const userDevices = Array.from(this.devices.values()).filter(d => d.userId === userId);
        if (userDevices.length === 0) {
            device.isOwner = true;
        }
        
        this.devices.set(deviceId, device);
        this.saveData();
        return device;
    }

    getUserDevices(userId) {
        return Array.from(this.devices.values()).filter(device => device.userId === userId);
    }

    terminateDevice(userId, deviceId) {
        const device = this.devices.get(deviceId);
        if (!device || device.userId !== userId) {
            return false;
        }
        
        const userDevices = this.getUserDevices(userId);
        const isOwner = userDevices.some(d => d.isOwner);
        const targetDevice = userDevices.find(d => d.id === deviceId);
        
        if (!targetDevice) return false;
        
        if (targetDevice.isOwner || isOwner) {
            this.devices.delete(deviceId);
            this.saveData();
            return true;
        } else {
            const timeDiff = Date.now() - new Date(targetDevice.createdAt).getTime();
            if (timeDiff > 24 * 60 * 60 * 1000) {
                this.devices.delete(deviceId);
                this.saveData();
                return true;
            }
            return false;
        }
    }

    // 🔧 Новые методы для управления техническими работами
    setMaintenanceMode(enabled) {
        this.maintenanceMode = enabled;
        this.saveData();
        console.log(`🔧 Режим технических работ ${enabled ? 'ВКЛЮЧЕН' : 'выключен'}`);
    }

    isMaintenanceMode() {
        return this.maintenanceMode;
    }

    // Проверка доступа пользователя во время техработ
    canAccessDuringMaintenance(user) {
        return user && user.isDeveloper;
    }
}

module.exports = DataManager;
