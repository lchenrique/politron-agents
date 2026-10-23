/* Somente casca estática; dados do host, transcrições, cookies e APIs nunca são cacheados. */
const CACHE='boobot-shell-v2'
const ASSETS=['/','/styles.css','/main.js','/icon.svg','/icon-192.png','/icon-512.png','/manifest.webmanifest']
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))})
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))})
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url)
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!ASSETS.includes(url.pathname))return
 event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match(event.request)))
})