const AuthHandler = require('./auth');
const UsersHandler = require('./users');
const PostsHandler = require('./posts');
const ChatsHandler = require('./chats');
const GiftsHandler = require('./gifts');
const PromoHandler = require('./promo');
const MusicHandler = require('./music');
const AdminHandler = require('./admin');
const DevicesHandler = require('./devices');
const EmojiHandler = require('./emoji');

class ApiHandler {
    constructor(dataManager, securitySystem, fileHandlers) {
        this.dataManager = dataManager;
        this.securitySystem = securitySystem;
        this.fileHandlers = fileHandlers;

        this.auth = new AuthHandler(dataManager, securitySystem);
        this.users = new UsersHandler(dataManager, securitySystem, fileHandlers, this.auth);
        this.posts = new PostsHandler(dataManager, securitySystem, fileHandlers, this.auth);
        this.chats = new ChatsHandler(dataManager, securitySystem, fileHandlers, this.auth);
        this.gifts = new GiftsHandler(dataManager, securitySystem, fileHandlers, this.auth);
        this.promo = new PromoHandler(dataManager, securitySystem, fileHandlers, this.auth);
        this.music = new MusicHandler(dataManager, securitySystem, fileHandlers, this.auth);
        this.admin = new AdminHandler(dataManager, securitySystem, fileHandlers, this.auth);
        this.devices = new DevicesHandler(dataManager, securitySystem, fileHandlers, this.auth);
        this.emoji = new EmojiHandler(dataManager, securitySystem, fileHandlers, this.auth);

        this.authenticateToken = this.authenticateToken.bind(this);
        this.wsServer = null;
    }

    setWebSocketServer(wsServer) {
        this.wsServer = wsServer;
        this.users.setWebSocketServer(wsServer);
    }

    authenticateToken(token) {
        return this.auth.authenticateToken(token);
    }

    processApiRequest(pathname, method, data, query, req, res) {
        console.log(`🔄 Processing API: ${method} ${pathname}`);
        console.log(`📦 Request data keys:`, Object.keys(data));
        console.log(`❓ Query params:`, query);

        const token = req.headers['authorization']?.replace('Bearer ', '');

        // ============================================
        // ★★★ СТАТУС - БЕЗ АВТОРИЗАЦИИ ★★★
        // ============================================
        if (pathname.startsWith('/api/users/') && pathname.endsWith('/status') && method === 'GET') {
            const userId = pathname.split('/')[3];
            const targetUser = this.dataManager.users.find(u => u.id === userId);
            
            if (!targetUser) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Пользователь не найден' }));
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: true, 
                user: {
                    id: targetUser.id,
                    username: targetUser.username,
                    status: targetUser.status || 'offline',
                    lastSeen: targetUser.lastSeen
                }
            }));
            return;
        }

        // ============================================
        // ★★★ ОСТАЛЬНЫЕ ЗАПРОСЫ - С ПРОВЕРКОЙ ТОКЕНА ★★★
        // ============================================
        const isAuthRoute = pathname === '/api/login' || pathname === '/api/register';
        
        if (!isAuthRoute) {
            const user = this.authenticateToken(token);
            if (!user) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Не авторизован' }));
                return;
            }
        }

        let response;

        try {
            // ============================================
            // === АУТЕНТИФИКАЦИЯ ===
            // ============================================
            if (pathname === '/api/login' && method === 'POST') {
                response = this.auth.handleLogin(data, req);
            } else if (pathname === '/api/register' && method === 'POST') {
                response = this.auth.handleRegister(data, req);
            } else if (pathname === '/api/check-auth' && method === 'GET') {
                response = this.auth.handleCheckAuth(token, req);
            } else if (pathname === '/api/current-user' && method === 'GET') {
                response = this.auth.handleCurrentUser(token, req);
            } else if (pathname === '/api/logout' && method === 'POST') {
                response = this.auth.handleLogout(token);

            // ============================================
            // === ПОЛЬЗОВАТЕЛИ ===
            // ============================================
            } else if (pathname === '/api/users' && method === 'GET') {
                response = this.users.handleGetUsers(token);
            } else if (pathname === '/api/users/search' && method === 'GET') {
                response = this.users.handleSearchUsers(token, query);
            } else if (pathname === '/api/user-by-username' && method === 'POST') {
                response = this.users.handleGetUserByUsername(token, data);
            } else if (pathname === '/api/mobile/user-by-username' && method === 'POST') {
                response = this.users.handleGetUserByUsernameMobile(token, data);
            } else if (pathname === '/api/mobile/user-posts' && method === 'POST') {
                response = this.users.handleGetUserPostsMobile(token, data);
            } else if (pathname === '/api/update-profile' && method === 'POST') {
                response = this.users.handleUpdateProfile(token, data);
            } else if (pathname === '/api/update-avatar' && method === 'POST') {
                response = this.users.handleUpdateAvatar(token, data);
            } else if (pathname === '/api/update-cover' && method === 'POST') {
                response = this.users.handleUpdateCover(token, data);
            } else if (pathname === '/api/preview-avatar' && method === 'POST') {
                response = this.users.handlePreviewAvatar(token, data);
            } else if (pathname === '/api/debug-upload' && method === 'POST') {
                response = this.users.handleDebugUpload(token);
            } else if (pathname === '/api/debug-upload' && method === 'GET') {
                response = this.users.handleDebugUpload(token);
            } else if (pathname === '/api/ecoins/balance' && method === 'GET') {
                response = this.users.handleGetBalance(token);
            } else if (pathname === '/api/upload-avatar' && method === 'POST') {
                this.fileHandlers.handleUploadAvatarMultipart(req, res);
                return;
            } else if (pathname.startsWith('/api/users/') && method === 'GET') {
                const userId = pathname.split('/')[3];
                if (userId) {
                    response = this.users.handleGetUser(token, userId);
                }
            
            // ★★★ СТАТУС ★★★
            } else if (pathname === '/api/users/status' && method === 'POST') {
                response = this.users.handleSetStatus(token, data);
            } else if (pathname === '/api/users/last-seen' && method === 'POST') {
                response = this.users.handleUpdateLastSeen(token);

            // ============================================
            // === ПОСТЫ ===
            // ============================================
            } else if (pathname === '/api/posts' && method === 'GET') {
                response = this.posts.handleGetPosts(token);
            } else if (pathname === '/api/posts' && method === 'POST') {
                response = this.posts.handleCreatePost(token, data);
            } else if (pathname === '/api/posts' && method === 'DELETE') {
                response = this.posts.handleDeletePost(token, query);
            } else if (pathname === '/api/posts/user' && method === 'GET') {
                response = this.posts.handleGetUserPosts(token, query);
            } else if (pathname === '/api/posts/like' && method === 'POST') {
                response = this.posts.handleLikePost(token, data);
            } else if (pathname === '/api/posts/comment' && method === 'POST') {
                response = this.posts.handleAddComment(token, data);
            } else if (pathname === '/api/posts/comment/like' && method === 'POST') {
                response = this.posts.handleLikeComment(token, data);
            } else if (pathname === '/api/posts/comment/reply' && method === 'POST') {
                response = this.posts.handleReplyToComment(token, data);
            } else if (pathname === '/api/posts/share' && method === 'POST') {
                response = this.posts.handleSharePost(token, data);
            } else if (pathname === '/api/posts/comments' && method === 'GET') {
                response = this.posts.handleGetComments(token, query);
            } else if (pathname === '/api/posts/comments' && method === 'POST') {
                response = this.posts.handleAddComment(token, data);
            } else if (pathname === '/api/upload-post-image' && method === 'POST') {
                this.fileHandlers.handleUploadPostImageMultipart(req, res);
                return;
            } else if (pathname.startsWith('/api/posts/') && method === 'GET' && !pathname.includes('/comments') && !pathname.includes('/like')) {
                const postId = pathname.split('/')[3];
                if (postId) {
                    response = this.posts.handleGetPostById(token, postId);
                }
            } else if (pathname.startsWith('/api/posts/') && pathname.endsWith('/like') && method === 'POST') {
                const parts = pathname.split('/');
                const postId = parts[3];
                if (postId) {
                    response = this.posts.handleLikePost(token, { postId });
                }
            } else if (pathname.startsWith('/api/posts/') && pathname.includes('/comments')) {
                const parts = pathname.split('/');
                const postId = parts[3];
                
                if (parts.length === 5 && parts[4] === 'comments') {
                    if (method === 'GET') {
                        response = this.posts.handleGetPostComments(token, postId);
                    } else if (method === 'POST') {
                        response = this.posts.handleAddPostComment(token, postId, data);
                    }
                } else if (parts.length === 6 && parts[5] === 'like' && method === 'POST') {
                    const commentId = parts[4];
                    response = this.posts.handleLikeComment(token, { postId, commentId });
                } else if (parts.length === 7 && parts[5] === 'reply' && method === 'POST') {
                    const commentId = parts[4];
                    response = this.posts.handleAddReply(token, postId, commentId, data);
                } else if (parts.length === 8 && parts[7] === 'like' && method === 'POST') {
                    const commentId = parts[4];
                    const replyId = parts[6];
                    response = this.posts.handleLikeReply(token, { postId, commentId, replyId });
                } else {
                    response = { success: false, message: 'API endpoint not found' };
                }

            // ============================================
            // === ЧАТЫ ===
            // ============================================
            } else if (pathname === '/api/chats' && method === 'GET') {
                response = this.chats.handleGetChats(token);
            } else if (pathname === '/api/chats/start' && method === 'POST') {
                response = this.chats.handleStartChat(token, data);
            } else if (pathname === '/api/messages' && method === 'GET') {
                response = this.chats.handleGetMessages(token, query);
            } else if (pathname === '/api/messages/send' && method === 'POST') {
                response = this.chats.handleSendMessage(token, data);
            } else if (pathname === '/api/messages/mark-read' && method === 'POST') {
                response = this.chats.handleMarkAsRead(token, data);
            } else if (pathname === '/api/messages/edit' && method === 'POST') {
                response = this.chats.handleEditMessage(token, data);
            } else if (pathname === '/api/messages/delete' && method === 'POST') {
                response = this.chats.handleDeleteMessage(token, data);
            } else if (pathname === '/api/groups' && method === 'GET') {
                response = this.chats.handleGetUserGroups(token);
            } else if (pathname === '/api/groups' && method === 'POST') {
                response = this.chats.handleCreateGroup(token, data);
            } else if (pathname === '/api/groups/create' && method === 'POST') {
                response = this.chats.handleCreateGroup(token, data);
            } else if (pathname === '/api/groups/add-member' && method === 'POST') {
                response = this.chats.handleAddToGroup(token, data);
            } else if (pathname === '/api/groups/join' && method === 'POST') {
                response = this.chats.handleJoinGroup(token, data);
            } else if (pathname === '/api/groups/leave' && method === 'POST') {
                response = this.chats.handleLeaveGroup(token, data);
            } else if (pathname === '/api/messages/unread' && method === 'GET') {
                response = this.getUnreadMessages(token);
            } else if (pathname === '/api/messages/check' && method === 'GET') {
                response = this.checkNewMessages(token);

            // ============================================
            // === ПОДАРКИ ===
            // ============================================
            } else if (pathname === '/api/gifts' && method === 'GET') {
                response = this.gifts.handleGetGifts(token);
            } else if (pathname === '/api/gifts' && method === 'POST') {
                response = this.gifts.handleCreateGift(token, data);
            } else if (pathname === '/api/gifts' && method === 'DELETE') {
                response = this.gifts.handleDeleteGift(token, data);
            } else if (pathname === '/api/gifts/buy' && method === 'POST') {
                response = this.gifts.handleBuyGift(token, data);
            } else if (pathname === '/api/gifts/user' && method === 'GET') {
                response = this.gifts.handleGetUserGifts(token, query);
            } else if (pathname === '/api/my-gifts' && method === 'GET') {
                response = this.gifts.handleGetMyGifts(token);
            } else if (pathname === '/api/upload-gift' && method === 'POST') {
                this.fileHandlers.handleUploadGiftMultipart(req, res);
                return;
            } else if (pathname.startsWith('/api/gifts/') && pathname.endsWith('/buy') && method === 'POST') {
                const giftId = pathname.split('/')[3];
                response = this.gifts.handleBuyGift(token, { giftId, ...data });

            // ★★★ ОТПРАВКА ПОДАРКА В ЧАТ - ИСПРАВЛЕНО ★★★
            } else if (pathname === '/api/messages/gift' && method === 'POST') {
                response = this.handleSendGiftMessage(token, data);

            // ============================================
            // === ПРОМОКОДЫ ===
            // ============================================
            } else if (pathname === '/api/promo-codes' && method === 'GET') {
                response = this.promo.handleGetPromoCodes(token);
            } else if (pathname === '/api/promo-codes' && method === 'DELETE') {
                response = this.promo.handleDeletePromoCode(token, data);
            } else if (pathname === '/api/promo-codes/create' && method === 'POST') {
                response = this.promo.handleCreatePromoCode(token, data);
            } else if (pathname === '/api/promo-codes/activate' && method === 'POST') {
                response = this.promo.handleActivatePromoCode(token, data);

            // ============================================
            // === МУЗЫКА ===
            // ============================================
            } else if (pathname === '/api/music' && method === 'GET') {
                response = this.music.handleGetMusic(token);
            } else if (pathname === '/api/music' && method === 'POST') {
                response = this.music.handleUploadMusic(token, data);
            } else if (pathname === '/api/music/upload' && method === 'POST') {
                response = this.music.handleUploadMusicFile(token, data);
            } else if (pathname === '/api/music/upload-full' && method === 'POST') {
                this.fileHandlers.handleUploadMusicFull(req, res);
                return;
            } else if (pathname === '/api/music/upload-cover' && method === 'POST') {
                response = this.music.handleUploadMusicCover(token, data);
            } else if (pathname === '/api/music/delete' && method === 'POST') {
                response = this.music.handleDeleteMusic(token, data);
            } else if (pathname === '/api/music/search' && method === 'GET') {
                response = this.music.handleSearchMusic(token, query);
            } else if (pathname === '/api/music/random' && method === 'GET') {
                response = this.music.handleGetRandomMusic(token);
            } else if (pathname === '/api/playlists' && method === 'GET') {
                response = this.music.handleGetPlaylists(token);
            } else if (pathname === '/api/playlists' && method === 'POST') {
                response = this.music.handleCreatePlaylist(token, data);
            } else if (pathname === '/api/playlists/create' && method === 'POST') {
                response = this.music.handleCreatePlaylist(token, data);
            } else if (pathname === '/api/playlists/add' && method === 'POST') {
                response = this.music.handleAddToPlaylist(token, data);
            } else if (pathname === '/api/playlists/add-track' && method === 'POST') {
                response = this.music.handleAddTrackToPlaylist(token, data);

            // ============================================
            // === АДМИН ===
            // ============================================
            } else if (pathname === '/api/admin/stats' && method === 'GET') {
                response = this.admin.handleAdminStats(token);
            } else if (pathname === '/api/admin/statistics' && method === 'GET') {
                response = this.admin.handleAdminStatistics(token);
            } else if (pathname === '/api/admin/delete-user' && method === 'POST') {
                response = this.admin.handleDeleteUser(token, data);
            } else if (pathname === '/api/admin/ban-user' && method === 'POST') {
                response = this.admin.handleBanUser(token, data);
            } else if (pathname === '/api/admin/unban-user' && method === 'POST') {
                response = this.admin.handleUnbanUser(token, data);
            } else if (pathname === '/api/admin/verify-user' && method === 'POST') {
                response = this.admin.handleAdminVerifyUser(token, data);
            } else if (pathname === '/api/admin/make-developer' && method === 'POST') {
                response = this.admin.handleAdminMakeDeveloper(token, data);
            } else if (pathname === '/api/admin/toggle-verification' && method === 'POST') {
                response = this.admin.handleToggleVerification(token, data);
            } else if (pathname === '/api/admin/toggle-developer' && method === 'POST') {
                response = this.admin.handleToggleDeveloper(token, data);
            } else if (pathname === '/api/admin/users' && method === 'GET') {
                response = this.admin.handleAdminGetUsers(token);
            } else if (pathname === '/api/admin/security-logs' && method === 'GET') {
                response = this.admin.handleAdminSecurityLogs(token);
            } else if (pathname === '/api/admin/export-database' && method === 'GET') {
                this.admin.handleExportDatabase(token, res);
                return;
            } else if (pathname === '/api/admin/import-database' && method === 'POST') {
                this.fileHandlers.handleImportDatabaseMultipart(req, res);
                return;
            } else if (pathname === '/api/admin/maintenance' && method === 'POST') {
                response = this.admin.handleMaintenanceMode(token, data);
            } else if (pathname === '/api/admin/maintenance' && method === 'GET') {
                response = this.admin.handleGetMaintenanceStatus(token);
            } else if (pathname === '/api/maintenance-status' && method === 'GET') {
                response = this.admin.handleGetMaintenanceStatusPublic(token);

            // ============================================
            // === УСТРОЙСТВА ===
            // ============================================
            } else if (pathname === '/api/devices' && method === 'GET') {
                response = this.devices.handleGetDevices(token);
            } else if (pathname === '/api/devices/terminate' && method === 'POST') {
                response = this.devices.handleTerminateDevice(token, data);

            // ============================================
            // === ЭМОДЗИ ===
            // ============================================
            } else if (pathname === '/api/emoji' && method === 'GET') {
                response = this.emoji.handleGetEmoji(token);

            // ============================================
            // === МОБИЛЬНЫЕ API ===
            // ============================================
            } else if (pathname === '/api/mobile/chats' && method === 'GET') {
                response = this.chats.handleGetChats(token);
            } else if (pathname === '/api/mobile/posts' && method === 'GET') {
                response = this.posts.handleGetPosts(token);
            } else if (pathname === '/api/mobile/ecoin' && method === 'GET') {
                response = this.users.handleGetBalance(token);
            } else if (pathname === '/api/mobile/music' && method === 'GET') {
                response = this.music.handleGetMusic(token);
            } else if (pathname === '/api/mobile/gifts' && method === 'GET') {
                response = this.gifts.handleGetGifts(token);
            } else if (pathname === '/api/mobile/settings' && method === 'GET') {
                response = this.auth.handleCurrentUser(token, req);

            // ============================================
            // === ЕСЛИ НИЧЕГО НЕ ПОДОШЛО ===
            // ============================================
            } else {
                response = { success: false, message: 'API endpoint not found' };
            }
        } catch (error) {
            console.error('API Error:', error);
            response = { success: false, message: error.message };
        }

        if (!response) {
            response = { success: false, message: 'Method not allowed' };
        }

        console.log(`📤 Response data:`, response);
        
        const headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Content-Length, Accept, Origin',
            'Access-Control-Allow-Credentials': 'true'
        };
        
        res.writeHead(response.success ? 200 : 400, headers);
        res.end(JSON.stringify(response));
    }

    // ★★★ ОТПРАВКА СООБЩЕНИЯ О ПОДАРКЕ В ЧАТ - ИСПРАВЛЕНО ★★★
    handleSendGiftMessage(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { chatId, giftId, giftName, giftFileType, giftFileData, giftFileName } = data;

        if (!chatId || !giftId) {
            return { success: false, message: 'Не указан чат или ID подарка' };
        }

        // Находим чат
        const chat = this.dataManager.chats.find(c => c.id === chatId);
        if (!chat) {
            return { success: false, message: 'Чат не найден' };
        }

        // Проверяем, что пользователь участник чата (используем members вместо participants)
        if (!chat.members || !chat.members.includes(user.id)) {
            return { success: false, message: 'Вы не участник этого чата' };
        }

        // Находим получателя (другого участника)
        const receiverId = chat.members.find(id => id !== user.id);
        if (!receiverId) {
            return { success: false, message: 'Нет получателя в чате' };
        }

        // ★★★ ПРОВЕРЯЕМ - НЕ ОТПРАВЛЯЛИ ЛИ УЖЕ ТАКОЕ СООБЩЕНИЕ ★★★
        const existingMessage = this.dataManager.messages.find(m => 
            m.chatId === chatId && 
            m.type === 'gift' && 
            m.giftId === giftId && 
            m.senderId === user.id &&
            new Date(m.timestamp) > new Date(Date.now() - 5000)
        );

        if (existingMessage) {
            return { success: false, message: 'Сообщение о подарке уже отправлено' };
        }

        // ★★★ СОЗДАЕМ СООБЩЕНИЕ О ПОДАРКЕ ★★★
        const giftMessage = {
            id: this.dataManager.generateId(),
            chatId: chatId,
            senderId: user.id,
            receiverId: receiverId,
            type: 'gift',
            text: `🎁 Подарок: ${giftName}`,
            giftId: giftId,
            giftName: giftName,
            giftFileType: giftFileType || 'image/png',
            giftFileData: giftFileData || '',
            giftFileName: giftFileName || 'gift.png',
            timestamp: new Date(),
            read: false
        };

        // ★★★ СОХРАНЯЕМ ★★★
        this.dataManager.messages.push(giftMessage);
        
        // Обновляем lastMessage в чате
        chat.lastMessage = giftMessage;
        chat.updatedAt = new Date();

        this.dataManager.saveData();

        // ★★★ ОТПРАВЛЯЕМ ЧЕРЕЗ WEBSOCKET (ЕСЛИ ЕСТЬ) ★★★
        if (this.wsServer) {
            try {
                const messageStr = JSON.stringify({
                    type: 'new_message',
                    chatId: chatId,
                    message: giftMessage
                });
                
                if (typeof this.wsServer.broadcast === 'function') {
                    this.wsServer.broadcast(messageStr);
                } else if (this.wsServer.clients) {
                    this.wsServer.clients.forEach(client => {
                        if (client.readyState === 1) {
                            client.send(messageStr);
                        }
                    });
                }
            } catch (e) {
                console.error('❌ WebSocket ошибка:', e);
            }
        }

        console.log(`🎁 Подарок "${giftName}" отправлен в чат ${chatId} от ${user.displayName}`);

        return {
            success: true,
            message: 'Сообщение о подарке отправлено',
            data: giftMessage
        };
    }

    // ★★★ ПРОВЕРКА НОВЫХ СООБЩЕНИЙ ★★★
    checkNewMessages(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const newMessages = this.dataManager.messages.filter(m => 
            m.receiverId === user.id && !m.read
        );

        return { success: true, messages: newMessages };
    }

    // ★★★ НЕПРОЧИТАННЫЕ СООБЩЕНИЯ ★★★
    getUnreadMessages(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const unreadMessages = this.dataManager.messages.filter(m => 
            m.receiverId === user.id && !m.read
        );

        return { success: true, messages: unreadMessages };
    }
}

module.exports = ApiHandler;
