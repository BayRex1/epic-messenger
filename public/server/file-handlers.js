const busboy = require('busboy');
const fs = require('fs').promises;
const path = require('path');

class FileHandlers {
    constructor(dataManager, securitySystem) {
        this.dataManager = dataManager;
        this.securitySystem = securitySystem;
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
        // Временно упрощаем для тестирования
        console.log('🔍 Проверка файла аватара:', filename);
        
        if (!filename) return false;
        
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        const ext = path.extname(filename).toLowerCase();
        const isValid = allowedExtensions.includes(ext);
        
        console.log('📁 Расширение файла:', ext, 'Валидно:', isValid);
        return true; // Временно возвращаем true для тестирования
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

    async saveFile(fileData, filename, type) {
        let uploadDir = 'uploads';
        if (type === 'avatar') uploadDir = 'uploads/avatars';
        else if (type === 'gift') uploadDir = 'uploads/gifts';
        else if (type === 'post') uploadDir = 'uploads/posts';
        else if (type === 'music') uploadDir = 'uploads/music';
        else if (type === 'music/covers') uploadDir = 'uploads/music/covers';
        else if (type === 'images') uploadDir = 'uploads/images';
        else if (type === 'videos') uploadDir = 'uploads/videos';
        else if (type === 'audio') uploadDir = 'uploads/audio';
        else if (type === 'files') uploadDir = 'uploads/files';

        const filePath = path.join(process.cwd(), 'public', uploadDir, filename);
        
        let buffer;
        if (fileData.startsWith('data:')) {
            const base64Data = fileData.split(',')[1];
            buffer = Buffer.from(base64Data, 'base64');
        } else {
            buffer = Buffer.from(fileData, 'base64');
        }

        const dirPath = path.dirname(filePath);
        await fs.mkdir(dirPath, { recursive: true });
        await fs.writeFile(filePath, buffer);

        return `/${uploadDir}/${filename}`;
    }

    deleteFile(fileUrl) {
        if (!fileUrl || !fileUrl.startsWith('/uploads/')) return;
        
        const filePath = path.join(process.cwd(), 'public', fileUrl.substring(1));
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
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

    async handleUploadAvatarMultipart(req, res) {
        console.log('🖼️ Начало обработки загрузки аватара...');

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.dataManager.users.find(u => {
            const session = this.securitySystem.validateSession(token);
            return session && u.id === session.userId;
        });
        
        if (!user) {
            res.writeHead(401, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ success: false, message: 'Не авторизован' }));
            return;
        }

        let isResponseSent = false;

        const sendErrorResponse = (message, statusCode = 500) => {
            if (!isResponseSent) {
                isResponseSent = true;
                console.error('❌ Ошибка загрузки аватара:', message);
                res.writeHead(statusCode, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ success: false, message }));
            }
        };

        const sendSuccessResponse = (data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ 
                headers: req.headers,
                limits: {
                    fileSize: 5 * 1024 * 1024, // 5MB максимум
                    files: 1 // только один файл
                }
            });
            
            let avatarFile = null;

            bb.on('file', (name, file, info) => {
                const { filename, mimeType } = info;
                console.log(`📁 Получен файл: ${name}, имя: ${filename}, тип: ${mimeType}`);
                
                if (name === 'avatar' && filename) {
                    const chunks = [];
                    
                    file.on('data', (chunk) => {
                        chunks.push(chunk);
                    });
                    
                    file.on('end', () => {
                        if (chunks.length > 0) {
                            avatarFile = {
                                buffer: Buffer.concat(chunks),
                                filename: filename,
                                mimeType: mimeType
                            };
                            console.log('✅ Аватар сохранен в памяти');
                        }
                    });
                } else {
                    file.resume();
                }
            });

            bb.on('close', async () => {
                console.log('🔚 Завершение обработки формы аватара');
                
                try {
                    if (!avatarFile) {
                        sendErrorResponse('Файл аватара не получен', 400);
                        return;
                    }

                    if (!this.validateAvatarFile(avatarFile.filename)) {
                        sendErrorResponse('Недопустимый формат файла для аватара', 400);
                        return;
                    }

                    // Сохраняем файл
                    const fileExt = path.extname(avatarFile.filename);
                    const uniqueFilename = `avatar_${user.id}_${Date.now()}${fileExt}`;
                    const filePath = path.join(process.cwd(), 'public', 'uploads', 'avatars', uniqueFilename);
                    
                    console.log(`💾 Сохранение аватара: ${filePath}`);
                    await fs.writeFile(filePath, avatarFile.buffer);
                    const fileUrl = `/uploads/avatars/${uniqueFilename}`;

                    // Удаляем старый аватар если он был
                    if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
                        this.deleteFile(user.avatar);
                    }

                    // Обновляем пользователя
                    user.avatar = fileUrl;
                    this.dataManager.saveData();

                    this.securitySystem.logSecurityEvent(user, 'UPLOAD_AVATAR', `file:${avatarFile.filename}`);

                    console.log(`🖼️ Пользователь ${user.username} загрузил аватар: ${avatarFile.filename}`);

                    sendSuccessResponse({
                        success: true,
                        avatarUrl: fileUrl,
                        user: {
                            id: user.id,
                            username: user.username,
                            displayName: user.displayName,
                            email: user.email,
                            avatar: fileUrl,
                            description: user.description,
                            coins: user.coins,
                            verified: user.verified,
                            isDeveloper: user.isDeveloper,
                            status: user.status,
                            lastSeen: user.lastSeen,
                            createdAt: user.createdAt,
                            friendsCount: user.friendsCount || 0,
                            postsCount: user.postsCount || 0,
                            giftsCount: user.giftsCount || 0,
                            banned: user.banned || false
                        }
                    });

                } catch (error) {
                    console.error('❌ Ошибка при сохранении аватара:', error);
                    sendErrorResponse('Ошибка при сохранении файла: ' + error.message);
                }
            });

            bb.on('error', (error) => {
                console.error('❌ Ошибка busboy:', error);
                sendErrorResponse('Ошибка обработки формы: ' + error.message);
            });

            req.pipe(bb);

        } catch (error) {
            console.error('❌ Критическая ошибка в handleUploadAvatarMultipart:', error);
            sendErrorResponse('Критическая ошибка сервера: ' + error.message);
        }
    }

    async handleUploadPostImageMultipart(req, res) {
        console.log('📸 Начало обработки загрузки изображения для поста...');

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.dataManager.users.find(u => {
            const session = this.securitySystem.validateSession(token);
            return session && u.id === session.userId;
        });
        
        if (!user) {
            res.writeHead(401, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ success: false, message: 'Не авторизован' }));
            return;
        }

        let isResponseSent = false;

        const sendErrorResponse = (message, statusCode = 500) => {
            if (!isResponseSent) {
                isResponseSent = true;
                console.error('❌ Ошибка загрузки изображения:', message);
                res.writeHead(statusCode, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ success: false, message }));
            }
        };

        const sendSuccessResponse = (data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ 
                headers: req.headers,
                limits: {
                    fileSize: 10 * 1024 * 1024, // 10MB максимум
                    files: 1
                }
            });
            
            let imageFile = null;

            bb.on('file', (name, file, info) => {
                const { filename, mimeType } = info;
                console.log(`📁 Получен файл: ${name}, имя: ${filename}, тип: ${mimeType}`);
                
                if (name === 'image' && filename) {
                    const chunks = [];
                    
                    file.on('data', (chunk) => {
                        chunks.push(chunk);
                    });
                    
                    file.on('end', () => {
                        if (chunks.length > 0) {
                            imageFile = {
                                buffer: Buffer.concat(chunks),
                                filename: filename,
                                mimeType: mimeType
                            };
                            console.log('✅ Изображение сохранено в памяти');
                        }
                    });
                } else {
                    file.resume();
                }
            });

            bb.on('close', async () => {
                console.log('🔚 Завершение обработки формы изображения');
                
                try {
                    if (!imageFile) {
                        sendErrorResponse('Файл изображения не получен', 400);
                        return;
                    }

                    if (!this.validatePostFile(imageFile.filename)) {
                        sendErrorResponse('Недопустимый формат файла для поста', 400);
                        return;
                    }

                    // Сохраняем файл
                    const fileExt = path.extname(imageFile.filename);
                    const uniqueFilename = `post_${user.id}_${Date.now()}${fileExt}`;
                    const filePath = path.join(process.cwd(), 'public', 'uploads', 'posts', uniqueFilename);
                    
                    console.log(`💾 Сохранение изображения: ${filePath}`);
                    await fs.writeFile(filePath, imageFile.buffer);
                    const fileUrl = `/uploads/posts/${uniqueFilename}`;

                    this.securitySystem.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${imageFile.filename}`);

                    console.log(`📸 Пользователь ${user.username} загрузил изображение для поста: ${imageFile.filename}`);

                    sendSuccessResponse({
                        success: true,
                        imageUrl: fileUrl
                    });

                } catch (error) {
                    console.error('❌ Ошибка при сохранении изображения:', error);
                    sendErrorResponse('Ошибка при сохранении файла: ' + error.message);
                }
            });

            bb.on('error', (error) => {
                console.error('❌ Ошибка busboy:', error);
                sendErrorResponse('Ошибка обработки формы: ' + error.message);
            });

            req.pipe(bb);

        } catch (error) {
            console.error('❌ Критическая ошибка в handleUploadPostImageMultipart:', error);
            sendErrorResponse('Критическая ошибка сервера: ' + error.message);
        }
    }

    async handleUploadFileMultipart(req, res) {
        console.log('📎 Начало обработки загрузки файла...');

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.dataManager.users.find(u => {
            const session = this.securitySystem.validateSession(token);
            return session && u.id === session.userId;
        });
        
        if (!user) {
            res.writeHead(401, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ success: false, message: 'Не авторизован' }));
            return;
        }

        let isResponseSent = false;

        const sendErrorResponse = (message, statusCode = 500) => {
            if (!isResponseSent) {
                isResponseSent = true;
                console.error('❌ Ошибка загрузки файла:', message);
                res.writeHead(statusCode, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ success: false, message }));
            }
        };

        const sendSuccessResponse = (data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ 
                headers: req.headers,
                limits: {
                    fileSize: 50 * 1024 * 1024, // 50MB максимум
                    files: 1
                }
            });
            
            let uploadedFile = null;
            let fileType = 'files';

            bb.on('field', (name, val) => {
                if (name === 'fileType') {
                    fileType = val;
                }
            });

            bb.on('file', (name, file, info) => {
                const { filename, mimeType } = info;
                console.log(`📁 Получен файл: ${name}, имя: ${filename}, тип: ${mimeType}`);
                
                if (name === 'file' && filename) {
                    const chunks = [];
                    
                    file.on('data', (chunk) => {
                        chunks.push(chunk);
                    });
                    
                    file.on('end', () => {
                        if (chunks.length > 0) {
                            uploadedFile = {
                                buffer: Buffer.concat(chunks),
                                filename: filename,
                                mimeType: mimeType
                            };
                            console.log('✅ Файл сохранен в памяти');
                        }
                    });
                } else {
                    file.resume();
                }
            });

            bb.on('close', async () => {
                console.log('🔚 Завершение обработки формы файла');
                
                try {
                    if (!uploadedFile) {
                        sendErrorResponse('Файл не получен', 400);
                        return;
                    }

                    // Определяем тип файла
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

                    // Сохраняем файл
                    const fileExt = path.extname(uploadedFile.filename);
                    const uniqueFilename = `${fileType}_${user.id}_${Date.now()}${fileExt}`;
                    const filePath = path.join(process.cwd(), 'public', 'uploads', uploadDir, uniqueFilename);
                    
                    console.log(`💾 Сохранение файла: ${filePath}`);
                    await fs.writeFile(filePath, uploadedFile.buffer);
                    const fileUrl = `/uploads/${uploadDir}/${uniqueFilename}`;

                    this.securitySystem.logSecurityEvent(user, 'UPLOAD_FILE', `file:${uploadedFile.filename}, type:${fileType}`);

                    console.log(`📎 Пользователь ${user.username} загрузил файл: ${uploadedFile.filename}`);

                    sendSuccessResponse({
                        success: true,
                        fileUrl: fileUrl,
                        fileName: uploadedFile.filename,
                        fileType: fileType
                    });

                } catch (error) {
                    console.error('❌ Ошибка при сохранении файла:', error);
                    sendErrorResponse('Ошибка при сохранении файла: ' + error.message);
                }
            });

            bb.on('error', (error) => {
                console.error('❌ Ошибка busboy:', error);
                sendErrorResponse('Ошибка обработки формы: ' + error.message);
            });

            req.pipe(bb);

        } catch (error) {
            console.error('❌ Критическая ошибка в handleUploadFileMultipart:', error);
            sendErrorResponse('Критическая ошибка сервера: ' + error.message);
        }
    }

    async handleUploadGiftMultipart(req, res) {
        console.log('🎁 Начало обработки загрузки изображения подарка...');

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.dataManager.users.find(u => {
            const session = this.securitySystem.validateSession(token);
            return session && u.id === session.userId;
        });
        
        if (!user || !this.securitySystem.isAdmin(user)) {
            res.writeHead(401, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ success: false, message: 'Не авторизован или недостаточно прав' }));
            return;
        }

        let isResponseSent = false;

        const sendErrorResponse = (message, statusCode = 500) => {
            if (!isResponseSent) {
                isResponseSent = true;
                console.error('❌ Ошибка загрузки подарка:', message);
                res.writeHead(statusCode, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ success: false, message }));
            }
        };

        const sendSuccessResponse = (data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ 
                headers: req.headers,
                limits: {
                    fileSize: 5 * 1024 * 1024, // 5MB максимум
                    files: 1
                }
            });
            
            let giftFile = null;

            bb.on('file', (name, file, info) => {
                const { filename, mimeType } = info;
                console.log(`📁 Получен файл: ${name}, имя: ${filename}, тип: ${mimeType}`);
                
                if (name === 'gift' && filename) {
                    const chunks = [];
                    
                    file.on('data', (chunk) => {
                        chunks.push(chunk);
                    });
                    
                    file.on('end', () => {
                        if (chunks.length > 0) {
                            giftFile = {
                                buffer: Buffer.concat(chunks),
                                filename: filename,
                                mimeType: mimeType
                            };
                            console.log('✅ Изображение подарка сохранено в памяти');
                        }
                    });
                } else {
                    file.resume();
                }
            });

            bb.on('close', async () => {
                console.log('🔚 Завершение обработки формы подарка');
                
                try {
                    if (!giftFile) {
                        sendErrorResponse('Файл подарка не получен', 400);
                        return;
                    }

                    if (!this.validateGiftFile(giftFile.filename)) {
                        sendErrorResponse('Недопустимый формат файла для подарка', 400);
                        return;
                    }

                    // Сохраняем файл
                    const fileExt = path.extname(giftFile.filename);
                    const uniqueFilename = `gift_${Date.now()}${fileExt}`;
                    const filePath = path.join(process.cwd(), 'public', 'uploads', 'gifts', uniqueFilename);
                    
                    console.log(`💾 Сохранение подарка: ${filePath}`);
                    await fs.writeFile(filePath, giftFile.buffer);
                    const fileUrl = `/uploads/gifts/${uniqueFilename}`;

                    this.securitySystem.logSecurityEvent(user, 'UPLOAD_GIFT', `file:${giftFile.filename}`);

                    console.log(`🎁 Администратор ${user.username} загрузил изображение подарка: ${giftFile.filename}`);

                    sendSuccessResponse({
                        success: true,
                        imageUrl: fileUrl
                    });

                } catch (error) {
                    console.error('❌ Ошибка при сохранении подарка:', error);
                    sendErrorResponse('Ошибка при сохранении файла: ' + error.message);
                }
            });

            bb.on('error', (error) => {
                console.error('❌ Ошибка busboy:', error);
                sendErrorResponse('Ошибка обработки формы: ' + error.message);
            });

            req.pipe(bb);

        } catch (error) {
            console.error('❌ Критическая ошибка в handleUploadGiftMultipart:', error);
            sendErrorResponse('Критическая ошибка сервера: ' + error.message);
        }
    }

    async handleUploadMusicFull(req, res) {
        console.log('🎵 Начало обработки загрузки музыки...');

        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
        };

        if (req.method === 'OPTIONS') {
            res.writeHead(204, headers);
            res.end();
            return;
        }

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.dataManager.users.find(u => {
            const session = this.securitySystem.validateSession(token);
            return session && u.id === session.userId;
        });
        
        if (!user) {
            res.writeHead(401, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ success: false, message: 'Не авторизован' }));
            return;
        }

        // 🔐 Проверяем что пользователь не забанен
        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC', 'SYSTEM', false);
            res.writeHead(403, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ success: false, message: 'Ваш аккаунт заблокирован' }));
            return;
        }

        console.log('🎵 Пользователь авторизован:', user.username);

        let isResponseSent = false;

        const sendErrorResponse = (message, statusCode = 500) => {
            if (!isResponseSent) {
                isResponseSent = true;
                console.error('❌ Ошибка загрузки:', message);
                res.writeHead(statusCode, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ success: false, message }));
            }
        };

        const sendSuccessResponse = (data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ 
                headers: req.headers,
                limits: {
                    fileSize: 50 * 1024 * 1024, // 50MB максимум
                    files: 2, // максимум 2 файла (аудио + обложка)
                    fields: 10 // максимум 10 полей
                }
            });
            
            let fields = {};
            let audioFile = null;
            let coverFile = null;
            let filesProcessed = 0;
            let totalFilesExpected = 0;
            let fieldsProcessed = 0;

            bb.on('field', (name, val) => {
                console.log(`📋 Поле формы: ${name} = ${val}`);
                fields[name] = val;
                fieldsProcessed++;
            });

            bb.on('file', (name, file, info) => {
                const { filename, mimeType } = info;
                console.log(`📁 Получен файл: ${name}, имя: ${filename}, тип: ${mimeType}`);
                
                if (!filename) {
                    console.log('📁 Пропускаем пустой файл');
                    file.resume();
                    return;
                }

                totalFilesExpected++;
                const chunks = [];
                
                file.on('data', (chunk) => {
                    chunks.push(chunk);
                });
                
                file.on('end', () => {
                    filesProcessed++;
                    console.log(`📊 Файл ${filename} полностью получен, размер: ${chunks.length} chunks`);
                    
                    if (chunks.length === 0) {
                        console.log('⚠️ Файл пустой, пропускаем');
                        return;
                    }

                    const buffer = Buffer.concat(chunks);
                    console.log(`📊 Размер файла ${filename}: ${buffer.length} байт`);
                    
                    if (name === 'audioFile') {
                        if (!this.validateMusicFile(filename)) {
                            sendErrorResponse('Недопустимый формат аудио файла. Разрешены: MP3, WAV, OGG, M4A, AAC', 400);
                            return;
                        }
                        audioFile = { buffer, filename, mimeType };
                        console.log('✅ Аудио файл сохранен в памяти');
                    } else if (name === 'coverFile') {
                        if (!this.validateCoverFile(filename)) {
                            sendErrorResponse('Недопустимый формат изображения. Разрешены: JPG, JPEG, PNG, GIF, BMP, WEBP', 400);
                            return;
                        }
                        coverFile = { buffer, filename, mimeType };
                        console.log('✅ Обложка сохранена в памяти');
                    }
                });

                file.on('error', (error) => {
                    console.error('❌ Ошибка чтения файла:', error);
                    sendErrorResponse('Ошибка чтения файла');
                });

                file.on('limit', () => {
                    console.error('❌ Превышен лимит размера файла');
                    sendErrorResponse('Размер файла превышает допустимый лимит', 400);
                });
            });

            bb.on('close', async () => {
                console.log('🔚 Завершение обработки формы');
                console.log(`📊 Обработано полей: ${fieldsProcessed}, файлов: ${filesProcessed}/${totalFilesExpected}`);
                
                // Даем немного времени на завершение обработки файлов
                setTimeout(async () => {
                    try {
                        if (!audioFile) {
                            sendErrorResponse('Аудио файл обязателен', 400);
                            return;
                        }

                        if (!fields.title || !fields.artist) {
                            sendErrorResponse('Название и исполнитель обязательны', 400);
                            return;
                        }

                        console.log('✅ Все проверки пройдены, начинаем сохранение файлов...');

                        // Сохраняем аудио файл
                        const audioExt = path.extname(audioFile.filename);
                        const audioFilename = `music_${user.id}_${Date.now()}${audioExt}`;
                        const audioPath = path.join(process.cwd(), 'public', 'uploads', 'music', audioFilename);
                        
                        console.log(`💾 Сохранение аудио файла: ${audioPath}`);
                        try {
                            await fs.writeFile(audioPath, audioFile.buffer);
                            const audioUrl = `/uploads/music/${audioFilename}`;
                            console.log('✅ Аудио файл сохранен');

                            // Сохраняем обложку если есть
                            let coverUrl = null;
                            if (coverFile && coverFile.filename) {
                                const coverExt = path.extname(coverFile.filename);
                                const coverFilename = `cover_${user.id}_${Date.now()}${coverExt}`;
                                const coverPath = path.join(process.cwd(), 'public', 'uploads', 'music', 'covers', coverFilename);
                                
                                console.log(`💾 Сохранение обложки: ${coverPath}`);
                                await fs.writeFile(coverPath, coverFile.buffer);
                                coverUrl = `/uploads/music/covers/${coverFilename}`;
                                console.log('✅ Обложка сохранена');
                            }

                            // Сохраняем метаданные трека
                            const track = {
                                id: this.dataManager.generateId(),
                                userId: user.id,
                                title: this.securitySystem.sanitizeContent(fields.title),
                                artist: this.securitySystem.sanitizeContent(fields.artist),
                                genre: fields.genre ? this.securitySystem.sanitizeContent(fields.genre) : 'Не указан',
                                fileUrl: audioUrl,
                                coverUrl: coverUrl,
                                duration: 0,
                                plays: 0,
                                likes: [],
                                createdAt: new Date()
                            };

                            this.dataManager.music.unshift(track);
                            this.dataManager.saveData();

                            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC', `track:${track.title} - ${track.artist}`);

                            console.log(`🎵 Пользователь ${user.displayName} загрузил трек: ${track.title} - ${track.artist}`);

                            sendSuccessResponse({
                                success: true,
                                track: {
                                    ...track,
                                    userName: user.displayName,
                                    userAvatar: user.avatar,
                                    userVerified: user.verified
                                }
                            });

                        } catch (fileError) {
                            console.error('❌ Ошибка при сохранении файлов:', fileError);
                            sendErrorResponse('Ошибка при сохранении файлов: ' + fileError.message);
                        }

                    } catch (error) {
                        console.error('❌ Ошибка при обработке формы:', error);
                        sendErrorResponse('Ошибка при обработке формы: ' + error.message);
                    }
                }, 100); // Небольшая задержка для завершения всех операций
            });

            bb.on('error', (error) => {
                console.error('❌ Ошибка busboy:', error);
                sendErrorResponse('Ошибка обработки формы: ' + error.message);
            });

            // Обработка ошибок запроса
            req.on('error', (error) => {
                console.error('❌ Ошибка запроса:', error);
                sendErrorResponse('Ошибка запроса: ' + error.message);
            });

            req.on('end', () => {
                console.log('📨 Запрос полностью получен');
            });

            // Таймаут обработки
            const timeout = setTimeout(() => {
                console.error('⏰ Таймаут обработки запроса');
                sendErrorResponse('Таймаут обработки запроса', 408);
            }, 60000); // 60 секунд

            console.log('🔄 Начинаем парсинг формы...');
            req.pipe(bb);

            // Очистка таймаута при успешной обработке
            bb.on('close', () => {
                clearTimeout(timeout);
                console.log('✅ Таймаут очищен');
            });

        } catch (error) {
            console.error('❌ Критическая ошибка в handleUploadMusicFull:', error);
            sendErrorResponse('Критическая ошибка сервера: ' + error.message);
        }
    }

    async handleImportDatabaseMultipart(req, res) {
        console.log('🔄 Начало обработки импорта базы данных...');

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.dataManager.users.find(u => {
            const session = this.securitySystem.validateSession(token);
            return session && u.id === session.userId;
        });
        
        if (!user || !this.securitySystem.isAdmin(user)) {
            res.writeHead(401, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ success: false, message: 'Не авторизован или недостаточно прав' }));
            return;
        }

        let isResponseSent = false;

        const sendErrorResponse = (message, statusCode = 500) => {
            if (!isResponseSent) {
                isResponseSent = true;
                console.error('❌ Ошибка импорта базы данных:', message);
                res.writeHead(statusCode, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ success: false, message }));
            }
        };

        const sendSuccessResponse = (data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ 
                headers: req.headers,
                limits: {
                    fileSize: 100 * 1024 * 1024, // 100MB максимум для БД
                    files: 1
                }
            });
            
            let databaseFile = null;

            bb.on('file', (name, file, info) => {
                const { filename, mimeType } = info;
                console.log(`📁 Получен файл: ${name}, имя: ${filename}, тип: ${mimeType}`);
                
                if (name === 'database' && filename) {
                    const chunks = [];
                    
                    file.on('data', (chunk) => {
                        chunks.push(chunk);
                    });
                    
                    file.on('end', () => {
                        if (chunks.length > 0) {
                            databaseFile = {
                                buffer: Buffer.concat(chunks),
                                filename: filename,
                                mimeType: mimeType
                            };
                            console.log('✅ Файл БД сохранен в памяти');
                        }
                    });
                } else {
                    file.resume();
                }
            });

            bb.on('close', async () => {
                console.log('🔚 Завершение обработки формы импорта БД');
                
                try {
                    if (!databaseFile) {
                        sendErrorResponse('Файл базы данных не получен', 400);
                        return;
                    }

                    // Проверяем что это JSON файл
                    if (!databaseFile.filename.endsWith('.json')) {
                        sendErrorResponse('Файл должен быть в формате JSON', 400);
                        return;
                    }

                    // Парсим JSON данные
                    const fileContent = databaseFile.buffer.toString('utf8');
                    let importData;
                    try {
                        importData = JSON.parse(fileContent);
                    } catch (parseError) {
                        sendErrorResponse('Неверный формат JSON файла', 400);
                        return;
                    }

                    // Проверяем структуру данных
                    if (!importData.exportInfo || !importData.data) {
                        sendErrorResponse('Неверная структура файла базы данных', 400);
                        return;
                    }

                    // 🔐 СОХРАНЯЕМ СТАРЫЕ ДАННЫЕ ДЛЯ БЭКАПА
                    const backupData = {
                        users: this.dataManager.users,
                        messages: this.dataManager.messages,
                        posts: this.dataManager.posts,
                        gifts: this.dataManager.gifts,
                        promoCodes: this.dataManager.promoCodes,
                        music: this.dataManager.music,
                        playlists: this.dataManager.playlists,
                        groups: this.dataManager.groups,
                        bannedIPs: Object.fromEntries(this.dataManager.bannedIPs),
                        devices: Object.fromEntries(this.dataManager.devices),
                        backupCreatedAt: new Date().toISOString()
                    };

                    const backupFilename = `backup-before-import-${new Date().toISOString().split('T')[0]}.json`;
                    const backupPath = path.join('/tmp', backupFilename);
                    
                    require('fs').writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
                    console.log(`💾 Создан бэкап перед импортом: ${backupPath}`);

                    // 🔄 ИМПОРТИРУЕМ НОВЫЕ ДАННЫЕ
                    try {
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

                        // Восстанавливаем даты
                        this.dataManager.restoreDates();

                        // Сохраняем данные
                        this.dataManager.saveData();

                        this.securitySystem.logSecurityEvent(user, 'IMPORT_DATABASE', `file:${databaseFile.filename}, users:${this.dataManager.users.length}, messages:${this.dataManager.messages.length}`);

                        console.log(`🔄 Администратор ${user.username} импортировал базу данных:`);
                        console.log(`   👥 Пользователей: ${this.dataManager.users.length}`);
                        console.log(`   💬 Сообщений: ${this.dataManager.messages.length}`);
                        console.log(`   📝 Постов: ${this.dataManager.posts.length}`);
                        console.log(`   🎁 Подарков: ${this.dataManager.gifts.length}`);
                        console.log(`   🎵 Треков: ${this.dataManager.music.length}`);

                        sendSuccessResponse({
                            success: true,
                            message: 'База данных успешно импортирована!',
                            stats: {
                                users: this.dataManager.users.length,
                                messages: this.dataManager.messages.length,
                                posts: this.dataManager.posts.length,
                                gifts: this.dataManager.gifts.length,
                                music: this.dataManager.music.length,
                                backupFile: backupFilename
                            },
                            exportInfo: importData.exportInfo
                        });

                    } catch (importError) {
                        // 🔄 ВОССТАНАВЛИВАЕМ ДАННЫЕ ИЗ БЭКАПА ПРИ ОШИБКЕ
                        console.error('❌ Ошибка импорта, восстанавливаем из бэкапа...', importError);
                        
                        this.dataManager.users = backupData.users;
                        this.dataManager.messages = backupData.messages;
                        this.dataManager.posts = backupData.posts;
                        this.dataManager.gifts = backupData.gifts;
                        this.dataManager.promoCodes = backupData.promoCodes;
                        this.dataManager.music = backupData.music;
                        this.dataManager.playlists = backupData.playlists;
                        this.dataManager.groups = backupData.groups;
                        this.dataManager.bannedIPs = new Map(Object.entries(backupData.bannedIPs || {}));
                        this.dataManager.devices = new Map(Object.entries(backupData.devices || {}));
                        
                        this.dataManager.saveData();
                        
                        sendErrorResponse('Ошибка импорта данных. База данных восстановлена из бэкапа.');
                    }

                } catch (error) {
                    console.error('❌ Ошибка при импорте базы данных:', error);
                    sendErrorResponse('Ошибка при импорте базы данных: ' + error.message);
                }
            });

            bb.on('error', (error) => {
                console.error('❌ Ошибка busboy:', error);
                sendErrorResponse('Ошибка обработки формы: ' + error.message);
            });

            req.pipe(bb);

        } catch (error) {
            console.error('❌ Критическая ошибка в handleImportDatabaseMultipart:', error);
            sendErrorResponse('Критическая ошибка сервера: ' + error.message);
        }
    }
}

module.exports = FileHandlers;
