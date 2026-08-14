// sw.js
importScripts('/db.js'); // Importe les fonctions IDB définies précédemment

const CACHE_NAME = 'unonote-cache-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/db.js',
    '/manifest.webmanifest'
];

// Installation & Cache
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activation & Nettoyage des vieux caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) return caches.delete(name);
                })
            );
        })
    );
    self.clients.claim();
});

// Interception des requêtes (Offline support)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

// Interactions avec la notification
self.addEventListener('notificationclick', async (event) => {
    event.notification.close();

    // Si l'utilisateur clique sur le bouton "Stop Live" de la notification
    if (event.action === 'stop') {
        // Mettre à jour l'état dans IndexedDB
        const state = await idbGet('appState');
        if (state) {
            state.active = false;
            state.startedAt = null;
            state.expiresAt = null;
            await idbSet('appState', state);
            
            // Avertir les clients ouverts de se mettre à jour
            const clients = await self.clients.matchAll({ type: 'window' });
            for (const client of clients) {
                client.postMessage({ type: 'LIVE_STOPPED' });
            }
        }
        return;
    }

    // Clic normal sur la notification : Ouvrir/Focus l'application
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Si l'app est déjà ouverte dans un onglet, on la met au premier plan
            for (const client of clientList) {
                if (client.url === self.registration.scope && 'focus' in client) {
                    return client.focus();
                }
            }
            // Sinon on l'ouvre
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});

// (Optionnel) Préparation pour le Web Push via Vercel Cron
self.addEventListener('push', async (event) => {
    if (event.data) {
        const data = event.data.json();
        if (data.action === 'clear_expired') {
            const state = await idbGet('appState');
            if (state && state.active && Date.now() >= state.expiresAt) {
                const notifications = await self.registration.getNotifications({ tag: 'unonote-live' });
                notifications.forEach(n => n.close());
                state.active = false;
                await idbSet('appState', state);
            }
        }
    }
});
