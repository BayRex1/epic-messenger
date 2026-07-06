class GiftsHandler {
    constructor(dataManager, securitySystem, fileHandlers, authHandler) {
        this.dataManager = dataManager;
        this.securitySystem = securitySystem;
        this.fileHandlers = fileHandlers;
        this.authHandler = authHandler;
    }

    authenticateToken(token) {
        return this.authHandler?.authenticateToken(token) || null;
    }

    handleGetGifts(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        this.securitySystem.logSecurityEvent(user, 'GET_GIFTS', `count:${this.dataManager.gifts.length}`);

        return {
            success: true,
            gifts: this.dataManager.gifts
        };
    }

    handleCreateGift(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'CREATE_GIFT', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { name, price, fileData, fileName, fileType } = data;
        
        if (!name || !price) {
            return { success: false, message: 'Название и цена обязательны' };
        }

        if (!fileData) {
            return { success: false, message: 'Файл подарка обязателен' };
        }

        const sanitizedName = this.securitySystem.sanitizeContent(name);

        const gift = {
            id: this.dataManager.generateId(),
            name: sanitizedName,
            price: parseInt(price),
            fileData: fileData,
            fileName: fileName || 'gift.png',
            fileType: fileType || 'image/png',
            createdAt: new Date()
        };

        this.dataManager.gifts.push(gift);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'CREATE_GIFT', `name:${sanitizedName}, price:${price}`);

        console.log(`🎁 Администратор ${user.displayName} создал новый подарок: ${sanitizedName}`);

        return {
            success: true,
            gift: gift
        };
    }

    handleDeleteGift(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'DELETE_GIFT', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { giftId } = data;
        const giftIndex = this.dataManager.gifts.findIndex(g => g.id === giftId);
        if (giftIndex === -1) {
            return { success: false, message: 'Подарок не найден' };
        }

        const gift = this.dataManager.gifts[giftIndex];
        this.dataManager.gifts.splice(giftIndex, 1);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'DELETE_GIFT', `gift:${gift.name}`);

        console.log(`🗑️ Администратор ${user.displayName} удалил подарок: ${gift.name}`);

        return {
            success: true,
            message: 'Подарок успешно удален'
        };
    }

    handleBuyGift(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'BUY_GIFT', `gift:${data.giftId}`, false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { giftId, toUserId } = data;
        
        if (!giftId || !toUserId) {
            return { success: false, message: 'Не указан подарок или получатель' };
        }

        const gift = this.dataManager.gifts.find(g => g.id === giftId);
        if (!gift) {
            return { success: false, message: 'Подарок не найден' };
        }

        if (user.coins < gift.price) {
            this.securitySystem.logSecurityEvent(user, 'BUY_GIFT', `gift:${giftId}`, false);
            return { success: false, message: 'Недостаточно E-COIN' };
        }

        const recipient = this.dataManager.users.find(u => u.id === toUserId);
        if (!recipient) {
            return { success: false, message: 'Получатель не найден' };
        }

        // Списываем монеты
        user.coins -= gift.price;

        // ★★★ НАХОДИМ ИЛИ СОЗДАЕМ ЧАТ ★★★
        let chat = this.dataManager.chats.find(c => 
            c.participants && 
            c.participants.includes(user.id) && 
            c.participants.includes(toUserId) &&
            !c.isGroup
        );

        if (!chat) {
            chat = {
                id: this.dataManager.generateId(),
                participants: [user.id, toUserId],
                isGroup: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                lastMessage: null
            };
            this.dataManager.chats.push(chat);
        }

        // ★★★ СОЗДАЕМ СООБЩЕНИЕ О ПОДАРКЕ ★★★
        const giftMessage = {
            id: this.dataManager.generateId(),
            chatId: chat.id,
            senderId: user.id,
            receiverId: toUserId,
            type: 'gift',
            text: `🎁 Подарок: ${gift.name}`,
            giftId: gift.id,
            giftName: gift.name,
            giftFileType: gift.fileType || 'image/png',
            giftFileData: gift.fileData || '',
            giftFileName: gift.fileName || 'gift.png',
            timestamp: new Date(),
            read: false,
            isOutgoing: false
        };

        this.dataManager.messages.push(giftMessage);
        
        // Обновляем lastMessage в чате
        chat.lastMessage = giftMessage;
        chat.updatedAt = new Date();

        // Добавляем подарок в список полученных
        if (!recipient.gifts) recipient.gifts = [];
        recipient.gifts.push({
            id: this.dataManager.generateId(),
            giftId: gift.id,
            fromUserId: user.id,
            fromUserName: user.displayName,
            receivedAt: new Date()
        });

        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'BUY_GIFT', `gift:${gift.name}, to:${recipient.username}`);

        console.log(`🎁 ${user.displayName} отправил подарок "${gift.name}" пользователю ${recipient.displayName}`);

        // ★★★ ВОЗВРАЩАЕМ CHAT_ID ★★★
        return {
            success: true,
            message: `Подарок "${gift.name}" успешно отправлен!`,
            chatId: chat.id,
            user: {
                coins: user.coins
            }
        };
    }

    handleGetUserGifts(token, query) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { userId } = query;
        if (!userId) {
            return { success: false, message: 'Не указан пользователь' };
        }

        try {
            const userGifts = this.dataManager.messages
                .filter(msg => msg.type === 'gift' && msg.receiverId === userId)
                .map(msg => ({
                    id: msg.id,
                    giftId: msg.giftId,
                    giftName: msg.giftName,
                    giftFileData: msg.giftFileData,
                    giftFileType: msg.giftFileType,
                    fromUserId: msg.senderId,
                    fromUserName: this.dataManager.users.find(u => u.id === msg.senderId)?.displayName || 'Неизвестный',
                    receivedAt: msg.timestamp
                }));

            return { success: true, gifts: userGifts };
        } catch (error) {
            console.error('❌ Ошибка получения подарков пользователя:', error);
            return { success: false, message: 'Ошибка получения подарков пользователя' };
        }
    }

    handleGetMyGifts(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const myGifts = this.dataManager.messages
            .filter(msg => msg.type === 'gift' && msg.receiverId === user.id)
            .map(msg => ({
                id: msg.id,
                giftId: msg.giftId,
                giftName: msg.giftName,
                giftFileData: msg.giftFileData,
                giftFileType: msg.giftFileType,
                fromUserId: msg.senderId,
                fromUserName: this.dataManager.users.find(u => u.id === msg.senderId)?.displayName || 'Неизвестный',
                receivedAt: msg.timestamp
            }))
            .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));

        return {
            success: true,
            gifts: myGifts
        };
    }
}

module.exports = GiftsHandler;
