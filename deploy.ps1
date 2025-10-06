Write-Host "🚀 Starting deployment to GitHub..." -ForegroundColor Green

# Проверяем статус
Write-Host "📊 Checking git status..." -ForegroundColor Yellow
git status

# Добавляем все файлы
Write-Host "📦 Adding files to git..." -ForegroundColor Yellow
git add .

# Создаем коммит
Write-Host "💾 Creating commit..." -ForegroundColor Yellow
git commit -m "🚀 Epic Messenger v2.1 - Bug Fixes Update

✅ Fixed mobile chat opening from search
✅ Added message notifications with sound/vibration
✅ Fixed post images display and fullscreen view
✅ Improved deleted user handling with proper labels
✅ Added shop button in profile menu
✅ Enhanced error handling and user feedback
✅ Fixed WebSocket connection issues
✅ Improved mobile responsiveness"

# Пушим изменения
Write-Host "📤 Pushing to GitHub..." -ForegroundColor Yellow
git push origin main

Write-Host "✅ Successfully deployed to GitHub!" -ForegroundColor Green
Write-Host "🌐 Your app will auto-deploy on: https://epic-messenger.onrender.com/" -ForegroundColor Cyan
Write-Host "⏰ Please wait 2-5 minutes for Render.com to update your application" -ForegroundColor Yellow
