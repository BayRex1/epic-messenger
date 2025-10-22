// public/call-ui.js
class CallUI {
    constructor() {
        this.callModal = null;
        this.isInCall = false;
        this.currentCallId = null;
        this.statsInterval = null;
        
        this.createCallModal();
        this.setupEventListeners();
    }

    createCallModal() {
        this.callModal = document.createElement('div');
        this.callModal.className = 'call-modal-overlay';
        this.callModal.innerHTML = `
            <div class="call-modal">
                <div class="call-header">
                    <div class="call-info">
                        <div class="call-avatar" id="callAvatar"></div>
                        <div class="call-details">
                            <div class="call-user-name" id="callUserName"></div>
                            <div class="call-status" id="callStatus">Установка соединения...</div>
                            <div class="call-timer" id="callTimer">00:00</div>
                            <div class="call-stats" id="callStats">
                                <span class="ping">Пинг: <span id="callPing">--</span>ms</span>
                                <span class="quality">Качество: <span id="callQuality">--</span></span>
                            </div>
                        </div>
                    </div>
                    <button class="call-close-btn" id="endCallBtn">
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
                        </svg>
                    </button>
                </div>
                
                <div class="call-video-container">
                    <div class="video-remote">
                        <video id="remoteVideo" autoplay playsinline></video>
                        <div class="video-overlay">
                            <div class="user-info">
                                <div class="user-avatar" id="remoteUserAvatar"></div>
                                <div class="user-name" id="remoteUserName"></div>
                            </div>
                        </div>
                    </div>
                    <div class="video-local">
                        <video id="localVideo" autoplay playsinline muted></video>
                    </div>
                </div>
                
                <div class="call-controls">
                    <button class="control-btn audio-toggle" id="toggleAudio" title="Вкл/Выкл микрофон">
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path fill="currentColor" d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/>
                        </svg>
                    </button>
                    
                    <button class="control-btn video-toggle" id="toggleVideo" title="Вкл/Выкл камеру">
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path fill="currentColor" d="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z"/>
                        </svg>
                    </button>
                    
                    <button class="control-btn switch-camera" id="switchCamera" title="Переключить камеру">
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path fill="currentColor" d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z"/>
                        </svg>
                    </button>
                    
                    <button class="control-btn end-call" id="endCallBtnMain">
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path fill="currentColor" d="M12,9C10.4,9 8.85,9.25 7.4,9.72V12.82C7.4,13.22 7.17,13.56 6.84,13.72C5.86,14.21 4.97,14.84 4.17,15.57C4,15.75 3.75,15.86 3.5,15.86C3.2,15.86 2.95,15.74 2.77,15.56L0.29,13.08C0.11,12.9 0,12.65 0,12.38C0,12.1 0.11,11.85 0.29,11.67C3.34,8.77 7.46,7 12,7C16.54,7 20.66,8.77 23.71,11.67C23.89,11.85 24,12.1 24,12.38C24,12.65 23.89,12.9 23.71,13.08L21.23,15.56C21.05,15.74 20.8,15.86 20.5,15.86C20.25,15.86 20,15.75 19.82,15.57C19.03,14.84 18.14,14.21 17.16,13.72C16.83,13.56 16.6,13.22 16.6,12.82V9.72C15.15,9.25 13.6,9 12,9Z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.callModal);
        this.setupCallControls();
    }

    setupCallControls() {
        // Кнопка завершения звонка
        document.getElementById('endCallBtn').addEventListener('click', () => this.endCall());
        document.getElementById('endCallBtnMain').addEventListener('click', () => this.endCall());
        
        // Переключение аудио/видео
        document.getElementById('toggleAudio').addEventListener('click', () => this.toggleAudio());
        document.getElementById('toggleVideo').addEventListener('click', () => this.toggleVideo());
        document.getElementById('switchCamera').addEventListener('click', () => this.switchCamera());
    }

    setupEventListeners() {
        // Обработка входящих звонков через WebSocket
        if (window.websocket) {
            window.websocket.on('incoming_call', (data) => {
                this.showIncomingCall(data);
            });
            
            window.websocket.on('call_accepted', (data) => {
                this.handleCallAccepted(data);
            });
            
            window.websocket.on('call_rejected', (data) => {
                this.handleCallRejected(data);
            });
            
            window.websocket.on('call_ended', (data) => {
                this.handleCallEnded(data);
            });
            
            window.websocket.on('ice_candidate', (data) => {
                this.handleIceCandidate(data);
            });
        }
    }

    // Исходящий звонок
    async startCall(targetUser, isVideo = true) {
        try {
            this.currentCallId = null;
            this.showCallModal(targetUser, isVideo, true);
            
            const callData = await window.webrtcManager.startCall(targetUser.id, isVideo);
            callData.targetUserId = targetUser.id;
            
            const response = await fetch('/api/call/offer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(callData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.currentCallId = result.callId;
                this.updateCallStatus('Звонок...');
            } else {
                throw new Error(result.message);
            }
            
        } catch (error) {
            this.showNotification(`Ошибка звонка: ${error.message}`, 'error');
            this.hideCallModal();
        }
    }

    // Входящий звонок
    showIncomingCall(data) {
        const incomingCallModal = document.createElement('div');
        incomingCallModal.className = 'incoming-call-overlay';
        incomingCallModal.innerHTML = `
            <div class="incoming-call-modal">
                <div class="caller-info">
                    <div class="caller-avatar">
                        ${data.callerAvatar ? 
                            `<img src="${data.callerAvatar}" alt="${data.callerName}">` : 
                            data.callerName.charAt(0).toUpperCase()
                        }
                    </div>
                    <div class="caller-details">
                        <div class="caller-name">${data.callerName}</div>
                        <div class="call-type">${data.isVideo ? 'Видеозвонок' : 'Аудиозвонок'}</div>
                    </div>
                </div>
                <div class="incoming-call-controls">
                    <button class="call-btn reject-call" id="rejectCallBtn">
                        <svg viewBox="0 0 24 24" width="32" height="32">
                            <path fill="currentColor" d="M12,2C17.53,2 22,6.47 22,12C22,17.53 17.53,22 12,22C6.47,22 2,17.53 2,12C2,6.47 6.47,2 12,2M15.59,7L12,10.59L8.41,7L7,8.41L10.59,12L7,15.59L8.41,17L12,13.41L15.59,17L17,15.59L13.41,12L17,8.41L15.59,7Z"/>
                        </svg>
                    </button>
                    <button class="call-btn accept-call" id="acceptCallBtn">
                        <svg viewBox="0 0 24 24" width="32" height="32">
                            <path fill="currentColor" d="M14,19H18V5H14M6,19H10V5H6V19Z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(incomingCallModal);
        
        // Воспроизводим мелодию звонка
        this.playRingtone();
        
        // Обработчики кнопок
        document.getElementById('rejectCallBtn').addEventListener('click', () => {
            this.rejectCall(data.callId);
            this.stopRingtone();
            incomingCallModal.remove();
        });
        
        document.getElementById('acceptCallBtn').addEventListener('click', async () => {
            this.stopRingtone();
            incomingCallModal.remove();
            await this.acceptCall(data);
        });
        
        // Автоматическое отклонение через 30 секунд
        setTimeout(() => {
            if (incomingCallModal.parentNode) {
                this.rejectCall(data.callId, 'Время вышло');
                this.stopRingtone();
                incomingCallModal.remove();
            }
        }, 30000);
    }

    async acceptCall(callData) {
        try {
            this.currentCallId = callData.callId;
            
            const answer = await window.webrtcManager.acceptCall(callData.offer, callData.isVideo);
            
            const response = await fetch('/api/call/answer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({
                    callId: callData.callId,
                    answer: answer.answer
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showCallModal(
                    { 
                        id: callData.callerId, 
                        displayName: callData.callerName,
                        avatar: callData.callerAvatar 
                    }, 
                    callData.isVideo, 
                    false
                );
                this.updateCallStatus('Соединение установлено');
            } else {
                throw new Error(result.message);
            }
            
        } catch (error) {
            this.showNotification(`Ошибка принятия звонка: ${error.message}`, 'error');
            this.hideCallModal();
        }
    }

    rejectCall(callId, reason = 'Отклонено') {
        fetch('/api/call/reject', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({
                callId: callId,
                reason: reason
            })
        });
    }

    showCallModal(user, isVideo, isCaller) {
        this.isInCall = true;
        this.callModal.style.display = 'flex';
        
        // Обновляем информацию о пользователе
        document.getElementById('callUserName').textContent = user.displayName;
        document.getElementById('remoteUserName').textContent = user.displayName;
        
        const avatarElement = document.getElementById('callAvatar');
        const remoteAvatarElement = document.getElementById('remoteUserAvatar');
        
        if (user.avatar) {
            avatarElement.innerHTML = `<img src="${user.avatar}" alt="${user.displayName}">`;
            remoteAvatarElement.innerHTML = `<img src="${user.avatar}" alt="${user.displayName}">`;
        } else {
            avatarElement.textContent = user.displayName.charAt(0).toUpperCase();
            remoteAvatarElement.textContent = user.displayName.charAt(0).toUpperCase();
        }
        
        // Настраиваем WebRTC callbacks
        window.webrtcManager.onLocalStream = (stream) => {
            document.getElementById('localVideo').srcObject = stream;
        };
        
        window.webrtcManager.onRemoteStream = (stream) => {
            document.getElementById('remoteVideo').srcObject = stream;
            this.updateCallStatus('Разговор');
            this.startCallTimer();
            this.startStatsMonitoring();
        };
        
        window.webrtcManager.onIceCandidate = (candidate) => {
            this.sendIceCandidate(candidate);
        };
        
        window.webrtcManager.onCallConnected = () => {
            this.updateCallStatus('Разговор');
        };
        
        window.webrtcManager.onCallFailed = () => {
            this.showNotification('Ошибка соединения', 'error');
            this.endCall();
        };
        
        window.webrtcManager.onCallEnded = () => {
            this.endCall();
        };
        
        this.updateCallStatus(isCaller ? 'Звонок...' : 'Принятие звонка...');
    }

    hideCallModal() {
        this.isInCall = false;
        this.currentCallId = null;
        this.callModal.style.display = 'none';
        this.stopCallTimer();
        this.stopStatsMonitoring();
        
        if (window.webrtcManager) {
            window.webrtcManager.endCall();
        }
    }

    async endCall() {
        if (this.currentCallId) {
            await fetch('/api/call/end', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({
                    callId: this.currentCallId
                })
            });
        }
        
        this.hideCallModal();
    }

    async toggleAudio() {
        const isEnabled = window.webrtcManager.toggleAudio();
        const btn = document.getElementById('toggleAudio');
        btn.classList.toggle('disabled', !isEnabled);
        this.showNotification(isEnabled ? 'Микрофон включен' : 'Микрофон выключен', 'success');
    }

    async toggleVideo() {
        const isEnabled = window.webrtcManager.toggleVideo();
        const btn = document.getElementById('toggleVideo');
        const localVideo = document.getElementById('localVideo');
        
        btn.classList.toggle('disabled', !isEnabled);
        localVideo.style.opacity = isEnabled ? '1' : '0.5';
        this.showNotification(isEnabled ? 'Камера включена' : 'Камера выключена', 'success');
    }

    async switchCamera() {
        await window.webrtcManager.switchCamera();
        this.showNotification('Камера переключена', 'success');
    }

    handleCallAccepted(data) {
        window.webrtcManager.handleAnswer(data.answer);
        this.updateCallStatus('Соединение установлено');
    }

    handleCallRejected(data) {
        this.showNotification(`Звонок отклонен: ${data.reason}`, 'error');
        this.hideCallModal();
    }

    handleCallEnded(data) {
        this.showNotification('Собеседник завершил звонок', 'info');
        this.hideCallModal();
    }

    async handleIceCandidate(data) {
        if (window.webrtcManager.peerConnection) {
            await window.webrtcManager.peerConnection.addIceCandidate(data.candidate);
        }
    }

    async sendIceCandidate(candidate) {
        if (!this.currentCallId) return;
        
        await fetch('/api/call/ice-candidate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({
                callId: this.currentCallId,
                candidate: candidate,
                targetUserId: this.getOtherUserId()
            })
        });
    }

    getOtherUserId() {
        // Здесь должна быть логика получения ID другого пользователя
        // В реальном приложении это будет храниться в состоянии звонка
        return null;
    }

    startCallTimer() {
        let seconds = 0;
        this.callTimerInterval = setInterval(() => {
            seconds++;
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            document.getElementById('callTimer').textContent = 
                `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    stopCallTimer() {
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
    }

    async startStatsMonitoring() {
        this.statsInterval = setInterval(async () => {
            const stats = await window.webrtcManager.getConnectionStats();
            if (stats) {
                document.getElementById('callPing').textContent = 
                    stats.connection.rtt ? Math.round(stats.connection.rtt) : '--';
                
                const quality = this.calculateQuality(stats);
                document.getElementById('callQuality').textContent = quality;
            }
        }, 2000);
    }

    stopStatsMonitoring() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
    }

    calculateQuality(stats) {
        if (!stats.connection.rtt) return '--';
        
        const rtt = stats.connection.rtt;
        if (rtt < 100) return 'Отличное';
        if (rtt < 200) return 'Хорошее';
        if (rtt < 400) return 'Среднее';
        return 'Плохое';
    }

    updateCallStatus(status) {
        document.getElementById('callStatus').textContent = status;
    }

    playRingtone() {
        // Создаем простую мелодию звонка с помощью Web Audio API
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.5);
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0, audioContext.currentTime + 1);
            
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 1);
            
            this.ringtoneInterval = setInterval(() => {
                const newOscillator = audioContext.createOscillator();
                const newGainNode = audioContext.createGain();
                
                newOscillator.connect(newGainNode);
                newGainNode.connect(audioContext.destination);
                
                newOscillator.type = 'sine';
                newOscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                newOscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.5);
                
                newGainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                newGainNode.gain.setValueAtTime(0, audioContext.currentTime + 1);
                
                newOscillator.start();
                newOscillator.stop(audioContext.currentTime + 1);
            }, 2000);
            
        } catch (error) {
            console.error('Ошибка воспроизведения мелодии:', error);
        }
    }

    stopRingtone() {
        if (this.ringtoneInterval) {
            clearInterval(this.ringtoneInterval);
            this.ringtoneInterval = null;
        }
    }

    showNotification(message, type = 'info') {
        // Ваша существующая функция показа уведомлений
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            console.log(`${type}: ${message}`);
        }
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    window.callUI = new CallUI();
});
