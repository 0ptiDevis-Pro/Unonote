// app.js

const NOTIFICATION_TAG = 'unonote-live';
const LIVE_DURATION_MS = 8 * 60 * 60 * 1000; // 8 heures

// Éléments du DOM
const noteInput = document.getElementById('note-input');
const liveBtn = document.getElementById('live-btn');
const liveIndicator = document.getElementById('live-indicator');
const settingsToggle = document.getElementById('settings-toggle');
const settingsModal = document.getElementById('settings-modal');

// État local de l'application
let appState = {
    active: false,
    text: '',
    startedAt: null,
    expiresAt: null
};

// --- INITIALISATION ---
async function initApp() {
    // 1. Enregistrer le Service Worker
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('/sw.js');
            document.getElementById('sw-status').textContent = 'Service Worker: Active';
        } catch (e) {
            console.error('SW Registration failed', e);
            document.getElementById('sw-status').textContent = 'Service Worker: Failed';
        }
    }

    // 2. Charger l'état depuis IndexedDB
    const savedState = await idbGet('appState');
    if (savedState) {
        appState = savedState;
        noteInput.value = appState.text;
    }

    // 3. Vérifier si le Live est expiré (Nettoyage à l'ouverture)
    if (appState.active) {
        if (Date.now() >= appState.expiresAt) {
            await stopLive(); // Expiré
        } else {
            updateUIForLive(true); // Toujours actif
        }
    }

    // Sauvegarde automatique du texte en cours de frappe
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

    liveBtn.disabled = true; // Empêcher les doubles clics

    // Demander permission de notification
    if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            alert("Les notifications sont nécessaires pour le mode Live.");
            liveBtn.disabled = false;
            updateSettingsUI();
            return;
        }
    }

    // Mise à jour de l'état
    const now = Date.now();
    appState.active = true;
    appState.startedAt = now;
    appState.expiresAt = now + LIVE_DURATION_MS;
    
    await idbSet('appState', appState);

    // Déclencher la notification via le Service Worker
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Unonote', {
        body: appState.text,
        icon: '/icons/icon-192.png',
        tag: NOTIFICATION_TAG,
        renotify: true,
        requireInteraction: true, // Aide à garder la notification persistante
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

    // Fermer la notification
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications({ tag: NOTIFICATION_TAG });
    notifications.forEach(notif => notif.close());

    updateUIForLive(false);
    liveBtn.disabled = false;
}

// --- INTERFACE UTILISATEUR ---
function updateUIForLive(isActive) {
    if (isActive) {
        liveBtn.textContent = 'STOP LIVE';
        liveBtn.classList.add('stop-mode');
        liveIndicator.classList.remove('hidden');
    } else {
        liveBtn.textContent = 'GO LIVE';
        liveBtn.classList.remove('stop-mode');
        liveIndicator.classList.add('hidden');
    }
}

// --- SETTINGS (Aide & Debug) ---
settingsToggle.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
});

document.getElementById('close-settings-btn').addEventListener('click', () => {
    settingsModal.classList.add('hidden');
});

document.getElementById('clear-data-btn').addEventListener('click', async () => {
    await stopLive();
    appState.text = '';
    noteInput.value = '';
    await idbSet('appState', appState);
    settingsModal.classList.add('hidden');
});

function updateSettingsUI() {
    document.getElementById('notif-status').textContent = `Notifications: ${Notification.permission}`;
}

// Écouteur pour mettre à jour l'UI si la notification est fermée par le SW (Action 'stop')
navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'LIVE_STOPPED') {
        appState.active = false;
        appState.startedAt = null;
        appState.expiresAt = null;
        updateUIForLive(false);
    }
});

// Rafraîchissement automatique au retour sur l'onglet
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && appState.active) {
        const currentData = await idbGet('appState');
        if (currentData && Date.now() >= currentData.expiresAt) {
            await stopLive();
        } else if (!currentData.active) {
             // Quelqu'un l'a arrêté via la notification
             updateUIForLive(false);
        }
    }
});

// Lancement
initApp();
