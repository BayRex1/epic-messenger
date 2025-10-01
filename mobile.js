// mobile.js - дополнительные функции для мобильной версии

// Определение типа устройства
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Полноэкранный режим для PWA
function enableFullscreen() {
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
    } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen();
    } else if (document.documentElement.msRequestFullscreen) {
        document.documentElement.msRequestFullscreen();
    }
}

// Вибрация для уведомлений
function vibrate(pattern) {
    if (navigator.vibrate) {
        navigator.vibrate(pattern);
    }
}

// Предотвращение скролла страницы
function preventPullToRefresh() {
    let lastY = 0;
    
    document.addEventListener('touchstart', function(e) {
        lastY = e.touches[0].clientY;
    }, { passive: false });
    
    document.addEventListener('touchmove', function(e) {
        const top = document.documentElement.scrollTop;
        if (top === 0) {
            const currentY = e.touches[0].clientY;
            if (currentY > lastY) {
                e.preventDefault();
            }
        }
        lastY = currentY;
    }, { passive: false });
}

// Адаптация высоты под виртуальную клавиатуру
function setupKeyboardResize() {
    const visualViewport = window.visualViewport;
    
    if (visualViewport) {
        visualViewport.addEventListener('resize', function() {
            const keyboardHeight = window.innerHeight - visualViewport.height;
            document.documentElement.style.setProperty('--keyboard-height', keyboardHeight + 'px');
            
            if (keyboardHeight > 100) {
                document.body.classList.add('keyboard-open');
                scrollToBottom();
            } else {
                document.body.classList.remove('keyboard-open');
            }
        });
    }
}

// Сохранение в домашний экран
function showAddToHomeScreen() {
    if (window.matchMedia('(display-mode: standalone)').matches) {
        return; // Уже установлено
    }
    
    // Показываем подсказку для установки
    const installPrompt = document.createElement('div');
    installPrompt.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        right: 20px;
        background: var(--accent-color);
        color: white;
        padding: 15px;
        border-radius: 12px;
        text-align: center;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    installPrompt.innerHTML = `
        <div style="margin-bottom: 10px;">📱 Установить приложение?</div>
        <button onclick="this.parentElement.remove()" style="background: white; color: var(--accent-color); border: none; padding: 8px 16px; border-radius: 8px; margin-right: 10px;">Позже</button>
        <button onclick="installPWA()" style="background: transparent; color: white; border: 1px solid white; padding: 8px 16px; border-radius: 8px;">Установить</button>
    `;
    document.body.appendChild(installPrompt);
}

// Установка PWA
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showAddToHomeScreen();
});

function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('PWA installed');
            }
            deferredPrompt = null;
        });
    }
}

// Инициализация мобильных функций
function initMobileFeatures() {
    if (isMobileDevice()) {
        preventPullToRefresh();
        setupKeyboardResize();
        
        // Добавляем мета-тег для PWA
        const meta = document.createElement('meta');
        meta.name = 'apple-mobile-web-app-capable';
        meta.content = 'yes';
        document.head.appendChild(meta);
        
        const statusBar = document.createElement('meta');
        statusBar.name = 'apple-mobile-web-app-status-bar-style';
        statusBar.content = 'black-translucent';
        document.head.appendChild(statusBar);
    }
}

// Запуск при загрузке
document.addEventListener('DOMContentLoaded', initMobileFeatures);
