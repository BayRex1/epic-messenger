// Функции для работы с чатом

// Глобальные переменные
let currentChat = null;
let currentFileData = null;
let currentFileType = null;
let socket = null;
let currentUser = null;
let emojiList = [
    { name: 'smile', url: '/emoji/smile.png' },
    { name: 'heart', url: '/emoji/heart.png' },
    { name: 'like', url: '/emoji/like.png' }
];

// Инициализация текущего пользователя
function initializeCurrentUser() {
    const userData = localStorage.getItem('userData');
    if (userData) {
        try {
            currentUser = JSON.parse(userData);
        } catch (error) {
            console.error('Ошибка парсинга userData:', error);
            redirectToLogin();
        }
    } else {
        console.error('Данные пользователя не найдены');
        redirectToLogin();
    }
}

function redirectToLogin() {
    window.location.href = '/login';
}

// Инициализация WebSocket
function initializeWebSocket() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        console.error('Токен авторизации не найден');
        return;
    }

    try {
        // Замените на ваш WebSocket URL
        const wsUrl = `wss://your-websocket-url?token=${token}`;
        socket = new WebSocket(wsUrl);

        socket.onopen = function() {
            console.log('WebSocket соединение установлено');
        };

        socket.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (error) {
                console.error('Ошибка обработки WebSocket сообщения:', error);
            }
        };

        socket.onclose = function() {
            console.log('WebSocket соединение закрыто');
            // Попытка переподключения через 5 секунд
            setTimeout(initializeWebSocket, 5000);
        };

        socket.onerror = function(error) {
            console.error('WebSocket ошибка:', error);
        };
    } catch (error) {
        console.error('Ошибка инициализации WebSocket:', error);
    }
}

function handleWebSocketMessage(data) {
    switch(data.type) {
        case 'new_message':
            if (currentChat && data.message.senderId === currentChat.id) {
                renderNewMessage(data.message);
                // Прокрутить к новому сообщению
                const chatMessages = document.getElementById('chatMessages');
                if (chatMessages) {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            }
            // Обновить список чатов
            loadChats();
            break;
            
        case 'message_read':
            // Обновить статус прочтения сообщений
            updateMessageReadStatus(data.fromUserId);
            break;
            
        case 'user_status':
            // Обновить статус пользователя
            updateUserStatus(data.userId, data.status);
            break;
    }
}

function updateMessageReadStatus(fromUserId) {
    if (currentChat && currentChat.id === fromUserId) {
        const messages = document.querySelectorAll('.message.outgoing .read-status');
        messages.forEach(msg => {
            msg.classList.remove('unread');
            msg.classList.add('read');
            msg.innerHTML = '✓✓';
        });
    }
}

function updateUserStatus(userId, status) {
    // Обновить статус в списке чатов
    const chatItem = document.querySelector(`.chat-item[data-user-id="${userId}"]`);
    if (chatItem) {
        const statusElement = chatItem.querySelector('.online-status, .offline-status');
        if (statusElement) {
            statusElement.className = status === 'online' ? 'online-status' : 'offline-status';
        }
    }
    
    // Обновить статус в текущем чате
    if (currentChat && currentChat.id === userId) {
        const currentChatStatus = document.getElementById('currentChatStatus');
        if (currentChatStatus) {
            currentChatStatus.textContent = status === 'online' ? 'В сети' : 'Не в сети';
        }
    }
}

async function loadChats() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            redirectToLogin();
            return;
        }

        const response = await fetch('/api/chats', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            renderChats(data.chats);
        } else {
            showNotification('Ошибка загрузки чатов: ' + (data.message || 'Неизвестная ошибка'), 'error');
        }
    } catch (error) {
        console.error('Ошибка загрузки чатов:', error);
        showNotification('Ошибка загрузки чатов', 'error');
    }
}

function renderChats(chats) {
    const chatsList = document.getElementById('chatsList');
    if (!chatsList) return;
    
    chatsList.innerHTML = '';
    
    if (!chats || chats.length === 0) {
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
        
        chatElement.innerHTML = `
            <div class="chat-avatar">
                ${chat.avatar ? 
                    `<img src="${chat.avatar}" alt="${chat.displayName}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                    chat.displayName ? chat.displayName.charAt(0).toUpperCase() : 'U'
                }
            </div>
            <div class="chat-info">
                <h4>
                    ${chat.displayName || 'Пользователь'}
                    ${chat.verified ? '<span class="verified-badge">✓</span>' : ''}
                    ${chat.isDeveloper ? '<span class="developer-badge">👑</span>' : ''}
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
        currentChatStatus.textContent = chat.status === 'online' ? 'В сети' : `Был(а) в сети ${formatLastSeen(chat.lastSeen)}`;
    }
    
    if (currentChatAvatar) {
        currentChatAvatar.innerHTML = '';
        if (chat.avatar) {
            const img = document.createElement('img');
            img.src = chat.avatar;
            img.alt = chat.displayName;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            currentChatAvatar.appendChild(img);
        } else {
            currentChatAvatar.textContent = chat.displayName ? chat.displayName.charAt(0).toUpperCase() : 'U';
        }
    }
    
    // Загружаем сообщения
    loadChatMessages(chat.id);
    
    // Обновляем список чатов (убираем badge)
    loadChats();
}

function formatLastSeen(lastSeen) {
    if (!lastSeen) return 'неизвестно';
    
    const lastSeenDate = new Date(lastSeen);
    const now = new Date();
    const diffMs = now - lastSeenDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'только что';
    if (diffMins < 60) return `${diffMins} мин. назад`;
    if (diffHours < 24) return `${diffHours} ч. назад`;
    if (diffDays < 7) return `${diffDays} дн. назад`;
    
    return lastSeenDate.toLocaleDateString();
}

async function markAsRead(fromUserId) {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        const response = await fetch('/api/messages/mark-read', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                fromUserId: fromUserId
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

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
        if (!token || !currentUser) return;

        const response = await fetch(`/api/messages?userId=${currentUser.id}&toUserId=${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            renderChatMessages(data.messages);
        } else {
            console.error('Ошибка загрузки сообщений:', data.message);
        }
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
        showNotification('Ошибка загрузки сообщений', 'error');
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
    
    if (message.type === 'gift') {
        messageElement.innerHTML = `
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
                    <div class="message-time">${formatMessageTime(message.timestamp)}</div>
                </div>
            </div>
            ${readStatus}
        `;
    } else if (message.file) {
        let fileContent = '';
        if (message.fileType === 'image') {
            fileContent = `<img src="${message.file}" alt="Изображение" onclick="openImageModal('${message.file}')" style="max-width: 300px; cursor: pointer;">`;
        } else if (message.fileType === 'video') {
            fileContent = `<video controls style="max-width: 300px;"><source src="${message.file}" type="video/mp4"></video>`;
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
            fileContent = `<div class="file-download"><a href="${message.file}" download="${message.fileName || 'file'}">📎 ${message.fileName || 'Скачать файл'}</a></div>`;
        }
        
        messageElement.innerHTML = `
            <div class="message-file">
                ${message.text ? `<div class="message-text">${message.text}</div>` : ''}
                <div class="message-file-content">
                    ${fileContent}
                </div>
                <div class="message-time">${formatMessageTime(message.timestamp)}</div>
            </div>
            ${readStatus}
        `;
    } else {
        // Заменяем эмодзи коды на изображения и обрабатываем упоминания
        let messageText = message.text || '';
        messageText = processMentions(messageText);
        messageText = processEmojis(messageText);
        
        messageElement.innerHTML = `
            <div class="message-text">${messageText}</div>
            <div class="message-time">${formatMessageTime(message.timestamp)}</div>
            ${readStatus}
        `;
    }
    
    chatMessages.appendChild(messageElement);
    
    // Прокручиваем вниз
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
        return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } else {
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + 
               date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
}

function processMentions(text) {
    // Простая обработка упоминаний @username
    return text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
}

function processEmojis(text) {
    emojiList.forEach(emoji => {
        const emojiCode = `:${emoji.name}:`;
        if (text.includes(emojiCode)) {
            text = text.replace(new RegExp(emojiCode, 'g'), 
                `<img src="${emoji.url}" alt="${emoji.name}" class="emoji">`);
        }
    });
    return text;
}

function openImageModal(imageUrl) {
    // Создаем модальное окно для просмотра изображения
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;
    
    modal.innerHTML = `
        <div style="position: relative;">
            <img src="${imageUrl}" style="max-width: 90vw; max-height: 90vh;">
            <button onclick="this.parentElement.parentElement.remove()" style="
                position: absolute;
                top: -40px;
                right: 0;
                background: none;
                border: none;
                color: white;
                font-size: 30px;
                cursor: pointer;
            ">&times;</button>
        </div>
    `;
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    document.body.appendChild(modal);
}

async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    if (!messageInput) return;
    
    const text = messageInput.value.trim();
    
    if (!text && !currentFileData) {
        showNotification('Введите сообщение или выберите файл', 'warning');
        return;
    }
    
    if (!currentChat) {
        showNotification('Выберите чат для отправки сообщения', 'warning');
        return;
    }
    
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            redirectToLogin();
            return;
        }
        
        let requestData = {
            toUserId: currentChat.id,
            text: text,
            type: 'text'
        };

        // Если есть файл, добавляем его в запрос
        if (currentFileData) {
            const fileType = currentFileType || 'file';
            requestData.file = currentFileData;
            requestData.fileName = document.getElementById('fileInput')?.files[0]?.name || 'file';
            requestData.fileType = fileType;
            requestData.type = fileType;
        }

        // Отключаем кнопку отправки
        const sendBtn = document.getElementById('sendMessageBtn');
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.textContent = 'Отправка...';
        }

        const response = await fetch('/api/messages/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Восстанавливаем кнопку отправки
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Отправить';
        }
        
        if (data.success) {
            messageInput.value = '';
            resetFileUpload();
            
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
        
        // Восстанавливаем кнопку отправки при ошибке
        const sendBtn = document.getElementById('sendMessageBtn');
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Отправить';
        }
    }
}

function resetFileUpload() {
    currentFileData = null;
    currentFileType = null;
    const filePreview = document.getElementById('filePreview');
    if (filePreview) filePreview.innerHTML = '';
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
    const uploadFileModal = document.getElementById('uploadFileModal');
    if (uploadFileModal) uploadFileModal.style.display = 'none';
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
        default:
            typeText = 'файл';
            document.getElementById('fileInput').accept = '*/*';
    }
    
    title.textContent = `Загрузить ${typeText}`;
    const fileUploadArea = document.getElementById('fileUploadArea');
    if (fileUploadArea) {
        const div = fileUploadArea.querySelector('div');
        if (div) {
            div.textContent = `Перетащите сюда ${typeText} или нажмите для выбора`;
        }
    }
    
    modal.style.display = 'flex';
}

function initializeFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const fileUploadArea = document.getElementById('fileUploadArea');
    
    if (!fileInput || !fileUploadArea) return;

    // Клик по области загрузки
    fileUploadArea.addEventListener('click', () => {
        fileInput.click();
    });
    
    // Drag and drop
    fileUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUploadArea.classList.add('dragover');
    });
    
    fileUploadArea.addEventListener('dragleave', () => {
        fileUploadArea.classList.remove('dragover');
    });
    
    fileUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });
    
    // Выбор файла через input
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
}

function handleFileSelect(file) {
    if (!file) return;
    
    // Проверка размера файла (максимум 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        showNotification('Файл слишком большой. Максимальный размер: 10MB', 'error');
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
        currentFileData = e.target.result;
        showFilePreview(file);
    };
    
    reader.onerror = () => {
        showNotification('Ошибка чтения файла', 'error');
    };
    
    reader.readAsDataURL(file);
}

function showFilePreview(file) {
    const filePreview = document.getElementById('filePreview');
    if (!filePreview) return;
    
    if (currentFileType === 'image') {
        filePreview.innerHTML = `
            <div style="text-align: center;">
                <img src="${currentFileData}" style="max-width: 200px; max-height: 200px; border-radius: 8px;">
                <div style="margin-top: 8px; font-size: 14px; color: #666;">${file.name}</div>
            </div>
        `;
    } else {
        filePreview.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 48px;">📎</div>
                <div style="margin-top: 8px; font-size: 14px; color: #666;">${file.name}</div>
                <div style="font-size: 12px; color: #999;">${formatFileSize(file.size)}</div>
            </div>
        `;
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showNotification(message, type = 'info') {
    // Используем функцию из common.js или создаем простую реализацию
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type);
    } else {
        // Простая реализация уведомления
        console.log(`[${type.toUpperCase()}] ${message}`);
        alert(message); // Временное решение
    }
}

// Инициализация чата
function initializeChat() {
    // Инициализируем пользователя
    initializeCurrentUser();
    
    // Инициализируем WebSocket
    initializeWebSocket();
    
    // Инициализируем загрузку файлов
    initializeFileUpload();
    
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
        
        // Авто-высота текстового поля
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
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
            resetFileUpload();
        });
    }

    if (cancelUploadFile) {
        cancelUploadFile.addEventListener('click', function() {
            resetFileUpload();
        });
    }
    
    // Закрытие модального окна по клику вне его
    const uploadFileModal = document.getElementById('uploadFileModal');
    if (uploadFileModal) {
        uploadFileModal.addEventListener('click', function(e) {
            if (e.target === this) {
                resetFileUpload();
            }
        });
    }
    
    // Загружаем чаты при инициализации
    loadChats();
    
    // Периодическое обновление статусов (каждые 30 секунд)
    setInterval(loadChats, 30000);
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initializeChat();
});

// Очистка при закрытии страницы
window.addEventListener('beforeunload', function() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
    }
});
