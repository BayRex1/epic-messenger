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
    }

    authenticateToken(token) {
        return this.auth.authenticateToken(token);
    }

    processApiRequest(pathname, method, data, query, req, res) {
        console.log(`🔄 Processing API: ${method} ${pathname}`);
        console.log(`📦 Request data keys:`, Object.keys(data));
        console.log(`❓ Query params:`, query);

        const token = req.headers['authorization']?.replace('Bearer ', '');

        let response;

        try {
            // === АУТЕНТИФИКАЦИЯ ===
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

            // === ПОЛЬЗОВАТЕЛИ ===
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
            } else if (pathname === '/api/debug-upload') {
                response = this.users.handleDebugUpload(token);
            } else if (pathname === '/api/ecoins/balance' && method === 'GET') {
                response = this.users.handleGetBalance(token);
            } else if (pathname.startsWith('/api/users/') && method === 'GET') {
                const userId = pathname.split('/')[3];
                if (userId) {
                    response = this.users.handleGetUser(token, userId);
                }

            // === ПОСТЫ ===
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
                response = this.posts.handleUploadPostImage(token, data);
            } else if (pathname.startsWith('/api/posts/') && method === 'GET') {
                const postId = pathname.split('/')[3];
                if (postId && !pathname.includes('/comments')) {
                    response = this.posts.handleGetPostById(token, postId);
                } else if (pathname.includes('/comments')) {
                    const parts = pathname.split('/');
                    const postId = parts[3];
                    if (parts.length === 5 && parts[4] === 'comments') {
                        if (method === 'GET') response = this.posts.handleGetPostComments(token, postId);
                        else if (method === 'POST') response = this.posts.handleAddPostComment(token, postId, data);
                    } else if (parts.length === 6 && parts[5] === 'like' && method === 'POST') {
                        const commentId = parts[4];
                        response = this.posts.handleLikeComment(token, { postId, commentId });
                    } else if (parts.length === 7 && parts[5] === 'reply' && method === 'POST') {
                        const commentId = parts[4];
                        response = this.posts.handleReplyToComment(token, { postId, commentId, ...data });
                    } else if (parts.length === 8 && parts[7] === 'like' && method === 'POST') {
                        const commentId = parts[4];
                        const replyId = parts[6];
                        response = this.posts.handleLikeReply(token, { postId, commentId, replyId });
                    }
                }

            // === ЧАТЫ ===
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

            // === ПОДАРКИ ===
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
                response = this.gifts.handleUploadGift(token, data);
            } else if (pathname.startsWith('/api/gifts/') && pathname.endsWith('/buy') && method === 'POST') {
                const giftId = pathname.split('/')[3];
                response = this.gifts.handleBuyGift(token, { giftId, ...data });

            // === ПРОМОКОДЫ ===
            } else if (pathname === '/api/promo-codes' && method === 'GET') {
                response = this.promo.handleGetPromoCodes(token);
            } else if (pathname === '/api/promo-codes' && method === 'DELETE') {
                response = this.promo.handleDeletePromoCode(token, data);
            } else if (pathname === '/api/promo-codes/create' && method === 'POST') {
                response = this.promo.handleCreatePromoCode(token, data);
            } else if (pathname === '/api/promo-codes/activate' && method === 'POST') {
                response = this.promo.handleActivatePromoCode(token, data);

            // === МУЗЫКА ===
            } else if (pathname === '/api/music' && method === 'GET') {
                response = this.music.handleGetMusic(token);
            } else if (pathname === '/api/music' && method === 'POST') {
                response = this.music.handleUploadMusic(token, data);
            } else if (pathname === '/api/music/upload' && method === 'POST') {
                response = this.music.handleUploadMusicFile(token, data);
            } else if (pathname === '/api/music/upload-full' && method === 'POST') {
                response = this.music.handleUploadMusicFull(token, data);
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

            // === АДМИН ===
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
                response = this.admin.handleExportDatabase(token, res);
                return;
            } else if (pathname === '/api/admin/import-database' && method === 'POST') {
                response = this.admin.handleImportDatabase(token, data);
            } else if (pathname === '/api/admin/maintenance' && method === 'POST') {
                response = this.admin.handleMaintenanceMode(token, data);
            } else if (pathname === '/api/admin/maintenance' && method === 'GET') {
                response = this.admin.handleGetMaintenanceStatus(token);
            } else if (pathname === '/api/maintenance-status' && method === 'GET') {
                response = this.admin.handleGetMaintenanceStatusPublic(token);

            // === УСТРОЙСТВА ===
            } else if (pathname === '/api/devices' && method === 'GET') {
                response = this.devices.handleGetDevices(token);
            } else if (pathname === '/api/devices/terminate' && method === 'POST') {
                response = this.devices.handleTerminateDevice(token, data);

            // === ЭМОДЗИ ===
            } else if (pathname === '/api/emoji' && method === 'GET') {
                response = this.emoji.handleGetEmoji(token);

            // === МОБИЛЬНЫЕ API ===
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

            // === ЗАГРУЗКА ФАЙЛОВ ===
            } else if (pathname === '/api/upload-avatar' && method === 'POST') {
                response = this.users.handleUploadAvatar(token, data);
            } else if (pathname === '/api/upload-post-image' && method === 'POST') {
                response = this.posts.handleUploadPostImage(token, data);
            } else if (pathname === '/api/upload-gift' && method === 'POST') {
                response = this.gifts.handleUploadGift(token, data);
            } else if (pathname === '/api/upload-file' && method === 'POST') {
                response = this.fileHandlers.handleUploadFileMultipart(req, res);
                return;

            // === ТРАНЗАКЦИИ ===
            } else if (pathname.startsWith('/api/user/') && pathname.includes('/transactions')) {
                const userId = pathname.split('/')[3];
                if (method === 'GET') {
                    response = this.users.handleGetTransactions(token, userId);
                }

            // === НЕИЗВЕСТНЫЙ API ===
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
}

module.exports = ApiHandler;
