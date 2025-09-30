Write-Host "🚀 Starting deployment to GitHub..." -ForegroundColor Green

# Проверяем статус
Write-Host "📊 Checking git status..." -ForegroundColor Yellow
git status

# Добавляем все файлы
Write-Host "📦 Adding files to git..." -ForegroundColor Yellow
git add .

# Создаем коммит
Write-Host "💾 Creating commit..." -ForegroundColor Yellow
git commit -m "🚀 Epic Messenger v2.0 - Complete functional update

✅ Fixed file sharing (images, videos, audio)
✅ Added persistent message history
✅ Implemented chat list with back button
✅ Added posts system with likes and comments
✅ Improved mobile responsiveness
✅ Fixed account switching to login page
✅ Added navigation tabs (Chats/Posts)
✅ Enhanced user profiles with descriptions
✅ Working admin panel for @admin and @BayRex"

# Пушим изменения
Write-Host "📤 Pushing to GitHub..." -ForegroundColor Yellow
git push origin main

Write-Host "✅ Successfully deployed to GitHub!" -ForegroundColor Green
Write-Host "🌐 Your app will auto-deploy on: https://epic-messenger.onrender.com/" -ForegroundColor Cyan
Write-Host "⏰ Please wait 2-5 minutes for Render.com to update your application" -ForegroundColor Yellow
