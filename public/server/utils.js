const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function serveStaticFile(res, filePath, contentType) {
    const fullPath = path.join(process.cwd(), filePath);
    console.log(`📁 serveStaticFile: ${filePath} -> ${fullPath}`);
    
    fs.readFile(fullPath, (err, data) => {
        if (err) {
            console.log('❌ File not found:', filePath, err.message);
            res.writeHead(404);
            res.end('File not found');
            return;
        }
        
        console.log(`✅ File served: ${filePath}, size: ${data.length} bytes`);
        res.writeHead(200, { 
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600'
        });
        res.end(data);
    });
}

function getClientIP(req) {
    return req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null);
}

function getDeviceInfo(req) {
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
    
    return {
        browser,
        os,
        userAgent
    };
}

function generateDeviceId(req) {
    const ip = getClientIP(req);
    const deviceInfo = getDeviceInfo(req);
    const deviceString = `${ip}-${deviceInfo.browser}-${deviceInfo.os}`;
    return crypto.createHash('md5').update(deviceString).digest('hex');
}

function checkFileExists(filePath) {
    return new Promise((resolve) => {
        fs.access(filePath, fs.constants.F_OK, (err) => {
            resolve(!err);
        });
    });
}

function ensureUploadDirs() {
    // ИСПРАВЛЕНО: правильные пути для структуры uploads внутри public
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
        'public/assets/emoji'
    ];
    
    console.log('📁 Creating upload directories...');
    requiredDirs.forEach(dir => {
        const fullPath = path.join(process.cwd(), dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
            console.log('✅ Created directory:', fullPath);
        } else {
            console.log('📁 Directory exists:', fullPath);
        }
    });
    
    requiredDirs.forEach(dir => {
        const fullPath = path.join(process.cwd(), dir);
        try {
            const testFile = path.join(fullPath, 'test.txt');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            console.log(`✅ Write access OK: ${dir}`);
        } catch (error) {
            console.log(`❌ Write access FAILED: ${dir}`, error.message);
        }
    });
}

module.exports = {
    serveStaticFile,
    getClientIP,
    getDeviceInfo,
    generateDeviceId,
    checkFileExists,
    ensureUploadDirs
};
