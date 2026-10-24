/* Only public app shell assets are cached. No API, chat history, files or credentials. */
const CACHE='boobot-react-shell-v5'
const SHELL=['/','/web/app.js','/web/app.css','/icon.svg','/icon-192.png','/icon-512.png','/manifest.webmanifest']
const isShell=url=>url.origin===self.location.origin&&(SHELL.includes(url.pathname)||/^\/web\/(?:assets\/)?[a-zA-Z0-9._-]+\.(?:js|css|svg|png)$/.test(url.pathname))
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))
})
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))
})
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url)
  if(event.request.method!=='GET'||!isShell(url))return
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(async response=>{
    if(response.ok){const cache=await caches.open(CACHE);await cache.put(event.request,response.clone())}
    return response
  }).catch(()=>caches.match(event.request)))
})
