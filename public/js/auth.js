class AuthManager {
    constructor() {
        this.init();
    }

    init() {
        this.setupAuthForms();
        this.checkExistingAuth();
    }

    setupAuthForms() {
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');

        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        if (registerForm) {
            registerForm.addEventListener('submit', (e) => this.handleRegister(e));
        }

        // Переключение между формами
        const switchLinks = document.querySelectorAll('.switch-form');
        switchLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchForms();
            });
        });
    }

    checkExistingAuth() {
        const token = localStorage.getItem('authToken');
        if (token && window.location.pathname.includes('login.html')) {
            window.location.href = '/';
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const username = formData.get('username');
        const password = formData.get('password');

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('deviceId', data.deviceId);
                this.showMessage('Вход успешен!', 'success');
                
                setTimeout(() => {
                    window.location.href = '/';
                }, 1000);
            } else {
                this.showMessage(data.message, 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showMessage('Ошибка соединения', 'error');
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const username = formData.get('username');
        const displayName = formData.get('displayName');
        const email = formData.get('email');
        const password = formData.get('password');

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, displayName, email, password })
            });

            const data = await response.json();

            if (data.success) {
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('deviceId', data.deviceId);
                this.showMessage('Регистрация успешна!', 'success');
                
                setTimeout(() => {
                    window.location.href = '/';
                }, 1000);
            } else {
                this.showMessage(data.message, 'error');
            }
        } catch (error) {
            console.error('Register error:', error);
            this.showMessage('Ошибка соединения', 'error');
        }
    }

    switchForms() {
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const loginTitle = document.querySelector('.login-title');
        const registerTitle = document.querySelector('.register-title');

        if (loginForm.style.display !== 'none') {
            loginForm.style.display = 'none';
            registerForm.style.display = 'block';
            loginTitle.style.display = 'none';
            registerTitle.style.display = 'block';
        } else {
            loginForm.style.display = 'block';
            registerForm.style.display = 'none';
            loginTitle.style.display = 'block';
            registerTitle.style.display = 'none';
        }
    }

    showMessage(message, type) {
        // Удалить существующие сообщения
        const existingMessage = document.querySelector('.auth-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Создать новое сообщение
        const messageEl = document.createElement('div');
        messageEl.className = `auth-message ${type}`;
        messageEl.textContent = message;

        const container = document.querySelector('.auth-container');
        container.insertBefore(messageEl, container.firstChild);

        // Автоудаление для успешных сообщений
        if (type === 'success') {
            setTimeout(() => {
                messageEl.remove();
            }, 3000);
        }
    }
}

// Инициализация аутентификации
const authManager = new AuthManager();
