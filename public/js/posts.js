// Функции для работы с постами

let currentPostId = null;
let posts = [];
let currentUser = null;

async function loadPosts() {
    try {
        console.log('🔄 Начинаем загрузку постов...');
        const token = localStorage.getItem('authToken');
        
        if (!token) {
            console.log('❌ Токен не найден');
            showNotification('Необходима авторизация', 'error');
            const postsList = document.getElementById('postsList');
            if (postsList) {
                postsList.innerHTML = `
                    <div class="system-message error">
                        Необходима авторизация
                        <button onclick="window.location.href='/login.html'" class="retry-btn">Войти</button>
                    </div>
                `;
            }
            return;
        }

        const response = await fetch('/api/posts', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('📡 Ответ от сервера:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📦 Данные постов:', data);
        
        if (data.success) {
            posts = data.posts;
            console.log(`✅ Загружено ${posts.length} постов`);
            renderPosts(posts);
        } else {
            console.log('❌ Ошибка загрузки постов:', data.message);
            showNotification('Ошибка загрузки постов: ' + data.message, 'error');
            
            const postsList = document.getElementById('postsList');
            if (postsList) {
                postsList.innerHTML = `
                    <div class="system-message error">
                        Ошибка загрузки постов: ${data.message}
                        <button onclick="loadPosts()" class="retry-btn">Повторить</button>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки постов:', error);
        showNotification('Ошибка загрузки постов', 'error');
        
        const postsList = document.getElementById('postsList');
        if (postsList) {
            postsList.innerHTML = `
                <div class="system-message error">
                    Ошибка загрузки постов: ${error.message}
                    <button onclick="loadPosts()" class="retry-btn">Повторить</button>
                </div>
            `;
        }
    }
}

function renderPosts(posts) {
    const postsList = document.getElementById('postsList');
    if (!postsList) {
        console.log('❌ Элемент postsList не найден');
        return;
    }
    
    postsList.innerHTML = '';
    
    if (posts.length === 0) {
        postsList.innerHTML = '<div class="system-message">Пока нет постов. Будьте первым!</div>';
        return;
    }
    
    console.log(`🎨 Рендерим ${posts.length} постов`);
    
    posts.forEach(post => {
        const postElement = createPostElement(post);
        postsList.appendChild(postElement);
    });
}

function createPostElement(post) {
    const postElement = document.createElement('div');
    postElement.className = 'post';
    postElement.id = `post-${post.id}`;
    
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
    
    // Проверяем, есть ли текущий пользователь и является ли он администратором
    const isAdmin = currentUser && currentUser.isDeveloper;
    const canDelete = isAdmin && post.userId !== currentUser.id;
    const isLiked = currentUser && post.likes && post.likes.includes(currentUser.id);
    
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
                        ${post.userVerified ? '<span class="verified-badge"><svg width="14" height="14" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M128 10 L143 33 L170 25 L180 50 L207 45 L210 70 L235 80 L225 105 L245 125 L225 145 L235 170 L210 180 L207 205 L180 200 L170 225 L143 217 L128 240 L113 217 L86 225 L76 200 L49 205 L46 180 L21 170 L31 145 L11 125 L31 105 L21 80 L46 70 L49 45 L76 50 L86 25 L113 33 Z" fill="url(#goldGradient)" /><path d="M95 125 L120 150 L165 100" fill="none" stroke="#fff7c0" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><defs><radialGradient id="goldGradient" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="#FFD700"/><stop offset="40%" stop-color="#FFC300"/><stop offset="100%" stop-color="#B8860B"/></radialGradient></defs></svg></span>' : ''}
                        ${post.userDeveloper ? '<span class="developer-badge"><svg width="14" height="14" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="8" fill="url(#grad)"/><text x="24" y="30" text-anchor="middle" fill="url(#neon)" font-size="26" font-family="Arial, sans-serif" font-weight="bold" style="filter: drop-shadow(0 0 4px #C71585) drop-shadow(0 0 6px #8A2BE2);">E</text><defs><linearGradient id="grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="#8A2BE2"/><stop offset="1" stop-color="#C71585"/></linearGradient><linearGradient id="neon" x1="0" y1="0" x2="0" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFD1FF"/></linearGradient></defs></svg></span>' : ''}
                    </h4>
                    <div class="post-time">${new Date(post.createdAt).toLocaleString()}</div>
                </div>
                ${canDelete ? `
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
            <button class="post-action like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}" ${!currentUser ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M12,21.35L10.55,20.03C5.4,15.36 2,12.28 2,8.5C2,5.42 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.09C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.42 22,8.5C22,12.28 18.6,15.36 13.45,20.04L12,21.35Z"/>
                </svg>
                <span>${post.likes ? post.likes.length : 0}</span>
            </button>
            <button class="post-action comment-btn" data-post-id="${post.id}" ${!currentUser ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M12,23A1,1 0 0,1 11,22V19H7A2,2 0 0,1 5,17V7A2,2 0 0,1 7,5H21A2,2 0 0,1 23,7V17A2,2 0 0,1 21,19H16.9L13.2,22.71C13,22.89 12.76,23 12.5,23H12M13,17V20.08L16.08,17H21V7H7V17H13M3,15H1V3A2,2 0 0,1 3,1H19V3H3V15Z"/>
                </svg>
                <span>${post.comments ? post.comments.length : 0}</span>
            </button>
            <button class="post-action share-btn" data-post-id="${post.id}">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M18,16.08C17.24,16.08 16.56,16.38 16.04,16.85L8.91,12.7C8.96,12.47 9,12.24 9,12C9,11.76 8.96,11.53 8.91,11.3L15.96,7.19C16.5,7.69 17.21,8 18,8A3,3 0 0,0 21,5A3,3 0 0,0 18,2A3,3 0 0,0 15,5C15,5.24 15.04,5.47 15.09,5.7L8.04,9.81C7.5,9.31 6.79,9 6,9A3,3 0 0,0 3,12A3,3 0 0,0 6,15C6.79,15 7.5,14.69 8.04,14.19L15.16,18.34C15.11,18.55 15.08,18.77 15.08,19C15.08,20.61 16.39,21.91 18,21.91C19.61,21.91 20.92,20.61 20.92,19A2.92,2.92 0 0,0 18,16.08Z"/>
                </svg>
                <span>Поделиться</span>
            </button>
            <div class="post-views">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z"/>
                </svg>
                <span>${post.views || 0}</span>
            </div>
        </div>
    `;
    
    // Добавляем обработчики событий
    const likeBtn = postElement.querySelector('.like-btn');
    if (likeBtn && currentUser) {
        likeBtn.addEventListener('click', function() {
            if (!this.disabled) {
                toggleLike(post.id);
            }
        });
    }

    const commentBtn = postElement.querySelector('.comment-btn');
    if (commentBtn && currentUser) {
        commentBtn.addEventListener('click', function() {
            if (!this.disabled) {
                openCommentsModal(post.id);
            }
        });
    }

    const shareBtn = postElement.querySelector('.share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', function() {
            sharePost(post.id);
        });
    }

    const deleteBtn = postElement.querySelector('.delete-post-btn');
    if (deleteBtn && currentUser) {
        deleteBtn.addEventListener('click', function() {
            deletePost(post.id);
        });
    }
    
    return postElement;
}

async function publishPost() {
    if (!currentUser) {
        showNotification('Необходима авторизация', 'error');
        return;
    }

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
            if (typeof socket !== 'undefined' && socket && socket.readyState === WebSocket.OPEN) {
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
            if (typeof socket !== 'undefined' && socket && socket.readyState === WebSocket.OPEN) {
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

async function openCommentsModal(postId) {
    currentPostId = postId;
    const modal = document.getElementById('commentsModal');
    const title = document.getElementById('commentsModalTitle');
    const commentsList = document.getElementById('commentsList');
    
    title.textContent = 'Комментарии к посту';
    commentsList.innerHTML = '<div class="system-message">Загрузка комментариев...</div>';
    
    modal.style.display = 'block';
    
    await loadComments(postId);
    
    // Добавляем обработчики событий
    document.getElementById('closeCommentsModal').onclick = () => {
        modal.style.display = 'none';
    };
    
    document.getElementById('addCommentBtn').onclick = addComment;
    
    // Закрытие по клику вне модального окна
    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
}

async function loadComments(postId) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/posts/${postId}/comments`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        const commentsList = document.getElementById('commentsList');
        
        if (data.success) {
            renderComments(data.comments, commentsList);
        } else {
            commentsList.innerHTML = '<div class="system-message">Ошибка загрузки комментариев</div>';
        }
    } catch (error) {
        console.error('Ошибка загрузки комментариев:', error);
        document.getElementById('commentsList').innerHTML = '<div class="system-message">Ошибка загрузки комментариев</div>';
    }
}

function renderComments(comments, container) {
    container.innerHTML = '';
    
    if (comments.length === 0) {
        container.innerHTML = '<div class="system-message">Пока нет комментариев. Будьте первым!</div>';
        return;
    }
    
    comments.forEach(comment => {
        const commentElement = createCommentElement(comment);
        container.appendChild(commentElement);
    });
}

function createCommentElement(comment) {
    const commentElement = document.createElement('div');
    commentElement.className = 'comment';
    
    let repliesHtml = '';
    if (comment.replies && comment.replies.length > 0) {
        repliesHtml = `
            <div class="comment-replies">
                ${comment.replies.map(reply => `
                    <div class="comment reply">
                        <div class="comment-header">
                            <div class="comment-user">
                                <div class="comment-avatar">
                                    ${reply.userAvatar ? 
                                        `<img src="${reply.userAvatar}" alt="${reply.userName}" style="width: 24px; height: 24px; border-radius: 50%;">` : 
                                        reply.userName ? reply.userName.charAt(0).toUpperCase() : 'U'
                                    }
                                </div>
                                <div class="comment-user-info">
                                    <h5>${reply.userName || 'Неизвестный'}</h5>
                                    <div class="comment-time">${new Date(reply.createdAt).toLocaleString()}</div>
                                </div>
                            </div>
                        </div>
                        <div class="comment-text">${reply.text}</div>
                        <div class="comment-actions">
                            <button class="comment-action like-comment-btn ${reply.likes && currentUser && reply.likes.includes(currentUser.id) ? 'liked' : ''}" data-comment-id="${reply.id}" data-parent-id="${comment.id}" ${!currentUser ? 'disabled' : ''}>
                                <svg viewBox="0 0 24 24" width="14" height="14">
                                    <path fill="currentColor" d="M12,21.35L10.55,20.03C5.4,15.36 2,12.28 2,8.5C2,5.42 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.09C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.42 22,8.5C22,12.28 18.6,15.36 13.45,20.04L12,21.35Z"/>
                                </svg>
                                <span>${reply.likes ? reply.likes.length : 0}</span>
                            </button>
                            <button class="comment-action reply-comment-btn" data-comment-id="${comment.id}" ${!currentUser ? 'disabled' : ''}>
                                Ответить
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    commentElement.innerHTML = `
        <div class="comment-header">
            <div class="comment-user">
                <div class="comment-avatar">
                    ${comment.userAvatar ? 
                        `<img src="${comment.userAvatar}" alt="${comment.userName}" style="width: 32px; height: 32px; border-radius: 50%;">` : 
                        comment.userName ? comment.userName.charAt(0).toUpperCase() : 'U'
                    }
                </div>
                <div class="comment-user-info">
                    <h4>${comment.userName || 'Неизвестный'}</h4>
                    <div class="comment-time">${new Date(comment.createdAt).toLocaleString()}</div>
                </div>
            </div>
        </div>
        <div class="comment-text">${comment.text}</div>
        <div class="comment-actions">
            <button class="comment-action like-comment-btn ${comment.likes && currentUser && comment.likes.includes(currentUser.id) ? 'liked' : ''}" data-comment-id="${comment.id}" ${!currentUser ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" width="14" height="14">
                    <path fill="currentColor" d="M12,21.35L10.55,20.03C5.4,15.36 2,12.28 2,8.5C2,5.42 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.09C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.42 22,8.5C22,12.28 18.6,15.36 13.45,20.04L12,21.35Z"/>
                </svg>
                <span>${comment.likes ? comment.likes.length : 0}</span>
            </button>
            <button class="comment-action reply-comment-btn" data-comment-id="${comment.id}" ${!currentUser ? 'disabled' : ''}>
                Ответить
            </button>
        </div>
        ${repliesHtml}
        <div class="reply-section" id="reply-section-${comment.id}" style="display: none;">
            <textarea class="reply-text" placeholder="Напишите ответ..." rows="2"></textarea>
            <button class="send-btn add-reply-btn" data-comment-id="${comment.id}" ${!currentUser ? 'disabled' : ''}>Отправить ответ</button>
        </div>
    `;
    
    // Добавляем обработчики событий
    const likeBtn = commentElement.querySelector('.like-comment-btn');
    if (likeBtn && currentUser) {
        likeBtn.addEventListener('click', function() {
            if (!this.disabled) {
                const commentId = this.getAttribute('data-comment-id');
                const parentId = this.getAttribute('data-parent-id');
                toggleCommentLike(commentId, parentId);
            }
        });
    }
    
    const replyBtn = commentElement.querySelector('.reply-comment-btn');
    if (replyBtn && currentUser) {
        replyBtn.addEventListener('click', function() {
            if (!this.disabled) {
                const commentId = this.getAttribute('data-comment-id');
                const replySection = document.getElementById(`reply-section-${commentId}`);
                replySection.style.display = replySection.style.display === 'none' ? 'block' : 'none';
            }
        });
    }
    
    const addReplyBtn = commentElement.querySelector('.add-reply-btn');
    if (addReplyBtn && currentUser) {
        addReplyBtn.addEventListener('click', function() {
            if (!this.disabled) {
                const commentId = this.getAttribute('data-comment-id');
                addReply(commentId);
            }
        });
    }
    
    return commentElement;
}

async function addComment() {
    if (!currentUser) {
        showNotification('Необходима авторизация', 'error');
        return;
    }

    const commentText = document.getElementById('commentText');
    const text = commentText.value.trim();
    
    if (!text) {
        showNotification('Введите текст комментария', 'warning');
        return;
    }
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/posts/${currentPostId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                text: text
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            commentText.value = '';
            await loadComments(currentPostId);
            loadPosts(); // Обновляем счетчик комментариев в посте
            showNotification('Комментарий добавлен!', 'success');
        } else {
            showNotification('Ошибка добавления комментария: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка добавления комментария:', error);
        showNotification('Ошибка добавления комментария', 'error');
    }
}

async function addReply(commentId) {
    const replySection = document.getElementById(`reply-section-${commentId}`);
    const replyText = replySection.querySelector('.reply-text');
    const text = replyText.value.trim();
    
    if (!text) {
        showNotification('Введите текст ответа', 'warning');
        return;
    }
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/posts/${currentPostId}/comments/${commentId}/reply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                text: text
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            replyText.value = '';
            replySection.style.display = 'none';
            await loadComments(currentPostId);
            showNotification('Ответ добавлен!', 'success');
        } else {
            showNotification('Ошибка добавления ответа: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка добавления ответа:', error);
        showNotification('Ошибка добавления ответа', 'error');
    }
}

async function toggleCommentLike(commentId, parentId = null) {
    try {
        const token = localStorage.getItem('authToken');
        const url = parentId ? 
            `/api/posts/${currentPostId}/comments/${parentId}/replies/${commentId}/like` :
            `/api/posts/${currentPostId}/comments/${commentId}/like`;
            
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            await loadComments(currentPostId);
        } else {
            showNotification('Ошибка лайка комментария: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка лайка комментария:', error);
        showNotification('Ошибка лайка комментария', 'error');
    }
}

function sharePost(postId) {
    const postUrl = `https://epic-messenger.onrender.com/post/${postId}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Посмотрите этот пост в Epic Messenger',
            text: 'Интересный пост в Epic Messenger',
            url: postUrl
        })
        .then(() => console.log('Успешный шеринг'))
        .catch((error) => {
            console.log('Ошибка шеринга:', error);
            copyToClipboard(postUrl);
        });
    } else {
        copyToClipboard(postUrl);
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Ссылка скопирована в буфер обмена!', 'success');
    }).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('Ссылка скопирована в буфер обмена!', 'success');
    });
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

// Вспомогательные функции
function processMentions(text) {
    return text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
}

function openImageModal(imageUrl) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;
    
    modal.innerHTML = `
        <div style="position: relative;">
            <img src="${imageUrl}" style="max-width: 90vw; max-height: 90vh;">
            <button onclick="this.parentElement.parentElement.remove()" style="
                position: absolute;
                top: -40px;
                right: 0;
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
            ">×</button>
        </div>
    `;
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    };
    
    document.body.appendChild(modal);
}

// Инициализация постов
async function initializePosts() {
    console.log('🚀 Инициализация постов...');
    
    // Сначала загружаем данные пользователя
    try {
        const token = localStorage.getItem('authToken');
        if (token) {
            const response = await fetch('/api/current-user', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    currentUser = data.user;
                    console.log('✅ Пользователь загружен:', currentUser.username);
                    
                    // Обновляем интерфейс пользователя
                    updateUserInterface();
                }
            }
        }
    } catch (error) {
        console.log('⚠️ Не удалось загрузить данные пользователя:', error);
    }
    
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
    await loadPosts();
    
    console.log('✅ Инициализация постов завершена');
}

function updateUserInterface() {
    // Обновляем аватар и имя в форме создания поста
    const postUserAvatar = document.getElementById('postUserAvatar');
    const postUserName = document.getElementById('postUserName');
    
    if (postUserAvatar && currentUser) {
        if (currentUser.avatar) {
            postUserAvatar.innerHTML = `<img src="${currentUser.avatar}" alt="${currentUser.displayName}" style="width: 100%; height: 100%; object-fit: cover;">`;
        } else {
            postUserAvatar.textContent = currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'U';
        }
    }
    
    if (postUserName && currentUser) {
        postUserName.textContent = currentUser.displayName || 'Вы';
    }
    
    // Показываем/скрываем кнопку админ-панели
    const adminPanelBtn = document.getElementById('adminPanelBtn');
    if (adminPanelBtn && currentUser) {
        adminPanelBtn.style.display = currentUser.isDeveloper ? 'flex' : 'none';
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM загружен, запускаем инициализацию...');
    initializePosts();
});
