// Функции для работы с постами

let currentPostComments = null;

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
        } else {
            document.getElementById('postsList').innerHTML = `
                <div class="system-message error">
                    Ошибка загрузки постов: ${data.message}
                    <button class="retry-btn" onclick="loadPosts()">Повторить</button>
                </div>
            `;
        }
    } catch (error) {
        console.error('Ошибка загрузки постов:', error);
        document.getElementById('postsList').innerHTML = `
            <div class="system-message error">
                Ошибка загрузки постов
                <button class="retry-btn" onclick="loadPosts()">Повторить</button>
            </div>
        `;
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
    
    // Форматируем время
    const postTime = formatPostTime(new Date(post.createdAt));
    
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
                    <div class="post-time">${postTime}</div>
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
            <button class="post-action comment-btn" data-post-id="${post.id}">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M12,23A1,1 0 0,1 11,22V19H7A2,2 0 0,1 5,17V7A2,2 0 0,1 7,5H21A2,2 0 0,1 23,7V17A2,2 0 0,1 21,19H16.9L13.2,22.71C13,22.89 12.76,23 12.5,23H12Z"/>
                </svg>
                <span>${post.comments ? post.comments.length : 0}</span>
            </button>
            <button class="post-action share-btn" data-post-id="${post.id}">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M18,16.08C17.24,16.08 16.56,16.38 16.04,16.85L8.91,12.7C8.96,12.47 9,12.24 9,12C9,11.76 8.96,11.53 8.91,11.3L15.96,7.19C16.5,7.69 17.21,8 18,8A3,3 0 0,0 21,5A3,3 0 0,0 18,2A3,3 0 0,0 15,5C15,5.24 15.04,5.47 15.09,5.7L8.04,9.81C7.5,9.31 6.79,9 6,9A3,3 0 0,0 3,12A3,3 0 0,0 6,15C6.79,15 7.5,14.69 8.04,14.19L15.16,18.34C15.11,18.55 15.08,18.77 15.08,19C15.08,20.61 16.39,21.91 18,21.91C19.61,21.91 20.92,20.61 20.92,19A2.92,2.92 0 0,0 18,16.08Z"/>
                </svg>
                Поделиться
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

    const commentBtn = postElement.querySelector('.comment-btn');
    if (commentBtn) {
        commentBtn.addEventListener('click', function() {
            openCommentsModal(post);
        });
    }

    const shareBtn = postElement.querySelector('.share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', function() {
            sharePost(post);
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

function formatPostTime(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'только что';
    if (minutes < 60) return `${minutes} мин назад`;
    if (hours < 24) return `${hours} ч назад`;
    if (days < 7) return `${days} дн назад`;
    
    return date.toLocaleDateString();
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
        const publishBtn = document.getElementById('publishPostBtn');
        const originalText = publishBtn.textContent;
        publishBtn.innerHTML = '<div class="loading-spinner"></div> Публикация...';
        publishBtn.disabled = true;
        
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
    } finally {
        const publishBtn = document.getElementById('publishPostBtn');
        publishBtn.textContent = 'Опубликовать';
        publishBtn.disabled = false;
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
        const response = await fetch(`/api/posts?postId=${postId}`, {
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

// Функции для комментариев
async function openCommentsModal(post) {
    currentPostComments = post;
    const modal = document.getElementById('commentsModal');
    const title = document.getElementById('commentsModalTitle');
    const commentsList = document.getElementById('commentsList');
    
    title.textContent = `Комментарии к посту от ${post.userName}`;
    commentsList.innerHTML = '<div class="system-message">Загрузка комментариев...</div>';
    
    modal.style.display = 'block';
    
    await loadComments(post.id);
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
            renderComments(data.comments);
        } else {
            commentsList.innerHTML = `<div class="system-message error">Ошибка загрузки комментариев: ${data.message}</div>`;
        }
    } catch (error) {
        console.error('Ошибка загрузки комментариев:', error);
        document.getElementById('commentsList').innerHTML = '<div class="system-message error">Ошибка загрузки комментариев</div>';
    }
}

function renderComments(comments) {
    const commentsList = document.getElementById('commentsList');
    
    if (!comments || comments.length === 0) {
        commentsList.innerHTML = '<div class="system-message">Пока нет комментариев. Будьте первым!</div>';
        return;
    }
    
    commentsList.innerHTML = '';
    
    comments.forEach(comment => {
        const commentElement = createCommentElement(comment);
        commentsList.appendChild(commentElement);
    });
}

function createCommentElement(comment) {
    const commentElement = document.createElement('div');
    commentElement.className = 'comment';
    commentElement.id = `comment-${comment.id}`;
    
    const commentTime = formatPostTime(new Date(comment.createdAt));
    const isLiked = comment.likes && comment.likes.includes(currentUser.id);
    
    let repliesHtml = '';
    if (comment.replies && comment.replies.length > 0) {
        repliesHtml = '<div class="comment-replies">';
        comment.replies.forEach(reply => {
            const replyTime = formatPostTime(new Date(reply.createdAt));
            const replyIsLiked = reply.likes && reply.likes.includes(currentUser.id);
            repliesHtml += `
                <div class="comment reply" id="reply-${reply.id}">
                    <div class="comment-header">
                        <div class="comment-user">
                            <div class="comment-avatar">
                                ${reply.userAvatar ? 
                                    `<img src="${reply.userAvatar}" alt="${reply.userName}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                                    reply.userName ? reply.userName.charAt(0).toUpperCase() : 'U'
                                }
                            </div>
                            <div class="comment-user-info">
                                <h5>${reply.userName || 'Неизвестный'}</h5>
                                <div class="comment-time">${replyTime}</div>
                            </div>
                        </div>
                    </div>
                    <div class="comment-text">${reply.text}</div>
                    <div class="comment-actions">
                        <button class="comment-action like-reply-btn ${replyIsLiked ? 'liked' : ''}" 
                                data-post-id="${currentPostComments.id}" 
                                data-comment-id="${comment.id}"
                                data-reply-id="${reply.id}">
                            <svg viewBox="0 0 24 24" width="14" height="14">
                                <path fill="currentColor" d="M12,21.35L10.55,20.03C5.4,15.36 2,12.28 2,8.5C2,5.42 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.09C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.42 22,8.5C22,12.28 18.6,15.36 13.45,20.04L12,21.35Z"/>
                            </svg>
                            <span>${reply.likes ? reply.likes.length : 0}</span>
                        </button>
                    </div>
                </div>
            `;
        });
        repliesHtml += '</div>';
    }
    
    commentElement.innerHTML = `
        <div class="comment-header">
            <div class="comment-user">
                <div class="comment-avatar">
                    ${comment.userAvatar ? 
                        `<img src="${comment.userAvatar}" alt="${comment.userName}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                        comment.userName ? comment.userName.charAt(0).toUpperCase() : 'U'
                    }
                </div>
                <div class="comment-user-info">
                    <h4>${comment.userName || 'Неизвестный'}</h4>
                    <div class="comment-time">${commentTime}</div>
                </div>
            </div>
        </div>
        <div class="comment-text">${comment.text}</div>
        <div class="comment-actions">
            <button class="comment-action like-comment-btn ${isLiked ? 'liked' : ''}" 
                    data-post-id="${currentPostComments.id}" 
                    data-comment-id="${comment.id}">
                <svg viewBox="0 0 24 24" width="14" height="14">
                    <path fill="currentColor" d="M12,21.35L10.55,20.03C5.4,15.36 2,12.28 2,8.5C2,5.42 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.09C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.42 22,8.5C22,12.28 18.6,15.36 13.45,20.04L12,21.35Z"/>
                </svg>
                <span>${comment.likes ? comment.likes.length : 0}</span>
            </button>
            <button class="comment-action reply-btn" data-comment-id="${comment.id}">
                <svg viewBox="0 0 24 24" width="14" height="14">
                    <path fill="currentColor" d="M10,9V5L3,12L10,19V14.9C15,14.9 18.5,16.5 21,20C20,15 17,10 10,9Z"/>
                </svg>
                Ответить
            </button>
        </div>
        ${repliesHtml}
        <div class="reply-section" id="reply-section-${comment.id}" style="display: none;">
            <textarea class="reply-text" id="reply-text-${comment.id}" placeholder="Напишите ответ..."></textarea>
            <button class="send-btn" onclick="addReply('${currentPostComments.id}', '${comment.id}')">Отправить ответ</button>
        </div>
    `;
    
    // Добавляем обработчики событий
    const likeBtn = commentElement.querySelector('.like-comment-btn');
    if (likeBtn) {
        likeBtn.addEventListener('click', function() {
            likeComment(currentPostComments.id, comment.id);
        });
    }
    
    const replyBtn = commentElement.querySelector('.reply-btn');
    if (replyBtn) {
        replyBtn.addEventListener('click', function() {
            const replySection = document.getElementById(`reply-section-${comment.id}`);
            replySection.style.display = replySection.style.display === 'none' ? 'block' : 'none';
        });
    }
    
    const likeReplyBtns = commentElement.querySelectorAll('.like-reply-btn');
    likeReplyBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const replyId = this.dataset.replyId;
            likeReply(currentPostComments.id, comment.id, replyId);
        });
    });
    
    return commentElement;
}

async function addComment() {
    const commentText = document.getElementById('commentText');
    const text = commentText.value.trim();
    
    if (!text) {
        showNotification('Введите текст комментария', 'warning');
        return;
    }
    
    try {
        const addBtn = document.getElementById('addCommentBtn');
        const originalText = addBtn.textContent;
        addBtn.innerHTML = '<div class="loading-spinner"></div> Отправка...';
        addBtn.disabled = true;
        
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/posts/${currentPostComments.id}/comments`, {
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
            await loadComments(currentPostComments.id);
            showNotification('Комментарий добавлен!', 'success');
            
            // Обновляем счетчик комментариев в посте
            loadPosts();
        } else {
            showNotification('Ошибка добавления комментария: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка добавления комментария:', error);
        showNotification('Ошибка добавления комментария', 'error');
    } finally {
        const addBtn = document.getElementById('addCommentBtn');
        addBtn.textContent = 'Отправить';
        addBtn.disabled = false;
    }
}

async function addReply(postId, commentId) {
    const replyText = document.getElementById(`reply-text-${commentId}`);
    const text = replyText.value.trim();
    
    if (!text) {
        showNotification('Введите текст ответа', 'warning');
        return;
    }
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/posts/${postId}/comments/${commentId}/reply`, {
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
            document.getElementById(`reply-section-${commentId}`).style.display = 'none';
            await loadComments(postId);
            showNotification('Ответ добавлен!', 'success');
        } else {
            showNotification('Ошибка добавления ответа: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка добавления ответа:', error);
        showNotification('Ошибка добавления ответа', 'error');
    }
}

async function likeComment(postId, commentId) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/posts/${postId}/comments/${commentId}/like`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            await loadComments(postId);
        } else {
            showNotification('Ошибка лайка комментария: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка лайка комментария:', error);
        showNotification('Ошибка лайка комментария', 'error');
    }
}

async function likeReply(postId, commentId, replyId) {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`/api/posts/${postId}/comments/${commentId}/replies/${replyId}/like`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            await loadComments(postId);
        } else {
            showNotification('Ошибка лайка ответа: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Ошибка лайка ответа:', error);
        showNotification('Ошибка лайка ответа', 'error');
    }
}

// Функция шеринга поста
function sharePost(post) {
    const postUrl = `${window.location.origin}/post/${post.id}`;
    const shareText = `Посмотрите этот пост от ${post.userName} в Epic Messenger:\n\n${post.text ? post.text.substring(0, 100) + '...' : 'Пост с медиафайлом'}`;
    
    if (navigator.share) {
        // Используем Web Share API если доступен
        navigator.share({
            title: 'Пост из Epic Messenger',
            text: shareText,
            url: postUrl
        }).then(() => {
            showNotification('Пост успешно поделен!', 'success');
        }).catch((error) => {
            console.log('Ошибка шеринга:', error);
            fallbackShare(postUrl, shareText);
        });
    } else {
        // Fallback для браузеров без поддержки Web Share API
        fallbackShare(postUrl, shareText);
    }
}

function fallbackShare(url, text) {
    // Создаем временный textarea для копирования ссылки
    const tempTextArea = document.createElement('textarea');
    tempTextArea.value = `${text}\n\n${url}`;
    document.body.appendChild(tempTextArea);
    tempTextArea.select();
    tempTextArea.setSelectionRange(0, 99999); // Для мобильных устройств
    
    try {
        const successful = document.execCommand('copy');
        document.body.removeChild(tempTextArea);
        
        if (successful) {
            showNotification('Ссылка на пост скопирована в буфер обмена!', 'success');
        } else {
            showNotification('Не удалось скопировать ссылку', 'error');
        }
    } catch (err) {
        document.body.removeChild(tempTextArea);
        showNotification('Не удалось скопировать ссылку', 'error');
    }
}

// Инициализация постов
function initializePosts() {
    const publishPostBtn = document.getElementById('publishPostBtn');
    const addFileBtn = document.getElementById('addFileBtn');
    const addCommentBtn = document.getElementById('addCommentBtn');
    const closeCommentsModal = document.getElementById('closeCommentsModal');
    
    if (publishPostBtn) {
        publishPostBtn.addEventListener('click', publishPost);
    }
    
    if (addFileBtn) {
        addFileBtn.addEventListener('click', function() {
            document.getElementById('postFileInput').click();
        });
    }
    
    if (addCommentBtn) {
        addCommentBtn.addEventListener('click', addComment);
    }
    
    if (closeCommentsModal) {
        closeCommentsModal.addEventListener('click', function() {
            document.getElementById('commentsModal').style.display = 'none';
        });
    }
    
    // Закрытие модального окна при клике вне его
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('commentsModal');
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    // Обработка нажатия Enter в поле комментария
    const commentText = document.getElementById('commentText');
    if (commentText) {
        commentText.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                addComment();
            }
        });
    }
    
    // Загружаем посты при инициализации
    loadPosts();
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initializePosts();
});
