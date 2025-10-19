class SettingsManager {
    constructor() {
        this.settings = {
            theme: 'dark',
            notifications: true,
            language: 'ru'
        };
    }

    async loadSettings() {
        // Загрузить текущие настройки пользователя
        this.settings.theme = app.currentUser.theme || 'dark';
        this.settings.notifications = app.currentUser.notifications !== false;
        this.settings.language = app.currentUser.language || 'ru';

        this.renderSettings();
    }

    renderSettings() {
        const settingsContainer = document.getElementById('settingsContainer');
        if (!settingsContainer) return;

        settingsContainer.innerHTML = `
            <div class="settings-section">
                <h3>Внешний вид</h3>
                <div class="setting-group">
                    <label>Тема оформления</label>
                    <div class="theme-selector">
                        <div class="theme-option ${this.settings.theme === 'dark' ? 'active' : ''}" 
                             onclick="settingsManager.changeTheme('dark')">
                            <div class="theme-preview dark-theme"></div>
                            <span>Темная</span>
                        </div>
                        <div class="theme-option ${this.settings.theme === 'light' ? 'active' : ''}" 
                             onclick="settingsManager.changeTheme('light')">
                            <div class="theme-preview light-theme"></div>
                            <span>Светлая</span>
                        </div>
                        <div class="theme-option ${this.settings.theme === 'custom1' ? 'active' : ''}" 
                             onclick="settingsManager.changeTheme('custom1')">
                            <div class="theme-preview" style="background: url('/assets/tema1.png') center/cover;"></div>
                            <span>Молния</span>
                        </div>
                        <div class="theme-option ${this.settings.theme === 'custom2' ? 'active' : ''}" 
                             onclick="settingsManager.changeTheme('custom2')">
                            <div class="theme-preview" style="background: url('/assets/tema2.png') center/cover;"></div>
                            <span>Блики</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="settings-section">
                <h3>Уведомления</h3>
                <div class="setting-group">
                    <label class="switch">
                        <input type="checkbox" id="notificationsToggle" ${this.settings.notifications ? 'checked' : ''}>
                        <span class="slider"></span>
                        <span class="switch-label">Push уведомления</span>
                    </label>
                </div>
                <div class="setting-group">
                    <label class="switch">
                        <input type="checkbox" id="soundToggle" checked>
                        <span class="slider"></span>
                        <span class="switch-label">Звуковые уведомления</span>
                    </label>
                </div>
            </div>

            <div class="settings-section">
                <h3>Язык</h3>
                <div class="setting-group">
                    <select id="languageSelect" class="form-select">
                        <option value="ru" ${this.settings.language === 'ru' ? 'selected' : ''}>Русский</option>
                        <option value="en" ${this.settings.language === 'en' ? 'selected' : ''}>English</option>
                    </select>
                </div>
            </div>

            <div class="settings-section">
                <h3>Аккаунт</h3>
                <div class="setting-group">
                    <button class="btn btn-secondary" onclick="settingsManager.exportData()">
                        Экспорт данных
                    </button>
                    <button class="btn btn-secondary" onclick="settingsManager.clearCache()">
                        Очистить кеш
                    </button>
                </div>
            </div>

            <div class="settings-section">
                <h3>О приложении</h3>
                <div class="setting-group">
                    <p>Epic Messenger v1.0.0</p>
                    <p>© 2024 Все права защищены</p>
                    <button class="btn btn-link" onclick="settingsManager.showAbout()">
                        О программе
                    </button>
                </div>
            </div>

            <div class="settings-actions">
                <button class="btn btn-primary" onclick="settingsManager.saveSettings()">
                    Сохранить настройки
                </button>
                <button class="btn btn-danger" onclick="settingsManager.logout()">
                    Выйти из аккаунта
                </button>
            </div>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Переключатели
        const toggles = document.querySelectorAll('.switch input');
        toggles.forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const setting = e.target.id.replace('Toggle', '');
                this.settings[setting] = e.target.checked;
            });
        });

        // Выбор языка
        const languageSelect = document.getElementById('languageSelect');
        if (languageSelect) {
            languageSelect.addEventListener('change', (e) => {
                this.settings.language = e.target.value;
            });
        }
    }

    async changeTheme(theme) {
        this.settings.theme = theme;
        
        // Обновить активную тему в UI
        document.querySelectorAll('.theme-option').forEach(option => {
            option.classList.remove('active');
        });
        event.target.closest('.theme-option').classList.add('active');

        // Применить тему немедленно
        app.applyTheme(theme);
        
        app.showNotification(`Тема изменена на: ${this.getThemeName(theme)}`, 'success');
    }

    getThemeName(theme) {
        const themeNames = {
            'dark': 'Темная',
            'light': 'Светлая', 
            'custom1': 'Молния',
            'custom2': 'Блики'
        };
        return themeNames[theme] || theme;
    }

    async saveSettings() {
        try {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${app.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.settings)
            });

            const data = await response.json();

            if (data.success) {
                // Обновить данные пользователя
                app.currentUser.theme = this.settings.theme;
                app.currentUser.notifications = this.settings.notifications;
                app.currentUser.language = this.settings.language;
                
                app.showNotification('Настройки сохранены!', 'success');
            } else {
                app.showNotification(data.message, 'error');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            app.showNotification('Ошибка сохранения настроек', 'error');
        }
    }

    exportData() {
        const data = {
            user: app.currentUser,
            settings: this.settings,
            exportDate: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `epic-messenger-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        app.showNotification('Данные экспортированы', 'success');
    }

    clearCache() {
        localStorage.removeItem('theme');
        localStorage.removeItem('lastPostsUpdate');
        localStorage.removeItem('lastChatsUpdate');
        
        app.showNotification('Кеш очищен', 'success');
    }

    showAbout() {
        alert(`Epic Messenger v1.0.0\n\nСоциальная сеть с системой E-COIN\nРазработано с ❤️ для общения`);
    }

    logout() {
        if (confirm('Вы уверены, что хотите выйти?')) {
            app.logout();
        }
    }
}

const settingsManager = new SettingsManager();
