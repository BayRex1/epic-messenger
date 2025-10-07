// В файле main.html замените весь JavaScript код на этот:

// Проверка авторизации при загрузке
async function checkAuth() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = '/login.html';
            return false;
        }

        const response = await fetch('/api/check-auth', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (!data.authenticated) {
            console.log('❌ Пользователь не авторизован, перенаправление...');
            localStorage.removeItem('authToken');
            window.location.href = '/login.html';
            return false;
        }
        
        console.log('✅ Пользователь авторизован');
        return true;
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
        return false;
    }
}

// Обновленная функция initializeApp
async function initializeApp() {
    try {
        // Сначала проверяем авторизацию
        const isAuthenticated = await checkAuth();
        if (!isAuthenticated) {
            return;
        }
        
        // Затем загружаем данные пользователя
        await loadUserData();
        
        // Инициализируем интерфейс
        initializeUI();
        
        // Загружаем начальные данные
        await loadInitialData();
        
        // Запускаем периодическое обновление
        startPeriodicUpdates();
        
        // Инициализируем Socket.IO
        initializeSocketIO();
    } catch (error) {
        console.error('Ошибка инициализации приложения:', error);
        showNotification('Ошибка загрузки приложения', 'error');
    }
}

// Глобальные переменные
let currentUser = null;
let currentChat = null;
let chats = [];
let posts = [];
let gifts = [];
let allUsers = [];
let promoCodes = [];
let socket = null;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// Универсальная функция для авторизованных запросов
async function makeAuthenticatedRequest(url, options = {}) {
    const token = localStorage.getItem('authToken');
    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        }
    };
    
    // Убираем дублирование Content-Type если передается FormData
    if (options.body instanceof FormData) {
        delete defaultOptions.headers['Content-Type'];
    }
    
    const mergedOptions = { ...defaultOptions, ...options };
    return fetch(url, mergedOptions);
}

// Загрузка данных пользователя
async function loadUserData() {
    try {
        const response = await makeAuthenticatedRequest('/api/current-user');
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            updateUserInterface();
        } else {
            throw new Error('Failed to load user data');
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        showNotification('Ошибка загрузки данных пользователя', 'error');
    }
}

function updateUserInterface() {
    // Обновляем аватар и имя в сайдбаре
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const userUsername = document.getElementById('userUsername');

    if (currentUser.avatar) {
        userAvatar.innerHTML = `<img src="${currentUser.avatar}" alt="Avatar">`;
    } else {
        const initials = currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'U';
        userAvatar.textContent = initials;
    }

    userName.innerHTML = currentUser.displayName || 'Пользователь';
    if (currentUser.verified) {
        userName.innerHTML += `
            <span class="verified-badge">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="#00b4b4" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
            </span>
        `;
    }
    if (currentUser.isDeveloper) {
        userName.innerHTML += `
            <span class="developer-badge">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="#FFD700" d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/>
                </svg>
            </span>
        `;
    }

    userUsername.textContent = `@${currentUser.username}`;

    // Показываем/скрываем админ панель
    if (currentUser.isDeveloper) {
        document.getElementById('adminPanelBtn').style.display = 'flex';
    }
}

function initializeSocketIO() {
    socket = io({
        auth: {
            token: localStorage.getItem('authToken')
        }
    });
    
    socket.on('connect', () => {
        console.log('🔌 Подключен к серверу');
        socket.emit('user_online', currentUser.id);
    });

    socket.on('new_message', (message) => {
        if (currentChat && (message.userId === currentChat.id || message.toUserId === currentChat.id)) {
            // Добавляем сообщение в текущий чат
            addMessageToChat(message);
        }
        
        // Показываем уведомление
        if (message.userId !== currentUser.id) {
            showPushNotification(message);
        }
    });

    socket.on('user_status_changed', (data) => {
        // Обновляем статус пользователя в списке чатов
        updateUserStatus(data.userId, data.status, data.lastSeen);
    });

    socket.on('user_typing', (data) => {
        showTypingIndicator(data.userId, data.isTyping);
    });

    socket.on('connect_error', (error) => {
        console.error('Ошибка подключения Socket.IO:', error);
    });
}

function initializeUI() {
    // Инициализация переключения разделов
    initializeSectionSwitching();

    // Инициализация чатов
    initializeChats();

    // Инициализация обработчиков событий
    initializeEventHandlers();
    
    // Инициализация создания постов
    initializePostCreation();
}

function initializeSectionSwitching() {
    const menuItems = document.querySelectorAll('.menu-item[data-section]');
    const contentAreas = document.querySelectorAll('.content-area');

    menuItems.forEach(item => {
        item.addEventListener('click', function() {
            const targetSection = this.getAttribute('data-section');

            // Убираем активный класс у всех пунктов меню и разделов
            menuItems.forEach(i => i.classList.remove('active'));
            contentAreas.forEach(area => area.classList.remove('active'));

            // Добавляем активный класс текущему пункту меню и разделу
            this.classList.add('active');
            document.getElementById(`${targetSection}-section`).classList.add('active');

            // Загружаем данные для раздела при необходимости
            loadSectionData(targetSection);
        });
    });
}

function initializeChats() {
    // Инициализация поиска чатов
    const chatSearch = document.getElementById('chatSearch');
    if (chatSearch) {
        chatSearch.addEventListener('input', function(e) {
            filterChats(e.target.value);
        });
    }

    // Инициализация отправки сообщений
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendMessageBtn');

    if (messageInput && sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        // Индикатор набора сообщения
        let typingTimeout;
        messageInput.addEventListener('input', function() {
            if (this.value.trim() && currentChat && socket) {
                socket.emit('user_typing', {
                    userId: currentUser.id,
                    toUserId: currentChat.id,
                    isTyping: true
                });
                
                // Сбрасываем таймер
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    socket.emit('user_typing', {
                        userId: currentUser.id,
                        toUserId: currentChat.id,
                        isTyping: false
                    });
                }, 1000);
            }
        });
    }
}

function initializePostCreation() {
    // Инициализация будет выполнена при рендеринге постов
}

function initializeEventHandlers() {
    // Выход из аккаунта
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Обработчик для сайдбара - переключение расширения
    document.getElementById('profileSection').addEventListener('click', function() {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('expanded');
    });

    // Инициализация переключателей тем
    initializeThemeSwitcher();
}

function initializeThemeSwitcher() {
    const themeOptions = document.querySelectorAll('.theme-option');
    const currentTheme = localStorage.getItem('theme') || 'dark';

    // Устанавливаем текущую тему
    document.body.className = `theme-${currentTheme}`;

    themeOptions.forEach(option => {
        if (option.getAttribute('data-theme') === currentTheme) {
            option.classList.add('active');
        }

        option.addEventListener('click', function() {
            const theme = this.getAttribute('data-theme');
            
            // Убираем активный класс у всех опций
            themeOptions.forEach(opt => opt.classList.remove('active'));
            // Добавляем активный класс текущей опции
            this.classList.add('active');
            
            // Применяем тему
            document.body.className = `theme-${theme}`;
            localStorage.setItem('theme', theme);
        });
    });
}

async function loadInitialData() {
    try {
        await Promise.all([
            loadChats(),
            loadPosts(),
            loadGifts(),
            loadAllUsers(),
            loadPromoCodes()
        ]);
    } catch (error) {
        console.error('Error loading initial data:', error);
        showNotification('Ошибка загрузки данных', 'error');
    }
}

async function loadChats() {
    try {
        const response = await makeAuthenticatedRequest('/api/users');
        const data = await response.json();

        if (data.success) {
            chats = data.users.map(user => ({
                id: user.id,
                name: user.displayName,
                username: user.username,
                avatar: user.avatar,
                status: user.status,
                lastSeen: user.lastSeen,
                verified: user.verified,
                isDeveloper: user.isDeveloper,
                lastMessage: 'Начните общение',
                unreadCount: 0
            }));
            renderChatsList();
        }
    } catch (error) {
        console.error('Error loading chats:', error);
    }
}

async function loadPosts() {
    try {
        const response = await makeAuthenticatedRequest('/api/posts');
        const data = await response.json();

        if (data.success) {
            posts = data.posts;
            renderPosts();
        }
    } catch (error) {
        console.error('Error loading posts:', error);
    }
}

async function loadGifts() {
    try {
        const response = await makeAuthenticatedRequest('/api/gifts');
        const data = await response.json();

        if (data.success) {
            gifts = data.gifts;
            renderGifts();
        }
    } catch (error) {
        console.error('Error loading gifts:', error);
    }
}

async function loadAllUsers() {
    try {
        const response = await makeAuthenticatedRequest('/api/users');
        const data = await response.json();

        if (data.success) {
            allUsers = data.users;
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function loadPromoCodes() {
    try {
        const response = await makeAuthenticatedRequest('/api/promo-codes');
        const data = await response.json();

        if (data.success) {
            promoCodes = data.promoCodes;
        }
    } catch (error) {
        console.error('Error loading promo codes:', error);
    }
}

function renderChatsList() {
    const chatsList = document.getElementById('chatsList');
    if (!chatsList) return;

    chatsList.innerHTML = '';

    chats.forEach(chat => {
        const chatElement = document.createElement('div');
        chatElement.className = 'chat-item';
        chatElement.setAttribute('data-user-id', chat.id);
        chatElement.innerHTML = `
            <div class="chat-avatar">
                ${chat.avatar ? `<img src="${chat.avatar}" alt="${chat.name}">` : chat.name.charAt(0).toUpperCase()}
            </div>
            <div class="chat-info">
                <h4 class="user-name-clickable" data-user-id="${chat.id}" style="cursor: pointer;">
                    ${chat.name}
                    ${chat.verified ? '<span class="verified-badge">✓</span>' : ''}
                    ${chat.isDeveloper ? '<span class="developer-badge">⭐</span>' : ''}
                    <span class="${chat.status === 'online' ? 'online-status' : 'offline-status'}"></span>
                </h4>
                <span>${chat.lastMessage}</span>
                ${chat.status === 'offline' && chat.lastSeen ? `
                    <div style="font-size: 10px; color: var(--text-secondary); margin-top: 2px;">
                        Был(а) в сети: ${formatLastSeen(chat.lastSeen)}
                    </div>
                ` : ''}
            </div>
            ${chat.unreadCount > 0 ? `<div class="unread-badge">${chat.unreadCount}</div>` : ''}
        `;

        chatElement.addEventListener('click', () => openChat(chat));
        
        // Добавляем обработчик для клика по имени пользователя
        const userNameElement = chatElement.querySelector('.user-name-clickable');
        userNameElement.addEventListener('click', (e) => {
            e.stopPropagation();
            showUserProfile(chat.id);
        });

        chatsList.appendChild(chatElement);
    });
}

function renderPosts() {
    const postsList = document.getElementById('postsList');
    if (!postsList) return;

    postsList.innerHTML = '';

    // Добавляем форму создания поста
    const postForm = document.createElement('div');
    postForm.className = 'post';
    postForm.innerHTML = `
        <div class="post-header">
            <div class="post-user">
                <div class="post-avatar">
                    ${currentUser.avatar ? `<img src="${currentUser.avatar}" alt="${currentUser.displayName}">` : currentUser.displayName.charAt(0).toUpperCase()}
                </div>
                <div class="post-user-info">
                    <h4>${currentUser.displayName}</h4>
                </div>
            </div>
        </div>
        <div class="post-content">
            <textarea id="postText" class="post-textarea" placeholder="Что у вас нового?" rows="3"></textarea>
            <div class="file-upload-area" id="postImageUpload">
                <input type="file" id="postImage" accept="image/*" style="display: none;">
                <div>📎 Добавить изображение</div>
            </div>
            <div id="postImagePreview" class="file-preview"></div>
        </div>
        <div class="post-actions">
            <button class="btn" id="createPostBtn" style="width: 100%;">Опубликовать</button>
        </div>
    `;
    postsList.appendChild(postForm);

    // Инициализация загрузки изображения для поста
    const postImageUpload = document.getElementById('postImageUpload');
    const postImageInput = document.getElementById('postImage');
    const postImagePreview = document.getElementById('postImagePreview');

    postImageUpload.addEventListener('click', () => postImageInput.click());
    postImageInput.addEventListener('change', handlePostImageUpload);

    function handlePostImageUpload(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                postImagePreview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 200px; border-radius: 8px;">`;
            };
            reader.readAsDataURL(file);
        }
    }

    // Инициализация создания поста
    document.getElementById('createPostBtn').addEventListener('click', createPost);

    // Отображаем посты
    posts.forEach(post => {
        const postElement = document.createElement('div');
        postElement.className = 'post';
        postElement.innerHTML = `
            <div class="post-header">
                <div class="post-user">
                    <div class="post-avatar">
                        ${post.userAvatar ? `<img src="${post.userAvatar}" alt="${post.userName}">` : post.userName.charAt(0).toUpperCase()}
                    </div>
                    <div class="post-user-info">
                        <h4 class="user-name-clickable" data-user-id="${post.userId}" style="cursor: pointer;">
                            ${post.userName}
                            ${post.userVerified ? '<span class="verified-badge">✓</span>' : ''}
                            ${post.userDeveloper ? '<span class="developer-badge">⭐</span>' : ''}
                        </h4>
                        <div class="post-time">${formatTime(post.createdAt)}</div>
                    </div>
                </div>
            </div>
            <div class="post-content">
                <div class="post-text">${post.text}</div>
                ${post.image ? `
                    <div class="post-media">
                        <img src="${post.image}" alt="Post image" onclick="showFullscreenImage('${post.image}')">
                    </div>
                ` : ''}
            </div>
            <div class="post-actions">
                <button class="post-action ${post.likes.includes(currentUser.id) ? 'liked' : ''}" onclick="likePost('${post.id}')">
                    <span>❤️</span>
                    <span>${post.likes.length}</span>
                </button>
                <button class="post-action" onclick="commentOnPost('${post.id}')">
                    <span>💬</span>
                    <span>${post.comments.length}</span>
                </button>
                <div class="post-views">
                    <span>👁️</span>
                    <span>${post.views}</span>
                </div>
                <button class="post-share" onclick="sharePost('${post.id}')">
                    <span>↗️</span>
                    <span>Поделиться</span>
                </button>
            </div>
        `;

        // Добавляем обработчик для клика по имени пользователя
        const userNameElement = postElement.querySelector('.user-name-clickable');
        userNameElement.addEventListener('click', () => {
            showUserProfile(post.userId);
        });

        postsList.appendChild(postElement);
    });
}

// Функция для показа профиля пользователя
async function showUserProfile(userId) {
    try {
        const response = await makeAuthenticatedRequest(`/api/users/${userId}`);
        const data = await response.json();

        if (data.success) {
            const user = data.user;
            const modalContent = `
                <div class="modal-header">
                    <h3>Профиль пользователя</h3>
                    <span class="close" onclick="hideModal()">&times;</span>
                </div>
                <div class="user-profile">
                    <div class="profile-header-large">
                        <div class="avatar-large">
                            ${user.avatar ? `<img src="${user.avatar}" alt="${user.displayName}">` : user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div class="profile-info-large">
                            <h2>
                                ${user.displayName}
                                ${user.verified ? `
                                    <span class="verified-badge">
                                        <svg viewBox="0 0 24 24" width="20" height="20">
                                            <path fill="#00b4b4" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                        </svg>
                                    </span>
                                ` : ''}
                                ${user.isDeveloper ? `
                                    <span class="developer-badge">
                                        <svg viewBox="0 0 24 24" width="20" height="20">
                                            <path fill="#FFD700" d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/>
                                        </svg>
                                    </span>
                                ` : ''}
                            </h2>
                            <p>@${user.username}</p>
                            <p>${user.description || 'Пользователь еще не добавил описание...'}</p>
                            <div style="margin-top: 10px;">
                                <span class="${user.status === 'online' ? 'online-status' : 'offline-status'}"></span>
                                <span style="font-size: 12px; color: var(--text-secondary); margin-left: 5px;">
                                    ${user.status === 'online' ? 'В сети' : `Был(а) в сети: ${formatLastSeen(user.lastSeen)}`}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="profile-stats">
                        <div class="stat-item">
                            <div class="stat-value">${user.coins || 0}</div>
                            <div class="stat-label">E-COIN</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${formatTime(user.createdAt)}</div>
                            <div class="stat-label">С нами с</div>
                        </div>
                    </div>
                    <div class="profile-actions">
                        <button class="btn-large" onclick="openChatFromProfile('${user.id}')">Написать сообщение</button>
                    </div>
                </div>
            `;
            showModal(modalContent);
        } else {
            showNotification('Ошибка загрузки профиля', 'error');
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
        showNotification('Ошибка загрузки профиля', 'error');
    }
}

// Функция для открытия чата из профиля
function openChatFromProfile(userId) {
    const user = chats.find(chat => chat.id === userId);
    if (user) {
        openChat(user);
        hideModal();
        switchToSection('chat');
    }
}

function renderGifts() {
    renderMyGifts();
    renderGiftsShop();
}

function renderMyGifts() {
    const myGiftsGrid = document.getElementById('myGiftsGrid');
    if (!myGiftsGrid) return;

    myGiftsGrid.innerHTML = '';

    const userGifts = currentUser.gifts || [];
    
    if (userGifts.length === 0) {
        myGiftsGrid.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">У вас пока нет подарков</div>';
        return;
    }

    userGifts.forEach(gift => {
        const giftElement = document.createElement('div');
        giftElement.className = 'my-gift-item';
        giftElement.innerHTML = `
            <div class="my-gift-preview">
                ${getGiftPreview(gift.giftType)}
            </div>
            <div class="my-gift-name">${gift.giftName}</div>
            <div class="my-gift-from">Получен: ${formatTime(gift.purchasedAt)}</div>
        `;

        myGiftsGrid.appendChild(giftElement);
    });
}

function renderGiftsShop() {
    const giftsShop = document.getElementById('giftsShop');
    if (!giftsShop) return;

    giftsShop.innerHTML = '';

    gifts.forEach(gift => {
        const giftElement = document.createElement('div');
        giftElement.className = 'gift-shop-item';
        giftElement.innerHTML = `
            <div class="gift-shop-preview">
                ${gift.preview || '🎁'}
            </div>
            <div class="gift-shop-name">${gift.name}</div>
            <div class="gift-shop-price">${gift.price} E-COIN</div>
            <button class="btn" onclick="buyGift('${gift.id}')" 
                    ${currentUser.coins < gift.price ? 'disabled style="opacity: 0.5;"' : ''}>
                ${currentUser.coins < gift.price ? 'Недостаточно E-COIN' : 'Купить'}
            </button>
        `;

        giftsShop.appendChild(giftElement);
    });
}

function getGiftPreview(type) {
    const previews = {
        'image': '🖼️',
        'gif': '🎆',
        'crown': '👑',
        'heart': '❤️',
        'star': '⭐'
    };
    return previews[type] || '🎁';
}

function filterChats(query) {
    const chatItems = document.querySelectorAll('.chat-item');
    
    chatItems.forEach(item => {
        const chatName = item.querySelector('h4').textContent.toLowerCase();
        if (chatName.includes(query.toLowerCase())) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

async function openChat(chat) {
    currentChat = chat;
    
    // Обновляем заголовок чата
    const chatInfo = document.getElementById('currentChatInfo');
    chatInfo.innerHTML = `
        <div style="display: flex; align-items: center;">
            <div class="chat-avatar" style="margin-right: 12px;">
                ${chat.avatar ? `<img src="${chat.avatar}" alt="${chat.name}">` : chat.name.charAt(0).toUpperCase()}
            </div>
            <div>
                <h4 class="user-name-clickable" data-user-id="${chat.id}" style="cursor: pointer; margin: 0;">
                    ${chat.name}
                    <span class="${chat.status === 'online' ? 'online-status' : 'offline-status'}"></span>
                </h4>
                <div style="font-size: 12px; color: var(--text-secondary);">
                    ${chat.status === 'online' ? 'В сети' : `Был(а) в сети: ${formatLastSeen(chat.lastSeen)}`}
                </div>
            </div>
        </div>
    `;

    // Добавляем обработчик для клика по имени пользователя в заголовке чата
    const userNameElement = chatInfo.querySelector('.user-name-clickable');
    userNameElement.addEventListener('click', () => {
        showUserProfile(chat.id);
    });

    // Загружаем сообщения
    await loadChatMessages(chat.id);
}

async function loadChatMessages(chatId) {
    try {
        const response = await makeAuthenticatedRequest(`/api/messages?userId=${currentUser.id}&toUserId=${chatId}`);
        const data = await response.json();

        if (data.success) {
            renderMessages(data.messages);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        showNotification('Ошибка загрузки сообщений', 'error');
    }
}

function renderMessages(messages) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    chatMessages.innerHTML = '';

    messages.forEach(message => {
        addMessageToChat(message);
    });

    // Прокручиваем вниз
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addMessageToChat(message) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.senderId === currentUser.id ? 'outgoing' : 'incoming'}`;
    
    let messageContent = '';
    
    if (message.type === 'text') {
        messageContent = `
            <div class="message-text">${message.text}</div>
        `;
    } else if (message.type === 'file') {
        messageContent = `
            <div class="message-file">
                <div class="message-file-content">
                    ${message.fileType && message.fileType.startsWith('image/') ? 
                        `<img src="${message.fileData}" alt="File" onclick="showFullscreenImage('${message.fileData}')">` :
                        message.fileType && message.fileType.startsWith('video/') ?
                        `<video controls><source src="${message.fileData}" type="${message.fileType}"></video>` :
                        `<div class="message-file-info">
                            <div>📎 ${message.fileName}</div>
                            <div>${formatFileSize(message.fileSize)}</div>
                            <button class="btn" onclick="downloadFile('${message.fileData}', '${message.fileName}')">Скачать</button>
                        </div>`
                    }
                </div>
            </div>
        `;
    } else if (message.type === 'gift') {
        messageContent = `
            <div class="message-gift">
                <div class="gift-preview">${getGiftPreview(message.giftType)}</div>
                <div class="gift-info">
                    <div class="gift-name">${message.giftName}</div>
                    <div class="gift-price">${message.giftPrice} E-COIN</div>
                </div>
            </div>
        `;
    }

    messageElement.innerHTML = `
        ${messageContent}
        <div class="message-time">${formatTime(message.timestamp)}</div>
    `;

    chatMessages.appendChild(messageElement);
    
    // Прокручиваем вниз
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const text = messageInput.value.trim();

    if (!text || !currentChat) return;

    try {
        const response = await makeAuthenticatedRequest('/api/messages/send', {
            method: 'POST',
            body: JSON.stringify({
                userId: currentUser.id,
                toUserId: currentChat.id,
                text: text,
                type: 'text'
            })
        });

        const data = await response.json();

        if (data.success) {
            messageInput.value = '';
            
            // Сбрасываем индикатор набора
            if (socket) {
                setTimeout(() => {
                    socket.emit('user_typing', {
                        userId: currentUser.id,
                        toUserId: currentChat.id,
                        isTyping: false
                    });
                }, 1000);
            }
            
            // Добавляем сообщение в чат
            addMessageToChat(data.message);
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Ошибка отправки сообщения', 'error');
    }
}

async function createPost() {
    const postText = document.getElementById('postText');
    const postImageInput = document.getElementById('postImage');
    const text = postText.value.trim();

    if (!text) {
        showNotification('Введите текст поста', 'error');
        return;
    }

    let imageBase64 = null;
    if (postImageInput.files[0]) {
        const file = postImageInput.files[0];
        imageBase64 = await fileToBase64(file);
    }

    try {
        const response = await makeAuthenticatedRequest('/api/posts', {
            method: 'POST',
            body: JSON.stringify({
                text: text,
                image: imageBase64
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Пост опубликован!', 'success');
            postText.value = '';
            document.getElementById('postImagePreview').innerHTML = '';
            postImageInput.value = '';
            
            // Перезагружаем посты
            await loadPosts();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error creating post:', error);
        showNotification('Ошибка создания поста', 'error');
    }
}

// Функция для конвертации файла в base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

async function likePost(postId) {
    try {
        const response = await makeAuthenticatedRequest(`/api/posts/${postId}/like`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            // Перезагружаем посты для обновления счетчика
            await loadPosts();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error liking post:', error);
        showNotification('Ошибка при установке лайка', 'error');
    }
}

async function buyGift(giftId) {
    try {
        const response = await makeAuthenticatedRequest(`/api/gifts/${giftId}/buy`, {
            method: 'POST',
            body: JSON.stringify({
                toUserId: currentChat ? currentChat.id : null
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification(`Подарок "${data.giftName}" куплен!`, 'success');
            
            // Обновляем баланс и подарки
            await loadUserData();
            await loadGifts();
            
            if (currentChat) {
                // Обновляем сообщения в чате
                await loadChatMessages(currentChat.id);
            }
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error buying gift:', error);
        showNotification('Ошибка покупки подарка', 'error');
    }
}

function loadSectionData(section) {
    switch (section) {
        case 'admin':
            if (currentUser.isDeveloper) {
                loadAdminData();
            }
            break;
        case 'profile':
            loadProfileData();
            break;
        case 'ecoins':
            loadEcoinsData();
            break;
    }
}

async function loadAdminData() {
    try {
        // Загружаем статистику
        const statsResponse = await makeAuthenticatedRequest('/api/admin/stats');
        if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            if (statsData.success) {
                document.getElementById('totalUsers').textContent = statsData.stats.totalUsers;
                document.getElementById('totalMessages').textContent = statsData.stats.totalMessages;
                document.getElementById('totalPosts').textContent = statsData.stats.totalPosts;
            }
        }

        // Рендерим пользователей
        renderAdminUsers(allUsers);

        // Рендерим промокоды
        renderAdminPromoCodes();

    } catch (error) {
        console.error('Error loading admin data:', error);
    }
}

function renderAdminUsers(users) {
    const usersList = document.getElementById('usersList');
    if (!usersList) return;

    usersList.innerHTML = '';

    users.forEach(user => {
        const userElement = document.createElement('div');
        userElement.className = 'admin-user-item';
        userElement.innerHTML = `
            <div style="flex: 1;">
                <div style="font-weight: bold;">${user.displayName} (@${user.username})</div>
                <div style="font-size: 12px; color: var(--text-secondary);">
                    E-COIN: ${user.coins || 0} • Статус: ${user.status}
                    ${user.verified ? ' • ✓ Верифицирован' : ''}
                    ${user.isDeveloper ? ' • ⭐ Разработчик' : ''}
                </div>
            </div>
            <div class="user-actions">
                <button class="admin-btn" onclick="editUser('${user.id}')">Редактировать</button>
                <button class="admin-btn delete" onclick="deleteUser('${user.id}')">Удалить</button>
            </div>
        `;

        usersList.appendChild(userElement);
    });
}

function renderAdminPromoCodes() {
    const promoCodesList = document.getElementById('adminPromoCodesList');
    if (!promoCodesList) return;

    promoCodesList.innerHTML = '';

    promoCodes.forEach(promo => {
        const promoElement = document.createElement('div');
        promoElement.className = 'promo-item';
        promoElement.innerHTML = `
            <div>
                <div class="promo-code">${promo.code}</div>
                <div class="promo-details">
                    ${promo.coins} E-COIN • Использовано: ${promo.used_count || 0}${promo.max_uses > 0 ? `/${promo.max_uses}` : ' (∞)'}
                </div>
            </div>
            <button class="admin-btn delete" onclick="deletePromoCode('${promo.id}')">Удалить</button>
        `;

        promoCodesList.appendChild(promoElement);
    });
}

function loadProfileData() {
    // Обновляем данные профиля
    const profileName = document.getElementById('profileName');
    const profileUsername = document.getElementById('profileUsername');
    const profileBio = document.getElementById('profileBio');
    const profileAvatar = document.getElementById('profileAvatar');

    profileName.innerHTML = currentUser.displayName || 'Пользователь';
    if (currentUser.verified) {
        profileName.innerHTML += `
            <span class="verified-badge">
                <svg viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#00b4b4" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
            </span>
        `;
    }
    if (currentUser.isDeveloper) {
        profileName.innerHTML += `
            <span class="developer-badge">
                <svg viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#FFD700" d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/>
                </svg>
            </span>
        `;
    }

    profileUsername.textContent = `@${currentUser.username}`;
    profileBio.textContent = currentUser.description || 'Пользователь еще не добавил описание...';

    if (currentUser.avatar) {
        profileAvatar.innerHTML = `<img src="${currentUser.avatar}" alt="Avatar">`;
    } else {
        const initials = currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'U';
        profileAvatar.textContent = initials;
    }

    // Обновляем статистику профиля
    document.getElementById('profilePostsCount').textContent = posts.filter(p => p.userId === currentUser.id).length;
    document.getElementById('profileFriendsCount').textContent = chats.length;
    document.getElementById('profileGiftsCount').textContent = (currentUser.gifts || []).length;

    // Загружаем посты пользователя
    loadUserPosts();
}

async function loadUserPosts() {
    const userPosts = posts.filter(post => post.userId === currentUser.id);
    renderUserPosts(userPosts);
}

function renderUserPosts(posts) {
    const postsList = document.getElementById('profilePostsList');
    if (!postsList) return;

    postsList.innerHTML = '';

    posts.forEach(post => {
        const postElement = document.createElement('div');
        postElement.className = 'user-post';
        postElement.innerHTML = `
            <div class="user-post-header">
                <div class="user-post-avatar">
                    ${currentUser.avatar ? `<img src="${currentUser.avatar}" alt="${currentUser.displayName}">` : currentUser.displayName.charAt(0).toUpperCase()}
                </div>
                <div class="user-post-info">
                    <div class="user-post-name">${currentUser.displayName}</div>
                    <div class="user-post-time">${formatTime(post.createdAt)}</div>
                </div>
            </div>
            <div class="user-post-content">
                <div class="user-post-text">${post.text}</div>
                ${post.image ? `
                    <div class="user-post-media">
                        <img src="${post.image}" alt="Post image" onclick="showFullscreenImage('${post.image}')">
                    </div>
                ` : ''}
            </div>
            <div class="user-post-actions">
                <button class="user-post-action ${post.likes.includes(currentUser.id) ? 'liked' : ''}" onclick="likePost('${post.id}')">
                    <span>❤️</span>
                    <span>${post.likes.length}</span>
                </button>
                <button class="user-post-action" onclick="commentOnPost('${post.id}')">
                    <span>💬</span>
                    <span>${post.comments.length}</span>
                </button>
            </div>
        `;

        postsList.appendChild(postElement);
    });
}

function loadEcoinsData() {
    // Обновляем баланс
    document.getElementById('ecoinBalance').textContent = currentUser.coins || 0;
    
    // Загружаем историю транзакций
    loadTransactionHistory();
}

async function loadTransactionHistory() {
    try {
        // Временная заглушка для истории транзакций
        const transactions = [
            {
                description: 'Регистрация бонус',
                date: currentUser.createdAt,
                amount: 1000
            }
        ];
        renderTransactions(transactions);
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

function renderTransactions(transactions) {
    const transactionsList = document.getElementById('transactionsList');
    if (!transactionsList) return;

    transactionsList.innerHTML = '';

    transactions.forEach(transaction => {
        const transactionElement = document.createElement('div');
        transactionElement.className = 'transaction-item';
        transactionElement.innerHTML = `
            <div class="transaction-info">
                <div class="transaction-title">${transaction.description}</div>
                <div class="transaction-date">${formatTime(transaction.date)}</div>
            </div>
            <div class="transaction-amount ${transaction.amount >= 0 ? 'positive' : 'negative'}">
                ${transaction.amount >= 0 ? '+' : ''}${transaction.amount} E-COIN
            </div>
        `;

        transactionsList.appendChild(transactionElement);
    });
}

function switchToSection(section) {
    const menuItem = document.querySelector(`[data-section="${section}"]`);
    if (menuItem) {
        menuItem.click();
    }
}

function showNotification(message, type = 'info') {
    const notificationsContainer = document.getElementById('notificationsContainer');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    notificationsContainer.appendChild(notification);

    // Автоматическое удаление через 5 секунд
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

function showPushNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'push-notification';
    notification.innerHTML = `
        <div class="push-avatar">
            ${message.displayName ? message.displayName.charAt(0).toUpperCase() : 'U'}
        </div>
        <div class="push-content">
            <div class="push-title">${message.displayName}</div>
            <div class="push-message">${message.text}</div>
        </div>
        <button class="push-close" onclick="this.parentElement.remove()">×</button>
    `;

    document.body.appendChild(notification);

    // Автоматическое удаление через 5 секунд
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

function showTypingIndicator(userId, isTyping) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    let typingIndicator = document.getElementById('typing-indicator');
    
    if (isTyping) {
        if (!typingIndicator) {
            typingIndicator = document.createElement('div');
            typingIndicator.id = 'typing-indicator';
            typingIndicator.className = 'typing-indicator';
            typingIndicator.innerHTML = `
                <div class="typing-dots">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
                <span>Печатает...</span>
            `;
            chatMessages.appendChild(typingIndicator);
        }
    } else {
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }
}

function updateUserStatus(userId, status, lastSeen) {
    const chatItem = document.querySelector(`.chat-item[data-user-id="${userId}"]`);
    if (chatItem) {
        const statusElement = chatItem.querySelector('.online-status, .offline-status');
        const lastSeenElement = chatItem.querySelector('.last-seen');
        
        if (statusElement) {
            statusElement.className = status === 'online' ? 'online-status' : 'offline-status';
        }
        
        // Обновляем информацию о последнем посещении
        if (lastSeenElement && status === 'offline') {
            lastSeenElement.textContent = `Был(а) в сети: ${formatLastSeen(lastSeen)}`;
        }
    }
}

function logout() {
    const token = localStorage.getItem('authToken');
    
    fetch('/api/logout', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    }).finally(() => {
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
    });
}

function startPeriodicUpdates() {
    // Обновляем чаты каждые 30 секунд
    setInterval(async () => {
        if (document.getElementById('chat-section').classList.contains('active')) {
            await loadChats();
            if (currentChat) {
                await loadChatMessages(currentChat.id);
            }
        }
    }, 30000);

    // Обновляем посты каждую минуту
    setInterval(async () => {
        if (document.getElementById('posts-section').classList.contains('active')) {
            await loadPosts();
        }
    }, 60000);
}

// Вспомогательные функции
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) { // Меньше минуты
        return 'только что';
    } else if (diff < 3600000) { // Меньше часа
        return `${Math.floor(diff / 60000)} мин назад`;
    } else if (diff < 86400000) { // Меньше суток
        return `${Math.floor(diff / 3600000)} ч назад`;
    } else {
        return date.toLocaleDateString();
    }
}

function formatLastSeen(timestamp) {
    if (!timestamp) return 'неизвестно';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) { // Меньше минуты
        return 'только что';
    } else if (diff < 3600000) { // Меньше часа
        return `${Math.floor(diff / 60000)} мин назад`;
    } else if (diff < 86400000) { // Меньше суток
        return `${Math.floor(diff / 3600000)} ч назад`;
    } else if (diff < 604800000) { // Меньше недели
        return `${Math.floor(diff / 86400000)} дн назад`;
    } else {
        return date.toLocaleDateString();
    }
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showFullscreenImage(src) {
    const fullscreen = document.createElement('div');
    fullscreen.className = 'media-fullscreen';
    fullscreen.innerHTML = `
        <img src="${src}" class="media-fullscreen-content" alt="Fullscreen image">
        <button class="media-fullscreen-close" onclick="this.parentElement.remove()">×</button>
    `;
    document.body.appendChild(fullscreen);
}

function downloadFile(dataUrl, fileName) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    link.click();
}

// Дополнительные функции
function showAddEcoinsModal() {
    showNotification('Функция пополнения баланса в разработке', 'info');
}

function showPromoModal() {
    const modalContent = `
        <div class="modal-header">
            <h3>Активация промокода</h3>
            <span class="close" onclick="hideModal()">&times;</span>
        </div>
        <div class="promo-input-group">
            <input type="text" class="promo-input" id="activatePromoCode" placeholder="Введите промокод">
            <button class="promo-btn" onclick="activatePromoCode()">Активировать</button>
        </div>
        <div id="promoResult"></div>
        <div class="modal-buttons">
            <button class="modal-btn secondary" onclick="hideModal()">Закрыть</button>
        </div>
    `;
    showModal(modalContent);
}

async function activatePromoCode() {
    const codeInput = document.getElementById('activatePromoCode');
    const code = codeInput.value.trim();
    const resultDiv = document.getElementById('promoResult');

    if (!code) {
        resultDiv.innerHTML = '<div class="promo-result error">Введите промокод</div>';
        return;
    }

    try {
        const response = await makeAuthenticatedRequest('/api/promo-codes/activate', {
            method: 'POST',
            body: JSON.stringify({ code })
        });

        const data = await response.json();

        if (data.success) {
            resultDiv.innerHTML = `<div class="promo-result success">${data.message}</div>`;
            codeInput.value = '';
            
            // Обновляем баланс
            await loadUserData();
            await loadEcoinsData();
        } else {
            resultDiv.innerHTML = `<div class="promo-result error">${data.message}</div>`;
        }
    } catch (error) {
        console.error('Error activating promo code:', error);
        resultDiv.innerHTML = '<div class="promo-result error">Ошибка активации промокода</div>';
    }
}

function showEditProfileModal() {
    const modalContent = `
        <div class="modal-header">
            <h3>Редактирование профиля</h3>
            <span class="close" onclick="hideModal()">&times;</span>
        </div>
        <input type="text" class="modal-input" id="editDisplayName" placeholder="Имя для отображения" value="${currentUser.displayName || ''}">
        <textarea class="modal-input" id="editDescription" placeholder="О себе" style="height: 100px; resize: vertical;">${currentUser.description || ''}</textarea>
        <div class="file-upload-area" id="avatarUploadArea">
            <input type="file" id="editAvatar" accept="image/*" style="display: none;">
            <div>📎 Загрузить новый аватар</div>
        </div>
        <div id="avatarPreview" class="file-preview"></div>
        <div class="modal-buttons">
            <button class="modal-btn secondary" onclick="hideModal()">Отмена</button>
            <button class="modal-btn primary" onclick="updateProfile()">Сохранить</button>
        </div>
    `;
    showModal(modalContent);

    // Инициализация загрузки аватара
    const avatarUpload = document.getElementById('avatarUploadArea');
    const avatarInput = document.getElementById('editAvatar');
    const avatarPreview = document.getElementById('avatarPreview');

    avatarUpload.addEventListener('click', () => avatarInput.click());
    avatarInput.addEventListener('change', handleAvatarUpload);

    function handleAvatarUpload(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                avatarPreview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 100px; border-radius: 8px;">`;
            };
            reader.readAsDataURL(file);
        }
    }
}

async function updateProfile() {
    const displayName = document.getElementById('editDisplayName').value.trim();
    const description = document.getElementById('editDescription').value.trim();
    const avatarFile = document.getElementById('editAvatar').files[0];

    if (!displayName) {
        showNotification('Введите имя для отображения', 'error');
        return;
    }

    let avatarBase64 = null;
    if (avatarFile) {
        avatarBase64 = await fileToBase64(avatarFile);
    }

    try {
        const response = await makeAuthenticatedRequest('/api/update-profile', {
            method: 'POST',
            body: JSON.stringify({
                displayName: displayName,
                description: description,
                avatar: avatarBase64
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Профиль обновлен!', 'success');
            hideModal();
            await loadUserData();
            loadProfileData();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        showNotification('Ошибка обновления профиля', 'error');
    }
}

function showChangeAvatarModal() {
    showEditProfileModal();
}

function saveSettings() {
    const pushNotifications = document.getElementById('pushNotifications').checked;
    const soundNotifications = document.getElementById('soundNotifications').checked;
    const emailNotifications = document.getElementById('emailNotifications').checked;
    const showOnlineStatus = document.getElementById('showOnlineStatus').checked;
    const allowFriendRequests = document.getElementById('allowFriendRequests').checked;
    const showActivityStatus = document.getElementById('showActivityStatus').checked;

    const settings = {
        pushNotifications,
        soundNotifications,
        emailNotifications,
        showOnlineStatus,
        allowFriendRequests,
        showActivityStatus
    };

    localStorage.setItem('userSettings', JSON.stringify(settings));
    showNotification('Настройки сохранены!', 'success');
}

function loadSettings() {
    const savedSettings = localStorage.getItem('userSettings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        
        document.getElementById('pushNotifications').checked = settings.pushNotifications;
        document.getElementById('soundNotifications').checked = settings.soundNotifications;
        document.getElementById('emailNotifications').checked = settings.emailNotifications;
        document.getElementById('showOnlineStatus').checked = settings.showOnlineStatus;
        document.getElementById('allowFriendRequests').checked = settings.allowFriendRequests;
        document.getElementById('showActivityStatus').checked = settings.showActivityStatus;
    }
}

function showDeleteAccountModal() {
    if (confirm('Вы уверены, что хотите удалить аккаунт? Это действие нельзя отменить.')) {
        showNotification('Функция удаления аккаунта в разработке', 'info');
    }
}

function editUser(userId) {
    showNotification(`Редактирование пользователя ${userId} в разработке`, 'info');
}

function deleteUser(userId) {
    if (confirm('Вы уверены, что хотите удалить этого пользователя?')) {
        showNotification(`Удаление пользователя ${userId} в разработке`, 'info');
    }
}

function deletePromoCode(promoId) {
    if (confirm('Вы уверены, что хотите удалить этот промокод?')) {
        showNotification(`Удаление промокода ${promoId} в разработке`, 'info');
    }
}

function commentOnPost(postId) {
    showNotification('Функция комментариев в разработке', 'info');
}

function sharePost(postId) {
    showNotification('Функция поделиться в разработке', 'info');
}

function createPromoCode() {
    const code = document.getElementById('promoCode').value.trim();
    const type = document.getElementById('promoType').value;
    const value = document.getElementById('promoValue').value;
    const uses = document.getElementById('promoUses').value;

    if (!code || !value) {
        showNotification('Заполните все поля', 'error');
        return;
    }

    showNotification(`Создание промокода ${code} в разработке`, 'info');
}

// Модальные окна
function showModal(content) {
    const modalOverlay = document.getElementById('modalOverlay');
    const modalContent = document.getElementById('modalContent');
    
    modalContent.innerHTML = content;
    modalOverlay.style.display = 'flex';
}

function hideModal() {
    const modalOverlay = document.getElementById('modalOverlay');
    modalOverlay.style.display = 'none';
}

// Загружаем настройки при инициализации
loadSettings();
