const http = require('http');
const WebSocketServer = require('./public/server/websocket-server');
const SecuritySystem = require('./public/server/security-system');
const FileHandlers = require('./public/server/file-handlers');
const ApiHandlers = require('./public/server/api-handlers');
const DataManager = require('./public/server/data-manager');
const { serveStaticFile, getClientIP, getDeviceInfo, generateDeviceId } = require('./public/server/utils');

class SimpleServer {
    constructor() {
        this.dataManager = new DataManager();
        this.securitySystem = new SecuritySystem();
        this.fileHandlers = new FileHandlers(this.dataManager, this.securitySystem);
        this.apiHandlers = new ApiHandlers(this.dataManager, this.securitySystem, this.fileHandlers);
        
        this.setupAutoSave();
    }

    setupAutoSave() {
        setInterval(() => {
            this.dataManager.saveData();
        }, 30000);

        const cleanup = () => {
            console.log('🔄 Сохраняем данные перед выходом...');
            this.dataManager.saveData();
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        process.on('uncaughtException', (error) => {
            console.log('🚨 Необработанная ошибка:', error);
            cleanup();
            process.exit(1);
        });

        console.log('🔄 Автосохранение настроено');
    }

    handleApiRequest(req, res) {
        const parsedUrl = require('url').parse(req.url, true);
        const pathname = parsedUrl.pathname;
        const method = req.method;
        
        console.log(`=== API REQUEST ===`);
        console.log(`Method: ${method}`);
        console.log(`Path: ${pathname}`);
        console.log(`Content-Type: ${req.headers['content-type']}`);
        console.log(`Content-Length: ${req.headers['content-length']}`);
        
        // Rate limiting проверка
        const clientIP = getClientIP(req);
        if (!this.securitySystem.checkRateLimit(clientIP, pathname)) {
            res.writeHead(429, { 
                'Content-Type': 'application/json',
                'Retry-After': '60'
            });
            res.end(JSON.stringify({ 
                success: false, 
                message: 'Слишком много запросов. Попробуйте позже.' 
            }));
            return;
        }

        // Обработка multipart/form-data
        if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
            this.fileHandlers.handleMultipartRequest(req, res, pathname);
            return;
        }

        let body = '';
        const decoder = new (require('string_decoder').StringDecoder)('utf-8');

        req.on('data', (chunk) => {
            body += decoder.write(chunk);
        });

        req.on('end', () => {
            body += decoder.end();
            
            let data = {};
            if (body && body.trim() !== '' && req.headers['content-type'] && !req.headers['content-type'].includes('multipart/form-data')) {
                try {
                    data = JSON.parse(body);
                    console.log(`Parsed data keys:`, Object.keys(data));
                } catch (e) {
                    console.log(`JSON parse error:`, e.message);
                }
            }

            console.log(`=== END REQUEST ===`);
            this.apiHandlers.processApiRequest(pathname, method, data, parsedUrl.query, req, res);
        });
    }

    start(port = 3000) {
        const server = http.createServer((req, res) => {
            const parsedUrl = require('url').parse(req.url, true);
            const pathname = parsedUrl.pathname;

            console.log(`${new Date().toISOString()} - ${req.method} ${pathname}`);

            // Устанавливаем безопасные заголовки
            this.securitySystem.setSecurityHeaders(res);

            if (pathname.startsWith('/api/')) {
                this.handleApiRequest(req, res);
                return;
            }

            // Обработка статических файлов
            this.handleStaticFiles(req, res, pathname);
        });

        // Инициализируем WebSocket сервер
        new WebSocketServer(server, this.dataManager);

        server.listen(port, () => {
            console.log(`🚀 Сервер запущен на порту ${port}`);
            console.log(`📧 Epic Messenger готов к работе!`);
            console.log(`🛡️  СИСТЕМА БЕЗОПАСНОСТИ АКТИВИРОВАНА:`);
            console.log(`   ✅ Rate limiting включен`);
            console.log(`   ✅ Система сессий активирована`);
            console.log(`   ✅ Проверка прав доступа включена`);
            console.log(`   ✅ Валидация входных данных активна`);
            console.log(`   ✅ Безопасные заголовки установлены`);
            console.log(`   ✅ Логирование безопасности включено`);
            console.log(`💾 Система сохранения данных активирована`);
            console.log(`🔒 Данные пользователей защищены шифрованием`);
            console.log(`📁 Поддержка загрузки файлов включена`);
            console.log(`🎵 Музыкальный модуль активирован`);
            console.log(`🛡️  Система банов по IP и устройствам активирована`);
            console.log(`👥 Система групп активирована`);
            console.log(`🔄 СИСТЕМА ЭКСПОРТА/ИМПОРТА БД АКТИВИРОВАНА`);
            console.log(`\n👑 Особый пользователь:`);
            console.log(`   - BayRex - получает права администратора при регистрации`);
            console.log(`\n📄 Доступные страницы:`);
            console.log(`   - Основное приложение: http://localhost:${port}/`);
            console.log(`   - Админ-панель: http://localhost:${port}/admin`);
            console.log(`   - Настройки: http://localhost:${port}/settings`);
            console.log(`   - Подарки: http://localhost:${port}/gifts`);
            console.log(`   - Поиск: http://localhost:${port}/search`);
            console.log(`   - E-COIN: http://localhost:${port}/ecoin`);
            console.log(`   - Посты: http://localhost:${port}/posts`);
            console.log(`   - Мессенджер: http://localhost:${port}/chat`);
            console.log(`   - Профиль: http://localhost:${port}/profile`);
            console.log(`   - Страница входа: http://localhost:${port}/login.html`);
            console.log(`   - Музыкальный плеер: http://localhost:${port}/music`);
            console.log(`   - О проекте: http://localhost:${port}/about`);
            console.log(`\n💾 Файл данных: ${this.dataManager.dataFile}`);
            console.log(`📊 Логи безопасности: /tmp/security.log`);
            console.log(`🎵 Для загрузки музыки используйте endpoint: /api/music/upload-full`);
            console.log(`\n🔧 ИСПРАВЛЕННЫЕ ФУНКЦИИ ЗАГРУЗКИ:`);
            console.log(`   ✅ Аватары: /api/upload-avatar (multipart/form-data)`);
            console.log(`   ✅ Изображения для постов: /api/upload-post-image (multipart/form-data)`);
            console.log(`   ✅ Файлы для чатов: /api/upload-file (multipart/form-data)`);
            console.log(`   ✅ Подарки: /api/upload-gift (multipart/form-data)`);
            console.log(`   ✅ Предпросмотр аватарок: /api/preview-avatar`);
            console.log(`   ✅ Отладка загрузки: /api/debug-upload`);
            console.log(`\n🔄 ФУНКЦИИ ЭКСПОРТА/ИМПОРТА БД:`);
            console.log(`   ✅ Экспорт БД: /api/admin/export-database`);
            console.log(`   ✅ Импорт БД: /api/admin/import-database (multipart/form-data)`);
            console.log(`\n🔧 ИСПРАВЛЕННЫЕ ФУНКЦИИ УДАЛЕНИЯ:`);
            console.log(`   ✅ Удаление постов: DELETE /api/posts?postId=ID`);
            console.log(`   ✅ Удаление подарков: DELETE /api/gifts (с передачей giftId в теле)`);
            console.log(`   ✅ Удаление промокодов: DELETE /api/promo-codes (с передачей promoCodeId в теле)`);
        });

        return server;
    }

    handleStaticFiles(req, res, pathname) {
        const path = require('path');
        const fs = require('fs');

        const routes = {
            '/': 'public/main.html',
            '/index.html': 'public/main.html',
            '/mobile.html': 'public/mobile.html',
            '/mobile': 'public/mobile.html',
            '/login.html': 'public/login.html',
            '/about.html': 'public/about.html',
            '/about': 'public/about.html',
            '/music.html': 'public/music.html',
            '/music': 'public/music.html',
            '/posts.html': 'public/posts.html',
            '/posts': 'public/posts.html',
            '/post': 'public/posts.html',
            '/chat.html': 'public/chat.html',
            '/chat': 'public/chat.html',
            '/profile.html': 'public/profile.html',
            '/profile': 'public/profile.html',
            '/admin.html': 'public/admin.html',
            '/admin': 'public/admin.html',
            '/settings.html': 'public/settings.html',
            '/settings': 'public/settings.html',
            '/gifts.html': 'public/gifts.html',
            '/gifts': 'public/gifts.html',
            '/search.html': 'public/search.html',
            '/search': 'public/search.html',
            '/ecoin.html': 'public/ecoin.html',
            '/ecoin': 'public/ecoin.html'
        };

        if (routes[pathname]) {
            serveStaticFile(res, routes[pathname], 'text/html');
            return;
        }

        if (pathname.endsWith('.css')) {
            serveStaticFile(res, 'public' + pathname, 'text/css');
        } else if (pathname.endsWith('.js')) {
            serveStaticFile(res, 'public' + pathname, 'application/javascript');
        } else if (pathname.startsWith('/assets/') || pathname.startsWith('/uploads/')) {
            const ext = path.extname(pathname);
            const contentType = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.bmp': 'image/bmp',
                '.webp': 'image/webp',
                '.ico': 'image/x-icon',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.ogg': 'audio/ogg',
                '.m4a': 'audio/mp4',
                '.aac': 'audio/aac',
                '.mp4': 'video/mp4',
                '.avi': 'video/x-msvideo',
                '.mov': 'video/quicktime',
                '.wmv': 'video/x-ms-wmv',
                '.flv': 'video/x-flv',
                '.webm': 'video/webm'
            }[ext] || 'application/octet-stream';
            
            serveStaticFile(res, 'public' + pathname, contentType);
        } else {
            // По умолчанию отдаем мобильную версию для мобильных устройств
            const userAgent = req.headers['user-agent'] || '';
            const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(userAgent);
            
            if (isMobile) {
                serveStaticFile(res, 'public/mobile.html', 'text/html');
            } else {
                serveStaticFile(res, 'public/main.html', 'text/html');
            }
        }
    }
}

const server = new SimpleServer();
server.start(process.env.PORT || 3000);
