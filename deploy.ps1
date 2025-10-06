Write-Host "🚀 Starting deployment to GitHub..." -ForegroundColor Green

# Проверяем статус
Write-Host "📊 Checking git status..." -ForegroundColor Yellow
git status

# Добавляем все файлы
Write-Host "📦 Adding files to git..." -ForegroundColor Yellow
git add .

# Создаем коммит
Write-Host "💾 Creating commit..." -ForegroundColor Yellow
git commit -m "🚀 Epic Messenger v2.2 - Critical Bug Fixes

✅ Fixed authentication flow in main.html
✅ Fixed missing express-session dependency
✅ Improved error handling and loading states
✅ Enhanced mobile chat experience
✅ Fixed API call error handling
✅ Added global loading indicators
✅ Optimized data loading with Promise.allSettled"

# Пушим изменения
Write-Host "📤 Pushing to GitHub..." -ForegroundColor Yellow
git push origin main

Write-Host "✅ Successfully deployed to GitHub!" -ForegroundColor Green
Write-Host "🌐 Your app will auto-deploy on: https://epic-messenger.onrender.com/" -ForegroundColor Cyan
Write-Host "⏰ Please wait 2-5 minutes for Render.com to update your application" -ForegroundColor Yellow
