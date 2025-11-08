// Глобальные переменные
let currentUser = null;
let allUsers = [];
let gifts = [];
let promoCodes = [];
let adminStats = {};

// Основная функция инициализации
async function initializeAdmin() {
    try {
        await initializeUser();
        
        // Проверка прав администратора
        if (!currentUser.isDeveloper) {
            showNotification('Доступ запрещен', 'error');
            window.location.href = '/';
            return;
        }
        
        initializeAdminUI();
        await loadAdminData();
    } catch (error) {
        console.error('Ошибка инициализации админ панели:', error);
        showNotification('Ошибка загрузки админ панели', 'error');
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

// Инициализация UI админ панели
function initializeAdminUI() {
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

    // Поиск пользователей
    const adminUserSearch = document.getElementById('adminUserSearch');
    if (adminUserSearch) {
        adminUserSearch.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            filterAdminUsers(searchTerm);
        });
    }

    // Создание подарка
    document.getElementById('createGiftBtn').addEventListener('click', createGift);

    // Создание промокода
    document.getElementById('createPromoBtn').addEventListener('click', createPromoCode);

    // Загрузка файлов для подарков
    initializeFileUploads();
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

// Инициализация загрузки файлов
function initializeFileUploads() {
    const giftFileInput = document.getElementById('giftFileInput');
    const giftUploadArea = document.getElementById('giftUploadArea');
    
    if (giftUploadArea) {
        giftUploadArea.addEventListener('click', function() {
            giftFileInput.click();
        });
    }
    
    if (giftFileInput) {
        giftFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 10 * 1024 * 1024) {
                    showNotification('Размер файла не должен превышать 10 МБ', 'error');
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = function(event) {
                    const imageUrl = event.target.result;
                    document.getElementById('giftFilePreview').innerHTML = `
                        <img src="${imageUrl}" alt="Предпросмотр" style="max-width: 200px; max-height: 200px; border-radius: 8px;">
                    `;
                    document.getElementById('giftImage').value = imageUrl;
                };
                reader.readAsDataURL(file);
            }
        });
    }
}

// Загрузка данных админ панели
async function loadAdminData() {
    await Promise.all([
        loadAdminUsers(),
        loadAdminStats(),
        loadAdminGifts(),
        loadAdminPromoCodes()
    ]);
}

// Загрузка пользователей для админки
async function loadAdminUsers() {
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
            renderAdminUsers(data.users);
        }
    } catch (error) {
        console.error('Ошибка загрузки пользователей для админки:', error);
    }
}

// Отображение пользователей в админке
function renderAdminUsers(users) {
    const adminUsersList = document.getElementById('adminUsersList');
    if (!adminUsersList) return;
    
    adminUsersList.innerHTML = '';
    
    users.forEach(user => {
        const userElement = document.createElement('div');
        userElement.className = 'admin-user-item';
        userElement.innerHTML = `
            <div class="chat-avatar">
                ${user.avatar ? 
                    `<img src="${user.avatar}" alt="${user.displayName}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                    user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'
                }
            </div>
            <div class="admin-user-info">
                <h4>
                    ${user.displayName || 'Пользователь'}
                    ${user.verified ? '<span class="verified-badge">✓</span>' : ''}
                    ${user.isDeveloper ? '<span class="developer-badge">👑</span>' : ''}
                    ${user.banned ? '<span class="banned-badge">ЗАБАНЕН</span>' : ''}
                </h4>
                <div class="admin-user-stats">
                    <span>@${user.username}</span>
                    <span>Постов: ${user.postsCount || 0}</span>
                    <span>E-COIN: ${user.coins || 0}</span>
                    <span>${user.status === 'online' ? '🟢 Онлайн' : '⚫ Офлайн'}</span>
                </div>
            </div>
            <div class="admin-actions">
                <button class="admin-btn ban" data-user-id="${user.id}" data-action="ban">
                    ${user.banned ? 'Разблокировать' : 'Заблокировать'}
                </button>
                <button class="admin-btn verify" data-user-id="${user.id}" data-action="verify">
                    ${user.verified ? 'Снять верификацию' : 'Верифицировать'}
                </button>
                <button class="admin-btn developer" data-user-id="${user.id}" data-action="developer">
                    ${user.isDeveloper ? 'Забрать права' : 'Дать права'}
                </button>
                ${!user.isProtected ? `<button class="admin-btn delete" data-user-id="${user.id}" data-action="delete">Удалить</button>` : ''}
            </div>
        `;
        
        // Добавляем обработчики для кнопок
        const buttons = userElement.querySelectorAll('.admin-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', function() {
                const userId = this.getAttribute('data-user-id');
                const action = this.getAttribute('data-action');
                handleAdminAction(userId, action);
            });
        });
        
        adminUsersList.appendChild(userElement);
    });
}

// Фильтрация пользователей в админке
function filterAdminUsers(searchTerm) {
    const adminUserItems = document.querySelectorAll('.admin-user-item');
    adminUserItems.forEach(item => {
        const userName = item.querySelector('h4').textContent.toLowerCase();
        const userStats = item.querySelector('.admin-user-stats').textContent.toLowerCase();
        
        if (userName.includes(searchTerm) || userStats.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Обработка действий администратора
async function handleAdminAction(userId, action) {
    try {
        const token = localStorage.getItem('authToken');
        let response;
        
        switch(action) {
            case 'ban':
                const user = allUsers.find(u => u.id === userId);
                response = await fetch('/api/admin/ban-user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        userId: userId,
                        banned: !user.banned
                    })
                });
                break;
                
            case 'verify':
                response = await fetch('/api/admin/toggle-verification', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        userId: userId
                    })
                });
                break;
                
            case 'developer':
                response = await fetch('/api/admin/toggle-developer', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        userId: userId
                    })
                });
                break;
                
            case 'delete':
                if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) return;
                response = await fetch('/api/admin/delete-user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        userId: userId
                    })
                });
                break;
        }
        
        if (response) {
            const data = await response.json();
            if (data.success) {
                showNotification(data.message, 'success');
                loadAdminUsers();
            } else {
                showNotification(data.message, 'error');
            }
        }
    } catch (error) {
        console.error('Ошибка выполнения админ действия:', error);
        showNotification('Ошибка выполнения действия', 'error');
    }
}

// Загрузка статистики
async function loadAdminStats() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/admin/stats', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            adminStats = data.stats;
            renderAdminStats();
        }
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

// Отображение статистики
function renderAdminStats() {
    document.getElementById('totalUsers').textContent = adminStats.totalUsers || 0;
    document.getElementById('totalPosts').textContent = adminStats.totalPosts || 0;
    document.getElementById('totalMessages').textContent = adminStats.totalMessages || 0;
    document.getElementById('onlineUsers').textContent = adminStats.onlineUsers || 0;
    document.getElementById('totalGroups').textContent = adminStats.totalGroups || 0;
    
    // FPS мониторинг
    let fps = 60;
    let lastTime = performance.now();
    let frameCount = 0;
    
    function updateFPS() {
        frameCount++;
        const currentTime = performance.now();
        if (currentTime - lastTime >= 1000) {
            fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
            frameCount = 0;
            lastTime = currentTime;
            document.getElementById('fps').textContent = fps;
        }
        requestAnimationFrame(updateFPS);
    }
    updateFPS();
}

// Загрузка подарков для админки
async function loadAdminGifts() {
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
            renderAdminGifts();
        }
    } catch (error) {
        console.error('Ошибка загрузки подарков для админки:', error);
    }
}

// Отображение подарков в админке
function renderAdminGifts() {
    const adminGiftsList = document.getElementById('adminGiftsList');
    if (!adminGiftsList) return;
    
    adminGiftsList.innerHTML = '';
    
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
            <button class="admin-btn delete" style="margin-top: 5px; width: 100%;" data-gift-id="${gift.id}">
                Удалить
            </button>
        `;
        
        const deleteBtn = giftElement.querySelector('.delete');
        deleteBtn.addEventListener('click', function() {
            if (confirm(`Удалить подарок "${gift.name}"?`)) {
                deleteGift(gift.id);
            }
        });
        
        adminGiftsList.appendChild(giftElement);
    });
}

// Создание подарка
async function createGift() {
    const name = document.getElementById('giftName').value.trim();
    const price = document.getElementById('giftPrice').value;
    const type = document.getElementById('giftType').value;
    const image = document.getElementById('giftImage').value.trim();
    
    if (!name || !price) {
        showNotification('Заполните название и цену подарка', 'error');
        return;
    }
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/gifts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name,
                price: parseInt(price),
                type,
                image: image || null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Подарок успешно создан', 'success');
            document.getElementById('giftName').value = '';
            document.getElementById('giftPrice').value = '';
            document.getElementById('giftImage').value = '';
            document.getElementById('giftFilePreview').innerHTML = '';
            loadAdminGifts();
        } else {
            showNotification('Ошибка создания подарка: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка создания подарка:', error);
        showNotification('Ошибка создания подарка', 'error');
    }
}

// Удаление подарка
async function deleteGift(giftId) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/gifts/${giftId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Подарок удален', 'success');
            loadAdminGifts();
        } else {
            showNotification('Ошибка удаления подарка: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления подарка:', error);
        showNotification('Ошибка удаления подарка', 'error');
    }
}

// Загрузка промокодов для админки
async function loadAdminPromoCodes() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/promo-codes', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            promoCodes = data.promoCodes;
            renderAdminPromoCodes();
        }
    } catch (error) {
        console.error('Ошибка загрузки промокодов для админки:', error);
    }
}

// Отображение промокодов в админке
function renderAdminPromoCodes() {
    const adminPromoCodesList = document.getElementById('adminPromoCodesList');
    if (!adminPromoCodesList) return;
    
    adminPromoCodesList.innerHTML = '';
    
    if (promoCodes.length === 0) {
        adminPromoCodesList.innerHTML = '<div class="system-message">Нет созданных промокодов</div>';
        return;
    }
    
    promoCodes.forEach(promo => {
        const promoElement = document.createElement('div');
        promoElement.className = 'post';
        promoElement.innerHTML = `
            <div class="post-header">
                <div class="post-user">
                    <div class="post-user-info">
                        <h4>${promo.code}</h4>
                        <div class="post-time">Создан: ${new Date(promo.created_at).toLocaleString()}</div>
                    </div>
                    <button class="admin-btn delete" data-promo-id="${promo.id}">
                        Удалить
                    </button>
                </div>
            </div>
            <div class="post-content">
                <div class="post-text">
                    <strong>Награда:</strong> ${promo.coins} E-COIN<br>
                    <strong>Использований:</strong> ${promo.used_count}${promo.max_uses > 0 ? ` / ${promo.max_uses}` : ' (без ограничений)'}<br>
                    <strong>Активен:</strong> ${promo.active ? 'Да' : 'Нет'}
                </div>
            </div>
        `;
        
        const deleteBtn = promoElement.querySelector('.delete');
        deleteBtn.addEventListener('click', function() {
            if (confirm(`Удалить промокод "${promo.code}"?`)) {
                deletePromoCode(promo.id);
            }
        });
        
        adminPromoCodesList.appendChild(promoElement);
    });
}

// Создание промокода
async function createPromoCode() {
    const code = document.getElementById('promoCode').value.trim();
    const coins = document.getElementById('promoCoins').value;
    const maxUses = document.getElementById('promoMaxUses').value;
    
    if (!code || !coins) {
        showNotification('Заполните код и количество коинов', 'error');
        return;
    }
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/promo-codes/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                code: code,
                coins: parseInt(coins),
                max_uses: parseInt(maxUses) || 0
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Промокод успешно создан', 'success');
            document.getElementById('promoCode').value = '';
            document.getElementById('promoCoins').value = '';
            document.getElementById('promoMaxUses').value = '0';
            loadAdminPromoCodes();
        } else {
            showNotification('Ошибка создания промокода: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка создания промокода:', error);
        showNotification('Ошибка создания промокода', 'error');
    }
}

// Удаление промокода
async function deletePromoCode(promoId) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/promo-codes/${promoId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Промокод удален', 'success');
            loadAdminPromoCodes();
        } else {
            showNotification('Ошибка удаления промокода: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления промокода:', error);
        showNotification('Ошибка удаления промокода', 'error');
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
    initializeAdmin();
});
