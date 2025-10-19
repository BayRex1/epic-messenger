class AdminManager {
    constructor() {
        this.stats = {};
        this.users = [];
        this.promoCodes = [];
    }

    async loadAdminPanel() {
        if (!app.currentUser.isAdmin) {
            app.showNotification('Доступ запрещен', 'error');
            return;
        }

        await this.loadAdminStats();
        await this.loadAdminUsers();
        await this.loadPromoCodes();
    }

    async loadAdminStats() {
        try {
            const response = await fetch('/api/admin/stats', {
                headers: {
                    'Authorization': `Bearer ${app.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.stats = data.stats;
                    this.renderAdminStats();
                }
            }
        } catch (error) {
            console.error('Error loading admin stats:', error);
        }
    }

    renderAdminStats() {
        const statsContainer = document.getElementById('adminStats');
        if (!statsContainer) return;

        statsContainer.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon">👥</div>
                    <div class="stat-info">
                        <div class="stat-value">${this.stats.totalUsers}</div>
                        <div class="stat-label">Пользователей</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">📝</div>
                    <div class="stat-info">
                        <div class="stat-value">${this.stats.totalPosts}</div>
                        <div class="stat-label">Постов</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">💬</div>
                    <div class="stat-info">
                        <div class="stat-value">${this.stats.totalMessages}</div>
                        <div class="stat-label">Сообщений</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">🎁</div>
                    <div class="stat-info">
                        <div class="stat-value">${this.stats.totalGifts}</div>
                        <div class="stat-label">Подарков</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">📶</div>
                    <div class="stat-info">
                        <div class="stat-value">${this.stats.ping}ms</div>
                        <div class="stat-label">Ping</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⚡</div>
                    <div class="stat-info">
                        <div class="stat-value">${this.stats.fps}</div>
                        <div class="stat-label">FPS</div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadAdminUsers() {
        try {
            const response = await fetch('/api/admin/users', {
                headers: {
                    'Authorization': `Bearer ${app.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.users = data.users;
                    this.renderAdminUsers();
                }
            }
        } catch (error) {
            console.error('Error loading admin users:', error);
        }
    }

    renderAdminUsers() {
        const usersContainer = document.getElementById('adminUsers');
        if (!usersContainer) return;

        usersContainer.innerHTML = `
            <div class="admin-section-header">
                <h3>Управление пользователями</h3>
                <div class="users-count">Всего: ${this.users.length}</div>
            </div>
            <div class="users-list">
                ${this.users.map(user => `
                    <div class="user-admin-card ${user.id === app.currentUser.id ? 'current-user' : ''}">
                        <div class="user-main-info">
                            <img src="/assets/profile.svg" alt="Avatar" class="user-avatar">
                            <div class="user-details">
                                <div class="user-name">
                                    <span class="display-name">${user.displayName}</span>
                                    <span class="username">${user.username}</span>
                                </div>
                                <div class="user-stats">
                                    <span>Посты: ${user.postsCount}</span>
                                    <span>Лайки: ${user.likesCount}</span>
                                    <span>E-COIN: ${user.eCoins}</span>
                                </div>
                                <div class="user-badges">
                                    ${user.isVerified ? '<span class="badge verified">✓ Верифицирован</span>' : ''}
                                    ${user.isDeveloper ? '<span class="badge developer">⚡ Разработчик</span>' : ''}
                                    ${user.isAdmin ? '<span class="badge admin">👑 Админ</span>' : ''}
                                </div>
                            </div>
                        </div>
                        <div class="user-actions">
                            ${user.id !== app.currentUser.id ? `
                                <button class="btn btn-sm ${user.isVerified ? 'btn-warning' : 'btn-success'}" 
                                        onclick="adminManager.toggleVerify('${user.id}')">
                                    ${user.isVerified ? 'Снять верификацию' : 'Верифицировать'}
                                </button>
                                <button class="btn btn-sm ${user.isDeveloper ? 'btn-warning' : 'btn-success'}" 
                                        onclick="adminManager.toggleDeveloper('${user.id}')">
                                    ${user.isDeveloper ? 'Снять разработчика' : 'Сделать разработчиком'}
                                </button>
                                <button class="btn btn-sm btn-danger" 
                                        onclick="adminManager.deleteUser('${user.id}')">
                                    Удалить
                                </button>
                            ` : `
                                <span class="current-user-label">Это вы</span>
                            `}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    async toggleVerify(userId) {
        try {
            const response = await fetch(`/api/admin/users/${userId}/toggle-verify`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${app.token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                app.showNotification('Статус верификации изменен', 'success');
                await this.loadAdminUsers();
            }
        } catch (error) {
            console.error('Error toggling verify:', error);
            app.showNotification('Ошибка изменения статуса', 'error');
        }
    }

    async toggleDeveloper(userId) {
        try {
            const response = await fetch(`/api/admin/users/${userId}/toggle-developer`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${app.token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                app.showNotification('Статус разработчика изменен', 'success');
                await this.loadAdminUsers();
            }
        } catch (error) {
            console.error('Error toggling developer:', error);
            app.showNotification('Ошибка изменения статуса', 'error');
        }
    }

    async deleteUser(userId) {
        const user = this.users.find(u => u.id === userId);
        if (!user) return;

        if (!confirm(`Вы уверены, что хотите удалить пользователя ${user.displayName} (@${user.username})?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/admin/users/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${app.token}`
                }
            });

            const data = await response.json();

            if (data.success) {
                app.showNotification('Пользователь удален', 'success');
                await this.loadAdminUsers();
                await this.loadAdminStats();
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            app.showNotification('Ошибка удаления пользователя', 'error');
        }
    }

    async loadPromoCodes() {
        try {
            const response = await fetch('/api/admin/promo-codes', {
                headers: {
                    'Authorization': `Bearer ${app.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.promoCodes = data.promoCodes;
                    this.renderPromoCodes();
                }
            }
        } catch (error) {
            console.error('Error loading promo codes:', error);
        }
    }

    renderPromoCodes() {
        const promoCodesContainer = document.getElementById('promoCodesContainer');
        if (!promoCodesContainer) return;

        promoCodesContainer.innerHTML = `
            <div class="admin-section-header">
                <h3>Управление промокодами</h3>
                <button class="btn btn-primary" onclick="adminManager.showCreatePromoModal()">
                    Создать промокод
                </button>
            </div>
            
            <div class="promo-codes-list">
                ${this.promoCodes.length === 0 ? `
                    <div class="empty-state">
                        <p>Промокоды не созданы</p>
                    </div>
                ` : this.promoCodes.map(promo => `
                    <div class="promo-code-card">
                        <div class="promo-code-info">
                            <div class="promo-code">${promo.code}</div>
                            <div class="promo-reward">${promo.reward} E-COIN</div>
                            <div class="promo-usage">Использовано: ${promo.uses}/${promo.maxUses}</div>
                        </div>
                        <div class="promo-code-date">
                            Создан: ${new Date(promo.createdAt).toLocaleDateString()}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    showCreatePromoModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Создать промокод</h3>
                    <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <form id="createPromoForm">
                        <div class="form-group">
                            <label>Код промокода</label>
                            <input type="text" id="promoCode" required placeholder="WELCOME100">
                        </div>
                        <div class="form-group">
                            <label>Награда (E-COIN)</label>
                            <input type="number" id="promoReward" required min="1" value="100">
                        </div>
                        <div class="form-group">
                            <label>Лимит использований</label>
                            <input type="number" id="promoMaxUses" required min="1" value="100">
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Отмена</button>
                    <button class="btn btn-primary" onclick="adminManager.createPromoCode()">Создать</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    async createPromoCode() {
        const code = document.getElementById('promoCode').value;
        const reward = document.getElementById('promoReward').value;
        const maxUses = document.getElementById('promoMaxUses').value;

        if (!code || !reward || !maxUses) {
            app.showNotification('Заполните все поля', 'error');
            return;
        }

        try {
            const response = await fetch('/api/admin/promo-codes', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${app.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code, reward })
            });

            const data = await response.json();

            if (data.success) {
                document.querySelector('.modal-overlay').remove();
                app.showNotification('Промокод создан', 'success');
                await this.loadPromoCodes();
            } else {
                app.showNotification(data.message, 'error');
            }
        } catch (error) {
            console.error('Error creating promo code:', error);
            app.showNotification('Ошибка создания промокода', 'error');
        }
    }
}

const adminManager = new AdminManager();
 
