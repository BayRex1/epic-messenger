# Epic Messenger 💬

Modern real-time messenger with beautiful interface and advanced features.

## 🌟 New in Version 2.0

- 📝 **Posts System** - Create posts with images, likes, and comments
- 💬 **Persistent Chat History** - Messages saved after reload
- 📱 **Mobile Responsive** - Works perfectly on phones and tablets
- 🖼️ **File Sharing** - Images, videos, audio files (up to 50MB)
- 👥 **User Profiles** - Avatars, descriptions, verified badges
- 🔍 **Smart Search** - Find users by username or display name
- 🔐 **Admin Panel** - User management for @admin and @BayRex

## 🚀 Quick Start

1. **Visit:** https://epic-messenger.onrender.com/
2. **Create an account:** Register through the sign-up form. Do not use shared demo credentials.

## 📱 Mobile Features

- Responsive design for all screen sizes
- Swipe navigation between chats and posts
- Back button to return to chat list
- Optimized touch interfaces

## 🛠️ Development

```bash
# Install dependencies
npm install

# Start server
npm start

# Access locally
http://localhost:3000


### Настройка владельца (OWNER)

Чтобы восстановить права владельца для существующего аккаунта BayRex, задайте переменную окружения `EPIC_OWNER_USER_ID` равной неизменяемому `id` этого аккаунта в рабочей базе данных. При следующем входе этому аккаунту будут восстановлены `isDeveloper`, `isAdmin` и `isProtected`. По одному имени пользователя права не выдаются.
