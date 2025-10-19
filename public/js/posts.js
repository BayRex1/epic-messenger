class PostsManager {
    constructor() {
        this.posts = [];
    }

    async loadPosts() {
        try {
            const response = await fetch('/api/posts', {
                headers: {
                    'Authorization': `Bearer ${app.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.posts = data.posts;
                    this.renderPosts();
                }
            }
        } catch (error) {
            console.error('Error loading posts:', error);
        }
    }

    renderPosts() {
        const postsContainer = document.getElementById('postsContainer');
        if (!postsContainer) return;

        if (this.posts.length === 0) {
            postsContainer.innerHTML = `
                <div class="empty-state">
                    <img src="/assets/feed.svg" alt="No posts" class="empty-icon">
                    <h3>Пока нет постов</h3>
                    <p>Будьте первым, кто поделится чем-то интересным!</p>
                </div>
            `;
            return;
        }

        postsContainer.innerHTML = this.posts.map(post => `
            <div class="post" data-post-id="${post.id}">
                <div class="post-header">
                    <div class="user-info">
                        <img src="${post.user.avatar || '/assets/profile.svg'}" alt="Avatar" class="user-avatar">
                        <div class="user-details">
                            <span class="display-name">${post.user.displayName}</span>
                            <span class="username">${post.user.username}</span>
                        </div>
                        ${post.user.isVerified ? '<span class="verified-badge">✓</span>' : ''}
                        ${post.user.isDeveloper ? '<span class="developer-badge">⚡</span>' : ''}
                    </div>
                    <span class="post-time">${app.formatTime(post.createdAt)}</span>
                </div>
                
                <div class="post-content">
                    ${post.text ? `<p class="post-text">${this.escapeHtml(post.text)}</p>` : ''}
                    ${post.media ? this.renderMedia(post.media) : ''}
                </div>
                
                <div class="post-stats">
                    <span class="views-count">👁️ ${post.views} просмотров</span>
                </div>
                
                <div class="post-actions">
                    <button class="post-action like-btn ${post.likedBy.includes(app.currentUser.id) ? 'liked' : ''}" 
                            onclick="postsManager.likePost('${post.id}')">
                        <img src="/assets/like.svg" alt="Like" class="action-icon">
                        <span class="action-count">${post.likes}</span>
                    </button>
                    
                    <button class="post-action comment-btn" onclick="postsManager.toggleComments('${post.id}')">
                        <img src="/assets/message.svg" alt="Comments" class="action-icon">
                        <span>Комментировать</span>
                    </button>
                    
                    <button class="post-action share-btn" onclick="postsManager.sharePost('${post.id}')">
                        <img src="/assets/gift.svg" alt="Share" class="action-icon">
                        <span>Поделиться</span>
                    </button>
                </div>
                
                <div class="post-comments" id="comments-${post.id}" style="display: none;">
                    <!-- Комментарии будут здесь -->
                </div>
            </div>
        `).join('');
    }

    renderMedia(media) {
        if (!media) return '';

        switch (media.type) {
            case 'image':
                return `
                    <div class="post-media">
                        <img src="${media.url}" alt="Post image" onclick="postsManager.openMedia('${media.url}')">
                    </div>
                `;
            case 'video':
                return `
                    <div class="post-media">
                        <video controls>
                            <source src="${media.url}" type="video/mp4">
                            Ваш браузер не поддерживает видео.
                        </video>
                    </div>
                `;
            case 'audio':
                return `
                    <div class="post-media">
                        <audio controls>
                            <source src="${media.url}" type="audio/mpeg">
                            Ваш браузер не поддерживает аудио.
                        </audio>
                    </div>
                `;
            default:
                return `
                    <div class="post-file">
                        <a href="${media.url}" download class="file-download">
                            📎 Скачать файл: ${media.originalName || 'файл'}
                        </a>
                    </div>
                `;
        }
    }

    async createPost(e) {
        e.preventDefault();
        
        const formData = new FormData();
        const textInput = document.getElementById('postText');
        const mediaInput = document.getElementById('postMedia');
        const mediaPreview = document.getElementById('mediaPreview');

        if (textInput.value.trim()) {
            formData.append('text', textInput.value.trim());
        }

        if (mediaInput.files[0]) {
            formData.append('media', mediaInput.files[0]);
        }

        if (!textInput.value.trim() && !mediaInput.files[0]) {
            app.showNotification('Пост должен содержать текст или медиа', 'error');
            return;
        }

        try {
            const response = await fetch('/api/posts/create', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${app.token}`
                },
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                textInput.value = '';
                mediaInput.value = '';
                mediaPreview.innerHTML = '';
                mediaPreview.style.display = 'none';
                
                app.showNotification('Пост опубликован!', 'success');
                await this.loadPosts(); // Перезагрузить посты
            } else {
                app.showNotification(data.message, 'error');
            }
        } catch (error) {
            console.error('Error creating post:', error);
            app.showNotification('Ошибка при публикации поста', 'error');
        }
    }

    async likePost(postId) {
        try {
            const response = await fetch(`/api/posts/${postId}/like`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${app.token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                // Обновить UI
                const likeBtn = document.querySelector(`[data-post-id="${postId}"] .like-btn`);
                const likeCount = likeBtn.querySelector('.action-count');
                
                likeBtn.classList.toggle('liked', data.liked);
                likeCount.textContent = data.likes;

                app.showNotification(data.liked ? 'Лайк добавлен!' : 'Лайк удален', 'info');
            }
        } catch (error) {
            console.error('Error liking post:', error);
            app.showNotification('Ошибка при добавлении лайка', 'error');
        }
    }

    previewMedia(e) {
        const file = e.target.files[0];
        const preview = document.getElementById('mediaPreview');
        
        if (!file) {
            preview.innerHTML = '';
            preview.style.display = 'none';
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const fileType = file.type.split('/')[0];
            let previewHTML = '';

            switch (fileType) {
                case 'image':
                    previewHTML = `
                        <div class="media-preview-item">
                            <img src="${e.target.result}" alt="Preview">
                            <button type="button" class="remove-media" onclick="postsManager.removeMediaPreview()">×</button>
                        </div>
                    `;
                    break;
                case 'video':
                    previewHTML = `
                        <div class="media-preview-item">
                            <video controls>
                                <source src="${e.target.result}" type="${file.type}">
                            </video>
                            <button type="button" class="remove-media" onclick="postsManager.removeMediaPreview()">×</button>
                        </div>
                    `;
                    break;
                case 'audio':
                    previewHTML = `
                        <div class="media-preview-item">
                            <audio controls>
                                <source src="${e.target.result}" type="${file.type}">
                            </audio>
                            <button type="button" class="remove-media" onclick="postsManager.removeMediaPreview()">×</button>
                        </div>
                    `;
                    break;
                default:
                    previewHTML = `
                        <div class="media-preview-item">
                            <div class="file-preview">
                                <span>📎 ${file.name}</span>
                            </div>
                            <button type="button" class="remove-media" onclick="postsManager.removeMediaPreview()">×</button>
                        </div>
                    `;
            }

            preview.innerHTML = previewHTML;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }

    removeMediaPreview() {
        const preview = document.getElementById('mediaPreview');
        const mediaInput = document.getElementById('postMedia');
        
        preview.innerHTML = '';
        preview.style.display = 'none';
        mediaInput.value = '';
    }

    openMedia(url) {
        // Открыть медиа в полном размере
        window.open(url, '_blank');
    }

    toggleComments(postId) {
        const commentsSection = document.getElementById(`comments-${postId}`);
        if (commentsSection.style.display === 'none') {
            commentsSection.style.display = 'block';
            this.loadComments(postId);
        } else {
            commentsSection.style.display = 'none';
        }
    }

    async loadComments(postId) {
        // Загрузка комментариев для поста
        const commentsSection = document.getElementById(`comments-${postId}`);
        commentsSection.innerHTML = '<div class="loading">Загрузка комментариев...</div>';

        // Здесь будет API для загрузки комментариев
        setTimeout(() => {
            commentsSection.innerHTML = `
                <div class="comment-form">
                    <textarea placeholder="Напишите комментарий..." class="comment-input"></textarea>
                    <button class="btn btn-primary" onclick="postsManager.addComment('${postId}')">Отправить</button>
                </div>
                <div class="comments-list">
                    <div class="empty-comments">Пока нет комментариев</div>
                </div>
            `;
        }, 500);
    }

    async addComment(postId) {
        // Добавление комментария
        app.showNotification('Функция комментариев в разработке', 'info');
    }

    async sharePost(postId) {
        // Поделиться постом
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Посмотрите этот пост',
                    text: 'Интересный пост из Epic Messenger',
                    url: window.location.href
                });
            } catch (error) {
                console.log('Ошибка sharing:', error);
            }
        } else {
            // Fallback - скопировать ссылку
            navigator.clipboard.writeText(window.location.href);
            app.showNotification('Ссылка скопирована в буфер обмена', 'success');
        }
    }

    handleNewPost(post) {
        // Добавить новый пост в начало списка
        this.posts.unshift(post);
        this.renderPosts();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

const postsManager = new PostsManager();
