class MessagesManager {
    constructor(server) {
        this.server = server;
    }

    handleGetChats(token) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const chatUserIds = new Set();
        this.server.messages.forEach(msg => {
            if (msg.senderId === user.id) {
                chatUserIds.add(msg.toUserId);
            } else if (msg.toUserId === user.id) {
                chatUserIds.add(msg.senderId);
            }
        });

        const chatUsers = this.server.users
            .filter(u => u.id !== user.id && chatUserIds.has(u.id))
            .map(u => ({
                ...this.server.auth.getSafeUserData(u),
                lastMessage: this.getLastMessage(user.id, u.id),
                unreadCount: this.getUnreadCount(user.id, u.id)
            }));

        chatUsers.sort((a, b) => {
            const timeA = a.lastMessage ? new Date(a.lastMessage.timestamp) : new Date(0);
            const timeB = b.lastMessage ? new Date(b.lastMessage.timestamp) : new Date(0);
            return timeB - timeA;
        });

        return {
            success: true,
            chats: chatUsers
        };
    }

    getLastMessage(userId1, userId2) {
        const messages = this.server.messages.filter(msg => 
            (msg.senderId === userId1 && msg.toUserId === userId2) ||
            (msg.senderId === userId2 && msg.toUserId === userId1)
        );
        
        if (messages.length === 0) return null;
        
        return messages.reduce((latest, current) => 
            new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest
        );
    }

    getUnreadCount(userId, otherUserId) {
        return this.server.messages.filter(msg => 
            msg.senderId === otherUserId && 
            msg.toUserId === userId && 
            !msg.read
        ).length;
    }

    handleGetMessages(token, query) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId, toUserId } = query;

        if (user.id !== userId && user.id !== toUserId) {
            this.server.security.logSecurityEvent(user, 'GET_MESSAGES', `chat:${userId}-${toUserId}`, false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const chatMessages = this.server.messages.filter(msg => 
            (msg.senderId === userId && msg.toUserId === toUserId) ||
            (msg.senderId === toUserId && msg.toUserId === userId)
        );

        const decryptedMessages = chatMessages.map(msg => ({
            ...msg,
            text: msg.encrypted ? this.server.security.decrypt(msg.text, this.server.encryptionKey) : msg.text
        }));

        decryptedMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        this.server.security.logSecurityEvent(user, 'GET_MESSAGES', `chat:${userId}-${toUserId}`);

        return {
            success: true,
            messages: decryptedMessages
        };
    }

    handleSendMessage(token, data) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.server.security.logSecurityEvent(user, 'SEND_MESSAGE', `to:${data.toUserId}`, false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { toUserId, text, type, image, file, fileName, fileType } = data;

        if ((!text || text.trim() === '') && !file && !image) {
            return { success: false, message: 'Сообщение не может быть пустым' };
        }

        const recipient = this.server.users.find(u => u.id === toUserId);
        if (!recipient) {
            this.server.security.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}`, false);
            return { success: false, message: 'Получатель не найден' };
        }

        if (recipient.banned) {
            this.server.security.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}`, false);
            return { success: false, message: 'Нельзя отправлять сообщения заблокированным пользователям' };
        }

        let sanitizedText = '';
        if (text && text.trim() !== '') {
            sanitizedText = this.server.security.sanitizeContent(text.trim());
            if (sanitizedText.length === 0 && !file && !image) {
                this.server.security.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}`, false);
                return { success: false, message: 'Сообщение содержит запрещенный контент' };
            }
        }

        const encryptedText = text ? this.server.security.encrypt(sanitizedText, this.server.encryptionKey) : '';

        const message = {
            id: this.server.generateId(),
            senderId: user.id,
            toUserId: toUserId,
            text: encryptedText,
            encrypted: !!text,
            type: type || (file ? 'file' : 'text'),
            image: image || null,
            file: file || null,
            fileName: fileName || null,
            fileType: fileType || null,
            timestamp: new Date(),
            displayName: user.displayName,
            read: false
        };

        this.server.messages.push(message);
        this.server.saveData();

        this.server.security.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}, chars:${sanitizedText.length}`);

        console.log(`💬 Новое сообщение от ${user.displayName} к пользователю ${toUserId}`);

        return {
            success: true,
            message: {
                ...message,
                text: sanitizedText
            }
        };
    }

    handleEditMessage(token, data) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.server.security.logSecurityEvent(user, 'EDIT_MESSAGE', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { messageId, newText } = data;
        
        if (!messageId || !newText || newText.trim() === '') {
            return { success: false, message: 'ID сообщения и новый текст обязательны' };
        }

        if (!this.server.security.validateInput(newText, 'text')) {
            return { success: false, message: 'Некорректный текст сообщения' };
        }

        const message = this.server.messages.find(msg => msg.id === messageId);
        if (!message) {
            return { success: false, message: 'Сообщение не найдено' };
        }

        if (message.senderId !== user.id) {
            this.server.security.logSecurityEvent(user, 'EDIT_MESSAGE', `message:${messageId}`, false);
            return { success: false, message: 'Вы можете редактировать только свои сообщения' };
        }

        const messageAge = Date.now() - new Date(message.timestamp).getTime();
        const maxEditTime = 15 * 60 * 1000;
        
        if (messageAge > maxEditTime) {
            return { success: false, message: 'Сообщение можно редактировать только в течение 15 минут после отправки' };
        }

        const sanitizedText = this.server.security.sanitizeContent(newText.trim());
        if (sanitizedText.length === 0) {
            return { success: false, message: 'Текст сообщения содержит запрещенный контент' };
        }

        if (!message.editHistory) {
            message.editHistory = [];
        }
        
        message.editHistory.push({
            oldText: message.encrypted ? this.server.security.decrypt(message.text, this.server.encryptionKey) : message.text,
            editedAt: new Date(),
            editedBy: user.id
        });

        message.text = this.server.security.encrypt(sanitizedText, this.server.encryptionKey);
        message.edited = true;
        message.editedAt = new Date();

        this.server.saveData();

        this.server.security.logSecurityEvent(user, 'EDIT_MESSAGE', `message:${messageId}, chars:${sanitizedText.length}`);

        console.log(`✏️ Пользователь ${user.displayName} отредактировал сообщение: ${messageId}`);

        return {
            success: true,
            message: {
                ...message,
                text: sanitizedText
            }
        };
    }

    handleDeleteMessage(token, data) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { messageId } = data;
        
        if (!messageId) {
            return { success: false, message: 'ID сообщения обязателен' };
        }

        const messageIndex = this.server.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) {
            return { success: false, message: 'Сообщение не найдено' };
        }

        const message = this.server.messages[messageIndex];
        
        if (message.senderId !== user.id && !this.server.auth.isAdmin(user)) {
            this.server.security.logSecurityEvent(user, 'DELETE_MESSAGE', `message:${messageId}`, false);
            return { success: false, message: 'Вы можете удалять только свои сообщения' };
        }

        if (message.senderId === user.id && !this.server.auth.isAdmin(user)) {
            const messageAge = Date.now() - new Date(message.timestamp).getTime();
            const maxDeleteTime = 15 * 60 * 1000;
            
            if (messageAge > maxDeleteTime) {
                return { success: false, message: 'Сообщение можно удалить только в течение 15 минут после отправки' };
            }
        }

        this.server.messages.splice(messageIndex, 1);
        this.server.saveData();

        this.server.security.logSecurityEvent(user, 'DELETE_MESSAGE', `message:${messageId}`);

        console.log(`🗑️ Пользователь ${user.displayName} удалил сообщение: ${messageId}`);

        return {
            success: true,
            message: 'Сообщение успешно удалено'
        };
    }

    handleMarkAsRead(token, data) {
        const user = this.server.auth.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { fromUserId } = data;
        
        this.server.messages.forEach(msg => {
            if (msg.senderId === fromUserId && msg.toUserId === user.id && !msg.read) {
                msg.read = true;
            }
        });
        
        this.server.saveData();
        
        return {
            success: true,
            message: 'Сообщения отмечены как прочитанные'
        };
    }
}

module.exports = MessagesManager;
