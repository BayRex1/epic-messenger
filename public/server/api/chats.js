const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class ChatsHandler {
    constructor(dataManager, securitySystem, fileHandlers, authHandler) {
        this.dataManager = dataManager;
        this.securitySystem = securitySystem;
        this.fileHandlers = fileHandlers;
        this.authHandler = authHandler;
    }

    authenticateToken(token) {
        return this.authHandler?.authenticateToken(token) || null;
    }

    // ============================================
    // === ПОЛУЧЕНИЕ ЧАТОВ (С УДАЛЕНИЕМ ДУБЛИКАТОВ) ===
    // ============================================

    handleGetChats(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        try {
            // ============================================
            // === УДАЛЕНИЕ ДУБЛИКАТОВ ЧАТОВ ===
            // ============================================
            const uniqueChats = [];
            const seen = new Set();
            
            for (const chat of this.dataManager.chats) {
                let key;
                if (!chat.isGroup) {
                    const members = chat.members ? [...chat.members].sort() : [];
                    key = members.join('-');
                } else {
                    key = chat.id;
                }
                
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueChats.push(chat);
                } else {
                    console.log(`🗑️ Удаляем дубликат чата: ${chat.id}`);
                }
            }
            
            if (uniqueChats.length !== this.dataManager.chats.length) {
                this.dataManager.chats = uniqueChats;
                this.dataManager.saveData();
                console.log(`🧹 Очищено дублирующихся чатов`);
            }
            
            // ============================================
            // === ДАЛЬШЕ ОБЫЧНАЯ ЛОГИКА ===
            // ============================================
            let chats = this.dataManager.chats || [];
            
            const userChats = chats.filter(chat => 
                chat.members && chat.members.includes(user.id)
            );

            const chatsWithInfo = userChats.map(chat => {
                let result = {
                    id: chat.id,
                    userId: null,
                    displayName: 'Пользователь',
                    avatar: '',
                    verified: false,
                    isDeveloper: false,
                    status: 'offline',
                    lastSeen: null,
                    isGroup: chat.isGroup || false,
                    unreadCount: 0,
                    lastMessage: null,
                    createdAt: chat.createdAt || new Date()
                };

                if (!chat.isGroup && chat.members) {
                    const otherId = chat.members.find(id => id !== user.id);
                    if (otherId) {
                        const otherUser = this.dataManager.users.find(u => u.id === otherId);
                        if (otherUser) {
                            result.userId = otherId;
                            result.displayName = otherUser.displayName || otherUser.username || 'Пользователь';
                            result.avatar = otherUser.avatar || '';
                            result.verified = otherUser.verified || false;
                            result.isDeveloper = otherUser.isDeveloper || false;
                            result.status = otherUser.status || 'offline';
                            result.lastSeen = otherUser.lastSeen || null;
                        }
                    }
                } else if (chat.isGroup) {
                    result.userId = chat.id;
                    result.displayName = chat.displayName || 'Группа';
                    result.avatar = chat.avatar || '';
                }
                
                const messages = this.dataManager.messages.filter(m => 
                    m.chatId === chat.id
                ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                result.lastMessage = messages[0] || null;
                result.unreadCount = messages.filter(m => 
                    m.senderId !== user.id && !m.read
                ).length;
                
                return result;
            });

            chatsWithInfo.sort((a, b) => {
                const dateA = a.lastMessage ? new Date(a.lastMessage.timestamp) : new Date(0);
                const dateB = b.lastMessage ? new Date(b.lastMessage.timestamp) : new Date(0);
                return dateB - dateA;
            });

            console.log(`👥 Загружено чатов для ${user.username}: ${chatsWithInfo.length}`);
            return { success: true, chats: chatsWithInfo };
        } catch (error) {
            console.error('❌ Ошибка получения чатов:', error);
            return { success: false, message: 'Ошибка получения чатов' };
        }
    }

    // ============================================
    // === НАЧАТЬ ЧАТ ===
    // ============================================

    handleStartChat(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId } = data;
        if (!userId) {
            return { success: false, message: 'User ID не указан' };
        }

        let targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            targetUser = this.createTempUser(userId);
            console.log(`👤 Создан временный пользователь: ${targetUser.id} (${targetUser.username})`);
        }

        // Проверяем существующий чат
        let existingChat = this.dataManager.chats.find(chat => 
            !chat.isGroup && 
            chat.members && 
            chat.members.includes(user.id) && 
            chat.members.includes(userId)
        );

        if (existingChat) {
            return {
                success: true,
                chatId: existingChat.id,
                chat: existingChat,
                user: {
                    id: targetUser.id,
                    displayName: targetUser.displayName,
                    avatar: targetUser.avatar,
                    verified: targetUser.verified,
                    isDeveloper: targetUser.isDeveloper,
                    status: targetUser.status
                }
            };
        }

        const newChat = {
            id: this.dataManager.generateId(),
            isGroup: false,
            userId: user.id,
            targetUserId: userId,
            displayName: targetUser.displayName || targetUser.username || 'Пользователь',
            avatar: targetUser.avatar || '',
            verified: targetUser.verified || false,
            isDeveloper: targetUser.isDeveloper || false,
            status: targetUser.status || 'offline',
            members: [user.id, userId],
            createdAt: new Date(),
            lastMessage: null,
            unreadCount: 0
        };

        this.dataManager.chats.push(newChat);
        this.dataManager.saveData();

        console.log(`💬 Создан новый чат между ${user.displayName} и ${targetUser.displayName}`);

        return {
            success: true,
            chatId: newChat.id,
            chat: newChat,
            user: {
                id: targetUser.id,
                displayName: targetUser.displayName,
                avatar: targetUser.avatar,
                verified: targetUser.verified,
                isDeveloper: targetUser.isDeveloper,
                status: targetUser.status
            }
        };
    }

    // ============================================
    // === ОТПРАВКА СООБЩЕНИЯ ===
    // ============================================

    handleSendMessage(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { toUserId, text, type = 'text', file, fileName, fileType } = data;
        
        if (!toUserId) {
            return { success: false, message: 'Не указан получатель' };
        }

        if (!text && !file) {
            return { success: false, message: 'Сообщение не может быть пустым' };
        }

        try {
            let targetUser = this.dataManager.users.find(u => u.id === toUserId);
            if (!targetUser) {
                targetUser = this.createTempUser(toUserId);
                console.log(`👤 Создан временный пользователь для сообщения: ${targetUser.id} (${targetUser.username})`);
            }

            // Ищем существующий чат - сначала проверяем по участникам
            let chat = this.dataManager.chats.find(c => 
                !c.isGroup && 
                c.members && 
                c.members.includes(user.id) && 
                c.members.includes(toUserId)
            );

            // Если чат не найден по участникам, ищем по targetUserId
            if (!chat) {
                chat = this.dataManager.chats.find(c => 
                    !c.isGroup && 
                    c.targetUserId === toUserId && 
                    c.userId === user.id
                );
            }

            // Если всё равно не найден - создаем
            if (!chat) {
                chat = {
                    id: this.dataManager.generateId(),
                    isGroup: false,
                    userId: user.id,
                    targetUserId: toUserId,
                    displayName: targetUser.displayName || targetUser.username || 'Пользователь',
                    avatar: targetUser.avatar || '',
                    verified: targetUser.verified || false,
                    isDeveloper: targetUser.isDeveloper || false,
                    status: targetUser.status || 'offline',
                    members: [user.id, toUserId],
                    createdAt: new Date(),
                    lastMessage: null,
                    unreadCount: 0
                };
                this.dataManager.chats.push(chat);
                console.log(`💬 Автоматически создан чат между ${user.displayName} и ${targetUser.displayName}`);
            }

            let fileUrl = null;
            if (file && fileName && fileType) {
                const fileExt = path.extname(fileName) || this.getFileExtension(fileType);
                const uniqueFilename = `file_${user.id}_${Date.now()}${fileExt}`;
                let uploadDir = 'files';
                
                if (fileType === 'image') uploadDir = 'images';
                else if (fileType === 'video') uploadDir = 'videos';
                else if (fileType === 'audio') uploadDir = 'audio';
                
                const isProduction = process.env.NODE_ENV === 'production';
                const baseDir = isProduction ? '/tmp/uploads' : path.join(process.cwd(), 'public', 'uploads');
                const dir = path.join(baseDir, uploadDir);
                
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                
                const filePath = path.join(dir, uniqueFilename);
                const base64Data = file.replace(/^data:[^;]+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                fs.writeFileSync(filePath, buffer);
                fileUrl = `/uploads/${uploadDir}/${uniqueFilename}`;
            }

            const message = {
                id: this.dataManager.generateId(),
                chatId: chat.id,
                senderId: user.id,
                receiverId: toUserId,
                text: text ? this.securitySystem.sanitizeContent(text) : null,
                type: type,
                file: fileUrl,
                fileName: fileName,
                fileType: fileType,
                timestamp: new Date(),
                read: false,
                readBy: []
            };

            this.dataManager.messages.push(message);
            
            chat.lastMessage = message;
            chat.unreadCount = (chat.unreadCount || 0) + 1;
            
            this.dataManager.saveData();

            this.securitySystem.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}, type:${type}`);

            console.log(`💬 Пользователь ${user.displayName} отправил сообщение пользователю ${targetUser.displayName}`);

            return { 
                success: true, 
                message: message,
                chat: {
                    id: chat.id,
                    userId: toUserId,
                    displayName: targetUser.displayName || targetUser.username || 'Пользователь',
                    avatar: targetUser.avatar || '',
                    verified: targetUser.verified || false,
                    isDeveloper: targetUser.isDeveloper || false,
                    status: targetUser.status || 'offline',
                    unreadCount: chat.unreadCount
                }
            };
        } catch (error) {
            console.error('❌ Ошибка отправки сообщения:', error);
            return { success: false, message: 'Ошибка отправки сообщения: ' + error.message };
        }
    }

    // ============================================
    // === ПОЛУЧЕНИЕ СООБЩЕНИЙ ===
    // ============================================

    handleGetMessages(token, query) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId } = query;
        if (!userId) {
            return { success: false, message: 'Не указан получатель' };
        }

        try {
            const chat = this.dataManager.chats.find(c => 
                !c.isGroup && 
                c.members && 
                c.members.includes(user.id) && 
                c.members.includes(userId)
            );

            if (!chat) {
                return { success: false, message: 'Чат не найден' };
            }

            const messages = this.dataManager.messages
                .filter(m => m.chatId === chat.id)
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            messages.forEach(msg => {
                if (msg.senderId !== user.id && !msg.read) {
                    msg.read = true;
                }
            });
            this.dataManager.saveData();

            const messagesWithInfo = messages.map(msg => ({
                ...msg,
                isOutgoing: msg.senderId === user.id
            }));

            return { success: true, messages: messagesWithInfo };
        } catch (error) {
            console.error('❌ Ошибка получения сообщений:', error);
            return { success: false, message: 'Ошибка получения сообщений' };
        }
    }

    // ============================================
    // === ОТМЕТКА ПРОЧИТАННЫХ ===
    // ============================================

    handleMarkAsRead(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { fromUserId } = data;
        if (!fromUserId) {
            return { success: false, message: 'Не указан отправитель' };
        }

        try {
            const chat = this.dataManager.chats.find(c => 
                !c.isGroup && 
                c.members && 
                c.members.includes(user.id) && 
                c.members.includes(fromUserId)
            );

            if (chat) {
                this.dataManager.messages.forEach(message => {
                    if (message.chatId === chat.id && message.senderId === fromUserId && !message.read) {
                        message.read = true;
                    }
                });
                chat.unreadCount = 0;
                this.dataManager.saveData();
            }

            return { success: true, message: 'Сообщения помечены как прочитанные' };
        } catch (error) {
            console.error('❌ Ошибка отметки сообщений:', error);
            return { success: false, message: 'Ошибка отметки сообщений' };
        }
    }

    // ============================================
    // === РЕДАКТИРОВАНИЕ СООБЩЕНИЯ ===
    // ============================================

    handleEditMessage(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { messageId, newText } = data;
        if (!messageId || !newText) {
            return { success: false, message: 'Заполните все поля' };
        }

        const message = this.dataManager.messages.find(msg => msg.id === messageId);
        if (!message) {
            return { success: false, message: 'Сообщение не найдено' };
        }

        if (message.senderId !== user.id) {
            return { success: false, message: 'Нет прав для редактирования этого сообщения' };
        }

        message.text = newText;
        message.edited = true;
        this.dataManager.saveData();

        return { success: true, message: 'Сообщение отредактировано' };
    }

    // ============================================
    // === УДАЛЕНИЕ СООБЩЕНИЯ ===
    // ============================================

    handleDeleteMessage(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { messageId } = data;
        if (!messageId) {
            return { success: false, message: 'Message ID не указан' };
        }

        const messageIndex = this.dataManager.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) {
            return { success: false, message: 'Сообщение не найдено' };
        }

        const message = this.dataManager.messages[messageIndex];
        if (message.senderId !== user.id && !user.isDeveloper) {
            return { success: false, message: 'Нет прав для удаления этого сообщения' };
        }

        this.dataManager.messages.splice(messageIndex, 1);
        this.dataManager.saveData();

        return { success: true, message: 'Сообщение удалено' };
    }

    // ============================================
    // === ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ===
    // ============================================

    createTempUser(userId) {
        const username = 'user_' + userId.substring(0, 8);
        const user = {
            id: userId,
            username: username,
            displayName: 'Пользователь',
            email: username + '@temp.com',
            password: this.dataManager.encrypt('temp123'),
            avatar: '',
            cover: null,
            description: 'Временный пользователь',
            coins: 0,
            verified: false,
            isDeveloper: false,
            status: 'offline',
            lastSeen: new Date(),
            createdAt: new Date(),
            sessionId: null,
            gifts: [],
            isProtected: false,
            friendsCount: 0,
            postsCount: 0,
            giftsCount: 0,
            banned: false,
            followers: [],
            following: []
        };
        this.dataManager.users.push(user);
        this.dataManager.saveData();
        return user;
    }

    // ============================================
    // === ГРУППЫ ===
    // ============================================

    handleCreateGroup(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { name, username, members, description, isPrivate } = data;
        
        if (!name) {
            return { success: false, message: 'Неверные данные для создания группы' };
        }

        const validMembers = members ? members.filter(memberId => 
            this.dataManager.users.find(u => u.id === memberId)
        ) : [];

        if (username) {
            const existingGroup = this.dataManager.groups.find(g => g.username === username);
            if (existingGroup) {
                return { success: false, message: 'Группа с таким username уже существует' };
            }
        }

        const groupId = this.dataManager.generateId();
        const group = {
            id: groupId,
            name: this.securitySystem.sanitizeContent(name),
            username: username ? this.securitySystem.sanitizeContent(username) : null,
            description: description ? this.securitySystem.sanitizeContent(description) : '',
            creatorId: user.id,
            members: [user.id, ...validMembers],
            admins: [user.id],
            avatar: null,
            createdAt: new Date(),
            isActive: true,
            isPublic: !isPrivate,
            isPrivate: isPrivate || false,
            inviteLink: crypto.randomBytes(8).toString('hex')
        };

        this.dataManager.groups.push(group);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'CREATE_GROUP', `group:${name}, members:${validMembers.length}`);

        console.log(`👥 Пользователь ${user.displayName} создал группу: ${name} с ${validMembers.length} участниками`);

        return {
            success: true,
            group: group,
            message: 'Группа успешно создана'
        };
    }

    handleGetUserGroups(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const userGroups = this.dataManager.groups.filter(group => 
            group.members.includes(user.id)
        );

        return {
            success: true,
            groups: userGroups
        };
    }

    handleAddToGroup(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { groupId, userId } = data;
        const group = this.dataManager.groups.find(g => g.id === groupId);
        if (!group) {
            return { success: false, message: 'Группа не найдена' };
        }

        if (!group.admins.includes(user.id)) {
            this.securitySystem.logSecurityEvent(user, 'ADD_TO_GROUP', `group:${groupId}`, false);
            return { success: false, message: 'Недостаточно прав' };
        }

        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        if (group.members.includes(userId)) {
            return { success: false, message: 'Пользователь уже в группе' };
        }

        group.members.push(userId);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'ADD_TO_GROUP', `group:${groupId}, user:${userId}`);

        return {
            success: true,
            message: 'Пользователь добавлен в группу'
        };
    }

    handleJoinGroup(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { groupId, inviteLink } = data;
        if (!groupId && !inviteLink) {
            return { success: false, message: 'Укажите группу или пригласительную ссылку' };
        }

        let group;
        if (groupId) {
            group = this.dataManager.groups.find(g => g.id === groupId);
        } else {
            group = this.dataManager.groups.find(g => g.inviteLink === inviteLink);
        }

        if (!group) {
            return { success: false, message: 'Группа не найдена' };
        }

        if (group.members.includes(user.id)) {
            return { success: false, message: 'Вы уже в этой группе' };
        }

        if (group.isPrivate && !inviteLink) {
            return { success: false, message: 'Для вступления в приватную группу нужна пригласительная ссылка' };
        }

        group.members.push(user.id);
        this.dataManager.saveData();

        return { success: true, message: 'Вы присоединились к группе' };
    }

    handleLeaveGroup(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { groupId } = data;
        if (!groupId) {
            return { success: false, message: 'Group ID не указан' };
        }

        const group = this.dataManager.groups.find(g => g.id === groupId);
        if (!group) {
            return { success: false, message: 'Группа не найдена' };
        }

        const memberIndex = group.members.indexOf(user.id);
        if (memberIndex === -1) {
            return { success: false, message: 'Вы не состоите в этой группе' };
        }

        group.members.splice(memberIndex, 1);
        if (group.members.length === 0) {
            const groupIndex = this.dataManager.groups.findIndex(g => g.id === groupId);
            this.dataManager.groups.splice(groupIndex, 1);
        }

        this.dataManager.saveData();
        return { success: true, message: 'Вы вышли из группы' };
    }

    getFileExtension(fileType) {
        const extensions = {
            'image': '.jpg',
            'video': '.mp4',
            'audio': '.mp3'
        };
        return extensions[fileType] || '.bin';
    }
}

module.exports = ChatsHandler;
