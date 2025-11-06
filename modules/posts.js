class PostsManager {
    constructor(server) {
        this.server = server;
    }

    handleGetPosts(token) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const postsWithUserInfo = this.server.posts.map(post => {
            if (post.userId === 'system') {
                return {
                    ...post,
                    userName: 'Epic Messenger',
                    userAvatar: null,
                    userVerified: true,
                    userDeveloper: true
                };
            }
            
            const postUser = this.server.users.find(u => u.id === post.userId);
            return {
                ...post,
                userName: postUser ? postUser.displayName : 'Неизвестный',
                userAvatar: postUser ? postUser.avatar : null,
                userVerified: postUser ? postUser.verified : false,
                userDeveloper: postUser ? postUser.isDeveloper : false
            };
        });

        postsWithUserInfo.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        this.server.security.logSecurityEvent(user, 'GET_POSTS', `count:${postsWithUserInfo.length}`);

        return {
            success: true,
            posts: postsWithUserInfo
        };
    }

    handleCreatePost(token, data) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.server.security.logSecurityEvent(user, 'CREATE_POST', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { text, image, file, fileName, fileType } = data;
        
        if ((!text || text.trim() === '') && !file && !image) {
            return { success: false, message: 'Текст поста не может быть пустым' };
        }

        let sanitizedText = '';
        if (text && text.trim() !== '') {
            sanitizedText = this.server.security.sanitizeContent(text.trim());
            if (sanitizedText.length === 0 && !file && !image) {
                this.server.security.logSecurityEvent(user, 'CREATE_POST', 'SYSTEM', false);
                return { success: false, message: 'Текст поста содержит запрещенный контент' };
            }
        }

        const post = {
            id: this.server.generateId(),
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

        this.server.posts.unshift(post);
        user.postsCount = (user.postsCount || 0) + 1;
        this.server.saveData();

        this.server.security.logSecurityEvent(user, 'CREATE_POST', `chars:${sanitizedText.length}`);

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
        const user = this.server.auth.authenticateToken(token);
        
        if (!user || !this.server.auth.isAdmin(user)) {
            this.server.security.logSecurityEvent(user, 'DELETE_POST', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { postId } = query;
        const postIndex = this.server.posts.findIndex(p => p.id === postId);
        
        if (postIndex === -1) {
            return { success: false, message: 'Пост не найден' };
        }

        const post = this.server.posts[postIndex];
        
        if (post.userId === 'system') {
            return { success: false, message: 'Нельзя удалить системный пост' };
        }

        if (post.image && post.image.startsWith('/uploads/posts/')) {
            this.server.files.deleteFile(post.image);
        }

        if (post.file && post.file.startsWith('/uploads/')) {
            this.server.files.deleteFile(post.file);
        }

        this.server.posts.splice(postIndex, 1);

        const postUser = this.server.users.find(u => u.id === post.userId);
        if (postUser && postUser.postsCount > 0) {
            postUser.postsCount--;
        }

        this.server.saveData();

        this.server.security.logSecurityEvent(user, 'DELETE_POST', `post:${postId}, author:${postUser ? postUser.username : 'unknown'}`);

        console.log(`🗑️ Администратор ${user.displayName} удалил пост пользователя ${postUser ? postUser.username : 'unknown'}`);

        return {
            success: true,
            message: 'Пост успешно удален'
        };
    }

    handleLikePost(token, postId) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.server.security.logSecurityEvent(user, 'LIKE_POST', `post:${postId}`, false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const post = this.server.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

        const likeIndex = post.likes.indexOf(user.id);
        if (likeIndex === -1) {
            post.likes.push(user.id);
            console.log(`❤️ Пользователь ${user.displayName} лайкнул пост`);
            this.server.security.logSecurityEvent(user, 'LIKE_POST', `post:${postId}`);
        } else {
            post.likes.splice(likeIndex, 1);
            console.log(`💔 Пользователь ${user.displayName} убрал лайк с поста`);
            this.server.security.logSecurityEvent(user, 'UNLIKE_POST', `post:${postId}`);
        }

        this.server.saveData();

        return {
            success: true,
            likes: post.likes
        };
    }

    async handleUploadPostImage(token, data) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.server.security.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { fileData, filename } = data;

        if (!this.server.files.validatePostFile(filename)) {
            this.server.security.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${filename}`, false);
            return { success: false, message: 'Недопустимый формат файла для поста. Разрешены только изображения, видео и аудио.' };
        }

        if (fileData.length > 50 * 1024 * 1024) {
            this.server.security.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${filename}`, false);
            return { success: false, message: 'Размер файла не должен превышать 50 МБ' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `post_${user.id}_${Date.now()}${fileExt}`;
            
            const fileUrl = await this.server.files.saveFile(fileData, uniqueFilename, 'post');

            this.server.security.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${filename}`);

            console.log(`📸 Пользователь ${user.username} загрузил файл для поста: ${filename}`);

            return {
                success: true,
                imageUrl: fileUrl
            };
        } catch (error) {
            console.error('Ошибка загрузки файла для поста:', error);
            this.server.security.logSecurityEvent(user, 'UPLOAD_POST_IMAGE', `file:${filename}`, false);
            return { success: false, message: 'Ошибка загрузки файла: ' + error.message };
        }
    }
}

module.exports = PostsManager;
