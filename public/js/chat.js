// Функции для работы с чатом

let selectedMembers = new Set();

async function loadChats() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/chats', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderChats(data.chats);
        }
    } catch (error) {
        console.error('Ошибка загрузки чатов:', error);
    }
}

function renderChats(chats) {
    const chatsList = document.getElementById('chatsList');
    if (!chatsList) return;
    
    chatsList.innerHTML = '';
    
    if (chats.length === 0) {
        chatsList.innerHTML = '<div class="system-message">У вас пока нет чатов</div>';
        return;
    }
    
    chats.forEach(chat => {
        const chatElement = document.createElement('div');
        chatElement.className = 'chat-item';
        chatElement.setAttribute('data-user-id', chat.id);
        
        let lastMessageText = 'Нет сообщений';
        if (chat.lastMessage) {
            if (chat.lastMessage.type === 'gift') {
                lastMessageText = '🎁 Подарок';
            } else if (chat.lastMessage.file) {
                lastMessageText = '📎 Файл';
            } else {
                lastMessageText = chat.lastMessage.text || 'Сообщение';
            }
        }
        
        // Добавляем иконку группы если это группа
        const groupIcon = chat.isGroup ? '<span class="group-icon">👥</span>' : '';
        
        chatElement.innerHTML = `
            <div class="chat-avatar">
                ${chat.avatar ? 
                    `<img src="${chat.avatar}" alt="${chat.displayName}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                    chat.displayName ? chat.displayName.charAt(0).toUpperCase() : 'U'
                }
                ${groupIcon}
            </div>
            <div class="chat-info">
                <h4>
                    ${chat.displayName || 'Пользователь'}
                    ${chat.verified ? '<span class="verified-badge">✓</span>' : ''}
                    ${chat.isDeveloper ? '<span class="developer-badge">👑</span>' : ''}
                    ${chat.isGroup ? '<span class="group-badge">Группа</span>' : ''}
                    <span class="${chat.status === 'online' ? 'online-status' : 'offline-status'}"></span>
                </h4>
                <div class="chat-last-message">${lastMessageText}</div>
            </div>
            ${chat.unreadCount > 0 ? `<div class="unread-badge">${chat.unreadCount}</div>` : ''}
        `;
        
        chatElement.addEventListener('click', () => selectChat(chat));
        chatsList.appendChild(chatElement);
    });
}

function selectChat(chat) {
    currentChat = chat;
    
    // Отмечаем сообщения как прочитанные
    markAsRead(chat.id);
    
    // Обновляем информацию о чате
    const currentChatName = document.getElementById('currentChatName');
    const currentChatStatus = document.getElementById('currentChatStatus');
    const currentChatAvatar = document.getElementById('currentChatAvatar');
    
    if (currentChatName) currentChatName.textContent = chat.displayName || 'Пользователь';
    if (currentChatStatus) {
        if (chat.isGroup) {
            currentChatStatus.textContent = `Участников: ${chat.memberCount || 1}`;
        } else {
            currentChatStatus.textContent = chat.status === 'online' ? 'В сети' : `Был(а) в сети ${new Date(chat.lastSeen).toLocaleString()}`;
        }
    }
    
    if (currentChatAvatar) {
        if (chat.avatar) {
            currentChatAvatar.innerHTML = `<img src="${chat.avatar}" alt="${chat.displayName}" style="width: 100%; height: 100%; object-fit: cover;">`;
        } else {
            currentChatAvatar.textContent = chat.displayName ? chat.displayName.charAt(0).toUpperCase() : 'U';
        }
        // Добавляем иконку группы
        if (chat.isGroup) {
            currentChatAvatar.innerHTML += '<span class="group-avatar-icon">👥</span>';
        }
    }
    
    // Загружаем сообщения
    loadChatMessages(chat.id);
    
    // Обновляем список чатов (убираем badge)
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

        // Отправляем WebSocket сообщение о прочтении
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'mark_read',
                fromUserId: fromUserId
            }));
        }
    } catch (error) {
        console.error('Ошибка отметки сообщений как прочитанных:', error);
    }
}

async function loadChatMessages(userId) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/messages?userId=${currentUser.id}&toUserId=${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderChatMessages(data.messages);
        }
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
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
    
    // Прокручиваем вниз
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderNewMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const messageElement = document.createElement('div');
    const isOutgoing = message.senderId === currentUser.id;
    messageElement.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
    messageElement.setAttribute('data-message-id', message.id);
    
    let readStatus = '';
    if (isOutgoing) {
        readStatus = `<div class="read-status ${message.read ? 'read' : 'unread'}">
            ${message.read ? '✓✓' : '✓'}
        </div>`;
    }
    
    // Добавляем информацию об отправителе для групповых чатов
    let senderInfo = '';
    if (currentChat && currentChat.isGroup && !isOutgoing) {
        const sender = allUsers.find(u => u.id === message.senderId);
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
        // Заменяем эмодзи коды на изображения и обрабатываем упоминания
        let messageText = message.text || '';
        messageText = processMentions(messageText);
        emojiList.forEach(emoji => {
            const emojiCode = `:${emoji.name}:`;
            if (messageText.includes(emojiCode)) {
                messageText = messageText.replace(new RegExp(emojiCode, 'g'), 
                    `<img src="${emoji.url}" alt="${emoji.name}" style="width: 20px; height: 20px; vertical-align: middle;">`);
            }
        });
        
        messageElement.innerHTML = `
            ${senderInfo}
            <div class="message-text">${messageText}</div>
            <div class="message-time">${new Date(message.timestamp).toLocaleString()}</div>
            ${readStatus}
        `;
    }
    
    chatMessages.appendChild(messageElement);
    
    // Прокручиваем вниз
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const text = messageInput.value.trim();
    
    if (!text && !currentFileData) return;
    
    try {
        const token = localStorage.getItem('authToken');
        
        let requestData = {
            toUserId: currentChat.id,
            text: text,
            type: 'text'
        };

        // Если есть файл, добавляем его в запрос
        if (currentFileData) {
            const fileType = currentFileType || 'file';
            requestData.file = currentFileData;
            requestData.fileName = document.getElementById('fileInput').files[0]?.name || 'file';
            requestData.fileType = fileType;
            requestData.type = fileType;
        }

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
            currentFileData = null;
            currentFileType = null;
            const filePreview = document.getElementById('filePreview');
            if (filePreview) filePreview.innerHTML = '';
            const uploadFileModal = document.getElementById('uploadFileModal');
            if (uploadFileModal) uploadFileModal.style.display = 'none';
            
            // Отправляем сообщение через WebSocket
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'new_message',
                    message: data.message
                }));
            }
            
            // Обновляем интерфейс
            renderNewMessage(data.message);
            loadChats();
        } else {
            showNotification('Ошибка отправки сообщения: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        showNotification('Ошибка отправки сообщения', 'error');
    }
}

function showUploadFileModal(fileType) {
    currentFileType = fileType;
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

// Функции для создания новых чатов и групп
function initializeChatActions() {
    const newChatBtn = document.getElementById('newChatBtn');
    const createGroupBtn = document.getElementById('createGroupBtn');
    const closeUserSearch = document.getElementById('closeUserSearch');
    const userSearchInput = document.getElementById('userSearchInput');
    const cancelGroupCreate = document.getElementById('cancelGroupCreate');
    const confirmGroupCreate = document.getElementById('confirmGroupCreate');

    // Кнопка "Новый чат"
    if (newChatBtn) {
        newChatBtn.addEventListener('click', function() {
            showUserSearch();
        });
    }

    // Кнопка "Создать группу"
    if (createGroupBtn) {
        createGroupBtn.addEventListener('click', function() {
            showGroupCreation();
        });
    }

    // Закрытие поиска пользователей
    if (closeUserSearch) {
        closeUserSearch.addEventListener('click', function() {
            hideUserSearch();
        });
    }

    // Поиск пользователей
    if (userSearchInput) {
        userSearchInput.addEventListener('input', function(e) {
            searchUsersForChat(e.target.value);
        });
    }

    // Отмена создания группы
    if (cancelGroupCreate) {
        cancelGroupCreate.addEventListener('click', function() {
            hideGroupCreation();
        });
    }

    // Подтверждение создания группы
    if (confirmGroupCreate) {
        confirmGroupCreate.addEventListener('click', function() {
            createNewGroup();
        });
    }
}

function showUserSearch() {
    const userSearchContainer = document.getElementById('userSearchContainer');
    const userSearchInput = document.getElementById('userSearchInput');
    
    if (userSearchContainer && userSearchInput) {
        userSearchContainer.style.display = 'block';
        userSearchInput.focus();
        hideGroupCreation(); // Скрываем создание группы если открыто
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
        hideUserSearch(); // Скрываем поиск пользователей если открыт
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

    // Фильтруем текущего пользователя
    const filteredUsers = users.filter(user => user.id !== currentUser.id);

    filteredUsers.forEach(user => {
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
            startNewChat(user);
        });
        
        userSearchResults.appendChild(userElement);
    });
}

function startNewChat(user) {
    // Создаем объект чата
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
    
    // Выбираем этот чат
    selectChat(chat);
    
    // Скрываем поиск
    hideUserSearch();
    
    // Показываем уведомление
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

    // Фильтруем текущего пользователя
    const filteredUsers = users.filter(user => user.id !== currentUser.id);

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
        const user = allUsers.find(u => u.id === userId);
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
                // Снимаем галочку в основном списке
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
    // Снимаем все галочки
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
                members: Array.from(selectedMembers)
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Группа "${groupName}" создана!`, 'success');
            hideGroupCreation();
            
            // Создаем объект чата для группы
            const groupChat = {
                id: data.group.id,
                displayName: data.group.name,
                avatar: data.group.avatar,
                isGroup: true,
                memberCount: data.group.members.length + 1, // +1 для создателя
                lastMessage: null,
                unreadCount: 0
            };
            
            // Выбираем созданную группу
            selectChat(groupChat);
            
            // Обновляем список чатов
            loadChats();
        } else {
            showNotification('Ошибка создания группы: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка создания группы:', error);
        showNotification('Ошибка создания группы', 'error');
    }
}

// Инициализация чата
function initializeChat() {
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

    // Кнопки загрузки файлов
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

    // Отправка файла
    if (sendFileBtn) {
        sendFileBtn.addEventListener('click', function() {
            if (currentFileData) {
                sendMessage();
            } else {
                showNotification('Выберите файл для отправки', 'warning');
            }
        });
    }

    // Закрытие модального окна загрузки файла
    if (closeUploadFile) {
        closeUploadFile.addEventListener('click', function() {
            const uploadFileModal = document.getElementById('uploadFileModal');
            if (uploadFileModal) uploadFileModal.style.display = 'none';
            currentFileData = null;
            currentFileType = null;
        });
    }

    if (cancelUploadFile) {
        cancelUploadFile.addEventListener('click', function() {
            const uploadFileModal = document.getElementById('uploadFileModal');
            if (uploadFileModal) uploadFileModal.style.display = 'none';
            currentFileData = null;
            currentFileType = null;
        });
    }
    
    // Инициализация действий чата
    initializeChatActions();
    
    // Загружаем чаты при инициализации
    loadChats();
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initializeChat();
});
