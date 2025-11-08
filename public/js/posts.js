// Функции для работы с постами

async function loadPosts() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/posts', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            posts = data.posts;
            renderPosts(posts);
        }
    } catch (error) {
        console.error('Ошибка загрузки постов:', error);
    }
}

function renderPosts(posts) {
    const postsList = document.getElementById('postsList');
    if (!postsList) return;
    
    postsList.innerHTML = '';
    
    if (posts.length === 0) {
        postsList.innerHTML = '<div class="system-message">Пока нет постов. Будьте первым!</div>';
        return;
    }
    
    posts.forEach(post => {
        const postElement = createPostElement(post);
        postsList.appendChild(postElement);
    });
}

function createPostElement(post) {
    const postElement = document.createElement('div');
    postElement.className = 'post';
    
    let mediaHtml = '';
    if (post.image) {
        mediaHtml = `
            <div class="post-media">
                <img src="${post.image}" alt="Изображение поста" onclick="openImageModal('${post.image}')">
            </div>
        `;
    } else if (post.file && post.fileType === 'video') {
        mediaHtml = `
            <div class="post-media">
                <video controls>
                    <source src="${post.file}" type="video/mp4">
                    Ваш браузер не поддерживает видео.
                </video>
            </div>
        `;
    } else if (post.file && post.fileType === 'audio') {
        mediaHtml = `
            <div class="post-audio">
                <audio controls>
                    <source src="${post.file}" type="audio/mpeg">
                    Ваш браузер не поддерживает аудио.
                </audio>
            </div>
        `;
    }
    
    // Обрабатываем упоминания в тексте
    let postText = post.text || '';
    postText = processMentions(postText);
    
    postElement.innerHTML = `
        <div class="post-header">
            <div class="post-user">
                <div class="post-avatar">
                    ${post.userAvatar ? 
                        `<img src="${post.userAvatar}" alt="${post.userName}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                        post.userName ? post.userName.charAt(0).toUpperCase() : 'U'
                    }
                </div>
                <div class="post-user-info">
                    <h4>
                        ${post.userName || 'Неизвестный'}
                        ${post.userVerified ? '<span class="verified-badge">✓</span>' : ''}
                        ${post.userDeveloper ? '<span class="developer-badge">👑</span>' : ''}
                    </h4>
                    <div class="post-time">${new Date(post.createdAt).toLocaleString()}</div>
                </div>
                ${currentUser && currentUser.isDeveloper && post.userId !== currentUser.id ? `
                    <div style="margin-left: auto;">
                        <button class="admin-btn delete delete-post-btn" data-post-id="${post.id}">Удалить</button>
                    </div>
                ` : ''}
            </div>
        </div>
        <div class="post-content">
            <div class="post-text">${postText}</div>
            ${mediaHtml}
        </div>
        <div class="post-actions">
            <button class="post-action like-btn ${post.likes && post.likes.includes(currentUser.id) ? 'liked' : ''}" data-post-id="${post.id}">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M12,21.35L10.55,20.03C5.4,15.36 2,12.28 2,8.5C2,5.42 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.09C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.42 22,8.5C22,12.28 18.6,15.36 13.45,20.04L12,21.35Z"/>
                </svg>
                <span>${post.likes ? post.likes.length : 0}</span>
            </button>
            <div class="post-views">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z"/>
                </svg>
                <span>${post.views || 0}</span>
            </div>
        </div>
    `;
    
    const likeBtn = postElement.querySelector('.like-btn');
    if (likeBtn) {
        likeBtn.addEventListener('click', function() {
            toggleLike(post.id);
        });
    }

    const deleteBtn = postElement.querySelector('.delete-post-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() {
            deletePost(post.id);
        });
    }
    
    return postElement;
}

async function publishPost() {
    const postText = document.getElementById('postText');
    const text = postText.value.trim();
    const fileInput = document.getElementById('postFileInput');
    const image = fileInput.dataset.fileUrl || null;
    const fileName = fileInput.dataset.fileName || null;
    const fileType = fileInput.dataset.fileType || null;
    
    if (!text && !image) {
        showNotification('Введите текст поста или добавьте файл', 'warning');
        return;
    }
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/posts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                text: text,
                image: image,
                file: image,
                fileName: fileName,
                fileType: fileType
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            postText.value = '';
            fileInput.dataset.fileUrl = '';
            fileInput.dataset.fileName = '';
            fileInput.dataset.fileType = '';
            document.getElementById('postFilePreview').innerHTML = '';
            
            // Отправляем уведомление через WebSocket
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'new_post',
                    post: data.post
                }));
            }
            
            loadPosts();
            showNotification('Пост опубликован!', 'success');
        } else {
            showNotification('Ошибка публикации поста: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка публикации поста:', error);
        showNotification('Ошибка публикации поста', 'error');
    }
}

async function toggleLike(postId) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/posts/${postId}/like`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Отправляем уведомление через WebSocket
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'post_liked',
                    postId: postId,
                    userId: currentUser.id
                }));
            }
            
            loadPosts();
        } else {
            showNotification('Ошибка лайка: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка лайка:', error);
        showNotification('Ошибка лайка', 'error');
    }
}

async function deletePost(postId) {
    if (!confirm('Вы уверены, что хотите удалить этот пост?')) return;
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/posts/${postId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Пост удален', 'success');
            loadPosts();
        } else {
            showNotification('Ошибка удаления поста: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления поста:', error);
        showNotification('Ошибка удаления поста', 'error');
    }
}

// Инициализация постов
function initializePosts() {
    const publishPostBtn = document.getElementById('publishPostBtn');
    const addFileBtn = document.getElementById('addFileBtn');
    
    if (publishPostBtn) {
        publishPostBtn.addEventListener('click', publishPost);
    }
    
    if (addFileBtn) {
        addFileBtn.addEventListener('click', function() {
            document.getElementById('postFileInput').click();
        });
    }
    
    // Загружаем посты при инициализации
    loadPosts();
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initializePosts();
});
