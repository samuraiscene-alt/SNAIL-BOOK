const CACHE='snail-book-v116-20261125';
const ASSETS=['./','./index.html','./style.css','./app.js','./manifest.webmanifest','./version.json','./icon-180.png?v=100','./icon-192.png?v=100','./icon-512.png?v=100'];
self.addEventListener('install',e=>{
 e.waitUntil((async()=>{
  const c=await caches.open(CACHE);
  await Promise.allSettled(ASSETS.map(async path=>{
   const request=new Request(path,{cache:'reload'});
   const response=await fetch(request);
   if(!response.ok)throw new Error('Precache '+path+' failed: '+response.status);
   await c.put(request,response);
  }));
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',e=>{
 e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('snail-book-')&&k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 e.respondWith((async()=>{
  try{
   const response=await fetch(e.request,{cache:'no-store'});
   if(response.ok&&new URL(e.request.url).origin===location.origin){
    const clone=response.clone();
    e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,clone)).catch(()=>{}));
   }
   return response;
  }catch(err){
   const cached=await caches.match(e.request,{ignoreSearch:true});
   if(cached)return cached;
   if(e.request.mode==='navigate'){
    const shell=await caches.match('./index.html',{ignoreSearch:true});
    if(shell)return shell;
   }
   throw err;
  }
 })());
});
