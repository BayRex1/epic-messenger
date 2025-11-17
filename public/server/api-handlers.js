const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getClientIP, getDeviceInfo, generateDeviceId } = require('./utils');

class ApiHandlers {
    constructor(dataManager, securitySystem, fileHandlers) {
        this.dataManager = dataManager;
        this.securitySystem = securitySystem;
        this.fileHandlers = fileHandlers;
    }

    processApiRequest(pathname, method, data, query, req, res) {
        console.log(`🔄 Processing API: ${method} ${pathname}`);
        console.log(`📦 Request data keys:`, Object.keys(data));
        console.log(`❓ Query params:`, query);
        
        const headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Content-Length, Accept, Origin',
            'Access-Control-Allow-Credentials': 'true'
        };

        // 🔐 Устанавливаем безопасные заголовки
        this.securitySystem.setSecurityHeaders(res);

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
                        response = this.handleLogin(data, req);
                    }
                    break;
                    
                case '/api/register':
                    if (method === 'POST') {
                        response = this.handleRegister(data, req);
                    }
                    break;
                    
                case '/api/check-auth':
                    if (method === 'GET') {
                        response = this.handleCheckAuth(token, req);
                    }
                    break;
                    
                case '/api/current-user':
                    if (method === 'GET') {
                        response = this.handleCurrentUser(token, req);
                    }
                    break;
                    
                case '/api/users':
                    if (method === 'GET') {
                        response = this.handleGetUsers(token);
                    }
                    break;

                case '/api/users/search':
                    if (method === 'GET') {
                        response = this.handleSearchUsers(token, query);
                    }
                    break;

                case '/api/chats':
                    if (method === 'GET') {
                        response = this.handleGetChats(token);
                    }
                    break;
                    
                case '/api/messages':
                    if (method === 'GET') {
                        response = this.handleGetMessages(token, query);
                    }
                    break;
                    
                case '/api/messages/send':
                    if (method === 'POST') {
                        response = this.handleSendMessage(token, data);
                    }
                    break;

                case '/api/messages/mark-read':
                    if (method === 'POST') {
                        response = this.handleMarkAsRead(token, data);
                    }
                    break;

                case '/api/messages/edit':
                    if (method === 'POST') {
                        response = this.handleEditMessage(token, data);
                    }
                    break;

                case '/api/messages/delete':
                    if (method === 'POST') {
                        response = this.handleDeleteMessage(token, data);
                    }
                    break;

                case '/api/chats/start':
                    if (method === 'POST') {
                        response = this.handleStartChat(token, data);
                    }
                    break;

                case '/api/groups/create':
                    if (method === 'POST') {
                        response = this.handleCreateGroup(token, data);
                    }
                    break;
                    
                case '/api/posts':
                    if (method === 'GET') {
                        response = this.handleGetPosts(token);
                    } else if (method === 'POST') {
                        response = this.handleCreatePost(token, data);
                    } else if (method === 'DELETE') {
                        response = this.handleDeletePost(token, query);
                    }
                    break;

                case '/api/posts/user':
                    if (method === 'GET') {
                        response = this.handleGetUserPosts(token, query);
                    }
                    break;

                case '/api/posts/like':
                    if (method === 'POST') {
                        response = this.handleLikePost(token, data);
                    }
                    break;

                case '/api/posts/comment':
                    if (method === 'POST') {
                        response = this.handleAddComment(token, data);
                    }
                    break;

                case '/api/posts/comment/like':
                    if (method === 'POST') {
                        response = this.handleLikeComment(token, data);
                    }
                    break;

                case '/api/posts/comment/reply':
                    if (method === 'POST') {
                        response = this.handleReplyToComment(token, data);
                    }
                    break;

                case '/api/posts/share':
                    if (method === 'POST') {
                        response = this.handleSharePost(token, data);
                    }
                    break;
                    
                case '/api/gifts':
                    if (method === 'GET') {
                        response = this.handleGetGifts(token);
                    } else if (method === 'POST') {
                        response = this.handleCreateGift(token, data);
                    } else if (method === 'DELETE') {
                        response = this.handleDeleteGift(token, data);
                    }
                    break;

                case '/api/gifts/buy':
                    if (method === 'POST') {
                        response = this.handleBuyGift(token, data);
                    }
                    break;

                case '/api/gifts/user':
                    if (method === 'GET') {
                        response = this.handleGetUserGifts(token, query);
                    }
                    break;
                    
                case '/api/promo-codes':
                    if (method === 'GET') {
                        response = this.handleGetPromoCodes(token);
                    } else if (method === 'DELETE') {
                        response = this.handleDeletePromoCode(token, data);
                    }
                    break;
                    
                case '/api/promo-codes/create':
                    if (method === 'POST') {
                        response = this.handleCreatePromoCode(token, data);
                    }
                    break;
                    
                case '/api/promo-codes/activate':
                    if (method === 'POST') {
                        response = this.handleActivatePromoCode(token, data);
                    }
                    break;
                    
                case '/api/update-profile':
                    if (method === 'POST') {
                        response = this.handleUpdateProfile(token, data);
                    }
                    break;

                case '/api/update-avatar':
                    if (method === 'POST') {
                        response = this.handleUpdateAvatar(token, data);
                    }
                    break;

                case '/api/preview-avatar':
                    if (method === 'POST') {
                        response = this.handlePreviewAvatar(token, data);
                    }
                    break;

                case '/api/debug-upload':
                    if (method === 'POST') {
                        console.log('🐛 DEBUG UPLOAD DATA:', {
                            hasFileData: !!data.fileData,
                            fileDataLength: data.fileData?.length,
                            filename: data.filename,
                            fileType: data.fileType
                        });
                        response = { 
                            success: true, 
                            message: 'Debug received',
                            dataInfo: {
                                hasFileData: !!data.fileData,
                                fileDataLength: data.fileData?.length,
                                filename: data.filename
                            }
                        };
                    } else if (method === 'GET') {
                        response = this.handleDebugUpload(token);
                    }
                    break;

                case '/api/admin/stats':
                    if (method === 'GET') {
                        response = this.handleAdminStats(token);
                    }
                    break;

                case '/api/admin/delete-user':
                    if (method === 'POST') {
                        response = this.handleDeleteUser(token, data);
                    }
                    break;

                case '/api/admin/ban-user':
                    if (method === 'POST') {
                        response = this.handleBanUser(token, data);
                    }
                    break;

                case '/api/admin/unban-user':
                    if (method === 'POST') {
                        response = this.handleUnbanUser(token, data);
                    }
                    break;

                case '/api/admin/verify-user':
                    if (method === 'POST') {
                        response = this.handleAdminVerifyUser(token, data);
                    }
                    break;

                case '/api/admin/make-developer':
                    if (method === 'POST') {
                        response = this.handleAdminMakeDeveloper(token, data);
                    }
                    break;

                case '/api/admin/toggle-verification':
                    if (method === 'POST') {
                        response = this.handleToggleVerification(token, data);
                    }
                    break;

                case '/api/admin/toggle-developer':
                    if (method === 'POST') {
                        response = this.handleToggleDeveloper(token, data);
                    }
                    break;

                case '/api/admin/export-database':
                    if (method === 'GET') {
                        response = this.handleExportDatabase(token, res);
                        return;
                    }
                    break;

                case '/api/admin/import-database':
                    if (method === 'POST') {
                        response = this.handleImportDatabase(token, data);
                    }
                    break;

                case '/api/admin/users':
                    if (method === 'GET') {
                        response = this.handleAdminGetUsers(token);
                    }
                    break;

                case '/api/admin/security-logs':
                    if (method === 'GET') {
                        response = this.handleAdminSecurityLogs(token);
                    }
                    break;

                case '/api/admin/statistics':
                    if (method === 'GET') {
                        response = this.handleAdminStatistics(token);
                    }
                    break;

                // 🔧 Новый endpoint для управления техническими работами
                case '/api/admin/maintenance':
                    if (method === 'POST') {
                        response = this.handleMaintenanceMode(token, data);
                    } else if (method === 'GET') {
                        response = this.handleGetMaintenanceStatus(token);
                    }
                    break;

                case '/api/emoji':
                    if (method === 'GET') {
                        response = this.handleGetEmoji(token);
                    }
                    break;

                case '/api/devices':
                    if (method === 'GET') {
                        response = this.handleGetDevices(token);
                    }
                    break;

                case '/api/devices/terminate':
                    if (method === 'POST') {
                        response = this.handleTerminateDevice(token, data);
                    }
                    break;

                case '/api/user-by-username':
                    if (method === 'POST') {
                        response = this.handleGetUserByUsername(token, data);
                    }
                    break;

                case '/api/mobile/user-by-username':
                    if (method === 'POST') {
                        response = this.handleGetUserByUsernameMobile(token, data);
                    }
                    break;

                case '/api/mobile/user-posts':
                    if (method === 'POST') {
                        response = this.handleGetUserPostsMobile(token, data);
                    }
                    break;

                case '/api/my-gifts':
                    if (method === 'GET') {
                        response = this.handleGetMyGifts(token);
                    }
                    break;

                case '/api/ecoins/balance':
                    if (method === 'GET') {
                        response = this.handleGetBalance(token);
                    }
                    break;

                // API для групп
                case '/api/groups':
                    if (method === 'GET') {
                        response = this.handleGetUserGroups(token);
                    } else if (method === 'POST') {
                        response = this.handleCreateGroup(token, data);
                    }
                    break;

                case '/api/groups/add-member':
                    if (method === 'POST') {
                        response = this.handleAddToGroup(token, data);
                    }
                    break;

                case '/api/groups/join':
                    if (method === 'POST') {
                        response = this.handleJoinGroup(token, data);
                    }
                    break;

                case '/api/groups/leave':
                    if (method === 'POST') {
                        response = this.handleLeaveGroup(token, data);
                    }
                    break;

                // API для музыки
                case '/api/music':
                    if (method === 'GET') {
                        response = this.handleGetMusic(token);
                    } else if (method === 'POST') {
                        response = this.handleUploadMusic(token, data);
                    }
                    break;
                    
                case '/api/music/upload':
                    if (method === 'POST') {
                        response = this.handleUploadMusicFile(token, data);
                    }
                    break;
                    
                case '/api/music/upload-full':
                    if (method === 'POST') {
                        response = this.handleUploadMusicFull(token, data);
                    }
                    break;
                    
                case '/api/music/upload-cover':
                    if (method === 'POST') {
                        response = this.handleUploadMusicCover(token, data);
                    }
                    break;
                    
                case '/api/music/delete':
                    if (method === 'POST') {
                        response = this.handleDeleteMusic(token, data);
                    }
                    break;
                    
                case '/api/music/search':
                    if (method === 'GET') {
                        response = this.handleSearchMusic(token, query);
                    }
                    break;
                    
                case '/api/music/random':
                    if (method === 'GET') {
                        response = this.handleGetRandomMusic(token);
                    }
                    break;
                    
                case '/api/playlists':
                    if (method === 'GET') {
                        response = this.handleGetPlaylists(token);
                    } else if (method === 'POST') {
                        response = this.handleCreatePlaylist(token, data);
                    }
                    break;
                    
                case '/api/playlists/create':
                    if (method === 'POST') {
                        response = this.handleCreatePlaylist(token, data);
                    }
                    break;

                case '/api/playlists/add':
                    if (method === 'POST') {
                        response = this.handleAddToPlaylist(token, data);
                    }
                    break;

                case '/api/playlists/add-track':
                    if (method === 'POST') {
                        response = this.handleAddTrackToPlaylist(token, data);
                    }
                    break;

                // 🔥 НОВЫЕ API ДЛЯ КОММЕНТАРИЕВ
                case '/api/posts/comments':
                    if (method === 'GET') {
                        response = this.handleGetComments(token, query);
                    } else if (method === 'POST') {
                        response = this.handleAddComment(token, data);
                    }
                    break;

                // Загрузка файлов
                case '/api/upload-avatar':
                    if (method === 'POST') {
                        response = this.handleUploadAvatar(token, data);
                    }
                    break;

                case '/api/upload-post-image':
                    if (method === 'POST') {
                        response = this.handleUploadPostImage(token, data);
                    }
                    break;

                case '/api/upload-file':
                    if (method === 'POST') {
                        response = this.handleUploadFile(token, data);
                    }
                    break;

                case '/api/upload-gift':
                    if (method === 'POST') {
                        response = this.handleUploadGift(token, data);
                    }
                    break;

                case '/api/logout':
                    if (method === 'POST') {
                        response = this.handleLogout(token);
                    }
                    break;

                case '/api/maintenance-status':
                    if (method === 'GET') {
                        response = this.handleGetMaintenanceStatusPublic(token);
                    }
                    break;
                    
                default:
                    if (pathname.startsWith('/api/posts/') && pathname.endsWith('/like')) {
                        const postId = pathname.split('/')[3];
                        if (method === 'POST') {
                            response = this.handleLikePost(token, { postId });
                        }
                    } else if (pathname.startsWith('/api/gifts/') && pathname.endsWith('/buy')) {
                        const giftId = pathname.split('/')[3];
                        if (method === 'POST') {
                            response = this.handleBuyGift(token, { giftId, ...data });
                        }
                    } else if (pathname.startsWith('/api/users/')) {
                        const userId = pathname.split('/')[3];
                        if (method === 'GET') {
                            response = this.handleGetUser(token, userId);
                        }
                    } else if (pathname.startsWith('/api/user/') && pathname.includes('/transactions')) {
                        const userId = pathname.split('/')[3];
                        if (method === 'GET') {
                            response = this.handleGetTransactions(token, userId);
                        }
                    } else if (pathname.startsWith('/api/posts/') && pathname.includes('/comments')) {
                        const pathParts = pathname.split('/');
                        const postId = pathParts[3];
                        
                        if (pathParts.length === 5 && pathParts[4] === 'comments' && method === 'GET') {
                            response = this.handleGetPostComments(token, postId);
                        } else if (pathParts.length === 5 && pathParts[4] === 'comments' && method === 'POST') {
                            response = this.handleAddPostComment(token, postId, data);
                        } else if (pathParts.length === 6 && pathParts[5] === 'like' && method === 'POST') {
                            const commentId = pathParts[4];
                            response = this.handleLikeComment(token, { postId, commentId });
                        } else if (pathParts.length === 7 && pathParts[5] === 'reply' && method === 'POST') {
                            const commentId = pathParts[4];
                            response = this.handleAddReply(token, postId, commentId, data);
                        } else if (pathParts.length === 8 && pathParts[7] === 'like' && method === 'POST') {
                            const commentId = pathParts[4];
                            const replyId = pathParts[6];
                            response = this.handleLikeReply(token, postId, commentId, replyId);
                        } else {
                            response = { success: false, message: 'API endpoint not found' };
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

    // 🔐 ОБНОВЛЕННАЯ АУТЕНТИФИКАЦИЯ
    authenticateToken(token) {
        if (!token) return null;
        
        try {
            // Попробуем оба формата токенов
            let userId, sessionId;
            
            try {
                // Новый формат: base64 encoded JSON
                const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
                userId = decoded.userId;
                sessionId = decoded.sessionId;
            } catch {
                // Старый формат: session token
                const session = this.securitySystem.validateSession(token);
                if (!session) return null;
                userId = session.userId;
                sessionId = session.id;
            }
            
            const user = this.dataManager.users.find(u => u.id === userId);
            if (user && user.sessionId === sessionId) {
                user.lastSeen = new Date();
                return user;
            }
        } catch (error) {
            console.log('❌ Ошибка аутентификации токена:', error);
        }
        return null;
    }

    // 🔥 НОВЫЕ МЕТОДЫ ДЛЯ ЧАТОВ И ГРУПП

    handleSearchUsers(token, query) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const searchTerm = query.q;
        if (!searchTerm || searchTerm.length < 2) {
            return { success: true, users: [] };
        }

        const filteredUsers = this.dataManager.users.filter(u => 
            u.id !== user.id && // Исключаем текущего пользователя
            (u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
             u.displayName.toLowerCase().includes(searchTerm.toLowerCase()))
        ).slice(0, 20).map(u => ({
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            avatar: u.avatar,
            description: u.description,
            coins: u.coins,
            verified: u.verified,
            isDeveloper: u.isDeveloper,
            status: u.status,
            lastSeen: u.lastSeen,
            createdAt: u.createdAt,
            friendsCount: u.friendsCount || 0,
            postsCount: u.postsCount || 0,
            giftsCount: u.giftsCount || 0,
            banned: u.banned || false
        }));

        return { success: true, users: filteredUsers };
    }

    handleCreateGroup(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { name, username, members, description, isPrivate } = data;
        
        if (!name) {
            return { success: false, message: 'Неверные данные для создания группы' };
        }

        // Проверяем, что все участники существуют
        const validMembers = members ? members.filter(memberId => 
            this.dataManager.users.find(u => u.id === memberId)
        ) : [];

        // Проверяем уникальность username если указан
        if (username) {
            const existingGroup = this.dataManager.groups.find(g => g.username === username);
            if (existingGroup) {
                return { success: false, message: 'Группа с таким username уже существует' };
            }
        }

        // Создаем группу
        const groupId = this.dataManager.generateId();
        const group = {
            id: groupId,
            name: this.securitySystem.sanitizeContent(name),
            username: username ? this.securitySystem.sanitizeContent(username) : null,
            description: description ? this.securitySystem.sanitizeContent(description) : '',
            creatorId: user.id,
            members: [user.id, ...validMembers],
            admins: [user.id],
            avatar: null,
            createdAt: new Date(),
            isActive: true,
            isPublic: !isPrivate,
            isPrivate: isPrivate || false,
            inviteLink: crypto.randomBytes(8).toString('hex')
        };

        this.dataManager.groups.push(group);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'CREATE_GROUP', `group:${name}, members:${validMembers.length}`);

        console.log(`👥 Пользователь ${user.displayName} создал группу: ${name} с ${validMembers.length} участниками`);

        return {
            success: true,
            group: group,
            message: 'Группа успешно создана'
        };
    }

    handleGetChats(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        try {
            // Получаем личные чаты
            const personalChats = this.dataManager.users
                .filter(u => u.id !== user.id)
                .map(u => {
                    const messages = this.dataManager.messages.filter(m => 
                        (m.senderId === user.id && m.receiverId === u.id) ||
                        (m.senderId === u.id && m.receiverId === user.id)
                    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                    const lastMessage = messages[0] || null;
                    const unreadCount = messages.filter(m => 
                        m.senderId === u.id && !m.read
                    ).length;

                    return {
                        id: u.id,
                        displayName: u.displayName || 'Пользователь',
                        avatar: u.avatar,
                        verified: u.verified,
                        isDeveloper: u.isDeveloper,
                        status: u.status,
                        lastSeen: u.lastSeen,
                        lastMessage: lastMessage,
                        unreadCount: unreadCount,
                        isGroup: false
                    };
                })
                .filter(chat => chat.lastMessage !== null) // Показываем только чаты с сообщениями
                .sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));

            // Получаем групповые чаты
            const groupChats = this.dataManager.groups
                .filter(g => g.members.includes(user.id) && g.isActive)
                .map(g => {
                    const groupMessages = this.dataManager.messages.filter(m => 
                        m.receiverId === g.id
                    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                    const lastMessage = groupMessages[0] || null;
                    const unreadCount = groupMessages.filter(m => 
                        m.senderId !== user.id && !m.readBy?.includes(user.id)
                    ).length;

                    return {
                        id: g.id,
                        displayName: g.name,
                        avatar: g.avatar,
                        isGroup: true,
                        memberCount: g.members.length,
                        lastMessage: lastMessage,
                        unreadCount: unreadCount
                    };
                })
                .filter(chat => chat.lastMessage !== null)
                .sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));

            const allChats = [...personalChats, ...groupChats];

            return { success: true, chats: allChats };
        } catch (error) {
            console.error('❌ Ошибка получения чатов:', error);
            return { success: false, message: 'Ошибка получения чатов' };
        }
    }

    handleGetMessages(token, query) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId } = query;
        
        if (!userId) {
            return { success: false, message: 'Не указан получатель' };
        }

        try {
            let messages;
            
            // Проверяем, является ли чат групповым
            const isGroupChat = this.dataManager.groups.some(g => g.id === userId && g.members.includes(user.id));
            
            if (isGroupChat) {
                // Групповые сообщения
                messages = this.dataManager.messages
                    .filter(m => m.receiverId === userId)
                    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            } else {
                // Личные сообщения
                messages = this.dataManager.messages
                    .filter(m => 
                        (m.senderId === user.id && m.receiverId === userId) ||
                        (m.senderId === userId && m.receiverId === user.id)
                    )
                    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            }

            const messagesWithInfo = messages.map(msg => ({
                ...msg,
                isOutgoing: msg.senderId === user.id
            }));

            return { success: true, messages: messagesWithInfo };
        } catch (error) {
            console.error('❌ Ошибка получения сообщений:', error);
            return { success: false, message: 'Ошибка получения сообщений' };
        }
    }

    handleSendMessage(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { toUserId, text, type = 'text', file, fileName, fileType } = data;
        
        if (!toUserId) {
            return { success: false, message: 'Не указан получатель' };
        }

        if (!text && !file) {
            return { success: false, message: 'Сообщение не может быть пустым' };
        }

        try {
            // Проверяем существование получателя (пользователя или группы)
            const isUser = this.dataManager.users.some(u => u.id === toUserId);
            const isGroup = this.dataManager.groups.some(g => g.id === toUserId && g.members.includes(user.id));
            
            if (!isUser && !isGroup) {
                return { success: false, message: 'Получатель не найден или у вас нет доступа к группе' };
            }

            let fileUrl = null;
            
            // Обработка файла если есть
            if (file && fileName && fileType) {
                const fileExt = path.extname(fileName) || this.getFileExtension(fileType);
                const uniqueFilename = `file_${user.id}_${Date.now()}${fileExt}`;
                let uploadDir = 'files';
                
                if (fileType === 'image') uploadDir = 'images';
                else if (fileType === 'video') uploadDir = 'videos';
                else if (fileType === 'audio') uploadDir = 'audio';
                
                const filePath = path.join(process.cwd(), 'public', 'uploads', uploadDir, uniqueFilename);
                
                // Сохраняем файл
                const base64Data = file.replace(/^data:[^;]+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                fs.writeFileSync(filePath, buffer);
                
                fileUrl = `/uploads/${uploadDir}/${uniqueFilename}`;
            }

            const message = {
                id: this.dataManager.generateId(),
                senderId: user.id,
                receiverId: toUserId,
                text: text ? this.securitySystem.sanitizeContent(text) : null,
                type: type,
                file: fileUrl,
                fileName: fileName,
                fileType: fileType,
                timestamp: new Date(),
                read: false,
                readBy: isGroup ? [user.id] : [] // Для групп отслеживаем кто прочитал
            };

            this.dataManager.messages.push(message);
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}, type:${type}`);

            console.log(`💬 Пользователь ${user.displayName} отправил сообщение ${isGroup ? 'в группу' : 'пользователю'} ${toUserId}`);

            return { success: true, message: message };
        } catch (error) {
            console.error('❌ Ошибка отправки сообщения:', error);
            return { success: false, message: 'Ошибка отправки сообщения: ' + error.message };
        }
    }

    handleMarkAsRead(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { fromUserId } = data;
        
        if (!fromUserId) {
            return { success: false, message: 'Не указан отправитель' };
        }

        try {
            // Помечаем сообщения как прочитанные
            this.dataManager.messages.forEach(message => {
                if (message.senderId === fromUserId && message.receiverId === user.id && !message.read) {
                    message.read = true;
                }
                
                // Для групповых сообщений добавляем пользователя в список прочитавших
                if (message.receiverId === fromUserId && message.readBy && !message.readBy.includes(user.id)) {
                    message.readBy.push(user.id);
                }
            });

            this.dataManager.saveData();

            return { success: true, message: 'Сообщения помечены как прочитанные' };
        } catch (error) {
            console.error('❌ Ошибка отметки сообщений:', error);
            return { success: false, message: 'Ошибка отметки сообщений' };
        }
    }

    handleEditMessage(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { messageId, newText } = data;
        
        if (!messageId || !newText) {
            return { success: false, message: 'Заполните все поля' };
        }

        const message = this.dataManager.messages.find(msg => msg.id === messageId);
        if (!message) {
            return { success: false, message: 'Сообщение не найдено' };
        }

        if (message.senderId !== user.id) {
            return { success: false, message: 'Нет прав для редактирования этого сообщения' };
        }

        message.text = newText;
        message.edited = true;
        this.dataManager.saveData();

        return { success: true, message: 'Сообщение отредактировано' };
    }

    handleDeleteMessage(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { messageId } = data;
        if (!messageId) {
            return { success: false, message: 'Message ID не указан' };
        }

        const messageIndex = this.dataManager.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) {
            return { success: false, message: 'Сообщение не найдено' };
        }

        const message = this.dataManager.messages[messageIndex];
        if (message.senderId !== user.id && !user.isDeveloper) {
            return { success: false, message: 'Нет прав для удаления этого сообщения' };
        }

        this.dataManager.messages.splice(messageIndex, 1);
        this.dataManager.saveData();

        return { success: true, message: 'Сообщение удалено' };
    }

    handleStartChat(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId } = data;
        if (!userId) {
            return { success: false, message: 'User ID не указан' };
        }

        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        return {
            success: true,
            chatId: userId,
            user: {
                id: targetUser.id,
                displayName: targetUser.displayName,
                avatar: targetUser.avatar,
                verified: targetUser.verified,
                isDeveloper: targetUser.isDeveloper,
                status: targetUser.status
            }
        };
    }

    // СУЩЕСТВУЮЩИЕ И ОБНОВЛЕННЫЕ МЕТОДЫ

    handleLogin(data, req) {
        const { username, password } = data;
        
        // 🔐 Валидация входных данных
        if (!this.securitySystem.validateInput(username, 'username') || !password) {
            return { success: false, message: 'Некорректные данные для входа' };
        }

        const hashedPassword = this.securitySystem.hashPassword(password);
        const user = this.dataManager.users.find(u => u.username === username && u.password === hashedPassword);
        
        if (!user) {
            this.securitySystem.logSecurityEvent({ username }, 'LOGIN', 'SYSTEM', false);
            return { success: false, message: 'Неверное имя пользователя или пароль' };
        }

        // 🔧 ПРОВЕРКА ТЕХНИЧЕСКИХ РАБОТ
        if (this.dataManager.isMaintenanceMode && this.dataManager.isMaintenanceMode() && !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'LOGIN_DURING_MAINTENANCE', 'SYSTEM', false);
            return { 
                success: false, 
                message: 'В настоящее время ведутся технические работы. Пожалуйста, попробуйте позже.' 
            };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'LOGIN', 'SYSTEM', false);
            return { success: false, message: 'Аккаунт заблокирован' };
        }

        const clientIP = getClientIP(req);
        if (this.dataManager.isIPBanned(clientIP)) {
            this.securitySystem.logSecurityEvent(user, 'LOGIN', 'SYSTEM', false);
            return { success: false, message: 'Ваш IP адрес заблокирован' };
        }

        // Обновляем сессию
        user.sessionId = crypto.randomBytes(16).toString('hex');
        const device = this.dataManager.registerDevice(user.id, req);
        
        user.status = 'online';
        user.lastSeen = new Date();
        this.dataManager.saveData();

        const token = Buffer.from(JSON.stringify({
            userId: user.id,
            sessionId: user.sessionId
        })).toString('base64');

        this.securitySystem.logSecurityEvent(user, 'LOGIN', 'SYSTEM');

        return {
            success: true,
            token: token,
            deviceId: device.id,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                avatar: user.avatar,
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
        };
    }

    handleRegister(data, req) {
        const { username, displayName, email, password } = data;

        const clientIP = getClientIP(req);
        if (this.dataManager.isIPBanned(clientIP)) {
            this.securitySystem.logSecurityEvent({ username }, 'REGISTER', 'SYSTEM', false);
            return { success: false, message: 'Ваш IP адрес заблокирован. Регистрация невозможна.' };
        }

        // 🔧 ПРОВЕРКА ТЕХНИЧЕСКИХ РАБОТ
        if (this.dataManager.isMaintenanceMode && this.dataManager.isMaintenanceMode()) {
            this.securitySystem.logSecurityEvent({ username }, 'REGISTER_DURING_MAINTENANCE', 'SYSTEM', false);
            return { 
                success: false, 
                message: 'В настоящее время ведутся технические работы. Регистрация временно недоступна.' 
            };
        }

        if (!username || !displayName || !email || !password) {
            return { success: false, message: 'Все поля обязательны для заполнения' };
        }

        // 🔐 Валидация входных данных
        if (!this.securitySystem.validateInput(username, 'username')) {
            return { success: false, message: 'Некорректное имя пользователя' };
        }
        if (!this.securitySystem.validateInput(displayName, 'displayName')) {
            return { success: false, message: 'Некорректное отображаемое имя' };
        }
        if (!this.securitySystem.validateInput(email, 'email')) {
            return { success: false, message: 'Некорректный email' };
        }

        if (username.length < 3) {
            return { success: false, message: 'Имя пользователя должно содержать минимум 3 символа' };
        }

        if (password.length < 6) {
            return { success: false, message: 'Пароль должен содержать минимум 6 символов' };
        }

        const sanitizedUsername = this.securitySystem.sanitizeContent(username);
        const sanitizedDisplayName = this.securitySystem.sanitizeContent(displayName);
        const sanitizedEmail = this.securitySystem.sanitizeContent(email);

        const existingUser = this.dataManager.users.find(u => u.username === sanitizedUsername);
        if (existingUser) {
            return { success: false, message: 'Пользователь с таким именем уже существует' };
        }

        const existingEmail = this.dataManager.users.find(u => u.email === sanitizedEmail);
        if (existingEmail) {
            return { success: false, message: 'Пользователь с таким email уже существует' };
        }

        const isBayRex = sanitizedUsername.toLowerCase() === 'bayrex';
        
        const newUser = {
            id: this.dataManager.generateId(),
            username: sanitizedUsername,
            displayName: sanitizedDisplayName,
            email: sanitizedEmail,
            password: this.securitySystem.hashPassword(password),
            avatar: null,
            description: 'Новый пользователь Epic Messenger',
            coins: isBayRex ? 50000 : 1000,
            verified: isBayRex,
            isDeveloper: isBayRex,
            isAdmin: isBayRex,
            status: 'online',
            lastSeen: new Date(),
            createdAt: new Date(),
            sessionId: crypto.randomBytes(16).toString('hex'),
            gifts: [],
            isProtected: isBayRex,
            friendsCount: 0,
            postsCount: 0,
            giftsCount: 0,
            banned: false,
            followers: [],
            following: []
        };

        this.dataManager.users.push(newUser);

        const device = this.dataManager.registerDevice(newUser.id, req);
        
        const token = Buffer.from(JSON.stringify({
            userId: newUser.id,
            sessionId: newUser.sessionId
        })).toString('base64');
        
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(newUser, 'REGISTER', 'SYSTEM');

        if (isBayRex) {
            console.log(`👑 BayRex зарегистрирован с правами администратора!`);
        }

        return {
            success: true,
            message: isBayRex ? 
                'Аккаунт BayRex создан! Вы получили права администратора!' :
                'Аккаунт успешно создан! Добро пожаловать в Epic Messenger!',
            token: token,
            deviceId: device.id,
            user: {
                id: newUser.id,
                username: newUser.username,
                displayName: newUser.displayName,
                email: newUser.email,
                avatar: newUser.avatar,
                description: newUser.description,
                coins: newUser.coins,
                verified: newUser.verified,
                isDeveloper: newUser.isDeveloper,
                status: newUser.status,
                lastSeen: newUser.lastSeen,
                createdAt: newUser.createdAt,
                friendsCount: newUser.friendsCount,
                postsCount: newUser.postsCount,
                giftsCount: newUser.giftsCount,
                banned: newUser.banned
            }
        };
    }

    handleCheckAuth(token, req) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { authenticated: false };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'CHECK_AUTH', 'SYSTEM', false);
            return { authenticated: false, message: 'Аккаунт заблокирован' };
        }

        const clientIP = getClientIP(req);
        if (this.dataManager.isIPBanned(clientIP)) {
            this.securitySystem.logSecurityEvent(user, 'CHECK_AUTH', 'SYSTEM', false);
            return { authenticated: false, message: 'IP адрес заблокирован' };
        }

        const deviceId = generateDeviceId(req);
        const device = this.dataManager.devices.get(deviceId);
        if (device && device.userId === user.id) {
            device.lastActive = new Date();
            this.dataManager.saveData();
        }

        this.securitySystem.logSecurityEvent(user, 'CHECK_AUTH', 'SYSTEM');

        return {
            authenticated: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                avatar: user.avatar,
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
        };
    }

    handleCurrentUser(token, req) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'GET_CURRENT_USER', 'SYSTEM', false);
            return { success: false, message: 'Аккаунт заблокирован' };
        }

        const clientIP = getClientIP(req);
        if (this.dataManager.isIPBanned(clientIP)) {
            this.securitySystem.logSecurityEvent(user, 'GET_CURRENT_USER', 'SYSTEM', false);
            return { success: false, message: 'IP адрес заблокирован' };
        }

        const deviceId = generateDeviceId(req);
        const device = this.dataManager.devices.get(deviceId);
        if (device && device.userId === user.id) {
            device.lastActive = new Date();
            this.dataManager.saveData();
        }

        this.securitySystem.logSecurityEvent(user, 'GET_CURRENT_USER', 'SYSTEM');

        return {
            success: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                avatar: user.avatar,
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
        };
    }

    handleLogout(token) {
        const user = this.authenticateToken(token);
        if (user) {
            user.sessionId = crypto.randomBytes(16).toString('hex');
            user.status = 'offline';
            this.dataManager.saveData();
        }
        return { success: true, message: 'Выход выполнен' };
    }

    // 🔧 НОВЫЕ МЕТОДЫ ДЛЯ ТЕХНИЧЕСКИХ РАБОТ
    handleMaintenanceMode(token, data) {
        const user = this.authenticateToken(token);
        
        // 🔐 Только администраторы могут управлять техработами
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'MAINTENANCE_MODE', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { enabled } = data;
        
        this.dataManager.setMaintenanceMode(enabled);
        
        this.securitySystem.logSecurityEvent(user, 'MAINTENANCE_MODE', `enabled:${enabled}`);
        
        console.log(`🔧 Администратор ${user.username} ${enabled ? 'ВКЛЮЧИЛ' : 'выключил'} режим технических работ`);
        
        return {
            success: true,
            message: `Режим технических работ ${enabled ? 'ВКЛЮЧЕН' : 'выключен'}`,
            maintenanceMode: enabled
        };
    }

    handleGetMaintenanceStatus(token) {
        const user = this.authenticateToken(token);
        
        // 🔐 Только администраторы могут смотреть статус
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        return {
            success: true,
            maintenanceMode: this.dataManager.isMaintenanceMode ? this.dataManager.isMaintenanceMode() : false
        };
    }

    handleGetMaintenanceStatusPublic(token) {
        const status = {
            maintenance: this.dataManager.isMaintenanceMode(),
            message: this.dataManager.isMaintenanceMode() ? 
                'Ведутся технические работы' : 'Сервер работает нормально'
        };

        return { success: true, ...status };
    }

    handleGetUsers(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const otherUsers = this.dataManager.users
            .filter(u => u.id !== user.id)
            .map(u => ({
                id: u.id,
                username: u.username,
                displayName: u.displayName,
                avatar: u.avatar,
                description: u.description,
                coins: u.coins,
                verified: u.verified,
                isDeveloper: u.isDeveloper,
                status: u.status,
                lastSeen: u.lastSeen,
                createdAt: u.createdAt,
                friendsCount: u.friendsCount || 0,
                postsCount: u.postsCount || 0,
                giftsCount: u.giftsCount || 0,
                banned: u.banned || false
            }));

        this.securitySystem.logSecurityEvent(user, 'GET_USERS_LIST', `count:${otherUsers.length}`);

        return {
            success: true,
            users: otherUsers
        };
    }

    handleGetUser(token, userId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.id !== userId && !this.securitySystem.isFriend(user.id, userId)) {
            this.securitySystem.logSecurityEvent(user, 'GET_USER', `user:${userId}`, false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        this.securitySystem.logSecurityEvent(user, 'GET_USER', `user:${userId}`);

        return {
            success: true,
            user: {
                id: targetUser.id,
                username: targetUser.username,
                displayName: targetUser.displayName,
                avatar: targetUser.avatar,
                description: targetUser.description,
                coins: targetUser.coins,
                verified: targetUser.verified,
                isDeveloper: targetUser.isDeveloper,
                status: targetUser.status,
                lastSeen: targetUser.lastSeen,
                createdAt: targetUser.createdAt,
                friendsCount: targetUser.friendsCount || 0,
                postsCount: targetUser.postsCount || 0,
                giftsCount: targetUser.giftsCount || 0,
                banned: targetUser.banned || false
            }
        };
    }

    handleGetPosts(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const postsWithUserInfo = this.dataManager.posts.map(post => {
            if (post.userId === 'system') {
                return {
                    ...post,
                    userName: 'Epic Messenger',
                    userAvatar: null,
                    userVerified: true,
                    userDeveloper: true
                };
            }
            
            const postUser = this.dataManager.users.find(u => u.id === post.userId);
            return {
                ...post,
                userName: postUser ? postUser.displayName : 'Неизвестный',
                userAvatar: postUser ? postUser.avatar : null,
                userVerified: postUser ? postUser.verified : false,
                userDeveloper: postUser ? postUser.isDeveloper : false
            };
        });

        postsWithUserInfo.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        this.securitySystem.logSecurityEvent(user, 'GET_POSTS', `count:${postsWithUserInfo.length}`);

        return {
            success: true,
            posts: postsWithUserInfo
        };
    }

    handleGetUserPosts(token, query) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId } = query;
        
        if (!userId) {
            return { success: false, message: 'Не указан пользователь' };
        }

        try {
            const posts = this.dataManager.posts
                .filter(post => post.userId === userId && !post.banned)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map(post => {
                    const postUser = this.dataManager.users.find(u => u.id === post.userId);
                    return {
                        ...post,
                        userName: postUser ? postUser.displayName : 'Неизвестный пользователь',
                        userAvatar: postUser ? postUser.avatar : null,
                        userVerified: postUser ? postUser.verified : false,
                        userIsDeveloper: postUser ? postUser.isDeveloper : false
                    };
                });

            return { success: true, posts: posts };
        } catch (error) {
            console.error('❌ Ошибка получения постов пользователя:', error);
            return { success: false, message: 'Ошибка получения постов пользователя' };
        }
    }

    handleCreatePost(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'CREATE_POST', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        // 🔧 ПРОВЕРКА ТЕХНИЧЕСКИХ РАБОТ
        if (this.dataManager.isMaintenanceMode && this.dataManager.isMaintenanceMode() && !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'CREATE_POST_DURING_MAINTENANCE', 'SYSTEM', false);
            return { 
                success: false, 
                message: 'В настоящее время ведутся технические работы. Функция создания постов временно недоступна.' 
            };
        }

        const { text, image, file, fileName, fileType } = data;
        
        if ((!text || text.trim() === '') && !file && !image) {
            return { success: false, message: 'Текст поста не может быть пустым' };
        }

        let sanitizedText = '';
        if (text && text.trim() !== '') {
            sanitizedText = this.securitySystem.sanitizeContent(text.trim());
            if (sanitizedText.length === 0 && !file && !image) {
                this.securitySystem.logSecurityEvent(user, 'CREATE_POST', 'SYSTEM', false);
                return { success: false, message: 'Текст поста содержит запрещенный контент' };
            }
        }

        const post = {
            id: this.dataManager.generateId(),
            userId: user.id,
            text: sanitizedText,
            image: image,
            file: file,
            fileName: fileName,
            fileType: fileType,
            likes: [],
            comments: [],
            views: 0,
            createdAt: new Date()
        };

        this.dataManager.posts.unshift(post);
        user.postsCount = (user.postsCount || 0) + 1;
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'CREATE_POST', `chars:${sanitizedText.length}`);

        console.log(`📝 Новый пост от ${user.displayName}`);

        return {
            success: true,
            post: {
                ...post,
                userName: user.displayName,
                userAvatar: user.avatar,
                userVerified: user.verified,
                userDeveloper: user.isDeveloper
            }
        };
    }

    handleDeletePost(token, query) {
        const user = this.authenticateToken(token);
        
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'DELETE_POST', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { postId } = query;
        const postIndex = this.dataManager.posts.findIndex(p => p.id === postId);
        
        if (postIndex === -1) {
            return { success: false, message: 'Пост не найден' };
        }

        const post = this.dataManager.posts[postIndex];
        
        if (post.userId === 'system') {
            return { success: false, message: 'Нельзя удалить системный пост' };
        }

        if (post.image && post.image.startsWith('/uploads/posts/')) {
            this.fileHandlers.deleteFile(post.image);
        }

        if (post.file && post.file.startsWith('/uploads/')) {
            this.fileHandlers.deleteFile(post.file);
        }

        this.dataManager.posts.splice(postIndex, 1);

        const postUser = this.dataManager.users.find(u => u.id === post.userId);
        if (postUser && postUser.postsCount > 0) {
            postUser.postsCount--;
        }

        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'DELETE_POST', `post:${postId}, author:${postUser ? postUser.username : 'unknown'}`);

        console.log(`🗑️ Администратор ${user.displayName} удалил пост пользователя ${postUser ? postUser.username : 'unknown'}`);

        return {
            success: true,
            message: 'Пост успешно удален'
        };
    }

    handleLikePost(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'LIKE_POST', `post:${data.postId}`, false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { postId } = data;
        
        if (!postId) {
            return { success: false, message: 'Не указан ID поста' };
        }

        try {
            const post = this.dataManager.posts.find(p => p.id === postId);
            if (!post) {
                return { success: false, message: 'Пост не найден' };
            }

            const likeIndex = post.likes.indexOf(user.id);
            
            if (likeIndex === -1) {
                // Добавляем лайк
                post.likes.push(user.id);
            } else {
                // Убираем лайк
                post.likes.splice(likeIndex, 1);
            }

            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'LIKE_POST', `post:${postId}, action:${likeIndex === -1 ? 'like' : 'unlike'}`);

            return {
                success: true,
                likes: post.likes,
                liked: likeIndex === -1
            };
        } catch (error) {
            console.error('❌ Ошибка лайка поста:', error);
            return { success: false, message: 'Ошибка лайка поста' };
        }
    }

    handleAddComment(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { postId, text, parentCommentId } = data;
        
        if (!postId || !text) {
            return { success: false, message: 'Не указан пост или текст комментария' };
        }

        try {
            const post = this.dataManager.posts.find(p => p.id === postId);
            if (!post) {
                return { success: false, message: 'Пост не найден' };
            }

            if (!post.comments) {
                post.comments = [];
            }

            const comment = {
                id: this.dataManager.generateId(),
                userId: user.id,
                text: this.securitySystem.sanitizeContent(text),
                likes: [],
                replies: [],
                createdAt: new Date()
            };

            if (parentCommentId) {
                // Это ответ на комментарий
                const parentComment = post.comments.find(c => c.id === parentCommentId);
                if (parentComment) {
                    if (!parentComment.replies) {
                        parentComment.replies = [];
                    }
                    parentComment.replies.push(comment);
                } else {
                    return { success: false, message: 'Родительский комментарий не найден' };
                }
            } else {
                // Это основной комментарий
                post.comments.push(comment);
            }

            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'ADD_COMMENT', `post:${postId}, comment:${comment.id}`);

            console.log(`💬 Пользователь ${user.displayName} добавил комментарий к посту ${postId}`);

            return {
                success: true,
                comment: {
                    ...comment,
                    userName: user.displayName,
                    userAvatar: user.avatar,
                    userVerified: user.verified,
                    userIsDeveloper: user.isDeveloper
                },
                message: 'Комментарий добавлен'
            };
        } catch (error) {
            console.error('❌ Ошибка добавления комментария:', error);
            return { success: false, message: 'Ошибка добавления комментария' };
        }
    }

    handleLikeComment(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { postId, commentId } = data;
        if (!postId || !commentId) {
            return { success: false, message: 'Заполните все поля' };
        }

        const post = this.dataManager.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

        const comment = post.comments.find(c => c.id === commentId);
        if (!comment) {
            return { success: false, message: 'Комментарий не найден' };
        }

        const likeIndex = comment.likes.indexOf(user.id);
        if (likeIndex === -1) {
            comment.likes.push(user.id);
        } else {
            comment.likes.splice(likeIndex, 1);
        }

        this.dataManager.saveData();
        return { success: true, message: 'Лайк комментария обновлен', likes: comment.likes };
    }

    handleReplyToComment(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { postId, commentId, text } = data;
        if (!postId || !commentId || !text) {
            return { success: false, message: 'Заполните все поля' };
        }

        const post = this.dataManager.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

        const comment = post.comments.find(c => c.id === commentId);
        if (!comment) {
            return { success: false, message: 'Комментарий не найден' };
        }

        if (!comment.replies) comment.replies = [];

        const reply = {
            id: this.dataManager.generateId(),
            userId: user.id,
            text: text,
            likes: [],
            createdAt: new Date()
        };

        comment.replies.push(reply);
        this.dataManager.saveData();

        return { success: true, message: 'Ответ добавлен', reply: reply };
    }

    handleSharePost(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { postId } = data;
        
        if (!postId) {
            return { success: false, message: 'Не указан ID поста' };
        }

        try {
            const originalPost = this.dataManager.posts.find(p => p.id === postId);
            if (!originalPost) {
                return { success: false, message: 'Пост не найден' };
            }

            // Создаем репост
            const sharePost = {
                id: this.dataManager.generateId(),
                userId: user.id,
                text: `🔁 Репост: ${originalPost.text ? originalPost.text.substring(0, 100) + '...' : 'Пост'}`,
                originalPostId: postId,
                likes: [],
                comments: [],
                views: 0,
                createdAt: new Date(),
                banned: false,
                isShare: true
            };

            this.dataManager.posts.unshift(sharePost);
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'SHARE_POST', `post:${postId}, share:${sharePost.id}`);

            console.log(`🔁 Пользователь ${user.displayName} сделал репост ${postId}`);

            return {
                success: true,
                post: {
                    ...sharePost,
                    userName: user.displayName,
                    userAvatar: user.avatar,
                    userVerified: user.verified,
                    userIsDeveloper: user.isDeveloper
                },
                message: 'Пост успешно опубликован'
            };
        } catch (error) {
            console.error('❌ Ошибка репоста:', error);
            return { success: false, message: 'Ошибка репоста' };
        }
    }

    handleGetGifts(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        this.securitySystem.logSecurityEvent(user, 'GET_GIFTS', `count:${this.dataManager.gifts.length}`);

        return {
            success: true,
            gifts: this.dataManager.gifts
        };
    }

    handleCreateGift(token, data) {
        const user = this.authenticateToken(token);
        
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'CREATE_GIFT', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { name, price, type, image } = data;
        
        if (!name || !price) {
            return { success: false, message: 'Название и цена обязательны' };
        }

        const sanitizedName = this.securitySystem.sanitizeContent(name);

        const gift = {
            id: this.dataManager.generateId(),
            name: sanitizedName,
            type: type || 'custom',
            preview: image ? '🖼️' : '🎁',
            price: parseInt(price),
            image: image,
            createdAt: new Date()
        };

        this.dataManager.gifts.push(gift);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'CREATE_GIFT', `name:${sanitizedName}, price:${price}`);

        console.log(`🎁 Администратор ${user.displayName} создал новый подарок: ${sanitizedName}`);

        return {
            success: true,
            gift: gift
        };
    }

    handleDeleteGift(token, data) {
        const user = this.authenticateToken(token);
        
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'DELETE_GIFT', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { giftId } = data;
        const giftIndex = this.dataManager.gifts.findIndex(g => g.id === giftId);
        
        if (giftIndex === -1) {
            return { success: false, message: 'Подарок не найден' };
        }

        const gift = this.dataManager.gifts[giftIndex];

        if (gift.image && gift.image.startsWith('/uploads/gifts/')) {
            this.fileHandlers.deleteFile(gift.image);
        }

        this.dataManager.gifts.splice(giftIndex, 1);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'DELETE_GIFT', `gift:${gift.name}`);

        console.log(`🗑️ Администратор ${user.displayName} удалил подарок: ${gift.name}`);

        return {
            success: true,
            message: 'Подарок успешно удален'
        };
    }

    handleBuyGift(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'BUY_GIFT', `gift:${data.giftId}`, false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        // 🔧 ПРОВЕРКА ТЕХНИЧЕСКИХ РАБОТ
        if (this.dataManager.isMaintenanceMode && this.dataManager.isMaintenanceMode() && !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'BUY_GIFT_DURING_MAINTENANCE', `gift:${data.giftId}`, false);
            return { 
                success: false, 
                message: 'В настоящее время ведутся технические работы. Функция покупки подарков временно недоступна.' 
            };
        }

        const { giftId, toUserId } = data;
        const gift = this.dataManager.gifts.find(g => g.id === giftId);
        
        if (!gift) {
            return { success: false, message: 'Подарок не найден' };
        }

        if (user.coins < gift.price) {
            this.securitySystem.logSecurityEvent(user, 'BUY_GIFT', `gift:${giftId}`, false);
            return { success: false, message: 'Недостаточно E-COIN для покупки подарка' };
        }

        const recipient = this.dataManager.users.find(u => u.id === toUserId);
        if (!recipient) {
            return { success: false, message: 'Получатель не найден' };
        }

        if (recipient.banned) {
            this.securitySystem.logSecurityEvent(user, 'BUY_GIFT', `gift:${giftId}, to:${toUserId}`, false);
            return { success: false, message: 'Нельзя отправлять подарки заблокированным пользователям' };
        }

        user.coins -= gift.price;

        const giftMessage = {
            id: this.dataManager.generateId(),
            senderId: user.id,
            receiverId: toUserId,
            text: '',
            type: 'gift',
            giftId: gift.id,
            giftName: gift.name,
            giftPrice: gift.price,
            giftImage: gift.image,
            giftPreview: gift.preview,
            timestamp: new Date(),
            displayName: user.displayName,
            read: false
        };

        this.dataManager.messages.push(giftMessage);

        if (!recipient.gifts) recipient.gifts = [];
        recipient.gifts.push({
            id: this.dataManager.generateId(),
            giftId: gift.id,
            fromUserId: user.id,
            fromUserName: user.displayName,
            receivedAt: new Date()
        });

        recipient.giftsCount = (recipient.giftsCount || 0) + 1;

        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'BUY_GIFT', `gift:${gift.name}, to:${recipient.username}, price:${gift.price}`);

        console.log(`🎁 Пользователь ${user.displayName} отправил подарок "${gift.name}" пользователю ${recipient.displayName}`);

        return {
            success: true,
            message: `Подарок "${gift.name}" успешно отправлен!`,
            gift: gift,
            user: {
                coins: user.coins
            }
        };
    }

    handleGetUserGifts(token, query) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId } = query;
        
        if (!userId) {
            return { success: false, message: 'Не указан пользователь' };
        }

        try {
            const sentGifts = this.dataManager.sentGifts || [];
            const userGifts = sentGifts.filter(gift => gift.toUserId === userId);

            // Добавляем информацию об отправителе
            const giftsWithSenders = userGifts.map(gift => {
                const fromUser = this.dataManager.users.find(u => u.id === gift.fromUserId);
                return {
                    ...gift,
                    fromUserName: fromUser ? fromUser.displayName : 'Неизвестный пользователь',
                    fromUserAvatar: fromUser ? fromUser.avatar : null
                };
            });

            return { success: true, gifts: giftsWithSenders };
        } catch (error) {
            console.error('❌ Ошибка получения подарков пользователя:', error);
            return { success: false, message: 'Ошибка получения подарков пользователя' };
        }
    }

    handleGetPromoCodes(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        this.securitySystem.logSecurityEvent(user, 'GET_PROMOCODES', `count:${this.dataManager.promoCodes.length}`);

        return {
            success: true,
            promoCodes: this.dataManager.promoCodes
        };
    }

    handleCreatePromoCode(token, data) {
        const user = this.authenticateToken(token);
        
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'CREATE_PROMOCODE', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { code, coins, max_uses } = data;
        
        if (!code || !coins) {
            return { success: false, message: 'Код и количество коинов обязательны' };
        }

        const sanitizedCode = this.securitySystem.sanitizeContent(code.toUpperCase());

        const existingPromo = this.dataManager.promoCodes.find(p => p.code === sanitizedCode);
        if (existingPromo) {
            return { success: false, message: 'Промокод с таким кодом уже существует' };
        }

        const promoCode = {
            id: this.dataManager.generateId(),
            code: sanitizedCode,
            coins: parseInt(coins),
            max_uses: max_uses || 0,
            used_count: 0,
            created_at: new Date()
        };

        this.dataManager.promoCodes.push(promoCode);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'CREATE_PROMOCODE', `code:${sanitizedCode}, coins:${coins}`);

        console.log(`🎫 Администратор ${user.username} создал промокод: ${sanitizedCode}`);

        return {
            success: true,
            promoCode: promoCode
        };
    }

    handleDeletePromoCode(token, data) {
        const user = this.authenticateToken(token);
        
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'DELETE_PROMOCODE', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { promoCodeId } = data;
        const promoIndex = this.dataManager.promoCodes.findIndex(p => p.id === promoCodeId);
        
        if (promoIndex === -1) {
            return { success: false, message: 'Промокод не найден' };
        }

        const promoCode = this.dataManager.promoCodes[promoIndex];

        this.dataManager.promoCodes.splice(promoIndex, 1);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'DELETE_PROMOCODE', `code:${promoCode.code}`);

        console.log(`🗑️ Администратор ${user.displayName} удалил промокод: ${promoCode.code}`);

        return {
            success: true,
            message: 'Промокод успешно удален'
        };
    }

    handleActivatePromoCode(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'ACTIVATE_PROMOCODE', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        // 🔧 ПРОВЕРКА ТЕХНИЧЕСКИХ РАБОТ
        if (this.dataManager.isMaintenanceMode && this.dataManager.isMaintenanceMode() && !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'ACTIVATE_PROMOCODE_DURING_MAINTENANCE', 'SYSTEM', false);
            return { 
                success: false, 
                message: 'В настоящее время ведутся технические работы. Функция активации промокодов временно недоступна.' 
            };
        }

        const { code } = data;
        
        if (!this.securitySystem.validateInput(code, 'text')) {
            return { success: false, message: 'Некорректный промокод' };
        }

        const sanitizedCode = this.securitySystem.sanitizeContent(code.toUpperCase());
        const promoCode = this.dataManager.promoCodes.find(p => p.code === sanitizedCode);

        if (!promoCode) {
            this.securitySystem.logSecurityEvent(user, 'ACTIVATE_PROMOCODE', `code:${sanitizedCode}`, false);
            return { success: false, message: 'Промокод не найден' };
        }

        if (promoCode.max_uses > 0 && promoCode.used_count >= promoCode.max_uses) {
            this.securitySystem.logSecurityEvent(user, 'ACTIVATE_PROMOCODE', `code:${sanitizedCode}`, false);
            return { success: false, message: 'Промокод уже использован максимальное количество раз' };
        }

        user.coins += promoCode.coins;
        promoCode.used_count++;
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'ACTIVATE_PROMOCODE', `code:${sanitizedCode}, coins:${promoCode.coins}`);

        console.log(`💰 Пользователь ${user.displayName} активировал промокод ${sanitizedCode} (+${promoCode.coins} E-COIN)`);

        return {
            success: true,
            message: `Промокод активирован! Начислено ${promoCode.coins} E-COIN`,
            coins: promoCode.coins,
            user: {
                coins: user.coins
            }
        };
    }

    handleUpdateProfile(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'UPDATE_PROFILE', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        // 🔧 ПРОВЕРКА ТЕХНИЧЕСКИХ РАБОТ
        if (this.dataManager.isMaintenanceMode && this.dataManager.isMaintenanceMode() && !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'UPDATE_PROFILE_DURING_MAINTENANCE', 'SYSTEM', false);
            return { 
                success: false, 
                message: 'В настоящее время ведутся технические работы. Функция обновления профиля временно недоступна.' 
            };
        }

        const { displayName, description, username, email } = data;

        if (displayName && displayName.trim()) {
            if (!this.securitySystem.validateInput(displayName, 'displayName')) {
                return { success: false, message: 'Некорректное отображаемое имя' };
            }
            user.displayName = this.securitySystem.sanitizeContent(displayName.trim());
        }

        if (description !== undefined) {
            user.description = this.securitySystem.sanitizeContent(description);
        }

        if (username && username.trim() && username !== user.username) {
            const sanitizedUsername = this.securitySystem.sanitizeContent(username.trim());
            
            if (!this.securitySystem.validateInput(sanitizedUsername, 'username')) {
                return { success: false, message: 'Некорректное имя пользователя' };
            }
            
            const existingUser = this.dataManager.users.find(u => u.username === sanitizedUsername && u.id !== user.id);
            if (existingUser) {
                this.securitySystem.logSecurityEvent(user, 'UPDATE_PROFILE', `username:${sanitizedUsername}`, false);
                return { success: false, message: 'Имя пользователя уже занято' };
            }
            user.username = sanitizedUsername;
        }

        if (email && email.trim() && email !== user.email) {
            const sanitizedEmail = this.securitySystem.sanitizeContent(email.trim());
            
            if (!this.securitySystem.validateInput(sanitizedEmail, 'email')) {
                return { success: false, message: 'Некорректный email' };
            }
            
            const existingEmail = this.dataManager.users.find(u => u.email === sanitizedEmail && u.id !== user.id);
            if (existingEmail) {
                this.securitySystem.logSecurityEvent(user, 'UPDATE_PROFILE', `email:${sanitizedEmail}`, false);
                return { success: false, message: 'Email уже используется' };
            }
            user.email = sanitizedEmail;
        }

        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'UPDATE_PROFILE', 'SYSTEM');

        console.log(`📝 Пользователь ${user.username} обновил профиль`);

        return {
            success: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                avatar: user.avatar,
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
        };
    }

    handleUpdateAvatar(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'UPDATE_AVATAR', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        // 🔧 ПРОВЕРКА ТЕХНИЧЕСКИХ РАБОТ
        if (this.dataManager.isMaintenanceMode && this.dataManager.isMaintenanceMode() && !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'UPDATE_AVATAR_DURING_MAINTENANCE', 'SYSTEM', false);
            return { 
                success: false, 
                message: 'В настоящее время ведутся технические работы. Функция обновления аватара временно недоступна.' 
            };
        }

        const { avatar } = data;

        if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
            this.fileHandlers.deleteFile(user.avatar);
        }

        user.avatar = avatar;
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'UPDATE_AVATAR', 'SYSTEM');

        console.log(`🖼️ Пользователь ${user.username} обновил аватар`);

        return {
            success: true,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                email: user.email,
                avatar: user.avatar,
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
        };
    }

    async handleUploadAvatar(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_AVATAR', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { fileData, filename } = data;

        if (!this.fileHandlers.validateAvatarFile(filename)) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_AVATAR', `file:${filename}`, false);
            return { success: false, message: 'Недопустимый формат файла для аватара' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `avatar_${user.id}_${Date.now()}${fileExt}`;
            
            const fileUrl = await this.fileHandlers.saveFile(fileData, uniqueFilename, 'avatar');

            if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
                this.fileHandlers.deleteFile(user.avatar);
            }

            user.avatar = fileUrl;
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'UPLOAD_AVATAR', `file:${filename}`);

            console.log(`🖼️ Пользователь ${user.username} загрузил аватар: ${filename}`);

            return {
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
            };
        } catch (error) {
            console.error('Ошибка загрузки аватара:', error);
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_AVATAR', `file:${filename}`, false);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    async handleUploadPostImage(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { fileData, filename } = data;

        if (!this.fileHandlers.validatePostFile(filename)) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${filename}`, false);
            return { success: false, message: 'Недопустимый формат файла для поста' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `post_${user.id}_${Date.now()}${fileExt}`;
            
            const fileUrl = await this.fileHandlers.saveFile(fileData, uniqueFilename, 'post');

            this.securitySystem.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${filename}`);

            console.log(`📸 Пользователь ${user.username} загрузил файл для поста: ${filename}`);

            return {
                success: true,
                imageUrl: fileUrl
            };
        } catch (error) {
            console.error('Ошибка загрузки файла для поста:', error);
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${filename}`, false);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    async handleUploadFile(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { fileData, filename, fileType } = data;

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `file_${user.id}_${Date.now()}${fileExt}`;
            let uploadDir = 'files';
            
            if (fileType === 'image') uploadDir = 'images';
            else if (fileType === 'video') uploadDir = 'videos';
            else if (fileType === 'audio') uploadDir = 'audio';
            
            const fileUrl = await this.fileHandlers.saveFile(fileData, uniqueFilename, uploadDir);

            this.securitySystem.logSecurityEvent(user, 'UPLOAD_FILE', `file:${filename}, type:${fileType}`);

            return {
                success: true,
                fileUrl: fileUrl
            };
        } catch (error) {
            console.error('Ошибка загрузки файла:', error);
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_FILE', `file:${filename}`, false);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    async handleUploadGift(token, data) {
        const user = this.authenticateToken(token);
        
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_GIFT', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { fileData, filename } = data;

        if (!this.fileHandlers.validateGiftFile(filename)) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_GIFT', `file:${filename}`, false);
            return { success: false, message: 'Недопустимый формат файла для подарка' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `gift_${Date.now()}${fileExt}`;
            
            const fileUrl = await this.fileHandlers.saveFile(fileData, uniqueFilename, 'gift');

            this.securitySystem.logSecurityEvent(user, 'UPLOAD_GIFT', `file:${filename}`);

            console.log(`🎁 Администратор ${user.username} загрузил изображение подарка: ${filename}`);

            return {
                success: true,
                imageUrl: fileUrl
            };
        } catch (error) {
            console.error('Ошибка загрузки изображения подарка:', error);
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_GIFT', `file:${filename}`, false);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    handlePreviewAvatar(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { fileData, filename } = data;
        
        if (!this.fileHandlers.validateAvatarFile(filename)) {
            return { success: false, message: 'Недопустимый формат файла для аватара' };
        }

        try {
            if (fileData.length > 2 * 1024 * 1024) {
                return { success: false, message: 'Размер файла не должен превышать 2 МБ' };
            }

            return {
                success: true,
                previewUrl: fileData,
                fileName: filename
            };
        } catch (error) {
            console.error('Ошибка предпросмотра аватара:', error);
            return { success: false, message: 'Ошибка обработки файла' };
        }
    }

    handleDebugUpload(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        return {
            success: true,
            message: 'Upload debug endpoint',
            user: user.username,
            timestamp: new Date().toISOString()
        };
    }

    handleGetEmoji(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        try {
            const emojiPath = path.join(process.cwd(), 'public', 'assets', 'emoji');
            const files = fs.readdirSync(emojiPath);
            const emojiList = files.filter(file => 
                file.endsWith('.png') || file.endsWith('.svg') || file.endsWith('.gif')
            ).map(file => ({
                name: file,
                url: `/assets/emoji/${file}`
            }));

            this.securitySystem.logSecurityEvent(user, 'GET_EMOJI', `count:${emojiList.length}`);

            return {
                success: true,
                emoji: emojiList
            };
        } catch (error) {
            this.securitySystem.logSecurityEvent(user, 'GET_EMOJI', 'SYSTEM', false);
            return {
                success: true,
                emoji: []
            };
        }
    }

    handleGetUserByUsername(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { username } = data;
        
        if (!this.securitySystem.validateInput(username, 'username')) {
            return { success: false, message: 'Некорректное имя пользователя' };
        }

        const targetUser = this.dataManager.users.find(u => u.username === username);
        
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        const userGifts = this.dataManager.messages
            .filter(msg => msg.type === 'gift' && msg.receiverId === targetUser.id)
            .map(msg => ({
                id: msg.id,
                giftId: msg.giftId,
                giftName: msg.giftName,
                giftImage: msg.giftImage,
                fromUserId: msg.senderId,
                fromUserName: msg.displayName,
                timestamp: msg.timestamp
            }));

        const userPosts = this.dataManager.posts.filter(post => post.userId === targetUser.id);

        return {
            success: true,
            user: {
                id: targetUser.id,
                username: targetUser.username,
                displayName: targetUser.displayName,
                avatar: targetUser.avatar,
                description: targetUser.description,
                coins: targetUser.coins,
                verified: targetUser.verified,
                isDeveloper: targetUser.isDeveloper,
                status: targetUser.status,
                lastSeen: targetUser.lastSeen,
                createdAt: targetUser.createdAt,
                friendsCount: targetUser.friendsCount || 0,
                postsCount: targetUser.postsCount || 0,
                giftsCount: targetUser.giftsCount || 0,
                banned: targetUser.banned || false
            },
            gifts: userGifts,
            posts: userPosts
        };
    }

    handleGetUserByUsernameMobile(token, data) {
        const { username } = data;
        
        if (!username) {
            return { success: false, message: 'Username не указан' };
        }

        const targetUser = this.dataManager.users.find(u => u.username === username);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        // Формируем безопасный ответ без чувствительных данных
        const userData = {
            id: targetUser.id,
            username: targetUser.username,
            displayName: targetUser.displayName,
            avatar: targetUser.avatar,
            description: targetUser.description,
            coins: targetUser.coins || 0,
            verified: targetUser.verified || false,
            isDeveloper: targetUser.isDeveloper || false,
            status: targetUser.status || 'offline',
            lastSeen: targetUser.lastSeen,
            createdAt: targetUser.createdAt,
            postsCount: this.dataManager.posts.filter(p => p.userId === targetUser.id).length,
            followersCount: targetUser.followers ? targetUser.followers.length : 0,
            followingCount: targetUser.following ? targetUser.following.length : 0
        };

        return { success: true, message: 'Данные пользователя получены', user: userData };
    }

    handleGetUserPostsMobile(token, data) {
        const { userId } = data;
        
        if (!userId) {
            return { success: false, message: 'User ID не указан' };
        }

        const userPosts = this.dataManager.posts
            .filter(post => post.userId === userId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map(post => {
                const postUser = this.dataManager.users.find(u => u.id === post.userId);
                return {
                    id: post.id,
                    text: post.text,
                    image: post.image,
                    file: post.file,
                    fileName: post.fileName,
                    fileType: post.fileType,
                    likes: post.likes || [],
                    comments: post.comments || [],
                    views: post.views || 0,
                    createdAt: post.createdAt,
                    user: {
                        id: postUser?.id,
                        username: postUser?.username,
                        displayName: postUser?.displayName,
                        avatar: postUser?.avatar,
                        verified: postUser?.verified || false,
                        isDeveloper: postUser?.isDeveloper || false
                    }
                };
            });

        return { success: true, message: 'Посты пользователя получены', posts: userPosts };
    }

    handleGetMyGifts(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const myGifts = this.dataManager.messages
            .filter(msg => msg.type === 'gift' && msg.receiverId === user.id)
            .map(msg => ({
                id: msg.id,
                giftId: msg.giftId,
                giftName: msg.giftName,
                giftImage: msg.giftImage,
                giftPreview: msg.giftPreview,
                fromUserId: msg.senderId,
                fromUserName: msg.displayName,
                timestamp: msg.timestamp,
                giftPrice: msg.giftPrice
            }))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return {
            success: true,
            gifts: myGifts
        };
    }

    handleGetBalance(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        return {
            success: true,
            balance: user.coins || 0 
        };
    }

    handleGetUserGroups(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const userGroups = this.dataManager.groups.filter(group => 
            group.members.includes(user.id)
        );

        return {
            success: true,
            groups: userGroups
        };
    }

    handleAddToGroup(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { groupId, userId } = data;
        
        const group = this.dataManager.groups.find(g => g.id === groupId);
        if (!group) {
            return { success: false, message: 'Группа не найдена' };
        }

        if (!group.admins.includes(user.id)) {
            this.securitySystem.logSecurityEvent(user, 'ADD_TO_GROUP', `group:${groupId}`, false);
            return { success: false, message: 'Недостаточно прав' };
        }

        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        if (group.members.includes(userId)) {
            return { success: false, message: 'Пользователь уже в группе' };
        }

        group.members.push(userId);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'ADD_TO_GROUP', `group:${groupId}, user:${userId}`);

        return {
            success: true,
            message: 'Пользователь добавлен в группу'
        };
    }

    handleJoinGroup(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { groupId, inviteLink } = data;
        if (!groupId && !inviteLink) {
            return { success: false, message: 'Укажите группу или пригласительную ссылку' };
        }

        let group;
        if (groupId) {
            group = this.dataManager.groups.find(g => g.id === groupId);
        } else {
            group = this.dataManager.groups.find(g => g.inviteLink === inviteLink);
        }

        if (!group) {
            return { success: false, message: 'Группа не найдена' };
        }

        if (group.members.includes(user.id)) {
            return { success: false, message: 'Вы уже в этой группе' };
        }

        if (group.isPrivate && !inviteLink) {
            return { success: false, message: 'Для вступления в приватную группу нужна пригласительная ссылка' };
        }

        group.members.push(user.id);
        this.dataManager.saveData();

        return { success: true, message: 'Вы присоединились к группе' };
    }

    handleLeaveGroup(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { groupId } = data;
        if (!groupId) {
            return { success: false, message: 'Group ID не указан' };
        }

        const group = this.dataManager.groups.find(g => g.id === groupId);
        if (!group) {
            return { success: false, message: 'Группа не найдена' };
        }

        const memberIndex = group.members.indexOf(user.id);
        if (memberIndex === -1) {
            return { success: false, message: 'Вы не состоите в этой группе' };
        }

        group.members.splice(memberIndex, 1);
        
        // Если группа пустая, удаляем её
        if (group.members.length === 0) {
            const groupIndex = this.dataManager.groups.findIndex(g => g.id === groupId);
            this.dataManager.groups.splice(groupIndex, 1);
        }

        this.dataManager.saveData();
        return { success: true, message: 'Вы вышли из группы' };
    }

    handleGetMusic(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const musicWithUserInfo = this.dataManager.music.map(track => {
            const trackUser = this.dataManager.users.find(u => u.id === track.userId);
            return {
                ...track,
                userName: trackUser ? trackUser.displayName : 'Неизвестный',
                userAvatar: trackUser ? trackUser.avatar : null,
                userVerified: trackUser ? trackUser.verified : false
            };
        });

        this.securitySystem.logSecurityEvent(user, 'GET_MUSIC', `count:${musicWithUserInfo.length}`);

        return {
            success: true,
            music: musicWithUserInfo
        };
    }

    handleUploadMusic(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_METADATA', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { title, artist, duration, fileUrl, coverUrl, genre } = data;
        
        if (!title || !artist || !fileUrl) {
            return { success: false, message: 'Название, исполнитель и файл обязательны' };
        }

        const sanitizedTitle = this.securitySystem.sanitizeContent(title);
        const sanitizedArtist = this.securitySystem.sanitizeContent(artist);
        const sanitizedGenre = genre ? this.securitySystem.sanitizeContent(genre) : 'Не указан';

        const track = {
            id: this.dataManager.generateId(),
            userId: user.id,
            title: sanitizedTitle,
            artist: sanitizedArtist,
            duration: duration || 0,
            fileUrl: fileUrl,
            coverUrl: coverUrl || '/assets/default-cover.png',
            genre: sanitizedGenre,
            plays: 0,
            likes: [],
            createdAt: new Date()
        };

        this.dataManager.music.unshift(track);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_METADATA', `track:${sanitizedTitle} - ${sanitizedArtist}`);

        console.log(`🎵 Пользователь ${user.displayName} загрузил трек: ${sanitizedTitle} - ${sanitizedArtist}`);

        return {
            success: true,
            track: {
                ...track,
                userName: user.displayName,
                userAvatar: user.avatar,
                userVerified: user.verified
            }
        };
    }

    async handleUploadMusicFile(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_FILE', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { fileData, filename } = data;
        
        if (!this.fileHandlers.validateMusicFile(filename)) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_FILE', `file:${filename}`, false);
            return { success: false, message: 'Недопустимый формат аудио файла' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `music_${user.id}_${Date.now()}${fileExt}`;
            
            const fileUrl = await this.fileHandlers.saveFile(fileData, uniqueFilename, 'music');

            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_FILE', `file:${filename}`);

            return {
                success: true,
                fileUrl: fileUrl
            };
        } catch (error) {
            console.error('Ошибка загрузки аудио файла:', error);
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_FILE', `file:${filename}`, false);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    handleUploadMusicFull(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        return { success: true, message: 'Музыка загружена (full)' };
    }

    async handleUploadMusicCover(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_COVER', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { fileData, filename } = data;
        
        if (!this.fileHandlers.validateCoverFile(filename)) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_COVER', `file:${filename}`, false);
            return { success: false, message: 'Недопустимый формат изображения' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `cover_${user.id}_${Date.now()}${fileExt}`;
            
            const fileUrl = await this.fileHandlers.saveFile(fileData, uniqueFilename, 'music/covers');

            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_COVER', `file:${filename}`);

            return {
                success: true,
                coverUrl: fileUrl
            };
        } catch (error) {
            console.error('Ошибка загрузки обложки:', error);
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_COVER', `file:${filename}`, false);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    handleDeleteMusic(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { trackId } = data;
        const trackIndex = this.dataManager.music.findIndex(t => t.id === trackId);
        
        if (trackIndex === -1) {
            return { success: false, message: 'Трек не найден' };
        }

        const track = this.dataManager.music[trackIndex];
        
        if (track.userId !== user.id && !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'DELETE_MUSIC', `track:${trackId}`, false);
            return { success: false, message: 'Вы можете удалять только свои треки' };
        }

        if (track.fileUrl && track.fileUrl.startsWith('/uploads/music/')) {
            this.fileHandlers.deleteFile(track.fileUrl);
        }

        if (track.coverUrl && track.coverUrl.startsWith('/uploads/music/covers/')) {
            this.fileHandlers.deleteFile(track.coverUrl);
        }

        this.dataManager.music.splice(trackIndex, 1);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'DELETE_MUSIC', `track:${track.title}`);

        console.log(`🗑️ Трек удален: ${track.title}`);

        return {
            success: true,
            message: 'Трек успешно удален'
        };
    }

    handleSearchMusic(token, query) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { q } = query;
        if (!q || q.trim() === '') {
            return this.handleGetMusic(token);
        }

        const searchTerm = q.toLowerCase().trim();
        const filteredMusic = this.dataManager.music.filter(track => 
            track.title.toLowerCase().includes(searchTerm) ||
            track.artist.toLowerCase().includes(searchTerm) ||
            track.genre.toLowerCase().includes(searchTerm)
        );

        const musicWithUserInfo = filteredMusic.map(track => {
            const trackUser = this.dataManager.users.find(u => u.id === track.userId);
            return {
                ...track,
                userName: trackUser ? trackUser.displayName : 'Неизвестный',
                userAvatar: trackUser ? trackUser.avatar : null,
                userVerified: trackUser ? trackUser.verified : false
            };
        });

        this.securitySystem.logSecurityEvent(user, 'SEARCH_MUSIC', `term:${q}, results:${musicWithUserInfo.length}`);

        return {
            success: true,
            music: musicWithUserInfo,
            searchTerm: q
        };
    }

    handleGetRandomMusic(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (this.dataManager.music.length === 0) {
            return {
                success: true,
                music: []
            };
        }

        const shuffled = [...this.dataManager.music].sort(() => 0.5 - Math.random());
        const randomMusic = shuffled.slice(0, 10);

        const musicWithUserInfo = randomMusic.map(track => {
            const trackUser = this.dataManager.users.find(u => u.id === track.userId);
            return {
                ...track,
                userName: trackUser ? trackUser.displayName : 'Неизвестный',
                userAvatar: trackUser ? trackUser.avatar : null,
                userVerified: trackUser ? trackUser.verified : false
            };
        });

        this.securitySystem.logSecurityEvent(user, 'GET_RANDOM_MUSIC', `count:${musicWithUserInfo.length}`);

        return {
            success: true,
            music: musicWithUserInfo
        };
    }

    handleGetPlaylists(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const userPlaylists = this.dataManager.playlists.filter(p => p.userId === user.id);
        
        this.securitySystem.logSecurityEvent(user, 'GET_PLAYLISTS', `count:${userPlaylists.length}`);

        return {
            success: true,
            playlists: userPlaylists
        };
    }

    handleCreatePlaylist(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'CREATE_PLAYLIST', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { name, description } = data;
        
        if (!name || name.trim() === '') {
            return { success: false, message: 'Название плейлиста обязательно' };
        }

        const sanitizedName = this.securitySystem.sanitizeContent(name.trim());
        const sanitizedDescription = description ? this.securitySystem.sanitizeContent(description) : '';

        const playlist = {
            id: this.dataManager.generateId(),
            userId: user.id,
            name: sanitizedName,
            description: sanitizedDescription,
            tracks: [],
            cover: null,
            createdAt: new Date()
        };

        this.dataManager.playlists.push(playlist);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'CREATE_PLAYLIST', `name:${sanitizedName}`);

        console.log(`🎵 Создан плейлист: ${sanitizedName}`);

        return {
            success: true,
            playlist: playlist
        };
    }

    handleAddToPlaylist(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'ADD_TO_PLAYLIST', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { playlistId, trackId } = data;
        
        const playlist = this.dataManager.playlists.find(p => p.id === playlistId && p.userId === user.id);
        if (!playlist) {
            return { success: false, message: 'Плейлист не найден' };
        }

        const track = this.dataManager.music.find(t => t.id === trackId);
        if (!track) {
            return { success: false, message: 'Трек не найден' };
        }

        if (playlist.tracks.includes(trackId)) {
            return { success: false, message: 'Трек уже есть в плейлисте' };
        }

        playlist.tracks.push(trackId);

        if (!playlist.cover && playlist.tracks.length === 1) {
            playlist.cover = track.coverUrl;
        }

        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'ADD_TO_PLAYLIST', `playlist:${playlist.name}, track:${track.title}`);

        console.log(`🎵 Трек добавлен в плейлист: ${playlist.name}`);

        return {
            success: true,
            playlist: playlist
        };
    }

    handleAddTrackToPlaylist(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { playlistId, trackId } = data;
        
        if (!playlistId || !trackId) {
            return { success: false, message: 'Не указан плейлист или трек' };
        }

        try {
            const playlist = this.dataManager.playlists.find(p => p.id === playlistId && p.userId === user.id);
            if (!playlist) {
                return { success: false, message: 'Плейлист не найден' };
            }

            const track = this.dataManager.music.find(t => t.id === trackId);
            if (!track) {
                return { success: false, message: 'Трек не найден' };
            }

            if (!playlist.tracks.includes(trackId)) {
                playlist.tracks.push(trackId);
                this.dataManager.saveData();

                this.securitySystem.logSecurityEvent(user, 'ADD_TRACK_TO_PLAYLIST', `playlist:${playlistId}, track:${trackId}`);

                return {
                    success: true,
                    message: 'Трек добавлен в плейлист'
                };
            } else {
                return { success: false, message: 'Трек уже есть в плейлисте' };
            }
        } catch (error) {
            console.error('❌ Ошибка добавления трека в плейлист:', error);
            return { success: false, message: 'Ошибка добавления трека в плейлист' };
        }
    }

    handleAdminStats(token) {
        const user = this.authenticateToken(token);
        
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'VIEW_ADMIN_STATS', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        this.securitySystem.logSecurityEvent(user, 'VIEW_ADMIN_STATS', 'SYSTEM');

        return {
            success: true,
            stats: {
                totalUsers: this.dataManager.users.length,
                totalMessages: this.dataManager.messages.length,
                totalPosts: this.dataManager.posts.length,
                totalGifts: this.dataManager.gifts.length,
                totalPromoCodes: this.dataManager.promoCodes.length,
                totalMusic: this.dataManager.music.length,
                totalPlaylists: this.dataManager.playlists.length,
                totalGroups: this.dataManager.groups.length,
                onlineUsers: this.dataManager.users.filter(u => u.status === 'online').length,
                bannedUsers: this.dataManager.users.filter(u => u.banned).length,
                bannedIPs: this.dataManager.bannedIPs.size,
                activeDevices: this.dataManager.devices.size,
                maintenanceMode: this.dataManager.isMaintenanceMode ? this.dataManager.isMaintenanceMode() : false
            }
        };
    }

    handleAdminStatistics(token) {
        const user = this.authenticateToken(token);
        
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        const stats = {
            totalUsers: this.dataManager.users.length,
            totalMessages: this.dataManager.messages.length,
            totalPosts: this.dataManager.posts.length,
            totalGifts: this.dataManager.gifts.length,
            totalMusic: this.dataManager.music.length,
            totalGroups: this.dataManager.groups.length,
            onlineUsers: this.dataManager.users.filter(u => u.status === 'online').length,
            bannedIPs: this.dataManager.bannedIPs.size,
            maintenanceMode: this.dataManager.maintenanceMode,
            dataFileSize: this.getFileSize(this.dataManager.dataFile)
        };

        return { success: true, message: 'Статистика получена', statistics: stats };
    }

    getFileSize(filePath) {
        try {
            const stats = fs.statSync(filePath);
            return (stats.size / 1024 / 1024).toFixed(2) + ' MB';
        } catch (error) {
            return 'Unknown';
        }
    }

    handleDeleteUser(token, data) {
        const user = this.authenticateToken(token);
        
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'DELETE_USER', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
        
        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        if (targetUser.isProtected) {
            return { success: false, message: 'Нельзя удалить защищенного пользователя' };
        }

        if (targetUser.id === user.id) {
            return { success: false, message: 'Нельзя удалить свой собственный аккаунт' };
        }

        if (targetUser.avatar && targetUser.avatar.startsWith('/uploads/avatars/')) {
            this.fileHandlers.deleteFile(targetUser.avatar);
        }

        Array.from(this.dataManager.devices.entries()).forEach(([deviceId, device]) => {
            if (device.userId === userId) {
                this.dataManager.devices.delete(deviceId);
            }
        });

        this.dataManager.users = this.dataManager.users.filter(u => u.id !== userId);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'DELETE_USER', `user:${targetUser.username}`);

        console.log(`🗑️ Администратор ${user.displayName} удалил аккаунт: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} успешно удален`
        };
    }

    handleBanUser(token, data) {
        const user = this.authenticateToken(token);
        
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'BAN_USER', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId, reason } = data;
        
        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        if (targetUser.isProtected) {
            return { success: false, message: 'Нельзя заблокировать защищенного пользователя' };
        }

        targetUser.banned = true;

        // Бан по IP
        const userDevices = this.dataManager.getUserDevices(userId);
        if (userDevices.length > 0) {
            const lastDevice = userDevices[userDevices.length - 1];
            this.dataManager.banIP(lastDevice.ip);
        }

        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'BAN_USER', `user:${targetUser.username}, reason:${reason}`);

        console.log(`🔒 Администратор ${user.displayName} заблокировал аккаунт: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} заблокирован`
        };
    }

    handleUnbanUser(token, data) {
        const user = this.authenticateToken(token);
        
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'UNBAN_USER', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { ip } = data;
        if (!ip) {
            return { success: false, message: 'IP не указан' };
        }

        this.dataManager.bannedIPs.delete(ip);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'UNBAN_USER', `ip:${ip}`);

        return { success: true, message: `IP ${ip} разбанен` };
    }

    handleToggleVerification(token, data) {
        const user = this.authenticateToken(token);
        
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'TOGGLE_VERIFICATION', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
            
        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        targetUser.verified = !targetUser.verified;
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'TOGGLE_VERIFICATION', `user:${targetUser.username}, status:${targetUser.verified}`);

        console.log(`✅ Администратор ${user.displayName} ${targetUser.verified ? 'верифицировал' : 'снял верификацию с'} аккаунта: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} ${targetUser.verified ? 'верифицирован' : 'лишен верификации'}`,
            verified: targetUser.verified
        };
    }

    handleToggleDeveloper(token, data) {
        const user = this.authenticateToken(token);
        
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'TOGGLE_DEVELOPER', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { userId } = data;
            
        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        targetUser.isDeveloper = !targetUser.isDeveloper;
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'TOGGLE_DEVELOPER', `user:${targetUser.username}, status:${targetUser.isDeveloper}`);

        console.log(`👑 Администратор ${user.displayName} ${targetUser.isDeveloper ? 'дал права разработчика' : 'забрал права разработчика'} у: ${targetUser.username}`);

        return {
            success: true,
            message: `Пользователь ${targetUser.username} ${targetUser.isDeveloper ? 'получил права разработчика' : 'лишен прав разработчика'}`,
            isDeveloper: targetUser.isDeveloper
        };
    }

    handleAdminGetUsers(token) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Недостаточно прав' };
        }

        const users = this.dataManager.users.map(u => ({
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            coins: u.coins,
            verified: u.verified,
            isDeveloper: u.isDeveloper,
            status: u.status,
            lastSeen: u.lastSeen,
            createdAt: u.createdAt,
            postsCount: this.dataManager.posts.filter(p => p.userId === u.id).length,
            messagesCount: this.dataManager.messages.filter(m => m.senderId === u.id).length
        }));

        return { success: true, users: users };
    }

    handleAdminVerifyUser(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Недостаточно прав' };
        }

        const { userId, verified } = data;
        
        if (!userId) {
            return { success: false, message: 'Не указан пользователь' };
        }

        try {
            const targetUser = this.dataManager.users.find(u => u.id === userId);
            if (!targetUser) {
                return { success: false, message: 'Пользователь не найден' };
            }

            targetUser.verified = !!verified;
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'ADMIN_VERIFY_USER', `target:${targetUser.username}, verified:${verified}`);

            console.log(`✅ Администратор ${user.displayName} ${verified ? 'верифицировал' : 'снял верификацию с'} пользователя ${targetUser.displayName}`);

            return {
                success: true,
                message: `Пользователь ${verified ? 'верифицирован' : 'лишен верификации'}`,
                user: targetUser
            };
        } catch (error) {
            console.error('❌ Ошибка верификации пользователя:', error);
            return { success: false, message: 'Ошибка верификации пользователя' };
        }
    }

    handleAdminMakeDeveloper(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Недостаточно прав' };
        }

        const { userId, isDeveloper } = data;
        
        if (!userId) {
            return { success: false, message: 'Не указан пользователь' };
        }

        try {
            const targetUser = this.dataManager.users.find(u => u.id === userId);
            if (!targetUser) {
                return { success: false, message: 'Пользователь не найден' };
            }

            targetUser.isDeveloper = !!isDeveloper;
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'ADMIN_MAKE_DEVELOPER', `target:${targetUser.username}, developer:${isDeveloper}`);

            console.log(`👑 Администратор ${user.displayName} ${isDeveloper ? 'назначил' : 'снял'} права разработчика у пользователя ${targetUser.displayName}`);

            return {
                success: true,
                message: `Права разработчика ${isDeveloper ? 'назначены' : 'сняты'}`,
                user: targetUser
            };
        } catch (error) {
            console.error('❌ Ошибка назначения прав разработчика:', error);
            return { success: false, message: 'Ошибка назначения прав разработчика' };
        }
    }

    handleAdminSecurityLogs(token) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Недостаточно прав' };
        }

        try {
            const logs = this.securitySystem.getSecurityLogs();
            return { success: true, logs: logs };
        } catch (error) {
            console.error('❌ Ошибка получения логов безопасности:', error);
            return { success: false, message: 'Ошибка получения логов безопасности' };
        }
    }

    handleExportDatabase(token, res) {
        const user = this.authenticateToken(token);
        
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'EXPORT_DATABASE', 'SYSTEM', false);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Доступ запрещен' }));
            return;
        }

        try {
            const exportData = {
                exportInfo: {
                    version: '1.0',
                    exportedAt: new Date().toISOString(),
                    exportedBy: user.username,
                    totalUsers: this.dataManager.users.length,
                    totalMessages: this.dataManager.messages.length,
                    totalPosts: this.dataManager.posts.length,
                    totalGifts: this.dataManager.gifts.length,
                    totalMusic: this.dataManager.music.length
                },
                data: {
                    users: this.dataManager.users.map(u => ({
                        ...u,
                        password: '[ENCRYPTED]'
                    })),
                    messages: this.dataManager.messages,
                    posts: this.dataManager.posts,
                    gifts: this.dataManager.gifts,
                    promoCodes: this.dataManager.promoCodes,
                    music: this.dataManager.music,
                    playlists: this.dataManager.playlists,
                    groups: this.dataManager.groups,
                    bannedIPs: Object.fromEntries(this.dataManager.bannedIPs),
                    devices: Object.fromEntries(this.dataManager.devices)
                }
            };

            const filename = `epic-messenger-backup-${new Date().toISOString().split('T')[0]}.json`;
            
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Access-Control-Expose-Headers': 'Content-Disposition'
            });

            res.end(JSON.stringify(exportData, null, 2));

            this.securitySystem.logSecurityEvent(user, 'EXPORT_DATABASE', `file:${filename}`);

            console.log(`💾 Администратор ${user.username} экспортировал базу данных: ${filename}`);

        } catch (error) {
            console.error('❌ Ошибка экспорта базы данных:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Ошибка экспорта базы данных' }));
        }
    }

    handleImportDatabase(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            return { success: false, message: 'Доступ запрещен' };
        }

        return { success: true, message: 'Импорт БД выполнен (обрабатывается в file-handlers)' };
    }

    handleGetTransactions(token, userId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.id !== userId) {
            this.securitySystem.logSecurityEvent(user, 'GET_TRANSACTIONS', `user:${userId}`, false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const transactions = [
            {
                description: 'Регистрация бонус',
                date: user.createdAt,
                amount: user.coins >= 50000 ? 50000 : 1000
            }
        ];

        this.securitySystem.logSecurityEvent(user, 'GET_TRANSACTIONS', `user:${userId}`);

        return {
            success: true,
            transactions: transactions
        };
    }

    handleGetDevices(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const devices = this.dataManager.getUserDevices(user.id);
            
        this.securitySystem.logSecurityEvent(user, 'GET_DEVICES', `count:${devices.length}`);

        return {
            success: true,
            devices: devices
        };
    }

    handleTerminateDevice(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { deviceId } = data;
        const success = this.dataManager.terminateDevice(user.id, deviceId);

        if (success) {
            this.securitySystem.logSecurityEvent(user, 'TERMINATE_DEVICE', `device:${deviceId}`);
            return {
                success: true,
                message: 'Сеанс устройства завершен'
            };
        } else {
            this.securitySystem.logSecurityEvent(user, 'TERMINATE_DEVICE', `device:${deviceId}`, false);
            return {
                success: false,
                message: 'Не удалось завершить сеанс устройства'
            };
        }
    }

    // 🔥 НОВЫЕ МЕТОДЫ ДЛЯ КОММЕНТАРИЕВ
    handleGetPostComments(token, postId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const post = this.dataManager.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

        // Увеличиваем счетчик просмотров
        post.views = (post.views || 0) + 1;
        this.dataManager.saveData();

        const commentsWithUserInfo = (post.comments || []).map(comment => {
            const commentUser = this.dataManager.users.find(u => u.id === comment.userId);
            const repliesWithUserInfo = (comment.replies || []).map(reply => {
                const replyUser = this.dataManager.users.find(u => u.id === reply.userId);
                return {
                    ...reply,
                    userName: replyUser ? replyUser.displayName : 'Неизвестный',
                    userAvatar: replyUser ? replyUser.avatar : null,
                    userVerified: replyUser ? replyUser.verified : false
                };
            });

            return {
                ...comment,
                userName: commentUser ? commentUser.displayName : 'Неизвестный',
                userAvatar: commentUser ? commentUser.avatar : null,
                userVerified: commentUser ? commentUser.verified : false,
                replies: repliesWithUserInfo
            };
        });

        this.securitySystem.logSecurityEvent(user, 'GET_POST_COMMENTS', `post:${postId}, count:${commentsWithUserInfo.length}`);

        return {
            success: true,
            comments: commentsWithUserInfo
        };
    }

    handleAddPostComment(token, postId, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'ADD_COMMENT', `post:${postId}`, false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { text } = data;
        
        if (!text || text.trim() === '') {
            return { success: false, message: 'Текст комментария не может быть пустым' };
        }

        const post = this.dataManager.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

        const sanitizedText = this.securitySystem.sanitizeContent(text.trim());

        const comment = {
            id: this.dataManager.generateId(),
            userId: user.id,
            text: sanitizedText,
            likes: [],
            replies: [],
            createdAt: new Date()
        };

        if (!post.comments) {
            post.comments = [];
        }

        post.comments.push(comment);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'ADD_COMMENT', `post:${postId}, chars:${sanitizedText.length}`);

        console.log(`💬 Пользователь ${user.displayName} добавил комментарий к посту ${postId}`);

        return {
            success: true,
            comment: {
                ...comment,
                userName: user.displayName,
                userAvatar: user.avatar,
                userVerified: user.verified
            }
        };
    }

    handleAddReply(token, postId, commentId, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'ADD_REPLY', `post:${postId}, comment:${commentId}`, false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { text } = data;
        
        if (!text || text.trim() === '') {
            return { success: false, message: 'Текст ответа не может быть пустым' };
        }

        const post = this.dataManager.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

        const comment = post.comments.find(c => c.id === commentId);
        if (!comment) {
            return { success: false, message: 'Комментарий не найден' };
        }

        const sanitizedText = this.securitySystem.sanitizeContent(text.trim());

        const reply = {
            id: this.dataManager.generateId(),
            userId: user.id,
            text: sanitizedText,
            likes: [],
            createdAt: new Date()
        };

        if (!comment.replies) {
            comment.replies = [];
        }

        comment.replies.push(reply);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'ADD_REPLY', `post:${postId}, comment:${commentId}, chars:${sanitizedText.length}`);

        console.log(`💬 Пользователь ${user.displayName} ответил на комментарий ${commentId}`);

        return {
            success: true,
            reply: {
                ...reply,
                userName: user.displayName,
                userAvatar: user.avatar,
                userVerified: user.verified
            }
        };
    }

    handleLikeComment(token, postId, commentId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'LIKE_COMMENT', `post:${postId}, comment:${commentId}`, false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const post = this.dataManager.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

        const comment = post.comments.find(c => c.id === commentId);
        if (!comment) {
            return { success: false, message: 'Комментарий не найден' };
        }

        const likeIndex = comment.likes.indexOf(user.id);
        if (likeIndex === -1) {
            comment.likes.push(user.id);
            this.securitySystem.logSecurityEvent(user, 'LIKE_COMMENT', `post:${postId}, comment:${commentId}`);
        } else {
            comment.likes.splice(likeIndex, 1);
            this.securitySystem.logSecurityEvent(user, 'UNLIKE_COMMENT', `post:${postId}, comment:${commentId}`);
        }

        this.dataManager.saveData();

        return {
            success: true,
            likes: comment.likes
        };
    }

    handleLikeReply(token, postId, commentId, replyId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'LIKE_REPLY', `post:${postId}, comment:${commentId}, reply:${replyId}`, false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const post = this.dataManager.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

        const comment = post.comments.find(c => c.id === commentId);
        if (!comment) {
            return { success: false, message: 'Комментарий не найден' };
        }

        const reply = comment.replies.find(r => r.id === replyId);
        if (!reply) {
            return { success: false, message: 'Ответ не найден' };
        }

        const likeIndex = reply.likes.indexOf(user.id);
        if (likeIndex === -1) {
            reply.likes.push(user.id);
            this.securitySystem.logSecurityEvent(user, 'LIKE_REPLY', `post:${postId}, comment:${commentId}, reply:${replyId}`);
        } else {
            reply.likes.splice(likeIndex, 1);
            this.securitySystem.logSecurityEvent(user, 'UNLIKE_REPLY', `post:${postId}, comment:${commentId}, reply:${replyId}`);
        }

        this.dataManager.saveData();

        return {
            success: true,
            likes: reply.likes
        };
    }

    // Старые методы для обратной совместимости
    handleGetComments(token, query) {
        const { postId } = query;
        return this.handleGetPostComments(token, postId);
    }

    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ

    getFileExtension(fileType) {
        const extensions = {
            'image': '.jpg',
            'video': '.mp4',
            'audio': '.mp3'
        };
        return extensions[fileType] || '.bin';
    }
}

module.exports = ApiHandlers;
