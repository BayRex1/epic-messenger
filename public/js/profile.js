// profile.js - исправленная версия
(function() {
    'use strict';
    
    console.log('🔄 Загрузка profile.js');
    
    // Проверяем, не объявлены ли переменные уже
    if (typeof window._profileCurrentAvatarFile === 'undefined') {
        window._profileCurrentAvatarFile = null;
    }
    if (typeof window._profileCurrentUser === 'undefined') {
        window._profileCurrentUser = null;
    }
    if (typeof window._profileInitialized === 'undefined') {
        window._profileInitialized = false;
    }

    // Локальные ссылки на глобальные переменные
    const currentAvatarFile = window._profileCurrentAvatarFile;
    const currentUser = window._profileCurrentUser;
    let initialized = window._profileInitialized;

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
        </style>`;
        
        document.head.insertAdjacentHTML('beforeend', modalStyles);
    }

    function checkElements() {
        console.log('🔍 Проверка элементов профиля...');
        const elements = ['editProfileBtn', 'changeAvatarBtn', 'editProfileModal', 'changeAvatarModal', 'saveProfile', 'saveAvatar'];
        
        elements.forEach(id => {
            const element = document.getElementById(id);
            console.log(`${element ? '✅' : '❌'} ${id}:`, element);
        });
    }

    function initAvatarUpload() {
        const uploadArea = document.getElementById('avatarUploadArea');
        const fileInput = document.getElementById('avatarFileInput');
        
        if (!uploadArea || !fileInput) {
            console.log('❌ Элементы загрузки аватара не найдены');
            return;
        }
        
        uploadArea.addEventListener('click', () => fileInput.click());
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
            if (files.length > 0) handleAvatarFile(files[0]);
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleAvatarFile(e.target.files[0]);
        });
    }

    function handleAvatarFile(file) {
        if (!file.type.startsWith('image/')) {
            showNotification('Пожалуйста, выберите изображение (JPG, PNG, GIF, WEBP)', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showNotification('Размер файла не должен превышать 5 МБ', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('avatarPreview');
            if (preview) {
                preview.innerHTML = `
                    <div class="avatar-preview-container">
                        <img src="${e.target.result}" alt="Предпросмотр аватара" class="avatar-preview-image">
                        <div class="avatar-preview-info">
                            <div><strong>${file.name}</strong></div>
                            <div>${(file.size / 1024).toFixed(2)} KB • ${file.type}</div>
                        </div>
                    </div>`;
            }
            window._profileCurrentAvatarFile = file;
        };
        reader.onerror = () => showNotification('Ошибка чтения файла', 'error');
        reader.readAsDataURL(file);
    }

    function setupEventListeners() {
        console.log('🔧 Настройка обработчиков событий...');
        
        const editProfileBtn = document.getElementById('editProfileBtn');
        const changeAvatarBtn = document.getElementById('changeAvatarBtn');
        const closeEditProfile = document.getElementById('closeEditProfile');
        const cancelEditProfile = document.getElementById('cancelEditProfile');
        const closeChangeAvatar = document.getElementById('closeChangeAvatar');
        const cancelChangeAvatar = document.getElementById('cancelChangeAvatar');
        const saveProfileBtn = document.getElementById('saveProfile');
        const saveAvatarBtn = document.getElementById('saveAvatar');
        const logoutBtn = document.getElementById('logoutBtn');

        if (editProfileBtn) editProfileBtn.addEventListener('click', openEditProfileModal);
        if (changeAvatarBtn) changeAvatarBtn.addEventListener('click', openChangeAvatarModal);
        if (closeEditProfile) closeEditProfile.addEventListener('click', closeEditProfileModal);
        if (cancelEditProfile) cancelEditProfile.addEventListener('click', closeEditProfileModal);
        if (closeChangeAvatar) closeChangeAvatar.addEventListener('click', closeChangeAvatarModal);
        if (cancelChangeAvatar) cancelChangeAvatar.addEventListener('click', closeChangeAvatarModal);
        if (saveProfileBtn) saveProfileBtn.addEventListener('click', saveProfileData);
        if (saveAvatarBtn) saveAvatarBtn.addEventListener('click', saveAvatarData);
        if (logoutBtn) logoutBtn.addEventListener('click', logout);

        document.addEventListener('click', function(e) {
            if (e.target === document.getElementById('editProfileModal')) closeEditProfileModal();
            if (e.target === document.getElementById('changeAvatarModal')) closeChangeAvatarModal();
        });
        
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
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.profile-tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                document.getElementById(targetTab).classList.add('active');
                
                if (targetTab === 'user-posts') loadUserPosts();
                else if (targetTab === 'user-gifts') loadUserGifts();
            });
        });
    }

    async function loadUserProfile() {
        try {
            const token = getToken();
            if (!token) {
                window.location.href = '/login.html';
                return;
            }

            const response = await fetch('/api/current-user', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const result = await response.json();
            if (result.success) {
                window._profileCurrentUser = result.user;
                displayUserProfile(result.user);
                loadUserPosts();
                loadUserGifts();
            } else {
                showNotification(result.message, 'error');
                setTimeout(() => window.location.href = '/login.html', 2000);
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки профиля:', error);
            showNotification('Ошибка загрузки профиля', 'error');
        }
    }

    function displayUserProfile(user) {
        updateElementText('userName', user.displayName);
        updateElementText('userUsername', `@${user.username}`);
        updateElementText('profileUserName', user.displayName);
        updateElementText('profileUserUsername', `@${user.username}`);
        
        updateAvatarElement(document.getElementById('userAvatar'), user.avatar, user.displayName);
        updateAvatarElement(document.getElementById('profileUserAvatar'), user.avatar, user.displayName);
        
        updateBadgeVisibility('verifiedBadge', user.verified);
        updateBadgeVisibility('profileVerifiedBadge', user.verified);
        updateBadgeVisibility('developerBadge', user.isDeveloper);
        updateBadgeVisibility('profileDeveloperBadge', user.isDeveloper);
        
        updateElementText('profilePostsCount', user.postsCount || 0);
        updateElementText('profileGiftsCount', user.giftsCount || 0);
        updateElementText('profileCoinsCount', user.coins || 0);
        
        const adminPanelBtn = document.getElementById('adminPanelBtn');
        if (adminPanelBtn && (user.isDeveloper || user.isAdmin)) {
            adminPanelBtn.style.display = 'flex';
        }
    }

    function updateElementText(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) element.textContent = text;
    }

    function updateBadgeVisibility(badgeId, isVisible) {
        const badge = document.getElementById(badgeId);
        if (badge) badge.style.display = isVisible ? 'inline' : 'none';
    }

    function updateAvatarElement(element, avatarUrl, displayName) {
        if (!element) return;
        if (avatarUrl) {
            element.style.backgroundImage = `url(${avatarUrl})`;
            element.textContent = '';
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
        if (!window._profileCurrentUser) {
            showNotification('Данные пользователя не загружены', 'error');
            return;
        }
        
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
                body: JSON.stringify({ displayName, username, email, description })
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
        const avatarUrl = document.getElementById('avatarUrl').value.trim();
        
        if (window._profileCurrentAvatarFile) {
            await uploadAvatarFile();
        } else if (avatarUrl) {
            await saveAvatarUrl(avatarUrl);
        } else {
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
            
            const response = await fetch('/api/upload-avatar', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` },
                body: formData
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
            console.error('❌ Ошибка загрузки аватара:', error);
            showNotification('Ошибка загрузки аватара', 'error');
        }
    }

    async function saveAvatarUrl(avatarUrl) {
        if (!avatarUrl) {
            showNotification('URL аватара не указан', 'error');
            return;
        }
        
        if (!avatarUrl.startsWith('http')) {
            showNotification('Некорректный URL', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/update-avatar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({ avatar: avatarUrl })
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
        try {
            const response = await fetch('/api/posts', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            
            const result = await response.json();
            if (result.success) displayUserPosts(result.posts);
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
        try {
            const response = await fetch('/api/my-gifts', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            
            const result = await response.json();
            if (result.success) displayUserGifts(result.gifts);
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
        
        if (diff < 60000) return 'только что';
        else if (diff < 3600000) return `${Math.floor(diff / 60000)} мин. назад`;
        else if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч. назад`;
        else return date.toLocaleDateString('ru-RU');
    }

    async function likePost(postId) {
        try {
            const response = await fetch(`/api/posts/${postId}/like`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            
            const result = await response.json();
            if (result.success) {
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
        localStorage.removeItem('token');
        localStorage.removeItem('currentUser');
        showNotification('Вы вышли из системы', 'success');
        setTimeout(() => window.location.href = '/login.html', 1000);
    }

    function getToken() {
        return localStorage.getItem('token');
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
            if (notification.parentNode) notification.remove();
        }, 5000);
    }

    // Экспортируем функции глобально
    window.profileLikePost = likePost;
    window.profileOpenEditModal = openEditProfileModal;
    window.profileOpenAvatarModal = openChangeAvatarModal;

    // Инициализация
    function init() {
        if (window._profileInitialized) {
            console.log('ℹ️ Профиль уже инициализирован');
            return;
        }
        
        console.log('🚀 Инициализация страницы профиля...');
        window._profileInitialized = true;
        
        addModalStyles();
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
