class ChatsHandler {
    constructor(dataManager, securitySystem, fileHandlers) {
        this.dataManager = dataManager;
        this.securitySystem = securitySystem;
        this.fileHandlers = fileHandlers;
    }

    // ============================================
    // === ЧАТЫ ===
    // ============================================

    handleGetChats(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        try {
            const personalChats = this.dataManager.users
                .filter(u => u.id !== user.id)
                .map(u => {
                    const messages = this.dataManager.messages.filter(m => 
                        (m.senderId === user.id && m.receiverId === u.id) ||
                        (m.senderId === u.id && m.receiverId === user.id)
                    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                    const lastMessage = messages[0] || null;
                    const unreadCount = messages.filter(m => 
                        m.senderId === u.id && !m.read
                    ).length;

                    return {
                        id: u.id,
                        displayName: u.displayName || 'Пользователь',
                        avatar: u.avatar,
                        verified: u.verified,
                        isDeveloper: u.isDeveloper,
                        status: u.status,
                        lastSeen: u.lastSeen,
                        lastMessage: lastMessage,
                        unreadCount: unreadCount,
                        isGroup: false
                    };
                })
                .filter(chat => chat.lastMessage !== null)
                .sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));

            const groupChats = this.dataManager.groups
                .filter(g => g.members.includes(user.id) && g.isActive !== false)
                .map(g => {
                    const groupMessages = this.dataManager.messages.filter(m => 
                        m.receiverId === g.id
                    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                    const lastMessage = groupMessages[0] || null;
                    const unreadCount = groupMessages.filter(m => {
                        if (m.senderId === user.id) return false;
                        if (!m.readBy) return true;
                        return !m.readBy.includes(user.id);
                    }).length;

                    return {
                        id: g.id,
                        displayName: g.name,
                        avatar: g.avatar,
                        isGroup: true,
                        memberCount: g.members.length,
                        lastMessage: lastMessage,
                        unreadCount: unreadCount,
                        creatorId: g.creatorId,
                        members: g.members,
                        createdAt: g.createdAt
                    };
                })
                .sort((a, b) => {
                    const dateA = a.lastMessage ? new Date(a.lastMessage.timestamp) : new Date(a.createdAt || 0);
                    const dateB = b.lastMessage ? new Date(b.lastMessage.timestamp) : new Date(b.createdAt || 0);
                    return dateB - dateA;
                });

            const allChats = [...personalChats, ...groupChats];

            console.log(`👥 Загружено чатов для ${user.username}:`, {
                personal: personalChats.length,
                groups: groupChats.length,
                total: allChats.length
            });

            return { success: true, chats: allChats };
        } catch (error) {
            console.error('❌ Ошибка получения чатов:', error);
            return { success: false, message: 'Ошибка получения чатов' };
        }
    }

    handleStartChat(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId } = data;
        if (!userId) {
            return { success: false, message: 'User ID не указан' };
        }

        const targetUser = this.dataManager.users.find(u => u.id === userId);
        if (!targetUser) {
            return { success: false, message: 'Пользователь не найден' };
        }

        return {
            success: true,
            chatId: userId,
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
    // === СООБЩЕНИЯ ===
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
            let messages;
            
            const isGroupChat = this.dataManager.groups.some(g => g.id === userId && g.members.includes(user.id));
            
            if (isGroupChat) {
                messages = this.dataManager.messages
                    .filter(m => m.receiverId === userId)
                    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            } else {
                messages = this.dataManager.messages
                    .filter(m => 
                        (m.senderId === user.id && m.receiverId === userId) ||
                        (m.senderId === userId && m.receiverId === user.id)
                    )
                    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            }

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
            const isUser = this.dataManager.users.some(u => u.id === toUserId);
            const isGroup = this.dataManager.groups.some(g => g.id === toUserId && g.members.includes(user.id));
            
            if (!isUser && !isGroup) {
                return { success: false, message: 'Получатель не найден или у вас нет доступа к группе' };
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
                senderId: user.id,
                receiverId: toUserId,
                text: text ? this.securitySystem.sanitizeContent(text) : null,
                type: type,
                file: fileUrl,
                fileName: fileName,
                fileType: fileType,
                timestamp: new Date(),
                read: false,
                readBy: isGroup ? [user.id] : []
            };

            this.dataManager.messages.push(message);
            this.dataManager.saveData();

            if (isGroup) {
                console.log(`💬 Сообщение отправлено в группу ${toUserId}`);
                const group = this.dataManager.groups.find(g => g.id === toUserId);
                if (group) {
                    group.members.forEach(memberId => {
                        if (memberId !== user.id) {
                            console.log(`📢 Уведомление для участника группы: ${memberId}`);
                        }
                    });
                }
            }

            this.securitySystem.logSecurityEvent(user, 'SEND_MESSAGE', `to:${toUserId}, type:${type}, isGroup:${isGroup}`);

            console.log(`💬 Пользователь ${user.displayName} отправил сообщение ${isGroup ? 'в группу' : 'пользователю'} ${toUserId}`);

            return { success: true, message: message };
        } catch (error) {
            console.error('❌ Ошибка отправки сообщения:', error);
            return { success: false, message: 'Ошибка отправки сообщения: ' + error.message };
        }
    }

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
            this.dataManager.messages.forEach(message => {
                if (message.senderId === fromUserId && message.receiverId === user.id && !message.read) {
                    message.read = true;
                }
                
                if (message.receiverId === fromUserId && message.readBy && !message.readBy.includes(user.id)) {
                    message.readBy.push(user.id);
                }
            });

            this.dataManager.saveData();

            return { success: true, message: 'Сообщения помечены как прочитанные' };
        } catch (error) {
            console.error('❌ Ошибка отметки сообщений:', error);
            return { success: false, message: 'Ошибка отметки сообщений' };
        }
    }

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

    // ============================================
    // === ВСПОМОГАТЕЛЬНЫЕ ===
    // ============================================

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
