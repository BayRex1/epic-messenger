const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocketServer = require('./public/server/websocket-server');
const SecuritySystem = require('./public/server/security-system');
const FileHandlers = require('./public/server/file-handlers');
const ApiHandlers = require('./public/server/api-handlers');
const DataManager = require('./public/server/data-manager');
const { serveStaticFile, getClientIP, getDeviceInfo, generateDeviceId, ensureUploadDirs } = require('./public/server/utils');

class SimpleServer {
    constructor() {
        console.log('🚀 Initializing server...');
        ensureUploadDirs();
        
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
        
        // Обработка загруженных файлов из /tmp
        if (pathname.startsWith('/api/uploads/')) {
            this.handleUploadedFile(req, res, pathname);
            return;
        }
        
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

        // Проверка авторизации (кроме login и register)
        const token = req.headers['authorization']?.replace('Bearer ', '');
        const isAuthRoute = pathname === '/api/login' || pathname === '/api/register';
        
        if (!isAuthRoute) {
            const user = this.apiHandlers.authenticateToken(token);
            if (!user) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Не авторизован' }));
                return;
            }
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

    // Обработка загруженных файлов из /tmp
    handleUploadedFile(req, res, pathname) {
        const isProduction = process.env.NODE_ENV === 'production';
        const baseDir = isProduction ? '/tmp/uploads' : path.join(process.cwd(), 'public', 'uploads');
        const filePath = pathname.replace('/api/uploads/', '');
        const fullPath = path.join(baseDir, filePath);
        
        console.log(`📁 Serving uploaded file from: ${fullPath}`);
        
        if (!fs.existsSync(fullPath)) {
            console.log('❌ File not found:', fullPath);
            res.writeHead(404);
            res.end('File not found');
            return;
        }
        
        const ext = path.extname(fullPath).toLowerCase();
        const contentType = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.bmp': 'image/bmp',
            '.webp': 'image/webp',
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
            '.webm': 'video/webm',
            '.pdf': 'application/pdf',
            '.txt': 'text/plain'
        }[ext] || 'application/octet-stream';
        
        try {
            const data = fs.readFileSync(fullPath);
            console.log(`✅ Serving uploaded file: ${pathname}, type: ${contentType}, size: ${data.length} bytes`);
            
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(data);
        } catch (error) {
            console.error('❌ Error serving uploaded file:', error);
            res.writeHead(500);
            res.end('Internal server error');
        }
    }

    // Обработка мобильных маршрутов
    handleMobileRoutes(req, res, pathname) {
        const mobileRoutes = {
            '/mobile': 'public/mobile/index.html',
            '/mobile/chats': 'public/mobile/chats.html',
            '/mobile/posts': 'public/mobile/posts.html', 
            '/mobile/search': 'public/mobile/search.html',
            '/mobile/ecoin': 'public/mobile/ecoin.html',
            '/mobile/music': 'public/mobile/music.html',
            '/mobile/settings': 'public/mobile/settings.html',
            '/mobile/profile': 'public/mobile/profile.html',
            '/mobile/gifts': 'public/mobile/gifts.html'
        };

        if (mobileRoutes[pathname]) {
            serveStaticFile(res, mobileRoutes[pathname], 'text/html');
            return true;
        }

        // Обработка динамических профилей пользователей
        if (pathname.startsWith('/mobile/profile/')) {
            const username = pathname.split('/').pop();
            if (username && username !== 'profile') {
                this.handleMobileUserProfile(req, res, username);
                return true;
            }
        }

        // Обработка статических файлов мобильной версии
        if (pathname.startsWith('/mobile/styles/') || pathname.startsWith('/mobile/scripts/')) {
            const filePath = path.join(process.cwd(), pathname);
            const ext = path.extname(pathname);
            const contentType = {
                '.css': 'text/css',
                '.js': 'application/javascript'
            }[ext] || 'text/plain';
            
            serveStaticFile(res, filePath, contentType);
            return true;
        }

        return false;
    }

    // Метод для обработки мобильных профилей пользователей
    handleMobileUserProfile(req, res, username) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        
        let currentUser = null;
        if (token) {
            currentUser = this.apiHandlers.authenticateToken(token);
        }

        const targetUser = this.dataManager.users.find(u => u.username === username);
        
        if (!targetUser) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: false, 
                message: 'Пользователь не найден' 
            }));
            return;
        }

        const profileTemplatePath = path.join(process.cwd(), 'public/mobile/profile.html');
        
        fs.readFile(profileTemplatePath, 'utf8', (err, template) => {
            if (err) {
                console.log('❌ Ошибка чтения шаблона профиля:', err);
                res.writeHead(500);
                res.end('Internal Server Error');
                return;
            }

            const isOwnProfile = currentUser && currentUser.id === targetUser.id;
            
            const profileHtml = template
                .replace(/\{\{displayName\}\}/g, targetUser.displayName || 'Пользователь')
                .replace(/\{\{username\}\}/g, targetUser.username)
                .replace(/\{\{description\}\}/g, targetUser.description || '')
                .replace(/\{\{avatar\}\}/g, targetUser.avatar || '')
                .replace(/\{\{isOwnProfile\}\}/g, isOwnProfile.toString())
                .replace(/\{\{userId\}\}/g, targetUser.id)
                .replace(/\{\{coins\}\}/g, targetUser.coins || 0)
                .replace(/\{\{isDeveloper\}\}/g, (targetUser.isDeveloper || false).toString())
                .replace(/\{\{isVerified\}\}/g, (targetUser.verified || false).toString());

            res.writeHead(200, { 
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-cache'
            });
            res.end(profileHtml);
        });
    }

    start(port = process.env.PORT || 3000) {
        const server = http.createServer((req, res) => {
            const parsedUrl = require('url').parse(req.url, true);
            const pathname = parsedUrl.pathname;

            console.log(`${new Date().toISOString()} - ${req.method} ${pathname}`);

            // Устанавливаем безопасные заголовки
            this.securitySystem.setSecurityHeaders(res);

            // Сначала проверяем мобильные маршруты
            if (this.handleMobileRoutes(req, res, pathname)) {
                return;
            }

            if (pathname.startsWith('/api/')) {
                this.handleApiRequest(req, res);
                return;
            }

            // Обработка статических файлов
            this.handleStaticFiles(req, res, pathname);
        });

        // Инициализируем WebSocket сервер
        new WebSocketServer(server, this.dataManager);

        server.listen(port, '0.0.0.0', () => {
            console.log(`🚀 Сервер запущен на порту ${port}`);
            console.log(`📧 Epic Messenger готов к работе!`);
            console.log(`🌍 Окружение: ${process.env.NODE_ENV || 'development'}`);
            console.log(`📁 Upload base: ${process.env.NODE_ENV === 'production' ? '/tmp/uploads' : 'public/uploads'}`);
            console.log(`\n📱 МОБИЛЬНАЯ ВЕРСИЯ АКТИВИРОВАНА:`);
            console.log(`   ✅ /mobile - Главная навигация`);
            console.log(`   ✅ /mobile/chats - Чаты`);
            console.log(`   ✅ /mobile/posts - Посты`);
            console.log(`   ✅ /mobile/search - Поиск`);
            console.log(`   ✅ /mobile/ecoin - E-COIN`);
            console.log(`   ✅ /mobile/music - Музыка`);
            console.log(`   ✅ /mobile/settings - Настройки`);
            console.log(`   ✅ /mobile/profile - Профиль`);
            console.log(`   ✅ /mobile/gifts - Подарки`);
            console.log(`   ✅ /mobile/profile/{username} - Профили пользователей`);
            console.log(`\n🛡️  СИСТЕМА БЕЗОПАСНОСТИ АКТИВИРОВАНА:`);
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
            console.log(`   - Мобильная версия: http://localhost:${port}/mobile`);
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
            console.log(`   - Технические работы: http://localhost:${port}/TehnicalWork`);
            console.log(`   - Страница 404: http://localhost:${port}/404`);
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
            console.log(`\n📁 Созданные директории для загрузок:`);
            console.log(`   ✅ ${process.env.NODE_ENV === 'production' ? '/tmp/uploads/avatars' : 'public/uploads/avatars'}`);
            console.log(`   ✅ ${process.env.NODE_ENV === 'production' ? '/tmp/uploads/posts' : 'public/uploads/posts'}`);
            console.log(`   ✅ ${process.env.NODE_ENV === 'production' ? '/tmp/uploads/music' : 'public/uploads/music'}`);
            console.log(`   ✅ ${process.env.NODE_ENV === 'production' ? '/tmp/uploads/gifts' : 'public/uploads/gifts'}`);
            console.log(`   ✅ ${process.env.NODE_ENV === 'production' ? '/tmp/uploads/images' : 'public/uploads/images'}`);
            console.log(`   ✅ ${process.env.NODE_ENV === 'production' ? '/tmp/uploads/videos' : 'public/uploads/videos'}`);
            console.log(`   ✅ ${process.env.NODE_ENV === 'production' ? '/tmp/uploads/audio' : 'public/uploads/audio'}`);
            console.log(`   ✅ ${process.env.NODE_ENV === 'production' ? '/tmp/uploads/files' : 'public/uploads/files'}`);
            console.log(`\n🔥 НОВЫЙ ФУНКЦИОНАЛ ДЛЯ RENDER:`);
            console.log(`   ✅ Обработка файлов из /tmp/uploads через /api/uploads/`);
            console.log(`   ✅ Автоматическое определение окружения (production/development)`);
            console.log(`   ✅ Корректные URL для загруженных файлов`);
            console.log(`\n💬 НОВЫЙ ФУНКЦИОНАЛ КОММЕНТАРИЕВ:`);
            console.log(`   ✅ Комментарии к постам`);
            console.log(`   ✅ Ответы на комментарии`);
            console.log(`   ✅ Лайки комментариев`);
            console.log(`   ✅ Шеринг постов`);
            console.log(`   ✅ Отдельные страницы постов: http://localhost:${port}/post/{id}`);
            console.log(`\n👥 НОВЫЙ ФУНКЦИОНАЛ ЧАТОВ И ГРУПП:`);
            console.log(`   ✅ Создание новых чатов`);
            console.log(`   ✅ Создание групп`);
            console.log(`   ✅ Поиск пользователей для чатов`);
            console.log(`   ✅ Групповые сообщения`);
            console.log(`   ✅ Управление участниками групп`);
            console.log(`   ✅ Приватные группы по ссылку`);
            console.log(`\n🔧 ИСПРАВЛЕНИЯ ПРОБЛЕМ:`);
            console.log(`   ✅ Исправлена бесконечная загрузка постов`);
            console.log(`   ✅ Улучшена обработка ошибок`);
            console.log(`   ✅ Добавлена проверка авторизации`);
            console.log(`   ✅ Улучшено логирование`);
        });

        server.on('error', (error) => {
            console.error('❌ Server error:', error);
        });

        return server;
    }

    handleStaticFiles(req, res, pathname) {
        // Обработка страницы 404
        if (pathname === '/404') {
            serveStaticFile(res, 'public/additions/404.html', 'text/html');
            return;
        }

        // Список разрешенных страниц мессенджера
        const allowedPages = [
            '/', '/index.html',
            '/mobile', '/mobile.html',
            '/login', '/login.html',
            '/about', '/about.html',
            '/music', '/music.html',
            '/posts', '/posts.html',
            '/chat', '/chat.html',
            '/profile', '/profile.html',
            '/admin', '/admin.html',
            '/settings', '/settings.html',
            '/gifts', '/gifts.html',
            '/search', '/search.html',
            '/ecoin', '/ecoin.html',
            '/TehnicalWork', '/technical-work', '/TechnicalWork.html'
        ];

        // Проверяем, является ли запрос к разрешенной странице
        const isAllowedPage = allowedPages.some(page => pathname === page) ||
                             pathname.startsWith('/mobile/') ||
                             pathname.startsWith('/post/');

        // Если это не разрешенная страница - показываем 404
        if (!isAllowedPage && !pathname.startsWith('/uploads/') && 
            !pathname.endsWith('.css') && !pathname.endsWith('.js') && 
            !pathname.startsWith('/assets/')) {
            console.log(`❌ Page not found: ${pathname}`);
            serveStaticFile(res, 'public/additions/404.html', 'text/html');
            return;
        }

        // Проверка технических работ
        if (this.dataManager.isMaintenanceMode && this.dataManager.isMaintenanceMode() && 
            !pathname.startsWith('/admin') && 
            !pathname.startsWith('/api/admin') &&
            pathname !== '/TehnicalWork' &&
            pathname !== '/TechnicalWork.html' &&
            pathname !== '/technical-work' &&
            !pathname.startsWith('/mobile') &&
            !pathname.startsWith('/login') &&
            pathname !== '/404') {
            
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
            
            let isDeveloper = false;
            if (token) {
                const user = this.apiHandlers.authenticateToken(token);
                if (user && user.isDeveloper) {
                    isDeveloper = true;
                }
            }
            
            if (!isDeveloper) {
                serveStaticFile(res, 'public/additions/TechnicalWork.html', 'text/html');
                return;
            }
        }

        // Автоматическое перенаправление на мобильную версию для телефонов
        const userAgent = req.headers['user-agent'] || '';
        const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(userAgent);
        
        // Если это мобильное устройство и запрашивается корневая страница - перенаправляем на мобильную версию
        if (isMobile && (pathname === '/' || pathname === '/index.html')) {
            res.writeHead(302, {
                'Location': '/mobile'
            });
            res.end();
            return;
        }

        // ✅ ГЛАВНАЯ СТРАНИЦА - ПОСТЫ
        const routes = {
            '/': 'public/posts.html',
            '/index.html': 'public/posts.html',
            '/mobile.html': 'public/mobile.html',
            '/mobile': 'public/mobile/index.html',
            '/login.html': 'public/login.html',
            '/login': 'public/login.html',
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
            '/ecoin': 'public/ecoin.html',
            '/TehnicalWork': 'public/additions/TechnicalWork.html',
            '/technical-work': 'public/additions/TechnicalWork.html',
            '/TechnicalWork.html': 'public/additions/TechnicalWork.html',
            '/404': 'public/additions/404.html'
        };

        // 🔥 ИСПРАВЛЕНО: Обработка отдельных постов /post/:id (только если нет расширения файла)
        if (pathname.startsWith('/post/') && !pathname.includes('.')) {
            console.log(`📄 Serving post page for: ${pathname}`);
            serveStaticFile(res, 'public/post.html', 'text/html');
            return;
        }

        if (routes[pathname]) {
            serveStaticFile(res, routes[pathname], 'text/html');
            return;
        }

        // 🔥 ОБРАБОТКА ЗАГРУЖЕННЫХ ФАЙЛОВ /uploads/
        if (pathname.startsWith('/uploads/')) {
            const isProduction = process.env.NODE_ENV === 'production';
            const baseDir = isProduction ? '/tmp/uploads' : path.join(process.cwd(), 'public', 'uploads');
            const filePath = path.join(baseDir, pathname.replace('/uploads/', ''));
            
            console.log(`📁 Serving file: ${pathname} -> ${filePath}`);
            
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    console.log('❌ File not found:', filePath, err.message);
                    serveStaticFile(res, 'public/additions/404.html', 'text/html');
                    return;
                }
                
                const ext = path.extname(pathname).toLowerCase();
                const contentType = {
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.svg': 'image/svg+xml',
                    '.bmp': 'image/bmp',
                    '.webp': 'image/webp',
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
                    '.webm': 'video/webm',
                    '.pdf': 'application/pdf',
                    '.txt': 'text/plain'
                }[ext] || 'application/octet-stream';
                
                console.log(`✅ Serving file: ${pathname}, type: ${contentType}, size: ${data.length} bytes`);
                
                res.writeHead(200, { 
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=3600'
                });
                res.end(data);
            });
            return;
        }

        if (pathname.endsWith('.css')) {
            serveStaticFile(res, 'public' + pathname, 'text/css');
        } else if (pathname.endsWith('.js')) {
            serveStaticFile(res, 'public' + pathname, 'application/javascript');
        } else if (pathname.startsWith('/assets/')) {
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
            if (isMobile) {
                serveStaticFile(res, 'public/mobile/index.html', 'text/html');
            } else {
                serveStaticFile(res, 'public/additions/404.html', 'text/html');
            }
        }
    }
}

// Запуск сервера
const server = new SimpleServer();
server.start();
