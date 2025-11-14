// Глобальные переменные
let currentUser = null;
let currentChat = null;
let allUsers = [];
let posts = [];
let gifts = [];
let promoCodes = [];
let emojiList = [];
let currentFileType = null;
let currentFileData = null;
let socket = null;

// Основная функция инициализации приложения
async function initializeApp() {
    try {
        // Загружаем сохраненную тему
        loadTheme();
        
        // Инициализируем пользователя
        await initializeUser();
        
        // Инициализируем WebSocket соединение
        initializeWebSocket();
        
        // Инициализируем интерфейс
        initializeUI();
        
        // Загружаем начальные данные
        await loadInitialData();
        
        // Показываем приветственное уведомление
        showNotification('Добро пожаловать в Epic Messenger!', 'success');
        
    } catch (error) {
        console.error('Ошибка инициализации приложения:', error);
        showNotification('Ошибка загрузки приложения', 'error');
    }
}

// Инициализация WebSocket соединения
function initializeWebSocket() {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    // Создаем WebSocket соединение
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;
    
    socket = new WebSocket(wsUrl);

    socket.onopen = function() {
        console.log('WebSocket соединение установлено');
    };

    socket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };

    socket.onclose = function() {
        console.log('WebSocket соединение закрыто');
        // Пытаемся переподключиться через 5 секунд
        setTimeout(initializeWebSocket, 5000);
    };

    socket.onerror = function(error) {
        console.error('WebSocket ошибка:', error);
    };
}

// Обработка сообщений WebSocket
function handleWebSocketMessage(data) {
    switch(data.type) {
        case 'new_message':
            handleNewMessage(data.message);
            break;
        case 'message_read':
            handleMessageRead(data.messageId, data.userId);
            break;
        case 'user_online':
            handleUserOnline(data.userId);
            break;
        case 'user_offline':
            handleUserOffline(data.userId);
            break;
        case 'new_post':
            handleNewPost(data.post);
            break;
        case 'post_liked':
            handlePostLiked(data.postId, data.userId);
            break;
        case 'gift_sent':
            handleGiftSent(data.gift);
            break;
        case 'notification':
            showPushNotification(data.title, data.message);
            break;
    }
}

// Обработка нового сообщения
function handleNewMessage(message) {
    // Если сообщение в текущем открытом чате
    if (currentChat && currentChat.id === message.senderId) {
        renderNewMessage(message);
        markAsRead(message.senderId);
    }
    
    // Обновляем список чатов
    if (typeof loadChats === 'function') {
        loadChats();
    }
    
    // Показываем push-уведомление
    if (message.senderId !== currentUser.id) {
        const sender = allUsers.find(u => u.id === message.senderId);
        if (sender) {
            let messageText = message.text || 'Файл';
            if (message.type === 'gift') {
                messageText = '🎁 Подарок';
            }
            showPushNotification(sender.displayName, messageText);
        }
    }
}

// Обработка статуса прочтения сообщения
function handleMessageRead(messageId, userId) {
    // Обновляем статус прочтения в интерфейсе
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        const readStatus = messageElement.querySelector('.read-status');
        if (readStatus) {
            readStatus.classList.remove('unread');
            readStatus.classList.add('read');
            readStatus.innerHTML = '✓✓';
        }
    }
}

// Обработка статуса онлайн пользователя
function handleUserOnline(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (user) {
        user.status = 'online';
        user.lastSeen = new Date();
        
        // Обновляем статус в списке чатов
        updateUserStatusInChats(userId, 'online');
        
        // Обновляем статус в текущем чате
        if (currentChat && currentChat.id === userId) {
            const statusElement = document.getElementById('currentChatStatus');
            if (statusElement) {
                statusElement.textContent = 'В сети';
            }
        }
    }
}

// Обработка статуса офлайн пользователя
function handleUserOffline(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (user) {
        user.status = 'offline';
        user.lastSeen = new Date();
        
        // Обновляем статус в списке чатов
        updateUserStatusInChats(userId, 'offline');
        
        // Обновляем статус в текущем чате
        if (currentChat && currentChat.id === userId) {
            const statusElement = document.getElementById('currentChatStatus');
            if (statusElement) {
                statusElement.textContent = 
                    `Был(а) в сети ${new Date(user.lastSeen).toLocaleString()}`;
            }
        }
    }
}

// Обновление статуса пользователя в списке чатов
function updateUserStatusInChats(userId, status) {
    const chatItems = document.querySelectorAll('.chat-item');
    chatItems.forEach(item => {
        const chatUserId = item.getAttribute('data-user-id');
        if (chatUserId === userId) {
            const statusElement = item.querySelector('.online-status, .offline-status');
            if (statusElement) {
                statusElement.className = status === 'online' ? 'online-status' : 'offline-status';
            }
        }
    });
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
    if (userName) {
        userName.innerHTML = currentUser.displayName || 'Пользователь';
        
        // Показываем бейджи
        if (currentUser.verified) {
            if (verifiedBadge) {
                verifiedBadge.style.display = 'inline-flex';
                verifiedBadge.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M128 10 
                                 L143 33 L170 25 L180 50 L207 45 
                                 L210 70 L235 80 L225 105 L245 125 
                                 L225 145 L235 170 L210 180 L207 205 
                                 L180 200 L170 225 L143 217 L128 240 
                                 L113 217 L86 225 L76 200 L49 205 
                                 L46 180 L21 170 L31 145 L11 125 
                                 L31 105 L21 80 L46 70 L49 45 
                                 L76 50 L86 25 L113 33 Z" 
                              fill="url(#goldGradient)" />
                        <path d="M95 125 L120 150 L165 100" 
                              fill="none" stroke="#fff7c0" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
                        <defs>
                            <radialGradient id="goldGradient" cx="50%" cy="40%" r="60%">
                                <stop offset="0%" stop-color="#FFD700"/>
                                <stop offset="40%" stop-color="#FFC300"/>
                                <stop offset="100%" stop-color="#B8860B"/>
                            </radialGradient>
                        </defs>
                    </svg>
                `;
            }
        }
        
        if (currentUser.isDeveloper) {
            if (developerBadge) {
                developerBadge.style.display = 'inline-flex';
                developerBadge.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect width="48" height="48" rx="8" fill="url(#grad)"/>
                        <text x="24" y="30" text-anchor="middle" fill="url(#neon)" font-size="26" font-family="Arial, sans-serif" font-weight="bold" style="filter: drop-shadow(0 0 4px #C71585) drop-shadow(0 0 6px #8A2BE2);">E</text>
                        <defs>
                            <linearGradient id="grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                                <stop stop-color="#8A2BE2"/>
                                <stop offset="1" stop-color="#C71585"/>
                            </linearGradient>
                            <linearGradient id="neon" x1="0" y1="0" x2="0" y2="48" gradientUnits="userSpaceOnUse">
                                <stop stop-color="#FFFFFF"/>
                                <stop offset="1" stop-color="#FFD1FF"/>
                            </linearGradient>
                        </defs>
                    </svg>
                `;
            }
            if (adminPanelBtn) adminPanelBtn.style.display = 'flex';
        }
    }

    // Обновляем username
    if (userUsername) {
        userUsername.textContent = `@${currentUser.username}`;
    }

    // Обновляем профиль
    updateProfilePage();
}

// Обновление страницы профиля
function updateProfilePage() {
    if (!currentUser) return;

    const profileUserAvatar = document.getElementById('profileUserAvatar');
    const profileUserName = document.getElementById('profileUserName');
    const profileUserUsername = document.getElementById('profileUserUsername');
    const profileVerifiedBadge = document.getElementById('profileVerifiedBadge');
    const profileDeveloperBadge = document.getElementById('profileDeveloperBadge');
    const profilePostsCount = document.getElementById('profilePostsCount');
    const profileGiftsCount = document.getElementById('profileGiftsCount');
    const profileCoinsCount = document.getElementById('profileCoinsCount');

    // Аватар
    if (profileUserAvatar) {
        if (currentUser.avatar) {
            profileUserAvatar.innerHTML = `<img src="${currentUser.avatar}" alt="${currentUser.displayName}">`;
        } else {
            profileUserAvatar.textContent = currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'U';
        }
    }

    // Имя и бейджи
    if (profileUserName) {
        profileUserName.innerHTML = currentUser.displayName || 'Пользователь';
        if (currentUser.verified && profileVerifiedBadge) {
            profileVerifiedBadge.style.display = 'inline-flex';
            profileVerifiedBadge.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M128 10 
                             L143 33 L170 25 L180 50 L207 45 
                             L210 70 L235 80 L225 105 L245 125 
                             L225 145 L235 170 L210 180 L207 205 
                             L180 200 L170 225 L143 217 L128 240 
                             L113 217 L86 225 L76 200 L49 205 
                             L46 180 L21 170 L31 145 L11 125 
                             L31 105 L21 80 L46 70 L49 45 
                             L76 50 L86 25 L113 33 Z" 
                          fill="url(#goldGradient)" />
                    <path d="M95 125 L120 150 L165 100" 
                          fill="none" stroke="#fff7c0" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
                    <defs>
                        <radialGradient id="goldGradient" cx="50%" cy="40%" r="60%">
                            <stop offset="0%" stop-color="#FFD700"/>
                            <stop offset="40%" stop-color="#FFC300"/>
                            <stop offset="100%" stop-color="#B8860B"/>
                        </radialGradient>
                    </defs>
                </svg>
            `;
        }
        if (currentUser.isDeveloper && profileDeveloperBadge) {
            profileDeveloperBadge.style.display = 'inline-flex';
            profileDeveloperBadge.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="48" height="48" rx="8" fill="url(#grad)"/>
                    <text x="24" y="30" text-anchor="middle" fill="url(#neon)" font-size="26" font-family="Arial, sans-serif" font-weight="bold" style="filter: drop-shadow(0 0 4px #C71585) drop-shadow(0 0 6px #8A2BE2);">E</text>
                    <defs>
                        <linearGradient id="grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                            <stop stop-color="#8A2BE2"/>
                            <stop offset="1" stop-color="#C71585"/>
                        </linearGradient>
                        <linearGradient id="neon" x1="0" y1="0" x2="0" y2="48" gradientUnits="userSpaceOnUse">
                            <stop stop-color="#FFFFFF"/>
                            <stop offset="1" stop-color="#FFD1FF"/>
                        </linearGradient>
                    </defs>
                </svg>
            `;
        }
    }

    // Username
    if (profileUserUsername) {
        profileUserUsername.textContent = `@${currentUser.username}`;
    }

    // Статистика
    if (profilePostsCount) profilePostsCount.textContent = currentUser.postsCount || 0;
    if (profileGiftsCount) profileGiftsCount.textContent = currentUser.giftsCount || 0;
    if (profileCoinsCount) profileCoinsCount.textContent = currentUser.coins || 0;
}

function initializeUI() {
    // Переключение сайдбара
    const profileSection = document.getElementById('profileSection');
    const sidebar = document.getElementById('sidebar');
    
    if (profileSection && sidebar) {
        profileSection.addEventListener('click', function() {
            sidebar.classList.toggle('expanded');
        });
    }

    // Выход
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            if (confirm('Вы уверены, что хотите выйти?')) {
                localStorage.removeItem('authToken');
                window.location.href = '/login.html';
            }
        });
    }

    // Переключатель версий
    const desktopVersionBtn = document.getElementById('desktopVersionBtn');
    if (desktopVersionBtn) {
        desktopVersionBtn.addEventListener('click', function() {
            localStorage.setItem('preferredVersion', 'desktop');
            showNotification('Установлена компьютерная версия', 'success');
        });
    }

    // Тема
    initializeThemeSelector();

    // Эмодзи
    initializeEmojiPicker();

    // Загрузка файлов
    initializeFileUploads();

    // Упоминания
    initializeMentions();

    // Поиск пользователей
    initializeSearch();

    // Табы
    initializeTabs();
}

function initializeSearch() {
    // Поиск чатов
    const chatSearch = document.getElementById('chatSearch');
    if (chatSearch) {
        chatSearch.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            filterChats(searchTerm);
        });
    }

    // Поиск пользователей для отправки подарков
    const giftSearchUser = document.getElementById('giftSearchUser');
    if (giftSearchUser) {
        giftSearchUser.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            searchUsersForGifts(searchTerm);
        });
    }

    // Поиск пользователей в админке
    const adminUserSearch = document.getElementById('adminUserSearch');
    if (adminUserSearch) {
        adminUserSearch.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            filterAdminUsers(searchTerm);
        });
    }
}

function filterChats(searchTerm) {
    const chatItems = document.querySelectorAll('.chat-item');
    chatItems.forEach(item => {
        const chatName = item.querySelector('h4').textContent.toLowerCase();
        const lastMessage = item.querySelector('.chat-last-message').textContent.toLowerCase();
        
        if (chatName.includes(searchTerm) || lastMessage.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

async function searchUsersForGifts(searchTerm) {
    if (searchTerm.length < 2) {
        const giftUserResults = document.getElementById('giftUserResults');
        if (giftUserResults) {
            giftUserResults.innerHTML = '<div class="system-message">Введите имя пользователя</div>';
        }
        return;
    }

    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchTerm)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderUserSearchResults(data.users);
        }
    } catch (error) {
        console.error('Ошибка поиска пользователей:', error);
    }
}

function renderUserSearchResults(users) {
    const giftUserResults = document.getElementById('giftUserResults');
    if (!giftUserResults) return;
    
    giftUserResults.innerHTML = '';

    if (users.length === 0) {
        giftUserResults.innerHTML = '<div class="system-message">Пользователи не найдены</div>';
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
            </div>
        `;
        
        userElement.addEventListener('click', () => {
            selectUserForGift(user);
        });
        
        giftUserResults.appendChild(userElement);
    });
}

function selectUserForGift(user) {
    const giftUserResults = document.getElementById('giftUserResults');
    if (giftUserResults) {
        giftUserResults.innerHTML = `
            <div class="system-message">Выбран пользователь: ${user.displayName}</div>
        `;
    }
    
    // Показываем доступные подарки
    renderAvailableGifts(user);
}

function renderAvailableGifts(user) {
    const availableGiftsList = document.getElementById('availableGiftsList');
    if (!availableGiftsList) return;
    
    availableGiftsList.innerHTML = '';
    
    gifts.forEach(gift => {
        const giftElement = document.createElement('div');
        giftElement.className = 'gift-shop-item';
        giftElement.innerHTML = `
            <div class="gift-shop-preview">
                ${gift.image ? 
                    `<img src="${gift.image}" alt="${gift.name}">` : 
                    gift.preview
                }
            </div>
            <div class="gift-shop-name">${gift.name}</div>
            <div class="gift-shop-price">${gift.price} E-COIN</div>
        `;
        
        giftElement.addEventListener('click', () => buyGiftForUser(gift.id, user.id));
        availableGiftsList.appendChild(giftElement);
    });
}

async function buyGiftForUser(giftId, userId) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/gifts/${giftId}/buy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                toUserId: userId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Подарок отправлен пользователю!`, 'success');
            // Обновляем баланс
            await initializeUser();
        } else {
            showNotification('Ошибка покупки подарка: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка покупки подарка:', error);
        showNotification('Ошибка покупки подарка', 'error');
    }
}

function filterAdminUsers(searchTerm) {
    const adminUserItems = document.querySelectorAll('.admin-user-item');
    adminUserItems.forEach(item => {
        const userName = item.querySelector('h4').textContent.toLowerCase();
        const userStats = item.querySelector('.admin-user-stats').textContent.toLowerCase();
        
        if (userName.includes(searchTerm) || userStats.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function initializeFileUploads() {
    // Загрузка аватара
    const avatarFileInput = document.getElementById('avatarFileInput');
    const avatarUploadArea = document.getElementById('avatarUploadArea');
    
    if (avatarUploadArea && avatarFileInput) {
        avatarUploadArea.addEventListener('click', function() {
            avatarFileInput.click();
        });
        
        avatarFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 5 * 1024 * 1024) {
                    showNotification('Размер файла не должен превышать 5 МБ', 'error');
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = function(event) {
                    const imageUrl = event.target.result;
                    const avatarPreview = document.getElementById('avatarPreview');
                    if (avatarPreview) {
                        avatarPreview.innerHTML = `
                            <img src="${imageUrl}" alt="Предпросмотр" style="max-width: 200px; max-height: 200px; border-radius: 8px;">
                        `;
                    }
                    const avatarUrl = document.getElementById('avatarUrl');
                    if (avatarUrl) {
                        avatarUrl.value = imageUrl;
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Загрузка изображения для подарка
    const giftFileInput = document.getElementById('giftFileInput');
    const giftUploadArea = document.getElementById('giftUploadArea');
    
    if (giftUploadArea && giftFileInput) {
        giftUploadArea.addEventListener('click', function() {
            giftFileInput.click();
        });
        
        giftFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 10 * 1024 * 1024) {
                    showNotification('Размер файла не должен превышать 10 МБ', 'error');
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = function(event) {
                    const imageUrl = event.target.result;
                    const giftFilePreview = document.getElementById('giftFilePreview');
                    if (giftFilePreview) {
                        giftFilePreview.innerHTML = `
                            <img src="${imageUrl}" alt="Предпросмотр" style="max-width: 200px; max-height: 200px; border-radius: 8px;">
                        `;
                    }
                    const giftImage = document.getElementById('giftImage');
                    if (giftImage) {
                        giftImage.value = imageUrl;
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Загрузка файлов для постов
    const postFileInput = document.getElementById('postFileInput');
    const postFileUpload = document.getElementById('postFileUpload');
    
    if (postFileUpload && postFileInput) {
        postFileUpload.addEventListener('click', function() {
            postFileInput.click();
        });
        
        postFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 50 * 1024 * 1024) {
                    showNotification('Размер файла не должен превышать 50 МБ', 'error');
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = function(event) {
                    const fileUrl = event.target.result;
                    let previewHtml = '';
                    
                    if (file.type.startsWith('image/')) {
                        previewHtml = `<img src="${fileUrl}" alt="Предпросмотр" style="max-width: 200px; max-height: 200px;">`;
                    } else if (file.type.startsWith('video/')) {
                        previewHtml = `<video controls style="max-width: 200px; max-height: 200px;"><source src="${fileUrl}" type="${file.type}"></video>`;
                    } else if (file.type.startsWith('audio/')) {
                        previewHtml = `<audio controls><source src="${fileUrl}" type="${file.type}"></audio>`;
                    } else {
                        previewHtml = `<div>Файл: ${file.name}</div>`;
                    }
                    
                    const postFilePreview = document.getElementById('postFilePreview');
                    if (postFilePreview) {
                        postFilePreview.innerHTML = `
                            ${previewHtml}
                            <button type="button" onclick="document.getElementById('postFilePreview').innerHTML = ''; document.getElementById('postFileInput').value = '';" style="margin-top: 10px; background: var(--error-color); color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer;">Удалить</button>
                        `;
                    }
                    postFileInput.dataset.fileUrl = fileUrl;
                    postFileInput.dataset.fileName = file.name;
                    postFileInput.dataset.fileType = file.type.split('/')[0];
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Загрузка файлов для чата
    const fileInput = document.getElementById('fileInput');
    const fileUploadArea = document.getElementById('fileUploadArea');
    
    if (fileUploadArea && fileInput) {
        fileUploadArea.addEventListener('click', function() {
            fileInput.click();
        });
        
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 50 * 1024 * 1024) {
                    showNotification('Размер файла не должен превышать 50 МБ', 'error');
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = function(event) {
                    const fileUrl = event.target.result;
                    let previewHtml = '';
                    
                    if (file.type.startsWith('image/')) {
                        previewHtml = `<img src="${fileUrl}" alt="Предпросмотр" style="max-width: 200px; max-height: 200px;">`;
                    } else if (file.type.startsWith('video/')) {
                        previewHtml = `<video controls style="max-width: 200px; max-height: 200px;"><source src="${fileUrl}" type="${file.type}"></video>`;
                    } else if (file.type.startsWith('audio/')) {
                        previewHtml = `<audio controls><source src="${fileUrl}" type="${file.type}"></audio>`;
                    } else {
                        previewHtml = `<div>Файл: ${file.name}</div>`;
                    }
                    
                    const filePreview = document.getElementById('filePreview');
                    if (filePreview) {
                        filePreview.innerHTML = previewHtml;
                    }
                    currentFileData = fileUrl;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Drag and drop для загрузки файлов
    const uploadAreas = document.querySelectorAll('.file-upload-area');
    uploadAreas.forEach(area => {
        area.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('dragover');
        });
        
        area.addEventListener('dragleave', function(e) {
            e.preventDefault();
            this.classList.remove('dragover');
        });
        
        area.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                
                // Определяем тип загрузки по родительскому элементу
                if (this.id === 'avatarUploadArea') {
                    const avatarFileInput = document.getElementById('avatarFileInput');
                    if (avatarFileInput) {
                        avatarFileInput.files = files;
                        const event = new Event('change');
                        avatarFileInput.dispatchEvent(event);
                    }
                } else if (this.id === 'giftUploadArea') {
                    const giftFileInput = document.getElementById('giftFileInput');
                    if (giftFileInput) {
                        giftFileInput.files = files;
                        const event = new Event('change');
                        giftFileInput.dispatchEvent(event);
                    }
                } else if (this.id === 'postFileUpload') {
                    const postFileInput = document.getElementById('postFileInput');
                    if (postFileInput) {
                        postFileInput.files = files;
                        const event = new Event('change');
                        postFileInput.dispatchEvent(event);
                    }
                } else if (this.id === 'fileUploadArea') {
                    const fileInput = document.getElementById('fileInput');
                    if (fileInput) {
                        fileInput.files = files;
                        const event = new Event('change');
                        fileInput.dispatchEvent(event);
                    }
                }
            }
        });
    });
}

function initializeMentions() {
    // Обработчик клика по упоминаниям
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('mention')) {
            const username = e.target.textContent.substring(1); // Убираем @
            openUserProfile(username);
        }
    });

    // Обработчик ввода @ в сообщениях
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('input', function(e) {
            const value = e.target.value;
            const lastAtSymbol = value.lastIndexOf('@');
            
            if (lastAtSymbol !== -1) {
                const afterAt = value.substring(lastAtSymbol + 1);
                const spaceIndex = afterAt.indexOf(' ');
                
                if (spaceIndex === -1 || spaceIndex > 0) {
                    const searchTerm = spaceIndex === -1 ? afterAt : afterAt.substring(0, spaceIndex);
                    if (searchTerm.length > 0) {
                        showMentionSuggestions(searchTerm, lastAtSymbol);
                    }
                }
            }
        });
    }
}

function showMentionSuggestions(searchTerm, position) {
    // Фильтруем пользователей по поисковому запросу
    const filteredUsers = allUsers.filter(user => 
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.displayName.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 5); // Ограничиваем 5 предложениями

    if (filteredUsers.length === 0) return;

    // Создаем контейнер для предложений
    let suggestionsContainer = document.getElementById('mention-suggestions');
    if (!suggestionsContainer) {
        suggestionsContainer = document.createElement('div');
        suggestionsContainer.id = 'mention-suggestions';
        suggestionsContainer.style.cssText = `
            position: absolute;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 1000;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;
        const messageInputContainer = document.querySelector('.message-input-container');
        if (messageInputContainer) {
            messageInputContainer.appendChild(suggestionsContainer);
        }
    }

    // Заполняем предложения
    suggestionsContainer.innerHTML = '';
    filteredUsers.forEach(user => {
        const suggestion = document.createElement('div');
        suggestion.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        suggestion.innerHTML = `
            <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--accent-color); display: flex; align-items: center; justify-content: center; font-size: 12px; color: white;">
                ${user.avatar ? `<img src="${user.avatar}" style="width: 100%; height: 100%; border-radius: 50%;">` : user.displayName.charAt(0).toUpperCase()}
            </div>
            <div>
                <div style="font-weight: bold; font-size: 14px;">${user.displayName}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">@${user.username}</div>
            </div>
        `;
        
        suggestion.addEventListener('click', function() {
            insertMention(user.username, position);
            suggestionsContainer.remove();
        });
        
        suggestionsContainer.appendChild(suggestion);
    });

    // Позиционируем контейнер
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        const inputRect = messageInput.getBoundingClientRect();
        suggestionsContainer.style.top = `${inputRect.top - suggestionsContainer.offsetHeight - 10}px`;
        suggestionsContainer.style.left = `${inputRect.left}px`;
        suggestionsContainer.style.width = `${inputRect.width}px`;
    }
}

function insertMention(username, position) {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        const value = messageInput.value;
        const beforeMention = value.substring(0, position);
        const afterMention = value.substring(position).replace(/@[^\s]*/, '');
        messageInput.value = beforeMention + '@' + username + ' ' + afterMention;
        messageInput.focus();
    }
}

function initializeTabs() {
    // Обработчики для вкладок профиля
    const profileTabs = document.querySelectorAll('.profile-tab');
    profileTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            const container = this.closest('.profile-tabs').parentElement;
            
            // Деактивируем все вкладки и контенты
            container.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
            container.querySelectorAll('.profile-tab-content').forEach(c => c.classList.remove('active'));
            
            // Активируем текущую вкладку и контент
            this.classList.add('active');
            const content = container.querySelector(`#${tabId}`);
            if (content) {
                content.classList.add('active');
            }
        });
    });
}

function initializeThemeSelector() {
    const themeOptions = document.querySelectorAll('.theme-option');
    themeOptions.forEach(option => {
        option.addEventListener('click', function() {
            const theme = this.getAttribute('data-theme');
            
            themeOptions.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            
            document.body.className = `theme-${theme}`;
            localStorage.setItem('theme', theme);
            
            showNotification('Тема изменена', 'success');
        });
    });
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.className = `theme-${savedTheme}`;
    
    // Активируем соответствующую опцию в настройках
    const themeOption = document.querySelector(`.theme-option[data-theme="${savedTheme}"]`);
    if (themeOption) {
        themeOption.classList.add('active');
    }
}

async function initializeEmojiPicker() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/emoji', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            emojiList = data.emoji;
            renderEmojiPicker();
        }
    } catch (error) {
        console.error('Ошибка загрузки эмодзи:', error);
        // Загружаем стандартные эмодзи
        emojiList = [
            { name: 'smile', url: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f600.png' },
            { name: 'heart', url: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/2764-fe0f.png' },
            { name: 'fire', url: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f525.png' },
            { name: 'thumbsup', url: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f44d.png' },
            { name: 'star', url: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/2b50.png' },
            { name: 'clap', url: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f44f.png' }
        ];
        renderEmojiPicker();
    }
}

function renderEmojiPicker() {
    const emojiPicker = document.getElementById('emojiPicker');
    if (!emojiPicker) return;

    emojiPicker.innerHTML = '';

    emojiList.forEach(emoji => {
        const emojiItem = document.createElement('div');
        emojiItem.className = 'emoji-item';
        emojiItem.innerHTML = `<img src="${emoji.url}" alt="${emoji.name}" title="${emoji.name}">`;
        
        emojiItem.addEventListener('click', function() {
            const messageInput = document.getElementById('messageInput');
            if (messageInput) {
                messageInput.value += ` :${emoji.name}: `;
                messageInput.focus();
            }
            emojiPicker.classList.remove('active');
        });
        
        emojiPicker.appendChild(emojiItem);
    });

    // Кнопка эмодзи
    const emojiBtn = document.getElementById('emojiBtn');
    if (emojiBtn) {
        emojiBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            emojiPicker.classList.toggle('active');
        });
    }

    // Закрытие эмодзи панели при клике вне ее
    document.addEventListener('click', function() {
        if (emojiPicker) {
            emojiPicker.classList.remove('active');
        }
    });
}

async function loadInitialData() {
    await Promise.all([
        loadAllUsers(),
        loadPromoCodes()
    ]);
}

async function loadAllUsers() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/users', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            allUsers = data.users;
        }
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
    }
}

async function loadPromoCodes() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/promo-codes', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            promoCodes = data.promoCodes;
        }
    } catch (error) {
        console.error('Ошибка загрузки промокодов:', error);
    }
}

// Функция для обработки упоминаний
function processMentions(text) {
    return text.replace(/@(\w+)/g, '<span class="mention" data-username="$1">@$1</span>');
}

// Функция для открытия модального окна с изображением
function openImageModal(imageUrl) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 90%; max-height: 90%; background: transparent; box-shadow: none;">
            <div class="modal-header" style="justify-content: flex-end; padding: 10px;">
                <span class="close" style="color: white; font-size: 30px; cursor: pointer;">&times;</span>
            </div>
            <div style="display: flex; justify-content: center; align-items: center; height: 100%;">
                <img src="${imageUrl}" alt="Изображение" style="max-width: 100%; max-height: 100%; border-radius: 8px;">
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeBtn = modal.querySelector('.close');
    closeBtn.addEventListener('click', function() {
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Функция для открытия профиля пользователя
function openUserProfile(username) {
    const user = allUsers.find(u => u.username === username);
    if (!user) {
        showNotification('Пользователь не найден', 'error');
        return;
    }

    const modal = document.getElementById('userProfileModal');
    const title = document.getElementById('userProfileTitle');
    const content = document.getElementById('userProfileContent');

    if (!modal || !title || !content) return;

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
    const openChatBtn = document.getElementById('openChatWithUser');
    if (openChatBtn) {
        openChatBtn.addEventListener('click', function() {
            selectChat(user);
            modal.style.display = 'none';
            // Переключаемся на вкладку чата
            window.location.href = '/chat';
        });
    }

    const sendGiftBtn = document.getElementById('sendGiftToUser');
    if (sendGiftBtn) {
        sendGiftBtn.addEventListener('click', function() {
            selectUserForGift(user);
            modal.style.display = 'none';
            // Переключаемся на вкладку подарков
            window.location.href = '/gifts';
        });
    }

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

function showNotification(message, type = 'success') {
    const notificationsContainer = document.getElementById('notificationsContainer');
    if (!notificationsContainer) return;
    
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

function showPushNotification(title, message) {
    // Проверяем настройки уведомлений
    const notificationsEnabled = document.getElementById('notificationsEnabled')?.checked ?? true;
    if (!notificationsEnabled) return;

    const notificationsContainer = document.getElementById('notificationsContainer');
    if (!notificationsContainer) return;
    
    const pushNotification = document.createElement('div');
    pushNotification.className = 'push-notification';
    pushNotification.innerHTML = `
        <div class="push-avatar">${title.charAt(0)}</div>
        <div class="push-content">
            <div class="push-title">${title}</div>
            <div class="push-message">${message}</div>
        </div>
        <button class="push-close">&times;</button>
    `;
    
    notificationsContainer.appendChild(pushNotification);
    
    const closeBtn = pushNotification.querySelector('.push-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            if (pushNotification.parentNode) {
                pushNotification.parentNode.removeChild(pushNotification);
            }
        });
    }
    
    // Проверяем звуковые уведомления
    const soundEnabled = document.getElementById('soundEnabled')?.checked ?? true;
    if (soundEnabled) {
        // Воспроизводим звук уведомления
        playNotificationSound();
    }
    
    setTimeout(() => {
        if (pushNotification.parentNode) {
            pushNotification.parentNode.removeChild(pushNotification);
        }
    }, 10000);
}

function playNotificationSound() {
    // Создаем простой звук уведомления
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        console.error('Ошибка воспроизведения звука:', error);
    }
}

// Обработка новых постов через WebSocket
function handleNewPost(post) {
    // Добавляем пост в ленту
    const postsList = document.getElementById('postsList');
    if (postsList) {
        const postElement = createPostElement(post);
        postsList.insertBefore(postElement, postsList.firstChild);
    }
}

// Обработка лайков через WebSocket
function handlePostLiked(postId, userId) {
    // Обновляем счетчик лайков
    const likeBtn = document.querySelector(`.like-btn[data-post-id="${postId}"]`);
    if (likeBtn) {
        const likeCount = likeBtn.querySelector('span');
        const currentCount = parseInt(likeCount.textContent) || 0;
        likeCount.textContent = currentCount + 1;
        
        // Если это наш лайк, добавляем класс liked
        if (userId === currentUser.id) {
            likeBtn.classList.add('liked');
        }
    }
}

// Обработка отправленных подарков через WebSocket
function handleGiftSent(gift) {
    // Обновляем список подарков
    if (typeof loadMyGifts === 'function') {
        loadMyGifts();
    }
    
    // Показываем уведомление
    if (gift.toUserId === currentUser.id) {
        const fromUser = allUsers.find(u => u.id === gift.fromUserId);
        if (fromUser) {
            showPushNotification(fromUser.displayName, `Отправил(а) вам подарок: ${gift.giftName}`);
        }
    }
}

// Закрытие модальных окон при клике вне их
document.addEventListener('click', function(e) {
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
});

// Закрытие модального окна профиля пользователя
const closeUserProfile = document.getElementById('closeUserProfile');
if (closeUserProfile) {
    closeUserProfile.addEventListener('click', function() {
        const userProfileModal = document.getElementById('userProfileModal');
        if (userProfileModal) {
            userProfileModal.style.display = 'none';
        }
    });
}

// Инициализация приложения при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});
