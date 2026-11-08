// Café Frío · funciona sin internet después de la primera visita
const CACHE='cafefrio-v9';
const SHELL=['./','index.html','app.css','app.js','vendor/qrcode.js','manifest.webmanifest','logo.svg',
  'icons/apple-touch-icon.png','icons/icon-192.png','icons/icon-512.png','icons/favicon-32.png',
  'img/cold-brew-clasico.jpg','img/cold-brew-vainilla.jpg','img/cold-brew-horchata.jpg','img/brew-chai.jpg',
  'img/apple-crunch.jpg','img/pay.jpg','img/latte.jpg','img/americano.jpg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  // la app propia: primero la red (para recibir actualizaciones), si no hay internet usa la copia guardada
  if(url.origin===location.origin){
    e.respondWith(fetch(req).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp));return r}).catch(()=>caches.match(req).then(r=>r||caches.match('index.html'))));
    return;
  }
  // fuentes y librerías: primero la copia guardada
  e.respondWith(caches.match(req).then(r=>r||fetch(req).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(req,cp));return res})));
});
