const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { StringDecoder } = require('string_decoder');
const crypto = require('crypto');
const busboy = require('busboy');
const { Pool } = require('pg');

// 🔐 Система rate limiting
const requestCounts = new Map();

// 🔌 Подключение к PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Проверка подключения к БД
pool.on('connect', () => {
  console.log('✅ Подключение к PostgreSQL установлено');
});

pool.on('error', (err) => {
  console.error('❌ Ошибка подключения к PostgreSQL:', err);
});

class DatabaseManager {
  constructor() {
    this.pool = pool;
    this.initDatabase();
  }

  async initDatabase() {
    try {
      await this.createTables();
      console.log('✅ База данных инициализирована');
    } catch (error) {
      console.error('❌ Ошибка инициализации базы данных:', error);
    }
  }

  async createTables() {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Таблица пользователей
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(50) PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          display_name VARCHAR(100) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          avatar TEXT,
          description TEXT,
          coins INTEGER DEFAULT 1000,
          verified BOOLEAN DEFAULT FALSE,
          is_developer BOOLEAN DEFAULT FALSE,
          is_admin BOOLEAN DEFAULT FALSE,
          status VARCHAR(20) DEFAULT 'offline',
          last_seen TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW(),
          is_protected BOOLEAN DEFAULT FALSE,
          friends_count INTEGER DEFAULT 0,
          posts_count INTEGER DEFAULT 0,
          gifts_count INTEGER DEFAULT 0,
          banned BOOLEAN DEFAULT FALSE
        )
      `);

      // Таблица сообщений
      await client.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id VARCHAR(50) PRIMARY KEY,
          sender_id VARCHAR(50) REFERENCES users(id),
          to_user_id VARCHAR(50) REFERENCES users(id),
          text TEXT,
          encrypted BOOLEAN DEFAULT FALSE,
          type VARCHAR(20) DEFAULT 'text',
          image TEXT,
          file TEXT,
          file_name VARCHAR(255),
          file_type VARCHAR(50),
          timestamp TIMESTAMP DEFAULT NOW(),
          display_name VARCHAR(100),
          read BOOLEAN DEFAULT FALSE,
          edited BOOLEAN DEFAULT FALSE,
          edited_at TIMESTAMP,
          edit_history JSONB
        )
      `);

      // Таблица постов
      await client.query(`
        CREATE TABLE IF NOT EXISTS posts (
          id VARCHAR(50) PRIMARY KEY,
          user_id VARCHAR(50) REFERENCES users(id),
          text TEXT,
          image TEXT,
          file TEXT,
          file_name VARCHAR(255),
          file_type VARCHAR(50),
          likes TEXT[], -- Массив ID пользователей
          comments JSONB,
          views INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Таблица музыки
      await client.query(`
        CREATE TABLE IF NOT EXISTS music (
          id VARCHAR(50) PRIMARY KEY,
          user_id VARCHAR(50) REFERENCES users(id),
          title VARCHAR(255) NOT NULL,
          artist VARCHAR(255) NOT NULL,
          genre VARCHAR(100),
          file_url TEXT NOT NULL,
          cover_url TEXT,
          duration INTEGER DEFAULT 0,
          plays INTEGER DEFAULT 0,
          likes TEXT[],
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Таблица плейлистов
      await client.query(`
        CREATE TABLE IF NOT EXISTS playlists (
          id VARCHAR(50) PRIMARY KEY,
          user_id VARCHAR(50) REFERENCES users(id),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          tracks TEXT[], -- Массив ID треков
          cover TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Таблица групп
      await client.query(`
        CREATE TABLE IF NOT EXISTS groups (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          avatar TEXT,
          owner_id VARCHAR(50) REFERENCES users(id),
          members TEXT[], -- Массив ID участников
          admins TEXT[], -- Массив ID администраторов
          created_at TIMESTAMP DEFAULT NOW(),
          is_public BOOLEAN DEFAULT FALSE
        )
      `);

      // Таблица подарков
      await client.query(`
        CREATE TABLE IF NOT EXISTS gifts (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50) DEFAULT 'custom',
          preview VARCHAR(10),
          price INTEGER NOT NULL,
          image TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Таблица промокодов
      await client.query(`
        CREATE TABLE IF NOT EXISTS promo_codes (
          id VARCHAR(50) PRIMARY KEY,
          code VARCHAR(100) UNIQUE NOT NULL,
          coins INTEGER NOT NULL,
          max_uses INTEGER DEFAULT 0,
          used_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Таблица устройств
      await client.query(`
        CREATE TABLE IF NOT EXISTS devices (
          id VARCHAR(100) PRIMARY KEY,
          user_id VARCHAR(50) REFERENCES users(id),
          name VARCHAR(255),
          browser VARCHAR(100),
          os VARCHAR(100),
          ip VARCHAR(100),
          user_agent TEXT,
          last_active TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW(),
          is_owner BOOLEAN DEFAULT FALSE
        )
      `);

      // Таблица забаненных IP
      await client.query(`
        CREATE TABLE IF NOT EXISTS banned_ips (
          ip VARCHAR(100) PRIMARY KEY,
          banned_at TIMESTAMP DEFAULT NOW(),
          expires TIMESTAMP
        )
      `);

      // Таблица сессий
      await client.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          token VARCHAR(100) PRIMARY KEY,
          user_id VARCHAR(50) REFERENCES users(id),
          expires TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          last_active TIMESTAMP DEFAULT NOW()
        )
      `);

      await client.query('COMMIT');
      console.log('✅ Все таблицы созданы успешно');

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Ошибка создания таблиц:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // 🔐 МЕТОДЫ ДЛЯ РАБОТЫ С ПОЛЬЗОВАТЕЛЯМИ

  async getUserById(id) {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async getUserByUsername(username) {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    return result.rows[0] || null;
  }

  async getUserByEmail(email) {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  async createUser(userData) {
    const {
      id, username, displayName, email, password, avatar, description,
      coins, verified, isDeveloper, isAdmin, status
    } = userData;

    const result = await this.pool.query(
      `INSERT INTO users (
        id, username, display_name, email, password, avatar, description,
        coins, verified, is_developer, is_admin, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        id, username, displayName, email, password, avatar, description,
        coins, verified, isDeveloper, isAdmin, status
      ]
    );
    return result.rows[0];
  }

  async updateUser(id, updates) {
    const setClause = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        // Конвертируем camelCase в snake_case для БД
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        setClause.push(`${dbKey} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (setClause.length === 0) return null;

    values.push(id);
    const query = `UPDATE users SET ${setClause.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    
    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async getAllUsers(excludeUserId = null) {
    let query = 'SELECT * FROM users';
    const values = [];

    if (excludeUserId) {
      query += ' WHERE id != $1';
      values.push(excludeUserId);
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  async deleteUser(id) {
    await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
  }

  // 🔐 МЕТОДЫ ДЛЯ РАБОТЫ С СООБЩЕНИЯМИ

  async createMessage(messageData) {
    const {
      id, senderId, toUserId, text, encrypted, type,
      image, file, fileName, fileType, displayName
    } = messageData;

    const result = await this.pool.query(
      `INSERT INTO messages (
        id, sender_id, to_user_id, text, encrypted, type,
        image, file, file_name, file_type, display_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        id, senderId, toUserId, text, encrypted, type,
        image, file, fileName, fileType, displayName
      ]
    );
    return result.rows[0];
  }

  async getMessagesBetweenUsers(userId1, userId2) {
    const result = await this.pool.query(
      `SELECT * FROM messages 
       WHERE (sender_id = $1 AND to_user_id = $2) 
          OR (sender_id = $2 AND to_user_id = $1)
       ORDER BY timestamp ASC`,
      [userId1, userId2]
    );
    return result.rows;
  }

  async updateMessage(id, updates) {
    const setClause = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        setClause.push(`${dbKey} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (setClause.length === 0) return null;

    values.push(id);
    const query = `UPDATE messages SET ${setClause.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    
    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async deleteMessage(id) {
    await this.pool.query('DELETE FROM messages WHERE id = $1', [id]);
  }

  async getUnreadCount(userId, otherUserId) {
    const result = await this.pool.query(
      `SELECT COUNT(*) FROM messages 
       WHERE sender_id = $1 AND to_user_id = $2 AND read = FALSE`,
      [otherUserId, userId]
    );
    return parseInt(result.rows[0].count);
  }

  async markMessagesAsRead(fromUserId, toUserId) {
    await this.pool.query(
      `UPDATE messages SET read = TRUE 
       WHERE sender_id = $1 AND to_user_id = $2 AND read = FALSE`,
      [fromUserId, toUserId]
    );
  }

  // 🔐 МЕТОДЫ ДЛЯ РАБОТЫ С СЕССИЯМИ

  async createSession(token, userId, expires) {
    await this.pool.query(
      'INSERT INTO sessions (token, user_id, expires) VALUES ($1, $2, $3)',
      [token, userId, new Date(expires)]
    );
  }

  async getSession(token) {
    const result = await this.pool.query(
      'SELECT * FROM sessions WHERE token = $1 AND expires > NOW()',
      [token]
    );
    return result.rows[0] || null;
  }

  async updateSessionActivity(token) {
    await this.pool.query(
      'UPDATE sessions SET last_active = NOW() WHERE token = $1',
      [token]
    );
  }

  async deleteSession(token) {
    await this.pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  }

  async cleanupExpiredSessions() {
    await this.pool.query('DELETE FROM sessions WHERE expires < NOW()');
  }

  // 🔐 МЕТОДЫ ДЛЯ РАБОТЫ С БАНАМИ

  async banIP(ip, duration = 30 * 24 * 60 * 60 * 1000) {
    const expires = new Date(Date.now() + duration);
    await this.pool.query(
      `INSERT INTO banned_ips (ip, expires) 
       VALUES ($1, $2) 
       ON CONFLICT (ip) 
       DO UPDATE SET expires = $2`,
      [ip, expires]
    );
  }

  async isIPBanned(ip) {
    const result = await this.pool.query(
      'SELECT * FROM banned_ips WHERE ip = $1 AND (expires IS NULL OR expires > NOW())',
      [ip]
    );
    return result.rows.length > 0;
  }

  async unbanIP(ip) {
    await this.pool.query('DELETE FROM banned_ips WHERE ip = $1', [ip]);
  }

  // 🔐 МЕТОДЫ ДЛЯ РАБОТЫ С МУЗЫКОЙ

  async createMusicTrack(trackData) {
    const {
      id, userId, title, artist, genre, fileUrl, coverUrl, duration
    } = trackData;

    const result = await this.pool.query(
      `INSERT INTO music (
        id, user_id, title, artist, genre, file_url, cover_url, duration
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [id, userId, title, artist, genre, fileUrl, coverUrl, duration]
    );
    return result.rows[0];
  }

  async getAllMusic() {
    const result = await this.pool.query(`
      SELECT m.*, u.display_name as user_name, u.avatar as user_avatar, u.verified as user_verified
      FROM music m
      LEFT JOIN users u ON m.user_id = u.id
      ORDER BY m.created_at DESC
    `);
    return result.rows;
  }

  async searchMusic(searchTerm) {
    const result = await this.pool.query(`
      SELECT m.*, u.display_name as user_name, u.avatar as user_avatar, u.verified as user_verified
      FROM music m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE LOWER(m.title) LIKE LOWER($1) OR LOWER(m.artist) LIKE LOWER($1) OR LOWER(m.genre) LIKE LOWER($1)
      ORDER BY m.created_at DESC
    `, [`%${searchTerm}%`]);
    return result.rows;
  }

  async getRandomMusic(limit = 10) {
    const result = await this.pool.query(`
      SELECT m.*, u.display_name as user_name, u.avatar as user_avatar, u.verified as user_verified
      FROM music m
      LEFT JOIN users u ON m.user_id = u.id
      ORDER BY RANDOM()
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  async deleteMusicTrack(id) {
    await this.pool.query('DELETE FROM music WHERE id = $1', [id]);
  }

  // 🔐 МЕТОДЫ ДЛЯ РАБОТЫ С ПОСТАМИ

  async createPost(postData) {
    const {
      id, userId, text, image, file, fileName, fileType
    } = postData;

    const result = await this.pool.query(
      `INSERT INTO posts (
        id, user_id, text, image, file, file_name, file_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [id, userId, text, image, file, fileName, fileType]
    );
    return result.rows[0];
  }

  async getAllPosts() {
    const result = await this.pool.query(`
      SELECT p.*, u.display_name as user_name, u.avatar as user_avatar, 
             u.verified as user_verified, u.is_developer as user_developer
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `);
    return result.rows;
  }

  async updatePostLikes(postId, likes) {
    await this.pool.query(
      'UPDATE posts SET likes = $1 WHERE id = $2',
      [likes, postId]
    );
  }

  async deletePost(id) {
    await this.pool.query('DELETE FROM posts WHERE id = $1', [id]);
  }

  // 🔐 МЕТОДЫ ДЛЯ РАБОТЫ С ПОДАРКАМИ

  async getAllGifts() {
    const result = await this.pool.query('SELECT * FROM gifts ORDER BY created_at DESC');
    return result.rows;
  }

  async createGift(giftData) {
    const { id, name, type, preview, price, image } = giftData;
    const result = await this.pool.query(
      'INSERT INTO gifts (id, name, type, preview, price, image) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [id, name, type, preview, price, image]
    );
    return result.rows[0];
  }

  async getGiftById(id) {
    const result = await this.pool.query('SELECT * FROM gifts WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  // 🔐 МЕТОДЫ ДЛЯ РАБОТЫ С ПРОМОКОДАМИ

  async getAllPromoCodes() {
    const result = await this.pool.query('SELECT * FROM promo_codes ORDER BY created_at DESC');
    return result.rows;
  }

  async getPromoCodeByCode(code) {
    const result = await this.pool.query('SELECT * FROM promo_codes WHERE code = $1', [code]);
    return result.rows[0] || null;
  }

  async createPromoCode(promoData) {
    const { id, code, coins, max_uses } = promoData;
    const result = await this.pool.query(
      'INSERT INTO promo_codes (id, code, coins, max_uses) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, code, coins, max_uses]
    );
    return result.rows[0];
  }

  async updatePromoCodeUsage(code) {
    await this.pool.query(
      'UPDATE promo_codes SET used_count = used_count + 1 WHERE code = $1',
      [code]
    );
  }

  // 🔐 МЕТОДЫ ДЛЯ РАБОТЫ С УСТРОЙСТВАМИ

  async createDevice(deviceData) {
    const { id, userId, name, browser, os, ip, userAgent, isOwner } = deviceData;
    const result = await this.pool.query(
      `INSERT INTO devices (id, user_id, name, browser, os, ip, user_agent, is_owner) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, userId, name, browser, os, ip, userAgent, isOwner]
    );
    return result.rows[0];
  }

  async getUserDevices(userId) {
    const result = await this.pool.query(
      'SELECT * FROM devices WHERE user_id = $1 ORDER BY last_active DESC',
      [userId]
    );
    return result.rows;
  }

  async updateDeviceActivity(deviceId) {
    await this.pool.query(
      'UPDATE devices SET last_active = NOW() WHERE id = $1',
      [deviceId]
    );
  }

  async deleteDevice(deviceId) {
    await this.pool.query('DELETE FROM devices WHERE id = $1', [deviceId]);
  }

  // 🔐 МЕТОДЫ ДЛЯ РАБОТЫ С ГРУППАМИ

  async createGroup(groupData) {
    const { id, name, description, avatar, ownerId, members, admins, isPublic } = groupData;
    const result = await this.pool.query(
      `INSERT INTO groups (id, name, description, avatar, owner_id, members, admins, is_public) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, name, description, avatar, ownerId, members, admins, isPublic]
    );
    return result.rows[0];
  }

  async getUserGroups(userId) {
    const result = await this.pool.query(
      'SELECT * FROM groups WHERE $1 = ANY(members) ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async updateGroupMembers(groupId, members) {
    await this.pool.query(
      'UPDATE groups SET members = $1 WHERE id = $2',
      [members, groupId]
    );
  }

  // 🔐 МЕТОДЫ ДЛЯ РАБОТЫ С ПЛЕЙЛИСТАМИ

  async createPlaylist(playlistData) {
    const { id, userId, name, description, tracks, cover } = playlistData;
    const result = await this.pool.query(
      `INSERT INTO playlists (id, user_id, name, description, tracks, cover) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, userId, name, description, tracks, cover]
    );
    return result.rows[0];
  }

  async getUserPlaylists(userId) {
    const result = await this.pool.query(
      'SELECT * FROM playlists WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async updatePlaylistTracks(playlistId, tracks) {
    await this.pool.query(
      'UPDATE playlists SET tracks = $1 WHERE id = $2',
      [tracks, playlistId]
    );
  }

  // 🔐 СТАТИСТИКА

  async getStats() {
    const usersCount = await this.pool.query('SELECT COUNT(*) FROM users');
    const messagesCount = await this.pool.query('SELECT COUNT(*) FROM messages');
    const postsCount = await this.pool.query('SELECT COUNT(*) FROM posts');
    const musicCount = await this.pool.query('SELECT COUNT(*) FROM music');
    const groupsCount = await this.pool.query('SELECT COUNT(*) FROM groups');
    const onlineUsers = await this.pool.query("SELECT COUNT(*) FROM users WHERE status = 'online'");
    const bannedUsers = await this.pool.query('SELECT COUNT(*) FROM users WHERE banned = TRUE');
    const bannedIPs = await this.pool.query('SELECT COUNT(*) FROM banned_ips');
    const activeDevices = await this.pool.query('SELECT COUNT(*) FROM devices');

    return {
      totalUsers: parseInt(usersCount.rows[0].count),
      totalMessages: parseInt(messagesCount.rows[0].count),
      totalPosts: parseInt(postsCount.rows[0].count),
      totalMusic: parseInt(musicCount.rows[0].count),
      totalGroups: parseInt(groupsCount.rows[0].count),
      onlineUsers: parseInt(onlineUsers.rows[0].count),
      bannedUsers: parseInt(bannedUsers.rows[0].count),
      bannedIPs: parseInt(bannedIPs.rows[0].count),
      activeDevices: parseInt(activeDevices.rows[0].count)
    };
  }
}

class WebSocketServer {
    constructor(server) {
        this.server = server;
        this.clients = new Map();
        
        server.on('upgrade', (req, socket, head) => {
            this.handleUpgrade(req, socket, head);
        });
    }

    handleUpgrade(req, socket, head) {
        const key = req.headers['sec-websocket-key'];
        const accept = this.generateAccept(key);
        
        const responseHeaders = [
            'HTTP/1.1 101 Web Socket Protocol Handshake',
            'Upgrade: WebSocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${accept}`
        ];

        socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');
        
        const clientId = this.generateId();
        const client = {
            id: clientId,
            socket: socket,
            rooms: new Set()
        };
        
        this.clients.set(clientId, client);
        
        socket.on('data', (data) => {
            this.handleMessage(clientId, data);
        });
        
        socket.on('close', () => {
            this.clients.delete(clientId);
            this.broadcast('user_offline', { userId: clientId });
        });
        
        socket.on('error', () => {
            this.clients.delete(clientId);
        });

        this.sendToClient(clientId, 'connected', { clientId });
    }

    generateAccept(key) {
        const sha1 = crypto.createHash('sha1');
        sha1.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
        return sha1.digest('base64');
    }

    generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    handleMessage(clientId, data) {
        try {
            const message = this.decodeMessage(data);
            if (message && message.type && message.data) {
                this.broadcast(message.type, message.data, clientId);
            }
        } catch (error) {
            console.log('Error decoding message:', error);
        }
    }

    decodeMessage(buffer) {
        const firstByte = buffer.readUInt8(0);
        const secondByte = buffer.readUInt8(1);
        
        const isFinalFrame = Boolean(firstByte & 0x80);
        const opcode = firstByte & 0x0F;
        
        let payloadLength = secondByte & 0x7F;
        let maskStart = 2;
        
        if (payloadLength === 126) {
            payloadLength = buffer.readUInt16BE(2);
            maskStart = 4;
        } else if (payloadLength === 127) {
            payloadLength = Number(buffer.readBigUInt64BE(2));
            maskStart = 10;
        }
        
        const masks = buffer.slice(maskStart, maskStart + 4);
        const payload = buffer.slice(maskStart + 4, maskStart + 4 + payloadLength);
        
        const decoded = Buffer.alloc(payloadLength);
        for (let i = 0; i < payloadLength; i++) {
            decoded[i] = payload[i] ^ masks[i % 4];
        }
        
        return JSON.parse(decoded.toString());
    }

    encodeMessage(data) {
        const json = JSON.stringify(data);
        const jsonBuffer = Buffer.from(json);
        
        const length = jsonBuffer.length;
        let payloadLengthByte;
        let lengthBytes;
        
        if (length <= 125) {
            payloadLengthByte = length;
            lengthBytes = Buffer.alloc(0);
        } else if (length <= 65535) {
            payloadLengthByte = 126;
            lengthBytes = Buffer.alloc(2);
            lengthBytes.writeUInt16BE(length);
        } else {
            payloadLengthByte = 127;
            lengthBytes = Buffer.alloc(8);
            lengthBytes.writeBigUInt64BE(BigInt(length));
        }
        
        const header = Buffer.concat([
            Buffer.from([0x81, payloadLengthByte]),
            lengthBytes
        ]);
        
        return Buffer.concat([header, jsonBuffer]);
    }

    sendToClient(clientId, type, data) {
        const client = this.clients.get(clientId);
        if (client && client.socket) {
            try {
                const message = this.encodeMessage({ type, data });
                client.socket.write(message);
            } catch (error) {
                console.log('Error sending to client:', error);
            }
        }
    }

    broadcast(type, data, excludeClientId = null) {
        for (const [clientId, client] of this.clients) {
            if (clientId !== excludeClientId) {
                this.sendToClient(clientId, type, data);
            }
        }
    }
}

class SimpleServer {
    constructor() {
        this.db = new DatabaseManager();
        this.encryptionKey = crypto.randomBytes(32);
        
        // Система сессий
        this.sessions = new Map();
        
        this.ensureUploadDirs();
        this.initializeDefaultData();
        
        // Очистка старых сессий каждые 5 минут
        setInterval(() => this.cleanupSessions(), 5 * 60 * 1000);
    }

    // 🔐 СИСТЕМА БЕЗОПАСНОСТИ

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
    async createSession(userId) {
        const sessionId = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 часа
        
        await this.db.createSession(sessionId, userId, expires);
        
        return sessionId;
    }

    async validateSession(token) {
        const session = await this.db.getSession(token);
        if (!session) {
            return null;
        }
        
        // Обновляем время активности
        await this.db.updateSessionActivity(token);
        return session;
    }

    async cleanupSessions() {
        await this.db.cleanupExpiredSessions();
    }

    // Проверка прав администратора
    isAdmin(user) {
        return user && user.is_developer && user.is_admin;
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
        const logEntry = `🔐 SECURITY: ${timestamp} | User: ${user.id} (${user.username}) | Action: ${action} | Target: ${target} | ${success ? 'SUCCESS' : 'FAILED'}\n`;
        
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

    // 🔚 КОНЕЦ СИСТЕМЫ БЕЗОПАСНОСТИ

    async initializeDefaultData() {
        try {
            // Проверяем, есть ли уже подарки
            const gifts = await this.db.getAllGifts();
            if (gifts.length === 0) {
                await this.createDefaultGifts();
            }

            // Проверяем, есть ли уже промокоды
            const promoCodes = await this.db.getAllPromoCodes();
            if (promoCodes.length === 0) {
                await this.createDefaultPromoCodes();
            }

            // Проверяем, есть ли системный пост
            const posts = await this.db.getAllPosts();
            const systemPost = posts.find(post => post.user_id === 'system');
            if (!systemPost) {
                await this.createSystemPost();
            }

            console.log('✅ Данные по умолчанию инициализированы');
        } catch (error) {
            console.error('❌ Ошибка инициализации данных:', error);
        }
    }

    async createDefaultGifts() {
        const defaultGifts = [
            {
                id: this.generateId(),
                name: 'Золотая корона',
                type: 'crown',
                preview: '👑',
                price: 500,
                image: null
            },
            {
                id: this.generateId(),
                name: 'Сердечко',
                type: 'heart',
                preview: '❤️',
                price: 100,
                image: null
            },
            {
                id: this.generateId(),
                name: 'Звезда',
                type: 'star',
                preview: '⭐',
                price: 200,
                image: null
            }
        ];

        for (const gift of defaultGifts) {
            await this.db.createGift(gift);
        }
    }

    async createDefaultPromoCodes() {
        const defaultPromoCodes = [
            {
                id: this.generateId(),
                code: 'WELCOME1000',
                coins: 1000,
                max_uses: 0,
                used_count: 0
            }
        ];

        for (const promo of defaultPromoCodes) {
            await this.db.createPromoCode(promo);
        }
    }

    async createSystemPost() {
        const systemPost = {
            id: this.generateId(),
            userId: 'system',
            text: 'Добро пожаловать в Epic Messenger! 🚀',
            image: null,
            file: null,
            fileName: null,
            fileType: null
        };

        await this.db.createPost(systemPost);
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
            const fullPath = path.join(__dirname, dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
                console.log('✅ Создана папка:', fullPath);
            }
        });
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

    validateFileType(filename, fileType) {
        switch (fileType) {
            case 'image': return this.validateImageFile(filename);
            case 'video': return this.validateVideoFile(filename);
            case 'audio': return this.validateAudioFile(filename);
            default: return false;
        }
    }

    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    decrypt(encryptedText) {
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    getClientIP(req) {
        return req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               (req.connection.socket ? req.connection.socket.remoteAddress : null);
    }

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
        
        return {
            browser,
            os,
            userAgent
        };
    }

    generateDeviceId(req) {
        const ip = this.getClientIP(req);
        const deviceInfo = this.getDeviceInfo(req);
        const deviceString = `${ip}-${deviceInfo.browser}-${deviceInfo.os}`;
        return crypto.createHash('md5').update(deviceString).digest('hex');
    }

    async isIPBanned(ip) {
        return await this.db.isIPBanned(ip);
    }

    async banIP(ip, duration = 30 * 24 * 60 * 60 * 1000) {
        await this.db.banIP(ip, duration);
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

    async saveFile(fileData, filename, type) {
        return new Promise((resolve, reject) => {
            try {
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

                const filePath = path.join(__dirname, 'public', uploadDir, filename);
                
                let buffer;
                if (fileData.startsWith('data:')) {
                    const base64Data = fileData.split(',')[1];
                    buffer = Buffer.from(base64Data, 'base64');
                } else {
                    buffer = Buffer.from(fileData, 'base64');
                }

                const dirPath = path.dirname(filePath);
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                }

                fs.writeFile(filePath, buffer, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(`/${uploadDir}/${filename}`);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    deleteFile(fileUrl) {
        if (!fileUrl || !fileUrl.startsWith('/uploads/')) return;
        
        const filePath = path.join(__dirname, 'public', fileUrl.substring(1));
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    // 🔐 ОБНОВЛЕННАЯ АУТЕНТИФИКАЦИЯ
    async authenticateToken(token) {
        const session = await this.validateSession(token);
        if (!session) return null;
        
        return await this.db.getUserById(session.user_id);
    }

    async registerDevice(userId, req) {
        const deviceId = this.generateDeviceId(req);
        const deviceInfo = this.getDeviceInfo(req);
        const ip = this.getClientIP(req);
        
        const userDevices = await this.db.getUserDevices(userId);
        const isOwner = userDevices.length === 0;

        const device = {
            id: deviceId,
            userId: userId,
            name: `${deviceInfo.browser} on ${deviceInfo.os}`,
            browser: deviceInfo.browser,
            os: deviceInfo.os,
            ip: ip,
            userAgent: deviceInfo.userAgent,
            isOwner: isOwner
        };
        
        await this.db.createDevice(device);
        return device;
    }

    async getUserDevices(userId) {
        return await this.db.getUserDevices(userId);
    }

    async terminateDevice(userId, deviceId) {
        const devices = await this.db.getUserDevices(userId);
        const device = devices.find(d => d.id === deviceId);
        
        if (!device) {
            return false;
        }
        
        const isOwner = devices.some(d => d.is_owner);
        const targetDevice = devices.find(d => d.id === deviceId);
        
        if (!targetDevice) return false;
        
        if (targetDevice.is_owner || isOwner) {
            await this.db.deleteDevice(deviceId);
            return true;
        } else {
            const timeDiff = Date.now() - new Date(targetDevice.created_at).getTime();
            if (timeDiff > 24 * 60 * 60 * 1000) {
                await this.db.deleteDevice(deviceId);
                return true;
            }
            return false;
        }
    }

    serveStaticFile(res, filePath, contentType) {
        const fullPath = path.join(__dirname, filePath);
        
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

    handleApiRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        const method = req.method;
        
        console.log(`=== API REQUEST ===`);
        console.log(`Method: ${method}`);
        console.log(`Path: ${pathname}`);
        console.log(`Content-Type: ${req.headers['content-type']}`);
        console.log(`Content-Length: ${req.headers['content-length']}`);
        
        // 🔐 Rate limiting проверка
        const clientIP = this.getClientIP(req);
        if (!this.checkRateLimit(clientIP, pathname)) {
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

        // Для multipart/form-data обрабатываем отдельно
        if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
            if (pathname === '/api/music/upload-full') {
                this.handleUploadMusicFull(req, res);
                return;
            }
        }

        let body = '';
        const decoder = new StringDecoder('utf-8');

        req.on('data', (chunk) => {
            body += decoder.write(chunk);
        });

        req.on('end', async () => {
            body += decoder.end();
            
            if (req.headers['content-type'] && !req.headers['content-type'].includes('multipart/form-data')) {
                console.log(`Raw body:`, body);
                console.log(`Body length: ${body.length}`);
            }
            
            let data = {};
            if (body && body.trim() !== '' && req.headers['content-type'] && !req.headers['content-type'].includes('multipart/form-data')) {
                try {
                    data = JSON.parse(body);
                    console.log(`Parsed data:`, data);
                } catch (e) {
                    console.log(`JSON parse error:`, e.message);
                }
            }

            console.log(`=== END REQUEST ===`);
            
            await this.processApiRequest(pathname, method, data, parsedUrl.query, req, res);
        });
    }

    async processApiRequest(pathname, method, data, query, req, res) {
        console.log(`🔄 Processing API: ${method} ${pathname}`);
        console.log(`📦 Request data:`, data);
        console.log(`❓ Query params:`, query);
        
        const headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Content-Length, Accept, Origin',
            'Access-Control-Allow-Credentials': 'true'
        };

        // 🔐 Устанавливаем безопасные заголовки
        this.setSecurityHeaders(res);

        if (method === 'OPTIONS') {
            res.writeHead(204, headers);
            res.end();
            return;
        }

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

        let response;

        try {
            switch (pathname) {
                case '/api/login':
                    if (method === 'POST') {
                        response = await this.handleLogin(data, req);
                    }
                    break;
                    
                case '/api/register':
                    if (method === 'POST') {
                        response = await this.handleRegister(data, req);
                    }
                    break;
                    
                case '/api/check-auth':
                    if (method === 'GET') {
                        response = await this.handleCheckAuth(token, req);
                    }
                    break;
                    
                case '/api/current-user':
                    if (method === 'GET') {
                        response = await this.handleCurrentUser(token, req);
                    }
                    break;
                    
                case '/api/users':
                    if (method === 'GET') {
                        response = await this.handleGetUsers(token);
                    }
                    break;

                case '/api/chats':
                    if (method === 'GET') {
                        response = await this.handleGetChats(token);
                    }
                    break;
                    
                case '/api/messages':
                    if (method === 'GET') {
                        response = await this.handleGetMessages(token, query);
                    }
                    break;
                    
                case '/api/messages/send':
                    if (method === 'POST') {
                        response = await this.handleSendMessage(token, data);
                    }
                    break;

                case '/api/messages/edit':
                    if (method === 'POST') {
                        response = await this.handleEditMessage(token, data);
                    }
                    break;
                    
                case '/api/messages/delete':
                    if (method === 'POST') {
                        response = await this.handleDeleteMessage(token, data);
                    }
                    break;

                case '/api/messages/mark-read':
                    if (method === 'POST') {
                        response = await this.handleMarkAsRead(token, data);
                    }
                    break;
                    
                case '/api/posts':
                    if (method === 'GET') {
                        response = await this.handleGetPosts(token);
                    } else if (method === 'POST') {
                        response = await this.handleCreatePost(token, data);
                    } else if (method === 'DELETE') {
                        response = await this.handleDeletePost(token, query);
                    }
                    break;
                    
                case '/api/gifts':
                    if (method === 'GET') {
                        response = await this.handleGetGifts(token);
                    } else if (method === 'POST') {
                        response = await this.handleCreateGift(token, data);
                    }
                    break;
                    
                case '/api/promo-codes':
                    if (method === 'GET') {
                        response = await this.handleGetPromoCodes(token);
                    }
                    break;
                    
                case '/api/promo-codes/create':
                    if (method === 'POST') {
                        response = await this.handleCreatePromoCode(token, data);
                    }
                    break;
                    
                case '/api/promo-codes/activate':
                    if (method === 'POST') {
                        response = await this.handleActivatePromoCode(token, data);
                    }
                    break;
                    
                case '/api/update-profile':
                    if (method === 'POST') {
                        response = await this.handleUpdateProfile(token, data);
                    }
                    break;

                case '/api/update-avatar':
                    if (method === 'POST') {
                        response = await this.handleUpdateAvatar(token, data);
                    }
                    break;

                case '/api/upload-avatar':
                    if (method === 'POST') {
                        response = await this.handleUploadAvatar(token, data);
                    }
                    break;

                case '/api/upload-gift':
                    if (method === 'POST') {
                        response = await this.handleUploadGift(token, data);
                    }
                    break;

                case '/api/upload-post-image':
                    if (method === 'POST') {
                        response = await this.handleUploadPostImage(token, data);
                    }
                    break;

                case '/api/upload-file':
                    if (method === 'POST') {
                        response = await this.handleUploadFile(token, data);
                    }
                    break;

                case '/api/admin/stats':
                    if (method === 'GET') {
                        response = await this.handleAdminStats(token);
                    }
                    break;

                case '/api/admin/delete-user':
                    if (method === 'POST') {
                        response = await this.handleDeleteUser(token, data);
                    }
                    break;

                case '/api/admin/ban-user':
                    if (method === 'POST') {
                        response = await this.handleBanUser(token, data);
                    }
                    break;

                case '/api/admin/toggle-verification':
                    if (method === 'POST') {
                        response = await this.handleToggleVerification(token, data);
                    }
                    break;

                case '/api/admin/toggle-developer':
                    if (method === 'POST') {
                        response = await this.handleToggleDeveloper(token, data);
                    }
                    break;

                case '/api/emoji':
                    if (method === 'GET') {
                        response = await this.handleGetEmoji(token);
                    }
                    break;

                case '/api/devices':
                    if (method === 'GET') {
                        response = await this.handleGetDevices(token);
                    }
                    break;

                case '/api/devices/terminate':
                    if (method === 'POST') {
                        response = await this.handleTerminateDevice(token, data);
                    }
                    break;

                case '/api/user-by-username':
                    if (method === 'POST') {
                        response = await this.handleGetUserByUsername(token, data);
                    }
                    break;

                case '/api/my-gifts':
                    if (method === 'GET') {
                        response = await this.handleGetMyGifts(token);
                    }
                    break;

                // API для групп
                case '/api/groups':
                    if (method === 'GET') {
                        response = await this.handleGetUserGroups(token);
                    } else if (method === 'POST') {
                        response = await this.handleCreateGroup(token, data);
                    }
                    break;

                case '/api/groups/add-member':
                    if (method === 'POST') {
                        response = await this.handleAddToGroup(token, data);
                    }
                    break;

                // API для музыки
                case '/api/music/upload-full':
                    if (method === 'POST') {
                        response = { success: false, message: 'Multipart request already processed' };
                    }
                    break;
                    
                case '/api/music':
                    if (method === 'GET') {
                        response = await this.handleGetMusic(token);
                    } else if (method === 'POST') {
                        response = await this.handleUploadMusic(token, data);
                    }
                    break;
                    
                case '/api/music/upload':
                    if (method === 'POST') {
                        response = await this.handleUploadMusicFile(token, data);
                    }
                    break;
                    
                case '/api/music/upload-cover':
                    if (method === 'POST') {
                        response = await this.handleUploadMusicCover(token, data);
                    }
                    break;
                    
                case '/api/music/delete':
                    if (method === 'POST') {
                        response = await this.handleDeleteMusic(token, data);
                    }
                    break;
                    
                case '/api/music/search':
                    if (method === 'GET') {
                        response = await this.handleSearchMusic(token, query);
                    }
                    break;
                    
                case '/api/music/random':
                    if (method === 'GET') {
                        response = await this.handleGetRandomMusic(token);
                    }
                    break;
                    
                case '/api/playlists':
                    if (method === 'GET') {
                        response = await this.handleGetPlaylists(token);
                    } else if (method === 'POST') {
                        response = await this.handleCreatePlaylist(token, data);
                    }
                    break;
                    
                case '/api/playlists/add':
                    if (method === 'POST') {
                        response = await this.handleAddToPlaylist(token, data);
                    }
                    break;
                    
                default:
                    if (pathname.startsWith('/api/posts/') && pathname.endsWith('/like')) {
                        const postId = pathname.split('/')[3];
                        if (method === 'POST') {
                            response = await this.handleLikePost(token, postId);
                        }
                    } else if (pathname.startsWith('/api/gifts/') && pathname.endsWith('/buy')) {
                        const giftId = pathname.split('/')[3];
                        if (method === 'POST') {
                            response = await this.handleBuyGift(token, giftId, data);
                        }
                    } else if (pathname.startsWith('/api/users/')) {
                        const userId = pathname.split('/')[3];
                        if (method === 'GET') {
                            response = await this.handleGetUser(token, userId);
                        }
                    } else if (pathname.startsWith('/api/user/') && pathname.includes('/transactions')) {
                        const userId = pathname.split('/')[3];
                        if (method === 'GET') {
                            response = await this.handleGetTransactions(token, userId);
                        }
                    } else {
                        response = { success: false, message: 'API endpoint not found' };
                    }
            }
        } catch (error) {
            console.error('API Error:', error);
            response = { success: false, message: error.message };
        }

        if (!response) {
            response = { success: false, message: 'Method not allowed' };
        }

        console.log(`📤 Response data:`, response);
        
        res.writeHead(response.success ? 200 : 400, headers);
        res.end(JSON.stringify(response));
    }

    // 🔐 ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ

    sanitizeUserData(user) {
        return {
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            email: user.email,
            avatar: user.avatar,
            description: user.description,
            coins: user.coins,
            verified: user.verified,
            isDeveloper: user.is_developer,
            status: user.status,
            lastSeen: user.last_seen,
            createdAt: user.created_at,
            friendsCount: user.friends_count || 0,
            postsCount: user.posts_count || 0,
            giftsCount: user.gifts_count || 0,
            banned: user.banned || false
        };
    }

    // 🔐 ОБНОВЛЕННЫЕ МЕТОДЫ С ПРОВЕРКОЙ ПРАВ

    async handleUploadFile(token, data) {
        const user = await this.authenticateToken(token);
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
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    async handleGetChats(token) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // Получаем всех пользователей
        const allUsers = await this.db.getAllUsers(user.id);
        const chats = [];

        for (const otherUser of allUsers) {
            // Проверяем есть ли сообщения между пользователями
            const messages = await this.db.getMessagesBetweenUsers(user.id, otherUser.id);
            if (messages.length > 0) {
                const lastMessage = messages[messages.length - 1];
                const unreadCount = await this.db.getUnreadCount(user.id, otherUser.id);
                
                chats.push({
                    ...this.sanitizeUserData(otherUser),
                    lastMessage: lastMessage,
                    unreadCount: unreadCount
                });
            }
        }

        // Сортируем по времени последнего сообщения
        chats.sort((a, b) => {
            const timeA = a.lastMessage ? new Date(a.lastMessage.timestamp) : new Date(0);
            const timeB = b.lastMessage ? new Date(b.lastMessage.timestamp) : new Date(0);
            return timeB - timeA;
        });

        return {
            success: true,
            chats: chats
        };
    }

    async handleMarkAsRead(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { fromUserId } = data;
        
        await this.db.markMessagesAsRead(fromUserId, user.id);
        
        return {
            success: true,
            message: 'Сообщения отмечены как прочитанные'
        };
    }

    // 🔐 МЕТОДЫ ДЛЯ РЕДАКТИРОВАНИЯ И УДАЛЕНИЯ СООБЩЕНИЙ

    async handleEditMessage(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 Проверяем что пользователь не забанен
        if (user.banned) {
            this.logSecurityEvent(user, 'EDIT_MESSAGE', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { messageId, newText } = data;
        
        if (!messageId || !newText || newText.trim() === '') {
            return { success: false, message: 'ID сообщения и новый текст обязательны' };
        }

        // 🔐 Валидация входных данных
        if (!this.validateInput(newText, 'text')) {
            return { success: false, message: 'Некорректный текст сообщения' };
        }

        const message = await this.db.pool.query('SELECT * FROM messages WHERE id = $1', [messageId]);
        if (message.rows.length === 0) {
            return { success: false, message: 'Сообщение не найдено' };
        }

        const messageData = message.rows[0];

        // 🔐 Проверяем права: пользователь может редактировать только свои сообщения
        if (messageData.sender_id !== user.id) {
            this.logSecurityEvent(user, 'EDIT_MESSAGE', `message:${messageId}`, false);
            return { success: false, message: 'Вы можете редактировать только свои сообщения' };
        }

        // Проверяем что сообщение не слишком старое (например, не старше 15 минут)
        const messageAge = Date.now() - new Date(messageData.timestamp).getTime();
        const maxEditTime = 15 * 60 * 1000; // 15 минут
        
        if (messageAge > maxEditTime) {
            return { success: false, message: 'Сообщение можно редактировать только в течение 15 минут после отправки' };
        }

        const sanitizedText = this.sanitizeContent(newText.trim());
        if (sanitizedText.length === 0) {
            return { success: false, message: 'Текст сообщения содержит запрещенный контент' };
        }

        // Сохраняем оригинальный текст для истории
        let editHistory = messageData.edit_history || [];
        editHistory.push({
            oldText: messageData.encrypted ? this.decrypt(messageData.text) : messageData.text,
            editedAt: new Date(),
            editedBy: user.id
        });

        // Обновляем сообщение
        const updatedMessage = await this.db.updateMessage(messageId, {
            text: this.encrypt(sanitizedText),
            edited: true,
            edited_at: new Date(),
            edit_history: editHistory
        });

        this.logSecurityEvent(user, 'EDIT_MESSAGE', `message:${messageId}, chars:${sanitizedText.length}`);

        console.log(`✏️ Пользователь ${user.display_name} отредактировал сообщение: ${messageId}`);

        return {
            success: true,
            message: {
                ...updatedMessage,
                text: sanitizedText
            }
        };
    }

    async handleDeleteMessage(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { messageId } = data;
        
        if (!messageId) {
            return { success: false, message: 'ID сообщения обязателен' };
        }

        const message = await this.db.pool.query('SELECT * FROM messages WHERE id = $1', [messageId]);
        if (message.rows.length === 0) {
            return { success: false, message: 'Сообщение не найдено' };
        }

        const messageData = message.rows[0];
        
        // 🔐 Проверяем права: пользователь может удалять только свои сообщения (или админ)
        if (messageData.sender_id !== user.id && !this.isAdmin(user)) {
            this.logSecurityEvent(user, 'DELETE_MESSAGE', `message:${messageId}`, false);
            return { success: false, message: 'Вы можете удалять только свои сообщения' };
        }

        // Проверяем что сообщение не слишком старое для обычных пользователей
        if (messageData.sender_id === user.id && !this.isAdmin(user)) {
            const messageAge = Date.now() - new Date(messageData.timestamp).getTime();
            const maxDeleteTime = 15 * 60 * 1000; // 15 минут
            
            if (messageAge > maxDeleteTime) {
                return { success: false, message: 'Сообщение можно удалить только в течение 15 минут после отправки' };
            }
        }

        // Удаляем сообщение
        await this.db.deleteMessage(messageId);

        this.logSecurityEvent(user, 'DELETE_MESSAGE', `message:${messageId}`);

        console.log(`🗑️ Пользователь ${user.display_name} удалил сообщение: ${messageId}`);

        return {
            success: true,
            message: 'Сообщение успешно удалено'
        };
    }

    async handleGetUserByUsername(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { username } = data;
        
        // 🔐 Валидация входных данных
        if (!this.validateInput(username, 'username')) {
            return { success: false, message: 'Некорректное имя пользователя' };
        }

        const targetUser = await this.db.getUserByUsername(username);
        
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        // Получаем подарки пользователя
        const userGifts = await this.db.pool.query(
            "SELECT * FROM messages WHERE type = 'gift' AND to_user_id = $1 ORDER BY timestamp DESC",
            [targetUser.id]
        );

        // Получаем посты пользователя
        const userPosts = await this.db.pool.query(
            'SELECT * FROM posts WHERE user_id = $1 ORDER BY created_at DESC',
            [targetUser.id]
        );

        return {
            success: true,
            user: this.sanitizeUserData(targetUser),
            gifts: userGifts.rows,
            posts: userPosts.rows
        };
    }

    async handleGetMyGifts(token) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // Получаем подарки, которые подарили текущему пользователю
        const myGifts = await this.db.pool.query(
            "SELECT * FROM messages WHERE type = 'gift' AND to_user_id = $1 ORDER BY timestamp DESC",
            [user.id]
        );

        return {
            success: true,
            gifts: myGifts.rows
        };
    }

    // Методы для групп
    async handleCreateGroup(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { name, description, avatar } = data;
        
        if (!name || name.trim() === '') {
            return { success: false, message: 'Название группы обязательно' };
        }

        // 🔐 Валидация входных данных
        if (!this.validateInput(name, 'displayName')) {
            return { success: false, message: 'Некорректное название группы' };
        }

        const group = {
            id: this.generateId(),
            name: this.sanitizeContent(name.trim()),
            description: description ? this.sanitizeContent(description) : '',
            avatar: avatar || null,
            ownerId: user.id,
            members: [user.id],
            admins: [user.id],
            isPublic: false
        };

        await this.db.createGroup(group);

        console.log(`👥 Создана группа: ${group.name}`);

        return {
            success: true,
            group: group
        };
    }

    async handleGetUserGroups(token) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const userGroups = await this.db.getUserGroups(user.id);

        return {
            success: true,
            groups: userGroups
        };
    }

    async handleAddToGroup(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { groupId, userId } = data;
        
        const group = await this.db.pool.query('SELECT * FROM groups WHERE id = $1', [groupId]);
        if (group.rows.length === 0) {
            return { success: false, message: 'Группа не найдена' };
        }

        const groupData = group.rows[0];

        // 🔐 Проверяем права - только админы группы могут добавлять
        if (!groupData.admins.includes(user.id)) {
            this.logSecurityEvent(user, 'ADD_TO_GROUP', `group:${groupId}`, false);
            return { success: false, message: 'Недостаточно прав' };
        }

        const targetUser = await this.db.getUserById(userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        if (groupData.members.includes(userId)) {
            return { success: false, message: 'Пользователь уже в группе' };
        }

        const updatedMembers = [...groupData.members, userId];
        await this.db.updateGroupMembers(groupId, updatedMembers);

        this.logSecurityEvent(user, 'ADD_TO_GROUP', `group:${groupId}, user:${userId}`);

        return {
            success: true,
            message: 'Пользователь добавлен в группу'
        };
    }

    // 🔐 ОБНОВЛЕННЫЕ МЕТОДЫ С ПРОВЕРКОЙ ПРАВ ДОСТУПА

    async handleGetUser(token, userId) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 ПРОВЕРКА ПРАВ: пользователь может получать только СВОИ данные
        if (user.id !== userId && !this.isFriend(user.id, userId)) {
            this.logSecurityEvent(user, 'GET_USER', `user:${userId}`, false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const targetUser = await this.db.getUserById(userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        this.logSecurityEvent(user, 'GET_USER', `user:${userId}`);

        return {
            success: true,
            user: this.sanitizeUserData(targetUser)
        };
    }

    async handleGetMessages(token, query) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId, toUserId } = query;

        // 🔐 ПРОВЕРКА ПРАВ: пользователь может читать только СВОИ сообщения
        if (user.id !== userId && user.id !== toUserId) {
            this.logSecurityEvent(user, 'GET_MESSAGES', `chat:${userId}-${toUserId}`, false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const chatMessages = await this.db.getMessagesBetweenUsers(userId, toUserId);

        const decryptedMessages = chatMessages.map(msg => ({
            ...msg,
            text: msg.encrypted ? this.decrypt(msg.text) : msg.text
        }));

        this.logSecurityEvent(user, 'GET_MESSAGES', `chat:${userId}-${toUserId}`);

        return {
            success: true,
            messages: decryptedMessages
        };
    }

    // 🔐 ОБНОВЛЕННЫЕ АДМИНИСТРАТИВНЫЕ МЕТОДЫ

    async handleDeleteUser(token, data) {
        const user = await this.authenticateToken(token);
        
        // 🔐 Только администраторы могут удалять пользователей
        if (!user || !this.isAdmin(user)) {
            this.logSecurityEvent(user, 'DELETE_USER', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        
        const targetUser = await this.db.getUserById(userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        if (targetUser.is_protected) {
            return { success: false, message: 'Нельзя удалить защищенного пользователя' };
        }

        if (targetUser.id === user.id) {
            return { success: false, message: 'Нельзя удалить свой собственный аккаунт' };
        }

        if (targetUser.avatar && targetUser.avatar.startsWith('/uploads/avatars/')) {
            this.deleteFile(targetUser.avatar);
        }

        // Удаляем устройства пользователя
        const userDevices = await this.db.getUserDevices(userId);
        for (const device of userDevices) {
            await this.db.deleteDevice(device.id);
        }

        await this.db.deleteUser(userId);

        this.logSecurityEvent(user, 'DELETE_USER', `user:${targetUser.username}`);

        console.log(`🗑️ Администратор ${user.display_name} удалил аккаунт: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} успешно удален`
        };
    }

    async handleBanUser(token, data) {
        const user = await this.authenticateToken(token);
        
        // 🔐 Только администраторы могут банить пользователей
        if (!user || !this.isAdmin(user)) {
            this.logSecurityEvent(user, 'BAN_USER', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId, banned } = data;
        
        const targetUser = await this.db.getUserById(userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        if (targetUser.is_protected) {
            return { success: false, message: 'Нельзя заблокировать защищенного пользователя' };
        }

        await this.db.updateUser(userId, { banned });

        if (banned) {
            const userDevices = await this.db.getUserDevices(userId);
            if (userDevices.length > 0) {
                const lastDevice = userDevices[userDevices.length - 1];
                await this.banIP(lastDevice.ip);
            }
        }

        this.logSecurityEvent(user, banned ? 'BAN_USER' : 'UNBAN_USER', `user:${targetUser.username}`);

        console.log(`🔒 Администратор ${user.display_name} ${banned ? 'заблокировал' : 'разблокировал'} аккаунт: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} ${banned ? 'заблокирован' : 'разблокирован'}`
        };
    }

    async handleAdminStats(token) {
        const user = await this.authenticateToken(token);
        
        // 🔐 Только администраторы могут смотреть статистику
        if (!user || !this.isAdmin(user)) {
            this.logSecurityEvent(user, 'VIEW_ADMIN_STATS', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const stats = await this.db.getStats();

        this.logSecurityEvent(user, 'VIEW_ADMIN_STATS', 'SYSTEM');

        return {
            success: true,
            stats: stats
        };
    }

    // 🔐 ОБНОВЛЕННАЯ АУТЕНТИФИКАЦИЯ И РЕГИСТРАЦИЯ

    async handleLogin(data, req) {
        const { username, password } = data;
        
        // 🔐 Валидация входных данных
        if (!this.validateInput(username, 'username') || !password) {
            return { success: false, message: 'Некорректные данные для входа' };
        }

        const hashedPassword = this.hashPassword(password);
        const user = await this.db.getUserByUsername(username);
        
        if (!user || user.password !== hashedPassword) {
            this.logSecurityEvent({ username }, 'LOGIN', 'SYSTEM', false);
            return { success: false, message: 'Неверное имя пользователя или пароль' };
        }

        if (user.banned) {
            this.logSecurityEvent(user, 'LOGIN', 'SYSTEM', false);
            return { success: false, message: 'Аккаунт заблокирован' };
        }

        const clientIP = this.getClientIP(req);
        if (await this.isIPBanned(clientIP)) {
            this.logSecurityEvent(user, 'LOGIN', 'SYSTEM', false);
            return { success: false, message: 'Ваш IP адрес заблокирован' };
        }

        const device = await this.registerDevice(user.id, req);
        
        // 🔐 Создаем сессию вместо возврата ID пользователя
        const sessionToken = await this.createSession(user.id);

        await this.db.updateUser(user.id, {
            status: 'online',
            last_seen: new Date()
        });

        this.logSecurityEvent(user, 'LOGIN', 'SYSTEM');

        return {
            success: true,
            token: sessionToken, // Возвращаем токен сессии, а не ID пользователя
            deviceId: device.id,
            user: this.sanitizeUserData(user)
        };
    }

    async handleRegister(data, req) {
        const { username, displayName, email, password } = data;

        const clientIP = this.getClientIP(req);
        if (await this.isIPBanned(clientIP)) {
            this.logSecurityEvent({ username }, 'REGISTER', 'SYSTEM', false);
            return { success: false, message: 'Ваш IP адрес заблокирован. Регистрация невозможна.' };
        }

        if (!username || !displayName || !email || !password) {
            return { success: false, message: 'Все поля обязательны для заполнения' };
        }

        // 🔐 Валидация входных данных
        if (!this.validateInput(username, 'username')) {
            return { success: false, message: 'Некорректное имя пользователя' };
        }
        if (!this.validateInput(displayName, 'displayName')) {
            return { success: false, message: 'Некорректное отображаемое имя' };
        }
        if (!this.validateInput(email, 'email')) {
            return { success: false, message: 'Некорректный email' };
        }

        if (username.length < 3) {
            return { success: false, message: 'Имя пользователя должно содержать минимум 3 символа' };
        }

        if (password.length < 6) {
            return { success: false, message: 'Пароль должен содержать минимум 6 символов' };
        }

        const sanitizedUsername = this.sanitizeContent(username);
        const sanitizedDisplayName = this.sanitizeContent(displayName);
        const sanitizedEmail = this.sanitizeContent(email);

        const existingUser = await this.db.getUserByUsername(sanitizedUsername);
        if (existingUser) {
            return { success: false, message: 'Пользователь с таким именем уже существует' };
        }

        const existingEmail = await this.db.getUserByEmail(sanitizedEmail);
        if (existingEmail) {
            return { success: false, message: 'Пользователь с таким email уже существует' };
        }

        const isBayRex = sanitizedUsername.toLowerCase() === 'bayrex';
        
        const newUser = {
            id: this.generateId(),
            username: sanitizedUsername,
            displayName: sanitizedDisplayName,
            email: sanitizedEmail,
            password: this.hashPassword(password),
            avatar: null,
            description: 'Новый пользователь Epic Messenger',
            coins: isBayRex ? 50000 : 1000,
            verified: isBayRex,
            isDeveloper: isBayRex,
            isAdmin: isBayRex, // 🔐 BayRex получает права администратора
            status: 'online',
            isProtected: isBayRex
        };

        await this.db.createUser(newUser);

        const device = await this.registerDevice(newUser.id, req);
        
        // 🔐 Создаем сессию для нового пользователя
        const sessionToken = await this.createSession(newUser.id);
        
        this.logSecurityEvent(newUser, 'REGISTER', 'SYSTEM');

        if (isBayRex) {
            console.log(`👑 BayRex зарегистрирован с правами администратора!`);
        }

        return {
            success: true,
            message: isBayRex ? 
                'Аккаунт BayRex создан! Вы получили права администратора!' :
                'Аккаунт успешно создан! Добро пожаловать в Epic Messenger!',
            token: sessionToken, // Возвращаем токен сессии
            deviceId: device.id,
            user: this.sanitizeUserData(newUser)
        };
    }

    // 🎵 МЕТОДЫ ДЛЯ МУЗЫКИ

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
        const user = await this.authenticateToken(token);
        
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
            this.logSecurityEvent(user, 'UPLOAD_MUSIC', 'SYSTEM', false);
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
                        const audioPath = path.join(__dirname, 'public', 'uploads', 'music', audioFilename);
                        
                        console.log(`💾 Сохранение аудио файла: ${audioPath}`);
                        try {
                            await fs.promises.writeFile(audioPath, audioFile.buffer);
                            const audioUrl = `/uploads/music/${audioFilename}`;
                            console.log('✅ Аудио файл сохранен');

                            // Сохраняем обложку если есть
                            let coverUrl = null;
                            if (coverFile && coverFile.filename) {
                                const coverExt = path.extname(coverFile.filename);
                                const coverFilename = `cover_${user.id}_${Date.now()}${coverExt}`;
                                const coverPath = path.join(__dirname, 'public', 'uploads', 'music', 'covers', coverFilename);
                                
                                console.log(`💾 Сохранение обложки: ${coverPath}`);
                                await fs.promises.writeFile(coverPath, coverFile.buffer);
                                coverUrl = `/uploads/music/covers/${coverFilename}`;
                                console.log('✅ Обложка сохранена');
                            }

                            // Сохраняем метаданные трека
                            const track = {
                                id: this.generateId(),
                                userId: user.id,
                                title: this.sanitizeContent(fields.title),
                                artist: this.sanitizeContent(fields.artist),
                                genre: fields.genre ? this.sanitizeContent(fields.genre) : 'Не указан',
                                fileUrl: audioUrl,
                                coverUrl: coverUrl,
                                duration: 0
                            };

                            await this.db.createMusicTrack(track);

                            this.logSecurityEvent(user, 'UPLOAD_MUSIC', `track:${track.title} - ${track.artist}`);

                            console.log(`🎵 Пользователь ${user.display_name} загрузил трек: ${track.title} - ${track.artist}`);

                            sendSuccessResponse({
                                success: true,
                                track: {
                                    ...track,
                                    userName: user.display_name,
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

    async handleGetMusic(token) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const music = await this.db.getAllMusic();

        this.logSecurityEvent(user, 'GET_MUSIC', `count:${music.length}`);

        return {
            success: true,
            music: music
        };
    }

    async handleUploadMusic(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 Проверяем что пользователь не забанен
        if (user.banned) {
            this.logSecurityEvent(user, 'UPLOAD_MUSIC_METADATA', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { title, artist, duration, fileUrl, coverUrl, genre } = data;
        
        if (!title || !artist || !fileUrl) {
            return { success: false, message: 'Название, исполнитель и файл обязательны' };
        }

        const sanitizedTitle = this.sanitizeContent(title);
        const sanitizedArtist = this.sanitizeContent(artist);
        const sanitizedGenre = genre ? this.sanitizeContent(genre) : 'Не указан';

        const track = {
            id: this.generateId(),
            userId: user.id,
            title: sanitizedTitle,
            artist: sanitizedArtist,
            duration: duration || 0,
            fileUrl: fileUrl,
            coverUrl: coverUrl || '/assets/default-cover.png',
            genre: sanitizedGenre
        };

        await this.db.createMusicTrack(track);

        this.logSecurityEvent(user, 'UPLOAD_MUSIC_METADATA', `track:${sanitizedTitle} - ${sanitizedArtist}`);

        console.log(`🎵 Пользователь ${user.display_name} загрузил трек: ${sanitizedTitle} - ${sanitizedArtist}`);

        return {
            success: true,
            track:{
                ...track,
                userName: user.display_name,
                userAvatar: user.avatar,
                userVerified: user.verified
            }
        };
    }

    async handleUploadMusicFile(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 Проверяем что пользователь не забанен
        if (user.banned) {
            this.logSecurityEvent(user, 'UPLOAD_MUSIC_FILE', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { fileData, filename } = data;
        
        if (!this.validateMusicFile(filename)) {
            this.logSecurityEvent(user, 'UPLOAD_MUSIC_FILE', `file:${filename}`, false);
            return { success: false, message: 'Недопустимый формат аудио файла' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `music_${user.id}_${Date.now()}${fileExt}`;
            
            const fileUrl = await this.saveFile(fileData, uniqueFilename, 'music');

            this.logSecurityEvent(user, 'UPLOAD_MUSIC_FILE', `file:${filename}`);

            return {
                success: true,
                fileUrl: fileUrl
            };
        } catch (error) {
            console.error('Ошибка загрузки аудио файла:', error);
            this.logSecurityEvent(user, 'UPLOAD_MUSIC_FILE', `file:${filename}`, false);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    async handleUploadMusicCover(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 Проверяем что пользователь не забанен
        if (user.banned) {
            this.logSecurityEvent(user, 'UPLOAD_MUSIC_COVER', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { fileData, filename } = data;
        
        if (!this.validateCoverFile(filename)) {
            this.logSecurityEvent(user, 'UPLOAD_MUSIC_COVER', `file:${filename}`, false);
            return { success: false, message: 'Недопустимый формат изображения' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `cover_${user.id}_${Date.now()}${fileExt}`;
            
            const fileUrl = await this.saveFile(fileData, uniqueFilename, 'music/covers');

            this.logSecurityEvent(user, 'UPLOAD_MUSIC_COVER', `file:${filename}`);

            return {
                success: true,
                coverUrl: fileUrl
            };
        } catch (error) {
            console.error('Ошибка загрузки обложки:', error);
            this.logSecurityEvent(user, 'UPLOAD_MUSIC_COVER', `file:${filename}`, false);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    async handleDeleteMusic(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { trackId } = data;
        const track = await this.db.pool.query('SELECT * FROM music WHERE id = $1', [trackId]);
        
        if (track.rows.length === 0) {
            return { success: false, message: 'Трек не найден' };
        }

        const trackData = track.rows[0];
        
        // 🔐 Проверяем права: пользователь может удалять только свои треки (или админ)
        if (trackData.user_id !== user.id && !this.isAdmin(user)) {
            this.logSecurityEvent(user, 'DELETE_MUSIC', `track:${trackId}`, false);
            return { success: false, message: 'Вы можете удалять только свои треки' };
        }

        if (trackData.file_url && trackData.file_url.startsWith('/uploads/music/')) {
            this.deleteFile(trackData.file_url);
        }

        if (trackData.cover_url && trackData.cover_url.startsWith('/uploads/music/covers/')) {
            this.deleteFile(trackData.cover_url);
        }

        await this.db.deleteMusicTrack(trackId);

        this.logSecurityEvent(user, 'DELETE_MUSIC', `track:${trackData.title}`);

        console.log(`🗑️ Трек удален: ${trackData.title}`);

        return {
            success: true,
            message: 'Трек успешно удален'
        };
    }

    async handleSearchMusic(token, query) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { q } = query;
        if (!q || q.trim() === '') {
            return this.handleGetMusic(token);
        }

        const searchTerm = q.toLowerCase().trim();
        const filteredMusic = await this.db.searchMusic(searchTerm);

        this.logSecurityEvent(user, 'SEARCH_MUSIC', `term:${q}, results:${filteredMusic.length}`);

        return {
            success: true,
            music: filteredMusic,
            searchTerm: q
        };
    }

    async handleGetRandomMusic(token) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const randomMusic = await this.db.getRandomMusic(10);

        this.logSecurityEvent(user, 'GET_RANDOM_MUSIC', `count:${randomMusic.length}`);

        return {
            success: true,
            music: randomMusic
        };
    }

    async handleGetPlaylists(token) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const userPlaylists = await this.db.getUserPlaylists(user.id);
        
        this.logSecurityEvent(user, 'GET_PLAYLISTS', `count:${userPlaylists.length}`);

        return {
            success: true,
            playlists: userPlaylists
        };
    }

    async handleCreatePlaylist(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 Проверяем что пользователь не забанен
        if (user.banned) {
            this.logSecurityEvent(user, 'CREATE_PLAYLIST', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { name, description } = data;
        
        if (!name || name.trim() === '') {
            return { success: false, message: 'Название плейлиста обязательно' };
        }

        const sanitizedName = this.sanitizeContent(name.trim());
        const sanitizedDescription = description ? this.sanitizeContent(description) : '';

        const playlist = {
            id: this.generateId(),
            userId: user.id,
            name: sanitizedName,
            description: sanitizedDescription,
            tracks: [],
            cover: null
        };

        await this.db.createPlaylist(playlist);

        this.logSecurityEvent(user, 'CREATE_PLAYLIST', `name:${sanitizedName}`);

        console.log(`🎵 Создан плейлист: ${sanitizedName}`);

        return {
            success: true,
            playlist: playlist
        };
    }

    async handleAddToPlaylist(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 Проверяем что пользователь не забанен
        if (user.banned) {
            this.logSecurityEvent(user, 'ADD_TO_PLAYLIST', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { playlistId, trackId } = data;
        
        const playlist = await this.db.pool.query('SELECT * FROM playlists WHERE id = $1 AND user_id = $2', [playlistId, user.id]);
        if (playlist.rows.length === 0) {
            return { success: false, message: 'Плейлист не найден' };
        }

        const playlistData = playlist.rows[0];
        const track = await this.db.pool.query('SELECT * FROM music WHERE id = $1', [trackId]);
        if (track.rows.length === 0) {
            return { success: false, message: 'Трек не найден' };
        }

        if (playlistData.tracks.includes(trackId)) {
            return { success: false, message: 'Трек уже есть в плейлисте' };
        }

        const updatedTracks = [...playlistData.tracks, trackId];
        await this.db.updatePlaylistTracks(playlistId, updatedTracks);

        if (!playlistData.cover && updatedTracks.length === 1) {
            await this.db.pool.query(
                'UPDATE playlists SET cover = $1 WHERE id = $2',
                [track.rows[0].cover_url, playlistId]
            );
        }

        this.logSecurityEvent(user, 'ADD_TO_PLAYLIST', `playlist:${playlistData.name}, track:${track.rows[0].title}`);

        console.log(`🎵 Трек добавлен в плейлист: ${playlistData.name}`);

        return {
            success: true,
            playlist: {
                ...playlistData,
                tracks: updatedTracks
            }
        };
    }

    // 🔐 ОБНОВЛЕННЫЕ МЕТОДЫ С ПРОВЕРКАМИ БЕЗОПАСНОСТИ

    async handleCheckAuth(token, req) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { authenticated: false };
        }

        if (user.banned) {
            this.logSecurityEvent(user, 'CHECK_AUTH', 'SYSTEM', false);
            return { authenticated: false, message: 'Аккаунт заблокирован' };
        }

        const clientIP = this.getClientIP(req);
        if (await this.isIPBanned(clientIP)) {
            this.logSecurityEvent(user, 'CHECK_AUTH', 'SYSTEM', false);
            return { authenticated: false, message: 'IP адрес заблокирован' };
        }

        const deviceId = this.generateDeviceId(req);
        const devices = await this.db.getUserDevices(user.id);
        const device = devices.find(d => d.id === deviceId);
        if (device) {
            await this.db.updateDeviceActivity(deviceId);
        }

        this.logSecurityEvent(user, 'CHECK_AUTH', 'SYSTEM');

        return {
            authenticated: true,
            user: this.sanitizeUserData(user)
        };
    }

    async handleCurrentUser(token, req) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.logSecurityEvent(user, 'GET_CURRENT_USER', 'SYSTEM', false);
            return { success: false, message: 'Аккаунт заблокирован' };
        }

        const clientIP = this.getClientIP(req);
        if (await this.isIPBanned(clientIP)) {
            this.logSecurityEvent(user, 'GET_CURRENT_USER', 'SYSTEM', false);
            return { success: false, message: 'IP адрес заблокирован' };
        }

        const deviceId = this.generateDeviceId(req);
        const devices = await this.db.getUserDevices(user.id);
        const device = devices.find(d => d.id === deviceId);
        if (device) {
            await this.db.updateDeviceActivity(deviceId);
        }

        this.logSecurityEvent(user, 'GET_CURRENT_USER', 'SYSTEM');

        return {
            success: true,
            user: this.sanitizeUserData(user)
        };
    }

    async handleGetUsers(token) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 Возвращаем только базовую информацию о пользователях, без чувствительных данных
        const otherUsers = await this.db.getAllUsers(user.id);
        const sanitizedUsers = otherUsers.map(u => this.sanitizeUserData(u));

        this.logSecurityEvent(user, 'GET_USERS_LIST', `count:${sanitizedUsers.length}`);

        return {
            success: true,
            users: sanitizedUsers
        };
    }

    async handleSendMessage(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { toUserId, text, type, image, file, fileName, fileType } = data;

        // 🔐 Проверяем что пользователь не забанен
        if (user.banned) {
            this.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}`, false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        // Проверяем что есть либо текст, либо файл
        if ((!text || text.trim() === '') && !file && !image) {
            return { success: false, message: 'Сообщение не может быть пустым' };
        }

        // 🔐 Проверяем существование получателя
        const recipient = await this.db.getUserById(toUserId);
        if (!recipient) {
            this.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}`, false);
            return { success: false, message: 'Получатель не найден' };
        }

        // 🔐 Проверяем что получатель не забанен
        if (recipient.banned) {
            this.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}`, false);
            return { success: false, message: 'Нельзя отправлять сообщения заблокированным пользователям' };
        }

        let sanitizedText = '';
        if (text && text.trim() !== '') {
            sanitizedText = this.sanitizeContent(text.trim());
            if (sanitizedText.length === 0 && !file && !image) {
                this.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}`, false);
                return { success: false, message: 'Сообщение содержит запрещенный контент' };
            }
        }

        const encryptedText = text ? this.encrypt(sanitizedText) : '';

        const message = {
            id: this.generateId(),
            senderId: user.id,
            toUserId: toUserId,
            text: encryptedText,
            encrypted: !!text,
            type: type || (file ? 'file' : 'text'),
            image: image || null,
            file: file || null,
            fileName: fileName || null,
            fileType: fileType || null,
            displayName: user.display_name
        };

        await this.db.createMessage(message);

        this.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}, chars:${sanitizedText.length}`);

        console.log(`💬 Новое сообщение от ${user.display_name} к пользователю ${toUserId}`);

        return {
            success: true,
            message: {
                ...message,
                text: sanitizedText
            }
        };
    }

    async handleGetPosts(token) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const posts = await this.db.getAllPosts();

        this.logSecurityEvent(user, 'GET_POSTS', `count:${posts.length}`);

        return {
            success: true,
            posts: posts
        };
    }

    async handleCreatePost(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 Проверяем что пользователь не забанен
        if (user.banned) {
            this.logSecurityEvent(user, 'CREATE_POST', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { text, image, file, fileName, fileType } = data;
        
        // Проверяем что есть либо текст, либо файл
        if ((!text || text.trim() === '') && !file && !image) {
            return { success: false, message: 'Текст поста не может быть пустым' };
        }

        let sanitizedText = '';
        if (text && text.trim() !== '') {
            sanitizedText = this.sanitizeContent(text.trim());
            if (sanitizedText.length === 0 && !file && !image) {
                this.logSecurityEvent(user, 'CREATE_POST', 'SYSTEM', false);
                return { success: false, message: 'Текст поста содержит запрещенный контент' };
            }
        }

        const post = {
            id: this.generateId(),
            userId: user.id,
            text: sanitizedText,
            image: image,
            file: file,
            fileName: fileName,
            fileType: fileType
        };

        await this.db.createPost(post);
        await this.db.updateUser(user.id, { posts_count: (user.posts_count || 0) + 1 });

        this.logSecurityEvent(user, 'CREATE_POST', `chars:${sanitizedText.length}`);

        console.log(`📝 Новый пост от ${user.display_name}`);

        return {
            success: true,
            post: {
                ...post,
                userName: user.display_name,
                userAvatar: user.avatar,
                userVerified: user.verified,
                userDeveloper: user.is_developer
            }
        };
    }

    async handleDeletePost(token, query) {
        const user = await this.authenticateToken(token);
        
        // 🔐 Только администраторы могут удалять посты
        if (!user || !this.isAdmin(user)) {
            this.logSecurityEvent(user, 'DELETE_POST', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { postId } = query;
        const post = await this.db.pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
        
        if (post.rows.length === 0) {
            return { success: false, message: 'Пост не найден' };
        }

        const postData = post.rows[0];
        
        if (postData.user_id === 'system') {
            return { success: false, message: 'Нельзя удалить системный пост' };
        }

        if (postData.image && postData.image.startsWith('/uploads/posts/')) {
            this.deleteFile(postData.image);
        }

        if (postData.file && postData.file.startsWith('/uploads/')) {
            this.deleteFile(postData.file);
        }

        await this.db.deletePost(postId);

        const postUser = await this.db.getUserById(postData.user_id);
        if (postUser && postUser.posts_count > 0) {
            await this.db.updateUser(postData.user_id, { posts_count: postUser.posts_count - 1 });
        }

        this.logSecurityEvent(user, 'DELETE_POST', `post:${postId}, author:${postUser ? postUser.username : 'unknown'}`);

        console.log(`🗑️ Администратор ${user.display_name} удалил пост пользователя ${postUser ? postUser.username : 'unknown'}`);

        return {
            success: true,
            message: 'Пост успешно удален'
        };
    }

    async handleLikePost(token, postId) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 Проверяем что пользователь не забанен
        if (user.banned) {
            this.logSecurityEvent(user, 'LIKE_POST', `post:${postId}`, false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const post = await this.db.pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
        if (post.rows.length === 0) {
            return { success: false, message: 'Пост не найден' };
        }

        const postData = post.rows[0];
        let likes = postData.likes || [];

        const likeIndex = likes.indexOf(user.id);
        if (likeIndex === -1) {
            likes.push(user.id);
            console.log(`❤️ Пользователь ${user.display_name} лайкнул пост`);
            this.logSecurityEvent(user, 'LIKE_POST', `post:${postId}`);
        } else {
            likes.splice(likeIndex, 1);
            console.log(`💔 Пользователь ${user.display_name} убрал лайк с поста`);
            this.logSecurityEvent(user, 'UNLIKE_POST', `post:${postId}`);
        }

        await this.db.updatePostLikes(postId, likes);

        return {
            success: true,
            likes: likes
        };
    }

    async handleGetGifts(token) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const gifts = await this.db.getAllGifts();

        this.logSecurityEvent(user, 'GET_GIFTS', `count:${gifts.length}`);

        return {
            success: true,
            gifts: gifts
        };
    }

    async handleCreateGift(token, data) {
        const user = await this.authenticateToken(token);
        
        // 🔐 Только администраторы могут создавать подарки
        if (!user || !this.isAdmin(user)) {
            this.logSecurityEvent(user, 'CREATE_GIFT', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { name, price, type, image } = data;
        
        if (!name || !price) {
            return { success: false, message: 'Название и цена обязательны' };
        }

        const sanitizedName = this.sanitizeContent(name);

        const gift = {
            id: this.generateId(),
            name: sanitizedName,
            type: type || 'custom',
            preview: image ? '🖼️' : '🎁',
            price: parseInt(price),
            image: image
        };

        await this.db.createGift(gift);

        this.logSecurityEvent(user, 'CREATE_GIFT', `name:${sanitizedName}, price:${price}`);

        console.log(`🎁 Администратор ${user.display_name} создал новый подарок: ${sanitizedName}`);

        return {
            success: true,
            gift: gift
        };
    }

    async handleBuyGift(token, giftId, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 Проверяем что пользователь не забанен
        if (user.banned) {
            this.logSecurityEvent(user, 'BUY_GIFT', `gift:${giftId}`, false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { toUserId } = data;
        const gift = await this.db.getGiftById(giftId);
        
        if (!gift) {
            return { success: false, message: 'Подарок не найден' };
        }

        if (user.coins < gift.price) {
            this.logSecurityEvent(user, 'BUY_GIFT', `gift:${giftId}`, false);
            return { success: false, message: 'Недостаточно E-COIN для покупки подарка' };
        }

        const recipient = await this.db.getUserById(toUserId);
        if (!recipient) {
            return { success: false, message: 'Получатель не найден' };
        }

        // 🔐 Проверяем что получатель не забанен
        if (recipient.banned) {
            this.logSecurityEvent(user, 'BUY_GIFT', `gift:${giftId}, to:${toUserId}`, false);
            return { success: false, message: 'Нельзя отправлять подарки заблокированным пользователям' };
        }

        await this.db.updateUser(user.id, { coins: user.coins - gift.price });

        const giftMessage = {
            id: this.generateId(),
            senderId: user.id,
            toUserId: toUserId,
            text: '',
            encrypted: false,
            type: 'gift',
            giftId: gift.id,
            giftName: gift.name,
            giftPrice: gift.price,
            giftImage: gift.image,
            giftPreview: gift.preview,
            displayName: user.display_name
        };

        await this.db.createMessage(giftMessage);

        await this.db.updateUser(recipient.id, { gifts_count: (recipient.gifts_count || 0) + 1 });

        this.logSecurityEvent(user, 'BUY_GIFT', `gift:${gift.name}, to:${recipient.username}, price:${gift.price}`);

        console.log(`🎁 Пользователь ${user.display_name} отправил подарок "${gift.name}" пользователю ${recipient.display_name}`);

        return {
            success: true,
            message: `Подарок "${gift.name}" успешно отправлен!`,
            gift: gift
        };
    }

    async handleGetPromoCodes(token) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const promoCodes = await this.db.getAllPromoCodes();

        this.logSecurityEvent(user, 'GET_PROMOCODES', `count:${promoCodes.length}`);

        return {
            success: true,
            promoCodes: promoCodes
        };
    }

    async handleCreatePromoCode(token, data) {
        const user = await this.authenticateToken(token);
        
        // 🔐 Только администраторы могут создавать промокоды
        if (!user || !this.isAdmin(user)) {
            this.logSecurityEvent(user, 'CREATE_PROMOCODE', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { code, coins, max_uses } = data;
        
        if (!code || !coins) {
            return { success: false, message: 'Код и количество коинов обязательны' };
        }

        const sanitizedCode = this.sanitizeContent(code.toUpperCase());

        const existingPromo = await this.db.getPromoCodeByCode(sanitizedCode);
        if (existingPromo) {
            return { success: false, message: 'Промокод с таким кодом уже существует' };
        }

        const promoCode = {
            id: this.generateId(),
            code: sanitizedCode,
            coins: parseInt(coins),
            max_uses: max_uses || 0
        };

        await this.db.createPromoCode(promoCode);

        this.logSecurityEvent(user, 'CREATE_PROMOCODE', `code:${sanitizedCode}, coins:${coins}`);

        console.log(`🎫 Администратор ${user.username} создал промокод: ${sanitizedCode}`);

        return {
            success: true,
            promoCode: promoCode
        };
    }

    async handleActivatePromoCode(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 Проверяем что пользователь не забанен
        if (user.banned) {
            this.logSecurityEvent(user, 'ACTIVATE_PROMOCODE', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { code } = data;
        
        // 🔐 Валидация входных данных
        if (!this.validateInput(code, 'text')) {
            return { success: false, message: 'Некорректный промокод' };
        }

        const sanitizedCode = this.sanitizeContent(code.toUpperCase());
        const promoCode = await this.db.getPromoCodeByCode(sanitizedCode);

        if (!promoCode) {
            this.logSecurityEvent(user, 'ACTIVATE_PROMOCODE', `code:${sanitizedCode}`, false);
            return { success: false, message: 'Промокод не найден' };
        }

        if (promoCode.max_uses > 0 && promoCode.used_count >= promoCode.max_uses) {
            this.logSecurityEvent(user, 'ACTIVATE_PROMOCODE', `code:${sanitizedCode}`, false);
            return { success: false, message: 'Промокод уже использован максимальное количество раз' };
        }

        await this.db.updateUser(user.id, { coins: user.coins + promoCode.coins });
        await this.db.updatePromoCodeUsage(sanitizedCode);

        this.logSecurityEvent(user, 'ACTIVATE_PROMOCODE', `code:${sanitizedCode}, coins:${promoCode.coins}`);

        console.log(`💰 Пользователь ${user.display_name} активировал промокод ${sanitizedCode} (+${promoCode.coins} E-COIN)`);

        return {
            success: true,
            message: `Промокод активирован! Начислено ${promoCode.coins} E-COIN`,
            coins: promoCode.coins
        };
    }

    async handleUpdateProfile(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 Проверяем что пользователь не забанен
        if (user.banned) {
            this.logSecurityEvent(user, 'UPDATE_PROFILE', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { displayName, description, username, email } = data;

        const updates = {};

        if (displayName && displayName.trim()) {
            // 🔐 Валидация отображаемого имени
            if (!this.validateInput(displayName, 'displayName')) {
                return { success: false, message: 'Некорректное отображаемое имя' };
            }
            updates.display_name = this.sanitizeContent(displayName.trim());
        }

        if (description !== undefined) {
            updates.description = this.sanitizeContent(description);
        }

        if (username && username.trim() && username !== user.username) {
            const sanitizedUsername = this.sanitizeContent(username.trim());
            
            // 🔐 Валидация имени пользователя
            if (!this.validateInput(sanitizedUsername, 'username')) {
                return { success: false, message: 'Некорректное имя пользователя' };
            }
            
            const existingUser = await this.db.getUserByUsername(sanitizedUsername);
            if (existingUser && existingUser.id !== user.id) {
                this.logSecurityEvent(user, 'UPDATE_PROFILE', `username:${sanitizedUsername}`, false);
                return { success: false, message: 'Имя пользователя уже занято' };
            }
            updates.username = sanitizedUsername;
        }

        if (email && email.trim() && email !== user.email) {
            const sanitizedEmail = this.sanitizeContent(email.trim());
            
            // 🔐 Валидация email
            if (!this.validateInput(sanitizedEmail, 'email')) {
                return { success: false, message: 'Некорректный email' };
            }
            
            const existingEmail = await this.db.getUserByEmail(sanitizedEmail);
            if (existingEmail && existingEmail.id !== user.id) {
                this.logSecurityEvent(user, 'UPDATE_PROFILE', `email:${sanitizedEmail}`, false);
                return { success: false, message: 'Email уже используется' };
            }
            updates.email = sanitizedEmail;
        }

        if (Object.keys(updates).length > 0) {
            await this.db.updateUser(user.id, updates);
        }

        this.logSecurityEvent(user, 'UPDATE_PROFILE', 'SYSTEM');

        console.log(`📝 Пользователь ${user.username} обновил профиль`);

        // Получаем обновленные данные пользователя
        const updatedUser = await this.db.getUserById(user.id);

        return {
            success: true,
            user: this.sanitizeUserData(updatedUser)
        };
    }

    async handleUpdateAvatar(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 Проверяем что пользователь не забанен
        if (user.banned) {
            this.logSecurityEvent(user, 'UPDATE_AVATAR', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { avatar } = data;

        if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
            this.deleteFile(user.avatar);
        }

        await this.db.updateUser(user.id, { avatar });

        this.logSecurityEvent(user, 'UPDATE_AVATAR', 'SYSTEM');

        console.log(`🖼️ Пользователь ${user.username} обновил аватар`);

        const updatedUser = await this.db.getUserById(user.id);

        return {
            success: true,
            user: this.sanitizeUserData(updatedUser)
        };
    }

    async handleUploadAvatar(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 Проверяем что пользователь не забанен
        if (user.banned) {
            this.logSecurityEvent(user, 'UPDATE_AVATAR', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { fileData, filename } = data;

        // Проверяем что это изображение
        if (!this.validateAvatarFile(filename)) {
            this.logSecurityEvent(user, 'UPDATE_AVATAR', `file:${filename}`, false);
            return { success: false, message: 'Недопустимый формат файла для аватара' };
        }

        try {
            // Сохраняем файл на сервер
            const fileExt = path.extname(filename);
            const uniqueFilename = `avatar_${user.id}_${Date.now()}${fileExt}`;
            
            const fileUrl = await this.saveFile(fileData, uniqueFilename, 'avatar');

            // Удаляем старый аватар если он был
            if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
                this.deleteFile(user.avatar);
            }

            // Сохраняем URL файла вместо base64
            await this.db.updateUser(user.id, { avatar: fileUrl });

            this.logSecurityEvent(user, 'UPDATE_AVATAR', `file:${filename}`);

            console.log(`🖼️ Пользователь ${user.username} загрузил аватар: ${filename}`);

            const updatedUser = await this.db.getUserById(user.id);

            return {
                success: true,
                avatarUrl: fileUrl,
                user: this.sanitizeUserData(updatedUser)
            };
        } catch (error) {
            console.error('Ошибка загрузки аватара:', error);
            this.logSecurityEvent(user, 'UPDATE_AVATAR', `file:${filename}`, false);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    async handleUploadGift(token, data) {
        const user = await this.authenticateToken(token);
        
        // 🔐 Только администраторы могут загружать подарки
        if (!user || !this.isAdmin(user)) {
            this.logSecurityEvent(user, 'UPLOAD_GIFT', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { fileData, filename } = data;

        if (!this.validateGiftFile(filename)) {
            this.logSecurityEvent(user, 'UPLOAD_GIFT', `file:${filename}`, false);
            return { success: false, message: 'Недопустимый формат файла для подарка. Разрешены изображения, GIF и SVG.' };
        }

        if (fileData.length > 10 * 1024 * 1024) {
            this.logSecurityEvent(user, 'UPLOAD_GIFT', `file:${filename}`, false);
            return { success: false, message: 'Размер файла не должен превышать 10 МБ' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `gift_${Date.now()}${fileExt}`;
            
            const fileUrl = await this.saveFile(fileData, uniqueFilename, 'gift');

            this.logSecurityEvent(user, 'UPLOAD_GIFT', `file:${filename}`);

            console.log(`🎁 Администратор ${user.username} загрузил изображение подарка: ${filename}`);

            return {
                success: true,
                imageUrl: fileUrl
            };
        } catch (error) {
            console.error('Ошибка загрузки изображения подарка:', error);
            this.logSecurityEvent(user, 'UPLOAD_GIFT', `file:${filename}`, false);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    async handleUploadPostImage(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 Проверяем что пользователь не забанен
        if (user.banned) {
            this.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { fileData, filename } = data;

        if (!this.validatePostFile(filename)) {
            this.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${filename}`, false);
            return { success: false, message: 'Недопустимый формат файла для поста. Разрешены только изображения, видео и аудио.' };
        }

        if (fileData.length > 50 * 1024 * 1024) {
            this.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${filename}`, false);
            return { success: false, message: 'Размер файла не должен превышать 50 МБ' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `post_${user.id}_${Date.now()}${fileExt}`;
            
            const fileUrl = await this.saveFile(fileData, uniqueFilename, 'post');

            this.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${filename}`);

            console.log(`📸 Пользователь ${user.username} загрузил файл для поста: ${filename}`);

            return {
                success: true,
                imageUrl: fileUrl
            };
        } catch (error) {
            console.error('Ошибка загрузки файла для поста:', error);
            this.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${filename}`, false);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    async handleGetEmoji(token) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        try {
            const emojiPath = path.join(__dirname, 'public', 'assets', 'emoji');
            const files = fs.readdirSync(emojiPath);
            const emojiList = files.filter(file => 
                file.endsWith('.png') || file.endsWith('.svg') || file.endsWith('.gif')
            ).map(file => ({
                name: file,
                url: `/assets/emoji/${file}`
            }));

            this.logSecurityEvent(user, 'GET_EMOJI', `count:${emojiList.length}`);

            return {
                success: true,
                emoji: emojiList
            };
        } catch (error) {
            this.logSecurityEvent(user, 'GET_EMOJI', 'SYSTEM', false);
            return {
                success: true,
                emoji: []
            };
        }
    }

    async handleToggleVerification(token, data) {
        const user = await this.authenticateToken(token);
        
        // 🔐 Только администраторы могут управлять верификацией
        if (!user || !this.isAdmin(user)) {
            this.logSecurityEvent(user, 'TOGGLE_VERIFICATION', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        
        const targetUser = await this.db.getUserById(userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        await this.db.updateUser(userId, { verified: !targetUser.verified });

        this.logSecurityEvent(user, 'TOGGLE_VERIFICATION', `user:${targetUser.username}, status:${!targetUser.verified}`);

        console.log(`✅ Администратор ${user.display_name} ${!targetUser.verified ? 'верифицировал' : 'снял верификацию с'} аккаунта: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} ${!targetUser.verified ? 'верифицирован' : 'лишен верификации'}`,
            verified: !targetUser.verified
        };
    }

    async handleToggleDeveloper(token, data) {
        const user = await this.authenticateToken(token);
        
        // 🔐 Только администраторы могут управлять правами разработчика
        if (!user || !this.isAdmin(user)) {
            this.logSecurityEvent(user, 'TOGGLE_DEVELOPER', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        
        const targetUser = await this.db.getUserById(userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        await this.db.updateUser(userId, { is_developer: !targetUser.is_developer });

        this.logSecurityEvent(user, 'TOGGLE_DEVELOPER', `user:${targetUser.username}, status:${!targetUser.is_developer}`);

        console.log(`👑 Администратор ${user.display_name} ${!targetUser.is_developer ? 'дал права разработчика' : 'забрал права разработчика'} у: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} ${!targetUser.is_developer ? 'получил права разработчика' : 'лишен прав разработчика'}`,
            isDeveloper: !targetUser.is_developer
        };
    }

    async handleGetTransactions(token, userId) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        // 🔐 ПРОВЕРКА ПРАВ: пользователь может получать только СВОИ транзакции
        if (user.id !== userId) {
            this.logSecurityEvent(user, 'GET_TRANSACTIONS', `user:${userId}`, false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const transactions = [
            {
                description: 'Регистрация бонус',
                date: user.created_at,
                amount: user.coins >= 50000 ? 50000 : 1000
            }
        ];

        this.logSecurityEvent(user, 'GET_TRANSACTIONS', `user:${userId}`);

        return {
            success: true,
            transactions: transactions
        };
    }

    async handleGetDevices(token) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const devices = await this.db.getUserDevices(user.id);
        
        this.logSecurityEvent(user, 'GET_DEVICES', `count:${devices.length}`);

        return {
            success: true,
            devices: devices
        };
    }

    async handleTerminateDevice(token, data) {
        const user = await this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { deviceId } = data;
        const success = await this.terminateDevice(user.id, deviceId);

        if (success) {
            this.logSecurityEvent(user, 'TERMINATE_DEVICE', `device:${deviceId}`);
            return {
                success: true,
                message: 'Сеанс устройства завершен'
            };
        } else {
            this.logSecurityEvent(user, 'TERMINATE_DEVICE', `device:${deviceId}`, false);
            return {
                success: false,
                message: 'Не удалось завершить сеанс устройства'
            };
        }
    }
  
    start(port = 3000) {
        const server = http.createServer((req, res) => {
            const parsedUrl = url.parse(req.url, true);
            const pathname = parsedUrl.pathname;

            console.log(`${new Date().toISOString()} - ${req.method} ${pathname}`);

            // 🔐 Устанавливаем безопасные заголовки для всех запросов
            this.setSecurityHeaders(res);

            if (pathname.startsWith('/api/')) {
                this.handleApiRequest(req, res);
                return;
            }

            // Обработка статических файлов для мобильной и десктопной версий
            if (pathname === '/' || pathname === '/index.html') {
                this.serveStaticFile(res, 'public/main.html', 'text/html');
            } else if (pathname === '/mobile.html' || pathname === '/mobile') {
                this.serveStaticFile(res, 'public/mobile.html', 'text/html');
            } else if (pathname === '/login.html') {
                this.serveStaticFile(res, 'public/login.html', 'text/html');
            } else if (pathname === '/about.html' || pathname === '/about') {
                this.serveStaticFile(res, 'public/about.html', 'text/html');
            } else if (pathname === '/music.html' || pathname === '/music') {
                this.serveStaticFile(res, 'public/music.html', 'text/html');
            } else if (pathname.endsWith('.css')) {
                this.serveStaticFile(res, 'public' + pathname, 'text/css');
            } else if (pathname.endsWith('.js')) {
                this.serveStaticFile(res, 'public' + pathname, 'application/javascript');
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
                
                this.serveStaticFile(res, 'public' + pathname, contentType);
            } else {
                // По умолчанию отдаем мобильную версию для мобильных устройств
                const userAgent = req.headers['user-agent'] || '';
                const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(userAgent);
                
                if (isMobile) {
                    this.serveStaticFile(res, 'public/mobile.html', 'text/html');
                } else {
                    this.serveStaticFile(res, 'public/main.html', 'text/html');
                }
            }
        });

        const wsServer = new WebSocketServer(server);

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
            console.log(`💾 PostgreSQL база данных подключена`);
            console.log(`🔒 Данные пользователей защищены шифрованием`);
            console.log(`📁 Поддержка загрузки файлов включена`);
            console.log(`🎵 Музыкальный модуль активирован`);
            console.log(`🛡️  Система банов по IP и устройствам активирована`);
            console.log(`👥 Система групп активирована`);
            console.log(`✏️  Редактирование и удаление сообщений активировано`);
            console.log(`\n👑 Особый пользователь:`);
            console.log(`   - BayRex - получает права администратора при регистрации`);
            console.log(`\n📄 Доступные страницы:`);
            console.log(`   - Основное приложение: http://localhost:${port}/`);
            console.log(`   - Страница входа: http://localhost:${port}/login.html`);
            console.log(`   - Музыкальный плеер: http://localhost:${port}/music`);
            console.log(`   - О проекте: http://localhost:${port}/about`);
            console.log(`\n💾 База данных: PostgreSQL`);
            console.log(`📊 Логи безопасности: /tmp/security.log`);
            console.log(`🎵 Для загрузки музыки используйте endpoint: /api/music/upload-full`);
            console.log(`✏️  Для редактирования сообщений: /api/messages/edit`);
            console.log(`🗑️  Для удаления сообщений: /api/messages/delete`);
        });

        return server;
    }
}

const server = new SimpleServer();
server.start(process.env.PORT || 3000);
