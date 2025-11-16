// profile.js - исправленная версия с детальной отладкой
(function() {
    'use strict';
    
    console.log('🔄 Загрузка profile.js');
    
    // Функция для получения токена (совместимость с common.js)
    function getToken() {
        return localStorage.getItem('token') || localStorage.getItem('authToken');
    }

    // Глобальные переменные для модуля профиля
    if (typeof window._profileCurrentAvatarFile === 'undefined') {
        window._profileCurrentAvatarFile = null;
    }
    if (typeof window._profileCurrentUser === 'undefined') {
        window._profileCurrentUser = null;
    }
    if (typeof window._profileInitialized === 'undefined') {
        window._profileInitialized = false;
    }

    function addModalStyles() {
        if (document.getElementById('profile-modal-styles')) return;
        
        const modalStyles = `
        <style id="profile-modal-styles">
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            padding: 20px;
        }
        .modal-overlay.active { display: flex; animation: fadeIn 0.3s ease; }
        .modal-content {
            background: var(--bg-secondary);
            border-radius: 12px;
            padding: 25px;
            max-width: 500px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            border: 1px solid var(--border-color);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            animation: slideUp 0.3s ease;
        }
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid var(--border-color);
        }
        .modal-header h3 { margin: 0; color: var(--text-primary); font-size: 20px; }
        .close {
            font-size: 28px;
            cursor: pointer;
            color: var(--text-secondary);
            background: none;
            border: none;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.3s ease;
        }
        .close:hover { background: var(--bg-tertiary); color: var(--text-primary); }
        .modal-body { margin-bottom: 20px; }
        .form-group { margin-bottom: 20px; }
        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: var(--text-primary);
        }
        .modal-input {
            width: 100%;
            padding: 12px 15px;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            background: var(--bg-tertiary);
            color: var(--text-primary);
            font-size: 14px;
            transition: all 0.3s ease;
            font-family: inherit;
        }
        .modal-input:focus {
            outline: none;
            border-color: var(--accent-color);
            box-shadow: 0 0 0 2px rgba(0, 180, 180, 0.2);
        }
        .modal-input::placeholder { color: var(--text-secondary); }
        textarea.modal-input { resize: vertical; min-height: 80px; }
        .modal-buttons {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            margin-top: 25px;
            padding-top: 20px;
            border-top: 1px solid var(--border-color);
        }
        .modal-btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.3s ease;
            min-width: 100px;
            text-align: center;
        }
        .modal-btn.primary {
            background: var(--accent-color);
            color: white;
        }
        .modal-btn.primary:hover {
            background: var(--accent-hover);
            transform: translateY(-2px);
        }
        .modal-btn.secondary {
            background: var(--bg-tertiary);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
        }
        .modal-btn.secondary:hover {
            background: var(--border-color);
            transform: translateY(-2px);
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { 
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
            .modal-overlay { padding: 10px; }
            .modal-content { padding: 20px; }
            .modal-buttons { flex-direction: column; }
            .modal-btn { min-width: auto; width: 100%; }
        }

        /* Стили для предпросмотра аватара */
        .avatar-preview-container {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 15px;
            background: var(--bg-tertiary);
            border-radius: 8px;
            border: 1px solid var(--border-color);
        }
        .avatar-preview-image {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid var(--accent-color);
        }
        .avatar-preview-info {
            flex: 1;
        }
        .avatar-preview-info div {
            margin-bottom: 5px;
        }
        </style>`;
        
        document.head.insertAdjacentHTML('beforeend', modalStyles);
    }

    function addDebugControls() {
        // Проверяем, не добавлены ли уже debug controls
        if (document.getElementById('profile-debug-panel')) return;
        
        const debugDiv = document.createElement('div');
        debugDiv.id = 'profile-debug-panel';
        debugDiv.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 10px;
            border-radius: 5px;
            z-index: 10000;
            font-size: 12px;
            border: 1px solid #444;
            max-width: 300px;
        `;
        
        debugDiv.innerHTML = `
            <div style="margin-bottom: 8px; font-weight: bold; color: #00ff00;">🔧 Debug Panel</div>
            <div style="margin-bottom: 5px; font-size: 10px; opacity: 0.8;">Profile.js v2.0</div>
            <button onclick="window._debugLoadProfile()" style="background: #007bff; color: white; border: none; padding: 5px 8px; border-radius: 3px; cursor: pointer; margin: 2px; font-size: 10px;">
                Force Load
            </button>
            <button onclick="window._debugCheckToken()" style="background: #28a745; color: white; border: none; padding: 5px 8px; border-radius: 3px; cursor: pointer; margin: 2px; font-size: 10px;">
                Check Token
            </button>
            <button onclick="window._debugClearTokens()" style="background: #dc3545; color: white; border: none; padding: 5px 8px; border-radius: 3px; cursor: pointer; margin: 2px; font-size: 10px;">
                Clear Tokens
            </button>
            <button onclick="window._debugTestAPI()" style="background: #ffc107; color: black; border: none; padding: 5px 8px; border-radius: 3px; cursor: pointer; margin: 2px; font-size: 10px;">
                Test API
            </button>
            <div id="debug-status" style="margin-top: 8px; padding: 5px; background: #333; border-radius: 3px; font-size: 10px; min-height: 20px;"></div>
        `;
        
        document.body.appendChild(debugDiv);
    }

    // Debug функции
    window._debugLoadProfile = function() {
        console.log('🔧 Принудительная загрузка профиля...');
        updateDebugStatus('🔄 Принудительная загрузка...');
        loadUserProfile();
    };

    window._debugCheckToken = function() {
        const token = localStorage.getItem('token');
        const authToken = localStorage.getItem('authToken');
        console.log('🔐 Токены в localStorage:');
        console.log('token:', token ? `✅ (${token.length} chars)` : '❌');
        console.log('authToken:', authToken ? `✅ (${authToken.length} chars)` : '❌');
        
        let status = '🔐 Токены:<br>';
        status += `token: ${token ? `✅ (${token.length} chars)` : '❌'}<br>`;
        status += `authToken: ${authToken ? `✅ (${authToken.length} chars)` : '❌'}`;
        updateDebugStatus(status);
    };

    window._debugClearTokens = function() {
        localStorage.removeItem('token');
        localStorage.removeItem('authToken');
        console.log('🗑️ Токены очищены');
        updateDebugStatus('🗑️ Токены очищены');
        showNotification('Токены очищены', 'info');
    };

    window._debugTestAPI = async function() {
        const token = getToken();
        if (!token) {
            updateDebugStatus('❌ Нет токена для теста');
            return;
        }
        
        updateDebugStatus('🔄 Тестирование API...');
        
        try {
            const response = await fetch('/api/current-user', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const result = await response.json();
            console.log('🧪 Результат теста API:', result);
            
            let status = `🧪 API Test:<br>`;
            status += `Status: ${response.status}<br>`;
            status += `Success: ${result.success ? '✅' : '❌'}<br>`;
            status += `Message: ${result.message || 'N/A'}`;
            updateDebugStatus(status);
            
        } catch (error) {
            console.error('❌ Ошибка теста API:', error);
            updateDebugStatus(`❌ API Error: ${error.message}`);
        }
    };

    function updateDebugStatus(message) {
        const statusEl = document.getElementById('debug-status');
        if (statusEl) {
            statusEl.innerHTML = message;
        }
    }

    function checkElements() {
        console.log('🔍 Проверка элементов профиля...');
        const elements = [
            'editProfileBtn',
            'changeAvatarBtn', 
            'editProfileModal',
            'changeAvatarModal',
            'saveProfile',
            'saveAvatar',
            'userPostsList',
            'profileGiftsList'
        ];
        
        let foundCount = 0;
        elements.forEach(id => {
            const element = document.getElementById(id);
            console.log(`${element ? '✅' : '❌'} ${id}:`, element);
            if (element) foundCount++;
        });
        
        console.log(`📊 Найдено элементов: ${foundCount}/${elements.length}`);
        updateDebugStatus(`📊 Элементы: ${foundCount}/${elements.length}`);
    }

    function initAvatarUpload() {
        const uploadArea = document.getElementById('avatarUploadArea');
        const fileInput = document.getElementById('avatarFileInput');
        
        if (!uploadArea || !fileInput) {
            console.log('❌ Элементы загрузки аватара не найдены');
            return;
        }
        
        console.log('✅ Инициализация загрузки аватара');
        
        // Клик по области
        uploadArea.addEventListener('click', () => {
            console.log('📁 Открытие диалога выбора файла');
            fileInput.click();
        });
        
        // Drag & drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                console.log('📁 Файл перетащен:', files[0].name);
                handleAvatarFile(files[0]);
            }
        });
        
        // Изменение файла через input
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                console.log('📁 Файл выбран:', e.target.files[0].name);
                handleAvatarFile(e.target.files[0]);
            }
        });
    }

    function handleAvatarFile(file) {
        console.log('🔍 Проверка файла:', file.name, file.type, file.size);
        
        // Проверяем тип файла
        if (!file.type.startsWith('image/')) {
            showNotification('Пожалуйста, выберите изображение (JPG, PNG, GIF, WEBP)', 'error');
            return;
        }

        // Проверяем размер файла (макс. 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showNotification('Размер файла не должен превышать 5 МБ', 'error');
            return;
        }

        const reader = new FileReader();
        
        reader.onload = function(e) {
            console.log('✅ Файл прочитан, создаем предпросмотр');
            const preview = document.getElementById('avatarPreview');
            if (preview) {
                preview.innerHTML = `
                    <div class="avatar-preview-container">
                        <img src="${e.target.result}" alt="Предпросмотр аватара" class="avatar-preview-image">
                        <div class="avatar-preview-info">
                            <div><strong>${file.name}</strong></div>
                            <div>${(file.size / 1024).toFixed(2)} KB • ${file.type}</div>
                        </div>
                    </div>
                `;
            }
            
            // Сохраняем файл для отправки
            window._profileCurrentAvatarFile = file;
            console.log('✅ Файл сохранен для отправки');
        };
        
        reader.onerror = function() {
            console.error('❌ Ошибка чтения файла');
            showNotification('Ошибка чтения файла', 'error');
        };
        
        reader.readAsDataURL(file);
    }

    function setupEventListeners() {
        console.log('🔧 Настройка обработчиков событий профиля...');
        
        // Кнопка редактирования профиля
        const editProfileBtn = document.getElementById('editProfileBtn');
        const changeAvatarBtn = document.getElementById('changeAvatarBtn');
        const closeEditProfile = document.getElementById('closeEditProfile');
        const cancelEditProfile = document.getElementById('cancelEditProfile');
        const closeChangeAvatar = document.getElementById('closeChangeAvatar');
        const cancelChangeAvatar = document.getElementById('cancelChangeAvatar');
        const saveProfileBtn = document.getElementById('saveProfile');
        const saveAvatarBtn = document.getElementById('saveAvatar');
        const logoutBtn = document.getElementById('logoutBtn');

        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', openEditProfileModal);
            console.log('✅ Обработчик для editProfileBtn установлен');
        } else {
            console.log('❌ editProfileBtn не найден');
        }
        
        if (changeAvatarBtn) {
            changeAvatarBtn.addEventListener('click', openChangeAvatarModal);
            console.log('✅ Обработчик для changeAvatarBtn установлен');
        } else {
            console.log('❌ changeAvatarBtn не найден');
        }
        
        // Закрытие модальных окон
        if (closeEditProfile) {
            closeEditProfile.addEventListener('click', closeEditProfileModal);
        }
        
        if (cancelEditProfile) {
            cancelEditProfile.addEventListener('click', closeEditProfileModal);
        }
        
        if (closeChangeAvatar) {
            closeChangeAvatar.addEventListener('click', closeChangeAvatarModal);
        }
        
        if (cancelChangeAvatar) {
            cancelChangeAvatar.addEventListener('click', closeChangeAvatarModal);
        }
        
        // Сохранение профиля
        if (saveProfileBtn) {
            saveProfileBtn.addEventListener('click', saveProfileData);
        }
        
        if (saveAvatarBtn) {
            saveAvatarBtn.addEventListener('click', saveAvatarData);
        }
        
        // Выход из системы
        if (logoutBtn) {
            logoutBtn.addEventListener('click', logout);
        }
        
        // Закрытие модальных окон при клике вне их
        document.addEventListener('click', function(e) {
            const editModal = document.getElementById('editProfileModal');
            const avatarModal = document.getElementById('changeAvatarModal');
            
            if (editModal && e.target === editModal) {
                closeEditProfileModal();
            }
            
            if (avatarModal && e.target === avatarModal) {
                closeChangeAvatarModal();
            }
        });
        
        // Закрытие по ESC
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeEditProfileModal();
                closeChangeAvatarModal();
            }
        });
    }

    function setupTabNavigation() {
        const tabs = document.querySelectorAll('.profile-tab');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.getAttribute('data-tab');
                
                // Обновляем активные табы
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Показываем соответствующий контент
                document.querySelectorAll('.profile-tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                document.getElementById(targetTab).classList.add('active');
                
                // Загружаем данные для таба
                if (targetTab === 'user-posts') {
                    loadUserPosts();
                } else if (targetTab === 'user-gifts') {
                    loadUserGifts();
                }
            });
        });
    }

    async function loadUserProfile() {
        console.log('👤 Загрузка профиля пользователя...');
        
        try {
            const token = getToken();
            console.log('🔐 Токен для запроса:', token ? `✅ Длина: ${token.length} символов` : '❌ Отсутствует');
            updateDebugStatus(`🔐 Токен: ${token ? `${token.length} chars` : '❌'}`);
            
            if (!token) {
                console.log('❌ Токен не найден');
                showNotification('Необходимо авторизоваться', 'error');
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 2000);
                return;
            }

            console.log('🔄 Запрос к /api/current-user...');
            updateDebugStatus('🔄 Запрос к API...');
            
            const response = await fetch('/api/current-user', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log('📨 Статус ответа:', response.status);
            
            if (!response.ok) {
                console.log('❌ Ошибка HTTP:', response.status);
                let errorMessage = 'Ошибка сервера';
                
                try {
                    const errorData = await response.text();
                    console.log('📨 Тело ошибки:', errorData);
                    
                    if (errorData) {
                        try {
                            const errorJson = JSON.parse(errorData);
                            errorMessage = errorJson.message || errorMessage;
                        } catch (e) {
                            errorMessage = errorData;
                        }
                    }
                } catch (e) {
                    console.log('❌ Не удалось прочитать тело ошибки');
                }
                
                updateDebugStatus(`❌ HTTP ${response.status}: ${errorMessage}`);
                
                if (response.status === 401 || response.status === 400) {
                    showNotification('Сессия истекла. Войдите снова.', 'error');
                    localStorage.removeItem('token');
                    localStorage.removeItem('authToken');
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 2000);
                } else {
                    showNotification(errorMessage, 'error');
                }
                return;
            }

            const result = await response.json();
            console.log('📊 Ответ API:', result);
            
            if (result.success) {
                console.log('✅ Профиль загружен:', result.user);
                updateDebugStatus('✅ Профиль загружен');
                window._profileCurrentUser = result.user;
                displayUserProfile(result.user);
                loadUserPosts();
                loadUserGifts();
            } else {
                console.log('❌ Ошибка в ответе API:', result.message);
                updateDebugStatus(`❌ API: ${result.message}`);
                showNotification(result.message, 'error');
                if (result.message.includes('авторизован') || result.message.includes('token')) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('authToken');
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 2000);
                }
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки профиля:', error);
            updateDebugStatus(`❌ Error: ${error.message}`);
            showNotification('Ошибка загрузки профиля: ' + error.message, 'error');
        }
    }

    function displayUserProfile(user) {
        console.log('🎨 Отображение профиля пользователя:', user.username);
        
        // Обновляем сайдбар
        updateElementText('userName', user.displayName);
        updateElementText('userUsername', `@${user.username}`);
        updateAvatarElement(document.getElementById('userAvatar'), user.avatar, user.displayName);
        
        // Обновляем основной профиль
        updateElementText('profileUserName', user.displayName);
        updateElementText('profileUserUsername', `@${user.username}`);
        updateAvatarElement(document.getElementById('profileUserAvatar'), user.avatar, user.displayName);
        
        // Обновляем бейджи
        updateBadgeVisibility('verifiedBadge', user.verified);
        updateBadgeVisibility('profileVerifiedBadge', user.verified);
        updateBadgeVisibility('developerBadge', user.isDeveloper);
        updateBadgeVisibility('profileDeveloperBadge', user.isDeveloper);
        
        // Обновляем статистику
        updateElementText('profilePostsCount', user.postsCount || 0);
        updateElementText('profileGiftsCount', user.giftsCount || 0);
        updateElementText('profileCoinsCount', user.coins || 0);
        
        // Показываем админ-панель если пользователь администратор
        const adminPanelBtn = document.getElementById('adminPanelBtn');
        if (adminPanelBtn && (user.isDeveloper || user.isAdmin)) {
            adminPanelBtn.style.display = 'flex';
        }
    }

    function updateElementText(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        }
    }

    function updateBadgeVisibility(badgeId, isVisible) {
        const badge = document.getElementById(badgeId);
        if (badge) {
            badge.style.display = isVisible ? 'inline' : 'none';
        }
    }

    function updateAvatarElement(element, avatarUrl, displayName) {
        if (!element) return;
        
        if (avatarUrl) {
            element.style.backgroundImage = `url(${avatarUrl})`;
            element.textContent = '';
            console.log('✅ Аватар обновлен:', avatarUrl);
        } else {
            element.style.backgroundImage = '';
            element.textContent = getInitials(displayName);
        }
    }

    function getInitials(name) {
        if (!name) return 'U';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    }

    function openEditProfileModal() {
        console.log('📝 Открытие модального окна редактирования профиля');
        
        if (!window._profileCurrentUser) {
            showNotification('Данные пользователя не загружены', 'error');
            return;
        }
        
        // Заполняем поля текущими данными
        document.getElementById('editDisplayName').value = window._profileCurrentUser.displayName || '';
        document.getElementById('editUsername').value = window._profileCurrentUser.username || '';
        document.getElementById('editEmail').value = window._profileCurrentUser.email || '';
        document.getElementById('editDescription').value = window._profileCurrentUser.description || '';
        
        const modal = document.getElementById('editProfileModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('active');
        }
    }

    function closeEditProfileModal() {
        const modal = document.getElementById('editProfileModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');
        }
    }

    function openChangeAvatarModal() {
        console.log('🖼️ Открытие модального окна смены аватара');
        
        // Сбрасываем состояние
        window._profileCurrentAvatarFile = null;
        document.getElementById('avatarPreview').innerHTML = '';
        document.getElementById('avatarUrl').value = '';
        document.getElementById('avatarFileInput').value = '';
        
        const modal = document.getElementById('changeAvatarModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('active');
        }
    }

    function closeChangeAvatarModal() {
        const modal = document.getElementById('changeAvatarModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');
        }
    }

    async function saveProfileData() {
        console.log('💾 Сохранение профиля...');
        
        const displayName = document.getElementById('editDisplayName').value.trim();
        const username = document.getElementById('editUsername').value.trim();
        const email = document.getElementById('editEmail').value.trim();
        const description = document.getElementById('editDescription').value.trim();
        
        if (!displayName) {
            showNotification('Имя для отображения обязательно', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/update-profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({
                    displayName,
                    username,
                    email,
                    description
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('Профиль успешно обновлен', 'success');
                window._profileCurrentUser = result.user;
                displayUserProfile(result.user);
                closeEditProfileModal();
            } else {
                showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка сохранения профиля:', error);
            showNotification('Ошибка сохранения профиля', 'error');
        }
    }

    async function saveAvatarData() {
        console.log('💾 Сохранение аватара...');
        
        const avatarUrl = document.getElementById('avatarUrl').value.trim();
        
        // Если есть файл - загружаем его
        if (window._profileCurrentAvatarFile) {
            console.log('📤 Загрузка файла аватара:', window._profileCurrentAvatarFile.name);
            await uploadAvatarFile();
        }
        // Если есть URL - сохраняем его
        else if (avatarUrl) {
            console.log('🌐 Сохранение аватара по URL:', avatarUrl);
            await saveAvatarUrl(avatarUrl);
        }
        else {
            showNotification('Выберите файл или введите URL', 'error');
        }
    }

    async function uploadAvatarFile() {
        if (!window._profileCurrentAvatarFile) {
            showNotification('Файл не выбран', 'error');
            return;
        }
        
        try {
            const formData = new FormData();
            formData.append('avatar', window._profileCurrentAvatarFile);
            
            console.log('📤 Отправка файла на сервер...');
            
            const response = await fetch('/api/upload-avatar', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                },
                body: formData
            });
            
            const result = await response.json();
            console.log('📥 Ответ сервера:', result);
            
            if (result.success) {
                showNotification('Аватар успешно обновлен', 'success');
                window._profileCurrentUser = result.user;
                displayUserProfile(result.user);
                closeChangeAvatarModal();
            } else {
                showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки аватара:', error);
            showNotification('Ошибка загрузки аватара', 'error');
        }
    }

    async function saveAvatarUrl(avatarUrl) {
        if (!avatarUrl) {
            showNotification('URL аватара не указан', 'error');
            return;
        }
        
        try {
            // Проверяем URL
            if (!avatarUrl.startsWith('http')) {
                showNotification('Некорректный URL', 'error');
                return;
            }
            
            const response = await fetch('/api/update-avatar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({
                    avatar: avatarUrl
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('Аватар успешно обновлен', 'success');
                window._profileCurrentUser = result.user;
                displayUserProfile(result.user);
                closeChangeAvatarModal();
            } else {
                showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('❌ Ошибка сохранения аватара:', error);
            showNotification('Ошибка сохранения аватара', 'error');
        }
    }

    async function loadUserPosts() {
        console.log('📝 Загрузка постов пользователя...');
        
        try {
            const response = await fetch('/api/posts', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                displayUserPosts(result.posts);
            } else {
                console.log('❌ Ошибка загрузки постов:', result.message);
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки постов:', error);
        }
    }

    function displayUserPosts(posts) {
        const container = document.getElementById('userPostsList');
        if (!container) return;
        
        if (!posts || posts.length === 0) {
            container.innerHTML = '<div class="system-message">У вас пока нет постов</div>';
            return;
        }
        
        // Фильтруем посты текущего пользователя
        const userPosts = posts.filter(post => post.userId === window._profileCurrentUser.id);
        
        if (userPosts.length === 0) {
            container.innerHTML = '<div class="system-message">У вас пока нет постов</div>';
            return;
        }
        
        container.innerHTML = userPosts.map(post => `
            <div class="post-card" data-post-id="${post.id}">
                <div class="post-header">
                    <div class="post-user">
                        <div class="user-avatar-small" style="background-image: url('${post.userAvatar || ''}')">
                            ${!post.userAvatar ? getInitials(post.userName) : ''}
                        </div>
                        <div class="user-info">
                            <div class="user-name">${post.userName}</div>
                            <div class="post-time">${formatDate(post.createdAt)}</div>
                        </div>
                    </div>
                </div>
                <div class="post-content">
                    ${post.text ? `<div class="post-text">${post.text}</div>` : ''}
                    ${post.image ? `<img src="${post.image}" alt="Изображение поста" class="post-image">` : ''}
                    ${post.file ? `
                        <div class="post-file">
                            <a href="${post.file}" target="_blank" class="file-link">
                                📎 ${post.fileName || 'Файл'}
                            </a>
                        </div>
                    ` : ''}
                </div>
                <div class="post-actions">
                    <button class="post-action like-btn ${post.likes.includes(window._profileCurrentUser.id) ? 'liked' : ''}" 
                            onclick="window.profileLikePost('${post.id}')">
                        ❤️ ${post.likes.length}
                    </button>
                </div>
            </div>
        `).join('');
    }

    async function loadUserGifts() {
        console.log('🎁 Загрузка подарков пользователя...');
        
        try {
            const response = await fetch('/api/my-gifts', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                displayUserGifts(result.gifts);
            } else {
                console.log('❌ Ошибка загрузки подарков:', result.message);
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки подарков:', error);
        }
    }

    function displayUserGifts(gifts) {
        const container = document.getElementById('profileGiftsList');
        if (!container) return;
        
        if (!gifts || gifts.length === 0) {
            container.innerHTML = '<div class="system-message">У вас пока нет подарков</div>';
            return;
        }
        
        container.innerHTML = gifts.map(gift => `
            <div class="gift-item" data-gift-id="${gift.id}">
                <div class="gift-image">
                    ${gift.giftImage ? 
                        `<img src="${gift.giftImage}" alt="${gift.giftName}">` : 
                        `<div class="gift-preview">${gift.giftPreview || '🎁'}</div>`
                    }
                </div>
                <div class="gift-info">
                    <div class="gift-name">${gift.giftName}</div>
                    <div class="gift-from">От: ${gift.fromUserName}</div>
                    <div class="gift-time">${formatDate(gift.timestamp)}</div>
                </div>
            </div>
        `).join('');
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) { // Меньше минуты
            return 'только что';
        } else if (diff < 3600000) { // Меньше часа
            const minutes = Math.floor(diff / 60000);
            return `${minutes} мин. назад`;
        } else if (diff < 86400000) { // Меньше суток
            const hours = Math.floor(diff / 3600000);
            return `${hours} ч. назад`;
        } else {
            return date.toLocaleDateString('ru-RU');
        }
    }

    async function likePost(postId) {
        try {
            const response = await fetch(`/api/posts/${postId}/like`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Обновляем отображение лайков
                const likeBtn = document.querySelector(`[data-post-id="${postId}"] .like-btn`);
                if (likeBtn) {
                    const isLiked = likeBtn.classList.contains('liked');
                    likeBtn.classList.toggle('liked');
                    likeBtn.innerHTML = `❤️ ${result.likes.length}`;
                }
            }
        } catch (error) {
            console.error('❌ Ошибка лайка поста:', error);
        }
    }

    function logout() {
        console.log('🚪 Выход из системы...');
        
        localStorage.removeItem('token');
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        
        showNotification('Вы вышли из системы', 'success');
        
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 1000);
    }

    function showNotification(message, type = 'info') {
        const container = document.getElementById('notificationsContainer');
        if (!container) {
            console.log('Уведомление:', message);
            return;
        }
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        container.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    // Экспортируем функции для глобального использования
    window.profileLikePost = likePost;
    window.profileOpenEditModal = openEditProfileModal;
    window.profileOpenAvatarModal = openChangeAvatarModal;

    // Инициализация
    function init() {
        if (window._profileInitialized) {
            console.log('ℹ️ Профиль уже инициализирован, пропускаем...');
            return;
        }
        
        console.log('🚀 Инициализация страницы профиля...');
        window._profileInitialized = true;
        
        addModalStyles();
        addDebugControls();
        setTimeout(checkElements, 500);
        initAvatarUpload();
        setupEventListeners();
        loadUserProfile();
        setupTabNavigation();
    }

    // Запуск
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
