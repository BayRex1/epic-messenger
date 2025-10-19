class ProfileManager {
    constructor() {
        this.currentProfile = null;
    }

    async loadMyProfile() {
        try {
            const response = await fetch('/api/profile/me', {
                headers: {
                    'Authorization': `Bearer ${app.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.currentProfile = data;
                    this.renderMyProfile();
                }
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    }

    async loadUserProfile(username) {
        try {
            const response = await fetch(`/api/users/${username}/profile`, {
                headers: {
                    'Authorization': `Bearer ${app.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.currentProfile = data;
                    this.renderUserProfile();
                } else {
                    app.showNotification('Профиль не найден', 'error');
                }
            }
        } catch (error) {
            console.error('Error loading user profile:', error);
            app.showNotification('Ошибка загрузки профиля', 'error');
        }
    }

    renderMyProfile() {
        this.renderProfile(this.currentProfile, true);
    }

    renderUserProfile() {
        this.renderProfile(this.currentProfile, false);
    }

    renderProfile(data, isMyProfile) {
        const profileContainer = document.getElementById('profileContainer');
        if (!profileContainer) return;

        const { user, stats, posts } = data;

        profileContainer.innerHTML = `
            <div class="profile-header">
                <div class="profile-avatar">
                    <img src="${user.avatar || '/assets/profile.svg'}" alt="Avatar" class="avatar-large">
                    ${isMyProfile ? `
                        <button class="edit-avatar-btn" onclick="profileManager.changeAvatar()">
                            <img src="/assets/settings.svg" alt="Edit">
                        </button>
                    ` : ''}
                </div>
                
                <div class="profile-info">
                    <div class="profile-name">
                        <h1>${user.displayName}</h1>
                        <div class="profile-badges">
                            ${user.isVerified ? '<span class="verified-badge">✓ Проверен</span>' : ''}
                            ${user.isDeveloper ? '<span class="developer-badge">⚡ Разработчик</span>' : ''}
                            ${user.isAdmin ? '<span class="admin-badge">👑 Администратор</span>' : ''}
                        </div>
                    </div>
                    
                    <p class="profile-username">${user.username}</p>
                    <p class="profile-join-date">На сайте с ${new Date(user.createdAt).toLocaleDateString()}</p>
                    
                    <div class="profile-stats">
                        <div class="stat-item">
                            <div class="stat-number">${stats.posts}</div>
                            <div class="stat-label">Посты</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-number">${stats.likes}</div>
                            <div class="stat-label">Лайки</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-number">${stats.gifts}</div>
                            <div class="stat-label">Подарки</div>
                        </div>
                    </div>
                    
                    <div class="profile-actions">
                        ${isMyProfile ? `
                            <button class="btn btn-primary" onclick="profileManager.editProfile()">
                                <img src="/assets/settings.svg" alt="Edit">
                                Редактировать профиль
                            </button>
                            <button class="btn btn-secondary" onclick="app.showSection('balance')">
                                <img src="/assets/coin.svg" alt="Coins">
                                ${user.eCoins} E-COIN
                            </button>
                        ` : `
                            <button class="btn btn-primary" onclick="profileManager.sendMessage('${user.username}')">
                                <img src="/assets/message.svg" alt="Message">
                                Написать сообщение
                            </button>
                            <button class="btn btn-secondary" onclick="profileManager.sendGift('${user.id}')">
                                <img src="/assets/gift.svg" alt="Gift">
                                Отправить подарок
                            </button>
                        `}
                    </div>
                </div>
            </div>
            
            <div class="profile-content">
                <div class="profile-tabs">
                    <button class="tab-btn active" data-tab="posts">Посты</button>
                    <button class="tab-btn" data-tab="about">О себе</button>
                    ${isMyProfile ? `<button class="tab-btn" data-tab="gifts">Мои подарки</button>` : ''}
                </div>
                
                <div class="tab-content">
                    <div id="posts-tab" class="tab-pane active">
                        ${this.renderProfilePosts(posts)}
                    </div>
                    <div id="about-tab" class="tab-pane">
                        <div class="about-section">
                            <h3>Информация о себе</h3>
                            <p class="no-info">Пользователь еще не добавил информацию о себе</p>
                        </div>
                    </div>
                    ${isMyProfile ? `
                        <div id="gifts-tab" class="tab-pane">
                            <div class="gifts-section">
                                <h3>Мои подарки</h3>
                                <div id="myGiftsList" class="my-gifts-grid">
                                    <!-- Подарки будут загружены здесь -->
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        this.setupProfileTabs();
        if (isMyProfile) {
            this.loadMyGifts();
        }
    }

    renderProfilePosts(posts) {
        if (posts.length === 0) {
            return `
                <div class="empty-state">
                    <img src="/assets/feed.svg" alt="No posts" class="empty-icon">
                    <h3>Пока нет постов</h3>
                    <p>${this.currentProfile.user.id === app.currentUser.id ? 
                        'Создайте свой первый пост!' : 
                        'Пользователь еще не публиковал посты'}</p>
                </div>
            `;
        }

        return posts.map(post => `
            <div class="profile-post" data-post-id="${post.id}">
                <div class="post-content">
                    ${post.text ? `<p class="post-text">${this.escapeHtml(post.text)}</p>` : ''}
                    ${post.media ? postsManager.renderMedia(post.media) : ''}
                </div>
                <div class="post-meta">
                    <span class="post-time">${app.formatTime(post.createdAt)}</span>
                    <div class="post-stats">
                        <span class="likes-count">❤️ ${post.likes}</span>
                        <span class="views-count">👁️ ${post.views}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    setupProfileTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabPanes = document.querySelectorAll('.tab-pane');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.getAttribute('data-tab');
                
                // Убрать активные классы
                tabBtns.forEach(b => b.classList.remove('active'));
                tabPanes.forEach(p => p.classList.remove('active'));
                
                // Добавить активные классы
                btn.classList.add('active');
                document.getElementById(`${tabName}-tab`).classList.add('active');
            });
        });
    }

    async loadMyGifts() {
        try {
            const response = await fetch('/api/users/gifts', {
                headers: {
                    'Authorization': `Bearer ${app.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.renderMyGifts(data.gifts);
                }
            }
        } catch (error) {
            console.error('Error loading gifts:', error);
        }
    }

    renderMyGifts(gifts) {
        const giftsContainer = document.getElementById('myGiftsList');
        if (!giftsContainer) return;

        if (gifts.length === 0) {
            giftsContainer.innerHTML = `
                <div class="empty-state">
                    <img src="/assets/gift.svg" alt="No gifts" class="empty-icon">
                    <p>У вас пока нет подарков</p>
                </div>
            `;
            return;
        }

        giftsContainer.innerHTML = gifts.map(gift => `
            <div class="my-gift-item">
                <div class="gift-preview">
                    <img src="${gift.gift.preview}" alt="${gift.gift.name}">
                </div>
                <div class="gift-info">
                    <div class="gift-name">${gift.gift.name}</div>
                    <div class="gift-from">от ${gift.sender.displayName}</div>
                    <div class="gift-date">${app.formatTime(gift.sentAt)}</div>
                </div>
            </div>
        `).join('');
    }

    async changeAvatar() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Здесь будет API для загрузки аватара
            app.showNotification('Функция смены аватара в разработке', 'info');
        };
        
        input.click();
    }

    editProfile() {
        app.showNotification('Редактирование профиля в разработке', 'info');
    }

    async sendMessage(username) {
        // Открыть чат с пользователем
        app.showSection('chat');
        // Здесь будет логика открытия чата с конкретным пользователем
        app.showNotification(`Открыть чат с ${username}`, 'info');
    }

    async sendGift(userId) {
        // Открыть магазин подарков для отправки
        app.showSection('gifts');
        app.showNotification('Выберите подарок для отправки', 'info');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

const profileManager = new ProfileManager();
