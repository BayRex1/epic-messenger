// Глобальные переменные
let currentUser = null;

// Основная функция инициализации
async function initializeSettings() {
    try {
        await initializeUser();
        initializeSettingsUI();
        await loadDevices();
    } catch (error) {
        console.error('Ошибка инициализации настроек:', error);
        showNotification('Ошибка загрузки настроек', 'error');
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

// Инициализация UI настроек
function initializeSettingsUI() {
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

    // Инициализация темы
    initializeThemeSelector();

    // Инициализация переключателя версий
    initializeVersionSwitcher();

    // Инициализация настроек уведомлений
    initializeNotificationSettings();

    // Инициализация настроек конфиденциальности
    initializePrivacySettings();
}

// Инициализация выбора темы
function initializeThemeSelector() {
    const themeOptions = document.querySelectorAll('.theme-option');
    const savedTheme = localStorage.getItem('theme') || 'dark';
    
    // Устанавливаем активную тему
    themeOptions.forEach(option => {
        if (option.getAttribute('data-theme') === savedTheme) {
            option.classList.add('active');
        }
        
        option.addEventListener('click', function() {
            const theme = this.getAttribute('data-theme');
            
            themeOptions.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            
            document.body.className = `theme-${theme}`;
            localStorage.setItem('theme', theme);
            
            showNotification('Тема изменена', 'success');
        });
    });
}

// Инициализация переключателя версий
function initializeVersionSwitcher() {
    const desktopVersionBtn = document.getElementById('desktopVersionBtn');
    const savedVersion = localStorage.getItem('preferredVersion') || 'desktop';
    
    if (desktopVersionBtn) {
        if (savedVersion === 'desktop') {
            desktopVersionBtn.classList.add('active');
        }
        
        desktopVersionBtn.addEventListener('click', function() {
            localStorage.setItem('preferredVersion', 'desktop');
            showNotification('Установлена компьютерная версия', 'success');
        });
    }
}

// Инициализация настроек уведомлений
function initializeNotificationSettings() {
    const notificationsEnabled = document.getElementById('notificationsEnabled');
    const soundEnabled = document.getElementById('soundEnabled');
    
    // Загружаем сохраненные настройки
    if (notificationsEnabled) {
        notificationsEnabled.checked = localStorage.getItem('notificationsEnabled') !== 'false';
    }
    
    if (soundEnabled) {
        soundEnabled.checked = localStorage.getItem('soundEnabled') !== 'false';
    }
    
    // Сохраняем настройки при изменении
    if (notificationsEnabled) {
        notificationsEnabled.addEventListener('change', function() {
            localStorage.setItem('notificationsEnabled', this.checked);
            showNotification('Настройки уведомлений сохранены', 'success');
        });
    }
    
    if (soundEnabled) {
        soundEnabled.addEventListener('change', function() {
            localStorage.setItem('soundEnabled', this.checked);
            showNotification('Настройки звука сохранены', 'success');
        });
    }
}

// Инициализация настроек конфиденциальности
function initializePrivacySettings() {
    const profilePublic = document.getElementById('profilePublic');
    const showOnlineStatus = document.getElementById('showOnlineStatus');
    
    // Загружаем сохраненные настройки
    if (profilePublic) {
        profilePublic.checked = localStorage.getItem('profilePublic') !== 'false';
    }
    
    if (showOnlineStatus) {
        showOnlineStatus.checked = localStorage.getItem('showOnlineStatus') !== 'false';
    }
    
    // Сохраняем настройки при изменении
    if (profilePublic) {
        profilePublic.addEventListener('change', function() {
            localStorage.setItem('profilePublic', this.checked);
            updatePrivacySettings();
        });
    }
    
    if (showOnlineStatus) {
        showOnlineStatus.addEventListener('change', function() {
            localStorage.setItem('showOnlineStatus', this.checked);
            updatePrivacySettings();
        });
    }
}

// Обновление настроек конфиденциальности на сервере
async function updatePrivacySettings() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/update-privacy-settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                profilePublic: document.getElementById('profilePublic')?.checked ?? true,
                showOnlineStatus: document.getElementById('showOnlineStatus')?.checked ?? true
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Настройки конфиденциальности сохранены', 'success');
        }
    } catch (error) {
        console.error('Ошибка обновления настроек конфиденциальности:', error);
    }
}

// Загрузка устройств
async function loadDevices() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/devices', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderDevices(data.devices);
        }
    } catch (error) {
        console.error('Ошибка загрузки устройств:', error);
    }
}

// Отображение устройств
function renderDevices(devices) {
    const devicesContainer = document.getElementById('devicesContainer');
    if (!devicesContainer) return;
    
    devicesContainer.innerHTML = '';
    
    if (devices.length === 0) {
        devicesContainer.innerHTML = '<div class="system-message">Нет активных устройств</div>';
        return;
    }
    
    devices.forEach(device => {
        const deviceElement = document.createElement('div');
        deviceElement.className = 'device-item';
        
        const isCurrentDevice = device.id === localStorage.getItem('deviceId');
        const canTerminate = isCurrentDevice || device.isOwner;
        const isDisabled = !canTerminate && device.createdAt > Date.now() - 24 * 60 * 60 * 1000;
        
        deviceElement.innerHTML = `
            <div class="device-info">
                <div class="device-name">${device.name}</div>
                <div class="device-details">
                    ${device.browser} • ${device.os} • ${device.ip}<br>
                    Последняя активность: ${new Date(device.lastActive).toLocaleString()}
                </div>
            </div>
            <div class="device-status">
                ${isCurrentDevice ? '<span class="current-device">Текущее устройство</span>' : ''}
                <div class="device-actions">
                    <button class="device-btn terminate-btn" 
                            data-device-id="${device.id}" 
                            ${isDisabled ? 'disabled' : ''}>
                        Завершить сеанс
                    </button>
                </div>
            </div>
        `;
        
        const terminateBtn = deviceElement.querySelector('.terminate-btn');
        if (terminateBtn && !isDisabled) {
            terminateBtn.addEventListener('click', function() {
                terminateDevice(device.id);
            });
        }
        
        devicesContainer.appendChild(deviceElement);
    });
}

// Завершение сеанса устройства
async function terminateDevice(deviceId) {
    if (!confirm('Вы уверены, что хотите завершить этот сеанс?')) return;
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/devices/terminate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                deviceId: deviceId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Сеанс завершен', 'success');
            loadDevices();
        } else {
            showNotification('Ошибка завершения сеанса: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка завершения сеанса:', error);
        showNotification('Ошибка завершения сеанса', 'error');
    }
}

// Экспорт данных
async function exportData() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/export-data', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Создаем и скачиваем файл
            const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `epic-messenger-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showNotification('Данные успешно экспортированы', 'success');
        } else {
            showNotification('Ошибка экспорта данных', 'error');
        }
    } catch (error) {
        console.error('Ошибка экспорта данных:', error);
        showNotification('Ошибка экспорта данных', 'error');
    }
}

// Удаление аккаунта
async function deleteAccount() {
    if (!confirm('ВНИМАНИЕ: Это действие невозможно отменить. Все ваши данные будут безвозвратно удалены. Вы уверены, что хотите удалить аккаунт?')) {
        return;
    }
    
    const confirmation = prompt('Введите "DELETE" для подтверждения удаления аккаунта:');
    if (confirmation !== 'DELETE') {
        showNotification('Удаление аккаунта отменено', 'warning');
        return;
    }
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/delete-account', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Аккаунт успешно удален', 'success');
            localStorage.removeItem('authToken');
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
        } else {
            showNotification('Ошибка удаления аккаунта: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления аккаунта:', error);
        showNotification('Ошибка удаления аккаунта', 'error');
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
    initializeSettings();
});
