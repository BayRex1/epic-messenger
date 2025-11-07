const fs = require('fs');
const path = require('path');
const busboy = require('busboy');

class FileManager {
    constructor(server) {
        this.server = server;
    }

    // Валидация типов файлов
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

    validateFileType(filename, fileType) {
        switch (fileType) {
            case 'image': return this.validateImageFile(filename);
            case 'video': return this.validateVideoFile(filename);
            case 'audio': return this.validateAudioFile(filename);
            default: return false;
        }
    }

    validateAvatarFile(filename) {
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

    // Сохранение файла
    async saveFile(fileData, filename, type) {
        try {
            console.log('💾 Начало сохранения файла:', { filename, type, dataLength: fileData?.length });
            
            let uploadDir = 'uploads';
            const dirMap = {
                'avatar': 'uploads/avatars',
                'gift': 'uploads/gifts', 
                'post': 'uploads/posts',
                'music': 'uploads/music',
                'music/covers': 'uploads/music/covers',
                'images': 'uploads/images',
                'videos': 'uploads/videos',
                'audio': 'uploads/audio',
                'files': 'uploads/files'
            };
            
            uploadDir = dirMap[type] || 'uploads';
            const filePath = path.join(__dirname, '..', 'public', uploadDir, filename);
            
            console.log('📁 Полный путь к файлу:', filePath);
            
            let buffer;
            if (typeof fileData === 'string') {
                if (fileData.startsWith('data:')) {
                    const base64Data = fileData.split(',')[1];
                    if (!base64Data) {
                        throw new Error('Invalid data URL format: no base64 data');
                    }
                    buffer = Buffer.from(base64Data, 'base64');
                } else {
                    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
                    if (fileData && base64Regex.test(fileData.replace(/\s/g, ''))) {
                        buffer = Buffer.from(fileData, 'base64');
                    } else {
                        throw new Error('Invalid base64 data format');
                    }
                }
            } else if (Buffer.isBuffer(fileData)) {
                buffer = fileData;
            } else {
                throw new Error('Unsupported file data type');
            }

            if (!buffer || buffer.length === 0) {
                throw new Error('Empty file data');
            }

            console.log('📊 Размер буфера:', buffer.length, 'байт');

            const dirPath = path.dirname(filePath);
            if (!fs.existsSync(dirPath)) {
                console.log('📁 Создание директории:', dirPath);
                fs.mkdirSync(dirPath, { recursive: true, mode: 0o755 });
            }

            console.log('💾 Запись файла...');
            await fs.promises.writeFile(filePath, buffer);
            console.log('✅ Файл успешно сохранен:', filePath);

            const fileUrl = `/${uploadDir}/${filename}`;
            return fileUrl;
            
        } catch (error) {
            console.error('❌ Ошибка в saveFile:', error);
            throw error;
        }
    }

    deleteFile(fileUrl) {
        if (!fileUrl || !fileUrl.startsWith('/uploads/')) return;
        
        const filePath = path.join(__dirname, '..', 'public', fileUrl.substring(1));
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    // Обслуживание статических файлов
    serveStaticFile(res, filePath, contentType) {
        console.log('📁 Serving static file:', filePath);
        
        const fullPath = path.join(__dirname, '..', filePath);
        console.log('📁 Full path:', fullPath);
        
        if (!fs.existsSync(fullPath)) {
            console.log('❌ File not found:', fullPath);
            res.writeHead(404);
            res.end('File not found');
            return;
        }
        
        fs.readFile(fullPath, (err, data) => {
            if (err) {
                console.log('❌ File read error:', err);
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            
            console.log('✅ File served successfully:', filePath);
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600'
            });
            res.end(data);
        });
    }

    ensureUploadDirs() {
        const requiredDirs = [
            'public/uploads/music',
            'public/uploads/music/covers',
            'public/uploads/avatars',
            'public/uploads/gifts',
            'public/uploads/posts',
            'public/uploads/images',
            'public/uploads/videos',
            'public/uploads/audio',
            'public/uploads/files',
            'public/assets/emoji',
            '/tmp'
        ];
        
        requiredDirs.forEach(dir => {
            const fullPath = path.join(__dirname, '..', dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
                console.log('✅ Создана папка:', fullPath);
            }
        });
    }

    async handleUploadFile(token, data) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { fileData, filename, fileType } = data;
        
        if (!this.validateFileType(filename, fileType)) {
            return { success: false, message: 'Недопустимый тип файла' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `${fileType}_${user.id}_${Date.now()}${fileExt}`;
            
            const fileUrl = await this.saveFile(fileData, uniqueFilename, fileType + 's');

            return {
                success: true,
                fileUrl: fileUrl,
                fileName: filename,
                fileType: fileType
            };
        } catch (error) {
            console.error('Ошибка загрузки файла:', error);
            return { success: false, message: 'Ошибка загрузки файла: ' + error.message };
        }
    }

    // Multipart обработчики для загрузки файлов
    handleUploadAvatarMultipart(req, res) {
        console.log('🔄 Multipart загрузка аватара...');

        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        };

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.server.auth.authenticateToken(token);
        
        if (!user) {
            res.writeHead(401, headers);
            res.end(JSON.stringify({ success: false, message: 'Не авторизован' }));
            return;
        }

        let isResponseSent = false;

        const sendResponse = (success, data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(success ? 200 : 400, headers);
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ headers: req.headers });
            let fileBuffer = null;
            let filename = null;

            bb.on('file', (name, file, info) => {
                if (name === 'fileData') {
                    filename = info.filename;
                    const chunks = [];
                    
                    file.on('data', (chunk) => {
                        chunks.push(chunk);
                    });
                    
                    file.on('end', () => {
                        fileBuffer = Buffer.concat(chunks);
                    });
                } else {
                    file.resume();
                }
            });

            bb.on('close', async () => {
                try {
                    if (!fileBuffer || !filename) {
                        sendResponse(false, { success: false, message: 'Файл не получен' });
                        return;
                    }

                    if (!this.validateAvatarFile(filename)) {
                        sendResponse(false, { success: false, message: 'Недопустимый формат файла' });
                        return;
                    }

                    const fileExt = path.extname(filename);
                    const uniqueFilename = `avatar_${user.id}_${Date.now()}${fileExt}`;
                    
                    const fileUrl = await this.saveFile(fileBuffer, uniqueFilename, 'avatar');

                    // Удаляем старый аватар
                    if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
                        this.deleteFile(user.avatar);
                    }

                    user.avatar = fileUrl;
                    this.server.saveData();

                    sendResponse(true, {
                        success: true,
                        avatarUrl: fileUrl,
                        user: this.server.auth.getSafeUserData(user)
                    });

                } catch (error) {
                    console.error('Ошибка обработки аватара:', error);
                    sendResponse(false, { success: false, message: error.message });
                }
            });

            req.pipe(bb);

        } catch (error) {
            console.error('Ошибка multipart обработки:', error);
            sendResponse(false, { success: false, message: error.message });
        }
    }

    handleUploadPostImageMultipart(req, res) {
        console.log('🔄 Multipart загрузка изображения для поста...');

        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        };

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.server.auth.authenticateToken(token);
        
        if (!user) {
            res.writeHead(401, headers);
            res.end(JSON.stringify({ success: false, message: 'Не авторизован' }));
            return;
        }

        let isResponseSent = false;

        const sendResponse = (success, data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(success ? 200 : 400, headers);
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ headers: req.headers });
            let fileBuffer = null;
            let filename = null;

            bb.on('file', (name, file, info) => {
                if (name === 'fileData') {
                    filename = info.filename;
                    const chunks = [];
                    
                    file.on('data', (chunk) => {
                        chunks.push(chunk);
                    });
                    
                    file.on('end', () => {
                        fileBuffer = Buffer.concat(chunks);
                    });
                } else {
                    file.resume();
                }
            });

            bb.on('close', async () => {
                try {
                    if (!fileBuffer || !filename) {
                        sendResponse(false, { success: false, message: 'Файл не получен' });
                        return;
                    }

                    if (!this.validatePostFile(filename)) {
                        sendResponse(false, { success: false, message: 'Недопустимый формат файла' });
                        return;
                    }

                    const fileExt = path.extname(filename);
                    const uniqueFilename = `post_${user.id}_${Date.now()}${fileExt}`;
                    
                    const fileUrl = await this.saveFile(fileBuffer, uniqueFilename, 'post');

                    sendResponse(true, {
                        success: true,
                        imageUrl: fileUrl
                    });

                } catch (error) {
                    console.error('Ошибка обработки изображения:', error);
                    sendResponse(false, { success: false, message: error.message });
                }
            });

            req.pipe(bb);

        } catch (error) {
            console.error('Ошибка multipart обработки:', error);
            sendResponse(false, { success: false, message: error.message });
        }
    }

    handleUploadGiftMultipart(req, res) {
        console.log('🔄 Multipart загрузка изображения подарка...');

        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        };

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.server.auth.authenticateToken(token);
        
        if (!user || !this.server.auth.isAdmin(user)) {
            res.writeHead(401, headers);
            res.end(JSON.stringify({ success: false, message: 'Доступ запрещен' }));
            return;
        }

        let isResponseSent = false;

        const sendResponse = (success, data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(success ? 200 : 400, headers);
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ headers: req.headers });
            let fileBuffer = null;
            let filename = null;

            bb.on('file', (name, file, info) => {
                if (name === 'fileData') {
                    filename = info.filename;
                    const chunks = [];
                    
                    file.on('data', (chunk) => {
                        chunks.push(chunk);
                    });
                    
                    file.on('end', () => {
                        fileBuffer = Buffer.concat(chunks);
                    });
                } else {
                    file.resume();
                }
            });

            bb.on('close', async () => {
                try {
                    if (!fileBuffer || !filename) {
                        sendResponse(false, { success: false, message: 'Файл не получен' });
                        return;
                    }

                    if (!this.validateGiftFile(filename)) {
                        sendResponse(false, { success: false, message: 'Недопустимый формат файла' });
                        return;
                    }

                    const fileExt = path.extname(filename);
                    const uniqueFilename = `gift_${Date.now()}${fileExt}`;
                    
                    const fileUrl = await this.saveFile(fileBuffer, uniqueFilename, 'gift');

                    sendResponse(true, {
                        success: true,
                        imageUrl: fileUrl
                    });

                } catch (error) {
                    console.error('Ошибка обработки изображения подарка:', error);
                    sendResponse(false, { success: false, message: error.message });
                }
            });

            req.pipe(bb);

        } catch (error) {
            console.error('Ошибка multipart обработки:', error);
            sendResponse(false, { success: false, message: error.message });
        }
    }

    handleUploadFileMultipart(req, res) {
        console.log('🔄 Multipart загрузка файла...');

        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        };

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = this.server.auth.authenticateToken(token);
        
        if (!user) {
            res.writeHead(401, headers);
            res.end(JSON.stringify({ success: false, message: 'Не авторизован' }));
            return;
        }

        let isResponseSent = false;

        const sendResponse = (success, data) => {
            if (!isResponseSent) {
                isResponseSent = true;
                res.writeHead(success ? 200 : 400, headers);
                res.end(JSON.stringify(data));
            }
        };

        try {
            const bb = busboy({ headers: req.headers });
            let fileBuffer = null;
            let filename = null;
            let fileType = null;

            bb.on('field', (name, val) => {
                if (name === 'fileType') {
                    fileType = val;
                }
            });

            bb.on('file', (name, file, info) => {
                if (name === 'fileData') {
                    filename = info.filename;
                    const chunks = [];
                    
                    file.on('data', (chunk) => {
                        chunks.push(chunk);
                    });
                    
                    file.on('end', () => {
                        fileBuffer = Buffer.concat(chunks);
                    });
                } else {
                    file.resume();
                }
            });

            bb.on('close', async () => {
                try {
                    if (!fileBuffer || !filename) {
                        sendResponse(false, { success: false, message: 'Файл не получен' });
                        return;
                    }

                    if (!fileType) {
                        fileType = 'files';
                    }

                    if (!this.validateFileType(filename, fileType)) {
                        sendResponse(false, { success: false, message: 'Недопустимый тип файла' });
                        return;
                    }

                    const fileExt = path.extname(filename);
                    const uniqueFilename = `${fileType}_${user.id}_${Date.now()}${fileExt}`;
                    
                    const fileUrl = await this.saveFile(fileBuffer, uniqueFilename, fileType + 's');

                    sendResponse(true, {
                        success: true,
                        fileUrl: fileUrl,
                        fileName: filename,
                        fileType: fileType
                    });

                } catch (error) {
                    console.error('Ошибка обработки файла:', error);
                    sendResponse(false, { success: false, message: error.message });
                }
            });

            req.pipe(bb);

        } catch (error) {
            console.error('Ошибка multipart обработки:', error);
            sendResponse(false, { success: false, message: error.message });
        }
    }
}

module.exports = FileManager;
