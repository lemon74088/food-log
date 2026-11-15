/* 食物紀錄 · Service Worker
   策略：一律先連網（拿到最新版），斷網時才回快取。
   這樣推新版上去，使用者一次重新整理就會更新，不會卡在舊版。 */
var CACHE = "foodlog-v6";
var CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return c.addAll(CORE);
    }).then(function(){
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){
        return caches.delete(k);
      }));
    }).then(function(){
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch(err){ return; }
  if(url.origin !== self.location.origin) return;   /* 外部字體不攔 */

  e.respondWith(
    fetch(req).then(function(res){
      if(res && res.ok && res.type === "basic"){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); }).catch(function(){});
      }
      return res;
    }).catch(function(){
      return caches.match(req).then(function(hit){
        if(hit) return hit;
        if(req.mode === "navigate") return caches.match("./index.html");
        return new Response("", {status: 504, statusText: "offline"});
      });
    })
  );
});
