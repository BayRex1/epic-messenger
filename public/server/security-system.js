const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const requestCounts = new Map();

class SecuritySystem {
    constructor() {
        this.sessions = new Map();
        setInterval(() => this.cleanupSessions(), 5 * 60 * 1000);
    }

    checkRateLimit(ip, endpoint) {
        const key = `${ip}-${endpoint}`;
        const now = Date.now();
        const windowStart = now - 60000;
        
        if (!requestCounts.has(key)) {
            requestCounts.set(key, []);
        }
        
        const requests = requestCounts.get(key);
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
        requestCounts.set(key, recentRequests);
        return true;
    }

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

    isAdmin(user) {
        return user && user.isDeveloper && user.isAdmin;
    }

    isFriend(userId1, userId2) {
        return false;
    }

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

    logSecurityEvent(user, action, target, success = true) {
        const timestamp = new Date().toISOString();
        const username = user ? (user.username || 'unknown') : 'unknown';
        const userId = user ? (user.id || 'unknown') : 'unknown';
        
        const logEntry = `🔐 SECURITY: ${timestamp} | User: ${userId} (${username}) | Action: ${action} | Target: ${target} | ${success ? 'SUCCESS' : 'FAILED'}\n`;
        
        console.log(logEntry.trim());
        
        const logFile = path.join('/tmp', 'security.log');
        fs.appendFileSync(logFile, logEntry, 'utf8');
    }

    // 🔥 ИСПРАВЛЕНО: добавлен data: и blob: для загрузки изображений
    setSecurityHeaders(res) {
        const securityHeaders = {
            'Content-Security-Policy': "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:;",
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

    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    // 🔥 ДОБАВЛЕНО: метод для получения логов безопасности
    getSecurityLogs() {
        try {
            const logFile = path.join('/tmp', 'security.log');
            if (fs.existsSync(logFile)) {
                const logs = fs.readFileSync(logFile, 'utf8');
                return logs.split('\n').filter(line => line.trim());
            }
            return [];
        } catch (error) {
            console.error('❌ Ошибка чтения логов безопасности:', error);
            return [];
        }
    }
}

module.exports = SecuritySystem;
