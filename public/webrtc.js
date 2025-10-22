// public/webrtc.js
class WebRTCManager {
    constructor() {
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.isCaller = false;
        this.currentCall = null;
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];
        
        this.initializeMediaDevices();
    }

    async initializeMediaDevices() {
        try {
            // Проверяем доступность медиаустройств
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Ваш браузер не поддерживает видеозвонки');
            }
        } catch (error) {
            console.error('Ошибка инициализации медиаустройств:', error);
        }
    }

    // Инициализация звонка
    async startCall(targetUserId, isVideo = true) {
        try {
            this.isCaller = true;
            this.currentCall = {
                targetUserId,
                isVideo,
                startTime: Date.now(),
                status: 'calling'
            };

            // Получаем медиапоток
            await this.getLocalStream(isVideo);
            
            // Создаем peer connection
            this.createPeerConnection();
            
            // Добавляем локальный поток
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            // Создаем offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            // Отправляем offer через WebSocket
            return {
                type: 'call_offer',
                targetUserId,
                offer: offer,
                isVideo: isVideo
            };

        } catch (error) {
            console.error('Ошибка начала звонка:', error);
            this.endCall();
            throw error;
        }
    }

    // Принятие входящего звонка
    async acceptCall(offer, isVideo = true) {
        try {
            this.isCaller = false;
            this.currentCall = {
                isVideo,
                startTime: Date.now(),
                status: 'connected'
            };

            await this.getLocalStream(isVideo);
            this.createPeerConnection();
            
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            await this.peerConnection.setRemoteDescription(offer);
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            return {
                type: 'call_answer',
                answer: answer
            };

        } catch (error) {
            console.error('Ошибка принятия звонка:', error);
            this.endCall();
            throw error;
        }
    }

    // Обработка ответа на звонок
    async handleAnswer(answer) {
        try {
            await this.peerConnection.setRemoteDescription(answer);
        } catch (error) {
            console.error('Ошибка обработки ответа:', error);
        }
    }

    // Создание peer connection
    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection({
            iceServers: this.iceServers
        });

        // Обработка входящего потока
        this.peerConnection.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            this.onRemoteStream(this.remoteStream);
        };

        // Обработка ICE кандидатов
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.onIceCandidate(event.candidate);
            }
        };

        // Обработка изменения состояния соединения
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            
            switch(this.peerConnection.connectionState) {
                case 'connected':
                    this.onCallConnected();
                    break;
                case 'disconnected':
                case 'failed':
                    this.onCallFailed();
                    break;
                case 'closed':
                    this.onCallEnded();
                    break;
            }
        };
    }

    // Получение локального медиапотока
    async getLocalStream(isVideo = true) {
        try {
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: isVideo ? {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                } : false
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.onLocalStream(this.localStream);
            
            return this.localStream;
        } catch (error) {
            console.error('Ошибка получения медиапотока:', error);
            throw new Error('Не удалось получить доступ к камере/микрофону');
        }
    }

    // Завершение звонка
    endCall() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        if (this.currentCall) {
            this.currentCall.endTime = Date.now();
            this.onCallEnded();
            this.currentCall = null;
        }

        this.isCaller = false;
    }

    // Переключение камеры
    async switchCamera() {
        if (!this.localStream) return;

        const videoTrack = this.localStream.getVideoTracks()[0];
        if (!videoTrack) return;

        const constraints = videoTrack.getConstraints();
        constraints.facingMode = constraints.facingMode === 'user' ? 'environment' : 'user';

        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: constraints,
                audio: true
            });

            const newVideoTrack = newStream.getVideoTracks()[0];
            const sender = this.peerConnection.getSenders().find(s => 
                s.track && s.track.kind === 'video'
            );

            if (sender) {
                await sender.replaceTrack(newVideoTrack);
            }

            // Обновляем локальный поток
            this.localStream.getVideoTracks().forEach(track => track.stop());
            this.localStream.removeTrack(videoTrack);
            this.localStream.addTrack(newVideoTrack);

            this.onLocalStream(this.localStream);

        } catch (error) {
            console.error('Ошибка переключения камеры:', error);
        }
    }

    // Включение/выключение видео
    toggleVideo() {
        if (!this.localStream) return;
        
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            return videoTrack.enabled;
        }
        return false;
    }

    // Включение/выключение микрофона
    toggleAudio() {
        if (!this.localStream) return;
        
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            return audioTrack.enabled;
        }
        return false;
    }

    // Получение статистики соединения
    async getConnectionStats() {
        if (!this.peerConnection) return null;

        try {
            const stats = await this.peerConnection.getStats();
            const result = {
                audio: {},
                video: {},
                connection: {}
            };

            stats.forEach(report => {
                if (report.type === 'inbound-rtp' && report.kind === 'audio') {
                    result.audio.bitrate = report.bytesReceived * 8 / 1000; // kbps
                    result.audio.packetsLost = report.packetsLost;
                } else if (report.type === 'inbound-rtp' && report.kind === 'video') {
                    result.video.bitrate = report.bytesReceived * 8 / 1000; // kbps
                    result.video.packetsLost = report.packetsLost;
                    result.video.frameRate = report.framesPerSecond;
                } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    result.connection.rtt = report.currentRoundTripTime * 1000; // ms
                }
            });

            return result;
        } catch (error) {
            console.error('Ошибка получения статистики:', error);
            return null;
        }
    }

    // Callbacks (будут переопределены)
    onLocalStream(stream) {}
    onRemoteStream(stream) {}
    onIceCandidate(candidate) {}
    onCallConnected() {}
    onCallFailed() {}
    onCallEnded() {}
}

// Глобальный экземпляр
window.webrtcManager = new WebRTCManager();
