// public/server/file-handlers.js
const busboy = require('busboy');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class FileHandlers {
    constructor(dataManager, securitySystem) {
        this.dataManager = dataManager;
        this.securitySystem = securitySystem;
    }

    // Базовая директория для загрузок:
    // - на Render используем /tmp/uploads (writable)
    // - локально используем public/uploads
    getUploadBase() {
        return process.env.RENDER ? '/tmp/uploads' : path.join(process.cwd(), 'public', 'uploads');
    }

    validateFileType(filename, fileType) {
        const validators = {
            avatar: this.validateAvatarFile.bind(this),
            gift: this.validateGiftFile.bind(this),
            post: this.validatePostFile.bind(this),
            music: this.validateMusicFile.bind(this),
            image: this.validateImageFile.bind(this),
            video: this.validateVideoFile.bind(this),
            audio: this.validateAudioFile.bind(this)
        };

        return validators[fileType] ? validators[fileType](filename) : false;
    }

    validateAvatarFile(filename) {
        if (!filename) return false;
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    validateGiftFile(filename) {
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    validatePostFile(filename) {
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.mp4', '.avi', '.mov', '.mp3', '.wav'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    validateMusicFile(filename) {
        const allowedExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    validateCoverFile(filename) {
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    validateImageFile(filename) {
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    validateVideoFile(filename) {
        const allowedExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    validateAudioFile(filename) {
        const allowedExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
        const ext = path.extname(filename).toLowerCase();
        return allowedExtensions.includes(ext);
    }

    // Универсальная функция сохранения: folder относительно upload base
    async saveBufferToFolder(buffer, folder, filename) {
        const base = this.getUploadBase();
        const dir = path.join(base, folder);
        const filePath = path.join(dir, filename);

        // Создаем директорию, если нужно
        if (!fsSync.existsSync(dir)) {
            fsSync.mkdirSync(dir, { recursive: true });
        }

        await fs.writeFile(filePath, buffer);
        // возвращаем URL, подаваемый фронтенду — /uploads/...
        return `/uploads/${folder}/${filename}`;
    }

    // Удаление файла (для старых аватаров и т.п.)
    deleteFile(fileUrl) {
        if (!fileUrl || !fileUrl.startsWith('/uploads/')) return;
        const base = this.getUploadBase();
        const rel = fileUrl.replace('/uploads/', '');
        const filePath = path.join(base, rel);

        try {
            if (fsSync.existsSync(filePath)) {
                fsSync.unlinkSync(filePath);
            }
        } catch (e) {
            console.error('❌ Ошибка при удалении файла', filePath, e.message);
        }
    }

    handleMultipartRequest(req, res, pathname) {
        const handlers = {
            '/api/music/upload-full': this.handleUploadMusicFull.bind(this),
            '/api/upload-avatar': this.handleUploadAvatarMultipart.bind(this),
            '/api/upload-post-image': this.handleUploadPostImageMultipart.bind(this),
            '/api/upload-file': this.handleUploadFileMultipart.bind(this),
            '/api/upload-gift': this.handleUploadGiftMultipart.bind(this),
            '/api/admin/import-database': this.handleImportDatabaseMultipart.bind(this)
        };

        const handler = handlers[pathname];
        if (handler) {
            handler(req, res);
        } else {
            res.writeHead(404, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ success: false, message: 'Handler not found' }));
        }
    }

    // ---------------- AVATAR ----------------
    async handleUploadAvatarMultipart(req, res) {
        console.log('🖼️ Начало обработки загрузки аватара...');
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            });
            res.end();
            return;
        }

        // Аутентификация: используем securitySystem.validateSession, как в проекте
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.dataManager.users.find(u => {
            try {
                const session = this.securitySystem.validateSession ? this.securitySystem.validateSession(token) : null;
                return session && u.id === session.userId;
            } catch (e) {
                return false;
            }
        });

        if (!user) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Не авторизован' }));
            return;
        }

        let isResponseSent = false;
        const sendErrorResponse = (message, status = 500) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message }));
            }
        };
        const sendSuccessResponse = (data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
            let avatarFile = null;

            bb.on('file', (name, file, info) => {
                const { filename, mimeType } = info;
                if (name === 'avatar' && filename) {
                    const chunks = [];
                    file.on('data', (chunk) => chunks.push(chunk));
                    file.on('end', () => {
                        avatarFile = {
                            buffer: Buffer.concat(chunks),
                            filename,
                            mimeType
                        };
                    });
                } else {
                    file.resume();
                }
            });

            bb.on('close', async () => {
                try {
                    if (!avatarFile) {
                        sendErrorResponse('Файл аватара не получен', 400);
                        return;
                    }
                    if (!this.validateAvatarFile(avatarFile.filename)) {
                        sendErrorResponse('Недопустимый формат файла для аватара', 400);
                        return;
                    }

                    const fileExt = path.extname(avatarFile.filename);
                    const uniqueFilename = `avatar_${user.id}_${Date.now()}${fileExt}`;
                    const url = await this.saveBufferToFolder(avatarFile.buffer, 'avatars', uniqueFilename);

                    // Удаляем старый, если есть
                    if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
                        this.deleteFile(user.avatar);
                    }

                    user.avatar = url;
                    this.dataManager.saveData && this.dataManager.saveData();

                    this.securitySystem.logSecurityEvent && this.securitySystem.logSecurityEvent(user, 'UPLOAD_AVATAR', `file:${avatarFile.filename}`);

                    sendSuccessResponse({
                        success: true,
                        avatarUrl: url,
                        user: {
                            id: user.id,
                            username: user.username,
                            displayName: user.displayName,
                            avatar: url
                        }
                    });
                } catch (err) {
                    console.error('❌ Ошибка при сохранении аватара:', err);
                    sendErrorResponse('Ошибка при сохранении файла: ' + (err.message || err));
                }
            });

            bb.on('error', (err) => {
                console.error('❌ Busboy error (avatar):', err);
                sendErrorResponse('Ошибка обработки формы: ' + err.message);
            });

            req.pipe(bb);
        } catch (err) {
            console.error('❌ Critical avatar handler error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Критическая ошибка сервера' }));
        }
    }

    // ---------------- POST IMAGE ----------------
    async handleUploadPostImageMultipart(req, res) {
        console.log('📸 Начало обработки загрузки изображения для поста...');
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            });
            res.end();
            return;
        }

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.dataManager.users.find(u => {
            try {
                const session = this.securitySystem.validateSession ? this.securitySystem.validateSession(token) : null;
                return session && u.id === session.userId;
            } catch (e) {
                return false;
            }
        });

        if (!user) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Не авторизован' }));
            return;
        }

        let isResponseSent = false;
        const sendErrorResponse = (message, status = 500) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message }));
            }
        };
        const sendSuccessResponse = (data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ headers: req.headers, limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
            let imageFile = null;

            bb.on('file', (name, file, info) => {
                const { filename, mimeType } = info;
                if (name === 'image' && filename) {
                    const chunks = [];
                    file.on('data', (chunk) => chunks.push(chunk));
                    file.on('end', () => {
                        imageFile = {
                            buffer: Buffer.concat(chunks),
                            filename,
                            mimeType
                        };
                    });
                } else {
                    file.resume();
                }
            });

            bb.on('close', async () => {
                try {
                    if (!imageFile) {
                        sendErrorResponse('Файл изображения не получен', 400);
                        return;
                    }
                    if (!this.validatePostFile(imageFile.filename)) {
                        sendErrorResponse('Недопустимый формат файла для поста', 400);
                        return;
                    }

                    const fileExt = path.extname(imageFile.filename);
                    const uniqueFilename = `post_${user.id}_${Date.now()}${fileExt}`;
                    const url = await this.saveBufferToFolder(imageFile.buffer, 'posts', uniqueFilename);

                    this.securitySystem.logSecurityEvent && this.securitySystem.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${imageFile.filename}`);

                    sendSuccessResponse({ success: true, imageUrl: url });
                } catch (err) {
                    console.error('❌ Ошибка при сохранении изображения:', err);
                    sendErrorResponse('Ошибка при сохранении файла: ' + (err.message || err));
                }
            });

            bb.on('error', (err) => {
                console.error('❌ Busboy error (post image):', err);
                sendErrorResponse('Ошибка обработки формы: ' + err.message);
            });

            req.pipe(bb);
        } catch (err) {
            console.error('❌ Critical post image handler error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Критическая ошибка сервера' }));
        }
    }

    // ---------------- GENERIC FILE (chat files) ----------------
    async handleUploadFileMultipart(req, res) {
        console.log('📎 Начало обработки загрузки файла...');
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            });
            res.end();
            return;
        }

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.dataManager.users.find(u => {
            try {
                const session = this.securitySystem.validateSession ? this.securitySystem.validateSession(token) : null;
                return session && u.id === session.userId;
            } catch (e) {
                return false;
            }
        });

        if (!user) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Не авторизован' }));
            return;
        }

        let isResponseSent = false;
        const sendErrorResponse = (message, status = 500) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message }));
            }
        };
        const sendSuccessResponse = (data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 * 1024, files: 1 } });
            let uploadedFile = null;
            let fileType = 'files';

            bb.on('field', (name, val) => {
                if (name === 'fileType') fileType = val;
            });

            bb.on('file', (name, file, info) => {
                const { filename, mimeType } = info;
                if (name === 'file' && filename) {
                    const chunks = [];
                    file.on('data', (chunk) => chunks.push(chunk));
                    file.on('end', () => {
                        uploadedFile = {
                            buffer: Buffer.concat(chunks),
                            filename,
                            mimeType
                        };
                    });
                } else {
                    file.resume();
                }
            });

            bb.on('close', async () => {
                try {
                    if (!uploadedFile) {
                        sendErrorResponse('Файл не получен', 400);
                        return;
                    }

                    let uploadDir = 'files';
                    if (fileType === 'image') {
                        if (!this.validateImageFile(uploadedFile.filename)) {
                            sendErrorResponse('Недопустимый формат изображения', 400);
                            return;
                        }
                        uploadDir = 'images';
                    } else if (fileType === 'video') {
                        if (!this.validateVideoFile(uploadedFile.filename)) {
                            sendErrorResponse('Недопустимый формат видео', 400);
                            return;
                        }
                        uploadDir = 'videos';
                    } else if (fileType === 'audio') {
                        if (!this.validateAudioFile(uploadedFile.filename)) {
                            sendErrorResponse('Недопустимый формат аудио', 400);
                            return;
                        }
                        uploadDir = 'audio';
                    }

                    const fileExt = path.extname(uploadedFile.filename);
                    const uniqueFilename = `${fileType}_${user.id}_${Date.now()}${fileExt}`;
                    const url = await this.saveBufferToFolder(uploadedFile.buffer, uploadDir, uniqueFilename);

                    this.securitySystem.logSecurityEvent && this.securitySystem.logSecurityEvent(user, 'UPLOAD_FILE', `file:${uploadedFile.filename}, type:${fileType}`);

                    sendSuccessResponse({
                        success: true,
                        fileUrl: url,
                        fileName: uploadedFile.filename,
                        fileType: fileType
                    });
                } catch (err) {
                    console.error('❌ Ошибка при сохранении файла:', err);
                    sendErrorResponse('Ошибка при сохранении файла: ' + (err.message || err));
                }
            });

            bb.on('error', (err) => {
                console.error('❌ Busboy error (file):', err);
                sendErrorResponse('Ошибка обработки формы: ' + err.message);
            });

            req.pipe(bb);
        } catch (err) {
            console.error('❌ Critical file handler error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Критическая ошибка сервера' }));
        }
    }

    // ---------------- GIFT UPLOAD (admin) ----------------
    async handleUploadGiftMultipart(req, res) {
        console.log('🎁 Начало обработки загрузки изображения подарка...');
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            });
            res.end();
            return;
        }

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.dataManager.users.find(u => {
            try {
                const session = this.securitySystem.validateSession ? this.securitySystem.validateSession(token) : null;
                return session && u.id === session.userId;
            } catch (e) {
                return false;
            }
        });

        if (!user || !this.securitySystem.isAdmin || !this.securitySystem.isAdmin(user)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Не авторизован или недостаточно прав' }));
            return;
        }

        let isResponseSent = false;
        const sendErrorResponse = (message, status = 500) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message }));
            }
        };
        const sendSuccessResponse = (data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
            let giftFile = null;

            bb.on('file', (name, file, info) => {
                const { filename, mimeType } = info;
                if (name === 'gift' && filename) {
                    const chunks = [];
                    file.on('data', (chunk) => chunks.push(chunk));
                    file.on('end', () => {
                        giftFile = {
                            buffer: Buffer.concat(chunks),
                            filename,
                            mimeType
                        };
                    });
                } else {
                    file.resume();
                }
            });

            bb.on('close', async () => {
                try {
                    if (!giftFile) {
                        sendErrorResponse('Файл подарка не получен', 400);
                        return;
                    }
                    if (!this.validateGiftFile(giftFile.filename)) {
                        sendErrorResponse('Недопустимый формат файла для подарка', 400);
                        return;
                    }

                    const fileExt = path.extname(giftFile.filename);
                    const uniqueFilename = `gift_${Date.now()}${fileExt}`;
                    const url = await this.saveBufferToFolder(giftFile.buffer, 'gifts', uniqueFilename);

                    this.securitySystem.logSecurityEvent && this.securitySystem.logSecurityEvent(user, 'UPLOAD_GIFT', `file:${giftFile.filename}`);

                    sendSuccessResponse({ success: true, imageUrl: url });
                } catch (err) {
                    console.error('❌ Ошибка при сохранении подарка:', err);
                    sendErrorResponse('Ошибка при сохранении файла: ' + (err.message || err));
                }
            });

            bb.on('error', (err) => {
                console.error('❌ Busboy error (gift):', err);
                sendErrorResponse('Ошибка обработки формы: ' + err.message);
            });

            req.pipe(bb);
        } catch (err) {
            console.error('❌ Critical gift handler error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Критическая ошибка сервера' }));
        }
    }

    // ---------------- MUSIC FULL UPLOAD ----------------
    async handleUploadMusicFull(req, res) {
        console.log('🎵 Начало обработки загрузки музыки...');
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            });
            res.end();
            return;
        }

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.dataManager.users.find(u => {
            try {
                const session = this.securitySystem.validateSession ? this.securitySystem.validateSession(token) : null;
                return session && u.id === session.userId;
            } catch (e) {
                return false;
            }
        });

        if (!user) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Не авторизован' }));
            return;
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent && this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC', 'SYSTEM', false);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Ваш аккаунт заблокирован' }));
            return;
        }

        let isResponseSent = false;
        const sendErrorResponse = (message, status = 500) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message }));
            }
        };
        const sendSuccessResponse = (data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 * 1024, files: 2, fields: 10 } });
            const fields = {};
            let audioFile = null;
            let coverFile = null;
            let filesProcessed = 0;
            let totalFilesExpected = 0;
            let fieldsProcessed = 0;

            bb.on('field', (name, val) => {
                fields[name] = val;
                fieldsProcessed++;
            });

            bb.on('file', (name, file, info) => {
                const { filename, mimeType } = info;
                if (!filename) {
                    file.resume();
                    return;
                }

                totalFilesExpected++;
                const chunks = [];
                file.on('data', (chunk) => chunks.push(chunk));
                file.on('end', () => {
                    filesProcessed++;
                    const buffer = Buffer.concat(chunks);
                    if (name === 'audioFile') {
                        audioFile = { buffer, filename, mimeType };
                    } else if (name === 'coverFile') {
                        coverFile = { buffer, filename, mimeType };
                    }
                });

                file.on('limit', () => {
                    sendErrorResponse('Размер файла превышает допустимый лимит', 400);
                });
            });

            bb.on('close', async () => {
                try {
                    if (!audioFile) {
                        sendErrorResponse('Аудио файл обязателен', 400);
                        return;
                    }
                    if (!fields.title || !fields.artist) {
                        sendErrorResponse('Название и исполнитель обязательны', 400);
                        return;
                    }

                    // сохраняем аудио
                    const audioExt = path.extname(audioFile.filename);
                    const audioFilename = `music_${user.id}_${Date.now()}${audioExt}`;
                    const audioUrl = await this.saveBufferToFolder(audioFile.buffer, 'music', audioFilename);

                    // сохраняем обложку если есть
                    let coverUrl = null;
                    if (coverFile && coverFile.filename) {
                        const coverExt = path.extname(coverFile.filename);
                        const coverFilename = `cover_${user.id}_${Date.now()}${coverExt}`;
                        coverUrl = await this.saveBufferToFolder(coverFile.buffer, 'music/covers', coverFilename);
                    }

                    const track = {
                        id: this.dataManager.generateId ? this.dataManager.generateId() : (Date.now().toString()),
                        userId: user.id,
                        title: this.securitySystem.sanitizeContent ? this.securitySystem.sanitizeContent(fields.title) : fields.title,
                        artist: this.securitySystem.sanitizeContent ? this.securitySystem.sanitizeContent(fields.artist) : fields.artist,
                        genre: fields.genre ? (this.securitySystem.sanitizeContent ? this.securitySystem.sanitizeContent(fields.genre) : fields.genre) : 'Не указан',
                        fileUrl: audioUrl,
                        coverUrl: coverUrl,
                        duration: 0,
                        plays: 0,
                        likes: [],
                        createdAt: new Date()
                    };

                    if (Array.isArray(this.dataManager.music)) {
                        this.dataManager.music.unshift(track);
                    } else {
                        this.dataManager.music = [track];
                    }
                    this.dataManager.saveData && this.dataManager.saveData();

                    this.securitySystem.logSecurityEvent && this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC', `track:${track.title} - ${track.artist}`);

                    sendSuccessResponse({
                        success: true,
                        track: {
                            ...track,
                            userName: user.displayName,
                            userAvatar: user.avatar,
                            userVerified: user.verified
                        }
                    });
                } catch (err) {
                    console.error('❌ Ошибка при сохранении музыки:', err);
                    sendErrorResponse('Ошибка при сохранении файлов: ' + (err.message || err));
                }
            });

            bb.on('error', (err) => {
                console.error('❌ Busboy error (music):', err);
                sendErrorResponse('Ошибка обработки формы: ' + err.message);
            });

            req.pipe(bb);
        } catch (err) {
            console.error('❌ Critical music handler error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Критическая ошибка сервера' }));
        }
    }

    // вспомогательная обертка (совместимость с прежним кодом)
    async saveBufferToFolder(buffer, folder, filename) {
        return this.saveBufferToFolderInternal(buffer, folder, filename);
    }

    async saveBufferToFolderInternal(buffer, folder, filename) {
        const base = this.getUploadBase();
        const dir = path.join(base, folder);
        if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, filename);
        await fs.writeFile(filePath, buffer);
        return `/uploads/${folder}/${filename}`;
    }

    // импорт БД через multipart (как у тебя было)
    async handleImportDatabaseMultipart(req, res) {
        console.log('🔄 Начало обработки импорта базы данных...');
        if (req.method === 'OPTIONS') {
            res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });
            res.end();
            return;
        }

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.dataManager.users.find(u => {
            try {
                const session = this.securitySystem.validateSession ? this.securitySystem.validateSession(token) : null;
                return session && u.id === session.userId;
            } catch (e) {
                return false;
            }
        });

        if (!user || !this.securitySystem.isAdmin || !this.securitySystem.isAdmin(user)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Не авторизован или недостаточно прав' }));
            return;
        }

        try {
            const bb = busboy({ headers: req.headers, limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
            let databaseFile = null;

            bb.on('file', (name, file, info) => {
                const { filename } = info;
                if (name === 'database' && filename) {
                    const chunks = [];
                    file.on('data', (chunk) => chunks.push(chunk));
                    file.on('end', () => {
                        databaseFile = {
                            buffer: Buffer.concat(chunks),
                            filename
                        };
                    });
                } else {
                    file.resume();
                }
            });

            bb.on('close', async () => {
                if (!databaseFile) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Файл базы данных не получен' }));
                    return;
                }

                if (!databaseFile.filename.endsWith('.json')) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Файл должен быть в формате JSON' }));
                    return;
                }

                try {
                    const fileContent = databaseFile.buffer.toString('utf8');
                    const importData = JSON.parse(fileContent);

                    if (!importData.exportInfo || !importData.data) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Неверная структура файла базы данных' }));
                        return;
                    }

                    // Создаем бэкап и импортируем
                    const backupData = {
                        users: this.dataManager.users,
                        messages: this.dataManager.messages,
                        posts: this.dataManager.posts,
                        gifts: this.dataManager.gifts,
                        promoCodes: this.dataManager.promoCodes,
                        music: this.dataManager.music,
                        playlists: this.dataManager.playlists,
                        groups: this.dataManager.groups,
                        bannedIPs: Object.fromEntries(this.dataManager.bannedIPs || []),
                        devices: Object.fromEntries(this.dataManager.devices || [])
                    };

                    // Пытаемся заменить данные
                    this.dataManager.users = importData.data.users || [];
                    this.dataManager.messages = importData.data.messages || [];
                    this.dataManager.posts = importData.data.posts || [];
                    this.dataManager.gifts = importData.data.gifts || [];
                    this.dataManager.promoCodes = importData.data.promoCodes || [];
                    this.dataManager.music = importData.data.music || [];
                    this.dataManager.playlists = importData.data.playlists || [];
                    this.dataManager.groups = importData.data.groups || [];
                    this.dataManager.bannedIPs = new Map(Object.entries(importData.data.bannedIPs || {}));
                    this.dataManager.devices = new Map(Object.entries(importData.data.devices || {}));

                    this.dataManager.restoreDates && this.dataManager.restoreDates();
                    this.dataManager.saveData && this.dataManager.saveData();

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'База данных успешно импортирована' }));
                } catch (err) {
                    console.error('❌ Ошибка импорта:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Ошибка импорта данных' }));
                }
            });

            req.pipe(bb);
        } catch (err) {
            console.error('❌ Critical import DB error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Критическая ошибка сервера' }));
        }
    }
}

module.exports = FileHandlers;
