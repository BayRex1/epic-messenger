[file name]: chat.js
[file content begin]
// Функции для работы с чатом

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
                    ${chat.verified ? '<span class="verified-badge"><svg width="16" height="16" viewBox="0 0 256 256"><path d="M128 10 L143 33 L170 25 L180 50 L207 45 L210 70 L235 80 L225 105 L245 125 L225 145 L235 170 L210 180 L207 205 L180 200 L170 225 L143 217 L128 240 L113 217 L86 225 L76 200 L49 205 L46 180 L21 170 L31 145 L11 125 L31 105 L21 80 L46 70 L49 45 L76 50 L86 25 L113 33 Z" fill="url(#goldGradient)"/><path d="M95 125 L120 150 L165 100" fill="none" stroke="#fff7c0" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><defs><radialGradient id="goldGradient" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="#FFD700"/><stop offset="40%" stop-color="#FFC300"/><stop offset="100%" stop-color="#B8860B"/></radialGradient></defs></svg></span>' : ''}
                    ${chat.isDeveloper ? '<span class="developer-badge"><svg width="16" height="16" viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="url(#grad)"/><text x="24" y="30" text-anchor="middle" fill="url(#neon)" font-size="26" font-family="Arial, sans-serif" font-weight="bold" style="filter: drop-shadow(0 0 4px #C71585) drop-shadow(0 0 6px #8A2BE2);">E</text><defs><linearGradient id="grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="#8A2BE2"/><stop offset="1" stop-color="#C71585"/></linearGradient><linearGradient id="neon" x1="0" y1="0" x2="0" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFD1FF"/></linearGradient></defs></svg></span>' : ''}
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
        currentChatStatus.textContent = chat.status === 'online' ? 'В сети' : `Был(а) в сети ${new Date(chat.lastSeen).toLocaleString()}`;
    }
    
    if (currentChatAvatar) {
        if (chat.avatar) {
            currentChatAvatar.innerHTML = `<img src="${chat.avatar}" alt="${chat.displayName}" style="width: 100%; height: 100%; object-fit: cover;">`;
        } else {
            currentChatAvatar.textContent = chat.displayName ? chat.displayName.charAt(0).toUpperCase() : 'U';
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
    
    // Загружаем чаты при инициализации
    loadChats();
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initializeChat();
});
[file content end]
