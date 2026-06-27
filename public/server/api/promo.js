class PromoHandler {
    constructor(dataManager, securitySystem, fileHandlers, authHandler) {
        this.dataManager = dataManager;
        this.securitySystem = securitySystem;
        this.fileHandlers = fileHandlers;
        this.authHandler = authHandler;
    }

    authenticateToken(token) {
        return this.authHandler?.authenticateToken(token) || null;
    }

    handleGetPromoCodes(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        this.securitySystem.logSecurityEvent(user, 'GET_PROMOCODES', `count:${this.dataManager.promoCodes.length}`);

        return {
            success: true,
            promoCodes: this.dataManager.promoCodes
        };
    }

    handleCreatePromoCode(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'CREATE_PROMOCODE', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { code, coins, max_uses } = data;
        if (!code || !coins) {
            return { success: false, message: 'Код и количество коинов обязательны' };
        }

        const sanitizedCode = this.securitySystem.sanitizeContent(code.toUpperCase());

        const existingPromo = this.dataManager.promoCodes.find(p => p.code === sanitizedCode);
        if (existingPromo) {
            return { success: false, message: 'Промокод с таким кодом уже существует' };
        }

        const promoCode = {
            id: this.dataManager.generateId(),
            code: sanitizedCode,
            coins: parseInt(coins),
            max_uses: max_uses || 0,
            used_count: 0,
            created_at: new Date()
        };

        this.dataManager.promoCodes.push(promoCode);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'CREATE_PROMOCODE', `code:${sanitizedCode}, coins:${coins}`);

        console.log(`🎫 Администратор ${user.username} создал промокод: ${sanitizedCode}`);

        return {
            success: true,
            promoCode: promoCode
        };
    }

    handleDeletePromoCode(token, data) {
        const user = this.authenticateToken(token);
        if (!user || !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'DELETE_PROMOCODE', 'SYSTEM', false);
            return { success: false, message: 'Доступ запрещен' };
        }

        const { promoCodeId } = data;
        const promoIndex = this.dataManager.promoCodes.findIndex(p => p.id === promoCodeId);
        if (promoIndex === -1) {
            return { success: false, message: 'Промокод не найден' };
        }

        const promoCode = this.dataManager.promoCodes[promoIndex];

        this.dataManager.promoCodes.splice(promoIndex, 1);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'DELETE_PROMOCODE', `code:${promoCode.code}`);

        console.log(`🗑️ Администратор ${user.displayName} удалил промокод: ${promoCode.code}`);

        return {
            success: true,
            message: 'Промокод успешно удален'
        };
    }

    handleActivatePromoCode(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'ACTIVATE_PROMOCODE', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        if (this.dataManager.isMaintenanceMode && this.dataManager.isMaintenanceMode() && !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'ACTIVATE_PROMOCODE_DURING_MAINTENANCE', 'SYSTEM', false);
            return { 
                success: false, 
                message: 'В настоящее время ведутся технические работы. Функция активации промокодов временно недоступна.' 
            };
        }

        const { code } = data;
        if (!this.securitySystem.validateInput(code, 'text')) {
            return { success: false, message: 'Некорректный промокод' };
        }

        const sanitizedCode = this.securitySystem.sanitizeContent(code.toUpperCase());
        const promoCode = this.dataManager.promoCodes.find(p => p.code === sanitizedCode);

        if (!promoCode) {
            this.securitySystem.logSecurityEvent(user, 'ACTIVATE_PROMOCODE', `code:${sanitizedCode}`, false);
            return { success: false, message: 'Промокод не найден' };
        }

        if (promoCode.max_uses > 0 && promoCode.used_count >= promoCode.max_uses) {
            this.securitySystem.logSecurityEvent(user, 'ACTIVATE_PROMOCODE', `code:${sanitizedCode}`, false);
            return { success: false, message: 'Промокод уже использован максимальное количество раз' };
        }

        user.coins += promoCode.coins;
        promoCode.used_count++;
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'ACTIVATE_PROMOCODE', `code:${sanitizedCode}, coins:${promoCode.coins}`);

        console.log(`💰 Пользователь ${user.displayName} активировал промокод ${sanitizedCode} (+${promoCode.coins} E-COIN)`);

        return {
            success: true,
            message: `Промокод активирован! Начислено ${promoCode.coins} E-COIN`,
            coins: promoCode.coins,
            user: {
                coins: user.coins
            }
        };
    }
}

module.exports = PromoHandler;
