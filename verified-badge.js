// verified-badge.js - стили для золотой галочки
const verifiedBadgeStyle = `
<style>
.verified-badge {
    display: inline-block;
    margin-left: 4px;
    animation: goldPulse 2s infinite;
}

.verified-badge svg {
    width: 16px;
    height: 16px;
    vertical-align: middle;
}

@keyframes goldPulse {
    0% { transform: scale(1); filter: brightness(1); }
    50% { transform: scale(1.1); filter: brightness(1.2); }
    100% { transform: scale(1); filter: brightness(1); }
}

.gold-path {
    fill: url(#goldGradient);
    stroke: #FFD700;
    stroke-width: 1;
}

.gold-glow {
    fill: url(#goldGradient);
    opacity: 0.6;
}
</style>

<svg width="16" height="16" viewBox="0 0 16 16" style="display: inline-block; vertical-align: middle;">
    <defs>
        <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FFD700"/>
            <stop offset="50%" stop-color="#FFB700"/>
            <stop offset="100%" stop-color="#FFD700"/>
        </linearGradient>
    </defs>
    <circle cx="8" cy="8" r="7" fill="url(#goldGradient)" opacity="0.3"/>
    <path class="gold-path" d="M4 8 L7 11 L12 5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
`;

// Функция для вставки стилей в страницу
function injectVerifiedBadgeStyles() {
    if (!document.getElementById('verified-badge-styles')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'verified-badge-styles';
        styleElement.textContent = `
            .verified-badge {
                display: inline-block;
                margin-left: 4px;
                animation: goldPulse 2s infinite;
            }
            
            .verified-badge svg {
                width: 16px;
                height: 16px;
                vertical-align: middle;
            }
            
            @keyframes goldPulse {
                0% { transform: scale(1); filter: brightness(1); }
                50% { transform: scale(1.1); filter: brightness(1.2); }
                100% { transform: scale(1); filter: brightness(1); }
            }
            
            .gold-path {
                fill: url(#goldGradient);
                stroke: #FFD700;
                stroke-width: 1;
            }
        `;
        document.head.appendChild(styleElement);
    }
}

// HTML для золотой галочки
function getVerifiedBadgeHTML() {
    return `
    <span class="verified-badge" title="Верифицированный аккаунт">
        <svg width="16" height="16" viewBox="0 0 16 16">
            <defs>
                <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#FFD700"/>
                    <stop offset="50%" stop-color="#FFB700"/>
                    <stop offset="100%" stop-color="#FFD700"/>
                </linearGradient>
            </defs>
            <circle cx="8" cy="8" r="7" fill="url(#goldGradient)" opacity="0.3"/>
            <path class="gold-path" d="M4 8 L7 11 L12 5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
    </span>
    `;
}