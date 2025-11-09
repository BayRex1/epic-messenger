// Глобальные переменные
let currentUser = null;
let transactions = [];
let promoCodes = [];

// Основная функция инициализации
async function initializeEcoin() {
    try {
        await initializeUser();
        initializeEcoinUI();
        await loadEcoinData();
        await loadTransactions();
    } catch (error) {
        console.error('Ошибка инициализации E-COIN:', error);
        showNotification('Ошибка загрузки E-COIN', 'error');
    }
}

// Инициализация пользователя
async function initializeUser() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        const response = await fetch('/api/current-user', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            updateUserInterface();
        } else {
            localStorage.removeItem('authToken');
            window.location.href = '/login.html';
        }
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
    }
}

// Обновление интерфейса пользователя
function updateUserInterface() {
    if (!currentUser) return;
    
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const userUsername = document.getElementById('userUsername');
    const verifiedBadge = document.getElementById('verifiedBadge');
    const developerBadge = document.getElementById('developerBadge');
    const adminPanelBtn = document.getElementById('adminPanelBtn');
    const ecoinUserAvatar = document.getElementById('ecoinUserAvatar');
    const ecoinBalance = document.getElementById('ecoinBalance');

    if (currentUser.avatar) {
        userAvatar.innerHTML = `<img src="${currentUser.avatar}" alt="${currentUser.displayName}">`;
        ecoinUserAvatar.innerHTML = `<img src="${currentUser.avatar}" alt="${currentUser.displayName}">`;
    } else {
        userAvatar.textContent = currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'U';
        ecoinUserAvatar.textContent = currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'U';
    }
    
    userName.innerHTML = currentUser.displayName || 'Пользователь';
    
    if (currentUser.verified) {
        verifiedBadge.style.display = 'inline-flex';
    }
    
    if (currentUser.isDeveloper) {
        developerBadge.style.display = 'inline-flex';
        adminPanelBtn.style.display = 'flex';
    }

    userUsername.textContent = `@${currentUser.username}`;
    ecoinBalance.textContent = `${currentUser.coins || 0} E-COIN`;
}

// Инициализация UI E-COIN
function initializeEcoinUI() {
    // Переключение сайдбара
    const profileSection = document.getElementById('profileSection');
    const sidebar = document.getElementById('sidebar');
    
    profileSection.addEventListener('click', function() {
        sidebar.classList.toggle('expanded');
    });

    // Выход
    document.getElementById('logoutBtn').addEventListener('click', function() {
        if (confirm('Вы уверены, что хотите выйти?')) {
            localStorage.removeItem('authToken');
            window.location.href = '/login.html';
        }
    });

    // Инициализация табов
    initializeTabs();

    // Кнопки действий
    document.getElementById('buyEcoinsBtn').addEventListener('click', showBuyEcoinsModal);
    document.getElementById('withdrawEcoinsBtn').addEventListener('click', showWithdrawModal);
    document.getElementById('activatePromoBtn').addEventListener('click', activatePromoCode);
}

// Инициализация табов
function initializeTabs() {
    const profileTabs = document.querySelectorAll('.profile-tab');
    profileTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            const container = this.closest('.profile-tabs').parentElement;
            
            container.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
            container.querySelectorAll('.profile-tab-content').forEach(c => c.classList.remove('active'));
            
            this.classList.add('active');
            const content = container.querySelector(`#${tabId}`);
            if (content) {
                content.classList.add('active');
            }
        });
    });
}

// Загрузка данных E-COIN
async function loadEcoinData() {
    await loadEcoinPackages();
}

// Загрузка пакетов E-COIN
async function loadEcoinPackages() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/ecoin/packages', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderEcoinPackages(data.packages);
        } else {
            // Заглушки для демонстрации
            const demoPackages = [
                { id: 1, name: "Стартовый пакет", coins: 100, price: -, bonus: - },
                { id: 2, name: "Базовый пакет", coins: 500, price: -, bonus: - },
                { id: 3, name: "Премиум пакет", coins: 1000, price: -, bonus: - },
                { id: 4, name: "Максимальный пакет", coins: 5000, price: -, bonus: - }
            ];
            renderEcoinPackages(demoPackages);
        }
    } catch (error) {
        console.error('Ошибка загрузки пакетов E-COIN:', error);
        // Заглушки для демонстрации
        const demoPackages = [
            { id: 1, name: "Стартовый пакет", coins: 100, price: -, bonus: - },
            { id: 2, name: "Базовый пакет", coins: 500, price: -, bonus: - },
            { id: 3, name: "Премиум пакет", coins: 1000, price: -, bonus: - },
            { id: 4, name: "Максимальный пакет", coins: 5000, price: -, bonus: - }
        ];
        renderEcoinPackages(demoPackages);
    }
}

// Отображение пакетов E-COIN
function renderEcoinPackages(packages) {
    const ecoinPackagesList = document.getElementById('ecoinPackagesList');
    if (!ecoinPackagesList) return;
    
    ecoinPackagesList.innerHTML = '';
    
    packages.forEach(pkg => {
        const packageElement = document.createElement('div');
        packageElement.className = 'gift-shop-item';
        packageElement.innerHTML = `
            <div class="gift-shop-preview">
                💰
            </div>
            <div class="gift-shop-name">${pkg.name}</div>
            <div class="gift-shop-price">${pkg.coins} E-COIN</div>
            <div style="font-size: 12px; color: var(--success-color); margin-top: 5px;">
                ${pkg.bonus > 0 ? `+${pkg.bonus} бонус` : ''}
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 3px;">
                ${pkg.price} руб.
            </div>
        `;
        
        packageElement.addEventListener('click', () => {
            if (confirm(`Купить ${pkg.coins} E-COIN за ${pkg.price} руб.?`)) {
                buyEcoinPackage(pkg.id);
            }
        });
        
        ecoinPackagesList.appendChild(packageElement);
    });
}

// Загрузка истории операций
async function loadTransactions() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/ecoin/transactions', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            transactions = data.transactions;
            renderTransactions();
        }
    } catch (error) {
        console.error('Ошибка загрузки истории операций:', error);
    }
}

// Отображение истории операций
function renderTransactions() {
    const transactionsList = document.getElementById('transactionsList');
    if (!transactionsList) return;
    
    transactionsList.innerHTML = '';
    
    if (transactions.length === 0) {
        transactionsList.innerHTML = '<div class="system-message">История операций пуста</div>';
        return;
    }
    
    transactions.forEach(transaction => {
        const transactionElement = document.createElement('div');
        transactionElement.className = 'post';
        transactionElement.innerHTML = `
            <div class="post-header">
                <div class="post-user">
                    <div class="post-user-info">
                        <h4>${transaction.description}</h4>
                        <div class="post-time">${new Date(transaction.createdAt).toLocaleString()}</div>
                    </div>
                </div>
            </div>
            <div class="post-content">
                <div class="post-text">
                    <strong>Сумма:</strong> 
                    <span style="color: ${transaction.amount >= 0 ? 'var(--success-color)' : 'var(--error-color)'}">
                        ${transaction.amount >= 0 ? '+' : ''}${transaction.amount} E-COIN
                    </span>
                    <br>
                    <strong>Баланс после операции:</strong> ${transaction.balance} E-COIN
                    ${transaction.type ? `<br><strong>Тип:</strong> ${getTransactionType(transaction.type)}` : ''}
                </div>
            </div>
        `;
        
        transactionsList.appendChild(transactionElement);
    });
}

// Получение типа операции
function getTransactionType(type) {
    const types = {
        'purchase': 'Покупка',
        'gift_sent': 'Отправка подарка',
        'gift_received': 'Получение подарка',
        'promo': 'Промокод',
        'withdrawal': 'Вывод средств'
    };
    return types[type] || type;
}

// Активация промокода
async function activatePromoCode() {
    const promoCode = document.getElementById('promoCodeInput').value.trim();
    
    if (!promoCode) {
        showNotification('Введите промокод', 'error');
        return;
    }
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/promo-codes/activate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                code: promoCode
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('promoCodeInput').value = '';
            document.getElementById('promoResult').innerHTML = `
                <div class="promo-result success">${data.message}</div>
            `;
            await initializeUser(); // Обновляем баланс
            await loadTransactions(); // Обновляем историю
        } else {
            document.getElementById('promoResult').innerHTML = `
                <div class="promo-result error">${data.message}</div>
            `;
        }
    } catch (error) {
        console.error('Ошибка активации промокода:', error);
        showNotification('Ошибка активации промокода', 'error');
    }
}

// Покупка пакета E-COIN
async function buyEcoinPackage(packageId) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/ecoin/buy-package', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                packageId: packageId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Пакет E-COIN успешно приобретен!`, 'success');
            await initializeUser(); // Обновляем баланс
            await loadTransactions(); // Обновляем историю
        } else {
            showNotification('Ошибка покупки пакета: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка покупки пакета:', error);
        showNotification('Ошибка покупки пакета', 'error');
    }
}

// Показать модальное окно покупки E-COIN
function showBuyEcoinsModal() {
    showNotification('Функция покупки E-COIN в разработке', 'info');
}

// Показать модальное окно вывода средств
function showWithdrawModal() {
    showNotification('Функция вывода средств в разработке', 'info');
}

// Показать уведомление
function showNotification(message, type = 'success') {
    const notificationsContainer = document.getElementById('notificationsContainer');
    if (!notificationsContainer) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    notificationsContainer.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initializeEcoin();
});
