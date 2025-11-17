// Общие функции для всех страниц
function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.className = `theme-${savedTheme}`;
}

function toggleTheme() {
    const currentTheme = document.body.classList.contains('theme-dark') ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.body.classList.remove(`theme-${currentTheme}`);
    document.body.classList.add(`theme-${newTheme}`);
    localStorage.setItem('theme', newTheme);
}

// Проверка авторизации
async function checkAuth() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return null;
    }

    try {
        const response = await fetch('/api/check-auth', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.authenticated) {
            return data.user;
        } else {
            localStorage.removeItem('authToken');
            window.location.href = '/login.html';
            return null;
        }
    } catch (error) {
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
        return null;
    }
}

// Показать уведомления
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

// Выход
function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
    }
}

// Загрузка при старте
document.addEventListener('DOMContentLoaded', function() {
    loadTheme();
    
    // Проверяем авторизацию на всех страницах кроме главной
    if (!window.location.pathname.endsWith('/mobile')) {
        checkAuth();
    }
});
