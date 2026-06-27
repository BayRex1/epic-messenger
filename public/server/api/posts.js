class PostsHandler {
    constructor(dataManager, securitySystem, fileHandlers) {
        this.dataManager = dataManager;
        this.securitySystem = securitySystem;
        this.fileHandlers = fileHandlers;
    }

    // ============================================
    // === ПОСТЫ ===
    // ============================================

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

    handleGetPostById(token, postId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const post = this.dataManager.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

        post.views = (post.views || 0) + 1;
        this.dataManager.saveData();

        const postUser = this.dataManager.users.find(u => u.id === post.userId);
        const postWithUser = {
            ...post,
            userName: postUser ? postUser.displayName : 'Неизвестный',
            userAvatar: postUser ? postUser.avatar : null,
            userVerified: postUser ? postUser.verified : false,
            userDeveloper: postUser ? postUser.isDeveloper : false,
            comments: (post.comments || []).map(comment => {
                const commentUser = this.dataManager.users.find(u => u.id === comment.userId);
                return {
                    ...comment,
                    userName: commentUser ? commentUser.displayName : 'Неизвестный',
                    userAvatar: commentUser ? commentUser.avatar : null,
                    replies: (comment.replies || []).map(reply => {
                        const replyUser = this.dataManager.users.find(u => u.id === reply.userId);
                        return {
                            ...reply,
                            userName: replyUser ? replyUser.displayName : 'Неизвестный',
                            userAvatar: replyUser ? replyUser.avatar : null
                        };
                    })
                };
            })
        };

        return { success: true, post: postWithUser };
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

    // ============================================
    // === ЛАЙКИ ПОСТОВ ===
    // ============================================

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
                post.likes.push(user.id);
            } else {
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

    // ============================================
    // === КОММЕНТАРИИ ===
    // ============================================

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

    // ============================================
    // === ЛАЙКИ КОММЕНТАРИЕВ ===
    // ============================================

    handleLikeComment(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'LIKE_COMMENT', `post:${data.postId}, comment:${data.commentId}`, false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { postId, commentId } = data;
        if (!postId || !commentId) {
            return { success: false, message: 'Заполните все поля' };
        }

        try {
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

            this.securitySystem.logSecurityEvent(user, 'LIKE_COMMENT', `post:${postId}, comment:${commentId}, action:${likeIndex === -1 ? 'like' : 'unlike'}`);

            return {
                success: true,
                likes: comment.likes,
                liked: likeIndex === -1
            };
        } catch (error) {
            console.error('❌ Ошибка лайка комментария:', error);
            return { success: false, message: 'Ошибка лайка комментария' };
        }
    }

    // ============================================
    // === ЛАЙКИ ОТВЕТОВ НА КОММЕНТАРИИ ===
    // ============================================

    handleLikeReply(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'LIKE_REPLY', `post:${data.postId}, comment:${data.commentId}, reply:${data.replyId}`, false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { postId, commentId, replyId } = data;
        if (!postId || !commentId || !replyId) {
            return { success: false, message: 'Заполните все поля' };
        }

        try {
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
            } else {
                reply.likes.splice(likeIndex, 1);
            }

            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'LIKE_REPLY', `post:${postId}, comment:${commentId}, reply:${replyId}, action:${likeIndex === -1 ? 'like' : 'unlike'}`);

            return {
                success: true,
                likes: reply.likes,
                liked: likeIndex === -1
            };
        } catch (error) {
            console.error('❌ Ошибка лайка ответа:', error);
            return { success: false, message: 'Ошибка лайка ответа' };
        }
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

    // ============================================
    // === КОММЕНТАРИИ (дополнительные методы) ===
    // ============================================

    handleGetComments(token, query) {
        const { postId } = query;
        return this.handleGetPostComments(token, postId);
    }

    handleGetPostComments(token, postId) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const post = this.dataManager.posts.find(p => p.id === postId);
        if (!post) {
            return { success: false, message: 'Пост не найден' };
        }

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
        return this.handleAddComment(token, { postId, ...data });
    }

    handleAddReply(token, postId, commentId, data) {
        return this.handleReplyToComment(token, { postId, commentId, ...data });
    }

    handleLikeComment(token, postId, commentId) {
        return this.handleLikeComment(token, { postId, commentId });
    }

    handleLikeReply(token, postId, commentId, replyId) {
        return this.handleLikeReply(token, { postId, commentId, replyId });
    }
}

module.exports = PostsHandler;
