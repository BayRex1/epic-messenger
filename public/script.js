let currentUser = null;
let currentChatUser = null;
let messages = [];
let allUsers = [];
let allPosts = [];
let allGifts = [];
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    initializeEventListeners();
});

// Проверка авторизации
async function checkAuth() {
    try {
        const response = await fetch('/api/check-auth', {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.authenticated) {
            currentUser = data.user;
            showApp();
            initializeApp();
        } else {
            showLogin();
        }
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
        showLogin();
    }
}

// Получение текущего пользователя
async function getCurrentUser() {
    if (currentUser) return currentUser;
    
    try {
        const response = await fetch('/api/current-user', {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            return currentUser;
        }
    } catch (error) {
        console.error('Ошибка получения пользователя:', error);
    }
    
    return null;
}

// Заголовки авторизации
function getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

// Показать приложение
function showApp() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('app').style.display = 'block';
}

// Показать страницу входа
function showLogin() {
    document.getElementById('login-page').style.display = 'block';
    document.getElementById('app').style.display = 'none';
}

// Инициализация приложения
async function initializeApp() {
    await loadCurrentUser();
    await loadUsers();
    await loadPosts();
    await loadGifts();
    initializeWebSocket();
    setupNavigation();
}

// Загрузка текущего пользователя
async function loadCurrentUser() {
    const user = await getCurrentUser();
    if (!user) return;

    // Обновляем информацию в интерфейсе
    const userElements = document.querySelectorAll('.user-name, .current-user-name');
    userElements.forEach(el => {
        if (el.classList.contains('current-user-name')) {
            el.textContent = user.displayName;
        } else {
            el.textContent = user.displayName;
        }
    });

    const avatarElements = document.querySelectorAll('.user-avatar, .current-user-avatar');
    avatarElements.forEach(el => {
        if (user.avatar) {
            el.src = user.avatar;
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    });

    // Обновляем статистику
    const coinsElement = document.getElementById('user-coins');
    if (coinsElement) coinsElement.textContent = user.coins;

    const friendsElement = document.getElementById('user-friends');
    if (friendsElement) friendsElement.textContent = user.friendsCount || 0;

    const postsElement = document.getElementById('user-posts');
    if (postsElement) postsElement.textContent = user.postsCount || 0;

    // Для мобильной версии
    const mobileName = document.getElementById('mobile-displayName');
    const mobileDescription = document.getElementById('mobile-description');
    const mobileEmail = document.getElementById('mobile-email');
    const mobileCoins = document.getElementById('mobile-coins');
    const mobileFriends = document.getElementById('mobile-friends');
    const mobilePosts = document.getElementById('mobile-posts');
    const mobileAvatar = document.getElementById('mobile-avatar');

    if (mobileName) mobileName.value = user.displayName || '';
    if (mobileDescription) mobileDescription.value = user.description || '';
    if (mobileEmail) mobileEmail.value = user.email || '';
    if (mobileCoins) mobileCoins.textContent = user.coins || 0;
    if (mobileFriends) mobileFriends.textContent = user.friendsCount || 0;
    if (mobilePosts) mobilePosts.textContent = user.postsCount || 0;
    if (mobileAvatar && user.avatar) {
        mobileAvatar.src = user.avatar;
    }
}

// Загрузка пользователей
async function loadUsers() {
    try {
        const response = await fetch('/api/users', {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            allUsers = data.users;
            displayUsers(allUsers);
        }
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
    }
}

// Отображение пользователей
function displayUsers(users) {
    const usersList = document.getElementById('users-list');
    const chatUsersList = document.getElementById('chat-users-list');
    
    if (!usersList && !chatUsersList) return;

    const usersHTML = users.map(user => `
        <div class="user-item" onclick="selectUser('${user.id}')">
            <div class="user-avatar-container">
                ${user.avatar ? 
                    `<img src="${user.avatar}" alt="${user.displayName}" class="user-avatar">` :
                    `<div class="user-avatar-placeholder">${user.displayName.charAt(0)}</div>`
                }
                <div class="user-status ${user.status === 'online' ? 'online' : 'offline'}"></div>
            </div>
            <div class="user-info">
                <div class="user-name">${user.displayName}</div>
                <div class="user-description">${user.description || 'Нет описания'}</div>
            </div>
            ${user.verified ? '<div class="verified-badge">✓</div>' : ''}
            ${user.isDeveloper ? '<div class="developer-badge">👑</div>' : ''}
        </div>
    `).join('');

    if (usersList) usersList.innerHTML = usersHTML;
    if (chatUsersList) chatUsersList.innerHTML = usersHTML;
}

// Выбор пользователя для чата
async function selectUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    currentChatUser = user;
    
    // Обновляем интерфейс
    const chatHeader = document.getElementById('chat-header');
    if (chatHeader) {
        chatHeader.innerHTML = `
            <div class="chat-user-info">
                ${user.avatar ? 
                    `<img src="${user.avatar}" alt="${user.displayName}" class="user-avatar">` :
                    `<div class="user-avatar-placeholder">${user.displayName.charAt(0)}</div>`
                }
                <div>
                    <div class="user-name">${user.displayName}</div>
                    <div class="user-status-text">${user.status === 'online' ? 'В сети' : 'Не в сети'}</div>
                </div>
            </div>
            ${user.verified ? '<div class="verified-badge">✓</div>' : ''}
            ${user.isDeveloper ? '<div class="developer-badge">👑</div>' : ''}
        `;
    }

    // Показываем чат
    showChat();
    
    // Загружаем сообщения
    await loadMessages(userId);
}

// Показать чат
function showChat() {
    // Для десктопной версии
    const chatSection = document.getElementById('chat-section');
    const usersSection = document.getElementById('users-section');
    
    if (chatSection && usersSection) {
        usersSection.classList.add('hidden');
        chatSection.classList.remove('hidden');
    }

    // Для мобильной версии
    const mobileSections = document.querySelectorAll('.section');
    mobileSections.forEach(section => {
        section.classList.remove('active');
    });
    const chatSectionMobile = document.getElementById('chat-section-mobile');
    if (chatSectionMobile) {
        chatSectionMobile.classList.add('active');
    }
}

// Загрузка сообщений
async function loadMessages(userId) {
    if (!currentUser || !userId) return;

    try {
        const response = await fetch(`/api/messages?userId=${currentUser.id}&toUserId=${userId}`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            messages = data.messages;
            displayMessages(messages);
        }
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
    }
}

// Отображение сообщений
function displayMessages(messages) {
    const messagesContainer = document.getElementById('messages-container');
    if (!messagesContainer) return;

    messagesContainer.innerHTML = messages.map(message => `
        <div class="message ${message.isCurrentUser ? 'own-message' : 'other-message'}">
            <div class="message-content">
                ${message.type === 'gift' ? `
                    <div class="gift-message">
                        <div class="gift-preview">${message.giftPreview || '🎁'}</div>
                        <div class="gift-info">
                            <div class="gift-name">${message.giftName}</div>
                            <div class="gift-price">${message.giftPrice} E-COIN</div>
                        </div>
                    </div>
                ` : `
                    <div class="message-text">${message.text}</div>
                    ${message.image ? `<img src="${message.image}" alt="Изображение" class="message-image">` : ''}
                `}
                <div class="message-time">${formatTime(message.timestamp)}</div>
            </div>
        </div>
    `).join('');

    // Прокрутка вниз
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Отправка сообщения
async function sendMessage() {
    if (!currentChatUser) {
        showNotification('Выберите пользователя для начала чата', 'error');
        return;
    }
    
    const messageInput = document.getElementById('messageInput');
    const text = messageInput.value.trim();
    
    if (!text) {
        showNotification('Введите сообщение', 'error');
        return;
    }

    try {
        const response = await fetch('/api/messages/send', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                toUserId: currentChatUser.id,
                text: text,
                type: 'text'
            })
        });

        const data = await response.json();
        
        if (data.success) {
            messageInput.value = '';
            await loadMessages(currentChatUser.id);
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        showNotification('Ошибка отправки сообщения', 'error');
    }
}

// Отправка сообщения по Enter
function handleMessageKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Загрузка постов
async function loadPosts() {
    try {
        const response = await fetch('/api/posts', {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            allPosts = data.posts;
            displayPosts(allPosts);
        }
    } catch (error) {
        console.error('Ошибка загрузки постов:', error);
    }
}

// Отображение постов
function displayPosts(posts) {
    const postsContainer = document.getElementById('posts-container');
    if (!postsContainer) return;

    postsContainer.innerHTML = posts.map(post => `
        <div class="post">
            <div class="post-header">
                <div class="post-user">
                    ${post.userAvatar ? 
                        `<img src="${post.userAvatar}" alt="${post.userName}" class="user-avatar">` :
                        `<div class="user-avatar-placeholder">${post.userName.charAt(0)}</div>`
                    }
                    <div class="post-user-info">
                        <div class="user-name">${post.userName}</div>
                        <div class="post-time">${formatTime(post.createdAt)}</div>
                    </div>
                </div>
                ${post.userVerified ? '<div class="verified-badge">✓</div>' : ''}
                ${post.userDeveloper ? '<div class="developer-badge">👑</div>' : ''}
            </div>
            <div class="post-content">
                <div class="post-text">${post.text}</div>
                ${post.image ? `<img src="${post.image}" alt="Изображение поста" class="post-image">` : ''}
            </div>
            <div class="post-actions">
                <button class="like-btn ${post.likes.includes(currentUser.id) ? 'liked' : ''}" 
                        onclick="likePost('${post.id}')">
                    <i class="fas fa-heart"></i>
                    <span>${post.likes.length}</span>
                </button>
                <button class="comment-btn">
                    <i class="fas fa-comment"></i>
                    <span>${post.comments.length}</span>
                </button>
            </div>
        </div>
    `).join('');
}

// Создание поста
async function createPost(text, image = null) {
    if (!text.trim()) {
        showNotification('Введите текст поста', 'error');
        return;
    }

    try {
        const response = await fetch('/api/posts', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                text: text,
                image: image
            })
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Пост опубликован', 'success');
            await loadPosts();
            await loadCurrentUser();
            
            // Очистка формы
            const postText = document.getElementById('postText');
            const postImagePreview = document.getElementById('postImagePreview');
            if (postText) postText.value = '';
            if (postImagePreview) {
                postImagePreview.style.display = 'none';
                postImagePreview.innerHTML = '';
            }
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка создания поста:', error);
        showNotification('Ошибка создания поста', 'error');
    }
}

// Создание поста в мобильной версии
async function createMobilePost() {
    const text = document.getElementById('mobile-post-text').value.trim();
    const image = document.getElementById('mobile-post-preview-img').src || null;

    if (!text) {
        showNotification('Введите текст поста', 'error');
        return;
    }

    await createPost(text, image);
    
    // Очистка формы
    document.getElementById('mobile-post-text').value = '';
    const preview = document.getElementById('mobile-post-image-preview');
    if (preview) preview.style.display = 'none';
}

// Лайк поста
async function likePost(postId) {
    try {
        const response = await fetch(`/api/posts/${postId}/like`, {
            method: 'POST',
            headers: getAuthHeaders()
        });

        const data = await response.json();
        
        if (data.success) {
            await loadPosts();
        }
    } catch (error) {
        console.error('Ошибка лайка поста:', error);
    }
}

// Загрузка подарков
async function loadGifts() {
    try {
        const response = await fetch('/api/gifts', {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            allGifts = data.gifts;
            displayGifts(allGifts);
            await loadUserGifts();
        }
    } catch (error) {
        console.error('Ошибка загрузки подарков:', error);
    }
}

// Отображение подарков
function displayGifts(gifts) {
    const giftsContainer = document.getElementById('gifts-container');
    if (!giftsContainer) return;

    giftsContainer.innerHTML = gifts.map(gift => `
        <div class="gift-item">
            <div class="gift-preview">${gift.preview}</div>
            <div class="gift-info">
                <div class="gift-name">${gift.name}</div>
                <div class="gift-price">${gift.price} E-COIN</div>
            </div>
            <button class="btn-primary" onclick="buyGift('${gift.id}')">Купить</button>
        </div>
    `).join('');
}

// Покупка подарка
async function buyGift(giftId) {
    if (!currentChatUser) {
        showNotification('Выберите пользователя для отправки подарка', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/gifts/${giftId}/buy`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                toUserId: currentChatUser.id
            })
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            await loadCurrentUser();
            await loadMessages(currentChatUser.id);
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка покупки подарка:', error);
        showNotification('Ошибка покупки подарка', 'error');
    }
}

// Загрузка полученных подарков пользователя
async function loadUserGifts() {
    try {
        const currentUser = await getCurrentUser();
        if (!currentUser) return;

        const response = await fetch(`/api/user/${currentUser.id}/transactions`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayUserGifts(data.transactions || []);
        }
    } catch (error) {
        console.error('Ошибка загрузки полученных подарков:', error);
    }
}

// Отображение полученных подарков
function displayUserGifts(gifts) {
    const container = document.getElementById('user-gifts');
    if (!container) return;

    // Фильтруем только подарки (исключаем бонусы)
    const giftTransactions = gifts.filter(gift => gift.type === 'gift');

    if (giftTransactions.length === 0) {
        container.innerHTML = '<div class="no-data">У вас пока нет подарков</div>';
        return;
    }

    container.innerHTML = giftTransactions.map(gift => `
        <div class="gift-item">
            <div class="gift-preview">${gift.giftPreview || '🎁'}</div>
            <div class="gift-info">
                <div class="gift-name">${gift.giftName || 'Подарок'}</div>
                <div class="gift-from">От: ${gift.fromUserName || 'Неизвестно'}</div>
                <div class="gift-date">${new Date(gift.receivedAt).toLocaleDateString()}</div>
            </div>
        </div>
    `).join('');
}

// WebSocket соединение
function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = function() {
            console.log('WebSocket connected');
            reconnectAttempts = 0;
        };
        
        ws.onmessage = function(event) {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
        };
        
        ws.onclose = function() {
            console.log('WebSocket disconnected');
            attemptReconnect();
        };
        
        ws.onerror = function(error) {
            console.error('WebSocket error:', error);
        };
    } catch (error) {
        console.error('WebSocket initialization error:', error);
    }
}

// Попытка переподключения WebSocket
function attemptReconnect() {
    if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        console.log(`Attempting to reconnect... (${reconnectAttempts}/${maxReconnectAttempts})`);
        setTimeout(initializeWebSocket, 3000);
    }
}

// Обработка сообщений WebSocket
function handleWebSocketMessage(message) {
    switch (message.type) {
        case 'connected':
            console.log('Connected to server with ID:', message.data.clientId);
            break;
        case 'user_online':
            updateUserStatus(message.data.userId, 'online');
            break;
        case 'user_offline':
            updateUserStatus(message.data.userId, 'offline');
            break;
        case 'new_message':
            if (currentChatUser && message.data.senderId === currentChatUser.id) {
                messages.push(message.data);
                displayMessages(messages);
            }
            break;
    }
}

// Обновление статуса пользователя
function updateUserStatus(userId, status) {
    const user = allUsers.find(u => u.id === userId);
    if (user) {
        user.status = status;
        displayUsers(allUsers);
    }
}

// Утилиты
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function showNotification(message, type = 'info') {
    // Простая реализация уведомлений
    console.log(`${type.toUpperCase()}: ${message}`);
    alert(message);
}

// Навигация
function setupNavigation() {
    // Десктопная версия
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const section = this.getAttribute('data-section');
            showSection(section);
        });
    });

    // Мобильная версия
    const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
    mobileNavItems.forEach(item => {
        item.addEventListener('click', function() {
            const section = this.getAttribute('data-section');
            showMobileSection(section);
        });
    });
}

// Показать секцию (десктоп)
function showSection(sectionName) {
    // Скрыть все секции
    const sections = document.querySelectorAll('.main-section');
    sections.forEach(section => {
        section.classList.add('hidden');
    });

    // Показать выбранную секцию
    const targetSection = document.getElementById(sectionName + '-section');
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }

    // Обновить активную навигацию
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-section') === sectionName) {
            item.classList.add('active');
        }
    });
}

// Показать секцию (мобильная)
function showMobileSection(sectionName) {
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        section.classList.remove('active');
    });

    const targetSection = document.getElementById(sectionName + '-section');
    if (targetSection) {
        targetSection.classList.add('active');
    }
}

// Функции для мобильной версии
function triggerPostImageUpload() {
    document.getElementById('mobile-post-image-input').click();
}

function handlePostImageSelect(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('mobile-post-image-preview');
            const img = document.getElementById('mobile-post-preview-img');
            img.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

function removePostImage() {
    const preview = document.getElementById('mobile-post-image-preview');
    const input = document.getElementById('mobile-post-image-input');
    preview.style.display = 'none';
    input.value = '';
}

function openImageUpload() {
    document.getElementById('avatarUpload').click();
}

async function updateProfile() {
    const displayName = document.getElementById('mobile-displayName').value.trim();
    const description = document.getElementById('mobile-description').value.trim();
    const email = document.getElementById('mobile-email').value.trim();

    try {
        const response = await fetch('/api/update-profile', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                displayName: displayName,
                description: description,
                email: email
            })
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Профиль обновлен', 'success');
            loadCurrentUser();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка обновления профиля:', error);
        showNotification('Ошибка обновления профиля', 'error');
    }
}

// Загрузка аватара
async function uploadAvatar(file) {
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            const response = await fetch('/api/upload-avatar', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    fileData: e.target.result,
                    filename: file.name
                })
            });

            const data = await response.json();
            
            if (data.success) {
                showNotification('Аватар обновлен', 'success');
                loadCurrentUser();
            } else {
                showNotification(data.message, 'error');
            }
        } catch (error) {
            console.error('Ошибка загрузки аватара:', error);
            showNotification('Ошибка загрузки аватара', 'error');
        }
    };
    
    reader.readAsDataURL(file);
}

// Обработка выбора файла аватара
function handleAvatarSelect(event) {
    const file = event.target.files[0];
    if (file) {
        uploadAvatar(file);
    }
}

// Инициализация обработчиков событий
function initializeEventListeners() {
    // Обработчики для форм
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    // Обработчик отправки сообщения по Enter
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', handleMessageKeyPress);
    }

    // Обработчик загрузки аватара
    const avatarUpload = document.getElementById('avatarUpload');
    if (avatarUpload) {
        avatarUpload.addEventListener('change', handleAvatarSelect);
    }

    // Обработчик создания поста
    const postForm = document.getElementById('postForm');
    if (postForm) {
        postForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const text = document.getElementById('postText').value.trim();
            const image = document.getElementById('postImagePreview').querySelector('img')?.src || null;
            createPost(text, image);
        });
    }
}

// Обработка входа
async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('deviceId', data.deviceId);
            currentUser = data.user;
            showApp();
            initializeApp();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка входа:', error);
        showNotification('Ошибка входа', 'error');
    }
}

// Обработка регистрации
async function handleRegister(e) {
    e.preventDefault();
    
    const username = document.getElementById('registerUsername').value;
    const displayName = document.getElementById('registerDisplayName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, displayName, email, password })
        });

        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('deviceId', data.deviceId);
            currentUser = data.user;
            showApp();
            initializeApp();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        showNotification('Ошибка регистрации', 'error');
    }
}

// Выход
function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('deviceId');
    currentUser = null;
    currentChatUser = null;
    
    if (ws) {
        ws.close();
    }
    
    showLogin();
}

// Показ/скрытие поиска
function toggleSearch() {
    const searchContainer = document.getElementById('searchContainer');
    if (searchContainer) {
        searchContainer.classList.toggle('hidden');
    }
}

// Поиск пользователей
function searchUsers(query) {
    const filteredUsers = allUsers.filter(user => 
        user.displayName.toLowerCase().includes(query.toLowerCase()) ||
        user.username.toLowerCase().includes(query.toLowerCase())
    );
    displayUsers(filteredUsers);
}

// Активация промокода
async function activatePromoCode() {
    const codeInput = document.getElementById('promoCodeInput');
    const code = codeInput.value.trim();

    if (!code) {
        showNotification('Введите промокод', 'error');
        return;
    }

    try {
        const response = await fetch('/api/promo-codes/activate', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ code })
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            codeInput.value = '';
            loadCurrentUser();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка активации промокода:', error);
        showNotification('Ошибка активации промокода', 'error');
    }
}

// Переключение между версиями
function switchToMobile() {
    window.location.href = '/mobile.html';
}

function switchToDesktop() {
    window.location.href = '/';
}

// Загрузка устройств
async function loadDevices() {
    try {
        const response = await fetch('/api/devices', {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayDevices(data.devices);
        }
    } catch (error) {
        console.error('Ошибка загрузки устройств:', error);
    }
}

// Отображение устройств
function displayDevices(devices) {
    const container = document.getElementById('devices-list');
    if (!container) return;

    container.innerHTML = devices.map(device => `
        <div class="device-item">
            <div class="device-info">
                <div class="device-name">${device.name}</div>
                <div class="device-details">
                    <span>${device.browser}</span> • 
                    <span>${device.os}</span> • 
                    <span>${new Date(device.lastActive).toLocaleDateString()}</span>
                </div>
                ${device.isOwner ? '<div class="owner-badge">Основное</div>' : ''}
            </div>
            ${!device.isOwner ? `
                <button class="btn-secondary" onclick="terminateDevice('${device.id}')">
                    Завершить сеанс
                </button>
            ` : ''}
        </div>
    `).join('');
}

// Завершение сеанса устройства
async function terminateDevice(deviceId) {
    try {
        const response = await fetch('/api/devices/terminate', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ deviceId })
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            loadDevices();
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка завершения сеанса:', error);
        showNotification('Ошибка завершения сеанса', 'error');
    }
}

// Загрузка эмодзи
async function loadEmoji() {
    try {
        const response = await fetch('/api/emoji', {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayEmoji(data.emoji);
        }
    } catch (error) {
        console.error('Ошибка загрузки эмодзи:', error);
    }
}

// Отображение эмодзи
function displayEmoji(emojiList) {
    const container = document.getElementById('emoji-container');
    if (!container) return;

    container.innerHTML = emojiList.map(emoji => `
        <div class="emoji-item" onclick="insertEmoji(':${emoji.name}:')">
            <img src="${emoji.url}" alt="${emoji.name}" class="emoji">
            <span class="emoji-name">:${emoji.name}:</span>
        </div>
    `).join('');
}

// Вставка эмодзи в сообщение
function insertEmoji(emojiCode) {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.value += emojiCode;
        messageInput.focus();
    }
}
