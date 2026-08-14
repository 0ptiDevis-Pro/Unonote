// app.js

const NOTIFICATION_TAG = 'unonote-live';
const LIVE_DURATION_MS = 8 * 60 * 60 * 1000; // 8 heures

// Éléments du DOM
const noteInput = document.getElementById('note-input');
const liveBtn = document.getElementById('live-btn');
const liveText = document.getElementById('live-text');
const liveIndicator = document.getElementById('live-indicator');

// Nouveaux boutons latéraux
const settingsBtn = document.getElementById('settings-btn');
const trashBtn = document.getElementById('trash-btn');

// Éléments de la modale
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const clearDataBtn = document.getElementById('clear-data-btn');

// État local de l'application
let appState = {
    active: false,
    text: '',
    startedAt: null,
    expiresAt: null
};

// --- INITIALISATION ---
async function initApp() {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('/sw.js');
            document.getElementById('sw-status').textContent = 'Service Worker: Active';
        } catch (e) {
            console.error('SW Registration failed', e);
            document.getElementById('sw-status').textContent = 'Service Worker: Failed';
        }
    }

    const savedState = await idbGet('appState');
    if (savedState) {
        appState = savedState;
        noteInput.value = appState.text;
    }

    if (appState.active) {
        if (Date.now() >= appState.expiresAt) {
            await stopLive(); 
        } else {
            updateUIForLive(true); 
        }
    }

    noteInput.addEventListener('input', () => {
        appState.text = noteInput.value;
        idbSet('appState', appState);
    });

    updateSettingsUI();
}

// --- GESTION DU LIVE ---
liveBtn.addEventListener('click', async () => {
    if (appState.active) {
        await stopLive();
    } else {
        await startLive();
    }
});

async function startLive() {
    if (!appState.text.trim()) {
        alert("Veuillez écrire une note d'abord.");
        return;
    }

    liveBtn.disabled = true;

    if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            alert("Les notifications sont nécessaires pour le mode Live.");
            liveBtn.disabled = false;
            updateSettingsUI();
            return;
        }
    }

    const now = Date.now();
    appState.active = true;
    appState.startedAt = now;
    appState.expiresAt = now + LIVE_DURATION_MS;
    
    await idbSet('appState', appState);

    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Unonote', {
        body: appState.text,
        icon: '/icons/icon-192.png',
        tag: NOTIFICATION_TAG,
        renotify: true,
        requireInteraction: true, 
        actions: [
            { action: 'stop', title: 'Stop Live' }
        ]
    });

    updateUIForLive(true);
    liveBtn.disabled = false;
    updateSettingsUI();
}

async function stopLive() {
    liveBtn.disabled = true;

    appState.active = false;
    appState.startedAt = null;
    appState.expiresAt = null;
    await idbSet('appState', appState);

    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications({ tag: NOTIFICATION_TAG });
    notifications.forEach(notif => notif.close());

    updateUIForLive(false);
    liveBtn.disabled = false;
}

// --- NOUVEAU : GESTION DE LA CORBEILLE ---
trashBtn.addEventListener('click', async () => {
    // Si le live est actif, on l'arrête
    if (appState.active) {
        await stopLive();
    }
    
    // On vide le texte
    appState.text = '';
    noteInput.value = '';
    await idbSet('appState', appState);
});

// --- INTERFACE UTILISATEUR ---
function updateUIForLive(isActive) {
    if (isActive) {
        liveText.textContent = 'Stop Live';
        liveBtn.classList.add('stop-mode');
        liveIndicator.classList.remove('hidden');
    } else {
        liveText.textContent = 'Go Live';
        liveBtn.classList.remove('stop-mode');
        liveIndicator.classList.add('hidden');
    }
}

// --- SETTINGS (Aide & Debug) ---
settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
});

clearDataBtn.addEventListener('click', async () => {
    await stopLive();
    appState.text = '';
    noteInput.value = '';
    await idbSet('appState', appState);
    settingsModal.classList.add('hidden');
});

function updateSettingsUI() {
    document.getElementById('notif-status').textContent = `Notifications: ${Notification.permission}`;
}

// Rafraîchissements
navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'LIVE_STOPPED') {
        appState.active = false;
        appState.startedAt = null;
        appState.expiresAt = null;
        updateUIForLive(false);
    }
});

document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && appState.active) {
        const currentData = await idbGet('appState');
        if (currentData && Date.now() >= currentData.expiresAt) {
            await stopLive();
        } else if (!currentData.active) {
             updateUIForLive(false);
        }
    }
});

// Lancement
initApp();
