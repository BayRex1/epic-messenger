class ChatManager {
    constructor() {
        this.currentChat = null;
        this.chats = [];
    }

    async loadChats() {
        try {
            const response = await fetch('/api/chats', {
                headers: {
                    'Authorization': `Bearer ${app.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.chats = data.chats;
                    this.renderChats();
                }
            }
        } catch (error) {
            console.error('Error loading chats:', error);
        }
    }

    renderChats() {
        const chatsContainer = document.getElementById('chatsContainer');
        if (!chatsContainer) return;

        if (this.chats.length === 0) {
            chatsContainer.innerHTML = '<div class="empty-state">Нет чатов</div>';
            return;
        }

        chatsContainer.innerHTML = this.chats.map(chat => `
            <div class="chat-item" data-chat-id="${chat.id}" onclick="chatManager.openChat('${chat.id}')">
                <img src="${chat.otherUser.avatar || '/assets/profile.svg'}" alt="Avatar" class="user-avatar">
                <div class="chat-info">
                    <div class="chat-header">
                        <span class="display-name">${chat.otherUser.displayName}</span>
                        ${chat.otherUser.isVerified ? '<span class="verified-badge">✓</span>' : ''}
                        <span class="chat-time">${app.formatTime(chat.lastMessage?.createdAt)}</span>
                    </div>
                    <div class="last-message">
                        ${chat.lastMessage ? this.formatMessagePreview(chat.lastMessage) : 'Нет сообщений'}
                    </div>
                </div>
                ${chat.unreadCount > 0 ? `<span class="unread-count">${chat.unreadCount}</span>` : ''}
            </div>
        `).join('');
    }

    async openChat(chatId) {
        this.currentChat = this.chats.find(chat => chat.id === chatId);
        if (!this.currentChat) return;

        // Показать чат
        document.getElementById('chatsList').style.display = 'none';
        document.getElementById('chatArea').style.display = 'block';

        // Загрузить сообщения
        await this.loadMessages(chatId);
    }

    async loadMessages(chatId) {
        try {
            const response = await fetch(`/api/chats/${chatId}/messages`, {
                headers: {
                    'Authorization': `Bearer ${app.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.renderMessages(data.messages);
                }
            }
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    }

    renderMessages(messages) {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;

        messagesContainer.innerHTML = messages.map(message => `
            <div class="message ${message.senderId === app.currentUser.id ? 'outgoing' : 'incoming'}">
                <div class="message-content">
                    ${message.text ? `<div class="message-text">${message.text}</div>` : ''}
                    ${message.media ? this.renderMessageMedia(message.media) : ''}
                    <div class="message-time">${app.formatTime(message.createdAt)}</div>
                </div>
            </div>
        `).join('');

        // Прокрутка вниз
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async sendMessage(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const text = formData.get('message');
        const file = formData.get('file');

        if (!text && !file) return;

        try {
            const messageData = new FormData();
            if (text) messageData.append('text', text);
            if (file) messageData.append('file', file);
            if (this.currentChat) messageData.append('chatId', this.currentChat.id);

            const response = await fetch('/api/messages/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${app.token}`
                },
                body: messageData
            });

            const data = await response.json();

            if (data.success) {
                e.target.reset();
                await this.loadMessages(this.currentChat.id);
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }

    renderMessageMedia(media) {
        switch (media.type) {
            case 'image':
                return `<img src="${media.url}" alt="Image" class="message-media">`;
            case 'video':
                return `<video controls class="message-media"><source src="${media.url}"></video>`;
            case 'audio':
                return `<audio controls class="message-media"><source src="${media.url}"></audio>`;
            default:
                return `<a href="${media.url}" download class="file-message">Файл: ${media.originalName}</a>`;
        }
    }

    formatMessagePreview(message) {
        switch (message.type) {
            case 'image':
                return '📷 Изображение';
            case 'video':
                return '🎥 Видео';
            case 'audio':
                return '🎵 Аудио';
            default:
                return message.text.length > 50 ? message.text.substring(0, 50) + '...' : message.text;
        }
    }

    handleNewMessage(message) {
        if (this.currentChat && message.chatId === this.currentChat.id) {
            this.loadMessages(this.currentChat.id);
        } else {
            // Обновить список чатов
            this.loadChats();
        }
    }
}

const chatManager = new ChatManager();
