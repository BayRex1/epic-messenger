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

        const { name, price, type, image } = data;
        if (!name || !price) {
            return { success: false, message: 'Название и цена обязательны' };
        }

        const sanitizedName = this.securitySystem.sanitizeContent(name);

        const gift = {
            id: this.dataManager.generateId(),
            name: sanitizedName,
            type: type || 'custom',
            preview: image ? '🖼️' : '🎁',
            price: parseInt(price),
            image: image,
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
        if (gift.image && gift.image.startsWith('/uploads/gifts/')) {
            this.fileHandlers.deleteFile(gift.image);
        }

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

        if (this.dataManager.isMaintenanceMode && this.dataManager.isMaintenanceMode() && !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'BUY_GIFT_DURING_MAINTENANCE', `gift:${data.giftId}`, false);
            return { 
                success: false, 
                message: 'В настоящее время ведутся технические работы. Функция покупки подарков временно недоступна.' 
            };
        }

        const { giftId, toUserId } = data;
        const gift = this.dataManager.gifts.find(g => g.id === giftId);
        if (!gift) {
            return { success: false, message: 'Подарок не найден' };
        }

        if (user.coins < gift.price) {
            this.securitySystem.logSecurityEvent(user, 'BUY_GIFT', `gift:${giftId}`, false);
            return { success: false, message: 'Недостаточно E-COIN для покупки подарка' };
        }

        const recipient = this.dataManager.users.find(u => u.id === toUserId);
        if (!recipient) {
            return { success: false, message: 'Получатель не найден' };
        }

        if (recipient.banned) {
            this.securitySystem.logSecurityEvent(user, 'BUY_GIFT', `gift:${giftId}, to:${toUserId}`, false);
            return { success: false, message: 'Нельзя отправлять подарки заблокированным пользователям' };
        }

        user.coins -= gift.price;

        const giftMessage = {
            id: this.dataManager.generateId(),
            senderId: user.id,
            receiverId: toUserId,
            text: '',
            type: 'gift',
            giftId: gift.id,
            giftName: gift.name,
            giftPrice: gift.price,
            giftImage: gift.image,
            giftPreview: gift.preview,
            timestamp: new Date(),
            displayName: user.displayName,
            read: false
        };

        this.dataManager.messages.push(giftMessage);

        if (!recipient.gifts) recipient.gifts = [];
        recipient.gifts.push({
            id: this.dataManager.generateId(),
            giftId: gift.id,
            fromUserId: user.id,
            fromUserName: user.displayName,
            receivedAt: new Date()
        });

        recipient.giftsCount = (recipient.giftsCount || 0) + 1;
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'BUY_GIFT', `gift:${gift.name}, to:${recipient.username}, price:${gift.price}`);

        console.log(`🎁 Пользователь ${user.displayName} отправил подарок "${gift.name}" пользователю ${recipient.displayName}`);

        return {
            success: true,
            message: `Подарок "${gift.name}" успешно отправлен!`,
            gift: gift,
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
            const sentGifts = this.dataManager.sentGifts || [];
            const userGifts = sentGifts.filter(gift => gift.toUserId === userId);

            const giftsWithSenders = userGifts.map(gift => {
                const fromUser = this.dataManager.users.find(u => u.id === gift.fromUserId);
                return {
                    ...gift,
                    fromUserName: fromUser ? fromUser.displayName : 'Неизвестный пользователь',
                    fromUserAvatar: fromUser ? fromUser.avatar : null
                };
            });

            return { success: true, gifts: giftsWithSenders };
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
                giftImage: msg.giftImage,
                giftPreview: msg.giftPreview,
                fromUserId: msg.senderId,
                fromUserName: msg.displayName,
                timestamp: msg.timestamp,
                giftPrice: msg.giftPrice
            }))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return {
            success: true,
            gifts: myGifts
        };
    }

    async handleUploadGift(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_GIFT', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { fileData, filename } = data;

        if (!this.fileHandlers.validateGiftFile(filename)) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_GIFT', `file:${filename}`, false);
            return { success: false, message: 'Недопустимый формат файла для подарка' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `gift_${Date.now()}${fileExt}`;
            const fileUrl = await this.fileHandlers.saveBufferToFolder(fileData, 'gifts', uniqueFilename);

            this.securitySystem.logSecurityEvent(user, 'UPLOAD_GIFT', `file:${filename}`);

            console.log(`🎁 Администратор ${user.username} загрузил изображение подарка: ${filename}`);

            return {
                success: true,
                imageUrl: fileUrl
            };
        } catch (error) {
            console.error('Ошибка загрузки изображения подарка:', error);
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_GIFT', `file:${filename}`, false);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }
}

module.exports = GiftsHandler;
