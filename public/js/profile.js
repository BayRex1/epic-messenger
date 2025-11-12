let currentAvatarFile = null;
let currentUser = null;
let currentAvatarData = null;

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Инициализация страницы профиля...');
    
    initAvatarUpload();
    loadUserProfile();
    setupEventListeners();
    setupTabNavigation();
});

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
        preview.innerHTML = `
            <div class="avatar-preview-container">
                <img src="${e.target.result}" alt="Предпросмотр аватара" class="avatar-preview-image">
                <div class="avatar-preview-info">
                    <div><strong>${file.name}</strong></div>
                    <div>${(file.size / 1024).toFixed(2)} KB • ${file.type}</div>
                </div>
            </div>
        `;
        
        // Сохраняем файл для отправки
        currentAvatarFile = file;
        console.log('✅ Файл сохранен для отправки');
    };
    
    reader.onerror = function() {
        console.error('❌ Ошибка чтения файла');
        showNotification('Ошибка чтения файла', 'error');
    };
    
    reader.readAsDataURL(file);
}

function setupEventListeners() {
    // Кнопка редактирования профиля
    const editProfileBtn = document.getElementById('editProfileBtn');
    const changeAvatarBtn = document.getElementById('changeAvatarBtn');
    const closeEditProfile = document.getElementById('closeEditProfile');
    const cancelEditProfile = document.getElementById('cancelEditProfile');
    const closeChangeAvatar = document.getElementById('closeChangeAvatar');
    const cancelChangeAvatar = document.getElementById('cancelChangeAvatar');
    const saveProfile = document.getElementById('saveProfile');
    const saveAvatar = document.getElementById('saveAvatar');

    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', openEditProfileModal);
    }
    
    if (changeAvatarBtn) {
        changeAvatarBtn.addEventListener('click', openChangeAvatarModal);
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
    if (saveProfile) {
        saveProfile.addEventListener('click', saveProfile);
    }
    
    if (saveAvatar) {
        saveAvatar.addEventListener('click', saveAvatar);
    }
    
    // Выход из системы
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
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
        if (!token) {
            console.log('❌ Токен не найден');
            window.location.href = '/login.html';
            return;
        }

        const response = await fetch('/api/current-user', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        
        if (result.success) {
            console.log('✅ Профиль загружен:', result.user);
            currentUser = result.user;
            displayUserProfile(result.user);
            loadUserPosts();
            loadUserGifts();
        } else {
            console.log('❌ Ошибка загрузки профиля:', result.message);
            showNotification(result.message, 'error');
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки профиля:', error);
        showNotification('Ошибка загрузки профиля', 'error');
    }
}

function displayUserProfile(user) {
    console.log('🎨 Отображение профиля пользователя:', user.username);
    
    // Обновляем сайдбар
    document.getElementById('userName').textContent = user.displayName;
    document.getElementById('userUsername').textContent = `@${user.username}`;
    updateAvatarElement(document.getElementById('userAvatar'), user.avatar, user.displayName);
    
    // Обновляем основной профиль
    document.getElementById('profileUserName').textContent = user.displayName;
    document.getElementById('profileUserUsername').textContent = `@${user.username}`;
    updateAvatarElement(document.getElementById('profileUserAvatar'), user.avatar, user.displayName);
    
    // Обновляем бейджи
    if (user.verified) {
        document.getElementById('verifiedBadge').style.display = 'inline';
        document.getElementById('profileVerifiedBadge').style.display = 'inline';
    }
    if (user.isDeveloper) {
        document.getElementById('developerBadge').style.display = 'inline';
        document.getElementById('profileDeveloperBadge').style.display = 'inline';
    }
    
    // Обновляем статистику
    document.getElementById('profilePostsCount').textContent = user.postsCount || 0;
    document.getElementById('profileGiftsCount').textContent = user.giftsCount || 0;
    document.getElementById('profileCoinsCount').textContent = user.coins || 0;
    
    // Показываем админ-панель если пользователь администратор
    if (user.isDeveloper || user.isAdmin) {
        document.getElementById('adminPanelBtn').style.display = 'flex';
    }
}

function updateAvatarElement(element, avatarUrl, displayName) {
    if (!element) return;
    
    if (avatarUrl) {
        element.style.backgroundImage = `url(${avatarUrl})`;
        element.textContent = ''; // Убираем текстовую инициализацию
        console.log('✅ Аватар обновлен:', avatarUrl);
    } else {
        element.style.backgroundImage = '';
        element.textContent = getInitials(displayName);
        console.log('✅ Установлены инициалы:', getInitials(displayName));
    }
}

function getInitials(name) {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

function openEditProfileModal() {
    console.log('📝 Открытие модального окна редактирования профиля');
    
    if (!currentUser) {
        showNotification('Данные пользователя не загружены', 'error');
        return;
    }
    
    document.getElementById('editDisplayName').value = currentUser.displayName || '';
    document.getElementById('editUsername').value = currentUser.username || '';
    document.getElementById('editEmail').value = currentUser.email || '';
    document.getElementById('editDescription').value = currentUser.description || '';
    
    document.getElementById('editProfileModal').style.display = 'flex';
}

function closeEditProfileModal() {
    document.getElementById('editProfileModal').style.display = 'none';
}

async function saveProfile() {
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
            currentUser = result.user;
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

function openChangeAvatarModal() {
    console.log('🖼️ Открытие модального окна смены аватара');
    
    // Сбрасываем состояние
    currentAvatarFile = null;
    document.getElementById('avatarPreview').innerHTML = '';
    document.getElementById('avatarUrl').value = '';
    document.getElementById('avatarFileInput').value = '';
    
    document.getElementById('changeAvatarModal').style.display = 'flex';
}

function closeChangeAvatarModal() {
    document.getElementById('changeAvatarModal').style.display = 'none';
}

async function saveAvatar() {
    console.log('💾 Сохранение аватара...');
    
    const avatarUrl = document.getElementById('avatarUrl').value.trim();
    
    // Если есть файл - загружаем его
    if (currentAvatarFile) {
        console.log('📤 Загрузка файла аватара:', currentAvatarFile.name);
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
    if (!currentAvatarFile) {
        showNotification('Файл не выбран', 'error');
        return;
    }
    
    try {
        const formData = new FormData();
        formData.append('avatar', currentAvatarFile);
        
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
            currentUser = result.user;
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
            currentUser = result.user;
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
    
    if (!posts || posts.length === 0) {
        container.innerHTML = '<div class="system-message">У вас пока нет постов</div>';
        return;
    }
    
    // Фильтруем посты текущего пользователя
    const userPosts = posts.filter(post => post.userId === currentUser.id);
    
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
                <button class="post-action like-btn ${post.likes.includes(currentUser.id) ? 'liked' : ''}" 
                        onclick="likePost('${post.id}')">
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
    localStorage.removeItem('currentUser');
    
    showNotification('Вы вышли из системы', 'success');
    
    setTimeout(() => {
        window.location.href = '/login.html';
    }, 1000);
}

// Вспомогательные функции
function getToken() {
    return localStorage.getItem('token');
}

function showNotification(message, type = 'info') {
    const container = document.getElementById('notificationsContainer');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Экспортируем функции для глобального использования
window.likePost = likePost;
