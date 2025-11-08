// Глобальные переменные
let currentUser = null;
let gifts = [];
let allUsers = [];

// Основная функция инициализации
async function initializeGifts() {
    try {
        await initializeUser();
        initializeGiftsUI();
        await loadGifts();
        await loadMyGifts();
        await loadAllUsers();
    } catch (error) {
        console.error('Ошибка инициализации подарков:', error);
        showNotification('Ошибка загрузки подарков', 'error');
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

    if (currentUser.avatar) {
        userAvatar.innerHTML = `<img src="${currentUser.avatar}" alt="${currentUser.displayName}">`;
    } else {
        userAvatar.textContent = currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'U';
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
}

// Инициализация UI подарков
function initializeGiftsUI() {
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

    // Поиск пользователей для отправки подарков
    const giftSearchUser = document.getElementById('giftSearchUser');
    if (giftSearchUser) {
        giftSearchUser.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            searchUsersForGifts(searchTerm);
        });
    }
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

// Загрузка всех пользователей
async function loadAllUsers() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/users', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            allUsers = data.users;
        }
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
    }
}

// Загрузка подарков
async function loadGifts() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/gifts', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            gifts = data.gifts;
            renderGiftsShop();
        }
    } catch (error) {
        console.error('Ошибка загрузки подарков:', error);
    }
}

// Загрузка моих подарков
async function loadMyGifts() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/my-gifts', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderMyGifts(data.gifts);
        }
    } catch (error) {
        console.error('Ошибка загрузки моих подарков:', error);
    }
}

// Отображение магазина подарков
function renderGiftsShop() {
    const giftsShopList = document.getElementById('giftsShopList');
    if (!giftsShopList) return;
    
    giftsShopList.innerHTML = '';
    
    gifts.forEach(gift => {
        const giftElement = document.createElement('div');
        giftElement.className = 'gift-shop-item';
        giftElement.innerHTML = `
            <div class="gift-shop-preview">
                ${gift.image ? 
                    `<img src="${gift.image}" alt="${gift.name}">` : 
                    gift.preview || '🎁'
                }
            </div>
            <div class="gift-shop-name">${gift.name}</div>
            <div class="gift-shop-price">${gift.price} E-COIN</div>
        `;
        
        giftElement.addEventListener('click', () => {
            if (confirm(`Купить "${gift.name}" за ${gift.price} E-COIN?`)) {
                buyGift(gift.id);
            }
        });
        
        giftsShopList.appendChild(giftElement);
    });
}

// Отображение моих подарков
function renderMyGifts(myGifts) {
    const myGiftsList = document.getElementById('myGiftsList');
    if (!myGiftsList) return;
    
    myGiftsList.innerHTML = '';
    
    if (myGifts.length === 0) {
        myGiftsList.innerHTML = '<div class="system-message">У вас пока нет подарков</div>';
        return;
    }
    
    myGifts.forEach(gift => {
        const giftElement = document.createElement('div');
        giftElement.className = 'my-gift-item';
        giftElement.innerHTML = `
            <div class="my-gift-preview">
                ${gift.giftImage ? 
                    `<img src="${gift.giftImage}" alt="${gift.giftName}">` : 
                    gift.giftPreview || '🎁'
                }
            </div>
            <div class="my-gift-name">${gift.giftName}</div>
            <div class="my-gift-from">От: ${gift.fromUserName}</div>
            <div class="my-gift-price">${gift.giftPrice} E-COIN</div>
        `;
        
        myGiftsList.appendChild(giftElement);
    });
}

// Поиск пользователей для отправки подарков
async function searchUsersForGifts(searchTerm) {
    if (searchTerm.length < 2) {
        document.getElementById('giftUserResults').innerHTML = '<div class="system-message">Введите имя пользователя</div>';
        return;
    }

    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchTerm)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderUserSearchResults(data.users);
        }
    } catch (error) {
        console.error('Ошибка поиска пользователей:', error);
    }
}

// Отображение результатов поиска пользователей
function renderUserSearchResults(users) {
    const giftUserResults = document.getElementById('giftUserResults');
    giftUserResults.innerHTML = '';

    if (users.length === 0) {
        giftUserResults.innerHTML = '<div class="system-message">Пользователи не найдены</div>';
        return;
    }

    users.forEach(user => {
        const userElement = document.createElement('div');
        userElement.className = 'chat-item';
        userElement.innerHTML = `
            <div class="chat-avatar">
                ${user.avatar ? 
                    `<img src="${user.avatar}" alt="${user.displayName}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                    user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'
                }
            </div>
            <div class="chat-info">
                <h4>
                    ${user.displayName || 'Пользователь'}
                    ${user.verified ? '<span class="verified-badge">✓</span>' : ''}
                    ${user.isDeveloper ? '<span class="developer-badge">👑</span>' : ''}
                    <span class="${user.status === 'online' ? 'online-status' : 'offline-status'}"></span>
                </h4>
                <span>@${user.username}</span>
            </div>
        `;
        
        userElement.addEventListener('click', () => {
            selectUserForGift(user);
        });
        
        giftUserResults.appendChild(userElement);
    });
}

// Выбор пользователя для отправки подарка
function selectUserForGift(user) {
    document.getElementById('giftUserResults').innerHTML = `
        <div class="system-message">Выбран пользователь: ${user.displayName}</div>
    `;
    
    renderAvailableGifts(user);
}

// Отображение доступных подарков для отправки
function renderAvailableGifts(user) {
    const availableGiftsList = document.getElementById('availableGiftsList');
    availableGiftsList.innerHTML = '';
    
    gifts.forEach(gift => {
        const giftElement = document.createElement('div');
        giftElement.className = 'gift-shop-item';
        giftElement.innerHTML = `
            <div class="gift-shop-preview">
                ${gift.image ? 
                    `<img src="${gift.image}" alt="${gift.name}">` : 
                    gift.preview || '🎁'
                }
            </div>
            <div class="gift-shop-name">${gift.name}</div>
            <div class="gift-shop-price">${gift.price} E-COIN</div>
        `;
        
        giftElement.addEventListener('click', () => {
            if (confirm(`Отправить "${gift.name}" пользователю ${user.displayName} за ${gift.price} E-COIN?`)) {
                buyGiftForUser(gift.id, user.id);
            }
        });
        
        availableGiftsList.appendChild(giftElement);
    });
}

// Покупка подарка для себя
async function buyGift(giftId) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/gifts/${giftId}/buy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({})
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Подарок "${data.gift.giftName}" успешно приобретен!`, 'success');
            await loadMyGifts();
            await initializeUser(); // Обновляем баланс
        } else {
            showNotification('Ошибка покупки подарка: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка покупки подарка:', error);
        showNotification('Ошибка покупки подарка', 'error');
    }
}

// Покупка подарка для пользователя
async function buyGiftForUser(giftId, userId) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/gifts/${giftId}/buy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                toUserId: userId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Подарок "${data.gift.giftName}" отправлен пользователю!`, 'success');
            await initializeUser(); // Обновляем баланс
        } else {
            showNotification('Ошибка отправки подарка: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка отправки подарка:', error);
        showNotification('Ошибка отправки подарка', 'error');
    }
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
    initializeGifts();
});
