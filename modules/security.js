const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class SecurityManager {
    constructor(server) {
        this.server = server;
        this.requestCounts = new Map();
        this.sessions = new Map();
        
        setInterval(() => this.cleanupSessions(), 5 * 60 * 1000);
    }

    // Rate limiting
    checkRateLimit(ip, endpoint) {
        const key = `${ip}-${endpoint}`;
        const now = Date.now();
        const windowStart = now - 60000;
        
        if (!this.requestCounts.has(key)) {
            this.requestCounts.set(key, []);
        }
        
        const requests = this.requestCounts.get(key);
        const recentRequests = requests.filter(time => time > windowStart);
        
        const limits = {
            '/api/login': 10,
            '/api/register': 5,
            '/api/messages': 100,
            'default': 200
        };
        
        const limit = limits[endpoint] || limits.default;
        
        if (recentRequests.length >= limit) {
            console.log(`🚨 Rate limit exceeded: ${ip} -> ${endpoint}`);
            return false;
        }
        
        recentRequests.push(now);
        this.requestCounts.set(key, recentRequests);
        return true;
    }

    // Система сессий
    createSession(userId) {
        const sessionId = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 24 * 60 * 60 * 1000;
        
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

    // Логирование безопасности
    logSecurityEvent(user, action, target, success = true) {
        const timestamp = new Date().toISOString();
        const username = user ? user.username : 'unknown';
        const userId = user ? user.id : 'unknown';
        const logEntry = `🔐 SECURITY: ${timestamp} | User: ${userId} (${username}) | Action: ${action} | Target: ${target} | ${success ? 'SUCCESS' : 'FAILED'}\n`;
        
        console.log(logEntry.trim());
        
        const logFile = path.join('/tmp', 'security.log');
        fs.appendFileSync(logFile, logEntry, 'utf8');
    }

    // Валидация входных данных
    validateInput(input, type) {
        if (typeof input !== 'string') return false;
        
        const validators = {
            username: /^[a-zA-Z0-9_]{3,20}$/,
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            userId: /^[a-f0-9]{10,}$/,
            displayName: /^[a-zA-Z0-9а-яА-ЯёЁ\s\-_]{2,30}$/i,
            text: /^[\s\S]{1,5000}$/
        };
        
        return validators[type] ? validators[type].test(input) : true;
    }

    // Санитизация контента
    sanitizeContent(content) {
        if (typeof content !== 'string') return '';
        
        let sanitized = content;

        sanitized = sanitized
            .replace(/<[^>]*>/g, '')
            .replace(/&[^;]+;/g, '')
            .replace(/javascript:/gi, '[БЛОК]')
            .replace(/data:/gi, '[БЛОК]')
            .replace(/vbscript:/gi, '[БЛОК]')
            .replace(/on\w+="[^"]*"/gi, '')
            .replace(/on\w+='[^']*'/gi, '')
            .replace(/on\w+=\w+/gi, '');

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

        sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');
        sanitized = sanitized.replace(/(https?|ftp):\/\/[^\s<>{}\[\]"']+/gi, '[ССЫЛКА]');

        sanitized = sanitized.trim();

        if (sanitized.length > 5000) {
            sanitized = sanitized.substring(0, 5000);
        }

        return sanitized;
    }

    // Шифрование
    encrypt(text, encryptionKey) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    decrypt(encryptedText, encryptionKey) {
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', encryptionKey, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    // Получение IP клиента
    getClientIP(req) {
        return req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               (req.connection.socket ? req.connection.socket.remoteAddress : null);
    }

    // Информация об устройстве
    getDeviceInfo(req) {
        const userAgent = req.headers['user-agent'] || '';
        let browser = 'Unknown';
        let os = 'Unknown';
        
        if (userAgent.includes('Chrome')) browser = 'Chrome';
        else if (userAgent.includes('Firefox')) browser = 'Firefox';
        else if (userAgent.includes('Safari')) browser = 'Safari';
        else if (userAgent.includes('Edge')) browser = 'Edge';
        
        if (userAgent.includes('Windows')) os = 'Windows';
        else if (userAgent.includes('Mac')) os = 'Mac OS';
        else if (userAgent.includes('Linux')) os = 'Linux';
        else if (userAgent.includes('Android')) os = 'Android';
        else if (userAgent.includes('iOS')) os = 'iOS';
        
        return { browser, os, userAgent };
    }

    generateDeviceId(req) {
        const ip = this.getClientIP(req);
        const deviceInfo = this.getDeviceInfo(req);
        const deviceString = `${ip}-${deviceInfo.browser}-${deviceInfo.os}`;
        return crypto.createHash('md5').update(deviceString).digest('hex');
    }
}

module.exports = SecurityManager;
