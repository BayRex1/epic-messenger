const path = require('path');
const fs = require('fs');

class MusicHandler {
    constructor(dataManager, securitySystem, fileHandlers, authHandler) {
        this.dataManager = dataManager;
        this.securitySystem = securitySystem;
        this.fileHandlers = fileHandlers;
        this.authHandler = authHandler;
    }

    authenticateToken(token) {
        return this.authHandler?.authenticateToken(token) || null;
    }

    handleGetMusic(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const musicWithUserInfo = this.dataManager.music.map(track => {
            const trackUser = this.dataManager.users.find(u => u.id === track.userId);
            return {
                ...track,
                userName: trackUser ? trackUser.displayName : 'Неизвестный',
                userAvatar: trackUser ? trackUser.avatar : null,
                userVerified: trackUser ? trackUser.verified : false
            };
        });

        this.securitySystem.logSecurityEvent(user, 'GET_MUSIC', `count:${musicWithUserInfo.length}`);

        return {
            success: true,
            music: musicWithUserInfo
        };
    }

    handleUploadMusic(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_METADATA', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { title, artist, duration, fileUrl, coverUrl, genre } = data;
        
        if (!title || !artist || !fileUrl) {
            return { success: false, message: 'Название, исполнитель и файл обязательны' };
        }

        const sanitizedTitle = this.securitySystem.sanitizeContent(title);
        const sanitizedArtist = this.securitySystem.sanitizeContent(artist);
        const sanitizedGenre = genre ? this.securitySystem.sanitizeContent(genre) : 'Не указан';

        const track = {
            id: this.dataManager.generateId(),
            userId: user.id,
            title: sanitizedTitle,
            artist: sanitizedArtist,
            duration: duration || 0,
            fileUrl: fileUrl,
            coverUrl: coverUrl || '/assets/default-cover.png',
            genre: sanitizedGenre,
            plays: 0,
            likes: [],
            createdAt: new Date()
        };

        this.dataManager.music.unshift(track);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_METADATA', `track:${sanitizedTitle} - ${sanitizedArtist}`);

        console.log(`🎵 Пользователь ${user.displayName} загрузил трек: ${sanitizedTitle} - ${sanitizedArtist}`);

        return {
            success: true,
            track: {
                ...track,
                userName: user.displayName,
                userAvatar: user.avatar,
                userVerified: user.verified
            }
        };
    }

    async handleUploadMusicFile(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_FILE', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { fileData, filename } = data;
        if (!this.fileHandlers.validateMusicFile(filename)) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_FILE', `file:${filename}`, false);
            return { success: false, message: 'Недопустимый формат аудио файла' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `music_${user.id}_${Date.now()}${fileExt}`;
            const fileUrl = await this.fileHandlers.saveBufferToFolder(fileData, 'music', uniqueFilename);

            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_FILE', `file:${filename}`);

            return {
                success: true,
                fileUrl: fileUrl
            };
        } catch (error) {
            console.error('Ошибка загрузки аудио файла:', error);
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_FILE', `file:${filename}`, false);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    handleUploadMusicFull(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        return { success: true, message: 'Музыка загружена (full)' };
    }

    async handleUploadMusicCover(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_COVER', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { fileData, filename } = data;
        if (!this.fileHandlers.validateCoverFile(filename)) {
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_COVER', `file:${filename}`, false);
            return { success: false, message: 'Недопустимый формат изображения' };
        }

        try {
            const fileExt = path.extname(filename);
            const uniqueFilename = `cover_${user.id}_${Date.now()}${fileExt}`;
            const fileUrl = await this.fileHandlers.saveBufferToFolder(fileData, 'music/covers', uniqueFilename);

            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_COVER', `file:${filename}`);

            return {
                success: true,
                coverUrl: fileUrl
            };
        } catch (error) {
            console.error('Ошибка загрузки обложки:', error);
            this.securitySystem.logSecurityEvent(user, 'UPLOAD_MUSIC_COVER', `file:${filename}`, false);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }

    handleDeleteMusic(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { trackId } = data;
        const trackIndex = this.dataManager.music.findIndex(t => t.id === trackId);
        if (trackIndex === -1) {
            return { success: false, message: 'Трек не найден' };
        }

        const track = this.dataManager.music[trackIndex];
        if (track.userId !== user.id && !user.isDeveloper) {
            this.securitySystem.logSecurityEvent(user, 'DELETE_MUSIC', `track:${trackId}`, false);
            return { success: false, message: 'Вы можете удалять только свои треки' };
        }

        if (track.fileUrl && track.fileUrl.startsWith('/uploads/music/')) {
            this.fileHandlers.deleteFile(track.fileUrl);
        }
        if (track.coverUrl && track.coverUrl.startsWith('/uploads/music/covers/')) {
            this.fileHandlers.deleteFile(track.coverUrl);
        }

        this.dataManager.music.splice(trackIndex, 1);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'DELETE_MUSIC', `track:${track.title}`);

        console.log(`🗑️ Трек удален: ${track.title}`);

        return {
            success: true,
            message: 'Трек успешно удален'
        };
    }

    handleSearchMusic(token, query) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { q } = query;
        if (!q || q.trim() === '') {
            return this.handleGetMusic(token);
        }

        const searchTerm = q.toLowerCase().trim();
        const filteredMusic = this.dataManager.music.filter(track => 
            track.title.toLowerCase().includes(searchTerm) ||
            track.artist.toLowerCase().includes(searchTerm) ||
            track.genre.toLowerCase().includes(searchTerm)
        );

        const musicWithUserInfo = filteredMusic.map(track => {
            const trackUser = this.dataManager.users.find(u => u.id === track.userId);
            return {
                ...track,
                userName: trackUser ? trackUser.displayName : 'Неизвестный',
                userAvatar: trackUser ? trackUser.avatar : null,
                userVerified: trackUser ? trackUser.verified : false
            };
        });

        this.securitySystem.logSecurityEvent(user, 'SEARCH_MUSIC', `term:${q}, results:${musicWithUserInfo.length}`);

        return {
            success: true,
            music: musicWithUserInfo,
            searchTerm: q
        };
    }

    handleGetRandomMusic(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (this.dataManager.music.length === 0) {
            return {
                success: true,
                music: []
            };
        }

        const shuffled = [...this.dataManager.music].sort(() => 0.5 - Math.random());
        const randomMusic = shuffled.slice(0, 10);

        const musicWithUserInfo = randomMusic.map(track => {
            const trackUser = this.dataManager.users.find(u => u.id === track.userId);
            return {
                ...track,
                userName: trackUser ? trackUser.displayName : 'Неизвестный',
                userAvatar: trackUser ? trackUser.avatar : null,
                userVerified: trackUser ? trackUser.verified : false
            };
        });

        this.securitySystem.logSecurityEvent(user, 'GET_RANDOM_MUSIC', `count:${musicWithUserInfo.length}`);

        return {
            success: true,
            music: musicWithUserInfo
        };
    }

    handleGetPlaylists(token) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const userPlaylists = this.dataManager.playlists.filter(p => p.userId === user.id);
        
        this.securitySystem.logSecurityEvent(user, 'GET_PLAYLISTS', `count:${userPlaylists.length}`);

        return {
            success: true,
            playlists: userPlaylists
        };
    }

    handleCreatePlaylist(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'CREATE_PLAYLIST', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { name, description } = data;
        if (!name || name.trim() === '') {
            return { success: false, message: 'Название плейлиста обязательно' };
        }

        const sanitizedName = this.securitySystem.sanitizeContent(name.trim());
        const sanitizedDescription = description ? this.securitySystem.sanitizeContent(description) : '';

        const playlist = {
            id: this.dataManager.generateId(),
            userId: user.id,
            name: sanitizedName,
            description: sanitizedDescription,
            tracks: [],
            cover: null,
            createdAt: new Date()
        };

        this.dataManager.playlists.push(playlist);
        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'CREATE_PLAYLIST', `name:${sanitizedName}`);

        console.log(`🎵 Создан плейлист: ${sanitizedName}`);

        return {
            success: true,
            playlist: playlist
        };
    }

    handleAddToPlaylist(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        if (user.banned) {
            this.securitySystem.logSecurityEvent(user, 'ADD_TO_PLAYLIST', 'SYSTEM', false);
            return { success: false, message: 'Ваш аккаунт заблокирован' };
        }

        const { playlistId, trackId } = data;
        const playlist = this.dataManager.playlists.find(p => p.id === playlistId && p.userId === user.id);
        if (!playlist) {
            return { success: false, message: 'Плейлист не найден' };
        }

        const track = this.dataManager.music.find(t => t.id === trackId);
        if (!track) {
            return { success: false, message: 'Трек не найден' };
        }

        if (playlist.tracks.includes(trackId)) {
            return { success: false, message: 'Трек уже есть в плейлисте' };
        }

        playlist.tracks.push(trackId);
        if (!playlist.cover && playlist.tracks.length === 1) {
            playlist.cover = track.coverUrl;
        }

        this.dataManager.saveData();

        this.securitySystem.logSecurityEvent(user, 'ADD_TO_PLAYLIST', `playlist:${playlist.name}, track:${track.title}`);

        console.log(`🎵 Трек добавлен в плейлист: ${playlist.name}`);

        return {
            success: true,
            playlist: playlist
        };
    }

    handleAddTrackToPlaylist(token, data) {
        const user = this.authenticateToken(token);
        if (!user) {
            return { success: false, message: 'Не авторизован' };
        }

        const { playlistId, trackId } = data;
        if (!playlistId || !trackId) {
            return { success: false, message: 'Не указан плейлист или трек' };
        }

        try {
            const playlist = this.dataManager.playlists.find(p => p.id === playlistId && p.userId === user.id);
            if (!playlist) {
                return { success: false, message: 'Плейлист не найден' };
            }

            const track = this.dataManager.music.find(t => t.id === trackId);
            if (!track) {
                return { success: false, message: 'Трек не найден' };
            }

            if (!playlist.tracks.includes(trackId)) {
                playlist.tracks.push(trackId);
                this.dataManager.saveData();

                this.securitySystem.logSecurityEvent(user, 'ADD_TRACK_TO_PLAYLIST', `playlist:${playlistId}, track:${trackId}`);

                return {
                    success: true,
                    message: 'Трек добавлен в плейлист'
                };
            } else {
                return { success: false, message: 'Трек уже есть в плейлисте' };
            }
        } catch (error) {
            console.error('❌ Ошибка добавления трека в плейлист:', error);
            return { success: false, message: 'Ошибка добавления трека в плейлист' };
        }
    }
}

module.exports = MusicHandler;
