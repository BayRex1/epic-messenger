// Функции для работы с профилем

function initializeProfile() {
    const editProfileBtn = document.getElementById('editProfileBtn');
    const changeAvatarBtn = document.getElementById('changeAvatarBtn');
    const closeEditProfile = document.getElementById('closeEditProfile');
    const cancelEditProfile = document.getElementById('cancelEditProfile');
    const closeChangeAvatar = document.getElementById('closeChangeAvatar');
    const cancelChangeAvatar = document.getElementById('cancelChangeAvatar');
    const saveProfile = document.getElementById('saveProfile');
    const saveAvatar = document.getElementById('saveAvatar');

    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', showEditProfileModal);
    }
    
    if (changeAvatarBtn) {
        changeAvatarBtn.addEventListener('click', showChangeAvatarModal);
    }
    
    // Закрытие модальных окон
    if (closeEditProfile) {
        closeEditProfile.addEventListener('click', closeEditProfileModal);
    }
    
    if (cancelEditProfile) {
        cancelEditProfile.addEventListener('click', closeEditProfileModal);
    }
    
    if (closeChangeAvatar) {
        closeChangeAvatar.addEventListener('click', closeChangeAvatarModal);
    }
    
    if (cancelChangeAvatar) {
        cancelChangeAvatar.addEventListener('click', closeChangeAvatarModal);
    }
    
    // Сохранение профиля
    if (saveProfile) {
        saveProfile.addEventListener('click', saveProfileData);
    }
    
    if (saveAvatar) {
        saveAvatar.addEventListener('click', saveAvatarData);
    }
    
    // Загружаем данные профиля
    loadUserProfileData();
}

function showEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    
    // Заполняем поля текущими данными
    document.getElementById('editDisplayName').value = currentUser.displayName || '';
    document.getElementById('editUsername').value = currentUser.username || '';
    document.getElementById('editEmail').value = currentUser.email || '';
    document.getElementById('editDescription').value = currentUser.description || '';
}

function closeEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function showChangeAvatarModal() {
    const modal = document.getElementById('changeAvatarModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeChangeAvatarModal() {
    const modal = document.getElementById('changeAvatarModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function saveProfileData() {
    const displayName = document.getElementById('editDisplayName').value.trim();
    const username = document.getElementById('editUsername').value.trim();
    const email = document.getElementById('editEmail').value.trim();
    const description = document.getElementById('editDescription').value.trim();
    
    if (!displayName) {
        showNotification('Введите имя для отображения', 'error');
        return;
    }
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/update-profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                displayName,
                username,
                email,
                description
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            updateUserInterface();
            closeEditProfileModal();
            showNotification('Профиль успешно обновлен', 'success');
        } else {
            showNotification('Ошибка обновления профиля: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка обновления профиля:', error);
        showNotification('Ошибка обновления профиля', 'error');
    }
}

async function saveAvatarData() {
    const avatarUrl = document.getElementById('avatarUrl').value.trim();
    
    if (!avatarUrl) {
        showNotification('Введите URL изображения или загрузите файл', 'error');
        return;
    }
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/update-avatar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                avatar: avatarUrl
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            updateUserInterface();
            closeChangeAvatarModal();
            showNotification('Аватар успешно обновлен', 'success');
        } else {
            showNotification('Ошибка обновления аватара: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка обновления аватара:', error);
        showNotification('Ошибка обновления аватара', 'error');
    }
}

async function loadUserProfileData() {
    await Promise.all([
        loadUserPosts(),
        loadUserGifts()
    ]);
}

async function loadUserPosts() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/posts', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const userPosts = data.posts.filter(post => post.userId === currentUser.id);
            renderUserPosts(userPosts);
        }
    } catch (error) {
        console.error('Ошибка загрузки постов пользователя:', error);
    }
}

function renderUserPosts(posts) {
    const userPostsList = document.getElementById('userPostsList');
    if (!userPostsList) return;
    
    userPostsList.innerHTML = '';
    
    if (posts.length === 0) {
        userPostsList.innerHTML = '<div class="system-message">У вас пока нет постов</div>';
        return;
    }
    
    posts.forEach(post => {
        const postElement = createPostElement(post);
        userPostsList.appendChild(postElement);
    });
}

async function loadUserGifts() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/my-gifts', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderUserGifts(data.gifts);
        }
    } catch (error) {
        console.error('Ошибка загрузки подарков пользователя:', error);
    }
}

function renderUserGifts(gifts) {
    const profileGiftsList = document.getElementById('profileGiftsList');
    if (!profileGiftsList) return;
    
    profileGiftsList.innerHTML = '';
    
    if (gifts.length === 0) {
        profileGiftsList.innerHTML = '<div class="system-message">У вас пока нет подарков</div>';
        return;
    }
    
    gifts.forEach(gift => {
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
        `;
        
        profileGiftsList.appendChild(giftElement);
    });
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initializeProfile();
});
