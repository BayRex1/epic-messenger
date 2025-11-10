const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Функция для обслуживания статических файлов
function serveStaticFile(res, filePath, contentType) {
    const fullPath = path.join(process.cwd(), filePath);
    
    fs.readFile(fullPath, (err, data) => {
        if (err) {
            console.log('File not found:', filePath);
            res.writeHead(404);
            res.end('File not found');
            return;
        }
        
        res.writeHead(200, { 
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600'
        });
        res.end(data);
    });
}

// Получение IP адреса клиента
function getClientIP(req) {
    return req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null);
}

// Получение информации об устройстве
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

// Генерация ID устройства
function generateDeviceId(req) {
    const ip = getClientIP(req);
    const deviceInfo = getDeviceInfo(req);
    const deviceString = `${ip}-${deviceInfo.browser}-${deviceInfo.os}`;
    return crypto.createHash('md5').update(deviceString).digest('hex');
}

module.exports = {
    serveStaticFile,
    getClientIP,
    getDeviceInfo,
    generateDeviceId
};
