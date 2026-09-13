'use strict';
const CACHE='burkeshot-v4-pwa-1';
const APP_SHELL=[
  '/',
  '/index.html',
  '/style.css?v=12',
  '/v10.css?v=12',
  '/calibration.css?v=12',
  '/app.js?v=12',
  '/measurement.js?v=12',
  '/v12-status.js?v=12',
  '/calibration-ui.js?v=12',
  '/assets/mobile-v4.css?v=4.1',
  '/assets/rear-v3.js?v=3.3',
  '/assets/rear-v4.js?v=4.0',
  '/assets/burkeshot-icon.svg'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/'))return;

  event.respondWith((async()=>{
    try{
      const fresh=await fetch(req);
      if(fresh&&fresh.ok){
        const copy=fresh.clone();
        caches.open(CACHE).then(cache=>cache.put(req,copy));
      }
      return fresh;
    }catch(err){
      const cached=await caches.match(req);
      if(cached)return cached;
      if(req.mode==='navigate')return caches.match('/index.html');
      throw err;
    }
  })());
});
