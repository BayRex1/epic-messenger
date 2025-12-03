let selectedMembers = new Set();

// Глобальные функции, которые должны быть доступны
function showNotification(message, type = 'info') {
    console.log(`🔔 ${type}: ${message}`);
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#2196f3'};
        color: white;
        border-radius: 4px;
        z-index: 1000;
        max-width: 300px;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

function formatLastSeen(lastSeen) {
    if (!lastSeen) return 'давно';
    
    try {
        const date = new Date(lastSeen);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffMins < 1) return 'только что';
        if (diffMins < 60) return `${diffMins} мин назад`;
        if (diffHours < 24) return `${diffHours} ч назад`;
        if (diffDays === 1) return 'вчера';
        if (diffDays < 7) return `${diffDays} дн назад`;
        
        return date.toLocaleDateString();
    } catch (error) {
        return 'давно';
    }
}

async function loadCurrentUser() {
    try {
        console.log('👤 Загрузка текущего пользователя для чата...');
        
        if (!window.currentUser) {
            console.log('⏳ Ожидаем инициализации пользователя из common.js...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            if (!window.currentUser) {
                console.error('❌ currentUser не найден даже после ожидания');
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
                    window.currentUser = data.user;
                    console.log('✅ Пользователь загружен в chat.js:', window.currentUser.username);
                } else {
                    throw new Error(data.message);
                }
            }
        }
        
        console.log('✅ Пользователь готов:', window.currentUser.username);
        
        await loadAllUsers();
        
    } catch (error) {
        console.error('❌ Ошибка загрузки пользователя:', error);
        showNotification('Ошибка авторизации', 'error');
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 2000);
    }
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
            window.allUsers = data.users;
            console.log('✅ Загружено пользователей:', window.allUsers.length);
        } else {
            console.error('❌ Ошибка загрузки пользователей:', data.message);
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки пользователей:', error);
    }
}

async function loadChats() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.error('❌ Токен не найден');
            showNotification('Необходима авторизация', 'error');
            return;
        }

        console.log('📨 Запрос чатов...');
        const response = await fetch('/api/chats', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        console.log('📨 Ответ от сервера:', data);
        
        if (data.success) {
            console.log('✅ Чаты загружены:', data.chats.length);
            renderChats(data.chats);
        } else {
            console.error('❌ Ошибка загрузки чатов:', data.message);
            showNotification('Ошибка загрузки чатов: ' + data.message, 'error');
            
            const chatsList = document.getElementById('chatsList');
            if (chatsList) {
                chatsList.innerHTML = '<div class="system-message">Ошибка загрузки чатов</div>';
            }
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки чатов:', error);
        showNotification('Ошибка загрузки чатов: ' + error.message, 'error');
        
        const chatsList = document.getElementById('chatsList');
        if (chatsList) {
            chatsList.innerHTML = '<div class="system-message">Ошибка соединения: ' + error.message + '</div>';
        }
    }
}

function renderChats(chats) {
    const chatsList = document.getElementById('chatsList');
    if (!chatsList) {
        console.error('❌ Элемент chatsList не найден');
        return;
    }
    
    chatsList.innerHTML = '';
    
    if (!chats || chats.length === 0) {
        chatsList.innerHTML = '<div class="system-message">У вас пока нет чатов</div>';
        return;
    }
    
    console.log('📋 Рендерим чаты:', chats.length);
    
    chats.forEach(chat => {
        const chatElement = document.createElement('div');
        chatElement.className = 'chat-item';
        chatElement.setAttribute('data-chat-id', chat.id);
        chatElement.setAttribute('data-chat-type', chat.isGroup ? 'group' : 'personal');
        
        let lastMessageText = 'Нет сообщений';
        if (chat.lastMessage) {
            if (chat.lastMessage.type === 'gift') {
                lastMessageText = '🎁 Подарок';
            } else if (chat.lastMessage.file) {
                lastMessageText = '📎 Файл';
            } else {
                lastMessageText = chat.lastMessage.text || 'Сообщение';
            }
        } else if (chat.isGroup) {
            lastMessageText = 'Группа создана';
        }
        
        const groupIcon = chat.isGroup ? '<span class="group-icon">👥</span>' : '';
        
        const statusInfo = chat.isGroup ? 
            `Участников: ${chat.memberCount || 1}` : 
            (chat.status === 'online' ? 'В сети' : `Был(а) в сети ${formatLastSeen(chat.lastSeen)}`);
        
        chatElement.innerHTML = `
            <div class="chat-avatar">
                ${chat.avatar ? 
                    `<img src="${chat.avatar}" alt="${chat.displayName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">` : 
                    chat.displayName ? chat.displayName.charAt(0).toUpperCase() : 'U'
                }
                ${groupIcon}
                ${chat.isGroup ? '' : `<span class="${chat.status === 'online' ? 'online-status' : 'offline-status'}"></span>`}
            </div>
            <div class="chat-info">
                <h4>
                    ${chat.displayName || 'Пользователь'}
                    ${chat.verified ? '<span class="verified-badge">✓</span>' : ''}
                    ${chat.isDeveloper ? '<span class="developer-badge">👑</span>' : ''}
                    ${chat.isGroup ? '<span class="group-badge">Группа</span>' : ''}
                </h4>
                <div class="chat-last-message">${lastMessageText}</div>
                <div class="chat-status">${statusInfo}</div>
            </div>
            ${chat.unreadCount > 0 ? `<div class="unread-badge">${chat.unreadCount}</div>` : ''}
        `;
        
        chatElement.addEventListener('click', () => selectChat(chat));
        chatsList.appendChild(chatElement);
    });
    
    console.log('✅ Чаты отрендерены');
}

function selectChat(chat) {
    window.currentChat = chat;
    
    console.log('💬 Выбран чат:', {
        id: chat.id,
        name: chat.displayName,
        isGroup: chat.isGroup
    });
    
    const currentChatName = document.getElementById('currentChatName');
    const currentChatStatus = document.getElementById('currentChatStatus');
    const currentChatAvatar = document.getElementById('currentChatAvatar');
    
    if (currentChatName) {
        currentChatName.textContent = chat.displayName || 'Пользователь';
        if (chat.isGroup) {
            currentChatName.innerHTML += ' <span class="group-badge-small">Группа</span>';
        }
    }
    
    if (currentChatStatus) {
        if (chat.isGroup) {
            currentChatStatus.textContent = `Участников: ${chat.memberCount || 1}`;
        } else {
            currentChatStatus.textContent = chat.status === 'online' ? 
                'В сети' : 
                `Был(а) в сети ${formatLastSeen(chat.lastSeen)}`;
        }
    }
    
    if (currentChatAvatar) {
        currentChatAvatar.innerHTML = '';
        if (chat.avatar) {
            const img = document.createElement('img');
            img.src = chat.avatar;
            img.alt = chat.displayName;
            img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 50%;';
            currentChatAvatar.appendChild(img);
        } else {
            currentChatAvatar.textContent = chat.displayName ? chat.displayName.charAt(0).toUpperCase() : 'U';
        }
        if (chat.isGroup) {
            const groupIcon = document.createElement('span');
            groupIcon.className = 'group-avatar-icon';
            groupIcon.textContent = '👥';
            currentChatAvatar.appendChild(groupIcon);
        }
    }
    
    loadChatMessages(chat.id);
    
    loadChats();
}

async function markAsRead(fromUserId) {
    try {
        const token = localStorage.getItem('authToken');
        await fetch('/api/messages/mark-read', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                fromUserId: fromUserId
            })
        });

        if (window.socket && window.socket.readyState === WebSocket.OPEN) {
            window.socket.send(JSON.stringify({
                type: 'mark_read',
                fromUserId: fromUserId
            }));
        }
    } catch (error) {
        console.error('Ошибка отметки сообщений как прочитанных:', error);
    }
}

async function loadChatMessages(chatId) {
    try {
        const token = localStorage.getItem('authToken');
        
        const url = window.currentChat.isGroup ? 
            `/api/messages/group/${chatId}` :
            `/api/messages?userId=${window.currentUser.id}&toUserId=${chatId}`;
        
        console.log('📨 Загрузка сообщений для:', {
            chatId: chatId,
            isGroup: window.currentChat.isGroup,
            url: url
        });
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        console.log('📨 Получены сообщения:', {
            success: data.success,
            count: data.messages ? data.messages.length : 0
        });
        
        if (data.success) {
            renderChatMessages(data.messages);
        } else {
            console.error('Ошибка загрузки сообщений:', data.message);
            showNotification('Ошибка загрузки сообщений: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
        showNotification('Ошибка загрузки сообщений: ' + error.message, 'error');
    }
}

function renderChatMessages(messages) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    chatMessages.innerHTML = '';
    
    if (!messages || messages.length === 0) {
        chatMessages.innerHTML = '<div class="system-message">Нет сообщений. Начните общение!</div>';
        return;
    }
    
    messages.forEach(message => {
        renderNewMessage(message);
    });
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderNewMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const messageElement = document.createElement('div');
    const isOutgoing = message.senderId === window.currentUser.id;
    messageElement.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
    messageElement.setAttribute('data-message-id', message.id);
    
    let readStatus = '';
    if (isOutgoing) {
        readStatus = `<div class="read-status ${message.read ? 'read' : 'unread'}">
            ${message.read ? '✓✓' : '✓'}
        </div>`;
    }
    
    let senderInfo = '';
    if (window.currentChat && window.currentChat.isGroup && !isOutgoing) {
        const sender = window.allUsers.find(u => u.id === message.senderId);
        if (sender) {
            senderInfo = `<div class="message-sender">${sender.displayName}</div>`;
        }
    }
    
    if (message.type === 'gift') {
        messageElement.innerHTML = `
            ${senderInfo}
            <div class="message-gift">
                <div class="gift-preview">
                    ${message.giftImage ? 
                        `<img src="${message.giftImage}" alt="${message.giftName}" style="width: 40px; height: 40px;">` : 
                        message.giftPreview || '🎁'
                    }
                </div>
                <div class="gift-info">
                    <div class="gift-name">${message.giftName || 'Подарок'}</div>
                    <div class="gift-price">Цена: ${message.giftPrice || 0} E-COIN</div>
                    <div class="message-time">${new Date(message.timestamp).toLocaleString()}</div>
                </div>
            </div>
            ${readStatus}
        `;
    } else if (message.file) {
        let fileContent = '';
        if (message.fileType === 'image') {
            fileContent = `<img src="${message.file}" alt="Изображение" onclick="openImageModal('${message.file}')">`;
        } else if (message.fileType === 'video') {
            fileContent = `<video controls><source src="${message.file}" type="video/mp4"></video>`;
        } else if (message.fileType === 'audio') {
            fileContent = `
                <div class="message-audio">
                    <div class="audio-controls">
                        <button class="audio-play-btn">▶</button>
                        <div class="audio-waveform"></div>
                    </div>
                    <div class="voice-duration">0:00</div>
                </div>
            `;
        } else {
            fileContent = `<div>Файл: ${message.fileName || 'Неизвестный файл'}</div>`;
        }
        
        messageElement.innerHTML = `
            ${senderInfo}
            <div class="message-file">
                <div class="message-text">${message.text || ''}</div>
                <div class="message-file-content">
                    ${fileContent}
                </div>
                <div class="message-time">${new Date(message.timestamp).toLocaleString()}</div>
            </div>
            ${readStatus}
        `;
    } else {
        let messageText = message.text || '';
        messageText = processMentions(messageText);
        
        messageText = messageText.replace(/:\)/g, '😊')
                               .replace(/:\(/g, '😢')
                               .replace(/:D/g, '😃')
                               .replace(/<3/g, '❤️');
        
        messageElement.innerHTML = `
            ${senderInfo}
            <div class="message-text">${messageText}</div>
            <div class="message-time">${new Date(message.timestamp).toLocaleString()}</div>
            ${readStatus}
        `;
    }
    
    chatMessages.appendChild(messageElement);
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const text = messageInput.value.trim();
    
    if (!text && !window.currentFileData) {
        showNotification('Введите сообщение или выберите файл', 'warning');
        return;
    }
    
    if (!window.currentChat) {
        showNotification('Выберите чат для отправки сообщения', 'warning');
        return;
    }
    
    try {
        const token = localStorage.getItem('authToken');
        
        let requestData = {
            toUserId: window.currentChat.id,
            text: text,
            type: 'text'
        };

        if (window.currentFileData) {
            const fileType = window.currentFileType || 'file';
            requestData.file = window.currentFileData;
            requestData.fileName = document.getElementById('fileInput').files[0]?.name || 'file';
            requestData.fileType = fileType;
            requestData.type = fileType;
        }

        console.log('📤 Отправка сообщения:', {
            toUserId: window.currentChat.id,
            isGroup: window.currentChat.isGroup,
            hasFile: !!window.currentFileData,
            text: text
        });

        const response = await fetch('/api/messages/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            messageInput.value = '';
            window.currentFileData = null;
            window.currentFileType = null;
            const filePreview = document.getElementById('filePreview');
            if (filePreview) filePreview.innerHTML = '';
            const uploadFileModal = document.getElementById('uploadFileModal');
            if (uploadFileModal) uploadFileModal.style.display = 'none';
            
            renderNewMessage(data.message);
            loadChats();
            
            console.log('✅ Сообщение отправлено успешно');
            showNotification('Сообщение отправлено', 'success');
        } else {
            showNotification('Ошибка отправки сообщения: ' + data.message, 'error');
            console.error('❌ Ошибка отправки сообщения:', data.message);
        }
    } catch (error) {
        console.error('❌ Ошибка отправки сообщения:', error);
        showNotification('Ошибка отправки сообщения: ' + error.message, 'error');
    }
}

function showUploadFileModal(fileType) {
    window.currentFileType = fileType;
    const modal = document.getElementById('uploadFileModal');
    const title = document.getElementById('uploadFileTitle');
    
    if (!modal || !title) return;
    
    let typeText = '';
    switch(fileType) {
        case 'image':
            typeText = 'изображение';
            document.getElementById('fileInput').accept = 'image/*';
            break;
        case 'video':
            typeText = 'видео';
            document.getElementById('fileInput').accept = 'video/*';
            break;
        case 'audio':
            typeText = 'аудио';
            document.getElementById('fileInput').accept = 'audio/*';
            break;
    }
    
    title.textContent = `Загрузить ${typeText}`;
    const fileUploadArea = document.getElementById('fileUploadArea');
    if (fileUploadArea) {
        fileUploadArea.querySelector('div').textContent = 
            `Перетащите сюда ${typeText} или нажмите для выбора`;
    }
    
    modal.style.display = 'flex';
}

function initializeChatActions() {
    console.log('🔧 Инициализация действий чата...');
    
    const newChatBtn = document.getElementById('newChatBtn');
    const createGroupBtn = document.getElementById('createGroupBtn');
    const refreshChatsBtn = document.getElementById('refreshChatsBtn');
    const closeUserSearch = document.getElementById('closeUserSearch');
    const userSearchInput = document.getElementById('userSearchInput');
    const cancelGroupCreate = document.getElementById('cancelGroupCreate');
    const confirmGroupCreate = document.getElementById('confirmGroupCreate');

    if (newChatBtn) {
        newChatBtn.addEventListener('click', function() {
            console.log('🆕 Нажата кнопка нового чата');
            showUserSearch();
        });
        console.log('✅ Кнопка нового чата инициализирована');
    } else {
        console.error('❌ Кнопка нового чата не найдена');
    }

    if (createGroupBtn) {
        createGroupBtn.addEventListener('click', function() {
            console.log('👥 Нажата кнопка создания группы');
            showGroupCreation();
        });
        console.log('✅ Кнопка создания группы инициализирована');
    } else {
        console.error('❌ Кнопка создания группы не найдена');
    }

    if (refreshChatsBtn) {
        refreshChatsBtn.addEventListener('click', function() {
            console.log('🔄 Нажата кнопка обновления чатов');
            loadChats();
        });
        console.log('✅ Кнопка обновления чатов инициализирована');
    } else {
        console.error('❌ Кнопка обновления чатов не найдена');
    }

    if (closeUserSearch) {
        closeUserSearch.addEventListener('click', function() {
            console.log('❌ Закрытие поиска пользователей');
            hideUserSearch();
        });
    }

    if (userSearchInput) {
        userSearchInput.addEventListener('input', function(e) {
            console.log('🔍 Поиск пользователей:', e.target.value);
            searchUsersForChat(e.target.value);
        });
    }

    if (cancelGroupCreate) {
        cancelGroupCreate.addEventListener('click', function() {
            console.log('❌ Отмена создания группы');
            hideGroupCreation();
        });
    }

    if (confirmGroupCreate) {
        confirmGroupCreate.addEventListener('click', function() {
            console.log('✅ Подтверждение создания группы');
            createNewGroup();
        });
    }
    
    console.log('✅ Действия чата инициализированы');
}

function showUserSearch() {
    const userSearchContainer = document.getElementById('userSearchContainer');
    const userSearchInput = document.getElementById('userSearchInput');
    
    if (userSearchContainer && userSearchInput) {
        userSearchContainer.style.display = 'block';
        userSearchInput.focus();
        hideGroupCreation();
    }
}

function hideUserSearch() {
    const userSearchContainer = document.getElementById('userSearchContainer');
    const userSearchInput = document.getElementById('userSearchInput');
    const userSearchResults = document.getElementById('userSearchResults');
    
    if (userSearchContainer) userSearchContainer.style.display = 'none';
    if (userSearchInput) userSearchInput.value = '';
    if (userSearchResults) userSearchResults.innerHTML = '';
}

function showGroupCreation() {
    const createGroupContainer = document.getElementById('createGroupContainer');
    
    if (createGroupContainer) {
        createGroupContainer.style.display = 'block';
        hideUserSearch();
        loadAvailableUsersForGroup();
    }
}

function hideGroupCreation() {
    const createGroupContainer = document.getElementById('createGroupContainer');
    const groupNameInput = document.getElementById('groupNameInput');
    const groupUsernameInput = document.getElementById('groupUsernameInput');
    
    if (createGroupContainer) createGroupContainer.style.display = 'none';
    if (groupNameInput) groupNameInput.value = '';
    if (groupUsernameInput) groupUsernameInput.value = '';
    clearSelectedMembers();
}

async function searchUsersForChat(searchTerm) {
    const userSearchResults = document.getElementById('userSearchResults');
    if (!userSearchResults) return;

    if (searchTerm.length < 2) {
        userSearchResults.innerHTML = '<div class="system-message">Введите имя пользователя для поиска</div>';
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
            renderUserSearchResultsForChat(data.users);
        } else {
            userSearchResults.innerHTML = '<div class="system-message">Пользователи не найдены</div>';
        }
    } catch (error) {
        console.error('Ошибка поиска пользователей:', error);
        userSearchResults.innerHTML = '<div class="system-message">Ошибка поиска</div>';
    }
}

function renderUserSearchResultsForChat(users) {
    const userSearchResults = document.getElementById('userSearchResults');
    if (!userSearchResults) return;
    
    userSearchResults.innerHTML = '';

    if (users.length === 0) {
        userSearchResults.innerHTML = '<div class="system-message">Пользователи не найдены</div>';
        return;
    }

    const filteredUsers = users.filter(user => user.id !== window.currentUser.id);

    filteredUsers.forEach(user => {
        const userElement = document.createElement('div');
        userElement.className = 'chat-item';
        userElement.innerHTML = `
            <div class="chat-avatar">
                ${user.avatar ? 
                    `<img src="${user.avatar}" alt="${user.displayName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">` : 
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
            startNewChat(user);
        });
        
        userSearchResults.appendChild(userElement);
    });
}

function startNewChat(user) {
    const chat = {
        id: user.id,
        displayName: user.displayName || 'Пользователь',
        avatar: user.avatar,
        verified: user.verified,
        isDeveloper: user.isDeveloper,
        status: user.status,
        lastSeen: user.lastSeen,
        lastMessage: null,
        unreadCount: 0,
        isGroup: false
    };
    
    selectChat(chat);
    
    hideUserSearch();
    
    showNotification(`Чат с ${user.displayName} начат`, 'success');
}

async function loadAvailableUsersForGroup() {
    const availableUsersList = document.getElementById('availableUsersList');
    if (!availableUsersList) return;

    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/users', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderAvailableUsers(data.users);
        }
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
    }
}

function renderAvailableUsers(users) {
    const availableUsersList = document.getElementById('availableUsersList');
    if (!availableUsersList) return;
    
    availableUsersList.innerHTML = '';

    const filteredUsers = users.filter(user => user.id !== window.currentUser.id);

    filteredUsers.forEach(user => {
        const userElement = document.createElement('div');
        userElement.className = 'available-user-item';
        userElement.setAttribute('data-user-id', user.id);
        userElement.innerHTML = `
            <div class="user-checkbox">
                <input type="checkbox" id="user-${user.id}" class="user-select-checkbox">
            </div>
            <div class="user-avatar">
                ${user.avatar ? 
                    `<img src="${user.avatar}" alt="${user.displayName}" style="width: 32px; height: 32px; border-radius: 50%;">` : 
                    user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'
                }
            </div>
            <div class="user-info">
                <div class="user-name">${user.displayName || 'Пользователь'}</div>
                <div class="user-username">@${user.username}</div>
            </div>
        `;
        
        const checkbox = userElement.querySelector('.user-select-checkbox');
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                selectedMembers.add(user.id);
            } else {
                selectedMembers.delete(user.id);
            }
            updateSelectedMembersList();
        });
        
        availableUsersList.appendChild(userElement);
    });
}

function updateSelectedMembersList() {
    const selectedMembersList = document.getElementById('selectedMembersList');
    if (!selectedMembersList) return;
    
    selectedMembersList.innerHTML = '';
    
    if (selectedMembers.size === 0) {
        selectedMembersList.innerHTML = '<div class="system-message">Выберите участников группы</div>';
        return;
    }
    
    selectedMembers.forEach(userId => {
        const user = window.allUsers.find(u => u.id === userId);
        if (user) {
            const memberElement = document.createElement('div');
            memberElement.className = 'selected-member-item';
            memberElement.innerHTML = `
                <div class="member-avatar">
                    ${user.avatar ? 
                        `<img src="${user.avatar}" alt="${user.displayName}" style="width: 24px; height: 24px; border-radius: 50%;">` : 
                        user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'
                    }
                </div>
                <div class="member-name">${user.displayName}</div>
                <button class="remove-member" data-user-id="${user.id}">&times;</button>
            `;
            
            const removeBtn = memberElement.querySelector('.remove-member');
            removeBtn.addEventListener('click', function() {
                selectedMembers.delete(user.id);
                const checkbox = document.querySelector(`#user-${user.id}`);
                if (checkbox) checkbox.checked = false;
                updateSelectedMembersList();
            });
            
            selectedMembersList.appendChild(memberElement);
        }
    });
}

function clearSelectedMembers() {
    selectedMembers.clear();
    const checkboxes = document.querySelectorAll('.user-select-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    updateSelectedMembersList();
}

async function createNewGroup() {
    const groupNameInput = document.getElementById('groupNameInput');
    const groupUsernameInput = document.getElementById('groupUsernameInput');
    
    const groupName = groupNameInput.value.trim();
    const groupUsername = groupUsernameInput.value.trim();
    
    if (!groupName) {
        showNotification('Введите название группы', 'error');
        return;
    }
    
    if (selectedMembers.size === 0) {
        showNotification('Выберите хотя бы одного участника', 'error');
        return;
    }
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/groups/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: groupName,
                username: groupUsername || null,
                members: Array.from(selectedMembers),
                description: `Группа "${groupName}"`
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Группа "${groupName}" создана!`, 'success');
            hideGroupCreation();
            
            console.log('✅ Группа создана:', data.group);
            
            const groupChat = {
                id: data.group.id,
                displayName: data.group.name,
                avatar: data.group.avatar,
                isGroup: true,
                memberCount: data.group.members.length,
                lastMessage: null,
                unreadCount: 0,
                createdAt: data.group.createdAt
            };
            
            selectChat(groupChat);
            
            loadChats();
        } else {
            showNotification('Ошибка создания группы: ' + data.message, 'error');
            console.error('❌ Ошибка создания группы:', data.message);
        }
    } catch (error) {
        console.error('❌ Ошибка создания группы:', error);
        showNotification('Ошибка создания группы', 'error');
    }
}

async function initializeChat() {
    console.log('🚀 Инициализация чата...');
    
    try {
        await loadCurrentUser();
        
        const sendMessageBtn = document.getElementById('sendMessageBtn');
        const messageInput = document.getElementById('messageInput');
        const uploadImageBtn = document.getElementById('uploadImageBtn');
        const uploadVideoBtn = document.getElementById('uploadVideoBtn');
        const uploadAudioBtn = document.getElementById('uploadAudioBtn');
        const sendFileBtn = document.getElementById('sendFile');
        const closeUploadFile = document.getElementById('closeUploadFile');
        const cancelUploadFile = document.getElementById('cancelUploadFile');

        if (sendMessageBtn) {
            sendMessageBtn.addEventListener('click', sendMessage);
        }
        
        if (messageInput) {
            messageInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') sendMessage();
            });
        }

        if (uploadImageBtn) {
            uploadImageBtn.addEventListener('click', function() {
                showUploadFileModal('image');
            });
        }

        if (uploadVideoBtn) {
            uploadVideoBtn.addEventListener('click', function() {
                showUploadFileModal('video');
            });
        }

        if (uploadAudioBtn) {
            uploadAudioBtn.addEventListener('click', function() {
                showUploadFileModal('audio');
            });
        }

        if (sendFileBtn) {
            sendFileBtn.addEventListener('click', function() {
                if (window.currentFileData) {
                    sendMessage();
                } else {
                    showNotification('Выберите файл для отправки', 'warning');
                }
            });
        }

        if (closeUploadFile) {
            closeUploadFile.addEventListener('click', function() {
                const uploadFileModal = document.getElementById('uploadFileModal');
                if (uploadFileModal) uploadFileModal.style.display = 'none';
                window.currentFileData = null;
                window.currentFileType = null;
            });
        }

        if (cancelUploadFile) {
            cancelUploadFile.addEventListener('click', function() {
                const uploadFileModal = document.getElementById('uploadFileModal');
                if (uploadFileModal) uploadFileModal.style.display = 'none';
                window.currentFileData = null;
                window.currentFileType = null;
            });
        }
        
        const fileInput = document.getElementById('fileInput');
        const fileUploadArea = document.getElementById('fileUploadArea');
        
        if (fileInput && fileUploadArea) {
            fileUploadArea.addEventListener('click', () => {
                fileInput.click();
            });
            
            fileUploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                fileUploadArea.style.backgroundColor = 'var(--hover-color)';
            });
            
            fileUploadArea.addEventListener('dragleave', () => {
                fileUploadArea.style.backgroundColor = '';
            });
            
            fileUploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                fileUploadArea.style.backgroundColor = '';
                if (e.dataTransfer.files.length > 0) {
                    handleFileSelect(e.dataTransfer.files[0]);
                }
            });
            
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    handleFileSelect(e.target.files[0]);
                }
            });
        }
        
        initializeChatActions();
        
        await loadChats();
        
        console.log('✅ Чат полностью инициализирован');
    } catch (error) {
        console.error('❌ Ошибка инициализации чата:', error);
        showNotification('Ошибка инициализации чата: ' + error.message, 'error');
    }
}

function handleFileSelect(file) {
    const reader = new FileReader();
    const filePreview = document.getElementById('filePreview');
    
    reader.onload = function(e) {
        window.currentFileData = e.target.result;
        
        if (file.type.startsWith('image/')) {
            filePreview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 200px; max-height: 200px;">`;
        } else if (file.type.startsWith('video/')) {
            filePreview.innerHTML = `<video controls style="max-width: 200px;"><source src="${e.target.result}" type="${file.type}"></video>`;
        } else if (file.type.startsWith('audio/')) {
            filePreview.innerHTML = `<audio controls><source src="${e.target.result}" type="${file.type}"></audio>`;
        } else {
            filePreview.innerHTML = `<div>Файл: ${file.name}</div>`;
        }
    };
    
    reader.readAsDataURL(file);
}

function processMentions(text) {
    return text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
}

function openImageModal(imageUrl) {
    console.log('Открытие изображения:', imageUrl);
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM загружен, инициализация чата...');
    initializeChat();
});
