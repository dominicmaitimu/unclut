const cacheName = 'unclut-v4'
self.addEventListener('install', (event) => { event.waitUntil(caches.open(cacheName).then((cache) => cache.add('/'))); self.skipWaiting() })
self.addEventListener('activate', (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== cacheName).map((key) => caches.delete(key))))); self.clients.claim() })
self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return
	event.respondWith((async () => {
		try {
		const response = await fetch(event.request)
		if (response.ok && new URL(event.request.url).origin === self.location.origin) {
			const responseForCache = response.clone()
			const cache = await caches.open(cacheName)
			await cache.put(event.request, responseForCache)
		}
		return response
		} catch {
			const cached = await caches.match(event.request)
			if (cached) return cached
			throw new Error('Geen netwerkverbinding en geen offline versie beschikbaar.')
		}
	})())
})