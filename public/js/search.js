// Глобальные переменные
let currentUser = null;
let allUsers = [];

// Основная функция инициализации
async function initializeSearch() {
    try {
        await initializeUser();
        initializeSearchUI();
    } catch (error) {
        console.error('Ошибка инициализации поиска:', error);
        showNotification('Ошибка загрузки поиска', 'error');
    }
}

// Инициализация пользователя
async function initializeUser() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        const response = await fetch('/api/current-user', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            updateUserInterface();
        } else {
            localStorage.removeItem('authToken');
            window.location.href = '/login.html';
        }
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
    }
}

// Обновление интерфейса пользователя
function updateUserInterface() {
    if (!currentUser) return;
    
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const userUsername = document.getElementById('userUsername');
    const verifiedBadge = document.getElementById('verifiedBadge');
    const developerBadge = document.getElementById('developerBadge');
    const adminPanelBtn = document.getElementById('adminPanelBtn');

    // Обновляем аватар
    if (currentUser.avatar) {
        userAvatar.innerHTML = `<img src="${currentUser.avatar}" alt="${currentUser.displayName}">`;
    } else {
        userAvatar.textContent = currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'U';
    }
    
    // Обновляем имя
    userName.innerHTML = currentUser.displayName || 'Пользователь';
    
    // Показываем бейджи
    if (currentUser.verified) {
        verifiedBadge.style.display = 'inline-flex';
    }
    
    if (currentUser.isDeveloper) {
        developerBadge.style.display = 'inline-flex';
        adminPanelBtn.style.display = 'flex';
    }

    // Обновляем username
    userUsername.textContent = `@${currentUser.username}`;
}

// Инициализация UI поиска
function initializeSearchUI() {
    // Поиск пользователей
    const userSearchInput = document.getElementById('userSearchInput');
    userSearchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.trim();
        if (searchTerm.length >= 2) {
            searchUsers(searchTerm);
        } else {
            document.getElementById('searchResults').innerHTML = 
                '<div class="system-message">Введите запрос для поиска пользователей</div>';
        }
    });

    // Переключение сайдбара
    const profileSection = document.getElementById('profileSection');
    const sidebar = document.getElementById('sidebar');
    
    profileSection.addEventListener('click', function() {
        sidebar.classList.toggle('expanded');
    });

    // Выход
    document.getElementById('logoutBtn').addEventListener('click', function() {
        if (confirm('Вы уверены, что хотите выйти?')) {
            localStorage.removeItem('authToken');
            window.location.href = '/login.html';
        }
    });
}

// Поиск пользователей
async function searchUsers(searchTerm) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchTerm)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderSearchResults(data.users);
        } else {
            document.getElementById('searchResults').innerHTML = 
                '<div class="system-message">Ошибка поиска пользователей</div>';
        }
    } catch (error) {
        console.error('Ошибка поиска пользователей:', error);
        document.getElementById('searchResults').innerHTML = 
            '<div class="system-message">Ошибка поиска пользователей</div>';
    }
}

// Отображение результатов поиска
function renderSearchResults(users) {
    const searchResults = document.getElementById('searchResults');
    searchResults.innerHTML = '';

    if (users.length === 0) {
        searchResults.innerHTML = '<div class="system-message">Пользователи не найдены</div>';
        return;
    }

    users.forEach(user => {
        const userElement = document.createElement('div');
        userElement.className = 'chat-item';
        userElement.innerHTML = `
            <div class="chat-avatar">
                ${user.avatar ? 
                    `<img src="${user.avatar}" alt="${user.displayName}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                    user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'
                }
            </div>
            <div class="chat-info">
                <h4>
                    ${user.displayName || 'Пользователь'}
                    ${user.verified ? '<span class="verified-badge">✓</span>' : ''}
                    ${user.isDeveloper ? '<span class="developer-badge">👑</span>' : ''}
                    <span class="${user.status === 'online' ? 'online-status' : 'offline-status'}"></span>
                </h4>
                <span>@${user.username}</span>
                <div class="chat-last-message">
                    ${user.description || 'Нет описания'}
                </div>
            </div>
        `;
        
        userElement.addEventListener('click', () => {
            openUserProfile(user);
        });
        
        searchResults.appendChild(userElement);
    });
}

// Открытие профиля пользователя
function openUserProfile(user) {
    const modal = document.getElementById('userProfileModal');
    const title = document.getElementById('userProfileTitle');
    const content = document.getElementById('userProfileContent');

    title.textContent = `Профиль: ${user.displayName}`;
    
    content.innerHTML = `
        <div class="user-profile">
            <div class="profile-header-large">
                <div class="avatar-large">
                    ${user.avatar ? 
                        `<img src="${user.avatar}" alt="${user.displayName}">` : 
                        user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'
                    }
                </div>
                <div class="profile-info-large">
                    <h2>
                        ${user.displayName || 'Пользователь'}
                        ${user.verified ? '<span class="verified-badge">✓</span>' : ''}
                        ${user.isDeveloper ? '<span class="developer-badge">👑</span>' : ''}
                    </h2>
                    <div class="username">@${user.username}</div>
                    <div class="profile-stats">
                        <div class="stat-item">
                            <div class="stat-value">${user.postsCount || 0}</div>
                            <div class="stat-label">Постов</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${user.giftsCount || 0}</div>
                            <div class="stat-label">Подарков</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${user.status === 'online' ? '🟢' : '⚫'}</div>
                            <div class="stat-label">${user.status === 'online' ? 'Онлайн' : 'Офлайн'}</div>
                        </div>
                    </div>
                    <div class="profile-actions">
                        <button class="btn" id="openChatWithUser">Написать сообщение</button>
                        <button class="btn" id="sendGiftToUser">Отправить подарок</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="profile-tabs">
            <button class="profile-tab active" data-tab="user-profile-posts">Посты</button>
            <button class="profile-tab" data-tab="user-profile-gifts">Подарки</button>
        </div>
        <div class="profile-tab-content active" id="user-profile-posts">
            <div id="userProfilePostsList">
                <div class="system-message">Загрузка постов...</div>
            </div>
        </div>
        <div class="profile-tab-content" id="user-profile-gifts">
            <div class="my-gifts-grid" id="userProfileGiftsList">
                <div class="system-message">Загрузка подарков...</div>
            </div>
        </div>
    `;

    // Загружаем посты пользователя
    loadUserProfilePosts(user.id);
    // Загружаем подарки пользователя
    loadUserProfileGifts(user.id);

    // Обработчики кнопок
    document.getElementById('openChatWithUser').addEventListener('click', function() {
        // Здесь будет логика открытия чата с пользователем
        showNotification(`Открытие чата с ${user.displayName}`, 'success');
        modal.style.display = 'none';
        // В реальном приложении здесь будет переход к чату
    });

    document.getElementById('sendGiftToUser').addEventListener('click', function() {
        // Здесь будет логика отправки подарка
        showNotification(`Отправка подарка пользователю ${user.displayName}`, 'success');
        modal.style.display = 'none';
        window.location.href = '/gifts';
    });

    // Инициализируем табы в модальном окне
    const tabs = content.querySelectorAll('.profile-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            content.querySelectorAll('.profile-tab-content').forEach(c => c.classList.remove('active'));
            const targetContent = content.querySelector(`#${tabId}`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });

    modal.style.display = 'flex';
}

// Загрузка постов пользователя
async function loadUserProfilePosts(userId) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/posts/user/${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderUserProfilePosts(data.posts);
        }
    } catch (error) {
        console.error('Ошибка загрузки постов пользователя:', error);
    }
}

// Отображение постов пользователя
function renderUserProfilePosts(posts) {
    const postsList = document.getElementById('userProfilePostsList');
    if (!postsList) return;
    
    postsList.innerHTML = '';
    
    if (posts.length === 0) {
        postsList.innerHTML = '<div class="system-message">У пользователя пока нет постов</div>';
        return;
    }
    
    posts.forEach(post => {
        const postElement = createPostElement(post);
        postsList.appendChild(postElement);
    });
}

// Создание элемента поста
function createPostElement(post) {
    const postElement = document.createElement('div');
    postElement.className = 'user-post';
    
    let mediaHtml = '';
    if (post.image) {
        mediaHtml = `
            <div class="user-post-media">
                <img src="${post.image}" alt="Изображение поста">
            </div>
        `;
    } else if (post.file && post.fileType === 'video') {
        mediaHtml = `
            <div class="user-post-media">
                <video controls>
                    <source src="${post.file}" type="video/mp4">
                    Ваш браузер не поддерживает видео.
                </video>
            </div>
        `;
    }
    
    postElement.innerHTML = `
        <div class="user-post-header">
            <div class="user-post-avatar">
                ${post.userAvatar ? 
                    `<img src="${post.userAvatar}" alt="${post.userName}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                    post.userName ? post.userName.charAt(0).toUpperCase() : 'U'
                }
            </div>
            <div class="user-post-info">
                <div class="user-post-name">
                    ${post.userName || 'Неизвестный'}
                    ${post.userVerified ? '<span class="verified-badge">✓</span>' : ''}
                </div>
                <div class="user-post-time">${new Date(post.createdAt).toLocaleString()}</div>
            </div>
        </div>
        <div class="user-post-content">
            <div class="user-post-text">${post.text || ''}</div>
            ${mediaHtml}
        </div>
        <div class="user-post-actions">
            <button class="post-action">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M12,21.35L10.55,20.03C5.4,15.36 2,12.28 2,8.5C2,5.42 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.09C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.42 22,8.5C22,12.28 18.6,15.36 13.45,20.04L12,21.35Z"/>
                </svg>
                <span>${post.likes ? post.likes.length : 0}</span>
            </button>
        </div>
    `;
    
    return postElement;
}

// Загрузка подарков пользователя
async function loadUserProfileGifts(userId) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/gifts/user/${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderUserProfileGifts(data.gifts);
        }
    } catch (error) {
        console.error('Ошибка загрузки подарков пользователя:', error);
    }
}

// Отображение подарков пользователя
function renderUserProfileGifts(gifts) {
    const giftsList = document.getElementById('userProfileGiftsList');
    if (!giftsList) return;
    
    giftsList.innerHTML = '';
    
    if (gifts.length === 0) {
        giftsList.innerHTML = '<div class="system-message">У пользователя пока нет подарков</div>';
        return;
    }
    
    gifts.forEach(gift => {
        const giftElement = document.createElement('div');
        giftElement.className = 'my-gift-item';
        giftElement.innerHTML = `
            <div class="my-gift-preview">
                ${gift.giftImage ? 
                    `<img src="${gift.giftImage}" alt="${gift.giftName}">` : 
                    gift.giftPreview || '🎁'
                }
            </div>
            <div class="my-gift-name">${gift.giftName}</div>
            <div class="my-gift-from">От: ${gift.fromUserName}</div>
        `;
        
        giftsList.appendChild(giftElement);
    });
}

// Показать уведомление
function showNotification(message, type = 'success') {
    const notificationsContainer = document.getElementById('notificationsContainer');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    notificationsContainer.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
}

// Закрытие модального окна профиля пользователя
document.getElementById('closeUserProfile').addEventListener('click', function() {
    document.getElementById('userProfileModal').style.display = 'none';
});

// Закрытие модальных окон при клике вне их
document.addEventListener('click', function(e) {
    const modal = document.getElementById('userProfileModal');
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initializeSearch();
});
