const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const requestCounts = new Map();

class SecuritySystem {
    constructor() {
        this.sessions = new Map();
        // Очистка старых сессий каждые 5 минут
        setInterval(() => this.cleanupSessions(), 5 * 60 * 1000);
    }

    // Rate limiting
    checkRateLimit(ip, endpoint) {
        const key = `${ip}-${endpoint}`;
        const now = Date.now();
        const windowStart = now - 60000; // 1 minute
        
        if (!requestCounts.has(key)) {
            requestCounts.set(key, []);
        }
        
        const requests = requestCounts.get(key);
        // Удаляем старые запросы
        const recentRequests = requests.filter(time => time > windowStart);
        
        // Лимиты по endpoint
        const limits = {
            '/api/login': 10,       // 10 попыток входа в минуту
            '/api/register': 5,     // 5 регистраций в минуту
            '/api/messages': 100,   // 100 сообщений в минуту
            'default': 200          // 200 запросов в минуту для остального
        };
        
        const limit = limits[endpoint] || limits.default;
        
        if (recentRequests.length >= limit) {
            console.log(`🚨 Rate limit exceeded: ${ip} -> ${endpoint}`);
            return false;
        }
        
        recentRequests.push(now);
        requestCounts.set(key, recentRequests);
        return true;
    }

    // Система сессий
    createSession(userId) {
        const sessionId = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 часа
        
        this.sessions.set(sessionId, {
            userId,
            expires,
            createdAt: new Date(),
            lastActive: new Date()
        });
        
        return sessionId;
    }

    validateSession(token) {
        const session = this.sessions.get(token);
        if (!session || session.expires < Date.now()) {
            this.sessions.delete(token);
            return null;
        }
        
        // Обновляем время активности
        session.lastActive = new Date();
        return session;
    }

    cleanupSessions() {
        const now = Date.now();
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.expires < now) {
                this.sessions.delete(sessionId);
            }
        }
    }

    // Проверка прав администратора
    isAdmin(user) {
        return user && user.isDeveloper && user.isAdmin;
    }

    // Проверка дружеских отношений
    isFriend(userId1, userId2) {
        // Здесь можно добавить логику проверки друзей
        // Пока возвращаем false - только свои данные
        return false;
    }

    // Валидация входных данных
    validateInput(input, type) {
        if (typeof input !== 'string') return false;
        
        const validators = {
            username: /^[a-zA-Z0-9_]{3,20}$/,
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            userId: /^[a-f0-9]{10,}$/,
            displayName: /^[a-zA-Z0-9а-яА-ЯёЁ\s\-_]{2,30}$/i,
            text: /^[\s\S]{1,5000}$/ // Базовая проверка длины
        };
        
        return validators[type] ? validators[type].test(input) : true;
    }

    // Логирование безопасности
    logSecurityEvent(user, action, target, success = true) {
        const timestamp = new Date().toISOString();
        const username = user ? (user.username || 'unknown') : 'unknown';
        const userId = user ? (user.id || 'unknown') : 'unknown';
        
        const logEntry = `🔐 SECURITY: ${timestamp} | User: ${userId} (${username}) | Action: ${action} | Target: ${target} | ${success ? 'SUCCESS' : 'FAILED'}\n`;
        
        console.log(logEntry.trim());
        
        // Сохраняем в файл
        const logFile = path.join('/tmp', 'security.log');
        fs.appendFileSync(logFile, logEntry, 'utf8');
    }

    // Безопасные заголовки
    setSecurityHeaders(res) {
        const securityHeaders = {
            'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'Referrer-Policy': 'strict-origin-when-cross-origin'
        };
        
        Object.entries(securityHeaders).forEach(([key, value]) => {
            res.setHeader(key, value);
        });
    }

    sanitizeContent(content) {
        if (typeof content !== 'string') return '';
        
        let sanitized = content;

        // Удаляем HTML теги и опасные атрибуты
        sanitized = sanitized
            .replace(/<[^>]*>/g, '') // Удаляем все HTML теги
            .replace(/&[^;]+;/g, '') // Удаляем HTML entities
            .replace(/javascript:/gi, '[БЛОК]')
            .replace(/data:/gi, '[БЛОК]')
            .replace(/vbscript:/gi, '[БЛОК]')
            .replace(/on\w+="[^"]*"/gi, '')
            .replace(/on\w+='[^']*'/gi, '')
            .replace(/on\w+=\w+/gi, '');

        // Фильтрация по опасным ключевым словам (регистронезависимая)
        const dangerousKeywords = [
            'script', 'iframe', 'object', 'embed', 'link', 'meta', 'style',
            'expression', 'eval', 'exec', 'compile', 'function constructor',
            'document.write', 'innerhtml', 'outerhtml', 'insertadjacent',
            'setattribute', 'createelement', 'appendchild', 'removechild',
            'window.open', 'location.href', 'document.domain', 'localstorage',
            'sessionstorage', 'cookie', 'xmlhttprequest', 'fetch', 'websocket',
            'postmessage', 'import', 'export', 'require', 'module'
        ];

        dangerousKeywords.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            sanitized = sanitized.replace(regex, '[БЛОК]');
        });

        // Фильтрация опасных паттернов
        const dangerousPatterns = [
            /<script[\s\S]*?<\/script>/gi,
            /<iframe[\s\S]*?<\/iframe>/gi,
            /<object[\s\S]*?<\/object>/gi,
            /<embed[\s\S]*?<\/embed>/gi,
            /<svg[\s\S]*?<\/svg>/gi,
            /<link[\s\S]*?>/gi,
            /<meta[\s\S]*?>/gi,
            /<style[\s\S]*?<\/style>/gi,
            /expression\([^)]*\)/gi,
            /eval\([^)]*\)/gi,
            /Function\([^)]*\)/gi,
            /document\.write\([^)]*\)/gi,
            /\.innerHTML\s*=/gi,
            /\.outerHTML\s*=/gi,
            /\.insertAdjacentHTML\([^)]*\)/gi,
            /\.setAttribute\([^)]*\)/gi,
            /document\.createElement\([^)]*\)/gi,
            /window\.open\([^)]*\)/gi,
            /location\.href\s*=/gi,
            /document\.domain\s*=/gi,
            /XMLHttpRequest/gi,
            /Fetch/gi,
            /WebSocket/gi,
            /postMessage\([^)]*\)/gi
        ];

        dangerousPatterns.forEach(pattern => {
            sanitized = sanitized.replace(pattern, '[БЛОК]');
        });

        // Фильтрация IP-адресов (опционально)
        sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');

        // Фильтрация URL (только явные http/https ссылки)
        sanitized = sanitized.replace(/(https?|ftp):\/\/[^\s<>{}\[\]"']+/gi, '[ССЫЛКА]');

        // Удаляем лишние пробелы и обрезаем длину
        sanitized = sanitized.trim();

        if (sanitized.length > 5000) {
            sanitized = sanitized.substring(0, 5000);
        }

        return sanitized;
    }

    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }
}

module.exports = SecuritySystem;
