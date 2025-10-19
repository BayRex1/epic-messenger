class GiftsManager {
    constructor() {
        this.gifts = [];
        this.myGifts = [];
    }

    async loadGifts() {
        await this.loadGiftsShop();
        await this.loadMyGifts();
    }

    async loadGiftsShop() {
        try {
            const response = await fetch('/api/gifts/shop', {
                headers: {
                    'Authorization': `Bearer ${app.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.gifts = data.gifts;
                    this.renderGiftsShop();
                }
            }
        } catch (error) {
            console.error('Error loading gifts shop:', error);
        }
    }

    renderGiftsShop() {
        const giftsContainer = document.getElementById('giftsShop');
        if (!giftsContainer) return;

        if (this.gifts.length === 0) {
            giftsContainer.innerHTML = `
                <div class="empty-state">
                    <img src="/assets/gift.svg" alt="No gifts" class="empty-icon">
                    <h3>Магазин пуст</h3>
                    <p>Подарки появятся здесь скоро!</p>
                </div>
            `;
            return;
        }

        giftsContainer.innerHTML = this.gifts.map(gift => `
            <div class="gift-shop-item" data-gift-id="${gift.id}">
                <div class="gift-preview">
                    <img src="${gift.preview}" alt="${gift.name}">
                </div>
                <div class="gift-info">
                    <h4 class="gift-name">${gift.name}</h4>
                    <div class="gift-price">
                        <img src="/assets/coin.svg" alt="Coins">
                        <span>${gift.price} E-COIN</span>
                    </div>
                    <button class="btn btn-primary buy-btn" 
                            onclick="giftsManager.buyGift('${gift.id}')"
                            ${app.currentUser.eCoins < gift.price ? 'disabled' : ''}>
                        Купить
                    </button>
                </div>
            </div>
        `).join('');
    }

    async loadMyGifts() {
        try {
            const response = await fetch('/api/users/gifts', {
                headers: {
                    'Authorization': `Bearer ${app.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.myGifts = data.gifts;
                    this.renderMyGifts();
                }
            }
        } catch (error) {
            console.error('Error loading my gifts:', error);
        }
    }

    renderMyGifts() {
        const giftsContainer = document.getElementById('myGifts');
        if (!giftsContainer) return;

        if (this.myGifts.length === 0) {
            giftsContainer.innerHTML = `
                <div class="empty-state">
                    <img src="/assets/gift.svg" alt="No gifts" class="empty-icon">
                    <h3>У вас пока нет подарков</h3>
                    <p>Подарки, которые вам отправят, появятся здесь</p>
                </div>
            `;
            return;
        }

        giftsContainer.innerHTML = this.myGifts.map(gift => `
            <div class="my-gift-item">
                <div class="gift-preview">
                    <img src="${gift.gift.preview}" alt="${gift.gift.name}">
                </div>
                <div class="gift-details">
                    <div class="gift-name">${gift.gift.name}</div>
                    <div class="gift-sender">от ${gift.sender.displayName}</div>
                    <div class="gift-date">${app.formatTime(gift.sentAt)}</div>
                    <button class="btn btn-secondary" onclick="giftsManager.useGift('${gift.id}')">
                        Использовать
                    </button>
                </div>
            </div>
        `).join('');
    }

    async buyGift(giftId) {
        const gift = this.gifts.find(g => g.id === giftId);
        if (!gift) return;

        // Спросить кому отправить подарок
        const receiverUsername = prompt('Введите имя пользователя для отправки подарка (начинается с @):');
        if (!receiverUsername) return;

        try {
            const response = await fetch('/api/gifts/buy', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${app.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    giftId: giftId,
                    receiverId: receiverUsername // В реальности нужно получить ID пользователя
                })
            });

            const data = await response.json();

            if (data.success) {
                app.showNotification(`Подарок "${gift.name}" отправлен!`, 'success');
                
                // Обновить баланс
                app.currentUser.eCoins = data.newBalance;
                app.updateUI();
                
                // Перезагрузить магазин
                await this.loadGiftsShop();
            } else {
                app.showNotification(data.message, 'error');
            }
        } catch (error) {
            console.error('Error buying gift:', error);
            app.showNotification('Ошибка при покупке подарка', 'error');
        }
    }

    async useGift(giftId) {
        app.showNotification('Подарок использован!', 'success');
        
        // Здесь будет логика использования подарка
        // Например, применение эффектов, бонусов и т.д.
    }

    showGiftAnimation(gift) {
        // Анимация получения подарка
        const animation = document.createElement('div');
        animation.className = 'gift-animation';
        animation.innerHTML = `
            <div class="gift-box">
                <img src="${gift.preview}" alt="${gift.name}">
                <div class="gift-message">Вы получили подарок: ${gift.name}!</div>
            </div>
        `;

        document.body.appendChild(animation);

        setTimeout(() => {
            animation.remove();
        }, 3000);
    }
}

const giftsManager = new GiftsManager();
