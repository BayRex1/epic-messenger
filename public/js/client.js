class EpicMessenger {
    constructor() {
        this.currentUser = null;
        this.token = localStorage.getItem('authToken');
        this.socket = null;
        this.init();
    }

    async init() {
        await this.checkAuth();
        this.setupEventListeners();
        this.loadInitialData();
        this.connectSocket();
    }

    async checkAuth() {
        if (!this.token) {
            this.redirectToLogin();
            return;
        }

        try {
            const response = await fetch('/api/user', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Not authenticated');
            }

            const data = await response.json();
            if (data.success) {
                this.currentUser = data.user;
                this.updateUI();
                this.applyTheme(this.currentUser.theme);
            } else {
                this.redirectToLogin();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.redirectToLogin();
        }
    }

    redirectToLogin() {
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = '/login.html';
        }
    }

    setupEventListeners() {
        // Навигация
        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-section]')) {
                const section = e.target.closest('[data-section]').getAttribute('data-section');
                this.showSection(section);
            }
        });

        // Выход
        document.addEventListener('click', (e) => {
            if (e.target.closest('#logoutBtn')) {
                this.logout();
            }
        });

        // Создание поста
        const postForm = document.getElementById('postForm');
        if (postForm) {
            postForm.addEventListener('submit', (e) => this.createPost(e));
        }

        // Отправка сообщения
        const messageForm = document.getElementById('messageForm');
        if (messageForm) {
            messageForm.addEventListener('submit', (e) => this.sendMessage(e));
        }
    }

    connectSocket() {
        if (this.token) {
            this.socket = io({
                auth: {
                    token: this.token
                }
            });

            this.socket.on('connect', () => {
                console.log('Connected to server');
            });

            this.socket.on('newMessage', (message) => {
                this.handleNewMessage(message);
            });

            this.socket.on('newPost', (post) => {
                this.handleNewPost(post);
            });
        }
    }

    updateUI() {
        // Обновление информации о пользователе
        const userElements = document.querySelectorAll('[data-user]');
        userElements.forEach(el => {
            const field = el.getAttribute('data-user');
            if (field === 'name') el.textContent = this.currentUser.displayName;
            if (field === 'username') el.textContent = this.currentUser.username;
            if (field === 'coins') el.textContent = this.currentUser.eCoins;
        });

        // Обновление бэйджиков
        this.updateBadges();
    }

    updateBadges() {
        const verifiedBadges = document.querySelectorAll('.verified-badge');
        const developerBadges = document.querySelectorAll('.developer-badge');
        const adminBadges = document.querySelectorAll('.admin-badge');

        verifiedBadges.forEach(badge => {
            badge.style.display = this.currentUser.isVerified ? 'inline-block' : 'none';
        });

        developerBadges.forEach(badge => {
            badge.style.display = this.currentUser.isDeveloper ? 'inline-block' : 'none';
        });

        adminBadges.forEach(badge => {
            badge.style.display = this.currentUser.isAdmin ? 'inline-block' : 'none';
        });
    }

    applyTheme(theme) {
        document.body.className = `theme-${theme}`;
        localStorage.setItem('theme', theme);
    }

    showSection(sectionName) {
        // Скрыть все секции
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });

        // Показать выбранную секцию
        const targetSection = document.getElementById(`${sectionName}Section`);
        if (targetSection) {
            targetSection.classList.add('active');
        }

        // Обновить активное меню
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });

        const activeMenuItem = document.querySelector(`[data-section="${sectionName}"]`);
        if (activeMenuItem) {
            activeMenuItem.classList.add('active');
        }

        // Загрузить данные для секции
        this.loadSectionData(sectionName);
    }

    async loadSectionData(sectionName) {
        switch (sectionName) {
            case 'posts':
                await this.loadPosts();
                break;
            case 'chat':
                await this.loadChats();
                break;
            case 'profile':
                await this.loadMyProfile();
                break;
            case 'gifts':
                await this.loadGifts();
                break;
            case 'balance':
                await this.loadBalance();
                break;
            case 'settings':
                await this.loadSettings();
                break;
            case 'admin':
                if (this.currentUser.isAdmin) {
                    await this.loadAdminPanel();
                }
                break;
        }
    }

    async loadPosts() {
        try {
            const response = await fetch('/api/posts', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.renderPosts(data.posts);
                }
            }
        } catch (error) {
            console.error('Error loading posts:', error);
        }
    }

    renderPosts(posts) {
        const postsContainer = document.getElementById('postsContainer');
        if (!postsContainer) return;

        postsContainer.innerHTML = posts.map(post => `
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
                    <span class="post-time">${this.formatTime(post.createdAt)}</span>
                </div>
                <div class="post-content">
                    ${post.text ? `<p>${post.text}</p>` : ''}
                    ${post.media ? this.renderMedia(post.media) : ''}
                </div>
                <div class="post-actions">
                    <button class="like-btn ${post.likedBy.includes(this.currentUser.id) ? 'liked' : ''}" 
                            onclick="app.likePost('${post.id}')">
                        <img src="/assets/like.svg" alt="Like">
                        <span>${post.likes}</span>
                    </button>
                    <button class="comment-btn">
                        <img src="/assets/message.svg" alt="Comments">
                        <span>Комментировать</span>
                    </button>
                </div>
            </div>
        `).join('');
    }

    async createPost(e) {
        e.preventDefault();
        
        const formData = new FormData();
        const textInput = document.getElementById('postText');
        const mediaInput = document.getElementById('postMedia');

        if (textInput.value.trim()) {
            formData.append('text', textInput.value.trim());
        }

        if (mediaInput.files[0]) {
            formData.append('media', mediaInput.files[0]);
        }

        try {
            const response = await fetch('/api/posts/create', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                textInput.value = '';
                mediaInput.value = '';
                this.showNotification('Пост опубликован', 'success');
                await this.loadPosts();
            } else {
                this.showNotification(data.message, 'error');
            }
        } catch (error) {
            console.error('Error creating post:', error);
            this.showNotification('Ошибка публикации поста', 'error');
        }
    }

    async likePost(postId) {
        try {
            const response = await fetch(`/api/posts/${postId}/like`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                const likeBtn = document.querySelector(`[data-post-id="${postId}"] .like-btn`);
                const likeCount = likeBtn.querySelector('span');
                
                likeBtn.classList.toggle('liked');
                likeCount.textContent = data.likes;
            }
        } catch (error) {
            console.error('Error liking post:', error);
        }
    }

    logout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('deviceId');
        if (this.socket) {
            this.socket.disconnect();
        }
        window.location.href = '/login.html';
    }

    showNotification(message, type = 'info') {
        // Реализация уведомлений
        console.log(`[${type}] ${message}`);
        alert(message); // Временная реализация
    }

    formatTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'только что';
        if (minutes < 60) return `${minutes} мин назад`;
        if (hours < 24) return `${hours} ч назад`;
        if (days < 7) return `${days} дн назад`;
        
        return date.toLocaleDateString();
    }

    renderMedia(media) {
        switch (media.type) {
            case 'image':
                return `<img src="${media.url}" alt="Post image" class="post-media">`;
            case 'video':
                return `<video controls class="post-media"><source src="${media.url}" type="video/mp4"></video>`;
            case 'audio':
                return `<audio controls class="post-media"><source src="${media.url}" type="audio/mpeg"></audio>`;
            default:
                return `<a href="${media.url}" download class="file-download">Скачать файл</a>`;
        }
    }
}

// Глобальный экземпляр приложения
const app = new EpicMessenger();
