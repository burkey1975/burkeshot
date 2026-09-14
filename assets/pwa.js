'use strict';
(function setupBurkeShotPWA(){
  const head=document.head;
  if(!head)return;

  function ensureLink(rel,href,extra={}){
    let el=[...document.querySelectorAll(`link[rel="${rel}"]`)].find(x=>x.getAttribute('href')===href);
    if(!el){el=document.createElement('link');el.rel=rel;el.href=href;Object.assign(el,extra);head.appendChild(el)}
    return el;
  }
  function ensureMeta(name,content){
    let el=document.querySelector(`meta[name="${name}"]`);
    if(!el){el=document.createElement('meta');el.name=name;head.appendChild(el)}
    el.content=content;return el;
  }

  ensureLink('manifest','/manifest.webmanifest');
  ensureLink('apple-touch-icon','/assets/burkeshot-icon.svg');
  ensureMeta('theme-color','#0d5a46');
  ensureMeta('apple-mobile-web-app-capable','yes');
  ensureMeta('apple-mobile-web-app-status-bar-style','default');
  ensureMeta('apple-mobile-web-app-title','BurkeShot');

  // Load the visual-only trajectory continuation layer after the core UI exists.
  if(!document.querySelector('script[data-burkeshot-continuation]')){
    const continuation=document.createElement('script');
    continuation.src='/assets/trajectory-continuation-v4.js?v=1.0';
    continuation.async=false;
    continuation.dataset.burkeshotContinuation='1';
    head.appendChild(continuation);
  }

  // Improve simulator ball visibility without changing any measured numbers or flight physics.
  if(!document.querySelector('script[data-burkeshot-range-ball]')){
    const tracker=document.createElement('script');
    tracker.src='/assets/range-ball-visibility-v4.js?v=1.0';
    tracker.async=false;
    tracker.dataset.burkeshotRangeBall='1';
    head.appendChild(tracker);
  }

  const localHost=['localhost','127.0.0.1','::1'].includes(location.hostname);
  const canRegister=window.isSecureContext||localHost;
  if('serviceWorker' in navigator&&canRegister){
    window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(err=>console.warn('BurkeShot PWA registration failed',err)));
  }

  const standalone=window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const mobile=window.matchMedia?.('(max-width: 760px)').matches;
  if(standalone||!mobile)return;

  const ua=navigator.userAgent||'';
  const ios=/iPad|iPhone|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
  const safari=ios&&/Safari/.test(ua)&&!/CriOS|FxiOS|EdgiOS/.test(ua);
  let deferredPrompt=null;

  const banner=document.createElement('div');
  banner.id='burkeshotInstall';
  banner.style.cssText='position:fixed;z-index:120;left:12px;right:12px;bottom:82px;background:#0d5a46;color:white;border-radius:14px;padding:12px 14px;box-shadow:0 12px 30px #0004;font:600 13px/1.4 system-ui,-apple-system,sans-serif;display:flex;gap:10px;align-items:center';
  const copy=document.createElement('div');copy.style.flex='1';
  const title=document.createElement('b');title.textContent='BurkeShot mobile app';title.style.display='block';
  const text=document.createElement('span');text.style.cssText='display:block;margin-top:2px;font-weight:450;opacity:.9';
  copy.append(title,text);banner.append(copy);
  const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Close install message');close.style.cssText='border:0;background:transparent;color:white;font-size:24px;line-height:1;padding:2px 4px';close.onclick=()=>banner.remove();banner.append(close);

  if(ios){
    if(!canRegister){
      text.textContent='Safari testing works, but full Home Screen app install needs an HTTPS BurkeShot address.';
    }else if(safari){
      text.textContent='Tap Share in Safari, then Add to Home Screen.';
    }else{
      text.textContent='Open this page in Safari, tap Share, then Add to Home Screen.';
    }
    document.body.appendChild(banner);
  }else{
    window.addEventListener('beforeinstallprompt',event=>{
      event.preventDefault();deferredPrompt=event;
      text.textContent='Install BurkeShot for a full-screen launch-monitor experience.';
      const install=document.createElement('button');install.type='button';install.textContent='Install';install.style.cssText='border:0;border-radius:9px;background:#dbf985;color:#173126;font-weight:800;padding:9px 12px';
      install.onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;banner.remove()};
      banner.insertBefore(install,close);document.body.appendChild(banner);
    });
  }
})();
