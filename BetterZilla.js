// Look, if you’re seeing this, you’re likely someone who is either hunting for the source code of my extension or looking to analyze it
///////////////////////////////
// I honestly don’t mind if you steal the code or reuse it; if you do, please use some common sense and give me credits
//This extension was created with no intention of **harming other players**; the goal is simply to provide a plugin with additional features for the game--
//as well as to improve the experience for mobile devices—given that the game's HUD often receives a lot of criticism
/////////////////////////////////////////
//If you are Samet, or someone from the Wormzilla administration team, and you would like me to permanently delete or remove the extension, please get in touch with me via Discord.
//Discord: _lzin07


(() => {
  'use strict';

  const PAGE = typeof unsafeWindow === 'object' ? unsafeWindow : window;
  const ID = 'wzg';
  const nativeTimeout = PAGE.setTimeout.bind(PAGE);
  const nativeInterval = PAGE.setInterval.bind(PAGE);
  const nativeClearInterval = PAGE.clearInterval.bind(PAGE);
  const nativeRAF = PAGE.requestAnimationFrame.bind(PAGE);
  function trackWeak(set, target, isDead) {
    set.add(new WeakRef(target));
    const n = set.size;
    if (n >= 256 && (n & 255) === 0) {
      for (const ref of set) { const item = ref.deref(); if (!item || isDead(item)) set.delete(ref); }
    }
  }
  const FORCE_UPDATE_NOTICE = false;    // true = mostra o aviso sempre (teste). Pra ver o desenho com false: rode betterzillaNotice() no console.
  const SUPPORTED_GAME_BUILDS = [];     // (opcional) builds que voce ja verificou: cole o id que aparece no console "[Betterzilla] game build hxxxx-yyy"
  const UPDATE_CONTACT = { handle: '@fantasma_worm', url: 'https://www.tiktok.com/@fantasma_worm' };
  const bzHealth = { hud: false, food: false, fx: false, any: false };
  let bzBuildId = null, bzCompatPromise = null, bzBrokenTimer = 0, updateNoticeClosed = false, noticeChecking = false;

  function optimizeImages(root) {
    try { root.querySelectorAll('img').forEach(img => { if (!img.decoding || img.decoding === 'auto') img.decoding = 'async'; }); } catch {}
  }
  const GAME_SIGNATURES = [
    ['camera Re', /\.Re=/], ['preview lc', /\.lc=/], ['nametag ce', /\.ce=/], ['effects ga', /this\.ga=\{\}/],
    ['snake Pe', /\.prototype\.Pe=/], ['snake Le', /\.prototype\.Le=/], ['snake init', /\.prototype\.(?:ck|dk)=function/], ['score popups', /\.prototype\.(?:Pl|Ol)=function\(\w\)\{var \w,\w;this\.Zc\+=/], ['effect icons Eb', /\.Eb\b/], ['effect state Oe', /this\.Oe=1/],
    ['food ba', /\.prototype\.ba=function\(\w,\w,\w,\w,\w,\w\)\{this\.J\.Aa\(!0\),this\.J\.Je\(/],
    ['screen shader', /uColorOverlay/], ['screen md', /\.md=/], ['screen Fb', /\.Fb=/],
    ['hud xj', /\.xj\b/], ['zoom ji', /\bji\(/], ['camera Lb', /\.Lb\b/],
  ];
  const GAME_SIGNATURES_MAX_MISSING = 2;   // 3 ou mais sumiram = o jogo foi remexido de verdade
  function migrateNoticeState() {
    if (store.get('wzg-notice-schema') === '2') return;
    for (const k of ['wzg-baseline-build', 'wzg-trusted-build', 'wzg-broken-build', 'wzg-notice-dismissed']) store.remove(k);
    store.set('wzg-notice-schema', '2');
  }
  function hashText(t) {
    let h = 0x811c9dc5;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }
  function findGameBundleUrl() {
    const base = location.hostname.replace(/^www\./, '');
    let best = null, bestSize = 0;
    try {
      for (const e of performance.getEntriesByType('resource')) {
        let u; try { u = new URL(e.name); } catch { continue; }
        if (!/\.js$/i.test(u.pathname)) continue;
        if (u.hostname !== location.hostname && !u.hostname.endsWith('.' + base)) continue;   // so o JS do proprio jogo
        const size = e.decodedBodySize || e.encodedBodySize || e.transferSize || 0;
        if (size > bestSize || (!best && !size)) { bestSize = size; best = e.name; }
      }
    } catch {}
    return best;   // o bundle do jogo e de longe o maior .js do proprio site
  }
  function checkGameCompat() {
    if (bzCompatPromise) return bzCompatPromise;
    bzCompatPromise = (async () => {
      migrateNoticeState();
      const url = findGameBundleUrl();
      if (!url) return { state: 'unknown', id: null, missing: [] };
      let text;
      try {
        const r = await fetch(url, { cache: 'force-cache', credentials: 'same-origin' });
        if (!r.ok) return { state: 'unknown', id: null, missing: [] };
        text = await r.text();
      } catch { return { state: 'unknown', id: null, missing: [] }; }
      const id = 'h' + hashText(text) + '-' + text.length.toString(36);   // identifica o CONTEUDO do JS, nao o nome do arquivo
      bzBuildId = id;
      const missing = GAME_SIGNATURES.filter(([, re]) => !re.test(text)).map(([n]) => n);
      const state = (SUPPORTED_GAME_BUILDS.includes(id) || missing.length <= GAME_SIGNATURES_MAX_MISSING) ? 'ok' : 'incompatible';
      console.info('[Betterzilla] game build', id, state === 'ok' ? '- compativel' + (missing.length ? ' (faltando: ' + missing.join(', ') + ')' : '') : '- POSSIVELMENTE INCOMPATIVEL, faltando: ' + missing.join(', '));
      return { state, id, missing };
    })();
    return bzCompatPromise;
  }
  function bzSignal(name) {
    if (bzHealth[name]) return;
    bzHealth[name] = true;
    if (bzHealth.any) return;
    bzHealth.any = true;
    checkGameCompat().then(c => { if (c.id) store.set('wzg-trusted-build', c.id); }).catch(() => {});
    store.remove('wzg-broken-build');
    if (!FORCE_UPDATE_NOTICE) hideUpdateNotice();
  }
  function armBrokenWatch() {
    if (bzHealth.any || bzBrokenTimer) return;
    bzBrokenTimer = nativeTimeout(() => {
      bzBrokenTimer = 0;
      if (!bzHealth.any && document.documentElement.classList.contains('wzg-ingame')) store.set('wzg-broken-build', bzBuildId || 'unknown');
    }, 45000);
  }
  async function updateNoticeNeeded() {
    if (FORCE_UPDATE_NOTICE) return true;
    const c = await checkGameCompat(), id = c.id;
    if (id && (SUPPORTED_GAME_BUILDS.includes(id) || store.get('wzg-notice-dismissed') === id || store.get('wzg-trusted-build') === id)) return false;
    if (c.state === 'incompatible') return true;                 // os trechos de que o mod depende sumiram do JS do jogo
    if (c.state === 'unknown') return !!store.get('wzg-broken-build');   // nao deu pra ler o JS: so avisa se os hooks falharam numa partida
    return false;                                                // JS conhecido/compativel: nunca avisa (nem na primeira abertura)
  }
  function hideUpdateNotice() { document.getElementById('wzg-notice')?.remove(); }
  PAGE.betterzillaNotice = () => { updateNoticeClosed = false; hideUpdateNotice(); maybeShowUpdateNotice(true); };
  function ensureNoticeStyle() {
    if (document.getElementById('wzg-notice-style')) return;
    const st = document.createElement('style');
    st.id = 'wzg-notice-style';
    st.textContent = `
    #wzg-notice { position: fixed; inset: 0; z-index: 2147483250; display: grid; place-items: center; padding: 16px; background: rgba(0,0,0,.62); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
      font-family: Montserrat, "Segoe UI", system-ui, sans-serif; animation: wzn-fade .45s cubic-bezier(.22,1,.36,1) both; }
    @keyframes wzn-fade { from { opacity: 0; } }
    #wzg-notice .wzn-card { width: min(430px, 100%); max-height: calc(100vh - 32px); overflow: auto; scrollbar-width: none; padding: 22px 22px 18px; background: #0b0b0b; border: 1px solid #2e2e2e; border-radius: 10px; color: #cfcfcf;
      box-shadow: 0 0 0 1px rgba(255,255,255,.015), 0 0 38px 4px rgba(0,0,0,.6), 0 0 110px 28px rgba(0,0,0,.5), 0 34px 90px rgba(0,0,0,.45); animation: wzn-rise .7s cubic-bezier(.22,1,.36,1) both; }
    #wzg-notice .wzn-card::-webkit-scrollbar { display: none; }
    @keyframes wzn-rise { from { opacity: 0; transform: translateY(14px) scale(.97); } }
    #wzg-notice .wzn-top { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    #wzg-notice .wzn-orb { flex: none; width: 42px; height: 42px; display: grid; place-items: center; border: 1px solid #2e2e2e; border-radius: 12px; background: #0e0e0e; color: #9b9b9b; }
    #wzg-notice .wzn-orb svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    #wzg-notice .wzn-pill { display: inline-flex; align-items: center; gap: 7px; padding: 4px 10px; border: 1px solid #2e2e2e; border-radius: 99px; color: #9b9b9b; font-size: 9px; font-weight: 600; letter-spacing: .1em; }
    #wzg-notice .wzn-dot { width: 6px; height: 6px; border-radius: 50%; background: #cfcfcf; animation: wzn-pulse 1.6s ease-in-out infinite; }
    @keyframes wzn-pulse { 50% { opacity: .25; } }
    #wzg-notice .wzn-title { margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #cfcfcf; }
    #wzg-notice .wzn-text { margin: 0; font-size: 12.5px; line-height: 1.65; color: #8a8a8a; }
    #wzg-notice .wzn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 16px 0; }
    #wzg-notice .wzn-cell { display: flex; flex-direction: column; gap: 3px; padding: 9px 10px; background: #0e0e0e; border: 1px solid #1e1e1e; border-radius: 7px; min-width: 0; }
    #wzg-notice .wzn-cell span { font-size: 9.5px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #6e6e6e; }
    #wzg-notice .wzn-cell b { font-size: 12px; font-weight: 500; color: #cfcfcf; }
    #wzg-notice .wzn-help { margin-bottom: 8px; }
    #wzg-notice .wzn-contact { display: flex; align-items: center; gap: 10px; padding: 11px 12px; background: #0e0e0e; border: 1px solid #1e1e1e; border-radius: 8px; color: #cfcfcf; text-decoration: none; transition: border-color .22s ease, background .22s ease; }
    #wzg-notice .wzn-contact:hover { border-color: #2e2e2e; background: #151515; }
    #wzg-notice .wzn-contact b { flex: 1; min-width: 0; font-size: 13px; font-weight: 500; }
    #wzg-notice .wzn-go { color: #6e6e6e; font-size: 14px; transition: transform .22s ease, color .22s ease; }
    #wzg-notice .wzn-contact:hover .wzn-go { color: #cfcfcf; transform: translate(2px, -2px); }
    #wzg-notice .wzn-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    #wzg-notice .wzn-btn { all: unset; box-sizing: border-box; cursor: pointer; padding: 9px 14px; border: 1px solid #2e2e2e; border-radius: 8px; background: #1b1b1b; color: #cfcfcf; font-size: 12px; font-weight: 500; transition: filter .22s ease; }
    #wzg-notice .wzn-btn:hover { filter: brightness(1.3); }
    #wzg-notice .wzn-btn:focus-visible { outline: 1px solid #cfcfcf; outline-offset: 2px; }
    #wzg-notice .wzn-btn.primary { background: #cfcfcf; border-color: #cfcfcf; color: #0b0b0b; }
    #wzg-notice .wzn-btn.primary:hover { filter: brightness(.88); }
    @media (max-width: 480px) { #wzg-notice .wzn-actions .wzn-btn { flex: 1 1 100%; text-align: center; } }`;
    (document.head || document.documentElement).appendChild(st);
  }
  let noticeTries = 0;
  if (document.readyState === 'complete') nativeTimeout(checkGameCompat, 300);
  else PAGE.addEventListener('load', () => nativeTimeout(checkGameCompat, 600), { once: true });
  function maybeShowUpdateNotice(force) {
    if ((updateNoticeClosed && !force) || !document.body || document.getElementById('wzg-notice')) return;
    if (document.documentElement.classList.contains('wzg-ingame')) return;
    if (!force && document.readyState !== 'complete' && noticeTries++ < 12) { nativeTimeout(() => maybeShowUpdateNotice(force), 1000); return; }
    if (!document.querySelector('.shell')) { if (noticeTries++ < 6) nativeTimeout(() => maybeShowUpdateNotice(force), 1500); return; }
    if (!force) {
      if (noticeChecking) return;
      noticeChecking = true;
      updateNoticeNeeded().then(need => { noticeChecking = false; if (need) maybeShowUpdateNotice(true); }).catch(() => { noticeChecking = false; });
      return;
    }
    ensureNoticeStyle();
    const root = document.createElement('div');
    root.id = 'wzg-notice';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'wzn-title');
    root.innerHTML = `
      <div class="wzn-card">
        <div class="wzn-top">
          <span class="wzn-orb"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span>
          <span class="wzn-pill"><i class="wzn-dot"></i><span>UPDATE IN PROGRESS</span></span>
        </div>
        <h2 class="wzn-title" id="wzn-title">Game update detected</h2>
        <p class="wzn-text">Wormzilla.io was updated, so Betterzilla is not working right now. We are adapting the mod to the new game version and it will be back within 1 day.</p>
        <div class="wzn-grid">
          <div class="wzn-cell"><span>Status</span><b>Updating</b></div>
          <div class="wzn-cell"><span>Estimated time</span><b>Up to 1 day</b></div>
        </div>
        <p class="wzn-text wzn-help">Questions or need help? Contact the TikTok account</p>
        <a class="wzn-contact" href="${UPDATE_CONTACT.url}" target="_blank" rel="noopener noreferrer"><b>${UPDATE_CONTACT.handle}</b><span class="wzn-go" aria-hidden="true">↗</span></a>
        <div class="wzn-actions">
          <button type="button" class="wzn-btn" data-a="hide">Hide until next update</button>
          <button type="button" class="wzn-btn primary" data-a="ok">Got it</button>
        </div>
      </div>`;
    const close = () => { updateNoticeClosed = true; root.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'hide') { if (bzBuildId && !FORCE_UPDATE_NOTICE) store.set('wzg-notice-dismissed', bzBuildId); close(); }
      else if (a === 'ok' || e.target === root) close();
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(root);
    root.querySelector('.wzn-btn.primary')?.focus({ preventScroll: true });
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
    remove(k) { try { localStorage.removeItem(k); } catch {} }
  };

  const ASSET_BASE = 'https://raw.githubusercontent.com/Skinny-yz/assets/refs/heads/main/';
  const assetCache = new Map();
  const ASSET_CACHE_NAME = 'betterzilla-assets-' + ((typeof GM_info !== 'undefined' && GM_info && GM_info.script && GM_info.script.version) || '0');
  let assetCachePruned = false;
  async function assetCacheStorage() {
    try {
      if (typeof caches === 'undefined') return null;
      const cache = await caches.open(ASSET_CACHE_NAME);
      if (!assetCachePruned) {
        assetCachePruned = true;
        caches.keys().then(keys => keys.filter(k => k.startsWith('betterzilla-assets-') && k !== ASSET_CACHE_NAME).forEach(k => caches.delete(k))).catch(() => {});
      }
      return cache;
    } catch { return null; }
  }
  function assetDownload(name, url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({ method: 'GET', url, responseType: 'blob',
          onload: r => (r.status >= 200 && r.status < 300 && r.response) ? resolve(r.response) : reject(Error('Asset ' + name + ' HTTP ' + r.status)),
          onerror: () => reject(Error('Asset ' + name + ' failed')), ontimeout: () => reject(Error('Asset ' + name + ' timeout')) });
      } else {
        fetch(url).then(r => r.ok ? r.blob() : Promise.reject(Error('Asset ' + name + ' HTTP ' + r.status))).then(resolve, reject);
      }
    });
  }
  function assetURL(name) {
    if (assetCache.has(name)) return assetCache.get(name);
    const url = /^https?:\/\//.test(name) ? name : ASSET_BASE + name;
    const promise = (async () => {
      const cache = await assetCacheStorage();
      if (cache) { try { const hit = await cache.match(url); if (hit) return URL.createObjectURL(await hit.blob()); } catch {} }
      const blob = await assetDownload(name, url);
      if (cache) { try { await cache.put(url, new Response(blob, { headers: { 'Content-Type': blob.type || 'application/octet-stream' } })); } catch {} }
      return URL.createObjectURL(blob);
    })();
    promise.catch(() => assetCache.delete(name));
    assetCache.set(name, promise);
    return promise;
  }

  function assetText(name) {
    const url = /^https?:\/\//.test(name) ? name : ASSET_BASE + name;
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({ method: 'GET', url, responseType: 'text', timeout: 20000,
          onload: r => (r.status >= 200 && r.status < 300 && typeof r.responseText === 'string') ? resolve(r.responseText) : reject(Error('Asset ' + name + ' HTTP ' + r.status)),
          onerror: () => reject(Error('Asset ' + name + ' failed')), ontimeout: () => reject(Error('Asset ' + name + ' timeout')) });
      } else {
        fetch(url).then(r => r.ok ? r.text() : Promise.reject(Error('Asset ' + name + ' HTTP ' + r.status))).then(resolve, reject);
      }
    });
  }

  const STORE_KEY = 'wzg-saved-accessory-ids';
  const PREF_KEY = 'wzg-preferences';

  const LANGUAGE_KEY = 'wzg-language';
  const LANGUAGES = {
    en: { name: 'English', native: 'English' },
    pt: { name: 'Português', native: 'Português' },
    es: { name: 'Español', native: 'Español' },
    ar: { name: 'العربية', native: 'العربية' },
  };
  const I18N = {
    pt: {
      'Settings':'Configurações','Account':'Conta','General':'Geral','Audio':'Áudio','Visual':'Visual','Controls':'Controles','Shortcuts':'Atalhos','Performance':'Desempenho','Speed Control':'Controle de velocidade','Language':'Idioma','Betterzilla':'Betterzilla','Config files':'Arquivos de configuração','Speed control':'Controle de velocidade','Your pace, saved across sessions.':'Seu ritmo, salvo entre sessões.','Your speed and on/off preference are saved.':'Sua velocidade e preferência de ativação são salvas.','Visual game speed':'Velocidade visual do jogo','Changes only the visual timing of the game. Great for training faster reflexes.':'Acelera apenas o ritmo visual do jogo. Ótimo para treinar reflexos rápidos.','CURRENT SPEED':'VELOCIDADE ATUAL','Enable speed control':'Ativar controle de velocidade','Speed multiplier':'Multiplicador de velocidade','Speed multiplier slider':'Controle deslizante de velocidade','Apply':'Aplicar','Reset 1×':'Redefinir para 1×','0.7× · MIN':'0,7× · MÍN.','1.5× · MAX':'1,5× · MÁX.','Auto-save · 1× is normal speed.':'Salvamento automático · 1× é a velocidade normal.','Enabled · restored automatically after refresh.':'Ativado · restaurado automaticamente ao recarregar.','Disabled · your selected speed is saved.':'Desativado · sua velocidade escolhida está salva.','Enter a speed between 0.7 and 1.5.':'Informe uma velocidade entre 0,7 e 1,5.','Disable the separate speed userscript and reload to use the integrated control.':'Desative o userscript de velocidade separado e recarregue para usar este controle.','Applied. Choose your speed before entering a match.':'Aplicado. Escolha a velocidade antes de entrar em uma partida.','Normal timing: 1×.':'Ritmo normal: 1×.','Selected: ':'Selecionado: ',' · release to save.':' · solte para salvar.','Choose the language for the Betterzilla interface.':'Escolha o idioma da interface do Betterzilla.','Changes apply immediately and are saved on this device.':'A alteração é aplicada na hora e salva neste dispositivo.','Background (custom)':'Plano de fundo (personalizado)','Save up to 3 uploads and switch between them':'Salve até 3 imagens e alterne entre elas','Use this background':'Usar este plano de fundo','Upload an image':'Enviar uma imagem','Replace':'Substituir','Upload':'Enviar','In use':'Em uso','Use':'Usar','Empty':'Vazio','Storage full':'Armazenamento cheio','Pick from screen':'Selecionar da tela','Remove':'Remover','Background preview':'Prévia do plano de fundo','Select a language':'Selecione um idioma','Visual speed only':'Apenas velocidade visual','Language saved':'Idioma salvo','ON':'ATIVADO','OFF':'DESATIVADO','VISUAL ONLY':'APENAS VISUAL'
    },
    es: {
      'Settings':'Ajustes','Account':'Cuenta','General':'General','Audio':'Audio','Visual':'Visual','Controls':'Controles','Shortcuts':'Atajos','Performance':'Rendimiento','Speed Control':'Control de velocidad','Language':'Idioma','Betterzilla':'Betterzilla','Config files':'Archivos de configuración','Speed control':'Control de velocidad','Your pace, saved across sessions.':'Tu ritmo, guardado entre sesiones.','Your speed and on/off preference are saved.':'Tu velocidad y preferencia de activación se guardan.','Visual game speed':'Velocidad visual del juego','Changes only the visual timing of the game. Great for training faster reflexes.':'Acelera únicamente el ritmo visual del juego. Ideal para entrenar reflejos rápidos.','CURRENT SPEED':'VELOCIDAD ACTUAL','Enable speed control':'Activar control de velocidad','Speed multiplier':'Multiplicador de velocidad','Speed multiplier slider':'Control deslizante de velocidad','Apply':'Aplicar','Reset 1×':'Restablecer a 1×','0.7× · MIN':'0,7× · MÍN.','1.5× · MAX':'1,5× · MÁX.','Auto-save · 1× is normal speed.':'Guardado automático · 1× es la velocidad normal.','Enabled · restored automatically after refresh.':'Activado · se restaura al recargar.','Disabled · your selected speed is saved.':'Desactivado · tu velocidad está guardada.','Enter a speed between 0.7 and 1.5.':'Introduce una velocidad entre 0,7 y 1,5.','Disable the separate speed userscript and reload to use the integrated control.':'Desactiva el userscript de velocidad independiente y recarga para usar este control.','Applied. Choose your speed before entering a match.':'Aplicado. Elige la velocidad antes de entrar en una partida.','Normal timing: 1×.':'Ritmo normal: 1×.','Selected: ':'Seleccionado: ',' · release to save.':' · suelta para guardar.','Choose the language for the Betterzilla interface.':'Elige el idioma de la interfaz de Betterzilla.','Changes apply immediately and are saved on this device.':'El cambio se aplica al instante y se guarda en este dispositivo.','Background (custom)':'Fondo (personalizado)','Save up to 3 uploads and switch between them':'Guarda hasta 3 imágenes y alterna entre ellas','Use this background':'Usar este fondo','Upload an image':'Subir una imagen','Replace':'Reemplazar','Upload':'Subir','In use':'En uso','Use':'Usar','Empty':'Vacío','Storage full':'Almacenamiento lleno','Pick from screen':'Seleccionar de la pantalla','Remove':'Quitar','Background preview':'Vista previa del fondo','Select a language':'Selecciona un idioma','Visual speed only':'Solo velocidad visual','Language saved':'Idioma guardado'
    },
    ar: {
      'Settings':'الإعدادات','Account':'الحساب','General':'عام','Audio':'الصوت','Visual':'المظهر','Controls':'عناصر التحكم','Shortcuts':'الاختصارات','Performance':'الأداء','Speed Control':'التحكم بالسرعة','Language':'اللغة','Betterzilla':'Betterzilla','Config files':'ملفات الإعدادات','Speed control':'التحكم بالسرعة','Your pace, saved across sessions.':'سرعتك محفوظة بين الجلسات.','Your speed and on/off preference are saved.':'يتم حفظ السرعة وتفضيل التشغيل.','Visual game speed':'سرعة عرض اللعبة','Changes only the visual timing of the game. Great for training faster reflexes.':'يسرّع إيقاع عرض اللعبة فقط. مفيد لتدريب ردود الفعل السريعة.','CURRENT SPEED':'السرعة الحالية','Enable speed control':'تفعيل التحكم بالسرعة','Speed multiplier':'مضاعف السرعة','Speed multiplier slider':'منزلق السرعة','Apply':'تطبيق','Reset 1×':'إعادة إلى 1×','0.7× · MIN':'0.7× · الأدنى','1.5× · MAX':'1.5× · الأقصى','Auto-save · 1× is normal speed.':'حفظ تلقائي · السرعة الطبيعية هي 1×.','Enabled · restored automatically after refresh.':'مفعّل · يُستعاد تلقائيًا بعد التحديث.','Disabled · your selected speed is saved.':'معطّل · تم حفظ السرعة المختارة.','Enter a speed between 0.7 and 1.5.':'أدخل سرعة بين 0.7 و1.5.','Disable the separate speed userscript and reload to use the integrated control.':'عطّل سكربت السرعة المنفصل وأعد التحميل لاستخدام هذا الخيار.','Applied. Choose your speed before entering a match.':'تم التطبيق. اختر السرعة قبل بدء المباراة.','Normal timing: 1×.':'الإيقاع الطبيعي: 1×.','Selected: ':'المحدد: ',' · release to save.':' · اتركه للحفظ.','Choose the language for the Betterzilla interface.':'اختر لغة واجهة Betterzilla.','Changes apply immediately and are saved on this device.':'يُطبّق التغيير فورًا ويُحفظ على هذا الجهاز.','Background (custom)':'الخلفية (مخصصة)','Save up to 3 uploads and switch between them':'احفظ حتى 3 صور وبدّل بينها','Use this background':'استخدم هذه الخلفية','Upload an image':'ارفع صورة','Replace':'استبدال','Upload':'رفع','In use':'قيد الاستخدام','Use':'استخدم','Empty':'فارغ','Storage full':'مساحة التخزين ممتلئة','Pick from screen':'اختيار من الشاشة','Remove':'إزالة','Background preview':'معاينة الخلفية','Select a language':'اختر لغة','Visual speed only':'سرعة عرض فقط','Language saved':'تم حفظ اللغة'
    }
  };
  Object.assign(I18N.pt, {
    'Visual speed only · useful for reflex practice.':'Só acelera a parte visual · bom para treinar reflexos.',
    'Reset to 100%':'Redefinir para 100%','Screen & food effects':'Efeitos de tela e comida','Control flashes, food glow and floating text.':'Controle flashes, brilho da comida e textos flutuantes.','Disable screen flashes':'Desativar flashes da tela','Keep the background neutral near the border and remove the full-screen power-up overlay.':'Mantém o fundo neutro perto da borda e remove o efeito de power-up em tela cheia.','Wormate food & portions':'Comidas e poções do Wormate','Wormate food, potions and glows. Hide food glow and Lightweight food still take priority.':'Comidas, poções e brilhos do Wormate. Ocultar brilho e comida leve ainda têm prioridade.','Hide food glow':'Ocultar brilho da comida','Hide +points popups':'Ocultar pontos flutuantes','Ability icons':'Ícones de habilidades','Show speed & curve like Wormate extensions':'Exibir velocidade e curva como nas extensões do Wormate','Hide curve icon':'Ocultar ícone de curva','Wormate icons above snakes':'Ícones do Wormate sobre as cobras','Show enemies cooldown':'Exibir recarga dos inimigos','Cooldown only (hide item icon)':'Só a recarga (ocultar ícone do item)','Names & messages':'Nomes e mensagens','Names & effects':'Nomes e efeitos','Choose what appears during a match.':'Escolha o que aparece durante a partida.','Visual name spoofer':'Nome visual personalizado','Only you see this name above your snake and in Top 10. Your account name stays unchanged.':'Só você vê este nome acima da cobra e no Top 10. O nome da conta não muda.','Your visual name':'Seu nome visual','Hide kill feed':'Ocultar feed de eliminações',
    'HUD editor':'Editor do HUD','Undo':'Desfazer','Buttons':'Botões','Reset':'Redefinir','Cancel':'Cancelar','Save':'Salvar','Side buttons':'Botões laterais','Close':'Fechar','Drag the bar on the screen to choose where it sits (it snaps to the nearest edge). List is top → bottom as on a vertical bar.':'Arraste a barra na tela para escolher onde ela fica (ela se ajusta à borda mais próxima). A lista segue de cima para baixo, como uma barra vertical.','ZOOM':'ZOOM','+ / − buttons':'Botões + / −','Slider':'Controle deslizante','Both':'Ambos','ZOOM SLIDER':'CONTROLE DE ZOOM','Size':'Tamanho','Opacity (glass)':'Opacidade (vidro)','BUTTONS':'BOTÕES','Zoom in (+)':'Aproximar (+)','Zooms the camera in.':'Aproxima a câmera.','Zoom out (−)':'Afastar (−)','Zooms the camera out.':'Afasta a câmera.','Reload':'Recarregar',"Game’s reload button (circular arrow).":'Botão de recarregar do jogo (seta circular).','AFK spiral':'Espiral AFK',"Spiral button: triggers the game's AFK mode.":'Botão espiral: ativa o modo AFK do jogo.','SOS (headset)':'SOS (fone)',"Game's SOS button (headset icon).":'Botão SOS do jogo (ícone de fone).','Reset buttons':'Redefinir botões','Done':'Concluído','Drag each block. Sizes learned from your last match. Orange outline = moved.':'Arraste os blocos. Os tamanhos são aprendidos na última partida. Contorno laranja = movido.','Screen & food effects':'Efeitos de tela e comida','Ability icons':'Ícones de habilidades','Hide feed':'Ocultar feed','Map border':'Borda do mapa','Saturation':'Saturação','Game saturation':'Saturação do jogo','100% is original. Applies to the game, including its HUD.':'100% é o padrão. Aplica-se ao jogo e ao HUD.'
  });
  Object.assign(I18N.es, {
    'Visual speed only · useful for reflex practice.':'Solo acelera lo visual · útil para entrenar reflejos.',
    'Reset to 100%':'Restablecer al 100%','Screen & food effects':'Efectos de pantalla y comida','Control flashes, food glow and floating text.':'Controla los destellos, el brillo de la comida y los textos flotantes.','Disable screen flashes':'Desactivar destellos','Keep the background neutral near the border and remove the full-screen power-up overlay.':'Mantiene el fondo neutro junto al borde y elimina el efecto de power-up a pantalla completa.','Wormate food & portions':'Comida y pociones de Wormate','Wormate food, potions and glows. Hide food glow and Lightweight food still take priority.':'Comida, pociones y brillos de Wormate. Ocultar brillo y comida ligera siguen teniendo prioridad.','Hide food glow':'Ocultar brillo de comida','Hide +points popups':'Ocultar puntos flotantes','Ability icons':'Iconos de habilidades','Show speed & curve like Wormate extensions':'Mostrar velocidad y curva como en las extensiones de Wormate','Hide curve icon':'Ocultar icono de curva','Wormate icons above snakes':'Iconos de Wormate sobre las serpientes','Show enemies cooldown':'Mostrar recarga de enemigos','Cooldown only (hide item icon)':'Solo recarga (ocultar icono del objeto)','Names & messages':'Nombres y mensajes','Names & effects':'Nombres y efectos','Choose what appears during a match.':'Elige qué aparece durante la partida.','Visual name spoofer':'Nombre visual personalizado','Only you see this name above your snake and in Top 10. Your account name stays unchanged.':'Solo tú ves este nombre sobre tu serpiente y en el Top 10. Tu nombre de cuenta no cambia.','Your visual name':'Tu nombre visual','Hide kill feed':'Ocultar registro de eliminaciones',
    'HUD editor':'Editor del HUD','Undo':'Deshacer','Buttons':'Botones','Reset':'Restablecer','Cancel':'Cancelar','Save':'Guardar','Side buttons':'Botones laterales','Close':'Cerrar','Drag the bar on the screen to choose where it sits (it snaps to the nearest edge). List is top → bottom as on a vertical bar.':'Arrastra la barra en la pantalla para elegir su posición (se ajusta al borde más cercano). La lista va de arriba abajo, como una barra vertical.','ZOOM':'ZOOM','+ / − buttons':'Botones + / −','Slider':'Deslizador','Both':'Ambos','ZOOM SLIDER':'DESLIZADOR DE ZOOM','Size':'Tamaño','Opacity (glass)':'Opacidad (cristal)','BUTTONS':'BOTONES','Zoom in (+)':'Acercar (+)','Zooms the camera in.':'Acerca la cámara.','Zoom out (−)':'Alejar (−)','Zooms the camera out.':'Aleja la cámara.','Reload':'Recargar',"Game’s reload button (circular arrow).":'Botón de recarga del juego (flecha circular).','AFK spiral':'Espiral AFK',"Spiral button: triggers the game's AFK mode.":'Botón espiral: activa el modo AFK del juego.','SOS (headset)':'SOS (auriculares)',"Game's SOS button (headset icon).":'Botón SOS del juego (icono de auriculares).','Reset buttons':'Restablecer botones','Done':'Listo','Drag each block. Sizes learned from your last match. Orange outline = moved.':'Arrastra cada bloque. Los tamaños se adaptan a tu última partida. Borde naranja = movido.','Map border':'Borde del mapa','Saturation':'Saturación','Game saturation':'Saturación del juego','100% is original. Applies to the game, including its HUD.':'100% es el valor original. Se aplica al juego y al HUD.'
  });
  Object.assign(I18N.ar, {
    'Visual speed only · useful for reflex practice.':'تغيير بصري فقط · مفيد لتدريب ردود الفعل.',
    'Reset to 100%':'إعادة إلى 100%','Screen & food effects':'تأثيرات الشاشة والطعام','Control flashes, food glow and floating text.':'تحكم في الومضات وتوهج الطعام والنصوص العائمة.','Disable screen flashes':'تعطيل ومضات الشاشة','Keep the background neutral near the border and remove the full-screen power-up overlay.':'يحافظ على خلفية محايدة قرب الحدود ويزيل تأثير التعزيز بملء الشاشة.','Wormate food & portions':'طعام وجرعات Wormate','Wormate food, potions and glows. Hide food glow and Lightweight food still take priority.':'طعام وجرعات وتوهجات Wormate. يظل إخفاء التوهج والطعام الخفيف لهما الأولوية.','Hide food glow':'إخفاء توهج الطعام','Hide +points popups':'إخفاء نقاط المكافأة','Ability icons':'أيقونات القدرات','Show speed & curve like Wormate extensions':'إظهار السرعة والمسار مثل إضافات Wormate','Hide curve icon':'إخفاء أيقونة المسار','Wormate icons above snakes':'أيقونات Wormate فوق الثعابين','Show enemies cooldown':'إظهار وقت انتظار الخصوم','Cooldown only (hide item icon)':'وقت الانتظار فقط (إخفاء أيقونة العنصر)','Names & messages':'الأسماء والرسائل','Names & effects':'الأسماء والتأثيرات','Choose what appears during a match.':'اختر ما يظهر أثناء المباراة.','Visual name spoofer':'اسم عرض مخصص','Only you see this name above your snake and in Top 10. Your account name stays unchanged.':'أنت فقط ترى هذا الاسم فوق ثعبانك وفي أفضل 10. لن يتغير اسم حسابك.','Your visual name':'اسم العرض','Hide kill feed':'إخفاء سجل الإقصاءات',
    'HUD editor':'محرر HUD','Undo':'تراجع','Buttons':'الأزرار','Reset':'إعادة ضبط','Cancel':'إلغاء','Save':'حفظ','Side buttons':'الأزرار الجانبية','Close':'إغلاق','Drag the bar on the screen to choose where it sits (it snaps to the nearest edge). List is top → bottom as on a vertical bar.':'اسحب الشريط على الشاشة لتحديد موضعه (يلتصق بأقرب حافة). القائمة من الأعلى إلى الأسفل كما في الشريط العمودي.','ZOOM':'التكبير','+ / − buttons':'أزرار + / −','Slider':'منزلق','Both':'كلاهما','ZOOM SLIDER':'منزلق التكبير','Size':'الحجم','Opacity (glass)':'الشفافية (زجاجي)','BUTTONS':'الأزرار','Zoom in (+)':'تكبير (+)','Zooms the camera in.':'يقرّب الكاميرا.','Zoom out (−)':'تصغير (−)','Zooms the camera out.':'يبعد الكاميرا.','Reload':'إعادة تحميل',"Game’s reload button (circular arrow).":'زر إعادة تحميل اللعبة (سهم دائري).','AFK spiral':'دوامة AFK',"Spiral button: triggers the game's AFK mode.":'زر الدوامة: يفعّل وضع AFK في اللعبة.','SOS (headset)':'استغاثة (سماعة)',"Game's SOS button (headset icon).":'زر الاستغاثة في اللعبة (أيقونة سماعة).','Reset buttons':'إعادة ضبط الأزرار','Done':'تم','Drag each block. Sizes learned from your last match. Orange outline = moved.':'اسحب كل كتلة. تُحفظ الأحجام من مباراتك الأخيرة. الإطار البرتقالي يعني أنها تحركت.','Map border':'حدود الخريطة','Saturation':'التشبع','Game saturation':'تشبع اللعبة','100% is original. Applies to the game, including its HUD.':'100% هو الإعداد الأصلي. ينطبق على اللعبة وواجهة HUD.'
  });
  Object.assign(I18N.pt, { "Game's reload button (circular arrow).":'Botão de recarregar do jogo (seta circular).','Show the effects shown in front of snakes.':'Exibe os efeitos diante das cobras.','Changes apply immediately and are saved on this device.':'A alteração é aplicada na hora e salva neste dispositivo.','SETTINGS':'CONFIGURAÇÕES','Wormate skins':'Skins do Wormate','Side bar':'Barra lateral','Hide feed':'Ocultar feed','Enable':'Ativar','Disable':'Desativar','Disable speed control':'Desativar controle de velocidade','0.7× to 1.5× · saved automatically':'0,7× a 1,5× · salvo automaticamente' });
  Object.assign(I18N.es, { "Game's reload button (circular arrow).":'Botón de recarga del juego (flecha circular).','Changes apply immediately and are saved on this device.':'El cambio se aplica al instante y se guarda en este dispositivo.','SETTINGS':'AJUSTES','Wormate skins':'Skins de Wormate','Side bar':'Barra lateral','Hide feed':'Ocultar registro','Enable':'Activar','Disable':'Desactivar','Disable speed control':'Desactivar control de velocidad','0.7× to 1.5× · saved automatically':'0,7× a 1,5× · guardado automáticamente' });
  Object.assign(I18N.ar, { "Game's reload button (circular arrow).":'زر إعادة تحميل اللعبة (سهم دائري).','Changes apply immediately and are saved on this device.':'يُطبّق التغيير فورًا ويُحفظ على هذا الجهاز.','SETTINGS':'الإعدادات','Wormate skins':'مظاهر Wormate','Side bar':'الشريط الجانبي','Hide feed':'إخفاء السجل','Enable':'تفعيل','Disable':'تعطيل','Disable speed control':'تعطيل التحكم بالسرعة','0.7× to 1.5× · saved automatically':'من 0.7× إلى 1.5× · حفظ تلقائي' });
  Object.assign(I18N.pt, {
    'GAME CUSTOMIZATIONS':'PERSONALIZAÇÕES DO JOGO','Your game, your way':'Seu jogo, do seu jeito','Reduce visual work without changing resolution.':'Reduza o trabalho visual sem alterar a resolução.','Lightweight food':'Comida leve','Remove food glow and skip unchanged food transforms. Keeps every item visible.':'Remove o brilho da comida e ignora animações sem mudanças. Mantém todos os itens visíveis.','Anti-lag mode':'Modo ant lag','Remove body glow and its updates, and hide floating effects. Keeps your resolution unchanged.':'Remove o brilho da cobra e seus efeitos flutuantes. Mantém a resolução.','Helpers':'Auxiliares','Visual guides for heads and the arena border.':'Guias visuais para cabeças e bordas da arena.','X1 Red Helper':'Auxiliar vermelho X1','Show the arena border above snake bodies.':'Exibe a borda da arena sobre as cobras.','Rankings & scores':'Classificações e pontuação','Size, colors and score display.':'Tamanho, cores e exibição da pontuação.','Ranking size':'Tamanho do ranking','Scales TOP HS and Records together.':'Redimensiona TOP HS e Records juntos.','Mobile HUD layout':'HUD para celular','On phones: minimap, HS/KILL, TOP HS and three Records in a fixed left column. Desktop layout is unchanged.':'No celular: minimapa, HS/KILL, TOP HS e três Records em uma coluna fixa à esquerda. O layout do desktop não muda.','Full score numbers':'Pontuação completa','Show complete scores without M or B. Reload after enabling.':'Mostra a pontuação completa, sem M ou B. Recarregue após ativar.','Choose the effects shown in front of snakes.':'Escolha os efeitos exibidos diante das cobras.','Replace speed icon':'Substituir ícone de velocidade','Hide only the blue curve spiral in front of snakes. Keep other ability effects.':'Oculta apenas a espiral azul de curva diante das cobras. Mantém os outros efeitos.','Swap the effect icons shown above opponents (speed, curve, 2x, 5x...) for the Wormate ones. Needs the icon display set to full.':'Troca pelos ícones do Wormate os efeitos exibidos sobre os adversários (velocidade, curva, 2x, 5x...). Requer a exibição completa de ícones.','Sets Controls > Show abilities to Full and shows the seconds left under each effect icon above opponents. Turning it off switches it to Essential.':'Define Controles > Exibir habilidades como Completo e mostra os segundos restantes sob os ícones dos adversários. Ao desativar, volta para Essencial.','Show just the seconds left above opponents, without the item icon. Needs Show enemies cooldown on.':'Mostra apenas os segundos restantes sobre os adversários, sem o ícone do item. Requer Exibir recarga dos inimigos.',
    'Minimap + HS/KILL':'Minimapa + HS/KILL','Mode':'Modo','Abilities':'Habilidades','TOP HS':'TOP HS','Records':'Recordes','Top 10':'Top 10','Zoom slider':'Controle de zoom','Move HUD':'Mover HUD','In-match HUD move mode (drag pieces and this bar).':'Modo de movimentação do HUD na partida (arraste os elementos e esta barra).','Rotate your phone to landscape: the layout is saved relative to the match screen.':'Gire o celular para a horizontal: o layout é salvo em relação à tela da partida.','Drag each block. Sizes refine automatically after you play a match.':'Arraste cada bloco. Os tamanhos são ajustados automaticamente após uma partida.','Show Zoom in (+)':'Exibir Aproximar (+)','Show Zoom out (−)':'Exibir Afastar (−)'
  });
  Object.assign(I18N.es, {
    'GAME CUSTOMIZATIONS':'PERSONALIZACIÓN DEL JUEGO','Your game, your way':'Tu juego, a tu manera','Reduce visual work without changing resolution.':'Reduce el trabajo visual sin cambiar la resolución.','Lightweight food':'Comida ligera','Remove food glow and skip unchanged food transforms. Keeps every item visible.':'Elimina el brillo de la comida y omite animaciones sin cambios. Mantiene todos los objetos visibles.','Anti-lag mode':'Modo antirretardo','Remove body glow and its updates, and hide floating effects. Keeps your resolution unchanged.':'Elimina el brillo de la serpiente y sus efectos flotantes. Mantiene la resolución.','Helpers':'Ayudas','Visual guides for heads and the arena border.':'Guías visuales para las cabezas y el borde de la arena.','X1 Red Helper':'Ayuda roja X1','Show the arena border above snake bodies.':'Muestra el borde de la arena sobre las serpientes.','Rankings & scores':'Clasificaciones y puntuación','Size, colors and score display.':'Tamaño, colores y puntuación.','Ranking size':'Tamaño de clasificación','Scales TOP HS and Records together.':'Ajusta TOP HS y Records juntos.','Mobile HUD layout':'HUD para móvil','On phones: minimap, HS/KILL, TOP HS and three Records in a fixed left column. Desktop layout is unchanged.':'En móviles: minimapa, HS/KILL, TOP HS y tres Records en una columna fija a la izquierda. El diseño de escritorio no cambia.','Full score numbers':'Puntuación completa','Show complete scores without M or B. Reload after enabling.':'Muestra la puntuación completa, sin M ni B. Recarga al activarlo.','Choose the effects shown in front of snakes.':'Elige los efectos que aparecen delante de las serpientes.','Replace speed icon':'Sustituir icono de velocidad','Hide only the blue curve spiral in front of snakes. Keep other ability effects.':'Oculta solo la espiral azul de curva delante de las serpientes. Mantiene los demás efectos.','Swap the effect icons shown above opponents (speed, curve, 2x, 5x...) for the Wormate ones. Needs the icon display set to full.':'Cambia por los de Wormate los iconos de efecto sobre rivales (velocidad, curva, 2x, 5x...). Requiere mostrar todos los iconos.','Sets Controls > Show abilities to Full and shows the seconds left under each effect icon above opponents. Turning it off switches it to Essential.':'Configura Controles > Mostrar habilidades como Completo y muestra los segundos restantes bajo los iconos rivales. Al desactivarlo, vuelve a Esencial.','Show just the seconds left above opponents, without the item icon. Needs Show enemies cooldown on.':'Muestra solo los segundos restantes sobre los rivales, sin el icono. Requiere activar Mostrar recarga de enemigos.',
    'Minimap + HS/KILL':'Minimapa + HS/KILL','Mode':'Modo','Abilities':'Habilidades','TOP HS':'TOP HS','Records':'Récords','Top 10':'Top 10','Zoom slider':'Control de zoom','Move HUD':'Mover HUD','In-match HUD move mode (drag pieces and this bar).':'Modo para mover el HUD en partida (arrastra las piezas y esta barra).','Rotate your phone to landscape: the layout is saved relative to the match screen.':'Gira el móvil a horizontal: el diseño se guarda en relación con la pantalla de partida.','Drag each block. Sizes refine automatically after you play a match.':'Arrastra cada bloque. Los tamaños se ajustan automáticamente tras jugar una partida.'
  });
  Object.assign(I18N.ar, {
    'GAME CUSTOMIZATIONS':'تخصيصات اللعبة','Your game, your way':'لعبتك بطريقتك','Reduce visual work without changing resolution.':'قلل المؤثرات المرئية دون تغيير الدقة.','Lightweight food':'طعام خفيف','Remove food glow and skip unchanged food transforms. Keeps every item visible.':'أزل توهج الطعام وتجاوز الحركات غير المتغيرة. تبقى كل العناصر ظاهرة.','Anti-lag mode':'وضع تقليل التأخير','Remove body glow and its updates, and hide floating effects. Keeps your resolution unchanged.':'أزل توهج الثعبان والمؤثرات العائمة. لا يغيّر دقة العرض.','Helpers':'مساعدات','Visual guides for heads and the arena border.':'إرشادات مرئية للرؤوس وحدود الساحة.','X1 Red Helper':'مساعد X1 الأحمر','Show the arena border above snake bodies.':'أظهر حدود الساحة فوق أجسام الثعابين.','Rankings & scores':'الترتيب والنتائج','Size, colors and score display.':'الحجم والألوان وعرض النقاط.','Ranking size':'حجم الترتيب','Scales TOP HS and Records together.':'يغيّر حجم TOP HS والسجلات معًا.','Mobile HUD layout':'واجهة الهاتف','On phones: minimap, HS/KILL, TOP HS and three Records in a fixed left column. Desktop layout is unchanged.':'على الهاتف: خريطة مصغرة وHS/KILL وTOP HS وثلاثة سجلات في عمود ثابت يسارًا. لا يتغير تخطيط الكمبيوتر.','Full score numbers':'عرض النقاط كاملة','Show complete scores without M or B. Reload after enabling.':'اعرض النقاط كاملة دون M أو B. أعد التحميل بعد التفعيل.','Choose the effects shown in front of snakes.':'اختر التأثيرات التي تظهر أمام الثعابين.','Replace speed icon':'استبدال أيقونة السرعة','Hide only the blue curve spiral in front of snakes. Keep other ability effects.':'أخفِ دوامة المسار الزرقاء فقط أمام الثعابين مع إبقاء بقية التأثيرات.','Swap the effect icons shown above opponents (speed, curve, 2x, 5x...) for the Wormate ones. Needs the icon display set to full.':'استبدل أيقونات التأثير فوق الخصوم (السرعة والمسار و2x و5x...) بأيقونات Wormate. يتطلب عرض الأيقونات كاملة.','Sets Controls > Show abilities to Full and shows the seconds left under each effect icon above opponents. Turning it off switches it to Essential.':'يضبط عناصر التحكم > إظهار القدرات على كامل ويعرض الثواني المتبقية أسفل أيقونات الخصوم. عند إيقافه يعود إلى أساسي.','Show just the seconds left above opponents, without the item icon. Needs Show enemies cooldown on.':'اعرض الثواني المتبقية فوق الخصوم فقط دون أيقونة العنصر. يتطلب تفعيل وقت انتظار الخصوم.',
    'Minimap + HS/KILL':'خريطة مصغرة + HS/KILL','Mode':'الوضع','Abilities':'القدرات','TOP HS':'أفضل HS','Records':'السجلات','Top 10':'أفضل 10','Zoom slider':'منزلق التكبير','Move HUD':'تحريك HUD','In-match HUD move mode (drag pieces and this bar).':'وضع تحريك HUD أثناء المباراة (اسحب العناصر وهذا الشريط).','Rotate your phone to landscape: the layout is saved relative to the match screen.':'أدر الهاتف أفقيًا؛ يُحفظ التخطيط بالنسبة إلى شاشة المباراة.','Drag each block. Sizes refine automatically after you play a match.':'اسحب كل كتلة. تتحسن الأحجام تلقائيًا بعد لعب مباراة.'
  });
  Object.assign(I18N.pt, {
    'UPDATE IN PROGRESS':'ATUALIZAÇÃO EM ANDAMENTO','Game update detected':'Atualização do jogo detectada',
    'Wormzilla.io was updated, so Betterzilla is not working right now. We are adapting the mod to the new game version and it will be back within 1 day.':'O Wormzilla.io foi atualizado, então o Betterzilla não está funcionando agora. Estamos adaptando o mod para a nova versão do jogo e ele volta em até 1 dia.',
    'Status':'Status','Updating':'Atualizando','Estimated time':'Tempo estimado','Up to 1 day':'Até 1 dia',
    'Questions or need help? Contact the TikTok account':'Dúvidas ou precisa de ajuda? Fale com a conta do TikTok','Hide until next update':'Ocultar até a próxima atualização','Got it':'Entendi'
  });
  Object.assign(I18N.es, {
    'UPDATE IN PROGRESS':'ACTUALIZACIÓN EN CURSO','Game update detected':'Actualización del juego detectada',
    'Wormzilla.io was updated, so Betterzilla is not working right now. We are adapting the mod to the new game version and it will be back within 1 day.':'Wormzilla.io se actualizó, por eso Betterzilla no funciona ahora. Estamos adaptando el mod a la nueva versión del juego y volverá en un plazo de 1 día.',
    'Status':'Estado','Updating':'Actualizando','Estimated time':'Tiempo estimado','Up to 1 day':'Hasta 1 día',
    'Questions or need help? Contact the TikTok account':'¿Dudas o necesitas ayuda? Contacta con la cuenta de TikTok','Hide until next update':'Ocultar hasta la próxima actualización','Got it':'Entendido'
  });
  Object.assign(I18N.ar, {
    'UPDATE IN PROGRESS':'التحديث قيد التنفيذ','Game update detected':'تم رصد تحديث للعبة',
    'Wormzilla.io was updated, so Betterzilla is not working right now. We are adapting the mod to the new game version and it will be back within 1 day.':'تم تحديث Wormzilla.io، لذلك لا يعمل Betterzilla حاليًا. نقوم بتكييف الإضافة مع نسخة اللعبة الجديدة وستعود خلال يوم واحد.',
    'Status':'الحالة','Updating':'قيد التحديث','Estimated time':'الوقت المتوقع','Up to 1 day':'حتى يوم واحد',
    'Questions or need help? Contact the TikTok account':'أسئلة أو تحتاج مساعدة؟ تواصل مع حساب تيك توك','Hide until next update':'إخفاء حتى التحديث التالي','Got it':'فهمت'
  });
  let currentLanguage = store.get(LANGUAGE_KEY) || 'en';
  if (!LANGUAGES[currentLanguage]) currentLanguage = 'en';
  let languageTouched = currentLanguage !== 'en';  // false = nunca traduziu nada: em ingles nao ha o que fazer
  const wsParts = new Map();                       // cache das partes (espaco, texto, espaco) de cada string
  const tr = value => (I18N[currentLanguage] && I18N[currentLanguage][value]) || value;
  function applyLanguage(root = document) {
    if (!root) return;
    if (currentLanguage === 'en' && !languageTouched) return;
    if (currentLanguage === 'en') {
      document.documentElement.lang = currentLanguage;
      document.documentElement.dir = currentLanguage === 'ar' ? 'rtl' : 'ltr';
    }
    document.documentElement.lang = currentLanguage;
    document.documentElement.dir = currentLanguage === 'ar' ? 'rtl' : 'ltr';
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walk.nextNode())) {
      if (node.__wzgEnglish == null) node.__wzgEnglish = node.nodeValue;
      const original = node.__wzgEnglish;
      let ws = wsParts.get(original);
      if (!ws) { ws = [original.match(/^\s*/)?.[0] || '', original.trim(), original.match(/\s*$/)?.[0] || '']; if (wsParts.size < 6000) wsParts.set(original, ws); }
      const leading = ws[0], core = ws[1], trailing = ws[2];
      const translated = tr(core);
      const output = leading + translated + trailing;
      if (node.nodeValue !== output) { node.nodeValue = output; node.__wzgTranslated = output; }
    }
    root.querySelectorAll?.('[title],[aria-label],[placeholder]').forEach(el => {
      for (const attr of ['title','aria-label','placeholder']) {
        if (!el.hasAttribute(attr)) continue;
        const key = 'wzgOrig' + attr.replace(/[^a-z]/gi, '').replace(/^./, c => c.toUpperCase());
        if (!el.dataset[key]) el.dataset[key] = el.getAttribute(attr);
        el.setAttribute(attr, tr(el.dataset[key]));
      }
    });
  }
  let languageObserver = null;
  function watchLanguage() {
    if (languageObserver || !document.body) return;
    applyLanguage(document.body);
    if (currentLanguage === 'en' && !languageTouched) return;   // ingles: nem cria o observer
    languageObserver = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') {
          const node = record.target;
          if (node.__wzgEnglish != null && node.nodeValue !== node.__wzgTranslated) { node.__wzgEnglish = node.nodeValue; node.__wzgTranslated = node.nodeValue; }
          applyLanguage(node.parentElement || document.body);
        } else for (const node of record.addedNodes) if (node.nodeType === 1) applyLanguage(node);
      }
    });
    languageObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  const icons = {
    reload: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/></svg>',
    store: '<svg viewBox="0 0 24 24"><path d="M3 9h18l-1-5H4L3 9Z"/><path d="M5 9v11h14V9M9 20v-6h6v6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></svg>',
    rank: '<svg viewBox="0 0 24 24"><path d="M8 21h4M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4"/></svg>',
    vip: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>',
    background: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 3 3 2-2 6 5"/></svg>',
    logout: '<svg viewBox="0 0 24 24"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M4 5a3 3 0 0 1 3-3h5v18H7a3 3 0 0 0-3 2V5ZM20 5a3 3 0 0 0-3-3h-5v18h5a3 3 0 0 1 3 2V5Z"/></svg>',
    focus: '<svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>',
    fullscreen: '<svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>',
    replay: '<svg viewBox="0 0 24 24"><path d="M4 10a8 8 0 1 1 2.3 7.7"/><path d="M4 4v6h6"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    save: '<svg viewBox="0 0 24 24"><path d="M5 3h12l2 2v16H5V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
    general: '<svg viewBox="0 0 24 24"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/></svg>',
    audio: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12"/></svg>',
    visual: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    controls: '<svg viewBox="0 0 24 24"><path d="M8.5 6h7a6.5 6.5 0 0 1 6.2 8.4l-1 3.1a2.2 2.2 0 0 1-3.8.7L15 16H9l-1.9 2.2a2.2 2.2 0 0 1-3.8-.7l-1-3.1A6.5 6.5 0 0 1 8.5 6Z"/><path d="M7 10v4M5 12h4M16.5 11.5h.01M19 13.5h.01"/></svg>',
    shortcuts: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h.01M11 9h.01M15 9h.01M19 9h.01M7 13h.01M11 13h.01M15 13h.01M7 16h10"/></svg>',
    performance: '<svg viewBox="0 0 24 24"><path d="M4.9 19a9 9 0 1 1 14.2 0"/><path d="m12 13 4-4"/><circle cx="12" cy="13" r="1"/></svg>',
    speed: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6M12 5V2M19 7l1.5-1.5"/></svg>',
    account: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
    arrowRight: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
    chevronDown: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
  };

  const state = {
    prefs: loadJSON(PREF_KEY, {
      guide: false,
      background: 'preset-1',
      customBackground: '',
      hideKillFeed: true,
    }),
    saved: loadJSON(STORE_KEY, []),
    searchTimer: null,
    selectCloseBound: false,
    mapCustomPreview: '',
  };

  const BACKGROUNDS = [
    { id: 'preset-1', name: 'Mountain I', url: 'https://i.pinimg.com/1200x/19/a2/d8/19a2d882bdb70e8befe9b3b656482fe4.jpg' },
    { id: 'preset-2', name: 'Mountain II', url: 'https://i.pinimg.com/1200x/17/4b/77/174b77c13dd4b36bc8376940135d280b.jpg' },
    { id: 'preset-3', name: 'Mountain III', url: 'https://i.pinimg.com/1200x/f0/52/cd/f052cd579d8b5ca4e821aeb3b3cf273e.jpg' },
    { id: 'preset-4', name: 'Mountain IV', url: 'https://i.pinimg.com/1200x/23/98/0a/23980a9741b8d711778f50586754f830.jpg' },
  ];

  const DEFAULT_MAP_PREVIEW = 'https://wormzilla.io/bgs/bg_default.webp';
  const nativeMapPreview = value => {
    if (value === 'Custom') return state.mapCustomPreview;
    if (value === 'Default') return DEFAULT_MAP_PREVIEW;
    const match = /^Background(\d+)$/.exec(value);
    return match ? `https://wormzilla.io/bgs/bg_${match[1]}.webp` : '';
  };

  function loadJSON(key, fallback) {
    try {
      const parsed = JSON.parse(store.get(key) || (Array.isArray(fallback) ? '[]' : '{}'));
      return Array.isArray(fallback)
        ? (Array.isArray(parsed) ? parsed : [...fallback])
        : { ...fallback, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
    }
    catch { return Array.isArray(fallback) ? [] : { ...fallback }; }
  }

  if (!Array.isArray(state.saved)) state.saved = [];
  state.saved = state.saved
    .map(item => {
      const id = Number(typeof item === 'object' ? item.id : item);
      if (!Number.isFinite(id) || id < 1) return null;
      const name = typeof item === 'object' && String(item.name || '').trim()
        ? String(item.name).trim()
        : `Item ${id}`;
      return { id, name };
    })
    .filter(Boolean);

  function persist() {
    store.set(PREF_KEY, JSON.stringify(state.prefs));
    store.set(STORE_KEY, JSON.stringify(state.saved));
  }

  let killFeedPush = null;
  let previousPush = null;
  let killFeedCaptured = false;
  const isKillEntry = entry => Array.isArray(entry) && entry.length === 4
    && typeof entry[0] === 'string' && typeof entry[1] === 'string'
    && entry[0].length <= 64 && entry[1].length <= 64
    && (entry[2] === 0 || entry[2] === 1)
    && Number.isInteger(entry[3]) && entry[3] >= 0;
  function installKillFeedFilter() {
    const proto = PAGE.Array.prototype;
    if (!state.prefs.hideKillFeed) {
      if (killFeedPush && proto.push === killFeedPush) proto.push = previousPush;
      killFeedPush = null;
      return;
    }
    if (killFeedPush || killFeedCaptured) return;
    previousPush = proto.push;
    const base = previousPush;
    const hook = function(item) {
      if (arguments.length === 1) {
        if (isKillEntry(item)) {
          if (proto.push === hook) proto.push = base;      // push nativo volta pra todo mundo
          if (killFeedPush === hook) killFeedPush = null;
          killFeedCaptured = true;
          Object.defineProperty(this, 'push', { configurable: true, writable: true, value: function(entry) {
            if (arguments.length === 1 && state.prefs.hideKillFeed && isKillEntry(entry)) return this.length;
            return arguments.length === 1 ? base.call(this, entry) : base.apply(this, arguments);
          }});
          return this.length;
        }
        return base.call(this, item);
      }
      return base.apply(this, arguments);
    };
    killFeedPush = hook;
    proto.push = hook;
  }
  function rearmKillFeedFilter() {
    if (!state.prefs.hideKillFeed || killFeedPush) return;
    killFeedCaptured = false;
    installKillFeedFilter();
  }

  function cleanDOMKillFeed() {
    document.querySelectorAll('#killFeed, #kill-feed, .kill-feed, .killfeed, .wzg-kill-feed-hidden')
      .forEach(node => node.classList.toggle('wzg-kill-feed-hidden', !!state.prefs.hideKillFeed));
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  const CSS = `
    :root {
      --wzg-bg: #0d0d0f;
      --wzg-panel: rgba(23,23,26,.72);
      --wzg-panel-solid: #18181b;
      --wzg-soft: rgba(255,255,255,.055);
      --wzg-soft-hover: rgba(255,255,255,.095);
      --wzg-line: rgba(255,255,255,.085);
      --wzg-line-strong: rgba(255,255,255,.16);
      --wzg-text: #f2f2f3;
      --wzg-dim: #99999f;
      --wzg-faint: #66666c;
      --wzg-black: #101011;
      --wzg-white: #f5f5f5;
      --wzg-good: #b9e3cf;
      --wzg-warn: #e8d3ae;
      --wzg-bad: #e8b2b5;
      --wzg-radius: 16px;
      --wzg-small: 10px;
      --wzg-shadow: 0 24px 80px rgba(0,0,0,.48);
      --wzg-user-bg: none;
    }

    * { box-sizing: border-box; }

    html.wzg-ready,
    html.wzg-ready body {
      min-height: 100%;
      background: var(--wzg-bg) !important;
      color: var(--wzg-text) !important;
      font-family: Arial, sans-serif !important;
    }

    html.wzg-ready body {
      overflow-x: hidden !important;
    }

    html.wzg-ready body::before {
      content: '';
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background:
        linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.58)),
        radial-gradient(circle at 50% -12%, rgba(255,255,255,.085), transparent 38%),
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900'%3E%3Cpath d='M0 650 160 520 275 590 450 390 620 555 795 340 990 560 1160 410 1320 555 1470 450 1600 570V900H0Z' fill='%23ffffff' opacity='.028'/%3E%3Cpath d='M0 710 190 600 390 690 610 525 820 700 1030 555 1210 690 1410 570 1600 670V900H0Z' fill='%23ffffff' opacity='.022'/%3E%3C/svg%3E") center/cover no-repeat;
    }

    html.wzg-ready body::after {
      content: '';
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      opacity: .26;
      background-image: radial-gradient(rgba(255,255,255,.16) .55px, transparent .55px);
      background-size: 6px 6px;
      mask-image: linear-gradient(to bottom, black, transparent 76%);
    }

    .wzg-ready ::-webkit-scrollbar { width: 4px; height: 4px; }
    .wzg-ready ::-webkit-scrollbar-track { background: transparent; }
    .wzg-ready ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.18); border-radius: 20px; }

    .wzg-ready .stage-wrap,
    .wzg-ready .stage,
    .wzg-ready #app { position: relative; z-index: 1; }

    .wzg-ready #app {
      background-color: #08080b !important;
      background-image:
        linear-gradient(180deg, rgba(5,5,7,.38), rgba(5,5,7,.68)),
        var(--wzg-user-bg),
        radial-gradient(ellipse at 50% 8%, rgba(255,255,255,.065), transparent 42%),
        radial-gradient(ellipse at 12% 88%, rgba(255,255,255,.025), transparent 36%),
        linear-gradient(145deg, #101014, #08080b 72%) !important;
      background-size: cover !important;
      background-position: center center !important;
      background-repeat: no-repeat !important;
      background-attachment: fixed !important;
    }

    .wzg-ready #app::before {
      content: '';
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      opacity: .32;
      background:
        linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px);
      background-size: 54px 54px;
      mask-image: radial-gradient(circle at center, black, transparent 78%);
    }

    .wzg-ready .stage {
      min-height: 100vh !important;
      width: 100% !important;
      height: 100vh !important;
      position: relative !important;
      inset: 0 !important;
      top: 0 !important;
      right: auto !important;
      bottom: auto !important;
      left: 0 !important;
      margin: 0 !important;
      padding: 14px !important;
      display: grid !important;
      grid-template-columns: 100% !important;
      grid-template-rows: minmax(0,1fr) !important;
      justify-content: center !important;
      justify-items: center !important;
      align-content: center !important;
      align-items: center !important;
      gap: 12px !important;
      transform: none !important;
      transform-origin: center top !important;
    }

    /* Top bar */
    .wzg-ready header {
      display: none !important;
      min-height: 58px !important;
      margin: 0 !important;
      padding: 8px 10px 8px 16px !important;
      align-items: center !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 14px !important;
      background: rgba(20,20,22,.66) !important;
      box-shadow: 0 12px 36px rgba(0,0,0,.24) !important;
      backdrop-filter: blur(12px) saturate(55%) !important;
    }

    .wzg-ready .header-logo img {
      width: auto !important;
      max-height: 34px !important;
      filter: grayscale(1) brightness(1.28) contrast(.86) !important;
      opacity: .9;
    }

    .wzg-ready .header-buttons { display: flex !important; gap: 6px !important; }

    .wzg-ready .header-btn,
    .wzg-ready .h-btn,
    .wzg-ready button {
      font-family: inherit !important;
      text-shadow: none !important;
    }

    .wzg-ready .header-btn {
      min-height: 36px !important;
      padding: 0 14px !important;
      border: 1px solid transparent !important;
      border-radius: 9px !important;
      background: transparent !important;
      color: var(--wzg-dim) !important;
      box-shadow: none !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      letter-spacing: .035em !important;
      transition: .16s ease !important;
    }

    .wzg-ready .header-btn:hover {
      color: var(--wzg-text) !important;
      background: var(--wzg-soft) !important;
      border-color: var(--wzg-line) !important;
      transform: none !important;
    }

    .wzg-ready .exit-btn:hover { color: var(--wzg-bad) !important; }

    /* Main grid */
    .wzg-ready .shell {
      width: 100% !important;
      max-width: 1480px !important;
      height: calc(100vh - 28px) !important;
      min-height: 0 !important;
      margin: 0 auto !important;
      justify-self: center !important;
      align-self: center !important;
      padding: 10px !important;
      display: grid !important;
      grid-template-columns: 250px minmax(0, 1fr) 280px !important;
      justify-content: center !important;
      align-items: stretch !important;
      gap: 0 !important;
      border: 1px solid rgba(255,255,255,.13) !important;
      border-radius: 22px !important;
      background: rgba(19,19,22,.34) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.035), 0 28px 90px rgba(0,0,0,.38) !important;
      backdrop-filter: blur(12px) saturate(48%) !important;
      -webkit-backdrop-filter: blur(12px) saturate(48%) !important;
    }

    .wzg-ready .shell > .panel {
      min-width: 0 !important;
      min-height: 0 !important;
      overflow: hidden !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: rgba(255,255,255,.012) !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
    }

    .wzg-ready .shell > .panel:nth-child(2) {
      border-left: 0 !important;
      border-right: 0 !important;
      background: rgba(255,255,255,.014) !important;
    }

    /* Left panel */
    .wzg-ready .shell > .panel:first-child {
      padding: 14px !important;
      display: flex !important;
      flex-direction: column !important;
      border-radius: 14px 0 0 14px !important;
    }

    .wzg-ready .logo-item {
      min-height: 168px !important;
      padding: 10px 12px !important;
      display: grid !important;
      place-items: center !important;
      border: 0 !important;
      border-bottom: 1px solid var(--wzg-line) !important;
      border-radius: 0 !important;
      background: transparent !important;
    }

    .wzg-ready .logo-item img {
      width: min(218px, 94%) !important;
      max-width: 218px !important;
      filter: saturate(.68) brightness(.98) !important;
    }

    #wzg-sidebar { display: flex; flex: 1; min-height: 0; flex-direction: column; margin-top: 14px; }
    .wzg-kicker { margin: 2px 5px 9px; color: var(--wzg-faint); font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
    .wzg-nav { display: grid; gap: 4px; }
    .wzg-nav-btn {
      width: 100%; min-height: 42px; padding: 0 12px; display: flex; align-items: center; gap: 11px;
      border: 1px solid transparent; border-radius: 10px; background: transparent; color: var(--wzg-dim);
      font-size: 12px; font-weight: 650; text-align: left; cursor: pointer; transition: .15s ease;
    }
    .wzg-nav-btn svg, .wzg-tool svg, .wzg-search svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .wzg-nav-btn:hover { color: var(--wzg-text); background: var(--wzg-soft); border-color: var(--wzg-line); transform: translateX(2px); }
    .wzg-nav-btn.is-danger:hover { color: var(--wzg-bad); }
    .wzg-nav-spacer { flex: 1; min-height: 18px; }
    .wzg-tools { padding-top: 12px; border-top: 1px solid var(--wzg-line); display: grid; gap: 6px; }
    .wzg-tool { min-height: 38px; padding: 0 11px; display: flex; align-items: center; justify-content: space-between; gap: 10px; border: 1px solid var(--wzg-line); border-radius: 10px; color: var(--wzg-dim); background: var(--wzg-soft); font-size: 11px; font-weight: 650; cursor: pointer; }
    .wzg-tool > span { display: flex; align-items: center; gap: 9px; }
    .wzg-tool[aria-pressed="true"] { color: var(--wzg-text); border-color: var(--wzg-line-strong); }

    .wzg-ready #manualInfoBox {
      display: none !important;
      margin-top: 12px !important;
      padding: 14px !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 12px !important;
      background: rgba(0,0,0,.15) !important;
      color: var(--wzg-dim) !important;
      font-size: 11px !important;
      line-height: 1.55 !important;
      overflow: auto !important;
    }
    .wzg-ready.wzg-guide #manualInfoBox { display: block !important; flex: 1; min-height: 0; }
    .wzg-ready.wzg-guide #wzg-sidebar { flex: 0 0 auto; }
    .wzg-ready #manualInfoBox h2, .wzg-ready #manualInfoBox h3 { color: var(--wzg-text) !important; text-shadow: none !important; }

    /* Center */
    .wzg-ready .shell > .panel:nth-child(2),
    .wzg-ready #homeMain,
    .wzg-ready #centerPanel { min-height: 0 !important; height: 100% !important; }

    .wzg-ready #centerPanel {
      padding: 18px !important;
      display: grid !important;
      grid-template-rows: auto minmax(0,1fr) !important;
      gap: 16px !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    .wzg-ready .center-top { margin: 0 !important; display: grid !important; gap: 13px !important; }
    .wzg-ready .home-center-skins {
      min-height: 148px !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 14px !important;
      overflow: hidden !important;
      background:
        radial-gradient(ellipse at center, rgba(255,255,255,.055), transparent 52%),
        linear-gradient(145deg, rgba(255,255,255,.032), rgba(0,0,0,.15)) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.025) !important;
    }
    .wzg-ready .skins-bg { display: none !important; }
    .wzg-ready #skin-prev-canvas { filter: drop-shadow(0 12px 18px rgba(0,0,0,.38)) !important; }
    .wzg-ready .home-skins-btn { width: 38px !important; height: 38px !important; border: 1px solid var(--wzg-line) !important; border-radius: 10px !important; background: rgba(18,18,20,.78) !important; color: var(--wzg-text) !important; box-shadow: none !important; }
    .wzg-ready .home-skins-btn:hover { background: rgba(255,255,255,.12) !important; transform: none !important; }
    .wzg-ready .home-skins-btn svg,
    .wzg-ready .home-skins-btn svg * { stroke: #b7b7bc !important; fill: none !important; }

    .wzg-ready .center-controls {
      width: 100% !important;
      margin: 0 !important;
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 9px !important;
    }
    .wzg-ready .play-game-btn {
      min-width: 210px !important; min-height: 48px !important; padding: 0 28px !important;
      border: 1px solid rgba(255,255,255,.18) !important; border-radius: 12px !important;
      background: rgba(255,255,255,.085) !important; color: var(--wzg-text) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.055), 0 12px 28px rgba(0,0,0,.24) !important; text-shadow: none !important;
      backdrop-filter: blur(12px) !important;
      font-size: 16px !important; font-weight: 800 !important; letter-spacing: .035em !important; transition: .16s ease !important;
    }
    .wzg-ready .play-game-btn:hover { transform: translateY(-1px) !important; filter: brightness(1.04) !important; box-shadow: 0 16px 34px rgba(0,0,0,.42) !important; }
    .wzg-ready .home-center-buttons { display: none !important; }
    .wzg-ready .play-game-btn { order: 2 !important; }
    .wzg-ready .full-screen-btn { order: 1 !important; }
    .wzg-ready .replay-btn { order: 3 !important; }
    .wzg-ready .h-btn {
      width: auto !important;
      min-width: 108px !important;
      height: 43px !important;
      min-height: 43px !important;
      padding: 0 13px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 7px !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 11px !important;
      background: var(--wzg-soft) !important;
      color: var(--wzg-dim) !important;
      box-shadow: none !important;
      font-size: 9px !important;
      font-weight: 750 !important;
      letter-spacing: .045em !important;
    }
    .wzg-ready .h-btn:hover { color: var(--wzg-text) !important; background: var(--wzg-soft-hover) !important; transform: none !important; }
    .wzg-ready .h-btn img { filter: grayscale(1) brightness(1.8) !important; opacity: .72; }
    .wzg-ready .h-btn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

    .wzg-ready .center-bottom { min-height: 0 !important; margin: 0 !important; padding: 13px !important; border: 1px solid var(--wzg-line) !important; border-radius: 13px !important; background: rgba(0,0,0,.12) !important; display: flex !important; flex-direction: column !important; }
    .wzg-ready .home-center-server-map { margin-bottom: 11px !important; padding: 3px !important; display: grid !important; grid-template-columns: repeat(3,1fr) !important; gap: 3px !important; border: 1px solid var(--wzg-line) !important; border-radius: 10px !important; background: rgba(0,0,0,.18) !important; }
    .wzg-ready .server-map { margin: 0 !important; min-height: 31px !important; display: grid !important; place-items: center !important; border: 0 !important; border-radius: 7px !important; background: transparent !important; color: var(--wzg-faint) !important; font-size: 10px !important; font-weight: 700 !important; box-shadow: none !important; cursor: pointer !important; }
    .wzg-ready .server-map:hover, .wzg-ready .server-map.active { color: var(--wzg-text) !important; background: rgba(255,255,255,.085) !important; }
    .wzg-ready .server-map[data-a="na"], .wzg-ready .server-map.na { display: none !important; }
    .wzg-ready .home-center-server-list { min-height: 0 !important; overflow-y: auto !important; }
    .wzg-ready .server-item { min-height: 46px !important; margin: 0 0 6px !important; padding: 7px 10px !important; border: 1px solid transparent !important; border-radius: 9px !important; background: rgba(255,255,255,.035) !important; box-shadow: none !important; transition: .15s ease !important; }
    .wzg-ready .server-item:hover { border-color: var(--wzg-line) !important; background: rgba(255,255,255,.065) !important; transform: translateX(2px); }
    .wzg-ready .server-name, .wzg-ready .server-city { color: var(--wzg-text) !important; font-size: 11px !important; font-weight: 700 !important; }
    .wzg-ready .server-info { color: var(--wzg-dim) !important; }
    .wzg-ready .server-online { color: var(--wzg-dim) !important; font-size: 9px !important; }
    .wzg-ready .server-range { height: 3px !important; border-radius: 10px !important; filter: grayscale(1) brightness(1.65) !important; }

    .wzg-ready .server-info {
      min-width: 164px !important;
      display: grid !important;
      gap: 6px !important;
    }
    .wzg-ready .server-online {
      width: 100% !important;
      display: flex !important;
      align-items: baseline !important;
      justify-content: flex-end !important;
      gap: 7px !important;
      font-family: Arial, sans-serif !important;
      text-shadow: none !important;
    }
    .wzg-ready .server-player {
      color: var(--wzg-faint) !important;
      font-size: 8px !important;
      font-weight: 700 !important;
      letter-spacing: .10em !important;
    }
    .wzg-ready .server-count {
      color: var(--wzg-text) !important;
      font-size: 13px !important;
      font-weight: 750 !important;
      letter-spacing: 0 !important;
      text-shadow: none !important;
    }
    .wzg-ready .server-range {
      width: 100% !important;
      height: 4px !important;
      overflow: hidden !important;
      border: 0 !important;
      border-radius: 99px !important;
      background: rgba(255,255,255,.065) !important;
      filter: none !important;
    }
    .wzg-ready .server-range-fill {
      height: 100% !important;
      display: block !important;
      border: 0 !important;
      border-radius: inherit !important;
      background: linear-gradient(90deg, rgba(255,255,255,.38), rgba(255,255,255,.82)) !important;
      box-shadow: none !important;
    }
    .wzg-ready .server-img {
      width: 25px !important;
      height: 17px !important;
      flex: 0 0 25px !important;
      overflow: hidden !important;
      border: 0 !important;
      border-radius: 4px !important;
      background: transparent !important;
      box-shadow: none !important;
    }
    .wzg-ready .server-img img {
      width: 100% !important;
      height: 100% !important;
      display: block !important;
      object-fit: cover !important;
      transform: scale(1.13) !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      filter: saturate(.82) brightness(.94) !important;
    }

    /* Loading screens */
    .wzg-ready .wzil {
      font-family: Arial, sans-serif !important;
      color: var(--wzg-text) !important;
      background: rgba(7,7,9,.52) !important;
      backdrop-filter: blur(12px) saturate(48%) !important;
      -webkit-backdrop-filter: blur(12px) saturate(48%) !important;
    }
    .wzg-ready .wzil-wrap {
      padding: 18px !important;
      background: transparent !important;
    }
    .wzg-ready .wzil-card {
      width: min(440px, calc(100vw - 36px)) !important;
      padding: 28px 30px 24px !important;
      position: relative !important;
      display: grid !important;
      grid-template-columns: minmax(0,1fr) !important;
      grid-template-rows: auto auto auto auto !important;
      justify-items: center !important;
      align-items: center !important;
      gap: 11px !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      border: 1px solid rgba(255,255,255,.14) !important;
      border-radius: 18px !important;
      background: rgba(23,23,26,.50) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.045), 0 26px 80px rgba(0,0,0,.48) !important;
      backdrop-filter: blur(12px) saturate(50%) !important;
      -webkit-backdrop-filter: blur(12px) saturate(50%) !important;
    }
    .wzg-ready .wzil-logo {
      width: min(310px, 86%) !important;
      max-height: 190px !important;
      margin: 0 auto 2px !important;
      display: block !important;
      filter: saturate(.82) brightness(.96) drop-shadow(0 12px 26px rgba(0,0,0,.28)) !important;
    }
    .wzg-ready .wzil-art {
      width: 70px !important;
      height: 70px !important;
      margin: 2px auto 8px !important;
      padding: 0 !important;
      position: relative !important;
      display: block !important;
      gap: 0 !important;
      place-self: center !important;
      overflow: visible !important;
      box-sizing: border-box !important;
    }
    .wzg-ready .wzil-svg {
      position: absolute !important;
      inset: 0 !important;
      width: 70px !important;
      height: 70px !important;
      margin: 0 !important;
      display: block !important;
    }
    .wzg-ready .wzil-track { fill: none !important; stroke: rgba(255,255,255,.085) !important; stroke-width: 8 !important; }
    .wzg-ready .wzil-worm { fill: none !important; stroke: rgba(242,242,243,.84) !important; stroke-width: 8 !important; stroke-linecap: round !important; filter: none !important; }
    .wzg-ready .wzil-pct {
      position: absolute !important;
      inset: 0 !important;
      width: 70px !important;
      height: 70px !important;
      display: grid !important;
      place-items: center !important;
      margin: 0 !important;
      padding: 0 !important;
      color: var(--wzg-text) !important;
      font-size: 12px !important;
      font-weight: 750 !important;
      text-shadow: none !important;
    }
    .wzg-ready .wzil-bar {
      width: 100% !important;
      height: 5px !important;
      margin: 0 !important;
      overflow: hidden !important;
      border: 0 !important;
      border-radius: 99px !important;
      background: rgba(255,255,255,.075) !important;
      box-shadow: none !important;
    }
    .wzg-ready .wzil-fill {
      height: 100% !important;
      border-radius: inherit !important;
      background: linear-gradient(90deg, rgba(255,255,255,.34), rgba(255,255,255,.88)) !important;
      box-shadow: none !important;
    }
    .wzg-ready .wzil-tip {
      margin: 0 !important;
      color: var(--wzg-dim) !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      letter-spacing: .015em !important;
      text-align: center !important;
      text-shadow: none !important;
      width: 100% !important;
    }

    /* Profile and membership */
    .wzg-ready .shell > .panel:last-child {
      padding: 16px !important;
      display: flex !important;
      flex-direction: row !important;
      align-items: flex-start !important;
      justify-content: flex-start !important;
      overflow-y: auto !important;
      border-radius: 0 14px 14px 0 !important;
    }
    .wzg-ready .player-card {
      width: 100% !important;
      max-width: 270px !important;
      margin: 0 !important;
      padding: 10px !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 14px !important;
      background: rgba(255,255,255,.025) !important;
      box-shadow: none !important;
      overflow: hidden !important;
    }
    .wzg-ready .pi-top { padding: 9px 10px 12px !important; border-bottom: 1px solid var(--wzg-line) !important; background: transparent !important; }
    .wzg-ready .avatar { display: none !important; }
    .wzg-ready .pi-name { width: 100% !important; display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 8px !important; }
    .wzg-ready #p-name { margin: 0 !important; color: var(--wzg-text) !important; font-size: 12px !important; font-weight: 750 !important; text-shadow: none !important; }
    .wzg-ready .badge { padding: 3px 8px !important; border: 1px solid var(--wzg-line-strong) !important; border-radius: 99px !important; background: rgba(255,255,255,.11) !important; color: var(--wzg-text) !important; box-shadow: none !important; font-size: 8px !important; }
    .wzg-ready .pi-rows { display: grid !important; grid-template-columns: repeat(2,minmax(0,1fr)) !important; padding: 8px 2px 2px !important; gap: 0 !important; }
    .wzg-ready .pi-row { min-width: 0 !important; min-height: 46px !important; padding: 8px !important; display: flex !important; flex-direction: column !important; align-items: flex-start !important; justify-content: center !important; gap: 3px !important; border: 0 !important; border-bottom: 1px solid var(--wzg-line) !important; border-radius: 0 !important; background: transparent !important; }
    .wzg-ready .pi-row.wzg-stat-left { border-right: 1px solid var(--wzg-line) !important; }
    .wzg-ready .pi-row.wzg-stat-last { border-bottom: 0 !important; }
    .wzg-ready .pi-row.wzg-hide { display: none !important; }
    .wzg-ready .pi-row .label { color: var(--wzg-faint) !important; font-size: 8px !important; font-weight: 700 !important; letter-spacing: .08em !important; text-transform: uppercase !important; }
    .wzg-ready .pi-row .value { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--wzg-text) !important; font-size: 11px !important; font-weight: 700 !important; text-shadow: none !important; }
    .wzg-ready #nameTokenCount.change-token-no {
      min-width: 26px !important;
      height: 24px !important;
      padding: 0 8px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      border: 1px solid rgba(255,255,255,.14) !important;
      border-radius: 8px !important;
      background: rgba(255,255,255,.065) !important;
      color: var(--wzg-text) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.045) !important;
      backdrop-filter: blur(12px) !important;
      text-shadow: none !important;
      font-size: 10px !important;
      font-weight: 750 !important;
    }
    .wzg-ready .vip-only { grid-column: auto; }
    .wzg-ready .vip-card { margin: 0 0 7px !important; padding: 11px !important; border: 1px solid var(--wzg-line) !important; border-radius: 11px !important; background: rgba(255,255,255,.028) !important; box-shadow: none !important; }
    .wzg-ready .vip-card h2, .wzg-ready .vip-card h3 { margin: 0 0 4px !important; color: var(--wzg-text) !important; font-size: 11px !important; letter-spacing: .04em !important; text-shadow: none !important; }
    .wzg-ready .vip-card p { color: var(--wzg-faint) !important; font-size: 8px !important; }
    .wzg-ready .vip-card button { min-height: 34px !important; border: 1px solid var(--wzg-line-strong) !important; border-radius: 9px !important; background: var(--wzg-soft) !important; color: var(--wzg-text) !important; box-shadow: none !important; font-size: 9px !important; font-weight: 750 !important; }
    .wzg-ready .vip-card button:hover { background: var(--wzg-soft-hover) !important; transform: none !important; }

    /* Footer */
    .wzg-ready footer, .wzg-ready .site-footer { min-height: 34px !important; margin: 0 !important; padding: 4px 8px !important; color: var(--wzg-faint) !important; opacity: .75; }
    .wzg-ready footer a, .wzg-ready .site-footer a { color: var(--wzg-dim) !important; }

    .wzg-ready footer,
    .wzg-ready .site-footer { display: none !important; }
    .wzg-ready .shell > .panel:last-child { display: flex !important; }
    .wzg-ready .shell > .panel:last-child > .player-card { display: block !important; }
    .wzg-ready .shell > .panel:last-child > #aboutCard,
    .wzg-ready .shell > .panel:last-child > .about-card { display: none !important; }

    /* Game guide modal */
    #wzg-guide-modal {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      display: none;
      place-items: center;
      padding: 22px;
      background: rgba(5,5,6,.72);
      backdrop-filter: blur(12px);
    }
    #wzg-guide-modal.is-open { display: grid; }
    #wzg-guide-dialog {
      width: min(760px, 96vw);
      max-height: min(780px, 92vh);
      overflow: hidden;
      border: 1px solid var(--wzg-line-strong);
      border-radius: 18px;
      background: rgba(20,20,23,.90);
      box-shadow: var(--wzg-shadow);
      backdrop-filter: blur(12px) saturate(52%);
    }
    .wzg-guide-head { min-height: 66px; padding: 12px 14px 12px 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--wzg-line); background: rgba(255,255,255,.018); }
    .wzg-guide-head strong { display: block; color: var(--wzg-text); font-size: 15px; }
    .wzg-guide-head span { display: block; margin-top: 3px; color: var(--wzg-faint); font-size: 10px; }
    #wzg-guide-close { width: 36px; height: 36px; border: 1px solid var(--wzg-line); border-radius: 10px; background: var(--wzg-soft); color: var(--wzg-text); font-size: 18px; cursor: pointer; }
    #wzg-guide-content { max-height: calc(92vh - 66px); padding: 22px; overflow-y: auto; color: var(--wzg-dim); font-size: 12px; line-height: 1.65; }
    #wzg-guide-content h2 { margin: 0 0 10px; color: var(--wzg-text); font-size: 19px; line-height: 1.25; letter-spacing: -.01em; }
    #wzg-guide-content h3 { margin: 24px 0 8px; color: var(--wzg-text); font-size: 14px; }
    #wzg-guide-content h4 { margin: 20px 0 7px; color: var(--wzg-text); font-size: 13px; }
    #wzg-guide-content p { margin: 0 0 11px; }
    #wzg-guide-content ul { margin: 8px 0 14px; padding-left: 20px; }
    #wzg-guide-content li { margin: 5px 0; }
    #wzg-guide-content .pro-tip-box,
    #wzg-guide-content .final-call { margin: 16px 0; padding: 13px; border: 1px solid var(--wzg-line); border-radius: 11px; background: rgba(255,255,255,.035); color: var(--wzg-text); }


    /* Background picker */
    #wzg-bg-modal {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      display: none;
      place-items: center;
      padding: 22px;
      background: rgba(5,5,6,.72);
      backdrop-filter: blur(12px);
    }
    #wzg-bg-modal.is-open { display: grid; }
    #wzg-bg-dialog {
      width: min(760px, 96vw);
      max-height: 92vh;
      overflow: auto;
      border: 1px solid var(--wzg-line-strong);
      border-radius: 18px;
      background: rgba(20,20,23,.90);
      box-shadow: var(--wzg-shadow);
      backdrop-filter: blur(12px) saturate(52%);
    }
    .wzg-bg-head { min-height: 64px; padding: 12px 14px 12px 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--wzg-line); }
    .wzg-bg-head strong { display: block; font-size: 15px; color: var(--wzg-text); }
    .wzg-bg-head span { display: block; margin-top: 3px; font-size: 10px; color: var(--wzg-faint); }
    #wzg-bg-close { width: 36px; height: 36px; border: 1px solid var(--wzg-line); border-radius: 10px; background: var(--wzg-soft); color: var(--wzg-text); font-size: 18px; cursor: pointer; }
    .wzg-bg-body { padding: 14px; }
    .wzg-bg-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 9px; }
    .wzg-bg-preset { position: relative; min-height: 150px; overflow: hidden; border: 1px solid var(--wzg-line); border-radius: 13px; background-position: center; background-size: cover; cursor: pointer; transition: .16s ease; }
    .wzg-bg-preset::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 34%, rgba(0,0,0,.74)); }
    .wzg-bg-preset span { position: absolute; z-index: 1; left: 12px; bottom: 10px; color: #fff; font-size: 11px; font-weight: 700; }
    .wzg-bg-preset:hover { transform: translateY(-1px); border-color: rgba(255,255,255,.28); }
    .wzg-bg-preset.is-active { box-shadow: inset 0 0 0 2px rgba(255,255,255,.72); }
    .wzg-bg-custom { margin-top: 12px; padding-top: 12px; display: grid; grid-template-columns: minmax(0,1fr) auto auto; gap: 7px; border-top: 1px solid var(--wzg-line); }
    #wzg-bg-url { min-height: 39px; padding: 0 12px; border: 1px solid var(--wzg-line); border-radius: 10px; outline: none; background: rgba(0,0,0,.20); color: var(--wzg-text); font: 500 11px Arial,sans-serif; }
    #wzg-bg-url:focus { border-color: var(--wzg-line-strong); }
    .wzg-bg-action { min-height: 39px; padding: 0 13px; border: 1px solid var(--wzg-line); border-radius: 10px; background: var(--wzg-soft); color: var(--wzg-text); font: 700 10px Arial,sans-serif; cursor: pointer; }
    .wzg-bg-action:hover { background: var(--wzg-soft-hover); }

    /* Membership modal */
    #wzg-vip-modal {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      display: none;
      place-items: center;
      padding: 22px;
      background: rgba(5,5,6,.72);
      backdrop-filter: blur(12px);
    }
    #wzg-vip-modal.is-open { display: grid; }
    #wzg-vip-dialog {
      width: min(920px, 96vw);
      max-height: min(760px, 92vh);
      overflow: auto;
      border: 1px solid var(--wzg-line-strong);
      border-radius: 18px;
      background: rgba(20,20,23,.92);
      box-shadow: var(--wzg-shadow);
      backdrop-filter: blur(12px) saturate(50%);
    }
    .wzg-vip-head {
      position: sticky;
      top: 0;
      z-index: 3;
      min-height: 64px;
      padding: 12px 14px 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--wzg-line);
      background: rgba(22,22,25,.88);
      backdrop-filter: blur(12px);
    }
    .wzg-vip-title strong { display: block; color: var(--wzg-text); font-size: 15px; }
    .wzg-vip-title span { display: block; margin-top: 3px; color: var(--wzg-faint); font-size: 10px; }
    #wzg-vip-close { width: 36px; height: 36px; border: 1px solid var(--wzg-line); border-radius: 10px; background: var(--wzg-soft); color: var(--wzg-text); font-size: 18px; cursor: pointer; }
    #wzg-vip-body { padding: 16px; }
    #wzg-vip-body .vip-card { display: block !important; margin: 0 !important; padding: 0 !important; border: 0 !important; background: transparent !important; box-shadow: none !important; }
    #wzg-vip-body .vip-content-container { display: grid !important; grid-template-columns: repeat(3,minmax(0,1fr)) !important; gap: 10px !important; }
    #wzg-vip-body .vip-section {
      min-width: 0;
      min-height: 270px;
      padding: 18px !important;
      display: grid !important;
      grid-template-rows: auto auto minmax(72px,1fr) auto 42px !important;
      align-items: start !important;
      gap: 7px !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 14px !important;
      background: rgba(255,255,255,.03) !important;
      box-shadow: none !important;
    }
    #wzg-vip-body .vip-section.name-card-n { display: none !important; }
    #wzg-vip-body .vip-section h2,
    #wzg-vip-body .vip-section h3 { margin: 0 !important; color: var(--wzg-text) !important; font-size: 14px !important; text-shadow: none !important; }
    #wzg-vip-body .vip-section p { margin: 0 !important; color: var(--wzg-dim) !important; font-size: 10px !important; line-height: 1.45 !important; }
    #wzg-vip-body .vip-features { align-self: start !important; color: var(--wzg-dim) !important; font: 600 10px/1.55 Arial,sans-serif !important; text-shadow: none !important; }
    #wzg-vip-body .vip-features span { color: inherit !important; text-shadow: none !important; }
    #wzg-vip-body .price-box { grid-row: 4 !important; align-self: end !important; min-height: 30px !important; display: flex !important; align-items: center !important; justify-content: center !important; gap: 8px !important; color: var(--wzg-dim) !important; font-family: Arial,sans-serif !important; text-shadow: none !important; }
    #wzg-vip-body .price-box .duration { color: var(--wzg-dim) !important; font-size: 9px !important; font-weight: 700 !important; }
    #wzg-vip-body .price-box .amount { color: var(--wzg-text) !important; font-size: 14px !important; font-weight: 750 !important; text-shadow: none !important; }
    #wzg-vip-body .vip-section > button,
    #wzg-vip-body .vip-actions { grid-row: 5 !important; align-self: stretch !important; width: 100% !important; margin: 0 !important; }
    #wzg-vip-body .vip-actions { display: flex !important; }
    #wzg-vip-body .vip-section button { width: 100% !important; min-height: 42px !important; margin: 0 !important; border: 1px solid var(--wzg-line-strong) !important; border-radius: 10px !important; background: rgba(255,255,255,.08) !important; color: var(--wzg-text) !important; box-shadow: none !important; }
    #wzg-vip-body .vip-section button:hover { background: rgba(255,255,255,.14) !important; transform: none !important; }

    /* Settings workspace */
    .wzg-ready .settings-wrap {
      position: fixed !important;
      inset: 0 !important;
      z-index: 2147482500 !important;
      padding: 24px !important;
      place-items: center !important;
      color: var(--wzg-text) !important;
      font-family: Arial, sans-serif !important;
    }
    .wzg-ready .settings-wrap.active { display: grid !important; }
    .wzg-ready .settings-overlay {
      position: absolute !important;
      inset: 0 !important;
      background: rgba(5,5,7,.68) !important;
      backdrop-filter: blur(12px) saturate(55%) !important;
      -webkit-backdrop-filter: blur(12px) saturate(55%) !important;
    }
    .wzg-ready .settings-modal {
      position: relative !important;
      inset: auto !important;
      top: auto !important;
      right: auto !important;
      bottom: auto !important;
      left: auto !important;
      transform: none !important;
      z-index: 1 !important;
      width: min(1180px, 96vw) !important;
      height: min(790px, 92vh) !important;
      min-width: 0 !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      display: grid !important;
      grid-template-columns: 220px minmax(0,1fr) !important;
      grid-template-rows: 82px minmax(0,1fr) !important;
      overflow: hidden !important;
      border: 1px solid rgba(255,255,255,.14) !important;
      border-radius: 20px !important;
      background:
        radial-gradient(circle at 84% -12%, rgba(255,255,255,.07), transparent 34%),
        rgba(17,17,20,.78) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.04), 0 34px 100px rgba(0,0,0,.62) !important;
      backdrop-filter: blur(12px) saturate(50%) !important;
      -webkit-backdrop-filter: blur(12px) saturate(50%) !important;
    }
    .wzg-ready .settings-head {
      grid-column: 1 / -1 !important;
      min-height: 82px !important;
      padding: 14px 18px !important;
      display: grid !important;
      grid-template-columns: 44px minmax(0,1fr) auto !important;
      align-items: center !important;
      gap: 13px !important;
      border: 0 !important;
      border-bottom: 1px solid var(--wzg-line) !important;
      background: rgba(255,255,255,.018) !important;
    }
    .wzg-ready .settings-head h3 {
      min-width: 0 !important;
      margin: 0 !important;
      display: grid !important;
      gap: 3px !important;
      color: var(--wzg-text) !important;
      font-size: 18px !important;
      font-weight: 750 !important;
      line-height: 1.1 !important;
      letter-spacing: -.02em !important;
      text-shadow: none !important;
    }
    .wzg-ready .settings-head h3::after {
      content: 'Personalize your experience without leaving the game';
      color: var(--wzg-faint) !important;
      font-size: 10px !important;
      font-weight: 500 !important;
      letter-spacing: .01em !important;
    }
    .wzg-ready #settings-close {
      width: 42px !important;
      height: 42px !important;
      padding: 0 !important;
      display: grid !important;
      place-items: center !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 11px !important;
      background: var(--wzg-soft) !important;
      color: var(--wzg-dim) !important;
      box-shadow: none !important;
      cursor: pointer !important;
      transition: .15s ease !important;
    }
    .wzg-ready #settings-close:hover { color: var(--wzg-text) !important; background: var(--wzg-soft-hover) !important; }
    .wzg-ready #settings-close svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .wzg-ready .settings-head .vip-pill {
      min-width: 46px !important;
      min-height: 27px !important;
      padding: 0 10px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 99px !important;
      background: rgba(255,255,255,.055) !important;
      color: var(--wzg-dim) !important;
      font-size: 9px !important;
      font-weight: 750 !important;
      letter-spacing: .08em !important;
      text-shadow: none !important;
    }
    .wzg-ready #settings-tabs {
      min-width: 0 !important;
      min-height: 0 !important;
      padding: 16px 12px !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      justify-content: flex-start !important;
      gap: 5px !important;
      overflow: auto !important;
      border: 0 !important;
      border-right: 1px solid var(--wzg-line) !important;
      background: rgba(0,0,0,.13) !important;
    }
    .wzg-ready #settings-tabs::before {
      content: 'SETTINGS';
      margin: 1px 10px 8px !important;
      color: var(--wzg-faint) !important;
      font-size: 9px !important;
      font-weight: 750 !important;
      letter-spacing: .15em !important;
    }
    .wzg-ready #settings-tabs .tab {
      width: 100% !important;
      min-width: 0 !important;
      min-height: 46px !important;
      margin: 0 !important;
      padding: 0 12px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      gap: 11px !important;
      border: 1px solid transparent !important;
      border-radius: 11px !important;
      background: transparent !important;
      color: var(--wzg-dim) !important;
      box-shadow: none !important;
      font-size: 11px !important;
      font-weight: 650 !important;
      letter-spacing: .005em !important;
      text-align: left !important;
      text-shadow: none !important;
      cursor: pointer !important;
      transition: .15s ease !important;
    }
    .wzg-ready #settings-tabs .tab svg { width: 17px; height: 17px; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
    .wzg-ready #settings-tabs .tab > * { pointer-events: none; }
    .wzg-ready #settings-tabs .tab::after { content: '›'; margin-left: auto; color: transparent; font-size: 16px; transition: .15s ease; }
    .wzg-ready #settings-tabs .tab:hover { color: var(--wzg-text) !important; background: rgba(255,255,255,.035) !important; }
    .wzg-ready #settings-tabs .tab.active {
      border-color: var(--wzg-line) !important;
      background: rgba(255,255,255,.075) !important;
      color: var(--wzg-text) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.035) !important;
    }
    .wzg-ready #settings-tabs .tab.active::after { color: var(--wzg-faint); }
    .wzg-ready .settings-body {
      min-width: 0 !important;
      min-height: 0 !important;
      height: auto !important;
      padding: 20px !important;
      overflow: auto !important;
      overflow-x: hidden !important;
      background: transparent !important;
    }
    .wzg-ready .settings-body .sectionS { display: none !important; margin: 0 !important; padding: 0 !important; }
    .wzg-ready .settings-body .sectionS.active {
      display: grid !important;
      grid-template-columns: repeat(2,minmax(0,1fr)) !important;
      align-content: start !important;
      gap: 10px !important;
    }
    .wzg-ready .wzg-settings-intro {
      grid-column: 1 / -1 !important;
      min-height: 58px !important;
      margin: 0 0 3px !important;
      padding: 0 2px 13px !important;
      display: flex !important;
      align-items: flex-end !important;
      justify-content: space-between !important;
      gap: 18px !important;
      border-bottom: 1px solid var(--wzg-line) !important;
    }
    .wzg-ready .wzg-settings-intro strong { display: block; color: var(--wzg-text); font-size: 16px; font-weight: 720; letter-spacing: -.015em; }
    .wzg-ready .wzg-settings-intro span { display: block; margin-top: 4px; color: var(--wzg-faint); font-size: 10px; line-height: 1.4; }
    .wzg-ready .wzg-settings-intro b { color: var(--wzg-faint); font-size: 9px; font-weight: 700; letter-spacing: .1em; white-space: nowrap; }
    .wzg-ready .settings-body .opt {
      position: relative !important;
      min-width: 0 !important;
      min-height: 105px !important;
      margin: 0 !important;
      padding: 15px !important;
      display: grid !important;
      grid-template-columns: minmax(0,1fr) !important;
      grid-template-rows: auto minmax(38px,auto) !important;
      align-content: space-between !important;
      align-items: center !important;
      gap: 12px !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 13px !important;
      background: rgba(255,255,255,.026) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.018) !important;
      transition: border-color .15s ease, background .15s ease !important;
    }
    .wzg-ready .settings-body .opt:hover { border-color: var(--wzg-line-strong) !important; background: rgba(255,255,255,.038) !important; }
    .wzg-ready #tab-general .opt:first-of-type { grid-column: 1 / -1 !important; }
    .wzg-ready #tab-account .opt { grid-column: 1 / -1 !important; }
    .wzg-ready .settings-body .opL { min-width: 0 !important; margin: 0 !important; padding: 0 !important; }
    .wzg-ready .settings-body .opT { color: var(--wzg-text) !important; font-size: 12px !important; font-weight: 680 !important; line-height: 1.25 !important; text-shadow: none !important; }
    .wzg-ready .settings-body .hint { margin-top: 4px !important; color: var(--wzg-faint) !important; font-size: 9px !important; font-weight: 500 !important; line-height: 1.4 !important; text-shadow: none !important; }
    .wzg-ready .settings-body .opR {
      width: 100% !important;
      min-width: 0 !important;
      min-height: 38px !important;
      margin: 0 !important;
      padding: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-end !important;
      gap: 8px !important;
      color: var(--wzg-dim) !important;
      text-shadow: none !important;
    }
    .wzg-ready .settings-body .field,
    .wzg-ready .settings-body select,
    .wzg-ready .settings-body input[type="text"],
    .wzg-ready .settings-body input[type="number"] {
      width: 100% !important;
      min-width: 0 !important;
      height: 40px !important;
      min-height: 40px !important;
      margin: 0 !important;
      padding: 0 12px !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 10px !important;
      outline: 0 !important;
      background-color: rgba(0,0,0,.20) !important;
      color: var(--wzg-text) !important;
      box-shadow: none !important;
      font: 600 11px Figtree,Inter,sans-serif !important;
      text-shadow: none !important;
    }
    .wzg-ready .settings-body select { padding-right: 34px !important; color-scheme: dark !important; }
    .wzg-ready .settings-body .field:focus,
    .wzg-ready .settings-body select:focus,
    .wzg-ready .settings-body input:focus { border-color: rgba(255,255,255,.26) !important; }
    .wzg-ready .settings-body .copyBtn,
    .wzg-ready .settings-body .btnGhost {
      min-width: 82px !important;
      height: 40px !important;
      min-height: 40px !important;
      margin: 0 !important;
      padding: 0 13px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 10px !important;
      background: rgba(255,255,255,.07) !important;
      color: var(--wzg-text) !important;
      box-shadow: none !important;
      font: 700 9px Figtree,Inter,sans-serif !important;
      letter-spacing: .04em !important;
      text-shadow: none !important;
      cursor: pointer !important;
    }
    .wzg-ready .settings-body .copyBtn:hover,
    .wzg-ready .settings-body .btnGhost:hover { background: rgba(255,255,255,.115) !important; }
    .wzg-ready .settings-body .fileish { justify-content: flex-start !important; }
    .wzg-ready .settings-body .fileName { min-width: 0; overflow: hidden; color: var(--wzg-faint) !important; font-size: 9px !important; text-overflow: ellipsis; white-space: nowrap; }
    .wzg-ready .settings-body .vip-a {
      position: absolute !important;
      top: 12px !important;
      right: 12px !important;
      min-width: 33px !important;
      min-height: 19px !important;
      padding: 0 7px !important;
      display: grid !important;
      place-items: center !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 99px !important;
      background: rgba(255,255,255,.055) !important;
      color: var(--wzg-faint) !important;
      font-size: 8px !important;
      font-weight: 750 !important;
      text-transform: uppercase !important;
      text-shadow: none !important;
    }
    .wzg-ready .settings-body .switch {
      position: relative !important;
      width: 38px !important;
      height: 22px !important;
      padding: 2px !important;
      display: block !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 99px !important;
      background: rgba(255,255,255,.08) !important;
      box-shadow: none !important;
      cursor: pointer !important;
    }
    .wzg-ready .settings-body .switch input { position: absolute !important; width: 1px !important; height: 1px !important; opacity: 0 !important; }
    .wzg-ready .settings-body .switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: #77777c; transition: .16s ease; }
    .wzg-ready .settings-body .switch:has(input:checked) { background: rgba(255,255,255,.86) !important; }
    .wzg-ready .settings-body .switch:has(input:checked)::after { transform: translateX(16px); background: #17171a; }
    .wzg-ready .settings-body input[type="color"] {
      width: 100% !important;
      height: 40px !important;
      min-height: 40px !important;
      padding: 4px !important;
      overflow: hidden !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 10px !important;
      background: rgba(0,0,0,.20) !important;
      cursor: pointer !important;
    }
    .wzg-ready .settings-body input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
    .wzg-ready .settings-body input[type="color"]::-webkit-color-swatch { border: 0; border-radius: 7px; }
    .wzg-ready .settings-body .sliderWrap { gap: 12px !important; }
    .wzg-ready .settings-body input[type="range"] {
      width: 100% !important;
      height: 4px !important;
      border: 0 !important;
      border-radius: 99px !important;
      outline: 0 !important;
      appearance: none !important;
      background: rgba(255,255,255,.12) !important;
      accent-color: #d7d7da !important;
    }
    .wzg-ready .settings-body input[type="range"]::-webkit-slider-thumb { width: 15px; height: 15px; appearance: none; border: 2px solid #19191c; border-radius: 50%; background: #e2e2e4; box-shadow: 0 0 0 1px rgba(255,255,255,.18); cursor: pointer; }
    .wzg-ready .settings-body .val { min-width: 47px !important; height: 30px !important; display: grid !important; place-items: center !important; border: 1px solid var(--wzg-line) !important; border-radius: 8px !important; background: rgba(0,0,0,.18) !important; color: var(--wzg-text) !important; font-size: 9px !important; font-weight: 700 !important; }
    .wzg-ready #tab-shortcuts .opt { min-height: 64px !important; grid-template-rows: 1fr !important; }
    .wzg-ready #tab-shortcuts .keyRow { justify-content: flex-start !important; color: var(--wzg-dim) !important; font-size: 10px !important; font-weight: 600 !important; }
    .wzg-ready #tab-shortcuts kbd,
    .wzg-ready #tab-shortcuts .key {
      min-width: 40px !important;
      min-height: 28px !important;
      padding: 0 9px !important;
      display: inline-grid !important;
      place-items: center !important;
      border: 1px solid var(--wzg-line-strong) !important;
      border-radius: 7px !important;
      background: rgba(255,255,255,.065) !important;
      color: var(--wzg-text) !important;
      box-shadow: inset 0 -2px rgba(0,0,0,.22) !important;
      font: 700 9px Figtree,Inter,sans-serif !important;
    }

    /* Store and ranking modals */
    .wzg-ready .wzs-dim, .wzg-ready .modal-dim { background: rgba(5,5,6,.68) !important; backdrop-filter: blur(10px) !important; }
    .wzg-ready .wzs-modal, .wzg-ready .lb-modal, .wzg-ready .home-auth, .wzg-ready .wz-go-modal, .wzg-ready .wz-err-modal {
      border: 1px solid var(--wzg-line-strong) !important; border-radius: 18px !important;
      background: rgba(20,20,23,.88) !important; box-shadow: var(--wzg-shadow) !important;
      backdrop-filter: blur(12px) saturate(55%) !important; color: var(--wzg-text) !important;
    }

    /* Game result — unified glass card */
    .wzg-ready .wz-go {
      position: fixed !important;
      inset: 0 !important;
      z-index: 2147482600 !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 20px !important;
      font-family: Arial, sans-serif !important;
    }
    .wzg-ready .wz-go-dim {
      position: absolute !important;
      inset: 0 !important;
      background:
        radial-gradient(circle at 50% 34%, rgba(255,255,255,.045), transparent 36%),
        rgba(5,5,7,.66) !important;
      backdrop-filter: blur(12px) saturate(45%) !important;
      -webkit-backdrop-filter: blur(12px) saturate(45%) !important;
    }
    .wzg-ready .wz-go-modal {
      position: relative !important;
      z-index: 1 !important;
      width: min(480px, 94vw) !important;
      max-width: 480px !important;
      min-width: 0 !important;
      max-height: 92vh !important;
      margin: 0 !important;
      padding: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden auto !important;
      border: 1px solid rgba(255,255,255,.14) !important;
      border-radius: 20px !important;
      background:
        radial-gradient(circle at 82% -10%, rgba(255,255,255,.075), transparent 38%),
        rgba(18,18,21,.78) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.04), 0 32px 90px rgba(0,0,0,.62) !important;
      backdrop-filter: blur(12px) saturate(52%) !important;
      -webkit-backdrop-filter: blur(12px) saturate(52%) !important;
      color: var(--wzg-text) !important;
    }
    .wzg-ready .wz-go-head {
      min-height: 70px !important;
      margin: 0 !important;
      padding: 16px 18px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 14px !important;
      border: 0 !important;
      border-bottom: 1px solid var(--wzg-line) !important;
      background: rgba(255,255,255,.018) !important;
    }
    .wzg-ready .wz-go-head h3 {
      margin: 0 !important;
      color: var(--wzg-text) !important;
      font-size: 18px !important;
      font-weight: 760 !important;
      line-height: 1.1 !important;
      letter-spacing: -.025em !important;
      text-transform: none !important;
      text-shadow: none !important;
    }
    .wzg-ready .wz-go-chip {
      min-width: 76px !important;
      min-height: 30px !important;
      padding: 0 11px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 99px !important;
      background: rgba(255,255,255,.065) !important;
      color: var(--wzg-dim) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.025) !important;
      font-size: 9px !important;
      font-weight: 750 !important;
      letter-spacing: .07em !important;
      text-shadow: none !important;
    }
    .wzg-ready .wz-go-body {
      width: 100% !important;
      margin: 0 !important;
      padding: 18px !important;
      display: grid !important;
      gap: 14px !important;
      background: transparent !important;
    }
    .wzg-ready .wz-go-score {
      width: 100% !important;
      margin: 0 !important;
      padding: 17px !important;
      display: grid !important;
      grid-template-columns: minmax(0,1fr) auto !important;
      grid-template-rows: auto auto !important;
      align-items: center !important;
      gap: 5px 18px !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 14px !important;
      background: rgba(255,255,255,.032) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.022) !important;
    }
    .wzg-ready .wz-go-score > .lbl {
      grid-column: 1 !important;
      grid-row: 1 !important;
      margin: 0 !important;
      color: var(--wzg-faint) !important;
      font-size: 9px !important;
      font-weight: 750 !important;
      letter-spacing: .13em !important;
      text-align: left !important;
      text-transform: uppercase !important;
      text-shadow: none !important;
    }
    .wzg-ready .wz-go-score > .val {
      grid-column: 2 !important;
      grid-row: 1 / 3 !important;
      min-width: 112px !important;
      min-height: 66px !important;
      margin: 0 !important;
      padding: 0 15px !important;
      display: grid !important;
      place-items: center !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 11px !important;
      background: rgba(0,0,0,.18) !important;
      color: var(--wzg-text) !important;
      box-shadow: none !important;
      font-size: 34px !important;
      font-weight: 790 !important;
      line-height: 1 !important;
      letter-spacing: -.04em !important;
      text-shadow: none !important;
    }
    .wzg-ready .wz-go-killed-inline {
      grid-column: 1 !important;
      grid-row: 2 !important;
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      display: flex !important;
      align-items: center !important;
      flex-wrap: wrap !important;
      gap: 5px !important;
      color: var(--wzg-dim) !important;
      text-shadow: none !important;
    }
    .wzg-ready .wz-go-killed-inline .k-lbl { color: var(--wzg-faint) !important; font-size: 9px !important; font-weight: 650 !important; text-transform: uppercase !important; letter-spacing: .05em !important; }
    .wzg-ready .wz-go-killed-inline .k-val { max-width: 180px; overflow: hidden; color: var(--wzg-text) !important; font-size: 10px !important; font-weight: 680 !important; text-overflow: ellipsis; white-space: nowrap; }
    .wzg-ready .wz-go-actions {
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      display: grid !important;
      gap: 10px !important;
      background: transparent !important;
    }
    .wzg-ready .pizza-respawn-picker {
      position: relative !important;
      width: 100% !important;
      height: auto !important;
      min-height: 62px !important;
      margin: 0 !important;
      padding: 7px !important;
      display: grid !important;
      grid-template-columns: repeat(4,minmax(0,1fr)) !important;
      gap: 6px !important;
      overflow: visible !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 13px !important;
      background: rgba(0,0,0,.14) !important;
      box-shadow: none !important;
      clip-path: none !important;
      transform: none !important;
    }
    .wzg-ready .pizza-respawn-picker::before { content: 'RESPAWN SLOT'; position: absolute; left: 11px; top: -7px; padding: 0 5px; background: #151518; color: var(--wzg-faint); font-size: 7px; font-weight: 750; letter-spacing: .12em; }
    .wzg-ready .pizza-respawn-picker .pizza-dilim {
      position: static !important;
      width: 100% !important;
      height: 46px !important;
      min-width: 0 !important;
      min-height: 46px !important;
      margin: 0 !important;
      padding: 0 !important;
      display: grid !important;
      place-items: center !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 9px !important;
      background: rgba(255,255,255,.035) !important;
      color: var(--wzg-dim) !important;
      box-shadow: none !important;
      clip-path: none !important;
      transform: none !important;
      text-shadow: none !important;
      cursor: pointer !important;
      transition: .15s ease !important;
    }
    .wzg-ready .pizza-respawn-picker .pizza-dilim span { position: static !important; display: block !important; transform: none !important; color: inherit !important; font-size: 13px !important; font-weight: 720 !important; text-shadow: none !important; }
    .wzg-ready .pizza-respawn-picker .pizza-dilim:hover,
    .wzg-ready .pizza-respawn-picker .pizza-dilim.active,
    .wzg-ready .pizza-respawn-picker .pizza-dilim.selected {
      border-color: rgba(255,255,255,.22) !important;
      background: rgba(255,255,255,.095) !important;
      color: var(--wzg-text) !important;
      filter: none !important;
    }
    .wzg-ready .pizza-respawn-picker .vip-a {
      position: absolute !important;
      top: -8px !important;
      right: 10px !important;
      min-width: 28px !important;
      min-height: 16px !important;
      padding: 0 6px !important;
      display: grid !important;
      place-items: center !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 99px !important;
      background: #18181b !important;
      color: var(--wzg-faint) !important;
      font-size: 7px !important;
      font-weight: 750 !important;
      text-transform: uppercase !important;
      text-shadow: none !important;
    }
    .wzg-ready .wz-go-actions .watch-ad,
    .wzg-ready .wz-go-actions .result-buttons { width: 100% !important; margin: 0 !important; gap: 8px !important; }
    .wzg-ready .wz-go-actions .result-buttons { grid-template-columns: 1fr 1fr !important; }
    .wzg-ready .wz-go-actions .result-buttons:not([style*="display: none"]) { display: grid !important; }
    .wzg-ready .wz-go-btn {
      width: 100% !important;
      min-width: 0 !important;
      min-height: 46px !important;
      margin: 0 !important;
      padding: 0 16px !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 11px !important;
      background: rgba(255,255,255,.06) !important;
      color: var(--wzg-dim) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.025) !important;
      font: 720 10px Figtree,Inter,sans-serif !important;
      letter-spacing: .055em !important;
      text-transform: uppercase !important;
      text-shadow: none !important;
      cursor: pointer !important;
      transition: .15s ease !important;
    }
    .wzg-ready .wz-go-btn.pri {
      border-color: rgba(255,255,255,.16) !important;
      background: rgba(255,255,255,.105) !important;
      color: var(--wzg-text) !important;
    }
    .wzg-ready .wz-go-btn:hover { border-color: rgba(255,255,255,.24) !important; background: rgba(255,255,255,.14) !important; color: var(--wzg-text) !important; transform: translateY(-1px) !important; filter: none !important; }

    /* Result polish: classic respawn wheel and vertical score flow */
    .wzg-ready .wz-go-score {
      grid-template-columns: 1fr !important;
      grid-template-rows: auto auto auto !important;
      gap: 8px !important;
    }
    .wzg-ready .wz-go-score > .lbl {
      grid-column: 1 !important;
      grid-row: 2 !important;
      width: 100% !important;
      margin-top: 4px !important;
      text-align: center !important;
    }
    .wzg-ready .wz-go-killed-inline {
      grid-column: 1 !important;
      grid-row: 1 !important;
      width: 100% !important;
      justify-content: center !important;
      text-align: center !important;
    }
    .wzg-ready .wz-go-score > .val {
      grid-column: 1 !important;
      grid-row: 3 !important;
      width: 100% !important;
      min-height: 64px !important;
      margin-top: 3px !important;
      font-size: 32px !important;
    }
    .wzg-ready .pizza-respawn-picker {
      width: 136px !important;
      height: 136px !important;
      min-height: 136px !important;
      margin: 4px auto 2px !important;
      padding: 0 !important;
      grid-template-columns: 1fr 1fr !important;
      grid-template-rows: 1fr 1fr !important;
      gap: 1px !important;
      overflow: hidden !important;
      border: 1px solid rgba(255,255,255,.16) !important;
      border-radius: 50% !important;
      background: rgba(255,255,255,.10) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.035), 0 14px 35px rgba(0,0,0,.22) !important;
    }
    .wzg-ready .pizza-respawn-picker::before {
      content: '' !important;
      position: absolute !important;
      inset: 50% auto auto 50% !important;
      width: 22px !important;
      height: 22px !important;
      padding: 0 !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 50% !important;
      background: #19191c !important;
      transform: translate(-50%,-50%) !important;
      z-index: 3 !important;
    }
    .wzg-ready .pizza-respawn-picker .pizza-dilim {
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: rgba(16,16,19,.91) !important;
    }
    .wzg-ready .pizza-respawn-picker .pizza-dilim:hover,
    .wzg-ready .pizza-respawn-picker .pizza-dilim.active,
    .wzg-ready .pizza-respawn-picker .pizza-dilim.selected {
      background: rgba(255,255,255,.12) !important;
    }
    .wzg-ready .pizza-respawn-picker .vip-a {
      top: 4px !important;
      right: 50% !important;
      transform: translateX(50%) !important;
      z-index: 4 !important;
      background: rgba(24,24,27,.94) !important;
    }

    /* Settings control corrections */
    .wzg-ready #settings-close {
      background-image: none !important;
      background-position: initial !important;
      background-repeat: no-repeat !important;
    }
    .wzg-ready #settings-close::before,
    .wzg-ready #settings-close::after { content: none !important; display: none !important; }
    .wzg-ready #settings-close svg { display: block !important; }

    .wzg-ready .settings-body .wzg-native-select {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      min-height: 0 !important;
      padding: 0 !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
    .wzg-ready .wzg-select { position: relative !important; width: 100% !important; min-width: 0 !important; }
    .wzg-ready .settings-body .opt:has(.wzg-select.is-open) { z-index: 25 !important; }
    .wzg-ready .wzg-select-trigger {
      width: 100% !important;
      height: 40px !important;
      min-height: 40px !important;
      padding: 0 11px 0 13px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 10px !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 10px !important;
      background: rgba(0,0,0,.20) !important;
      color: var(--wzg-text) !important;
      box-shadow: none !important;
      font: 600 11px Figtree,Inter,sans-serif !important;
      text-align: left !important;
      cursor: pointer !important;
    }
    .wzg-ready .wzg-select-trigger:hover,
    .wzg-ready .wzg-select.is-open .wzg-select-trigger { border-color: var(--wzg-line-strong) !important; background: rgba(255,255,255,.045) !important; }
    .wzg-ready .wzg-select-trigger svg { width: 15px; height: 15px; flex: 0 0 auto; fill: none; stroke: var(--wzg-dim); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; transition: transform .15s ease; }
    .wzg-ready .wzg-select.is-open .wzg-select-trigger svg { transform: rotate(180deg); }
    .wzg-ready .wzg-select-menu {
      position: absolute !important;
      z-index: 30 !important;
      top: calc(100% + 6px) !important;
      left: 0 !important;
      right: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
      max-height: 218px !important;
      padding: 5px !important;
      display: none !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      scrollbar-gutter: stable !important;
      contain: paint !important;
      clip-path: inset(0 round 11px) !important;
      box-sizing: border-box !important;
      border: 1px solid var(--wzg-line-strong) !important;
      border-radius: 11px !important;
      background: rgba(20,20,23,.96) !important;
      box-shadow: 0 18px 42px rgba(0,0,0,.48) !important;
      backdrop-filter: blur(12px) !important;
    }
    .wzg-ready .wzg-select.is-open .wzg-select-menu { display: grid !important; gap: 2px !important; }
    .wzg-ready .wzg-select-menu::-webkit-scrollbar { width: 7px !important; }
    .wzg-ready .wzg-select-menu::-webkit-scrollbar-track { margin: 7px 0 !important; background: transparent !important; }
    .wzg-ready .wzg-select-menu::-webkit-scrollbar-thumb {
      border: 2px solid transparent !important;
      border-radius: 99px !important;
      background: rgba(255,255,255,.20) !important;
      background-clip: content-box !important;
    }
    .wzg-ready .wzg-select-option {
      width: 100% !important;
      min-height: 34px !important;
      padding: 0 10px !important;
      border: 1px solid transparent !important;
      border-radius: 7px !important;
      background: transparent !important;
      color: var(--wzg-dim) !important;
      font: 600 10px Figtree,Inter,sans-serif !important;
      text-align: left !important;
      cursor: pointer !important;
    }
    .wzg-ready .wzg-select-option:hover { background: rgba(255,255,255,.055) !important; color: var(--wzg-text) !important; }
    .wzg-ready .wzg-select-option.is-selected { border-color: var(--wzg-line) !important; background: rgba(255,255,255,.085) !important; color: var(--wzg-text) !important; }
    .wzg-ready .wzg-select-value { min-width: 0; display: flex; align-items: center; gap: 9px; }
    .wzg-ready .wzg-select-value > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .wzg-ready .wzg-select--background .wzg-select-option { min-height: 48px !important; display: flex !important; align-items: center !important; gap: 10px !important; }
    .wzg-ready .wzg-bg-thumb {
      width: 52px !important;
      height: 32px !important;
      flex: 0 0 52px !important;
      display: grid !important;
      place-items: center !important;
      overflow: hidden !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 7px !important;
      background-color: #17171a !important;
      background-image:
        linear-gradient(180deg, rgba(0,0,0,.03), rgba(0,0,0,.22)),
        var(--wzg-thumb, linear-gradient(145deg, #2a2a2e, #111114)) !important;
      background-position: center !important;
      background-size: cover !important;
      color: var(--wzg-faint) !important;
      font-size: 8px !important;
      font-weight: 750 !important;
      letter-spacing: .05em !important;
    }
    .wzg-ready .wzg-select-trigger .wzg-bg-thumb { width: 42px !important; height: 26px !important; flex-basis: 42px !important; }

    .wzg-ready #tab-shortcuts .keyRow {
      display: grid !important;
      grid-template-columns: minmax(72px,112px) minmax(0,1fr) !important;
      align-items: stretch !important;
      gap: 8px !important;
    }
    .wzg-ready #tab-shortcuts .key {
      width: 100% !important;
      min-width: 0 !important;
      min-height: 40px !important;
      height: auto !important;
      padding: 7px !important;
      overflow-wrap: anywhere !important;
      white-space: normal !important;
      font-size: 7px !important;
      line-height: 1.25 !important;
      text-align: center !important;
    }
    .wzg-ready #tab-shortcuts .keyRow .field {
      min-width: 0 !important;
      height: auto !important;
      min-height: 40px !important;
      padding: 8px 10px !important;
      display: flex !important;
      align-items: center !important;
      overflow-wrap: anywhere !important;
      white-space: normal !important;
      line-height: 1.3 !important;
    }

    .wzg-ready .wzg-store-modal {
      width: min(1280px,96vw) !important;
      height: min(780px,92vh) !important;
      max-width: none !important;
      max-height: 92vh !important;
      padding: 0 !important;
      display: grid !important;
      grid-template-columns: 210px minmax(0,1fr) !important;
      grid-template-rows: 70px minmax(0,1fr) !important;
      overflow: hidden !important;
      background: radial-gradient(circle at 86% -15%,rgba(255,255,255,.055),transparent 34%),rgba(17,17,20,.86) !important;
    }
    .wzg-ready .wzs-head {
      grid-column: 1 / -1 !important;
      grid-row: 1 !important;
      min-height: 70px !important;
      padding: 12px 16px !important;
      border-bottom: 1px solid var(--wzg-line) !important;
      background: rgba(255,255,255,.025) !important;
    }
    .wzg-ready .wzs-title { color: var(--wzg-text) !important; font-size: 17px !important; font-weight: 750 !important; text-shadow: none !important; }
    .wzg-ready .wzs-back, .wzg-ready .wzs-topup { width: 42px !important; height: 42px !important; border: 1px solid var(--wzg-line) !important; border-radius: 10px !important; background: var(--wzg-soft) !important; color: var(--wzg-text) !important; box-shadow: none !important; }
    .wzg-ready .wzs-back { display: grid !important; place-items: center !important; padding: 0 !important; }
    .wzg-ready .wzs-back::before, .wzg-ready .wzs-back::after { content: none !important; display: none !important; }
    .wzg-ready .wzs-back svg { width: 19px !important; height: 19px !important; fill: none !important; stroke: currentColor !important; stroke-width: 1.8 !important; stroke-linecap: round !important; stroke-linejoin: round !important; }
    .wzg-ready .wzs-tabs {
      grid-column: 1 !important;
      grid-row: 2 !important;
      min-width: 0 !important;
      min-height: 0 !important;
      padding: 16px 12px !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 6px !important;
      overflow: hidden auto !important;
      border: 0 !important;
      border-right: 1px solid var(--wzg-line) !important;
      background: rgba(7,7,9,.24) !important;
    }
    .wzg-ready .wzs-tabs::before { content: 'STORE'; padding: 0 10px 6px; color: var(--wzg-faint); font-size: 8px; font-weight: 750; letter-spacing: .15em; }
    .wzg-ready .wzs-pill {
      width: 100% !important;
      min-height: 42px !important;
      padding: 0 11px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      gap: 10px !important;
      border: 1px solid transparent !important;
      border-radius: 9px !important;
      background: transparent !important;
      color: var(--wzg-dim) !important;
      box-shadow: none !important;
      font-size: 10px !important;
      font-weight: 680 !important;
    }
    .wzg-ready .wzs-pill.active, .wzg-ready .wzs-pill:hover { border-color: var(--wzg-line) !important; background: var(--wzg-soft) !important; color: var(--wzg-text) !important; }
    .wzg-ready .wzg-store-modal[data-wzg-view="hub"] .wzs-tabs,
    .wzg-ready .wzg-store-modal[data-wzg-view="hub"] .wzs-body { display: none !important; }
    .wzg-ready .wzg-store-modal:not([data-wzg-view="hub"]) .wzg-store-hub { display: none !important; }
    .wzg-ready .wzg-store-modal:not([data-wzg-view="hub"]) .wzs-tabs > .wzs-pill { display: none !important; }
    .wzg-ready .wzg-store-modal:not([data-wzg-view="hub"]) .wzs-tabs::before { display: none !important; }
    /* Betterzilla options docked in the home right panel */
    html.wzg-ready #settings-tabs .tab[data-tab="extension"], html.wzg-ready #tab-extension { display: none !important; }
    html.wzg-ready #wzg-home-options {
      flex: 1 1 0; min-height: 260px; margin-top: 14px; padding: 2px 4px 2px 0;
      display: flex; flex-direction: column; gap: 12px; overflow: hidden auto;
      scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent;
    }
    html.wzg-ready #wzg-home-options > * { flex: 0 0 auto; }
    html.wzg-ready #wzg-home-options #wzg-extra-options { display: block !important; padding: 0 !important; margin: 0 !important; border: 0 !important; background: transparent !important; }
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-grid,
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-organized-grid { grid-template-columns: minmax(0,1fr) !important; gap: 10px !important; }
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-settings-stack { gap: 10px !important; }
    html.wzg-ready #wzg-home-options .wzg-font-option {
      display: grid !important; gap: 10px; padding: 12px; margin: 0;
      border: 1px solid var(--wzg-line); border-radius: 12px; background: var(--wzg-soft);
    }
    html.wzg-ready #wzg-home-options .wzg-font-option .opL, html.wzg-ready #wzg-home-options .wzg-font-option .opR { width: 100% !important; min-width: 0; }
    html.wzg-ready #wzg-home-options .wzg-font-option .opT { color: var(--wzg-text); font-size: 12px; font-weight: 750; }
    /* ---- Compact look for the docked Betterzilla panel ---- */
    html.wzg-ready #wzg-home-options { gap: 8px; margin-top: 12px; }
    html.wzg-ready #wzg-home-options .wzg-extra-copy small,
    html.wzg-ready #wzg-home-options .wzg-extra-range > small,
    html.wzg-ready #wzg-home-options .wzg-extra-card > header p,
    html.wzg-ready #wzg-home-options .wzg-extra-heading h4,
    html.wzg-ready #wzg-home-options .wzg-extra-card .hint,
    html.wzg-ready #wzg-home-options .wzg-font-option .opL .hint,
    html.wzg-ready #wzg-home-options #wzg-font-status { display: none !important; }
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-heading {
      display: flex !important; align-items: center; justify-content: space-between; margin: 0 0 8px !important; padding: 0 2px !important; border: 0 !important;
    }
    html.wzg-ready #wzg-home-options .wzg-extra-eyebrow { font-size: 9px !important; letter-spacing: .16em; }
    html.wzg-ready #wzg-home-options .wzg-extra-card {
      padding: 0 !important; margin: 0 !important; border: 1px solid var(--wzg-line) !important; border-radius: 12px !important;
      background: var(--wzg-soft) !important; overflow: hidden;
    }
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-card > header {
      display: flex !important; align-items: center; gap: 10px; min-height: 42px; padding: 0 12px !important; margin: 0 !important;
      border: 0 !important; cursor: pointer; user-select: none; position: relative;
    }
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-card > header:hover { background: rgba(255,255,255,.04); }
    html.wzg-ready #wzg-home-options .wzg-extra-card > header .wzg-extra-icon { width: 24px !important; height: 24px !important; flex: 0 0 24px; }
    html.wzg-ready #wzg-home-options .wzg-extra-card > header .wzg-extra-icon svg { width: 14px !important; height: 14px !important; }
    html.wzg-ready #wzg-home-options .wzg-extra-card > header h5 { margin: 0 !important; font-size: 12px !important; font-weight: 720 !important; color: var(--wzg-text); }
    html.wzg-ready #wzg-home-options .wzg-extra-card > header::after {
      content: ''; margin-left: auto; width: 7px; height: 7px; flex: 0 0 7px;
      border-right: 1.6px solid var(--wzg-dim); border-bottom: 1.6px solid var(--wzg-dim);
      transform: rotate(45deg) translateY(-2px); transition: transform .15s ease;
    }
    html.wzg-ready #wzg-home-options .wzg-extra-card.wzg-open > header::after { transform: rotate(225deg) translateY(-2px); }
    html.wzg-ready #wzg-home-options .wzg-extra-card:not(.wzg-open) > :not(header) { display: none !important; }
    html.wzg-ready #wzg-home-options .wzg-extra-card.wzg-open > header { border-bottom: 1px solid var(--wzg-line) !important; }
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-toggle {
      display: flex !important; align-items: center; justify-content: space-between; gap: 10px;
      min-height: 38px; margin: 0 !important; padding: 4px 12px !important; border: 0 !important; border-top: 1px solid rgba(255,255,255,.05) !important;
    }
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-card > header + .wzg-extra-toggle { border-top: 0 !important; }
    html.wzg-ready #wzg-home-options .wzg-extra-copy { flex: 1 1 auto; min-width: 0; }
    html.wzg-ready #wzg-home-options .wzg-extra-copy strong { font-size: 11px !important; font-weight: 650 !important; line-height: 1.3; color: var(--wzg-text); }
    html.wzg-ready #wzg-home-options .wzg-extra-range { padding: 8px 12px 10px !important; margin: 0 !important; }
    html.wzg-ready #wzg-home-options .wzg-font-option { padding: 10px 12px; gap: 8px; }
    html.wzg-ready #wzg-home-options .wzg-font-option .opT { font-size: 11px; }
    /* fix: fechar secoes de verdade + alinhamento do cabecalho */
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-card:not(.wzg-open) > :not(header) { display: none !important; }
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-card > header {
      justify-content: flex-start !important; align-items: center !important; gap: 10px !important; text-align: left !important;
    }
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-card > header > div {
      flex: 1 1 auto !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; display: flex; align-items: center;
    }
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-card > header .wzg-extra-icon {
      display: grid !important; place-items: center !important; width: 26px !important; height: 26px !important; flex: 0 0 26px !important;
      margin: 0 !important; padding: 0 !important; box-sizing: border-box !important;
    }
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-card > header .wzg-extra-icon svg {
      display: block !important; width: 14px !important; height: 14px !important; margin: 0 !important;
    }
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-card > header h5 { line-height: 1.2 !important; }
    html.wzg-ready #wzg-home-options .wzg-extra-badge { display: none !important; }
    html.wzg-ready #wzg-home-options [data-saturation-reset] {
      display: block !important; width: calc(100% - 24px) !important; box-sizing: border-box !important;
      margin: 0 12px 12px !important; min-height: 32px !important; padding: 0 12px !important;
      border: 1px solid var(--wzg-line) !important; border-radius: 9px !important; background: rgba(255,255,255,.05) !important;
      color: var(--wzg-text) !important; font: inherit !important; font-size: 11px !important; font-weight: 650 !important; text-align: center !important; cursor: pointer;
    }
    html.wzg-ready #wzg-home-options [data-saturation-reset]:hover { background: rgba(255,255,255,.1) !important; }
    /* Visual name spoofer: mesma linha/tamanho dos outros toggles */
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-range:has(> .wzg-extra-toggle) { padding: 0 !important; margin: 0 !important; }
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-range > .wzg-extra-toggle { width: 100% !important; box-sizing: border-box !important; font-size: inherit !important; }
    html.wzg-ready #wzg-home-options [data-visual-name] {
      display: block !important; width: calc(100% - 24px) !important; box-sizing: border-box !important; margin: 2px 12px 12px !important;
      min-height: 36px !important; padding: 0 12px !important; border: 1px solid var(--wzg-line) !important; border-radius: 9px !important;
      background: rgba(0,0,0,.28) !important; color: var(--wzg-text) !important; font: inherit !important; font-size: 11px !important;
    }
    /* fundo unico: os 3 paineis da home com o mesmo tom e sem divisorias */
    html.wzg-ready .shell > .panel,
    html.wzg-ready .shell > .panel:first-child,
    html.wzg-ready .shell > .panel:nth-child(2),
    html.wzg-ready .shell > .panel:last-child {
      background: transparent !important; background-image: none !important;
      border: 0 !important; outline: 0 !important; box-shadow: none !important;
    }
    html.wzg-ready .shell > .panel::before,
    html.wzg-ready .shell > .panel::after { display: none !important; }
    /* fix: icone grudado no topo (o CSS original zerava padding/min-height do cabecalho) */
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-card > header {
      box-sizing: border-box !important; min-height: 46px !important; height: auto !important; padding: 10px 12px !important; margin: 0 !important;
    }
    html.wzg-ready #wzg-home-options .wzg-font-option .hint { color: var(--wzg-dim); font-size: 10px; line-height: 1.4; }
    html.wzg-ready #wzg-home-options .wzg-native-select {
      position: absolute !important; width: 1px !important; height: 1px !important; min-height: 0 !important;
      opacity: 0 !important; pointer-events: none !important; overflow: hidden !important; clip-path: inset(50%) !important;
    }
    html.wzg-ready #wzg-home-options .wzg-font-option:has(.wzg-select.is-open) { position: relative; z-index: 25; }
    html.wzg-ready #wzg-home-options .wzg-font-option .wzg-select-trigger { height: 36px !important; min-height: 36px !important; font-size: 11px !important; }
    html.wzg-ready #wzg-home-options #wzg-font-preview { padding: 10px; border: 1px solid var(--wzg-line); border-radius: 9px; background: rgba(0,0,0,.28); font-size: 13px; color: var(--wzg-text); }
    html.wzg-ready #wzg-home-options .wzg-font-option button { min-height: 34px; border: 1px solid var(--wzg-line); border-radius: 9px; background: var(--wzg-soft); color: var(--wzg-text); cursor: pointer; }
    @media (max-width: 900px) { html.wzg-ready #wzg-home-options { flex: 0 0 auto; max-height: 560px; } }
    .wzg-store-hub {
      grid-column: 1 / -1; grid-row: 2; min-height: 0; overflow: auto;
      display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 22px; padding: 28px;
    }
    .wzg-hub-card {
      width: min(270px, 42%); min-width: 150px; aspect-ratio: 1 / 1.02; padding: 18px;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
      border: 1px solid var(--wzg-line); border-radius: 16px; cursor: pointer;
      background: radial-gradient(circle at 50% 0%, rgba(255,255,255,.07), transparent 62%), var(--wzg-soft);
      color: var(--wzg-text); font-family: inherit; text-align: center;
      transition: transform .14s ease, border-color .14s ease, background .14s ease;
    }
    .wzg-hub-card:hover { transform: translateY(-3px); border-color: rgba(255,255,255,.32); background-color: rgba(255,255,255,.07); }
    .wzg-hub-icon { width: 64px; height: 64px; display: grid; place-items: center; }
    .wzg-hub-icon svg { width: 56px; height: 56px; fill: none; stroke: currentColor; stroke-width: 1.35; stroke-linecap: round; stroke-linejoin: round; }
    .wzg-hub-card strong { font-size: 17px; font-weight: 750; }
    .wzg-hub-card small { color: var(--wzg-dim); font-size: 10px; line-height: 1.4; }
    .wzg-store-tab-icon { width: 16px; height: 16px; display: inline-grid; place-items: center; }
    .wzg-store-tab-icon svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.65; }
    .wzg-ready .wzg-store-modal > .wzs-body {
      grid-column: 2 !important;
      grid-row: 2 !important;
      min-width: 0 !important;
      min-height: 0 !important;
      padding: 14px !important;
      overflow: hidden auto !important;
    }
    .wzg-ready .wzs-shell { width: 100% !important; min-width: 0 !important; min-height: 100% !important; display: block !important; }
    .wzg-ready .wzg-store-groups {
      width: 100% !important;
      margin: 9px 0 0 !important;
      padding: 12px 0 0 !important;
      display: block !important;
      border: 0 !important;
      border-top: 1px solid var(--wzg-line) !important;
      border-radius: 0 !important;
      background: transparent !important;
    }
    .wzg-ready .wzg-store-groups--hidden { display: none !important; }
    .wzg-ready .wzg-native-category-heading { display: none !important; }
    .wzg-ready .wzg-native-category-panel { display: none !important; }
    .wzg-ready #wzsSkinCats { display: none !important; }
    .wzg-ready .wzg-native-skin-tab { display: none !important; }
    .wzg-ready .wzg-skin-groups:not(.wzg-store-groups--hidden) { flex: 1 1 auto !important; min-height: 0 !important; display: flex !important; flex-direction: column !important; }
    .wzg-ready .wzg-skin-groups .wzg-skin-category-list { flex: 1 1 auto !important; min-height: 0 !important; }
    .wzg-ready .wzg-skin-category-list { max-height: none !important; padding-right: 3px !important; overflow: hidden auto !important; scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,.18) transparent !important; }
    .wzg-ready .wzg-skin-category { flex: 0 0 auto !important; text-align: left !important; }
    .wzg-ready .wzg-skin-category--image {
      min-height: 48px !important;
      height: 48px !important;
      padding: 4px !important;
      overflow: hidden !important;
      background: rgba(255,255,255,.025) !important;
    }
    .wzg-ready .wzg-skin-category--image img {
      width: 100% !important;
      height: 100% !important;
      display: block !important;
      object-fit: cover !important;
      border-radius: 6px !important;
      filter: saturate(.78) brightness(.86) !important;
    }
    .wzg-ready .wzg-skin-category--image:hover img,
    .wzg-ready .wzg-skin-category--image.active img { filter: saturate(.95) brightness(1) !important; }
    .wzg-ready .wzs-side h5 { margin: 0 !important; padding: 0 10px 8px !important; color: var(--wzg-faint) !important; font-size: 8px !important; letter-spacing: .14em !important; text-transform: uppercase !important; }
    .wzg-ready .wzs-vlist { display: grid !important; gap: 4px !important; }
    .wzg-ready .wzs-vbtn { width: 100% !important; min-height: 39px !important; padding: 7px 11px !important; justify-content: flex-start !important; border: 1px solid transparent !important; border-radius: 8px !important; background: transparent !important; color: var(--wzg-dim) !important; box-shadow: none !important; font-size: 10px !important; }
    .wzg-ready .wzs-vbtn.active, .wzg-ready .wzs-vbtn:hover { border-color: var(--wzg-line) !important; background: var(--wzg-soft) !important; color: var(--wzg-text) !important; }
    .wzg-ready .wzs-stage {
      width: 100% !important;
      min-width: 0 !important;
      min-height: calc(min(780px,92vh) - 98px) !important;
      padding: 10px !important;
      display: grid !important;
      grid-template-rows: minmax(340px,1fr) auto !important;
      gap: 10px !important;
      border: 1px solid var(--wzg-line) !important;
      border-radius: 14px !important;
      background: rgba(0,0,0,.12) !important;
    }
    .wzg-ready .wzs-canvas { min-width: 0 !important; min-height: 340px !important; position: relative !important; border: 1px solid var(--wzg-line) !important; border-radius: 12px !important; background: radial-gradient(circle at 50% 48%,rgba(255,255,255,.035),transparent 34%),rgba(255,255,255,.012) !important; overflow: hidden !important; }
    .wzg-ready .wzs-arrow {
      width: 48px !important;
      height: 48px !important;
      padding: 0 !important;
      display: grid !important;
      place-items: center !important;
      border: 1px solid rgba(255,255,255,.13) !important;
      border-radius: 12px !important;
      background: rgba(24,24,28,.72) !important;
      color: #e8e8eb !important;
      box-shadow: inset 0 1px rgba(255,255,255,.04),0 10px 25px rgba(0,0,0,.2) !important;
      backdrop-filter: blur(12px) !important;
      transition: transform .16s ease,background .16s ease,border-color .16s ease !important;
    }
    .wzg-ready .wzs-arrow:hover { transform: scale(1.06) !important; border-color: rgba(255,255,255,.24) !important; background: rgba(48,48,54,.82) !important; }
    .wzg-ready .wzs-arrow svg { width: 22px !important; height: 22px !important; fill: none !important; stroke: currentColor !important; stroke-width: 1.8 !important; stroke-linecap: round !important; stroke-linejoin: round !important; }
    .wzg-ready .wzs-ctrl, .wzg-ready .wzs-buybar { padding: 8px !important; gap: 8px !important; border: 1px solid var(--wzg-line) !important; border-radius: 11px !important; background: rgba(0,0,0,.14) !important; }
    .wzg-ready .wzs-ctrl button, .wzg-ready .wzs-buybar button { min-height: 36px !important; border: 1px solid var(--wzg-line) !important; border-radius: 8px !important; background: var(--wzg-soft) !important; color: var(--wzg-text) !important; box-shadow: none !important; }

    /* Store accessory workstation */
    .wzg-ready #wzs-acc .wzs-ctrl {
      padding: 12px !important;
      display: grid !important;
      grid-template-columns: minmax(0,1fr) !important;
      gap: 10px !important;
      overflow: visible !important;
      border-radius: 14px !important;
      background: rgba(12,12,14,.46) !important;
      backdrop-filter: blur(12px) saturate(55%) !important;
    }
    #wzg-id-tool {
      width: 100%;
      min-width: 0;
      padding: 12px;
      border: 1px solid var(--wzg-line);
      border-radius: 12px;
      background: rgba(255,255,255,.025);
      box-shadow: inset 0 1px rgba(255,255,255,.025);
    }
    .wzg-id-head { margin-bottom: 10px; display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
    .wzg-id-head > div { min-width: 0; display: grid; gap: 3px; }
    .wzg-id-head strong { color: var(--wzg-text); font-size: 12px; font-weight: 750; }
    .wzg-id-head span { color: var(--wzg-faint); font-size: 9px; font-weight: 520; }
    .wzg-id-head b { flex: 0 0 auto; padding: 5px 8px; border: 1px solid var(--wzg-line); border-radius: 99px; background: rgba(255,255,255,.04); color: var(--wzg-dim); font-size: 8px; letter-spacing: .08em; }
    .wzg-search { display: grid; grid-template-columns: 15px minmax(100px,.8fr) minmax(150px,1.25fr) auto auto; align-items: center; gap: 7px; }
    .wzg-search > svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; color: var(--wzg-faint); }
    #wzg-id-input, #wzg-id-name {
      width: 100%;
      min-width: 0;
      min-height: 38px;
      padding: 0 11px;
      border: 1px solid var(--wzg-line);
      border-radius: 9px;
      outline: 0;
      background: rgba(0,0,0,.22);
      color: var(--wzg-text);
      font: 650 10px Arial,sans-serif;
      transition: border-color .16s ease, background .16s ease;
    }
    #wzg-id-input:focus, #wzg-id-name:focus { border-color: var(--wzg-line-strong); background: rgba(255,255,255,.035); }
    .wzg-id-action {
      min-height: 38px;
      padding: 0 13px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      white-space: nowrap;
      border: 1px solid var(--wzg-line);
      border-radius: 9px;
      background: rgba(255,255,255,.055);
      color: var(--wzg-dim);
      font-size: 9px;
      font-weight: 750;
      cursor: pointer;
    }
    .wzg-id-action:hover, .wzg-id-action--primary { border-color: var(--wzg-line-strong); background: rgba(255,255,255,.095); color: var(--wzg-text); }
    .wzg-id-action svg { width: 13px; height: 13px; fill:none; stroke:currentColor; stroke-width:1.8; }
    #wzg-feedback { min-height: 13px; margin: 7px 0 0 22px; color: var(--wzg-faint); font-size: 9px; }
    #wzg-feedback.ok { color: #c8c8cc; } #wzg-feedback.bad { color: #df9c9c; }
    #wzg-saved { margin-top: 8px; display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 7px; }
    .wzg-saved-item {
      min-width: 0;
      min-height: 42px;
      padding: 5px;
      display: grid;
      grid-template-columns: auto minmax(70px,1fr) auto 28px;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--wzg-line);
      border-radius: 9px;
      background: rgba(255,255,255,.03);
    }
    .wzg-saved-id { padding-left: 5px; color: var(--wzg-faint); font-size: 8px; font-weight: 750; letter-spacing: .04em; }
    .wzg-saved-item input {
      width: 100%;
      min-width: 0;
      height: 30px;
      padding: 0 8px;
      border: 1px solid transparent;
      border-radius: 7px;
      outline: 0;
      background: transparent;
      color: var(--wzg-text);
      font: 700 9px Arial,sans-serif;
      text-overflow: ellipsis;
    }
    .wzg-saved-item input:hover, .wzg-saved-item input:focus { border-color: var(--wzg-line); background: rgba(0,0,0,.18); }
    .wzg-saved-item button { height: 30px; padding: 0 9px; border: 1px solid var(--wzg-line); border-radius: 7px; background: rgba(255,255,255,.045); color: var(--wzg-dim); font: 700 8px Arial,sans-serif; cursor:pointer; }
    .wzg-saved-item button:hover { border-color: var(--wzg-line-strong); color: var(--wzg-text); }
    .wzg-saved-item .wzg-saved-remove { width: 28px; padding: 0; color: var(--wzg-faint); }
    .wzg-saved-empty { min-height: 40px; padding: 0 12px; display: flex; align-items: center; border: 1px dashed var(--wzg-line); border-radius: 9px; color: var(--wzg-faint); font-size: 9px; }
    .wzg-purchase-row { min-height: 54px; padding: 8px; display: flex; align-items: center; justify-content: flex-start; gap: 8px; border: 1px solid var(--wzg-line); border-radius: 11px; background: rgba(255,255,255,.022); }
    .wzg-purchase-row > * { margin: 0 !important; }
    .wzg-ready #wzsAccMeta,
    .wzg-ready #wzsSkinMeta {
      width: 180px !important;
      min-width: 150px !important;
      height: 46px !important;
      padding: 0 14px !important;
      border: 1px solid var(--wzg-line-strong) !important;
      border-radius: 10px !important;
      outline: 0 !important;
      background: rgba(16,16,19,.58) !important;
      color: var(--wzg-text) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.045), 0 10px 28px rgba(0,0,0,.18) !important;
      backdrop-filter: blur(12px) saturate(52%) !important;
      -webkit-backdrop-filter: blur(12px) saturate(52%) !important;
      font: 750 20px Figtree,Inter,sans-serif !important;
      text-align: center !important;
    }
    .wzg-ready #wzsAccMeta:focus,
    .wzg-ready #wzsSkinMeta:focus { border-color: rgba(255,255,255,.24) !important; background: rgba(28,28,32,.72) !important; }
    .wzg-ready .wzg-purchase-row > :first-child,
    .wzg-ready .wzg-purchase-row > :first-child input,
    .wzg-ready .wzg-purchase-row output,
    .wzg-ready .wzg-purchase-row [class*="meta" i],
    .wzg-ready .wzg-purchase-row [class*="price" i] {
      border-color: var(--wzg-line-strong) !important;
      outline: 0 !important;
      background: rgba(255,255,255,.045) !important;
      background-image: none !important;
      color: var(--wzg-text) !important;
      box-shadow: inset 0 1px rgba(255,255,255,.035) !important;
      text-shadow: none !important;
      backdrop-filter: blur(12px) saturate(48%) !important;
      -webkit-backdrop-filter: blur(12px) saturate(48%) !important;
    }
    .wzg-ready .wzg-purchase-row button { min-width: 74px !important; height: 46px !important; padding: 0 16px !important; background: rgba(255,255,255,.07) !important; }


    @media (max-width: 1120px) {
      .wzg-ready .shell { grid-template-columns: 190px minmax(390px,1fr) 230px !important; }
      .wzg-ready .pi-rows { grid-template-columns: 1fr !important; }
      .wzg-ready .vip-only { grid-column: auto; }
    }
    @media (max-width: 900px) {
      .wzg-ready .stage { display: block !important; padding: 8px !important; }
      .wzg-ready header { margin-bottom: 8px !important; }
      .wzg-ready .shell { display: grid !important; grid-template-columns: 1fr !important; }
      .wzg-ready .shell > .panel { min-height: 480px !important; }
      .wzg-ready .shell > .panel:first-child { min-height: auto !important; }
      .wzg-ready #wzg-sidebar { min-height: 280px; }
      .wzg-ready .header-logo { display: none !important; }
      .wzg-ready .header-buttons { width: 100%; justify-content: center; flex-wrap: wrap; }
      .wzg-ready footer { margin-top: 8px !important; }
      .wzg-ready .wzg-store-modal { grid-template-columns: 176px minmax(0,1fr) !important; }
      .wzg-ready .wzg-store-modal > .wzs-body { padding: 10px !important; }
      .wzg-ready .wzs-shell { display: block !important; }
      .wzg-ready .wzs-stage { min-height: calc(min(780px,92vh) - 90px) !important; }
      #wzg-vip-body .vip-content-container { grid-template-columns: 1fr !important; }
      .wzg-bg-grid { grid-template-columns: 1fr; }
      .wzg-bg-custom { grid-template-columns: 1fr; }
      .wzg-ready .settings-wrap { padding: 10px !important; }
      .wzg-ready .settings-modal { width: 100% !important; height: min(860px,96vh) !important; grid-template-columns: 176px minmax(0,1fr) !important; }
      .wzg-ready .settings-body .sectionS.active { grid-template-columns: 1fr !important; }
      .wzg-ready .settings-body .wzg-settings-intro,
      .wzg-ready #tab-general .opt:first-of-type { grid-column: 1 !important; }
      .wzg-search { grid-template-columns: 15px minmax(95px,.7fr) minmax(130px,1fr) auto !important; }
      .wzg-id-action--primary { grid-column: 2 / -1; }
      #wzg-saved { grid-template-columns: 1fr; }
    }
    @media (max-width: 620px) {
      .wzg-ready .wzg-store-modal { grid-template-columns: 1fr !important; grid-template-rows: 64px auto minmax(0,1fr) !important; }
      .wzg-ready .wzg-store-modal .wzs-head { min-height: 64px !important; grid-column: 1 !important; }
      .wzg-ready .wzg-store-modal .wzs-tabs { grid-column: 1 !important; grid-row: 2 !important; padding: 8px !important; flex-direction: row !important; flex-wrap: wrap !important; overflow: visible !important; border-right: 0 !important; border-bottom: 1px solid var(--wzg-line) !important; }
      .wzg-ready .wzg-store-modal .wzs-tabs::before { display: none !important; }
      .wzg-ready .wzg-store-modal .wzs-pill { width: auto !important; flex: 1 1 120px !important; }
      .wzg-ready .wzg-store-modal > .wzs-body { grid-column: 1 !important; grid-row: 3 !important; }
      .wzg-ready .wzg-store-groups { flex: 1 0 100% !important; }
      .wzg-ready .wzg-store-groups .wzs-vlist { grid-template-columns: repeat(2,minmax(0,1fr)) !important; }
      .wzg-ready .wzs-stage { min-height: 560px !important; grid-template-rows: minmax(280px,1fr) auto !important; }
      .wzg-ready .wzs-canvas { min-height: 280px !important; }
      .wzg-ready .settings-modal { grid-template-columns: 1fr !important; grid-template-rows: 70px auto minmax(0,1fr) !important; border-radius: 15px !important; }
      .wzg-ready .settings-head { min-height: 70px !important; grid-column: 1 !important; padding: 10px 12px !important; }
      .wzg-ready .settings-head h3::after { display: none !important; }
      .wzg-ready #settings-tabs { padding: 8px !important; flex-direction: row !important; gap: 5px !important; overflow-x: auto !important; border-right: 0 !important; border-bottom: 1px solid var(--wzg-line) !important; }
      .wzg-ready #settings-tabs::before { display: none !important; }
      .wzg-ready #settings-tabs .tab { width: auto !important; min-width: 45px !important; height: 42px !important; min-height: 42px !important; padding: 0 12px !important; justify-content: center !important; }
      .wzg-ready #settings-tabs .tab span,
      .wzg-ready #settings-tabs .tab::after { display: none !important; }
      .wzg-ready .settings-body { padding: 13px !important; }
      .wzg-ready .wzg-settings-intro b { display: none !important; }
      .wzg-search { grid-template-columns: 15px minmax(0,1fr) auto !important; }
      #wzg-id-name { grid-column: 2 / -1; }
      .wzg-id-action--primary { grid-column: 2 / -1; }
      .wzg-saved-item { grid-template-columns: auto minmax(0,1fr) 28px !important; }
      .wzg-saved-open { grid-column: 2 / 3; }
      .wzg-saved-remove { grid-column: 3; grid-row: 1 / 3; }
      .wzg-purchase-row { justify-content: stretch; flex-wrap: wrap; }
    }
    @media (prefers-reduced-motion: reduce) { .wzg-ready * { animation-duration: .001ms !important; transition-duration: .001ms !important; } }
    .wzg-kill-feed-hidden { display: none !important; }
  `;

  const EXTRA_CSS = "\n/* Compact token action; preserve the native button and its click handler. */\n.wzg-ready .player-card .wzg-token-value { display:flex!important; align-items:center!important; gap:4px!important; flex-wrap:wrap!important; width:100%!important; min-width:0!important; overflow:visible!important; white-space:normal!important; }\n.wzg-ready .player-card .wzg-token-value #nameTokenCount.change-token-no { min-width:20px!important; height:24px!important; padding:0 5px!important; flex:0 0 auto!important; font-size:10px!important; }\n.wzg-ready .player-card .change-name-btn {\n  display:inline-flex!important; align-items:center!important; justify-content:center!important;\n  width:auto!important; min-width:60px!important; max-width:100%!important; height:24px!important; min-height:24px!important;\n  padding:4px!important; gap:3px!important; margin:0!important; flex:0 0 auto!important; float:none!important;\n  font-size:10px!important; font-weight:600!important; line-height:1!important; white-space:nowrap!important; text-transform:none!important; letter-spacing:0!important;\n  position:static!important; background:rgba(255,255,255,.065)!important; color:#d5d5dc!important;\n  border:1px solid rgba(255,255,255,.12)!important; border-radius:8px!important;\n  box-shadow:inset 0 1px rgba(255,255,255,.04)!important; backdrop-filter:blur(8px)!important;\n}\n.wzg-ready .player-card .change-name-btn:hover { background:rgba(255,255,255,.14)!important; color:white!important; }\n.wzg-ready .player-card .change-name-btn svg { width:12px!important; height:12px!important; flex:none!important; }\n.wzg-ready .player-card .change-name-btn:focus-visible { outline:2px solid #ddd!important; outline-offset:2px; }\n.wzg-ready #tab-extension .wzg-speed-option { grid-column:1 / -1!important; display:block!important; width:100%!important; min-width:0!important; }\n#wzg-speed-controls { display:grid; gap:14px; width:100%; }\n#wzg-speed-controls .wzg-speed-entry { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }\n#wzg-speed-controls input[type=number] { width:110px; padding:9px 12px; color:#eee; background:rgba(255,255,255,.06); border:1px solid var(--wzg-line); border-radius:9px; }\n#wzg-speed-controls button { padding:8px 12px; border:1px solid var(--wzg-line); background:rgba(255,255,255,.06); color:#ddd; border-radius:9px; cursor:pointer; }\n#wzg-speed-controls button:hover, #wzg-speed-controls button.is-active { background:rgba(255,255,255,.14); color:#fff; }\n#wzg-speed-controls input[type=range] { width:100%; }\n#wzg-speed-controls output { font-size:22px; font-weight:700; font-variant-numeric:tabular-nums; }\n#wzg-speed-controls .wzg-speed-hint { color:var(--wzg-dim); font-size:12px; line-height:1.5; }\n.wzg-ready #tab-extension .wzg-font-option { grid-column:1 / -1!important; display:flex!important; flex-wrap:wrap!important; gap:12px!important; }\n#wzg-font-preview { flex-basis:100%; font-size:18px; color:#eee; padding:12px; border:1px solid var(--wzg-line); border-radius:9px; background:rgba(255,255,255,.03); }\n#wzg-font-status { flex-basis:100%; }\n#wzg-font-reload { border:1px solid var(--wzg-line); border-radius:8px; background:rgba(255,255,255,.08); padding:8px 12px; color:#eee; cursor:pointer; }\n#wzg-font-reload[hidden] { display:none!important; }\n.wzg-ready #tab-extension #wzg-extra-options { display:block!important; grid-column:1 / -1!important; width:100%; min-width:0; padding:20px!important; background:rgba(20,20,24,.6)!important; backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,.09)!important; border-radius:18px!important; }\n#wzg-extra-options label { font-size:13px; color:#ddd; }\n#wzg-extra-options input[type=range] { display:block; width:100%; margin-top:8px; }\n#wzg-extra-options output { float:right; font-variant-numeric:tabular-nums; }\n#wzg-extra-options .wzg-extra-toggle { display:flex; align-items:center; justify-content:space-between; gap:16px; }\n#wzg-extra-options .wzg-extra-heading { display:flex!important; align-items:center; justify-content:space-between; gap:12px; margin-bottom:20px; }\n#wzg-extra-options .wzg-extra-eyebrow { font-size:9px; font-weight:700; letter-spacing:.15em; color:#777780; }\n#wzg-extra-options h4 { margin:5px 0 0; font-size:17px; font-weight:700; color:#f0f0f2; }\n#wzg-extra-options .wzg-extra-badge { font-size:8px; letter-spacing:.1em; color:#9999a1; border:1px solid rgba(255,255,255,.1); border-radius:20px; padding:5px 8px; white-space:nowrap; }\n#wzg-extra-options .wzg-extra-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr)); gap:14px; }\n#wzg-extra-options .wzg-extra-card { display:block!important; min-width:0; margin:0!important; padding:18px!important; border-radius:14px; border:1px solid rgba(255,255,255,.07); background:linear-gradient(140deg,rgba(255,255,255,.04),rgba(255,255,255,.012)); box-shadow:inset 0 1px rgba(255,255,255,.025); }\n#wzg-extra-options .wzg-extra-card>header { display:flex!important; align-items:center; gap:10px; margin-bottom:20px; }\n#wzg-extra-options .wzg-extra-icon { display:grid; place-items:center; width:32px; height:32px; border:1px solid rgba(255,255,255,.08); border-radius:10px; background:rgba(255,255,255,.04); }\n#wzg-extra-options .wzg-extra-icon svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.7; }\n#wzg-extra-options h5 { margin:0; color:#ededf0; font-size:13px; font-weight:650; }\n#wzg-extra-options p, #wzg-extra-options small { display:block; margin:4px 0 0; font-size:10px; color:#888892; line-height:1.5; font-weight:400; }\n#wzg-extra-options .wzg-extra-range { display:block; margin:0 0 20px; }\n#wzg-extra-options .wzg-extra-range>span { display:flex; justify-content:space-between; align-items:center; gap:10px; font-size:12px; }\n#wzg-extra-options output { float:none; min-width:40px; text-align:center; padding:3px 7px; border:1px solid rgba(255,255,255,.09); background:rgba(255,255,255,.05); border-radius:7px; font-size:10px; font-weight:600; }\n#wzg-extra-options input[type=range] { appearance:none!important; -webkit-appearance:none!important; height:5px!important; min-height:0!important; padding:0!important; margin:13px 0 7px!important; border:0!important; border-radius:99px!important; background:linear-gradient(to right,#bdbdc7 0 var(--wzg-fill,0%),rgba(255,255,255,.1) var(--wzg-fill,0%) 100%)!important; cursor:pointer; }\n#wzg-extra-options input[type=range]::-webkit-slider-thumb { appearance:none; width:13px; height:13px; border:2px solid #e5e5eb; background:#d6d6df; border-radius:50%; box-shadow:0 0 0 3px rgba(255,255,255,.06); }\n#wzg-extra-options .wzg-extra-toggle { padding:13px 0; border-top:1px solid rgba(255,255,255,.065); cursor:pointer; }\n#wzg-extra-options .wzg-extra-toggle:last-child { padding-bottom:0; }\n#wzg-extra-options .wzg-extra-copy { min-width:0; }\n#wzg-extra-options .wzg-extra-copy strong { font-size:12px; font-weight:500; color:#dcdce3; }\n#wzg-extra-options .wzg-extra-switch { position:relative; display:block; width:34px; height:20px; flex:0 0 34px; }\n#wzg-extra-options .wzg-extra-switch input { position:absolute!important; inset:0!important; width:100%!important; height:100%!important; margin:0!important; opacity:0!important; cursor:pointer; z-index:1; }\n#wzg-extra-options .wzg-extra-track { display:block; width:34px; height:20px; border-radius:99px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.07); transition:background .15s; }\n#wzg-extra-options .wzg-extra-track::after { content:''; display:block; width:12px; height:12px; margin:3px; border-radius:50%; background:#80808a; transition:transform .15s,background .15s; }\n#wzg-extra-options .wzg-extra-switch input:checked+.wzg-extra-track { background:rgba(225,225,238,.23); border-color:rgba(255,255,255,.25); }\n#wzg-extra-options .wzg-extra-switch input:checked+.wzg-extra-track::after { transform:translateX(14px); background:#f2f2f7; }\n#wzg-extra-options input:focus-visible { outline:2px solid #bbb!important; outline-offset:5px; }\n#wzg-extra-options .wzg-extra-switch input:focus-visible+.wzg-extra-track { outline:2px solid #bbb; outline-offset:3px; }\n\n/* Keep native modal header rules out of nested preference cards. */\nhtml.wzg-ready #wzg-extra-options .wzg-extra-heading,\nhtml.wzg-ready #wzg-extra-options .wzg-extra-card>header {\n  position:static!important; inset:auto!important; transform:none!important;\n  width:auto!important; min-width:0!important; height:auto!important; min-height:0!important;\n  padding:0!important; margin:0 0 20px!important; border:0!important; border-radius:0!important;\n  background:none!important; box-shadow:none!important; backdrop-filter:none!important;\n  text-align:left!important; flex-shrink:0!important;\n}\nhtml.wzg-ready #wzg-extra-options .wzg-extra-card>header { justify-content:flex-start!important; gap:10px!important; }\nhtml.wzg-ready #wzg-extra-options .wzg-extra-heading { justify-content:space-between!important; }\nhtml.wzg-ready #wzg-extra-options .wzg-extra-card>header>div { text-align:left!important; margin:0!important; }\nhtml.wzg-ready #wzg-extra-options .wzg-extra-grid { margin:0!important; gap:16px!important; align-items:stretch; }\nhtml.wzg-ready #tab-extension>.wzg-kill-feed-option {\n  grid-column:1 / -1!important; width:100%!important; min-width:0!important;\n  display:flex!important; flex-direction:row!important; align-items:center!important;\n  justify-content:space-between!important; gap:20px!important; padding:18px 20px!important;\n}\nhtml.wzg-ready #tab-extension>.wzg-kill-feed-option .opL { flex:1!important; min-width:0; }\nhtml.wzg-ready #tab-extension>.wzg-kill-feed-option .opR { width:auto!important; flex:0 0 auto!important; margin:0!important; }\nhtml.wzg-ready #tab-extension>.wzg-speed-option { padding:20px!important; border-radius:18px!important; background:rgba(23,23,28,.6)!important; border:1px solid rgba(255,255,255,.09)!important; backdrop-filter:blur(10px); }\n#wzg-speed-controls { gap:18px!important; }\n#wzg-speed-controls .wzg-speed-head { display:flex; align-items:center; justify-content:space-between; gap:16px; }\n#wzg-speed-controls .wzg-speed-title { display:flex; align-items:center; gap:11px; }\n#wzg-speed-controls .wzg-speed-title strong { display:block; font-size:14px; color:#eee; }\n#wzg-speed-controls .wzg-speed-title small { display:block; margin-top:4px; color:#888892; font-size:11px; }\n#wzg-speed-controls .wzg-speed-icon { display:grid; place-items:center; width:36px; height:36px; border-radius:11px; background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.09); }\n#wzg-speed-controls .wzg-speed-icon svg { width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:1.7; }\n#wzg-speed-controls .wzg-speed-surface { display:grid; gap:16px; min-width:0; padding:18px; background:linear-gradient(130deg,rgba(255,255,255,.04),rgba(255,255,255,.01)); border:1px solid rgba(255,255,255,.065); border-radius:13px; }\n#wzg-speed-controls .wzg-speed-meter { display:flex; justify-content:space-between; align-items:center; gap:14px; }\n#wzg-speed-controls .wzg-speed-meter>span { color:#888892; font-size:9px; font-weight:600; letter-spacing:.12em; }\n#wzg-speed-controls #wzg-speed-readout { font-size:27px!important; padding:0!important; background:none!important; border:0!important; color:#f0f0f5; }\n#wzg-speed-controls .wzg-speed-form { display:grid!important; grid-template-columns:minmax(0,1fr) auto auto; gap:8px!important; }\n#wzg-speed-controls #wzg-speed-number { width:100%!important; min-width:0!important; height:36px!important; margin:0!important; padding:8px 11px!important; border-radius:9px!important; background:rgba(0,0,0,.2)!important; }\n#wzg-speed-controls button { height:36px; margin:0!important; font-size:11px; white-space:nowrap; transition:background .15s; }\n#wzg-speed-controls #wzg-speed-apply { background:rgba(230,230,240,.17); border-color:rgba(255,255,255,.18); color:#fff; }\n#wzg-speed-controls .wzg-speed-presets { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; }\n#wzg-speed-controls #wzg-speed-range { margin:8px 0!important; height:5px!important; min-height:0!important; padding:0!important; appearance:none!important; border:0!important; border-radius:99px!important; background:rgba(255,255,255,.13)!important; }\n#wzg-speed-controls #wzg-speed-range::-webkit-slider-thumb { appearance:none; width:13px; height:13px; background:#e2e2ea; border:2px solid #eee; border-radius:50%; box-shadow:0 0 0 3px rgba(255,255,255,.06); }\n#wzg-speed-controls #wzg-speed-status { font-size:10px; color:#868690; margin:0; line-height:1.6; }\n@media(max-width:500px) { #wzg-speed-controls .wzg-speed-form { grid-template-columns:1fr 1fr; } #wzg-speed-controls #wzg-speed-number { grid-column:1 / -1; } }\n\n/* The selected sector must never paint over the center cap. */\nhtml.wzg-ready .pizza-respawn-picker { isolation:isolate!important; }\nhtml.wzg-ready .pizza-respawn-picker .pizza-dilim,\nhtml.wzg-ready .pizza-respawn-picker .pizza-dilim:hover,\nhtml.wzg-ready .pizza-respawn-picker .pizza-dilim.active,\nhtml.wzg-ready .pizza-respawn-picker .pizza-dilim.selected {\n  position:relative!important; inset:auto!important; z-index:1!important;\n}\nhtml.wzg-ready .pizza-respawn-picker::before {\n  z-index:5!important; opacity:1!important; background:#19191c!important;\n  pointer-events:none!important; mix-blend-mode:normal!important;\n}\nhtml.wzg-ready .pizza-respawn-picker .vip-a { z-index:6!important; }\n";

  const INGAME_CSS = 'html.wzg-ingame body::before,html.wzg-ingame body::after{display:none!important}html.wzg-ingame .shell,html.wzg-ingame header{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}html.wzg-ingame #app::before{display:none!important}'
    + 'html.wzg-ingame:not(#a):not(#b):not(#c) body *,html.wzg-ingame:not(#a):not(#b):not(#c) body *::before,html.wzg-ingame:not(#a):not(#b):not(#c) body *::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}'
    + 'html.wzg-ingame:not(#a):not(#b):not(#c) .settings-overlay,html.wzg-ingame:not(#a):not(#b):not(#c) .wzs-dim,html.wzg-ingame:not(#a):not(#b):not(#c) .modal-dim{background:rgba(0,0,0,.72)!important}';
  function injectStyle() {
    if (document.getElementById(`${ID}-style`)) return;
    const style = document.createElement('style');
    style.id = `${ID}-style`;
    style.textContent = CSS + EXTRA_CSS + INGAME_CSS + "html.wzg-ready #tab-configfiles.active{display:block!important;width:100%!important;}\nhtml.wzg-ready #tab-configfiles .wzg-file-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:18px!important;width:100%!important;}\nhtml.wzg-ready #tab-configfiles .wzg-file-card{display:flex;flex-direction:column;align-items:flex-start;box-sizing:border-box;min-width:0;padding:26px;border-radius:18px;background:linear-gradient(135deg,#ffffff08,#ffffff02);border:1px solid #ffffff16;backdrop-filter:blur(12px);box-shadow:inset 0 1px #ffffff07;}\nhtml.wzg-ready #tab-configfiles .wzg-file-card h3{font-size:20px;margin:14px 0 8px;line-height:1.3;}\nhtml.wzg-ready #tab-configfiles .wzg-file-card p{flex:1;margin:0 0 24px;line-height:1.7;font-size:12px;max-width:38ch;}\nhtml.wzg-ready #tab-configfiles .wzg-file-card button{width:100%;min-height:42px;margin-top:0;border-radius:10px;background:#ffffff0b;transition:background .15s;}\nhtml.wzg-ready #tab-configfiles .wzg-file-card button:hover{background:#ffffff15;}\nhtml.wzg-ready #tab-configfiles .wzg-file-note{display:block;width:100%;box-sizing:border-box;margin:18px 0 0;padding:14px 16px;border:1px solid #ffffff0c;border-radius:12px;background:#ffffff03;font-size:11px;line-height:1.6;}\nhtml.wzg-ready #tab-configfiles [data-status]:empty{display:none;}html.wzg-ready #tab-configfiles [data-status]{margin:16px 0 0;line-height:1.5;}\nhtml.wzg-ready #tab-configfiles [hidden]{display:none!important;}\n@media(max-width:650px){html.wzg-ready #tab-configfiles .wzg-file-grid{grid-template-columns:minmax(0,1fr)!important;}html.wzg-ready #tab-configfiles .wzg-file-card{padding:20px;}}\r\n" + "html.wzg-ready #tab-speed.active{display:block!important;width:100%!important;}\nhtml.wzg-ready #tab-speed .wzg-speed-option{grid-column:1/-1!important;width:100%!important;max-width:none!important;box-sizing:border-box!important;margin:0!important;padding:28px!important;background:linear-gradient(135deg,rgba(255,255,255,.07),rgba(255,255,255,.018))!important;backdrop-filter:blur(12px);border:1px solid #ffffff19!important;box-shadow:inset 0 1px #ffffff08,0 12px 40px #00000018!important;border-radius:20px!important;}\nhtml.wzg-ready #tab-speed #wzg-speed-controls .wzg-speed-surface{background:rgba(9,9,12,.24)!important;border:1px solid #ffffff10!important;border-radius:16px!important;padding:28px!important;gap:24px!important;}\nhtml.wzg-ready #tab-speed #wzg-speed-controls .wzg-speed-meter{display:grid!important;grid-template-columns:1fr auto auto!important;align-items:center!important;padding-bottom:20px!important;gap:16px!important;}\nhtml.wzg-ready #tab-speed #wzg-speed-controls #wzg-speed-readout{font-size:48px!important;line-height:1.1!important;letter-spacing:-.05em!important;}\nhtml.wzg-ready #tab-speed #wzg-speed-controls .wzg-speed-state{width:auto!important;min-width:0!important;padding:6px 10px!important;}\nhtml.wzg-ready #tab-speed #wzg-speed-controls .wzg-speed-form{display:grid!important;grid-template-columns:minmax(0,1fr) auto auto!important;gap:10px!important;}\nhtml.wzg-ready #tab-speed #wzg-speed-controls #wzg-speed-number{height:44px!important;font-size:15px!important;padding:10px 14px!important;}\nhtml.wzg-ready #tab-speed #wzg-speed-controls .wzg-speed-form button{height:44px!important;padding:8px 18px!important;}\nhtml.wzg-ready #tab-speed #wzg-speed-controls .wzg-speed-presets{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:10px!important;}\nhtml.wzg-ready #tab-speed #wzg-speed-controls .wzg-speed-presets button{width:100%!important;height:42px!important;font-size:12px!important;}\n.wzg-speed-limits{display:flex;justify-content:space-between;color:#9696a3;font-size:10px;margin-top:-14px;}\n@media(max-width:580px){html.wzg-ready #tab-speed .wzg-speed-option{padding:16px!important;}html.wzg-ready #tab-speed #wzg-speed-controls .wzg-speed-surface{padding:16px!important;}html.wzg-ready #tab-speed #wzg-speed-controls #wzg-speed-readout{font-size:34px!important;}html.wzg-ready #tab-speed #wzg-speed-controls .wzg-speed-form{grid-template-columns:1fr 1fr!important;}html.wzg-ready #tab-speed #wzg-speed-controls #wzg-speed-number{grid-column:1/-1!important;}html.wzg-ready #tab-speed #wzg-speed-controls #wzg-speed-reset{grid-column:auto!important;}}\r\n" + "\n#tab-speed .wzg-speed-option{display:block!important;width:100%!important;padding:24px!important;border-radius:18px!important;background:linear-gradient(140deg,#ffffff05,transparent)!important;}\n#tab-speed #wzg-speed-controls{gap:24px!important;}#tab-speed #wzg-speed-controls .wzg-speed-surface{padding:26px!important;gap:22px!important;}\n#tab-speed #wzg-speed-controls #wzg-speed-readout{font-size:44px!important;}\n#tab-speed #wzg-speed-controls .wzg-speed-form{grid-template-columns:minmax(100px,1fr) auto auto!important;}\n#tab-speed #wzg-speed-controls .wzg-speed-presets button{height:40px!important;}\n#wzg-extra-options .wzg-grouped-feed{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:16px!important;padding:14px 0 0!important;margin:12px 0 0!important;background:none!important;border:0!important;border-top:1px solid #ffffff0c!important;border-radius:0!important;min-height:0!important;}\n#wzg-extra-options .wzg-grouped-feed .opL{flex:1;min-width:0;}#wzg-extra-options .wzg-grouped-feed .opR{width:auto!important;flex:none!important;}#wzg-extra-options .wzg-grouped-feed .opT{font-size:12px!important;}#wzg-extra-options .wzg-grouped-feed .hint{font-size:10px!important;line-height:1.5!important;}\n" + ".wzg-file-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.wzg-file-card{padding:24px;border:1px solid #ffffff12;border-radius:16px;background:linear-gradient(145deg,#ffffff06,transparent)}.wzg-file-kicker{font-size:9px;letter-spacing:.15em;color:#9999a4}.wzg-file-card h3{font-size:18px;margin:12px 0}.wzg-file-card p,.wzg-file-note{font-size:12px;line-height:1.7;color:#92929d}.wzg-file-card button,#tab-configfiles [data-reload]{padding:10px 16px;border:1px solid #ffffff21;border-radius:10px;background:#ffffff0d;color:#eee;cursor:pointer;margin-top:16px}#tab-configfiles [data-status]{font-size:12px;color:#d8d8e0}#wzg-speed-controls .wzg-speed-surface{background:linear-gradient(125deg,#ffffff06,#ffffff01)!important;padding:20px!important}#wzg-speed-controls .wzg-speed-head{padding-bottom:4px!important}#wzg-speed-controls .wzg-speed-meter{padding-bottom:12px;border-bottom:1px solid #ffffff0a}#wzg-speed-controls #wzg-speed-readout{font-size:32px!important;font-weight:600}#wzg-speed-controls .wzg-speed-presets{display:grid!important;grid-template-columns:repeat(5,1fr);gap:8px!important}#wzg-speed-controls .wzg-speed-presets button{height:34px!important}#wzg-speed-controls .switch{flex-shrink:0}#wzg-speed-controls #wzg-speed-range{accent-color:#d7d7e2}@media(max-width:650px){.wzg-file-grid{grid-template-columns:1fr}}\r\n" + "#wzg-speed-controls{gap:16px!important;}\n#wzg-speed-controls .wzg-speed-head{padding:0!important;gap:16px!important;}\n#wzg-speed-controls .wzg-speed-title strong{font-size:14px!important;}\n#wzg-speed-controls .wzg-speed-title small{font-size:11px!important;line-height:1.5!important;}\n#wzg-speed-controls .wzg-speed-surface{padding:16px!important;gap:14px!important;background:rgba(255,255,255,.025)!important;border-radius:14px!important;}\n#wzg-speed-controls .wzg-speed-meter{justify-content:flex-start!important;gap:10px!important;}\n#wzg-speed-controls .wzg-speed-meter>span{flex:1;}\n#wzg-speed-controls #wzg-speed-readout{font-size:25px!important;letter-spacing:-.04em;font-variant-numeric:tabular-nums;}\n#wzg-speed-controls .wzg-speed-state{font-size:9px;font-weight:600;letter-spacing:.06em;padding:5px 8px;border-radius:99px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);color:#9999a4;}\n#wzg-speed-controls[data-enabled=\"true\"] .wzg-speed-state{color:#c3ead6;border-color:#a6e0c02b;background:#a6e0c009;}\n#wzg-speed-controls .wzg-speed-form{grid-template-columns:minmax(90px,140px) auto 1fr!important;}\n#wzg-speed-controls #wzg-speed-reset{justify-self:end;background:transparent!important;border-color:transparent!important;color:#a0a0ab!important;}\n#wzg-speed-controls .wzg-speed-presets{display:flex!important;gap:6px!important;flex-wrap:wrap;}\n#wzg-speed-controls .wzg-speed-presets button{height:29px!important;min-width:48px;padding:4px 12px!important;border-radius:8px!important;background:transparent!important;border-color:#ffffff12!important;font-size:11px!important;}\n#wzg-speed-controls .wzg-speed-presets button.is-active{background:#ffffff13!important;border-color:#ffffff30!important;color:#fff!important;}\n#wzg-speed-controls #wzg-speed-status{font-size:11px!important;min-height:16px;}\n@media(max-width:500px){#wzg-speed-controls .wzg-speed-form{grid-template-columns:1fr auto!important;}#wzg-speed-controls #wzg-speed-number{grid-column:auto!important;}#wzg-speed-controls #wzg-speed-reset{grid-column:1/-1;justify-self:start;}}\r\n" + "/* Keep native result actions available even if the ad SDK hides their container. */\nhtml.wzg-ready #gameOver .watch-ad,\nhtml.wzg-ready #gameOver #result-watch-ad {display:none!important;}\nhtml.wzg-ready #gameOver .result-buttons,\nhtml.wzg-ready #gameOver .wz-go-actions .result-buttons {\n display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;\n visibility:visible!important;opacity:1!important;pointer-events:auto!important;\n width:100%!important;gap:8px!important;\n}\nhtml.wzg-ready #gameOver #result-continue,\nhtml.wzg-ready #gameOver #result-play-again {\n display:inline-flex!important;align-items:center!important;justify-content:center!important;\n visibility:visible!important;opacity:1!important;pointer-events:auto!important;\n min-width:0!important;\n}\r\n" + "\n#wzg-extra-options .wzg-organized-grid{align-items:start!important;gap:16px!important;}#wzg-extra-options .wzg-settings-stack{display:flex;flex-direction:column;gap:16px;min-width:0;}#wzg-extra-options .wzg-extra-card{height:auto!important;min-height:0!important;padding:18px!important;}#wzg-extra-options .wzg-extra-card>header{margin-bottom:14px!important;}@media(max-width:700px){#wzg-extra-options .wzg-organized-grid{grid-template-columns:minmax(0,1fr)!important;}}\n" + "html.wzg-ready .pizza-respawn-picker .vip-a {\n position:absolute!important;left:50%!important;right:auto!important;top:5px!important;bottom:auto!important;\n transform:translateX(-50%)!important;margin:0!important;float:none!important;\n width:max-content!important;min-width:0!important;height:auto!important;line-height:1!important;\n display:inline-flex!important;align-items:center!important;justify-content:center!important;padding:3px 6px!important;\n}\nins.adsbygoogle,iframe[id^=\"google_ads_iframe\"],iframe[id^=\"aswift_\"],iframe[id^=\"google_vignette\"],#google_vignette,\niframe[src*=\"googleads.g.doubleclick.net\"],iframe[src*=\"pagead2.googlesyndication.com\"] {display:none!important;pointer-events:none!important;}\r\n";
    document.head.appendChild(style);
  }

  const DESKTOP_MQ = PAGE.matchMedia('(min-width: 901px)');
  function injectSwapStyle() {
    if (document.getElementById(`${ID}-swap-style`)) return;
    const style = document.createElement('style');
    style.id = `${ID}-swap-style`;
    style.textContent = `
    html.wzg-ready.wzg-swap .shell { grid-template-columns: 270px minmax(0, 1fr) 280px !important; }
    @media (max-width: 1120px) { html.wzg-ready.wzg-swap .shell { grid-template-columns: 220px minmax(300px, 1fr) 230px !important; } }

    /* ESQUERDA: logo + salas */
    html.wzg-ready.wzg-swap .shell > .panel:first-child { overflow: hidden !important; }
    html.wzg-ready.wzg-swap .shell > .panel:first-child .logo-item { display: none !important; }
    html.wzg-ready.wzg-swap .shell > .panel:first-child { gap: 0 !important; }
    html.wzg-ready.wzg-swap .shell > .panel:first-child > .wzg-rooms-head + .center-bottom { box-sizing: border-box !important; align-self: stretch !important; width: 100% !important; margin-top: 0 !important; border-top: 0 !important; border-top-left-radius: 0 !important; border-top-right-radius: 0 !important; }
    html.wzg-ready.wzg-swap .shell > .panel:first-child .logo-item img { width: auto !important; max-width: 100% !important; max-height: 104px !important; }
    html.wzg-ready.wzg-swap .shell > .panel:first-child > .center-bottom {
      flex: 0 1 auto !important; min-height: 0 !important; margin: 0 !important; padding: 10px 10px 16px !important;
      display: flex !important; flex-direction: column !important; overflow: hidden !important;
    }
    html.wzg-ready.wzg-swap .shell > .panel:first-child > .center-bottom::before {
      content: 'Rooms'; margin: 0 4px 9px; color: var(--wzg-faint); font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
    }
    html.wzg-ready.wzg-swap .center-bottom .home-center-server-map { flex: 0 0 auto !important; margin-bottom: 9px !important; }
    html.wzg-ready.wzg-swap .center-bottom .server-map { min-height: 32px !important; padding: 0 2px !important; font-size: 9px !important; line-height: 1.1 !important; text-align: center !important; }
    html.wzg-ready.wzg-swap .center-bottom .home-center-server-list { flex: 0 1 auto !important; min-height: 0 !important; overflow-y: auto !important; overflow-x: hidden !important; padding-right: 2px !important; }
    html.wzg-ready.wzg-swap .center-bottom .server-item {
      display: flex !important; flex-wrap: wrap !important; align-items: center !important; gap: 6px 8px !important;
      min-height: 0 !important; padding: 8px 10px !important; box-sizing: border-box !important; cursor: pointer;
    }
    html.wzg-ready.wzg-swap .center-bottom .server-item:hover { transform: none !important; background: rgba(255,255,255,.085) !important; }
    html.wzg-ready.wzg-swap .center-bottom .server-info { flex: 1 1 100% !important; min-width: 0 !important; width: 100% !important; order: 5 !important; gap: 5px !important; }
    html.wzg-ready.wzg-swap .center-bottom .server-online { justify-content: space-between !important; }

    /* CENTRO: sem a lista, centraliza skin + botões */
    html.wzg-ready.wzg-swap #centerPanel { grid-template-rows: auto !important; align-content: center !important; }
    html.wzg-ready.wzg-swap #centerPanel .home-center-skins { min-height: 0 !important; height: clamp(130px, 19vh, 165px) !important; max-height: 165px !important; }

    /* ---- Rooms estilo WormWorld ---- */
    html.wzg-ready.wzg-swap .shell > .panel:first-child > .center-bottom::before { content: none !important; display: none !important; }
    .wzg-rooms-head { display: none; }
    html.wzg-ready.wzg-swap .shell > .panel:first-child > .wzg-rooms-head {
      display: flex; align-items: center; justify-content: center; gap: 8px; flex: 0 0 auto;
      margin: 0 !important; padding: 8px 10px; border: 1px solid var(--wzg-line); border-bottom: 0 !important; border-radius: 13px 13px 0 0; background: rgba(255,255,255,.07); box-sizing: border-box; align-self: stretch; width: 100%;
    }
    .wzg-rooms-head img { height: 26px; width: auto; max-width: 70px; object-fit: contain; }
    .wzg-rooms-head span { color: var(--wzg-text); font-size: 13px; font-weight: 800; letter-spacing: .02em; white-space: nowrap; }
    html.wzg-ready.wzg-swap .center-bottom .home-center-server-map { gap: 6px !important; padding: 6px !important; }
    html.wzg-ready.wzg-swap .center-bottom .server-map {
      font-size: 0 !important; color: transparent !important; min-height: 38px !important;
      background-color: transparent !important; background-image: var(--wzg-flag) !important;
      background-repeat: no-repeat !important; background-position: center !important; background-size: 36px 24px !important;
      border: 2px solid transparent !important; border-radius: 6px !important; opacity: .65;
    }
    html.wzg-ready.wzg-swap .center-bottom .server-map:hover { opacity: 1; }
    html.wzg-ready.wzg-swap .center-bottom .server-map.active { opacity: 1; border-color: rgba(255,255,255,.85) !important; }
    html.wzg-ready.wzg-swap .center-bottom .server-item {
      position: relative !important; display: block !important; min-height: 38px !important; margin: 0 !important; padding: 0 44px 0 6px !important;
      border: 0 !important; border-bottom: 1px solid var(--wzg-line) !important; border-radius: 0 !important; background: transparent !important;
      line-height: 38px !important; cursor: pointer;
    }
    html.wzg-ready.wzg-swap .center-bottom .server-item > * { display: none !important; }
    html.wzg-ready.wzg-swap .center-bottom .server-item::before {
      content: attr(data-wzg-label); color: var(--wzg-text); font-size: 15px; font-weight: 700; letter-spacing: .04em;
    }
    html.wzg-ready.wzg-swap .center-bottom .server-item::after {
      content: ''; position: absolute; right: 6px; top: 50%; width: 30px; height: 20px; transform: translateY(-50%);
      background: var(--wzg-flag) center / cover no-repeat; border-radius: 3px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.35);
    }
    html.wzg-ready.wzg-swap .center-bottom .server-item:hover { background: rgba(255,255,255,.09) !important; transform: none !important; }
    /* ---- Centro: conteúdo no topo + navegação embaixo (direita) ---- */
    html.wzg-ready.wzg-swap #centerPanel { grid-template-rows: auto auto !important; align-content: start !important; padding-top: 8px !important; gap: 14px !important; }
    html.wzg-ready.wzg-swap #centerPanel > #wzg-sidebar {
      flex: none !important; margin: 6px 0 0 !important; padding: 12px 0 0 !important; border-top: 1px solid var(--wzg-line);
      justify-self: end; width: min(460px, 100%); display: flex; flex-direction: column;
    }
    html.wzg-ready.wzg-swap #centerPanel > #wzg-sidebar .wzg-nav { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
    html.wzg-ready.wzg-swap #centerPanel > #wzg-sidebar .wzg-nav-spacer { display: none; }
    html.wzg-ready.wzg-swap #centerPanel > #wzg-sidebar .wzg-tools { margin-top: 10px; }
    /* ---- Acabamento: navegação alinhada com a caixa da skin ---- */
    html.wzg-ready.wzg-swap #centerPanel > #wzg-sidebar { justify-self: stretch !important; width: 100% !important; max-width: none !important; margin-top: 4px !important; padding: 14px !important; border: 1px solid var(--wzg-line) !important; border-radius: 14px; background: rgba(0,0,0,.12); box-sizing: border-box; }
    html.wzg-ready.wzg-swap #centerPanel > #wzg-sidebar .wzg-kicker { margin: 0 4px 10px !important; }
    html.wzg-ready.wzg-swap #centerPanel > #wzg-sidebar .wzg-nav { gap: 6px !important; }
    html.wzg-ready.wzg-swap #centerPanel > #wzg-sidebar .wzg-nav-btn { justify-content: flex-start; padding: 0 14px !important; background: rgba(255,255,255,.03); border-color: var(--wzg-line); }
    html.wzg-ready.wzg-swap #centerPanel > #wzg-sidebar .wzg-nav-btn:hover { transform: none !important; background: rgba(255,255,255,.09); }
    html.wzg-ready.wzg-swap #centerPanel > #wzg-sidebar .wzg-tools { margin-top: 10px !important; padding-top: 10px !important; }
    /* DIREITA: card do jogador + navegação */
    html.wzg-ready.wzg-swap .shell > .panel:last-child { flex-direction: column !important; align-items: stretch !important; justify-content: flex-start !important; }
    html.wzg-ready.wzg-swap .shell > .panel:last-child > .player-card { max-width: none !important; flex: 0 0 auto !important; }
    html.wzg-ready.wzg-swap .shell > .panel:last-child > #wzg-sidebar { flex: 0 0 auto !important; margin-top: 14px !important; padding-top: 14px; border-top: 1px solid var(--wzg-line); }
    /* Logo do Wormzilla no espaco livre acima da coluna central */
    html.wzg-ready.wzg-swap #centerPanel { position: relative !important; }
    #wzg-top-logo { display: none; }
    html.wzg-ready.wzg-swap #wzg-top-logo {
      display: flex; position: absolute; top: var(--wzg-logo-top, 0px); left: 0; right: 0; height: calc(var(--wzg-top-gap, 0px) - var(--wzg-logo-top, 0px));
      align-items: center; justify-content: center; pointer-events: none; z-index: 1; box-sizing: border-box; padding: 0;
    }
    #wzg-top-logo img { height: calc(var(--wzg-top-gap, 0px) - var(--wzg-logo-top, 0px) - 4px); max-width: 85%; width: auto; object-fit: contain; filter: drop-shadow(0 3px 12px rgba(0,0,0,.55)); }
`;
    document.head.appendChild(style);
  }
  function mountSwappedLayout() {
    const left = document.querySelector('.shell > .panel:first-child');
    const right = document.querySelector('.shell > .panel:last-child');
    const center = document.getElementById('centerPanel');
    if (!left || !right || !center) return;
    const rooms = document.querySelector('.center-bottom');
    const nav = document.getElementById(`${ID}-sidebar`);
    const root = document.documentElement;
    if (DESKTOP_MQ.matches) {
      if (rooms && rooms.parentElement !== left) left.appendChild(rooms);
      if (nav && nav.parentElement !== center) center.appendChild(nav);
      root.classList.add('wzg-swap');
    } else {
      if (rooms && rooms.parentElement !== center) center.appendChild(rooms);
      if (nav && nav.parentElement !== left) left.insertBefore(nav, left.querySelector('#manualInfoBox'));
      root.classList.remove('wzg-swap');
    }
  }

  const wzgFlag = inner => "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 20'><defs><clipPath id='c'><rect width='30' height='20' rx='2.6'/></clipPath></defs><g clip-path='url(#c)'>" + inner + "</g><rect x='.6' y='.6' width='28.8' height='18.8' rx='2.1' fill='none' stroke='#fff' stroke-opacity='.45' stroke-width='1.2'/></svg>";
  const WZG_FLAG_SVG = {
    fr: wzgFlag("<rect width='10' height='20' fill='#0055a4'/><rect x='10' width='10' height='20' fill='#fff'/><rect x='20' width='10' height='20' fill='#ef4135'/>"),
    sg: wzgFlag("<rect width='30' height='10' fill='#ef3340'/><rect y='10' width='30' height='10' fill='#fff'/><circle cx='7' cy='5' r='3.4' fill='#fff'/><circle cx='8.5' cy='5' r='3' fill='#ef3340'/><g fill='#fff'><circle cx='11.5' cy='2.8' r='.7'/><circle cx='13.6' cy='4.6' r='.7'/><circle cx='12.8' cy='7.2' r='.7'/><circle cx='10' cy='7.2' r='.7'/><circle cx='9.4' cy='4.4' r='.7'/></g>"),
    br: wzgFlag("<rect width='30' height='20' fill='#009c3b'/><polygon points='15,2.4 27.45,10 15,17.6 2.55,10' fill='#ffdf00'/><circle cx='15' cy='10' r='5' fill='#002776'/><clipPath id='g'><circle cx='15' cy='10' r='5'/></clipPath><path d='M9.4 9.4Q15 7.2 20.6 12.2' stroke='#fff' stroke-width='1.1' fill='none' clip-path='url(#g)'/><g fill='#fff'><circle cx='12.3' cy='12.4' r='.3'/><circle cx='14' cy='13.4' r='.3'/><circle cx='16.6' cy='12.8' r='.3'/><circle cx='17.4' cy='11.2' r='.3'/><circle cx='13' cy='8.2' r='.3'/><circle cx='16.2' cy='8.6' r='.3'/><circle cx='15' cy='11.2' r='.3'/></g>")
  };
  const WZG_COUNTRY = { france:'FR', singapore:'SG', brazil:'BR', germany:'DE', japan:'JP', australia:'AU', canada:'CA', mexico:'MX', 'united states':'US', usa:'US', uae:'AE', 'united arab emirates':'AE' };
  const wzgFlagURL = key => `url("data:image/svg+xml,${encodeURIComponent(WZG_FLAG_SVG[key])}")`;
  function decorateRooms() {
    const box = document.querySelector('.center-bottom');
    if (!box) return;
    let head = document.querySelector('.wzg-rooms-head');
    if (!head) {
      head = document.createElement('div');
      head.className = 'wzg-rooms-head';
      head.innerHTML = '<img alt="" decoding="async"><span>Wormzilla.io Rooms</span>';
    }
    const logo = document.querySelector('.logo-item img');
    const headImg = head.querySelector('img');
    if (logo && headImg && !headImg.src) headImg.src = logo.currentSrc || logo.src;
    if (box.parentElement && head.nextElementSibling !== box) box.parentElement.insertBefore(head, box);
    const centerEl = document.getElementById('centerPanel');
    if (centerEl) {
      let top = document.getElementById('wzg-top-logo');
      if (!top) {
        top = document.createElement('div');
        top.id = 'wzg-top-logo';
        top.setAttribute('aria-hidden', 'true');
        top.innerHTML = '<img alt="" decoding="async">';
        centerEl.appendChild(top);
      }
      const topImg = top.querySelector('img');
      const srcNow = headImg && headImg.src;
      if (topImg && srcNow && topImg.src !== srcNow) topImg.src = srcNow;
    }
    mountHudConfButton(box);
    box.querySelectorAll('.server-map').forEach(tab => {
      if (tab.dataset.wzgFlag) return;
      const text = (tab.textContent || '').toLowerCase();
      const key = text.includes('europe') ? 'fr' : text.includes('asia') ? 'sg' : (text.includes('south') || text.includes('america')) ? 'br' : '';
      if (!key) return;
      tab.dataset.wzgFlag = key;
      tab.style.setProperty('--wzg-flag', wzgFlagURL(key));
      tab.title = key === 'fr' ? 'France / Europe' : key === 'sg' ? 'Singapore / Asia' : 'Brazil / South America';
    });
    box.querySelectorAll('.server-item').forEach(item => {
      const nameNode = item.querySelector('.server-name, .server-city');
      const raw = (nameNode?.textContent || '').trim();
      if (raw) {
        const m = /^(.*?)[\s-]*(\d+)\s*$/.exec(raw);
        const country = (m ? m[1] : raw).trim();
        const code = WZG_COUNTRY[country.toLowerCase()] || country.slice(0, 2).toUpperCase();
        const label = m ? `${String(m[2]).padStart(2, '0')} ${code}` : `${code}`;
        if (item.dataset.wzgLabel !== label) item.dataset.wzgLabel = label;
      }
      const img = item.querySelector('img');
      const src = img && (img.currentSrc || img.src);
      if (src && item.dataset.wzgFlagSrc !== src) {
        item.dataset.wzgFlagSrc = src;
        item.style.setProperty('--wzg-flag', `url("${src}")`);
      }
    });
  }

  function triggerOriginal(selector) {
    document.querySelector(`header ${selector}`)?.click();
  }


  function injectPatchStyle() {
    if (document.getElementById('wzg-patch-style')) return;
    installColorPicker();
    if (!document.getElementById('wzg-sk-font')) {
      const fl = document.createElement('link');
      fl.id = 'wzg-sk-font'; fl.rel = 'stylesheet'; fl.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&display=swap';
      (document.head || document.documentElement).appendChild(fl);
    }
    const style = document.createElement('style');
    style.id = 'wzg-patch-style';
    style.textContent = `
    /* linha separando o titulo do card das opcoes (todos os cards abertos) */
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-card.wzg-open > header { border-bottom: 1px solid var(--wzg-line) !important; }
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-card.wzg-open > header + * { border-top: 0 !important; }
    html.wzg-ready #wzg-home-options #wzg-extra-options .wzg-extra-card.wzg-open > header + * > .wzg-extra-toggle:first-child { border-top: 0 !important; }
    /* mobile: scrollbars internas nao invadem mais os cards (o toque continua rolando normal) */
    @media (max-width: 900px), (pointer: coarse) {
      html.wzg-ready body #centerPanel,
      html.wzg-ready body .shell > .panel,
      html.wzg-ready body .home-center-server-list,
      html.wzg-ready body .center-bottom,
      html.wzg-ready body .wzg-extra-card { scrollbar-width: none !important; -ms-overflow-style: none !important; }
      html.wzg-ready body #centerPanel::-webkit-scrollbar,
      html.wzg-ready body .shell > .panel::-webkit-scrollbar,
      html.wzg-ready body .home-center-server-list::-webkit-scrollbar,
      html.wzg-ready body .center-bottom::-webkit-scrollbar,
      html.wzg-ready body .wzg-extra-card::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      html.wzg-ready body #wzg-home-options { scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,.35) transparent !important; padding-right: 10px !important; scrollbar-gutter: stable; }
      html.wzg-ready body #wzg-home-options::-webkit-scrollbar { display: block !important; width: 5px !important; }
      html.wzg-ready body #wzg-home-options::-webkit-scrollbar-track { background: transparent !important; }
      html.wzg-ready body #wzg-home-options::-webkit-scrollbar-thumb { background: rgba(255,255,255,.35) !important; border-radius: 3px; }
    }
    /* celular: sem a logo grande no topo, o resto sobe */
    html.wzg-ready.wzg-mobile-device #wzg-top-logo { display: none !important; }
    /* botao do editor de HUD */
    #wzg-hudconf-btn { box-sizing: border-box; width: 100%; flex: 0 0 auto; align-self: stretch; margin: 10px 0 0; min-height: 44px; padding: 0 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; border: 1px solid var(--wzg-line); border-radius: 12px; background: var(--wzg-soft); color: var(--wzg-text); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; text-align: left; }
    #wzg-hudconf-btn:hover { background: var(--wzg-soft-hover, rgba(255,255,255,.1)); }
    #wzg-hudconf-btn span { display: flex; align-items: center; gap: 10px; }
    #wzg-hudconf-btn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    #wzg-hudconf-btn small { color: var(--wzg-faint); font-size: 10px; font-weight: 600; }
    /* editor de HUD */
    #wzg-hud-editor { position: fixed; inset: 0; z-index: 2147483000; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; background: #05070a url('https://wormzilla.io/bgs/bg_default.webp') center / cover no-repeat; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
    #wzg-hud-editor::before { content: ''; position: absolute; inset: 0; background: rgba(0,0,0,.35); pointer-events: none; }
    #wzg-hud-editor .wzg-he-bar { position: absolute; z-index: 8; left: 50%; top: max(8px, env(safe-area-inset-top)); transform: translateX(-50%); display: flex; align-items: center; gap: 6px; padding: 6px; border: 1px solid rgba(255,255,255,.16); border-radius: 12px; background: rgba(14,14,17,.9); backdrop-filter: blur(8px); }
    #wzg-hud-editor .wzg-he-bar b { padding: 0 8px; color: #fff; font-size: 12px; letter-spacing: .04em; white-space: nowrap; }
    #wzg-hud-editor button { font: inherit; touch-action: manipulation; cursor: pointer; }
    #wzg-hud-editor .wzg-he-bar button { min-height: 34px; padding: 0 12px; border: 1px solid rgba(255,255,255,.16); border-radius: 9px; background: rgba(255,255,255,.07); color: #fff; font-size: 12px; font-weight: 700; }
    #wzg-hud-editor .wzg-he-bar button.is-primary { background: #fff; color: #111; border-color: #fff; }
    #wzg-hud-editor .wzg-he-bar button.is-on { background: rgba(246,162,29,.25); border-color: #f6a21d; }
    #wzg-hud-editor .wzg-he-hint { position: absolute; z-index: 5; left: 50%; bottom: max(10px, env(safe-area-inset-bottom)); transform: translateX(-50%); max-width: 92vw; padding: 7px 12px; border-radius: 9px; background: rgba(14,14,17,.82); color: rgba(255,255,255,.78); font-size: 11px; text-align: center; pointer-events: none; }
    #wzg-hud-editor .wzg-he-block { position: absolute; z-index: 2; box-sizing: border-box; border: 1.5px dashed rgba(255,255,255,.55); border-radius: 10px; background: rgba(10,12,14,.5); color: #fff; cursor: grab; touch-action: none; overflow: hidden; }
    #wzg-hud-editor .wzg-he-block.is-drag { cursor: grabbing; border-style: solid; border-color: #f6a21d; background: rgba(40,28,8,.7); z-index: 4; }
    #wzg-hud-editor .wzg-he-block.is-moved { border-color: rgba(246,162,29,.85); }
    #wzg-hud-editor .wzg-he-tag { position: absolute; left: 5px; top: 3px; z-index: 2; font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #f6a21d; text-shadow: 0 1px 2px #000; pointer-events: none; white-space: nowrap; }
    #wzg-hud-editor .wzg-he-circle { position: absolute; top: 0; border-radius: 50%; border: 1px solid #f6a21d; background: radial-gradient(circle, rgba(70,80,60,.75) 0 62%, rgba(20,24,18,.8) 63% 100%); }
    #wzg-hud-editor .wzg-he-circle::before, #wzg-hud-editor .wzg-he-circle::after { content: ''; position: absolute; background: rgba(246,162,29,.8); }
    #wzg-hud-editor .wzg-he-circle::before { left: 50%; top: 8%; bottom: 8%; width: 1px; }
    #wzg-hud-editor .wzg-he-circle::after { top: 50%; left: 8%; right: 8%; height: 1px; }
    #wzg-hud-editor .wzg-he-counters { position: absolute; left: 0; right: 0; bottom: 4px; text-align: center; color: #e8d21a; font-size: 11px; font-weight: 800; letter-spacing: .04em; text-shadow: 0 1px 2px #000; }
    #wzg-hud-editor .wzg-he-rows { position: absolute; left: 8px; right: 8px; top: 18px; bottom: 6px; background: repeating-linear-gradient(to bottom, rgba(255,255,255,.55) 0 3px, transparent 3px 11px); border-radius: 2px; opacity: .7; }
    #wzg-hud-editor .wzg-he-icons { position: absolute; left: 6px; right: 6px; top: 18px; bottom: 6px; background: repeating-linear-gradient(to right, rgba(255,255,255,.4) 0 26px, transparent 26px 34px); border-radius: 6px; opacity: .75; }
    #wzg-hud-editor .wzg-he-modeic { position: absolute; left: 50%; top: 58%; width: 40%; height: 28%; transform: translate(-50%,-50%); border: 2px solid #f6a21d; border-radius: 40% 40% 12px 12px; }
    #wzg-hud-editor .wzg-he-slider { position: absolute; left: 50%; top: 22px; bottom: 10px; width: 6px; transform: translateX(-50%); border-radius: 4px; background: rgba(255,255,255,.35); }
    #wzg-hud-editor .wzg-he-slider::after { content: ''; position: absolute; left: 50%; top: 60%; width: 16px; height: 16px; transform: translate(-50%,-50%); border-radius: 50%; background: #fff; }
    #wzg-hud-editor .wzg-he-sheet { position: absolute; z-index: 7; right: 8px; top: calc(max(8px, env(safe-area-inset-top)) + 52px); bottom: 8px; width: min(330px, calc(100vw - 16px)); overflow: hidden; padding: 0; flex-direction: column; border: 1px solid rgba(255,255,255,.16); border-radius: 14px; background: rgba(14,14,17,.95); color: #fff; touch-action: pan-y; display: none; }
    #wzg-hud-editor .wzg-he-sheet.is-open { display: flex; }
    #wzg-hud-editor .wzg-he-sheet h4 { margin: 0 0 4px; font-size: 13px; }
    #wzg-hud-editor .wzg-he-sheet p { margin: 0 0 10px; color: rgba(255,255,255,.6); font-size: 11px; line-height: 1.4; }
    #wzg-hud-editor .wzg-he-sec { margin: 12px 0 6px; color: rgba(255,255,255,.5); font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    #wzg-hud-editor .wzg-he-seg { display: flex; gap: 6px; }
    #wzg-hud-editor .wzg-he-seg button, #wzg-hud-editor .wzg-he-sheet select, #wzg-hud-editor .wzg-he-link { min-height: 34px; padding: 0 10px; border: 1px solid rgba(255,255,255,.16); border-radius: 9px; background: rgba(255,255,255,.07); color: #fff; font-size: 12px; font-weight: 700; }
    #wzg-hud-editor .wzg-he-seg button { flex: 1; }
    #wzg-hud-editor .wzg-he-seg button.is-on { background: #fff; color: #111; border-color: #fff; }
    #wzg-hud-editor .wzg-he-sheet select { width: 100%; }
    #wzg-hud-editor .wzg-he-row { display: flex; align-items: center; gap: 8px; padding: 7px 8px; margin-bottom: 6px; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; background: rgba(255,255,255,.04); }
    #wzg-hud-editor .wzg-he-row.is-off { opacity: .45; }
    #wzg-hud-editor .wzg-he-row .g { flex: 0 0 34px; height: 34px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.2); border-radius: 10px; background: rgba(30,30,38,.8); }
    #wzg-hud-editor .wzg-he-row .g svg { width: 18px; height: 18px; fill: none; stroke: #e1e1e8; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    #wzg-hud-editor .wzg-he-row .t { flex: 1; min-width: 0; }
    #wzg-hud-editor .wzg-he-row .t b { display: block; font-size: 12px; }
    #wzg-hud-editor .wzg-he-row .t small { display: block; color: rgba(255,255,255,.6); font-size: 10px; line-height: 1.3; }
    #wzg-hud-editor .wzg-he-row input[type=checkbox] { width: 20px; height: 20px; accent-color: #f6a21d; }
    #wzg-hud-editor .wzg-he-row .mv { display: flex; flex-direction: column; gap: 2px; }
    #wzg-hud-editor .wzg-he-row .mv button { width: 26px; height: 18px; padding: 0; border: 1px solid rgba(255,255,255,.16); border-radius: 5px; background: rgba(255,255,255,.07); color: #fff; font-size: 9px; line-height: 1; }
    #wzg-hud-editor .wzg-he-link { width: 100%; margin-top: 6px; }
    #wzg-hud-editor .wzg-he-tb { border-style: dashed; border-radius: 12px; background: rgba(22,22,29,.55); overflow: hidden; }
    #wzg-hud-editor .wzg-he-tb .tbi { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
    #wzg-hud-editor .wzg-he-tb .b { position: absolute; width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.2); border-radius: 12px; background: rgba(30,30,38,.9); }
    #wzg-hud-editor .wzg-he-tb .b svg { width: 20px; height: 20px; fill: none; stroke: #e1e1e8; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    #wzg-hud-editor .wzg-he-rng { display: block; margin: 0 0 8px; }
    #wzg-hud-editor .wzg-he-rng span { display: flex; justify-content: space-between; font-size: 11px; color: rgba(255,255,255,.75); margin-bottom: 2px; }
    #wzg-hud-editor .wzg-he-rng input { width: 100%; accent-color: #f6a21d; touch-action: pan-x; }
    #wzg-hud-editor .wzg-he-sh-head { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px 8px; border-bottom: 1px solid rgba(255,255,255,.12); }
    #wzg-hud-editor .wzg-he-sh-head h4 { margin: 0; }
    #wzg-hud-editor .wzg-he-x { min-height: 30px; padding: 0 10px; border: 1px solid rgba(255,255,255,.2); border-radius: 9px; background: rgba(255,255,255,.1); color: #fff; font-size: 12px; font-weight: 700; }
    #wzg-hud-editor .wzg-he-sheet-in { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 10px 12px 12px; margin: 6px 4px 8px 0; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.3) transparent; }
    #wzg-hud-editor .wzg-he-sheet-in::-webkit-scrollbar { width: 6px; }
    #wzg-hud-editor .wzg-he-sheet-in::-webkit-scrollbar-thumb { background: rgba(255,255,255,.3); border-radius: 3px; }
    #wzg-hud-editor .wzg-he-bar button:disabled { opacity: .4; cursor: default; }
    #wzg-hud-editor .wzg-he-bar { max-width: calc(100vw - 16px); flex-wrap: wrap; justify-content: center; }
    @media (max-width: 480px) { #wzg-hud-editor .wzg-he-bar b { display: none; } }
    /* ===== Settings no estilo Skinny Lib (preto e branco, linhas, sem cards pesados) ===== */
    html.wzg-ready body .settings-modal, html.wzg-ready body .settings-modal * { font-family: Montserrat, "Segoe UI", system-ui, sans-serif !important; }
    html.wzg-ready body .settings-overlay { background: rgba(0,0,0,.55) !important; backdrop-filter: blur(5px) !important; -webkit-backdrop-filter: blur(5px) !important; }
    html.wzg-ready body .settings-modal { border-radius: 10px !important; border: 1px solid #1e1e1e !important; background: #0b0b0b !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
      box-shadow: 0 0 0 1px rgba(255,255,255,.015), 0 0 38px 4px rgba(0,0,0,.6), 0 0 110px 28px rgba(0,0,0,.5), 0 34px 90px rgba(0,0,0,.45) !important; }
    /* topbar */
    html.wzg-ready body .settings-head { min-height: 46px !important; padding: 0 12px 0 14px !important; grid-template-columns: 30px minmax(0,1fr) auto !important; gap: 10px !important; background: #0e0e0e !important; border-bottom: 1px solid #2e2e2e !important; }
    html.wzg-ready body .settings-head h3 { display: flex !important; align-items: baseline !important; gap: 8px !important; font-size: 14px !important; font-weight: 600 !important; letter-spacing: 0 !important; color: #cfcfcf !important; }
    html.wzg-ready body .settings-head h3::after { font-size: 9.5px !important; font-weight: 500 !important; color: #6e6e6e !important; letter-spacing: 0 !important; }
    html.wzg-ready body #settings-close { width: 30px !important; height: 30px !important; border: 0 !important; border-radius: 7px !important; background: transparent !important; color: #6e6e6e !important; }
    html.wzg-ready body #settings-close:hover { background: #151515 !important; color: #cfcfcf !important; }
    html.wzg-ready body #settings-close svg { width: 16px; height: 16px; }
    html.wzg-ready body .settings-head .vip-pill { min-height: 22px !important; padding: 0 9px !important; border: 1px solid #2e2e2e !important; border-radius: 99px !important; background: transparent !important; color: #9b9b9b !important; font-size: 9px !important; letter-spacing: .08em !important; }
    /* lateral: so texto + icone, sem caixas. aba ativa ganha um tracinho que brilha */
    html.wzg-ready body #settings-tabs { background: transparent !important; scrollbar-width: none !important; }
    html.wzg-ready body #settings-tabs::-webkit-scrollbar { display: none !important; }
    html.wzg-ready body #settings-tabs::before { margin: 0 0 6px !important; color: #3d3d3d !important; font-size: 9.5px !important; font-weight: 600 !important; letter-spacing: .12em !important; }
    html.wzg-ready body #settings-tabs .tab { position: relative !important; min-height: 0 !important; padding: 8px 0 !important; gap: 9px !important; border: 0 !important; border-radius: 0 !important; background: transparent !important; box-shadow: none !important; color: #6e6e6e !important; font-size: 12.5px !important; font-weight: 500 !important; letter-spacing: 0 !important; transition: color .22s ease !important; }
    html.wzg-ready body #settings-tabs .tab:hover { color: #cfcfcf !important; background: transparent !important; }
    html.wzg-ready body #settings-tabs .tab.active { color: #cfcfcf !important; background: transparent !important; border: 0 !important; box-shadow: none !important; }
    html.wzg-ready body #settings-tabs .tab svg { width: 15px; height: 15px; }
    html.wzg-ready body #settings-tabs .tab::before { display: none !important; }
    html.wzg-ready body #settings-tabs .tab::after { content: '' !important; display: block !important; position: absolute; left: -12px; top: 50%; width: 3px; height: 0; margin: 0; border-radius: 3px; background: #cfcfcf; opacity: 0; transform: translateY(-50%);
      box-shadow: 0 0 3px rgba(255,255,255,.22), 0 0 10px 1px rgba(255,255,255,.08), 0 0 22px 4px rgba(255,255,255,.03); transition: height .85s cubic-bezier(.22,1,.36,1), opacity .85s cubic-bezier(.22,1,.36,1); }
    html.wzg-ready body #settings-tabs .tab.active::after { height: 18px; opacity: 1; }
    @media (min-width: 621px) {
      html.wzg-ready body .settings-modal { grid-template-rows: 46px minmax(0,1fr) !important; }
      html.wzg-ready body #settings-tabs { padding: 18px 14px 14px 22px !important; gap: 4px !important; border-right: 0 !important; }
    }
    @media (max-width: 620px) {
      html.wzg-ready body #settings-tabs .tab { border-radius: 8px !important; }
      html.wzg-ready body #settings-tabs .tab.active { background: #151515 !important; }
      html.wzg-ready body #settings-tabs .tab::after { display: none !important; }
    }
    /* conteudo: titulo simples, lista de linhas, scroll escondido */
    html.wzg-ready body .settings-body { padding: 18px 22px !important; scrollbar-width: none !important; }
    html.wzg-ready body .settings-body::-webkit-scrollbar { display: none !important; }
    html.wzg-ready body .settings-body .sectionS.active { grid-template-columns: 1fr !important; gap: 8px !important; }
    html.wzg-ready body .wzg-settings-intro { min-height: 0 !important; margin: 0 0 6px !important; padding: 0 0 10px !important; border-bottom: 1px solid #1e1e1e !important; align-items: center !important; }
    html.wzg-ready body .wzg-settings-intro strong { font-size: 15px !important; font-weight: 500 !important; letter-spacing: 0 !important; color: #cfcfcf !important; }
    html.wzg-ready body .wzg-settings-intro span { margin-top: 3px !important; font-size: 11px !important; color: #6e6e6e !important; }
    html.wzg-ready body .wzg-settings-intro b { padding: 3px 8px; border: 1px solid #2e2e2e; border-radius: 99px; background: transparent; color: #6e6e6e !important; font-size: 9px !important; }
    /* cada opcao vira uma linha: [nome + descricao] ...... [controle] */
    html.wzg-ready body .settings-body .opt { display: flex !important; flex-wrap: wrap !important; align-items: center !important; justify-content: space-between !important; gap: 10px 16px !important; min-height: 52px !important; padding: 10px 14px !important; border: 1px solid #1e1e1e !important; border-radius: 8px !important; background: #0e0e0e !important; box-shadow: none !important; }
    html.wzg-ready body .settings-body .opt:hover { border-color: #2e2e2e !important; background: #0e0e0e !important; }
    html.wzg-ready body .settings-body .opL { flex: 1 1 200px !important; order: 1; }
    html.wzg-ready body .settings-body .opT { font-size: 12.5px !important; font-weight: 500 !important; letter-spacing: 0 !important; color: #cfcfcf !important; }
    html.wzg-ready body .settings-body .hint { margin-top: 2px !important; font-size: 11px !important; color: #6e6e6e !important; line-height: 1.4 !important; }
    html.wzg-ready body .settings-body .opR { order: 3; flex: 0 1 280px !important; width: auto !important; min-height: 0 !important; justify-content: flex-end !important; }
    html.wzg-ready body .settings-body .opR:has(input[type="color"]) { flex-basis: 140px !important; }
    html.wzg-ready body .settings-body .opR:has(input[type="color"]) { display: grid !important; grid-template-columns: minmax(0,1fr) minmax(0,1fr) !important; align-items: center !important; gap: 8px !important; flex: 0 1 140px !important; width: 140px !important; max-width: 100% !important; min-width: 0 !important; box-sizing: border-box !important; }
    html.wzg-ready body .settings-body .opR:has(input[type="color"]) > * { width: 100% !important; max-width: 100% !important; min-width: 0 !important; box-sizing: border-box !important; }
    html.wzg-ready body .settings-body .opR:has(input[type="color"]) .hex,
    html.wzg-ready body .settings-body .opR:has(input[type="color"]) .val,
    html.wzg-ready body .settings-body .opR:has(input[type="color"]) output { display: flex !important; align-items: center !important; justify-content: center !important; justify-self: stretch !important; align-self: center !important; height: 28px !important; min-height: 28px !important; margin: 0 !important; padding: 0 5px !important; line-height: 1 !important; text-align: center !important; font-variant-numeric: tabular-nums !important; white-space: nowrap !important; overflow: hidden !important; }
    html.wzg-ready body .settings-body .opR:has(input[type="color"]) input[type="text"] { height: 28px !important; min-height: 28px !important; margin: 0 !important; padding: 0 5px !important; line-height: 28px !important; text-align: center !important; font-variant-numeric: tabular-nums !important; overflow: hidden !important; text-overflow: clip !important; }
    html.wzg-ready body .settings-body .opR:has(.sliderWrap) { flex-basis: 320px !important; }
    html.wzg-ready body .settings-body .opR:has(.switch):not(:has(.field, select, .wzg-select)) { flex: 0 0 auto !important; }
    html.wzg-ready body .settings-body .vip-a { position: static !important; order: 2; min-width: 0 !important; min-height: 18px !important; padding: 0 7px !important; border: 1px solid #2e2e2e !important; background: transparent !important; color: #9b9b9b !important; font-size: 8.5px !important; letter-spacing: .08em !important; }
    /* campos em pilula */
    html.wzg-ready body .settings-body .field,
    html.wzg-ready body .settings-body select,
    html.wzg-ready body .settings-body input[type="text"],
    html.wzg-ready body .settings-body input[type="number"] { height: 34px !important; min-height: 34px !important; border-radius: 8px !important; background-color: #1b1b1b !important; border: 1px solid #2e2e2e !important; color: #cfcfcf !important; font-size: 12px !important; font-weight: 500 !important; box-shadow: none !important; transition: border-color .22s ease !important; }
    html.wzg-ready body .settings-body .field:hover,
    html.wzg-ready body .settings-body select:hover,
    html.wzg-ready body .settings-body input[type="text"]:hover,
    html.wzg-ready body .settings-body input[type="number"]:hover { border-color: #3d3d3d !important; }
    html.wzg-ready body .settings-body .field:focus,
    html.wzg-ready body .settings-body select:focus,
    html.wzg-ready body .settings-body input:focus { border-color: #9b9b9b !important; box-shadow: none !important; }
    html.wzg-ready body .wzg-select-trigger { height: 34px !important; min-height: 34px !important; border-radius: 8px !important; background: #1b1b1b !important; border: 1px solid #2e2e2e !important; font-size: 12px !important; font-weight: 500 !important; box-shadow: none !important; transition: border-color .22s ease !important; }
    html.wzg-ready body .wzg-select-trigger:hover { border-color: #3d3d3d !important; }
    html.wzg-ready body .wzg-select.is-open .wzg-select-trigger { border-color: #9b9b9b !important; box-shadow: none !important; background: #1b1b1b !important; }
    html.wzg-ready body .wzg-select-menu { border-radius: 10px !important; background: #0b0b0b !important; border: 1px solid #2e2e2e !important; box-shadow: 0 0 38px 4px rgba(0,0,0,.6), 0 18px 50px rgba(0,0,0,.5) !important; }
    html.wzg-ready body .wzg-select-option { border-radius: 6px !important; color: #6e6e6e !important; font-size: 12px !important; }
    html.wzg-ready body .wzg-select-option:hover { background: #151515 !important; color: #cfcfcf !important; }
    html.wzg-ready body .wzg-select-option.is-selected { background: #151515 !important; border-color: transparent !important; color: #cfcfcf !important; }
    html.wzg-ready body .settings-body .copyBtn,
    html.wzg-ready body .settings-body .btnGhost { min-width: 0 !important; height: 34px !important; min-height: 34px !important; padding: 0 14px !important; border-radius: 8px !important; background: #1b1b1b !important; border: 1px solid #2e2e2e !important; color: #cfcfcf !important; font-size: 11px !important; font-weight: 500 !important; letter-spacing: 0 !important; transition: filter .22s ease, border-color .22s ease !important; }
    html.wzg-ready body .settings-body .copyBtn:hover,
    html.wzg-ready body .settings-body .btnGhost:hover { background: #1b1b1b !important; border-color: #3d3d3d !important; filter: brightness(1.3); }
    html.wzg-ready body .settings-body .fileish { padding: 0 !important; border: 0 !important; background: transparent !important; gap: 10px !important; }
    html.wzg-ready body .settings-body .fileName { font-size: 11px !important; color: #6e6e6e !important; }
    /* toggle fino e discreto */
    html.wzg-ready body .settings-body .switch { width: 36px !important; height: 20px !important; padding: 0 !important; border: 1px solid #2e2e2e !important; border-radius: 99px !important; background: #131313 !important; box-shadow: inset 0 1px 3px rgba(0,0,0,.55) !important; transition: background .6s cubic-bezier(.4,.02,.2,1), border-color .6s cubic-bezier(.4,.02,.2,1) !important; }
    html.wzg-ready body .settings-body .switch::after { position: absolute !important; top: 3px !important; left: 3px !important; width: 12px !important; height: 12px !important; background: #5c5c5c !important; box-shadow: 0 1px 3px rgba(0,0,0,.5); transition: transform .6s cubic-bezier(.3,1.4,.5,1), background .6s cubic-bezier(.4,.02,.2,1) !important; }
    html.wzg-ready body .settings-body .switch:hover { border-color: #3d3d3d !important; }
    html.wzg-ready body .settings-body .switch:has(input:checked) { background: #b4b4b4 !important; border-color: #b4b4b4 !important; box-shadow: inset 0 1px 2px rgba(0,0,0,.18) !important; }
    html.wzg-ready body .settings-body .switch:has(input:checked)::after { transform: translateX(16px) !important; background: #101010 !important; box-shadow: none; }
    /* slider */
    html.wzg-ready body .settings-body input[type="range"]::-webkit-slider-thumb { background: #cfcfcf !important; border-color: #0e0e0e !important; }
    html.wzg-ready body .settings-body .val { height: 28px !important; border-radius: 7px !important; background: #1b1b1b !important; border: 1px solid #2e2e2e !important; color: #9b9b9b !important; font-family: ui-monospace, "SF Mono", Consolas, monospace !important; font-size: 11.5px !important; }
    /* sem o VIP do topo; o VIP das linhas fica colado no nome */
    html.wzg-ready body .settings-head .vip-pill { display: none !important; }
    html.wzg-ready body .settings-body .opR { margin-left: auto !important; }
    html.wzg-ready body .settings-body .opt:has(.vip-a) .opL { flex: 0 1 auto !important; }
    html.wzg-ready body .settings-body .opt:has(.vip-a) .vip-a { margin-left: -6px !important; }
    /* ===== seletor de cor custom ===== */
    #wzg-cp { position: fixed; z-index: 2147483300; width: 252px; padding: 12px; display: flex; flex-direction: column; gap: 10px; background: #0b0b0b; border: 1px solid #2e2e2e; border-radius: 10px; color: #cfcfcf; font-family: Montserrat, "Segoe UI", system-ui, sans-serif; user-select: none; -webkit-user-select: none;
      box-shadow: 0 0 0 1px rgba(255,255,255,.015), 0 0 38px 4px rgba(0,0,0,.6), 0 24px 70px rgba(0,0,0,.55); animation: wzg-cp-in .38s cubic-bezier(.22,1,.36,1) both; }
    @keyframes wzg-cp-in { from { opacity: 0; transform: translateY(-6px) scale(.97); } }
    #wzg-cp .cp-sv { position: relative; height: 136px; border-radius: 8px; cursor: crosshair; touch-action: none; background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(var(--h, 0) 100% 50%)); }
    #wzg-cp .cp-hue { position: relative; height: 10px; border-radius: 6px; cursor: pointer; touch-action: none; background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); }
    #wzg-cp .cp-cur { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.5); pointer-events: none; }
    #wzg-cp .cp-sv .cp-cur { background: var(--c); }
    #wzg-cp .cp-hue .cp-cur { top: 50%; background: hsl(var(--h, 0) 100% 50%); }
    #wzg-cp .cp-row { display: flex; align-items: center; gap: 8px; }
    #wzg-cp .cp-chip { flex: none; width: 34px; height: 30px; border: 1px solid #2e2e2e; border-radius: 7px; overflow: hidden; background: repeating-conic-gradient(#3a3a3a 0% 25%, #1c1c1c 0% 50%) 50% / 8px 8px; }
    #wzg-cp .cp-chip i { display: block; width: 100%; height: 100%; }
    #wzg-cp input { all: unset; box-sizing: border-box; height: 30px; padding: 0 8px; text-align: center; font: 500 12px ui-monospace, "SF Mono", Consolas, monospace; color: #cfcfcf; background: #1b1b1b; border: 1px solid #2e2e2e; border-radius: 8px; user-select: text; transition: border-color .22s ease; }
    #wzg-cp input:hover { border-color: #3d3d3d; }
    #wzg-cp input:focus { border-color: #9b9b9b; }
    #wzg-cp .cp-hex { flex: 1; min-width: 0; }
    #wzg-cp .cp-eye { all: unset; box-sizing: border-box; flex: none; width: 30px; height: 30px; display: grid; place-items: center; cursor: pointer; border: 1px solid #2e2e2e; border-radius: 8px; background: #1b1b1b; color: #9b9b9b; font-size: 15px; transition: color .22s ease, border-color .22s ease; }
    #wzg-cp .cp-eye[hidden] { display: none; }
    #wzg-cp .cp-eye:hover { color: #cfcfcf; border-color: #3d3d3d; }
    #wzg-cp .cp-rgb { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; width: 100%; min-width: 0; }
    #wzg-cp .cp-rgb label { display: flex; flex-direction: column; gap: 4px; font-size: 9.5px; font-weight: 600; letter-spacing: .08em; color: #6e6e6e; text-align: center; }
    #wzg-cp .cp-rgb label, #wzg-cp .cp-rgb input { min-width: 0; width: 100%; }
    /* slots de background custom */
    html.wzg-ready body .settings-body .opt.wzg-has-slots .opR { display: none !important; }
    html.wzg-ready body .settings-body .wzg-bgslots { flex: 1 1 100%; order: 4; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    @media (max-width: 620px) { html.wzg-ready body .settings-body .wzg-bgslots { grid-template-columns: 1fr; } }
    html.wzg-ready body .wzg-bgslot { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 8px; border: 1px solid #1e1e1e; border-radius: 8px; background: #0b0b0b; transition: border-color .22s ease; }
    html.wzg-ready body .wzg-bgslot:hover { border-color: #2e2e2e; }
    html.wzg-ready body .wzg-bgslot.is-active { border-color: #cfcfcf; }
    html.wzg-ready body .wzg-bgslot-thumb { position: relative; width: 100% !important; aspect-ratio: 16 / 9; height: auto !important; min-height: 0 !important; padding: 0 !important; display: grid !important; place-items: center; border: 1px dashed #2e2e2e !important; border-radius: 6px !important; background-color: #101010 !important; background-image: var(--wzg-bgslot-image, none) !important; background-position: center !important; background-size: cover !important; background-repeat: no-repeat !important; color: #6e6e6e !important; font-size: 22px !important; font-weight: 400 !important; cursor: pointer; transition: border-color .22s ease !important; }
    html.wzg-ready body .wzg-bgslot-thumb:hover { border-color: #3d3d3d !important; }
    html.wzg-ready body .wzg-bgslot.has-img .wzg-bgslot-thumb { border: 1px solid #1e1e1e !important; }
    html.wzg-ready body .wzg-bgslot-meta { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; }
    html.wzg-ready body .wzg-bgslot-meta b { font-size: 11.5px; font-weight: 500; color: #cfcfcf; }
    html.wzg-ready body .wzg-bgslot-meta span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10.5px; color: #6e6e6e; }
    html.wzg-ready body .wzg-bgslot-act { display: flex; gap: 6px; }
    html.wzg-ready body .wzg-bgslot-act button { flex: 1; min-width: 0 !important; height: 28px !important; min-height: 28px !important; padding: 0 8px !important; border: 1px solid #2e2e2e !important; border-radius: 7px !important; background: #1b1b1b !important; color: #cfcfcf !important; font-size: 11px !important; font-weight: 500 !important; cursor: pointer; transition: filter .22s ease, border-color .22s ease !important; }
    html.wzg-ready body .wzg-bgslot-act button:hover { border-color: #3d3d3d !important; filter: brightness(1.3); }
    html.wzg-ready body .wzg-bgslot-act button[data-a="del"] { flex: 0 0 28px; padding: 0 !important; color: #6e6e6e !important; }
    html.wzg-ready body .wzg-bgslot.is-active .wzg-bgslot-act .use { background: #cfcfcf !important; border-color: #cfcfcf !important; color: #0b0b0b !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function mountHudConfButton(box) {
    if (!box || document.getElementById('wzg-hudconf-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'wzg-hudconf-btn';
    btn.type = 'button';
    btn.innerHTML = `<span>${icons.controls}Mobile HUD config</span><small>Edit layout ›</small>`;
    btn.addEventListener('click', openHudEditor);
    box.insertAdjacentElement('afterend', btn);
  }

  function syncColorLabel(input) {
    let out = input.id ? document.getElementById(input.id + 'Out') : null;
    if (!out) out = input.closest('.opR')?.querySelector('.val, .hex, output, input[type="text"]');
    if (!out || out === input) return;
    const v = String(input.value || '').toUpperCase();
    if (out.tagName === 'INPUT') { if (document.activeElement !== out) out.value = v; }
    else if (out.textContent !== v) out.textContent = v;
  }
  function installColorPicker() {
    if (PAGE.__wzgColorPicker) return;
    PAGE.__wzgColorPicker = true;
    const clampN = (v, a, c) => Math.min(c, Math.max(a, v));
    const hsv2rgb = (h, s, v) => { const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)].map(x => Math.round(x * 255)); };
    const rgb2hsv = (r, g, bl) => {
      r /= 255; g /= 255; bl /= 255;
      const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), d = mx - mn; let h = 0;
      if (d) { if (mx === r) h = ((g - bl) / d + 6) % 6; else if (mx === g) h = (bl - r) / d + 2; else h = (r - g) / d + 4; h *= 60; }
      return [h, mx ? d / mx : 0, mx];
    };
    const toHex = (r, g, bl) => '#' + [r, g, bl].map(x => x.toString(16).padStart(2, '0')).join('');
    const parseHex = s => { s = String(s).trim().replace(/^#/, ''); if (s.length === 3) s = [...s].map(c => c + c).join(''); return /^[0-9a-f]{6}$/i.test(s) ? [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)) : null; };
    const mk = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
    let pop = null, cur = null;

    const close = (fire = true) => {
      if (!pop) return;
      const inp = cur; pop.remove(); pop = null; cur = null;
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', onKey, true);
      PAGE.removeEventListener('resize', onResize);
      if (fire && inp) inp.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const away = e => { if (pop && !pop.contains(e.target) && e.target !== cur) close(); };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    const onResize = () => close();

    function open(input) {
      if (pop && cur === input) { close(); return; }
      close();
      let [H, S, V] = rgb2hsv(...(parseHex(input.value) || [255, 255, 255]));
      pop = mk('div', '', `
        <div class="cp-sv"><i class="cp-cur"></i></div>
        <div class="cp-hue"><i class="cp-cur"></i></div>
        <div class="cp-row"><span class="cp-chip"><i></i></span><input class="cp-hex" type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-label="HEX"><button type="button" class="cp-eye" title="Pick from screen" hidden>⌖</button></div>
        <div class="cp-rgb"><label>R<input type="text" inputmode="numeric" maxlength="3"></label><label>G<input type="text" inputmode="numeric" maxlength="3"></label><label>B<input type="text" inputmode="numeric" maxlength="3"></label></div>`);
      pop.id = 'wzg-cp'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Color picker');
      cur = input;
      ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'touchstart', 'contextmenu'].forEach(t => pop.addEventListener(t, e => e.stopPropagation()));
      const sv = pop.querySelector('.cp-sv'), hue = pop.querySelector('.cp-hue'), svc = sv.firstElementChild, huec = hue.firstElementChild;
      const chip = pop.querySelector('.cp-chip i'), hexIn = pop.querySelector('.cp-hex'), rgbIn = [...pop.querySelectorAll('.cp-rgb input')], eye = pop.querySelector('.cp-eye');
      const paint = () => {
        const c = hsv2rgb(H, S, V), hx = toHex(...c);
        pop.style.setProperty('--h', H); pop.style.setProperty('--c', hx);
        svc.style.left = S * 100 + '%'; svc.style.top = (1 - V) * 100 + '%';
        huec.style.left = (H / 360) * 100 + '%';
        chip.style.background = hx;
        if (document.activeElement !== hexIn) hexIn.value = hx.toUpperCase();
        rgbIn.forEach((x, i) => { if (document.activeElement !== x) x.value = c[i]; });
        return hx;
      };
      const push = () => { const hx = paint(); input.value = hx; syncColorLabel(input); input.dispatchEvent(new Event('input', { bubbles: true })); };
      const load = c => { [H, S, V] = rgb2hsv(...c); push(); };
      const drag = (node, fn) => {
        node.addEventListener('pointerdown', e => {
          if (e.button !== 0) return;
          node.setPointerCapture(e.pointerId);
          const mv = ev => { const r = node.getBoundingClientRect(); fn(clampN((ev.clientX - r.left) / r.width, 0, 1), clampN((ev.clientY - r.top) / r.height, 0, 1)); };
          node.onpointermove = mv; mv(e); e.preventDefault();
        });
        const up = () => { node.onpointermove = null; };
        node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up);
      };
      drag(sv, (fx, fy) => { S = fx; V = 1 - fy; push(); });
      drag(hue, fx => { H = Math.min(359.99, fx * 360); push(); });
      hexIn.addEventListener('input', () => { const c = parseHex(hexIn.value); if (c) load(c); });
      hexIn.addEventListener('blur', paint);
      hexIn.addEventListener('keydown', e => { if (e.key === 'Enter') close(); });
      rgbIn.forEach((x, i) => {
        x.addEventListener('input', () => { const n = parseInt(x.value, 10); if (!Number.isFinite(n)) return; const c = hsv2rgb(H, S, V); c[i] = clampN(n, 0, 255); load(c); });
        x.addEventListener('blur', paint);
        x.addEventListener('keydown', e => { if (e.key === 'Enter') close(); });
      });
      const ED = PAGE.EyeDropper || window.EyeDropper;
      if (ED) { eye.hidden = false; eye.addEventListener('click', () => { try { new ED().open().then(r => { const c = parseHex(r.sRGBHex); if (c) load(c); }).catch(() => {}); } catch {} }); }

      document.body.appendChild(pop);
      paint();
      const r = input.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, vw = PAGE.innerWidth, vh = PAGE.innerHeight;
      pop.style.left = clampN(r.right - w, 8, Math.max(8, vw - w - 8)) + 'px';
      pop.style.top = clampN(r.bottom + 8 + h > vh - 8 ? r.top - h - 8 : r.bottom + 8, 8, Math.max(8, vh - h - 8)) + 'px';
      document.addEventListener('pointerdown', away, true);
      document.addEventListener('keydown', onKey, true);
      PAGE.addEventListener('resize', onResize);
    }
    document.addEventListener('click', e => {
      const t = e.target;
      if (!t || !t.matches || !t.matches('input[type="color"]')) return;
      e.preventDefault(); e.stopPropagation(); open(t);
    }, true);
    nativeInterval(() => {
      if (document.hidden || document.documentElement.classList.contains('wzg-ingame')) return;
      if (!document.querySelector('.settings-wrap.active, #wzg-extra-options')) return;
      document.querySelectorAll('.settings-body input[type="color"], #wzg-extra-options input[type="color"]').forEach(syncColorLabel);
    }, 900);
    document.addEventListener('input', e => { if (e.target?.matches?.('input[type="color"]')) syncColorLabel(e.target); }, true);
  }

  const BG_SLOTS_KEY = 'wzg-bg-slots', BG_ACTIVE_KEY = 'wzg-bg-active';
  function readBgSlots() {
    try { const a = JSON.parse(store.get(BG_SLOTS_KEY)); if (Array.isArray(a)) return [0, 1, 2].map(i => (a[i] && a[i].data ? a[i] : null)); } catch {}
    return [null, null, null];
  }
  async function shrinkBgImage(file) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1920 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return c.toDataURL('image/jpeg', .86);
  }
  function dataUrlToFile(data, name) {
    const bin = atob(data.split(',')[1] || ''), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], name || 'background.jpg', { type: 'image/jpeg' });
  }
  function mountBgSlots(modal) {
    const bgFile = modal.querySelector('#bgFile'), select = modal.querySelector('#select-bg');
    if (!bgFile || !select || bgFile.dataset.wzgSlots) return;
    const opt = bgFile.closest('.opt'); if (!opt) return;
    bgFile.dataset.wzgSlots = '1';
    opt.classList.add('wzg-has-slots');
    const hint = opt.querySelector('.hint'); if (hint) hint.textContent = 'Save up to 3 uploads and switch between them';
    const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/*'; picker.hidden = true;
    const wrap = document.createElement('div'); wrap.className = 'wzg-bgslots';
    opt.append(wrap, picker);
    let pending = 0;
    const active = () => { const n = parseInt(store.get(BG_ACTIVE_KEY), 10); return Number.isInteger(n) && n >= 0 && n < 3 ? n : -1; };
    const paint = () => {
      const slots = readBgSlots(), act = active();
      wrap.replaceChildren();
      slots.forEach((s, i) => {
        const on = !!s && act === i && select.value === 'Custom';
        const card = document.createElement('div');
        card.className = 'wzg-bgslot' + (s ? ' has-img' : '') + (on ? ' is-active' : '');
        card.dataset.i = String(i);
        card.innerHTML = `<button type="button" class="wzg-bgslot-thumb" data-a="${s ? 'use' : 'up'}" title="${s ? 'Use this background' : 'Upload an image'}">${s ? '' : '+'}</button>
          <div class="wzg-bgslot-meta"><b>Slot ${i + 1}</b><span></span></div>
          <div class="wzg-bgslot-act"><button type="button" data-a="up">${s ? 'Replace' : 'Upload'}</button>${s ? `<button type="button" data-a="use" class="use">${on ? 'In use' : 'Use'}</button><button type="button" data-a="del" aria-label="Remove">✕</button>` : ''}</div>`;
        card.querySelector('.wzg-bgslot-meta span').textContent = s ? (s.name || 'image') : 'Empty';
        if (s) card.querySelector('.wzg-bgslot-thumb').style.setProperty('--wzg-bgslot-image', `url("${s.data}")`);
        wrap.append(card);
      });
    };
    const apply = async i => {
      const s = readBgSlots()[i]; if (!s) return;
      try {
        const dt = new DataTransfer(); dt.items.add(dataUrlToFile(s.data, s.name));
        bgFile.files = dt.files;
        bgFile.dispatchEvent(new Event('change', { bubbles: true }));
        store.set(BG_ACTIVE_KEY, String(i));
        await new Promise(r => nativeTimeout(r, 250));
        select.value = 'Custom';
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {}
      paint();
    };
    wrap.addEventListener('click', e => {
      const btn = e.target.closest('[data-a]'); if (!btn) return;
      const i = Number(btn.closest('.wzg-bgslot').dataset.i), a = btn.dataset.a;
      if (a === 'up') { pending = i; picker.value = ''; picker.click(); }
      else if (a === 'use') apply(i);
      else if (a === 'del') {
        const slots = readBgSlots(), wasActive = active() === i;
        slots[i] = null; store.set(BG_SLOTS_KEY, JSON.stringify(slots));
        if (wasActive) {
          store.remove(BG_ACTIVE_KEY);
          select.value = 'Default'; select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        paint();
      }
    });
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0]; if (!file) return;
      try {
        const data = await shrinkBgImage(file), slots = readBgSlots();
        slots[pending] = { name: file.name.length > 28 ? file.name.slice(0, 25) + '...' : file.name, data };
        if (!store.set(BG_SLOTS_KEY, JSON.stringify(slots))) { slots[pending] = null; paint(); const sp = wrap.querySelectorAll('.wzg-bgslot-meta span')[pending]; if (sp) sp.textContent = 'Storage full'; return; }
        paint();
        await apply(pending);
      } catch {}
    });
    select.addEventListener('change', paint);
    paint();
  }

  function mountSidebar() {
    injectPatchStyle();
    const panel = document.querySelector('.shell > .panel:first-child');
    if (!panel || document.getElementById(`${ID}-sidebar`)) return;
    const info = panel.querySelector('#manualInfoBox');
    const sidebar = document.createElement('div');
    sidebar.id = `${ID}-sidebar`;
    sidebar.innerHTML = `
      <div class="wzg-nav">
        <button class="wzg-nav-btn" data-target=".settings-btn">${icons.settings}<span>Settings</span></button>
        <button class="wzg-nav-btn" data-target=".store-btn">${icons.store}<span>Store</span></button>
        <button class="wzg-nav-btn" data-target=".lead-btn">${icons.rank}<span>Leaderboard</span></button>
        <button class="wzg-nav-btn" data-modal="vip">${icons.vip}<span>VIP membership</span></button>
        <button class="wzg-nav-btn" data-modal="background">${icons.background}<span>Backgrounds</span></button>
        <button class="wzg-nav-btn is-danger" data-target=".exit-btn">${icons.logout}<span>Log out</span></button>
      </div>
      <div class="wzg-nav-spacer"></div>
      <div class="wzg-tools">
        <button class="wzg-tool" data-modal="guide"><span>${icons.book}Game guide</span><b>›</b></button>
      </div>`;
    if (info) panel.insertBefore(sidebar, info); else panel.appendChild(sidebar);

    sidebar.addEventListener('click', event => {
      const nav = event.target.closest('[data-target]');
      if (nav) triggerOriginal(nav.dataset.target);
      const modal = event.target.closest('[data-modal="vip"]');
      if (modal) openVIP();
      const backgroundModal = event.target.closest('[data-modal="background"]');
      if (backgroundModal) openBackgrounds();
      const guideModal = event.target.closest('[data-modal="guide"]');
      if (guideModal) openGuide();
      const pref = event.target.closest('[data-pref]');
      if (pref) {
        state.prefs[pref.dataset.pref] = !state.prefs[pref.dataset.pref];
        persist();
        applyPreferences();
      }
    });
    applyPreferences();
  }

  function applyPreferences() {
    const root = document.documentElement;
    root.classList.add('wzg-ready');
    root.classList.remove('wzg-guide');
    document.querySelectorAll('[data-pref]').forEach(button => {
      button.setAttribute('aria-pressed', String(!!state.prefs[button.dataset.pref]));
    });
    const key = backgroundURL();
    if (state.appliedBackground !== key) {
      state.appliedBackground = key;
      applyBackground();
    }
  }

  function backgroundURL() {
    if (state.prefs.background === 'custom') return state.prefs.customBackground || '';
    return BACKGROUNDS.find(item => item.id === state.prefs.background)?.url || '';
  }

  function applyBackground() {
    const url = backgroundURL();
    document.documentElement.style.setProperty('--wzg-user-bg', url ? `url(${JSON.stringify(url)})` : 'none');
    renderBackgroundSelection();
  }

  function renderBackgroundSelection() {
    document.querySelectorAll('.wzg-bg-preset').forEach(button => {
      button.classList.toggle('is-active', button.dataset.background === state.prefs.background);
    });
    const input = document.getElementById('wzg-bg-url');
    if (input && document.activeElement !== input) input.value = state.prefs.customBackground || '';
  }

  function mountBackgroundModal() {
    if (document.getElementById(`${ID}-bg-modal`)) return;
    const modal = document.createElement('div');
    modal.id = `${ID}-bg-modal`;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <section id="wzg-bg-dialog" role="dialog" aria-modal="true" aria-label="Backgrounds">
        <div class="wzg-bg-head">
          <div><strong>Backgrounds</strong><span>Choose a preset or paste an image URL</span></div>
          <button id="wzg-bg-close" type="button" aria-label="Close">×</button>
        </div>
        <div class="wzg-bg-body">
          <div class="wzg-bg-grid">
            ${BACKGROUNDS.map(item => `<button class="wzg-bg-preset" type="button" data-background="${item.id}" style="background-image:url('${item.url}')"><span>${item.name}</span></button>`).join('')}
          </div>
          <div class="wzg-bg-custom">
            <input id="wzg-bg-url" type="url" placeholder="https://example.com/background.jpg">
            <button id="wzg-bg-apply" class="wzg-bg-action" type="button">Apply URL</button>
            <button id="wzg-bg-clear" class="wzg-bg-action" type="button">No image</button>
          </div>
        </div>
      </section>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('#wzg-bg-close')) closeBackgrounds();
      const preset = event.target.closest('[data-background]');
      if (preset) {
        state.prefs.background = preset.dataset.background;
        persist();
        applyBackground();
      }
      if (event.target.closest('#wzg-bg-apply')) {
        const value = document.getElementById('wzg-bg-url')?.value.trim() || '';
        if (!/^https?:\/\//i.test(value) && !/^data:image\//i.test(value)) return;
        state.prefs.customBackground = value;
        state.prefs.background = 'custom';
        persist();
        applyBackground();
      }
      if (event.target.closest('#wzg-bg-clear')) {
        state.prefs.background = 'none';
        persist();
        applyBackground();
      }
    });
    renderBackgroundSelection();
  }

  function openBackgrounds() {
    mountBackgroundModal();
    const modal = document.getElementById(`${ID}-bg-modal`);
    modal?.classList.add('is-open');
    modal?.setAttribute('aria-hidden', 'false');
  }

  function closeBackgrounds() {
    const modal = document.getElementById(`${ID}-bg-modal`);
    modal?.classList.remove('is-open');
    modal?.setAttribute('aria-hidden', 'true');
  }

  function mountGuideModal() {
    if (document.getElementById(`${ID}-guide-modal`)) return;
    const source = document.getElementById('manualInfoBox');
    if (!source) return;
    const modal = document.createElement('div');
    modal.id = `${ID}-guide-modal`;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <section id="wzg-guide-dialog" role="dialog" aria-modal="true" aria-label="Game guide">
        <div class="wzg-guide-head">
          <div><strong>Game guide</strong><span>Everything you need before entering the arena</span></div>
          <button id="wzg-guide-close" type="button" aria-label="Close">×</button>
        </div>
        <article id="wzg-guide-content">${source.innerHTML}</article>
      </section>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('#wzg-guide-close')) closeGuide();
    });
  }

  function openGuide() {
    mountGuideModal();
    const modal = document.getElementById(`${ID}-guide-modal`);
    modal?.classList.add('is-open');
    modal?.setAttribute('aria-hidden', 'false');
  }

  function closeGuide() {
    const modal = document.getElementById(`${ID}-guide-modal`);
    modal?.classList.remove('is-open');
    modal?.setAttribute('aria-hidden', 'true');
  }

  function fixRegions() {
    const middleEast = document.querySelector('.server-map[data-a="na"], .server-map.na');
    const southAmerica = document.querySelector('.server-map[data-a="sa"], .server-map.sa');
    if (middleEast) {
      middleEast.style.setProperty('display', 'none', 'important');
      middleEast.setAttribute('aria-hidden', 'true');
    }
    if (southAmerica && southAmerica.textContent.trim() !== 'South America') {
      southAmerica.textContent = 'South America';
    }
    if (middleEast?.classList.contains('active') || getComputedStyle(document.getElementById('server-na') || document.body).display === 'block') {
      const europe = document.querySelector('.server-map[data-a="eu"], .server-map.eu');
      if (europe && !europe.dataset.wzgRegionFixed) {
        europe.dataset.wzgRegionFixed = '1';
        nativeTimeout(() => europe.click(), 0);
      }
    }
  }

  function mountVIPModal() {
    let modal = document.getElementById(`${ID}-vip-modal`);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = `${ID}-vip-modal`;
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = `
        <section id="wzg-vip-dialog" role="dialog" aria-modal="true" aria-label="VIP membership">
          <div class="wzg-vip-head">
            <div class="wzg-vip-title"><strong>VIP membership</strong><span>Choose the plan that fits you</span></div>
            <button id="wzg-vip-close" type="button" aria-label="Close">×</button>
          </div>
          <div id="wzg-vip-body"></div>
        </section>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', event => {
        if (event.target === modal || event.target.closest('#wzg-vip-close')) closeVIP();
      });
    }

    const body = modal.querySelector('#wzg-vip-body');
    const card = document.querySelector('.shell > .panel:last-child .vip-card');
    if (card && card.parentElement !== body) body.appendChild(card);
  }

  function openVIP() {
    mountVIPModal();
    const modal = document.getElementById(`${ID}-vip-modal`);
    modal?.classList.add('is-open');
    modal?.setAttribute('aria-hidden', 'false');
  }

  function closeVIP() {
    const modal = document.getElementById(`${ID}-vip-modal`);
    modal?.classList.remove('is-open');
    modal?.setAttribute('aria-hidden', 'true');
  }

  function neutralizeVIPFeatures() {
    document.querySelectorAll('#wzg-vip-body .vip-features').forEach(features => {
      const walker = document.createTreeWalker(features, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue.includes('✅')) node.nodeValue = node.nodeValue.replaceAll('✅', '✓');
      }
    });
  }

  function cleanSkinPreview() {
    const left = document.querySelector('.home-skins-prev');
    const right = document.querySelector('.home-skins-next');
    const chevron = direction => direction === 'left'
      ? '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>';
    if (left && left.dataset.wzgChevron !== '1') {
      left.dataset.wzgChevron = '1';
      left.innerHTML = chevron('left');
    }
    if (right && right.dataset.wzgChevron !== '1') {
      right.dataset.wzgChevron = '1';
      right.innerHTML = chevron('right');
    }
  }

  function cleanActionButtons() {
    const fullscreen = document.querySelector('.full-screen-btn');
    const replay = document.querySelector('.replay-btn');
    const controls = document.querySelector('.center-controls');
    const play = document.querySelector('.play-game-btn');
    if (fullscreen && fullscreen.dataset.wzgActionIcon !== '1') {
      fullscreen.dataset.wzgActionIcon = '1';
      fullscreen.innerHTML = `${icons.fullscreen}<span>Fullscreen</span>`;
      fullscreen.title = 'Fullscreen';
      fullscreen.setAttribute('aria-label', 'Fullscreen');
    }
    if (replay && replay.dataset.wzgActionIcon !== '1') {
      replay.dataset.wzgActionIcon = '1';
      replay.innerHTML = `${icons.replay}<span>Respawn</span>`;
      replay.title = 'Respawn';
      replay.setAttribute('aria-label', 'Respawn');
    }
    if (controls && play && fullscreen && replay) {
      if (fullscreen.parentElement !== controls || fullscreen.nextElementSibling !== play) {
        controls.insertBefore(fullscreen, play);
      }
      if (replay.parentElement !== controls || play.nextElementSibling !== replay) {
        controls.insertBefore(replay, play.nextElementSibling);
      }
    }
  }

  function cleanAccountCard() {
    const card = document.querySelector('.player-card');
    if (!card) return;
    const token = card.querySelector('#nameTokenCount');
    const change = card.querySelector('.change-name-btn');
    if (token && change) {
      const value = token.closest('.value');
      value?.classList.add('wzg-token-value');
      if (value && change.parentElement !== value) value.appendChild(change);
      if (!change.dataset.wzgReload) {
        change.dataset.wzgReload = '1';
        change.innerHTML = icons.reload + '<span>Change</span>';
        change.title = 'Change name';
        change.setAttribute('aria-label', 'Change name');
      }
    }
    card.querySelectorAll('.pi-row').forEach(row => {
      const label = row.querySelector('.label')?.textContent.trim().toLowerCase();
      if (label === 'zoom expires') row.classList.add('wzg-hide');
    });
    const visibleRows = Array.from(card.querySelectorAll('.pi-row:not(.wzg-hide)'));
    visibleRows.forEach((row, index) => {
      row.classList.toggle('wzg-stat-left', index % 2 === 0);
      row.classList.toggle('wzg-stat-last', index >= visibleRows.length - 2);
    });
  }

  function mountIDTool() {
    const control = document.querySelector('#wzs-acc .wzs-ctrl');
    if (!control || document.getElementById(`${ID}-id-tool`)) return;
    const nativeControls = Array.from(control.children);
    const tool = document.createElement('div');
    tool.id = `${ID}-id-tool`;
    tool.innerHTML = `
      <div class="wzg-id-head">
        <div><strong>Favorite accessories</strong><span>Find, name and reuse accessory IDs.</span></div>
        <b id="wzg-saved-count">0 SAVED</b>
      </div>
      <div class="wzg-search">
        ${icons.search}
        <input id="wzg-id-input" type="number" min="1" placeholder="Accessory ID">
        <input id="wzg-id-name" type="text" maxlength="32" placeholder="Favorite name (optional)">
        <button id="wzg-id-go" class="wzg-id-action">Find</button>
        <button id="wzg-id-save" class="wzg-id-action wzg-id-action--primary">${icons.save}<span>Save favorite</span></button>
      </div>
      <div id="wzg-feedback"></div>
      <div id="wzg-saved"></div>`;
    const purchase = document.createElement('div');
    purchase.className = 'wzg-purchase-row';
    nativeControls.forEach(node => purchase.appendChild(node));
    control.append(tool, purchase);
    tool.querySelector('#wzg-id-go').addEventListener('click', startSearch);
    tool.querySelector('#wzg-id-save').addEventListener('click', saveCurrentID);
    tool.querySelector('#wzg-id-input').addEventListener('keydown', event => {
      if (event.key === 'Enter') startSearch();
      if (event.key === 'Escape') stopSearch('Search cancelled');
    });
    tool.querySelector('#wzg-id-name').addEventListener('keydown', event => {
      if (event.key === 'Enter') saveCurrentID();
    });
    tool.querySelector('#wzg-saved').addEventListener('click', event => {
      const go = event.target.closest('[data-open]');
      const remove = event.target.closest('[data-remove]');
      if (go) {
        const item = state.saved.find(entry => String(entry.id) === go.dataset.open);
        document.getElementById('wzg-id-input').value = go.dataset.open;
        document.getElementById('wzg-id-name').value = item?.name || '';
        startSearch();
      }
      if (remove) {
        state.saved = state.saved.filter(item => String(item.id) !== remove.dataset.remove);
        persist();
        renderSaved();
      }
    });
    tool.querySelector('#wzg-saved').addEventListener('change', event => {
      const input = event.target.closest('[data-name]');
      if (!input) return;
      renameSavedItem(input.dataset.name, input.value);
    });
    tool.querySelector('#wzg-saved').addEventListener('keydown', event => {
      const input = event.target.closest('[data-name]');
      if (!input || event.key !== 'Enter') return;
      event.preventDefault();
      input.blur();
    });
    renderSaved();
  }

  const HOME_TOP_ADJUST = 0;
  const RIGHT_TOP_ADJUST = 0;
  const LOGO_HEIGHT = 120;
  let alignBound = false;
  function alignHomeColumns() {
    const right = document.querySelector('.shell > .panel:last-child');
    const center = document.getElementById('centerPanel');
    [right, center].forEach(el => el && el.style.removeProperty('padding-top'));
    center && center.style.removeProperty('--wzg-top-gap');
    center && center.style.removeProperty('--wzg-logo-top');
    const mobileDevice = PAGE.matchMedia('(pointer: coarse)').matches || PAGE.innerWidth <= 900;
    document.documentElement.classList.toggle('wzg-mobile-device', mobileDevice);
    if (!right || !center || !DESKTOP_MQ.matches) return;
    const rooms = document.querySelector('.shell > .panel:first-child > .wzg-rooms-head');
    const widget = document.getElementById('wzg-profile-widget');
    let target = null;
    if (rooms && rooms.getClientRects().length) target = rooms.getBoundingClientRect().top;
    else if (widget && widget.getClientRects().length) target = widget.getBoundingClientRect().bottom + 8;
    if (target === null) return;
    target += HOME_TOP_ADJUST;
    const place = (panel, tgt) => {
      const first = Array.from(panel.children).find(c => c.id !== 'wzg-top-logo' && c.getClientRects().length);
      if (!first) return;
      const diff = tgt - first.getBoundingClientRect().top;
      if (Math.abs(diff) < 0.5) return;
      const base = parseFloat(getComputedStyle(panel).paddingTop) || 0;
      panel.style.setProperty('padding-top', Math.max(0, base + diff) + 'px', 'important');
    };
    const widgetTop = widget && widget.getClientRects().length ? widget.getBoundingClientRect().top : null;
    const logoTop = widgetTop === null ? 0 : Math.max(0, widgetTop + RIGHT_TOP_ADJUST - center.getBoundingClientRect().top);
    center.style.setProperty('--wzg-logo-top', logoTop + 'px');
    place(center, target);
    const needPad = LOGO_HEIGHT + 4 + logoTop;
    if (!mobileDevice && (parseFloat(getComputedStyle(center).paddingTop) || 0) < needPad) center.style.setProperty('padding-top', needPad + 'px', 'important');
    place(right, (widgetTop === null ? target : widgetTop) + RIGHT_TOP_ADJUST);
    center.style.setProperty('--wzg-top-gap', (parseFloat(getComputedStyle(center).paddingTop) || 0) + 'px');
    if (!alignBound) {
      alignBound = true;
      PAGE.addEventListener('resize', () => nativeTimeout(alignHomeColumns, 120));
    }
  }

  function mountHomeOptions() {
    const right = document.querySelector('.shell > .panel:last-child');
    if (!right) return;
    const extra = document.getElementById('wzg-extra-options');
    const font = document.querySelector('.wzg-font-option');
    if (!extra && !font) return;
    let box = document.getElementById('wzg-home-options');
    if (!box) {
      box = document.createElement('section');
      box.id = 'wzg-home-options';
      box.setAttribute('aria-label', 'Betterzilla options');
      right.appendChild(box);
    }
    if (font && font.parentElement !== box) box.prepend(font);
    if (extra && extra.parentElement !== box) box.appendChild(extra);
    const CLOSED_KEY = 'wzg-home-closed-cards';
    const readClosed = () => { try { const v = JSON.parse(store.get(CLOSED_KEY)); return Array.isArray(v) ? v : []; } catch { return []; } };
    const cardKey = card => card.getAttribute('aria-label') || '';
    const closed = readClosed();
    box.querySelectorAll('.wzg-extra-card').forEach(card => {
      if (card.dataset.wzgOpenInit === '1') return;
      card.dataset.wzgOpenInit = '1';
      card.classList.toggle('wzg-open', !closed.includes(cardKey(card)));
    });
    if (box.dataset.wzgAccordion !== '1') {
      box.dataset.wzgAccordion = '1';
      box.addEventListener('click', event => {
        const head = event.target.closest('.wzg-extra-card > header');
        if (!head || !box.contains(head)) return;
        head.parentElement.classList.toggle('wzg-open');
        const shut = Array.from(box.querySelectorAll('.wzg-extra-card:not(.wzg-open)')).map(cardKey).filter(Boolean);
        try { store.set(CLOSED_KEY, JSON.stringify(shut)); } catch {}
      });
    }
  }

  function mountStoreRedesign() {
    const modal = document.querySelector('.wzs-modal');
    if (!modal) return;
    modal.classList.add('wzg-store-modal');
    optimizeImages(modal);
    mountStoreHub(modal);

    const tabs = modal.querySelector('.wzs-tabs');
    const groups = modal.querySelector('#wzs-acc .wzs-side, .wzg-store-groups');
    if (tabs) {
      tabs.querySelectorAll('.wzs-pill').forEach(tab => {
        if (tab.dataset.wzgStoreIcon === '1') return;
        tab.dataset.wzgStoreIcon = '1';
        const text = tab.textContent.trim();
        const icon = /skin/i.test(text) ? icons.visual : icons.store;
        tab.innerHTML = `<span class="wzg-store-tab-icon">${icon}</span><span>${escapeHTML(text)}</span>`;
      });
      if (groups && groups.parentElement !== tabs) {
        groups.classList.add('wzg-store-groups');
        tabs.appendChild(groups);
      }
      mountSkinCategoryNavigation(modal, tabs);
      const syncGroups = () => {
        const active = tabs.querySelector('.wzs-pill.active');
        const skinsActive = !!active && /skin/i.test(active.textContent);
        if (groups) groups.classList.toggle('wzg-store-groups--hidden', skinsActive);
        tabs.querySelector('.wzg-skin-groups')?.classList.toggle('wzg-store-groups--hidden', !skinsActive);
        const title = modal.querySelector('.wzs-title');
        const desiredTitle = storeTitle(modal, skinsActive);
        if (title && title.textContent !== desiredTitle) title.textContent = desiredTitle;
      };
      if (tabs.dataset.wzgStoreTabs !== '1') {
        tabs.dataset.wzgStoreTabs = '1';
        tabs.addEventListener('click', event => nativeRAF(() => {
          syncGroups();
          mountSkinCategoryNavigation(modal, tabs);
          if (event.target.closest('#store-skins')) {
            const list = tabs.querySelector('.wzg-skin-category-list');
            if (list) list.scrollTop = 0;
          }
        }));
      }
      syncGroups();
    }

    const back = modal.querySelector('.wzs-back');
    if (back && back.dataset.wzgStoreBack !== '1') {
      back.dataset.wzgStoreBack = '1';
      back.innerHTML = icons.back;
      back.title = 'Back';
      back.setAttribute('aria-label', 'Back');
    }

    const arrows = [
      [modal.querySelector('#wzsAccPrev'), icons.arrowLeft, 'Previous accessory'],
      [modal.querySelector('#wzsAccNext'), icons.arrowRight, 'Next accessory'],
    ];
    arrows.forEach(([button, icon, label]) => {
      if (!button || button.dataset.wzgArrow === '1') return;
      button.dataset.wzgArrow = '1';
      button.innerHTML = icon;
      button.title = label;
      button.setAttribute('aria-label', label);
    });
  }

  let storeHubBound = false;
  function storeTitle(modal, skinsActive) {
    const view = modal.dataset.wzgView || 'hub';
    if (view === 'hub') return 'Store';
    return view === 'skins' ? 'Skins' : 'Clothing';
  }
  function setStoreView(modal, view) {
    modal.dataset.wzgView = view;
    const title = modal.querySelector('.wzs-title');
    const desired = storeTitle(modal);
    if (title && title.textContent !== desired) title.textContent = desired;
  }
  function mountStoreHub(modal) {
    if (!modal.dataset.wzgView || !modal.getClientRects().length) setStoreView(modal, 'hub');

    if (!modal.querySelector('.wzg-store-hub')) {
      const hub = document.createElement('div');
      hub.className = 'wzg-store-hub';
      hub.innerHTML = `
        <button type="button" class="wzg-hub-card" data-view="clothing">
          <span class="wzg-hub-icon">${icons.store}</span>
          <strong>Clothing</strong><small>Eyes, mouths, glasses &amp; hats</small>
        </button>
        <button type="button" class="wzg-hub-card" data-view="skins">
          <span class="wzg-hub-icon">${icons.visual}</span>
          <strong>Skins</strong><small>Browse every skin category</small>
        </button>`;
      const head = modal.querySelector('.wzs-head');
      if (head) head.after(hub); else modal.prepend(hub);
      hub.addEventListener('click', event => {
        const card = event.target.closest('[data-view]');
        if (!card) return;
        const view = card.dataset.view;
        const pill = Array.from(modal.querySelectorAll('.wzs-tabs .wzs-pill'))
          .find(item => /skin/i.test(item.textContent) === (view === 'skins'));
        setStoreView(modal, view);
        pill?.click();
        nativeRAF(() => { mountStoreRedesign(); setStoreView(modal, view); });
      });
    }

    if (modal.dataset.wzgHubBack !== '1') {
      modal.dataset.wzgHubBack = '1';
      modal.addEventListener('click', event => {
        if (!event.target.closest('.wzs-back')) return;
        if ((modal.dataset.wzgView || 'hub') === 'hub') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setStoreView(modal, 'hub');
      }, true);
    }

    if (!storeHubBound) {
      storeHubBound = true;
      document.addEventListener('click', event => {
        if (!event.target.closest?.('.store-btn, [data-target=".store-btn"]')) return;
        const reset = () => {
          const current = document.querySelector('.wzs-modal');
          if (current) setStoreView(current, 'hub');
        };
        reset();
        nativeRAF(reset);
        nativeTimeout(reset, 120);
      }, true);
    }
  }

  function mountSkinCategoryNavigation(modal, tabs) {
    let navigation = tabs.querySelector('.wzg-skin-groups');
    const body = modal.querySelector('.wzs-body');
    if (!body) return;

    const nativeList = modal.querySelector('#wzsSkinCats');
    if (!nativeList) return;
    const nativePanel = nativeList.parentElement;
    if (nativePanel && nativePanel.id !== 'wzs-skins' && !nativePanel.querySelector('#wzsSkinCanvas')) {
      nativePanel.classList.add('wzg-native-category-panel');
    }
    else {
      const categoryLabel = Array.from(modal.querySelectorAll('#wzs-skins *')).find(node =>
        /^categories$/i.test(node.textContent.trim())
        && !Array.from(node.children).some(child => /^categories$/i.test(child.textContent.trim()))
      );
      categoryLabel?.classList.add('wzg-native-category-heading');
    }
    {
      const originals = Array.from(nativeList.children)
        .filter(node => node.matches('button, [role="button"], a, .wzs-vbtn'));
      if (!originals.length) return;

      if (!navigation) {
        navigation = document.createElement('section');
        navigation.className = 'wzg-store-groups wzg-skin-groups';
        navigation.innerHTML = '<h5>Skin categories</h5><div class="wzs-vlist wzg-skin-category-list"></div>';
        tabs.appendChild(navigation);
      }

      const list = navigation.querySelector('.wzg-skin-category-list');
      const liveKeys = new Set();
      originals.forEach((original, index) => {
        const image = original.querySelector('img');
        const source = image?.currentSrc || image?.src || image?.getAttribute('src') || '';
        const text = original.textContent.trim();
        const key = text
          ? `text:${text.toLocaleLowerCase()}`
          : (source ? `image:${source}` : `custom:${index}`);
        const label = text || image?.alt?.trim() || image?.title?.trim() || original.title?.trim()
          || `Custom ${String(index + 1).padStart(2, '0')}`;
        liveKeys.add(key);

        let button = Array.from(list.children).find(item => item.dataset.skinKey === key);
        if (!button) {
          button = document.createElement('button');
          button.type = 'button';
          button.className = `wzs-vbtn wzg-skin-category${source ? ' wzg-skin-category--image' : ''}`;
          button.dataset.skinKey = key;
          button.title = label;
          button.setAttribute('aria-label', label);
          if (source) {
            const preview = document.createElement('img');
            preview.decoding = 'async'; preview.loading = 'lazy';
            preview.src = source;
            preview.alt = '';
            button.appendChild(preview);
          }
          else button.textContent = label;
          button.addEventListener('click', () => {
            list.querySelectorAll('.wzg-skin-category').forEach(item => item.classList.toggle('active', item === button));
            original.click();
          });
          list.appendChild(button);
        }

        button.classList.toggle('active', original.classList.contains('active'));
        original.classList.add('wzg-native-skin-tab');
      });

      Array.from(list.children).forEach(button => {
        if (!liveKeys.has(button.dataset.skinKey)) button.remove();
      });
      navigation.dataset.categoryCount = String(originals.length);
      return;
    }

  }

  function currentAccessoryID() {
    const input = document.getElementById('wzsAccMeta');
    const value = Number.parseInt(input?.value, 10);
    return Number.isFinite(value) ? value : null;
  }

  function feedback(message, type = '') {
    const node = document.getElementById(`${ID}-feedback`);
    if (!node) return;
    node.textContent = message;
    node.className = type;
  }

  function stopSearch(message = '') {
    if (state.searchTimer) nativeClearInterval(state.searchTimer);
    state.searchTimer = null;
    const button = document.getElementById(`${ID}-id-go`);
    if (button) button.textContent = 'Find';
    if (message) feedback(message);
  }

  function startSearch() {
    if (state.searchTimer) { stopSearch('Search cancelled'); return; }
    const target = Number.parseInt(document.getElementById(`${ID}-id-input`)?.value, 10);
    const prev = document.getElementById('wzsAccPrev');
    const next = document.getElementById('wzsAccNext');
    if (!Number.isFinite(target) || target < 1) { feedback('Enter a valid ID', 'bad'); return; }
    if (!prev || !next) { feedback('Open Store → Accessories first', 'bad'); return; }
    document.getElementById(`${ID}-id-go`).textContent = 'Stop';
    feedback(`Searching for #${target}…`);
    let steps = 0;
    let stalled = 0;
    let last = null;
    state.searchTimer = nativeInterval(() => {
      if (!next.isConnected || !next.getClientRects().length || document.hidden) { stopSearch('Search paused'); return; }
      const current = currentAccessoryID();
      if (current === target) { stopSearch(`Found #${target}`); feedback(`Found #${target}`, 'ok'); return; }
      stalled = current === last ? stalled + 1 : 0;
      last = current;
      if (steps++ > 3000 || stalled > 12) { stopSearch(`ID #${target} not found`); feedback(`ID #${target} not found`, 'bad'); return; }
      (current === null || current < target ? next : prev).click();
    }, 100);
  }

  function saveCurrentID() {
    const typed = Number.parseInt(document.getElementById(`${ID}-id-input`)?.value, 10);
    const id = Number.isFinite(typed) ? typed : currentAccessoryID();
    if (!id) { feedback('Choose or enter an ID first', 'bad'); return; }
    const nameInput = document.getElementById(`${ID}-id-name`);
    const requestedName = nameInput?.value.trim();
    const existing = state.saved.find(item => item.id === id);
    if (existing) {
      if (requestedName) existing.name = requestedName;
    }
    else state.saved.push({ id, name: requestedName || `Item ${id}` });
    persist();
    renderSaved();
    if (nameInput) nameInput.value = '';
    feedback(existing ? `Favorite #${id} updated` : `Favorite #${id} saved`, 'ok');
  }

  function renameSavedItem(idValue, nameValue) {
    const item = state.saved.find(entry => String(entry.id) === String(idValue));
    if (!item) return;
    item.name = String(nameValue || '').trim() || `Item ${item.id}`;
    persist();
    renderSaved();
    feedback(`Favorite #${item.id} renamed`, 'ok');
  }

  function renderSaved() {
    const box = document.getElementById(`${ID}-saved`);
    if (!box) return;
    const count = document.getElementById(`${ID}-saved-count`);
    if (count) count.textContent = `${state.saved.length} SAVED`;
    box.innerHTML = state.saved.length ? state.saved.map(item => `
      <article class="wzg-saved-item">
        <span class="wzg-saved-id">#${item.id}</span>
        <input data-name="${item.id}" value="${escapeHTML(item.name)}" maxlength="32" aria-label="Favorite name for accessory ${item.id}" title="Click to rename">
        <button data-open="${item.id}" class="wzg-saved-open" title="Open accessory">Open</button>
        <button data-remove="${item.id}" class="wzg-saved-remove" title="Remove favorite">×</button>
      </article>`).join('') : '<div class="wzg-saved-empty">No favorites saved yet.</div>';
  }

  function labelSections() {
    const center = document.querySelector('#centerPanel');
    if (center && !center.dataset.wzgLabelled) {
      center.dataset.wzgLabelled = '1';
      center.setAttribute('aria-label', 'Play and servers');
    }
  }

  function mountExtensionSettings(modal) {
    const tabbar = modal.querySelector('#settings-tabs');
    const body = modal.querySelector('.settings-body');
    if (!tabbar || !body) return;

    let tab = tabbar.querySelector('.tab[data-tab="extension"]');
    let section = body.querySelector('#tab-extension');
    if (!tab) {
      tab = document.createElement('button');
      tab.className = 'tab';
      tab.dataset.tab = 'extension';
      tab.textContent = 'Betterzilla';
      tabbar.appendChild(tab);
    }
    if (!section) {
      section = document.createElement('section');
      section.className = 'sectionS';
      section.id = 'tab-extension';
      body.appendChild(section);
    }

    if (!document.getElementById('wzg-hide-kill-feed')) section.insertAdjacentHTML('beforeend', `
      <label class="wzg-extra-toggle wzg-kill-feed-option">
        <span class="wzg-extra-copy"><strong>Hide kill feed</strong><small>Removes elimination messages from the right side of the game.</small></span>
        <span class="wzg-extra-switch"><input id="wzg-hide-kill-feed" type="checkbox" role="switch" aria-label="Hide kill feed" ${state.prefs.hideKillFeed ? 'checked' : ''}><span class="wzg-extra-track" aria-hidden="true"></span></span>
      </label>`);

    const killFeed = document.getElementById('wzg-hide-kill-feed');
    if (killFeed && !killFeed.dataset.wzgBound) {
      killFeed.dataset.wzgBound = '1';
      killFeed.addEventListener('change', event => {
        state.prefs.hideKillFeed = event.currentTarget.checked;
        persist();
        rearmKillFeedFilter();
        cleanDOMKillFeed();
      });
    }

    if (!tab.dataset.wzgExtensionBound) {
      tab.dataset.wzgExtensionBound = '1';
      tab.addEventListener('click', () => {
        modal.querySelectorAll('#settings-tabs .tab').forEach(item => item.classList.remove('active'));
        modal.querySelectorAll('.settings-body .sectionS').forEach(item => item.classList.remove('active'));
        tab.classList.add('active');
        section.classList.add('active');
      });
    }
  }
  function mountSettingsRedesign() {
    const modal = document.querySelector('.settings-modal');
    if (!modal) return;

    const tabs = {
      account: { icon: icons.account, title: 'Account', desc: 'Player information and account identifiers.' },
      general: { icon: icons.general, title: 'General', desc: 'Backgrounds, cursor and player cosmetics.' },
      audio: { icon: icons.audio, title: 'Audio', desc: 'Sons de combate, alertas e feedback da equipe.' },
      visual: { icon: icons.visual, title: 'Visual', desc: 'Cores do mapa, equipe e identificação do jogador.' },
      controls: { icon: icons.controls, title: 'Controls', desc: 'Comportamento da interface e controles de jogo.' },
      shortcuts: { icon: icons.shortcuts, title: 'Shortcuts', desc: 'Todos os atalhos essenciais em uma referência rápida.' },
      perf: { icon: icons.performance, title: 'Performance', desc: 'Qualidade, escala e opções avançadas de renderização.' },
      extension: { icon: icons.settings, title: 'Betterzilla', desc: 'Betterzilla visual and performance controls.' },
    };

    tabs.audio.desc = 'Combat sounds, alerts and team feedback.';
    tabs.visual.desc = 'Map, team and player identification colors.';
    tabs.controls.desc = 'Interface behavior and game controls.';
    tabs.shortcuts.desc = 'All essential shortcuts in one quick reference.';
    tabs.perf.desc = 'Quality, scale and advanced rendering options.';

    const tabbar = modal.querySelector('#settings-tabs');
    const body = modal.querySelector('.settings-body');
    let accountTab = tabbar?.querySelector('.tab[data-tab="account"]');
    let accountSection = body?.querySelector('#tab-account');
    if (tabbar && body && !accountTab) {
      accountTab = document.createElement('button');
      accountTab.className = 'tab';
      accountTab.dataset.tab = 'account';
      accountTab.textContent = 'Account';
      tabbar.prepend(accountTab);
    }
    if (body && !accountSection) {
      accountSection = document.createElement('section');
      accountSection.className = 'sectionS';
      accountSection.id = 'tab-account';
      body.prepend(accountSection);
    }
    const idRow = modal.querySelector('#playerId')?.closest('.opt');
    if (accountSection && idRow && idRow.parentElement !== accountSection) accountSection.appendChild(idRow);
    if (accountTab && accountSection && !accountTab.dataset.wzgAccountBound) {
      accountTab.dataset.wzgAccountBound = '1';
      accountTab.addEventListener('click', () => {
        modal.querySelectorAll('#settings-tabs .tab').forEach(tab => tab.classList.remove('active'));
        modal.querySelectorAll('.settings-body .sectionS').forEach(section => section.classList.remove('active'));
        accountTab.classList.add('active');
        accountSection.classList.add('active');
      });
    }

    mountExtensionSettings(modal);
    mountSpeedSettings(modal);
    mountConfigFiles(modal);
    if(!document.getElementById('wzg-sidebar-order-style')){const style=document.createElement('style');style.id='wzg-sidebar-order-style';style.textContent="html.wzg-ready .settings-modal,html.wzg-ready .settings-modal *{scrollbar-width:thin!important;scrollbar-color:rgba(190,190,205,.28) transparent!important}html.wzg-ready .settings-modal ::-webkit-scrollbar{width:6px!important;height:6px!important;background:transparent!important}html.wzg-ready .settings-modal ::-webkit-scrollbar-track{background:transparent!important;border:0!important;box-shadow:none!important;margin:8px 0!important}html.wzg-ready .settings-modal ::-webkit-scrollbar-thumb{background:rgba(190,190,205,.25)!important;border:1px solid rgba(255,255,255,.07)!important;border-radius:999px!important;box-shadow:inset 0 1px rgba(255,255,255,.08)!important}html.wzg-ready .settings-modal ::-webkit-scrollbar-thumb:hover{background:rgba(210,210,225,.42)!important}html.wzg-ready .settings-modal ::-webkit-scrollbar-thumb:active{background:rgba(220,220,235,.55)!important}html.wzg-ready .settings-modal ::-webkit-scrollbar-button{display:none!important;width:0!important;height:0!important}html.wzg-ready .settings-modal ::-webkit-scrollbar-corner{background:transparent!important}@supports selector(::-webkit-scrollbar){html.wzg-ready .settings-modal,html.wzg-ready .settings-modal *{scrollbar-width:auto!important;scrollbar-color:auto!important}}"+'html.wzg-ready #settings-tabs .wzg-sidebar-divider{height:1px;min-height:1px;flex:0 0 1px;background:rgba(255,255,255,.14);margin:9px 8px 10px;pointer-events:none}'+"html.wzg-ready #settings-tabs,html.wzg-ready .settings-body,html.wzg-ready .settings-modal .wc-groups{scrollbar-width:thin!important;scrollbar-color:#55555f #141416!important;color-scheme:dark!important}html.wzg-ready #settings-tabs::-webkit-scrollbar,html.wzg-ready .settings-body::-webkit-scrollbar{width:6px!important;background:#141416!important}html.wzg-ready #settings-tabs::-webkit-scrollbar-track,html.wzg-ready .settings-body::-webkit-scrollbar-track{background:#141416!important}html.wzg-ready #settings-tabs::-webkit-scrollbar-thumb,html.wzg-ready .settings-body::-webkit-scrollbar-thumb{background:#55555f!important;border-radius:99px!important;border:1px solid #141416!important}html.wzg-ready #settings-tabs::-webkit-scrollbar-button,html.wzg-ready .settings-body::-webkit-scrollbar-button{display:none!important;height:0!important;width:0!important}";document.head.appendChild(style);}

    mountCustomSettings(modal);
    const settingsTabs=modal.querySelector('#settings-tabs');if(settingsTabs){const config=settingsTabs.querySelector('[data-tab="configfiles"]');if(config)settingsTabs.appendChild(config);const extension=settingsTabs.querySelector('[data-tab="extension"]');if(extension&&!settingsTabs.querySelector('.wzg-sidebar-divider')){const divider=document.createElement('div');divider.className='wzg-sidebar-divider';divider.setAttribute('role','separator');extension.before(divider);}}

    mountFontSettings(modal);
    mountExtraSettings(modal);

    const close = modal.querySelector('#settings-close');
    if (close && !close.dataset.wzgIcon) {
      close.dataset.wzgIcon = '1';
      close.innerHTML = icons.arrowLeft;
      close.setAttribute('aria-label', 'Back');
      close.title = 'Back';
    }

    modal.querySelectorAll('#settings-tabs .tab[data-tab]').forEach(button => {
      const meta = tabs[button.dataset.tab];
      if (!meta || button.dataset.wzgIcon) return;
      button.dataset.wzgIcon = '1';
      button.innerHTML = `${meta.icon}<span>${meta.title}</span>`;
    });

    Object.entries(tabs).forEach(([key, meta]) => {
      const section = modal.querySelector(`#tab-${key}`);
      if (!section) return;
      const existing = section.querySelector(':scope > .wzg-settings-intro');
      if (existing) {
        const title = existing.querySelector('strong');
        const description = existing.querySelector('span');
        const count = existing.querySelector('b');
        const countText = `${section.querySelectorAll(':scope > .opt').length} OPTIONS`;
        if (title && title.textContent !== meta.title) title.textContent = meta.title;
        if (description && description.textContent !== meta.desc) description.textContent = meta.desc;
        if (count && count.textContent !== countText) count.textContent = countText;
        return;
      }
      const intro = document.createElement('div');
      intro.className = 'wzg-settings-intro';
      intro.innerHTML = `<div><strong>${meta.title}</strong><span>${meta.desc}</span></div><b>${section.querySelectorAll(':scope > .opt').length} OPTIONS</b>`;
      section.prepend(intro);
    });

    mountCustomSettingsControls(modal);
  }

  function mountCustomSettingsControls(modal) {
    const backgroundPreview = value => nativeMapPreview(value);
    mountBgSlots(modal);

    modal.querySelectorAll('.settings-body select').forEach(select => {
      if (select.dataset.wzgSelect) return;
      select.dataset.wzgSelect = '1';
      select.classList.add('wzg-native-select');

      const shell = document.createElement('div');
      shell.className = 'wzg-select';
      const isBackground = select.id === 'select-bg';
      if (isBackground) shell.classList.add('wzg-select--background');

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'wzg-select-trigger';
      trigger.setAttribute('aria-expanded', 'false');
      const valueBox = document.createElement('span');
      valueBox.className = 'wzg-select-value';
      const triggerPreview = document.createElement('span');
      triggerPreview.className = 'wzg-bg-thumb';
      const label = document.createElement('span');
      const icon = document.createElement('span');
      icon.innerHTML = icons.chevronDown;
      if (isBackground) valueBox.append(triggerPreview);
      valueBox.append(label);
      trigger.append(valueBox, icon);
      const menu = document.createElement('div');
      menu.className = 'wzg-select-menu';

      const sync = () => {
        label.textContent = select.selectedOptions[0]?.textContent?.trim() || 'Select';
        if (isBackground) {
          const url = backgroundPreview(select.value);
          if (url) triggerPreview.style.setProperty('--wzg-thumb', `url("${url}")`);
          else triggerPreview.style.removeProperty('--wzg-thumb');
          triggerPreview.textContent = url ? '' : (select.value.match(/\d+/)?.[0] || '—');
        }
        menu.querySelectorAll('.wzg-select-option').forEach(option => {
          option.classList.toggle('is-selected', option.dataset.value === select.value);
        });
      };

      [...select.options].forEach(option => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'wzg-select-option';
        item.dataset.value = option.value;
        if (isBackground) {
          const thumb = document.createElement('span');
          thumb.className = 'wzg-bg-thumb';
          const url = backgroundPreview(option.value);
          if (url) thumb.style.setProperty('--wzg-thumb', `url("${url}")`);
          thumb.textContent = url ? '' : (option.value.match(/\d+/)?.[0] || '—');
          item.appendChild(thumb);
        }
        const optionLabel = document.createElement('span');
        optionLabel.textContent = option.textContent.trim();
        item.appendChild(optionLabel);
        item.addEventListener('click', event => {
          event.stopPropagation();
          select.value = option.value;
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
          shell.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
          sync();
        });
        menu.appendChild(item);
      });

      trigger.addEventListener('click', event => {
        event.stopPropagation();
        const willOpen = !shell.classList.contains('is-open');
        document.querySelectorAll('.wzg-select.is-open').forEach(node => node.classList.remove('is-open'));
        shell.classList.toggle('is-open', willOpen);
        trigger.setAttribute('aria-expanded', String(willOpen));
      });
      select.addEventListener('change', sync);
      shell.append(trigger, menu);
      select.insertAdjacentElement('afterend', shell);
      sync();

      if (isBackground) {
        const upload = modal.querySelector('#bgFile');
        if (upload && !upload.dataset.wzgPreview) {
          upload.dataset.wzgPreview = '1';
          upload.addEventListener('change', () => {
            const file = upload.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.addEventListener('load', () => {
              state.mapCustomPreview = String(reader.result || '');
              const customThumb = shell.querySelector('.wzg-select-option[data-value="Custom"] .wzg-bg-thumb');
              if (customThumb) customThumb.style.setProperty('--wzg-thumb', `url("${state.mapCustomPreview}")`);
              if (select.value === 'Custom') triggerPreview.style.setProperty('--wzg-thumb', `url("${state.mapCustomPreview}")`);
            });
            reader.readAsDataURL(file);
          });
        }
      }
    });

    modal.querySelectorAll('.settings-body input[type="range"]').forEach(input => {
      const output = input.id ? modal.querySelector(`#${input.id}Out`) : null;
      if (!output) return;
      const sync = () => {
        if (output.textContent !== input.value) output.textContent = input.value;
      };
      if (!input.dataset.wzgOutput) {
        input.dataset.wzgOutput = '1';
        input.addEventListener('input', sync);
        input.addEventListener('change', sync);
      }
      sync();
    });

    if (!state.selectCloseBound) {
      state.selectCloseBound = true;
      document.addEventListener('click', () => {
        document.querySelectorAll('.wzg-select.is-open').forEach(node => {
          node.classList.remove('is-open');
          node.querySelector('.wzg-select-trigger')?.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  const hudOf=o=>o?.xj||o?.yj||o?.wj;
  const zoomKey=n=>typeof n.dj==='function'?'dj':'ji';
  let nativeCameraState;
  function installNativeCameraAccess() {
    const proto=PAGE.Object.prototype;
    if (Object.getOwnPropertyDescriptor(proto,'Re')) return;
    const capture=function(value) {
      Object.defineProperty(this,'Re',{value,writable:true,configurable:true,enumerable:true});
      if(typeof value!=='function'||!Object.hasOwn(this,'Lb')||!(Object.hasOwn(this,'at')||Object.hasOwn(this,'Wd'))||!Object.hasOwn(this,'wf')||!Array.isArray(this.gf)||!(Array.isArray(this.Uh)||Array.isArray(this.Vh)))return;
      nativeCameraState=this;
      if(Object.getOwnPropertyDescriptor(proto,'Re')?.set===capture)delete proto.Re;
    };
    Object.defineProperty(proto,'Re',{configurable:true,set:capture});
    nativeTimeout(()=>{if(Object.getOwnPropertyDescriptor(proto,'Re')?.set===capture)delete proto.Re;},120000);
  }
  installNativeCameraAccess();

  const extraPrefs = loadJSON('wzg-game-extras', {
    mobileHudLayout: true, hidePlayerTags: true, x1RedHelper: false, hideCurveIcon: false, wormateExtensionAbilities: false, replaceSpeedIcon: true, replaceMagnetIcon: true, antiLag: false, hideScorePopups: false, hideFoodGlow: false, lightFood: false, wormateFood: false, wormateAbilityHud: true, noScreenEffects: false, colorfulScoreboard: true,
    recordTop3: true, rankRedesign: true, rankSize: 75, fullScores: true, saturation: 100, wormateEffectIcons: true,
  });
  if(Object.hasOwn(extraPrefs,'wormatePotions')){
    if(extraPrefs.wormatePotions===true)extraPrefs.wormateFood=true;
    delete extraPrefs.wormatePotions;
    store.set('wzg-game-extras',JSON.stringify(extraPrefs));
  }
  delete extraPrefs.nativeZoomUnlock;
  extraPrefs.hidePlayerTags=true;
  delete extraPrefs.optimizeBodyGlow;
  extraPrefs.recordTop3=true;
  extraPrefs.colorfulScoreboard=true;
  extraPrefs.rankRedesign=true;
  extraPrefs.wormateAbilityHud=true;
  extraPrefs.replaceSpeedIcon=true;
  extraPrefs.replaceMagnetIcon=true;
  extraPrefs.saturation=Number.isFinite(Number(extraPrefs.saturation))?Math.max(0,Math.min(200,Number(extraPrefs.saturation))):100;
  let saturationStyle;
  function applyGameSaturation(){if(!saturationStyle){saturationStyle=document.createElement('style');saturationStyle.id='wzg-game-saturation';(document.head||document.documentElement).appendChild(saturationStyle);}saturationStyle.textContent=extraPrefs.saturation===100?'':'#gameCanvas{filter:saturate('+extraPrefs.saturation+'%)!important;}';}
  applyGameSaturation();
const speedReplacementRefs=new Set(),speedReplacementBound=new WeakSet();
const speedCustomOn=()=>!!(extraPrefs.replaceSpeedIcon||extraPrefs.wormateExtensionAbilities);
const curveCustomOn=()=>!!extraPrefs.wormateExtensionAbilities;
let greenSpeedTexture=null,greenSpeedLoading=null;

const SPEED_ICON_SIDE = -0.10;
const SPEED_ICON_FRONT = 0.00;

function applySpeedReplacement(entry){
  const {sprite,part,owner}=entry;if(sprite.destroyed)return;
  sprite.texture=speedCustomOn()&&greenSpeedTexture?greenSpeedTexture:entry.texture;
  const active=!!(speedCustomOn()&&greenSpeedTexture);
  part.gj=entry.ij*(active?1.3:1);part.kj=entry.lj*(active?1.3:1);

  if (active) {
    const targetParent = owner.qa?.H || owner.qa || hudOf(owner)?.Xa;
    if (targetParent && sprite.parent !== targetParent) {
      targetParent.addChild(sprite);
    }
    sprite.anchor.set(entry.ax + 0.45 + SPEED_ICON_FRONT, entry.ay + SPEED_ICON_SIDE);
    sprite.scale.set(entry.scaleX * 2.5, entry.scaleY * 2.5);
    sprite.zIndex = 9999;
  } else {
    if (entry.originalParent && sprite.parent !== entry.originalParent) {
      entry.originalParent.addChild(sprite);
    }
    sprite.anchor.set(entry.ax, entry.ay);
    sprite.scale.set(entry.scaleX, entry.scaleY);
    sprite.zIndex = entry.zIndex !== undefined ? entry.zIndex : 0;
  }
}

function refreshSpeedReplacement(){
  let sample;
  for(const ref of speedReplacementRefs){const entry=ref.deref();if(!entry||entry.sprite.destroyed){speedReplacementRefs.delete(ref);continue;}sample=entry;applySpeedReplacement(entry);}
  if(!speedCustomOn()||greenSpeedTexture||greenSpeedLoading||!sample)return;
  const Texture=sample.texture.constructor;
  greenSpeedLoading=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const context=canvas.getContext('2d');context.drawImage(img,150,0,106,84,0,13,128,102);greenSpeedTexture=Texture.from(canvas);resolve();}catch(e){reject(e)}};img.onerror=reject;assetURL('green-speed.png').then(u=>{img.src=u;},reject);});
  greenSpeedLoading.then(()=>{greenSpeedLoading=null;refreshSpeedReplacement();},error=>{greenSpeedLoading=null;console.warn('[Betterzilla] Speed icon could not load; keeping original.',error);});
}

PAGE.__wzgRefreshSpeed = refreshSpeedReplacement;

function bindSpeedReplacement(owner){
  const part=owner.qa?.H?.$b,sprite=part?.o;
  if(!sprite||speedReplacementBound.has(sprite))return;
  speedReplacementBound.add(sprite);
  const entry={
    part, sprite, owner,
    texture: sprite.texture,
    ij: part.gj, lj: part.kj,
    ax: sprite.anchor.x, ay: sprite.anchor.y,
    scaleX: sprite.scale.x, scaleY: sprite.scale.y, // Salva a escala original
    zIndex: sprite.zIndex,
    originalParent: sprite.parent
  };
  sprite.__wzgSpeedReplacement=entry;
  trackWeak(speedReplacementRefs,entry,e=>e.sprite.destroyed);
  if(greenSpeedTexture)applySpeedReplacement(entry);else if(speedCustomOn()&&!greenSpeedLoading)refreshSpeedReplacement();
}

const magnetReplacementRefs=new Set(),magnetReplacementBound=new WeakSet();
let wormateMagnetTexture=null,wormateMagnetLoading=null;
function refreshMagnetReplacement(){
  let sample;
  for(const ref of magnetReplacementRefs){const entry=ref.deref();if(!entry||entry.sprite.destroyed){magnetReplacementRefs.delete(ref);continue;}sample=entry;
    entry.sprite.texture=extraPrefs.replaceMagnetIcon&&wormateMagnetTexture?wormateMagnetTexture:entry.texture;
  }
  if(!extraPrefs.replaceMagnetIcon||wormateMagnetTexture||wormateMagnetLoading||!sample)return;
  const Texture=sample.texture.constructor;
  wormateMagnetLoading=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{try{
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
    canvas.getContext('2d').drawImage(img,170,98,58,100,27,0,74,128);
    wormateMagnetTexture=Texture.from(canvas);resolve();
  }catch(error){reject(error)}};img.onerror=reject;assetURL('green-speed.png').then(u=>{img.src=u;},reject);});
  wormateMagnetLoading.then(()=>{wormateMagnetLoading=null;refreshMagnetReplacement();},error=>{wormateMagnetLoading=null;console.warn('[Betterzilla] Magnet icon could not load; keeping original.',error);});
}
function bindMagnetReplacement(owner){
  const waves=owner.qa?.H?.qe;if(!Array.isArray(waves))return;
  let added=false;
  for(const part of waves){const sprite=part?.o;if(!sprite||magnetReplacementBound.has(sprite))continue;
    magnetReplacementBound.add(sprite);const entry={sprite,texture:sprite.texture};sprite.__wzgMagnetReplacement=entry;
    trackWeak(magnetReplacementRefs,entry,e=>e.sprite.destroyed);added=true;
    if(extraPrefs.replaceMagnetIcon&&wormateMagnetTexture)sprite.texture=wormateMagnetTexture;
  }
  if(added&&extraPrefs.replaceMagnetIcon&&!wormateMagnetTexture&&!wormateMagnetLoading)refreshMagnetReplacement();
}

const curveIconRefs=new Set(),curveIconsBound=new WeakSet();
const CUSTOM_CURVE_IMAGE='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADYAAAAsCAYAAAAuCEsgAAAZYElEQVR4nI16aawlx3Xed6qqt7svb99n3rzhDGfjMsNNlETSFEnZYCxQUiIJkiMDUmzZMhBZiYQgCOIAdhwkUWQEQeIICgQqkWxBtiRGYmwZtETK4pDUcChyFg5ne/PevH27++17u7uqTn70eyNacWwXcHFv3+6u7nOq6jvnfF9RaWIYnu9DSoko6iOJEzAAIoIQAgSAdr8ZALOFtQwpJXLZLFzPg7UWzAxmBpjBQHp1+mPv6/9tzADRrUMCACIYY6C1htYaxhiUy2VUymXESYKtzU2EvR5c14WUElJKEADLFmz3nswQxlokSQIAcBwHQsq//vDdBxMAQYAkgiSAjUYSR4AxkIJAzH/9BUH4OxvR3378c+f2zjLbv7NrpaS85R2lFJRSsNak3rcWUgm4kuBLhiMJkiyIAWYGUQRfCUgnQJ8YkQW0IRj+/47R324nAAGAiEGCIQTDMEMRQ4Khxd/DWXuGpdOLkSQJpJRwlII1Bmw1HMHIO4xywKgEQMmzyCi8UxL5YCGZma2Mm1aKl5uJQq3PaMeEMCEkDNi/p32CAEUMVwKuBKRlSABggtZANgMEnkXXWrgC6P0N9hEIoNSW1DCbDqsxBkmSwPccBJ6CwxpFhzCWZ0yV8N65QfmR6QExl3MwJgAfABisE0vdvuGd5aY+N79Dz9xsi2fXQ6AVAzEzDKdv8TfZSAAkMTwJZB1G2Us/OcX3Zhweyjg0mmjR11Kvwks2N6U9FwZAEgMg/lmftIcAlK5bEBQoXR/MDKM1pCtRDCRKjsL+gnnn8VH123ND8uT+YWdirKogBdKb9/ohQGscWKvbe69v8f0X1u273tykz9/sAI1IomcYxgLm5yxL1ysjkEDFtxjLMmZK/MnZCn55IIuZjCvyhYDKiRYmTGytZ8PV+RqdptB+XiZA2xL6zLACb8cp7NmjhCBYEGAZig0CkWAi7+D2qvzEu2fVvzw07sxUchKCgLBn0OunxjCQAgYD2QCYrCoMFfjoeJn3D2bskZ8s43dvtvHydp/QTQixJVikThEAXJGO0mDA2Ffgh+8ex2ePjIkHJquinPMJQgDW8u6LoqSt3n+wiQfzwN0FSV9caPOz6yHQZUBbwHI6akSUrv/y1Gj6MLYoeIz9JYl7p9x//vBt8tO3T8gpVxKaocHKjmleWtZvrjTMK7GlTWPYCAGRdTC3f0A8cHyfd2i4pCAEYbtlcWHJnju/jj++XKPfX+0I1BNCX6fedRVQdhnjeYvbyvzP7hzDx49MiiOVbDptO31GGDMaTY2MTyjnHOQCghTAVtvg+nqy9NNl/t6rq/Qby6GDRkSILMNYTicTM5QgAgmCT4yRLOPYCD72wH588vC4nPIcwuWluH92Ifnh1W37v1Za9PV6BPS1hbWAEIyMAi5tMy5v9X7/jin3yeMz3pHBgsCpWRwfrfDQ4E0+dm7DfHGhKc7UIoJlIO8y9hct7h7F1++aovdMlGkg6ws0Qsa1Nb20uMOXGj271umbJUfawnhZHpkecOcOjdmpSk4iO02Txaz5kJLW/cmq/YSFQKNPsOC9YJiiogNGziNMFQXu3ef8+qFRNedKYGHd2L+6ov/3ayv6Hy21GM2EEFuxO/RpH64AtnuMrZD/xXYYv9yO6dOn9rsPDRZI3TZCI1nXPlUIUCqs8VcW6vzNyALDGT551zh/5oH98qnJCnmGCWsN1hdumvPXtvH8RodfCCOuRxo/spaxFdEv1rT7YDOK3zld7L9jtCxp35AsM9P7Q803ega/F2mGtgTNDAKgwAwSQOAQxvPiUwdHnSOljMDajsar18zZyzXxB2uhQCsxMJbhCIYj0vnMuyikLVCPGFe2zDOxjRvNnti6Y0I8dmBUVCerwsv6/N6BjD1wYZUfb/cxP1bAgycnxaOTFXIiDVxZ0a1L6/ziSgs/DDXddB0R+NKOaIupKKE2C9Hc7Knnaz37+vyaXrl70jx5eMrNHBiVpVpoPrTW4R/W+nQ6NGl4ADEU78KjQ4yMR0MZjzJgoNFKUOuYTSKXqhmFvMOQlMYRKdO4YdMMCsam3ooNY61lX+hb/cJG2/nMZst8/PiMODaQF5RzaW44Z+aaXdsr+RSMVgiGgLdWzObL8/bbtb54yVOozFbx1MEh3FfMOGUQ607P9tbb9vJCh5/Z6MhXtlv0hzqO/cClX7592sNUmY6O5/nxpSafbsSExKTvpVKgYmjLiDVa2pCBIKecU9hXtu/wHfNv1YholTLuYCFAyZHkgUhTGtx1mqAwdSKu39wxV27WzHfrkf7GUlN+MdTq5nqH33/3tH30wIgY3DcqkSQiUDINpos73PrpEv9FvS/OFDwcPjpGTxyfphOVnADtZZyMcpjQ2HQtmji9IIqXW/TcWpu/t9rE4dssDlZyhLkB++h8g/71Rg/oCwLb3aloGQgTYK3NX5zfTH4l56o7hgcceL4oJYbe7fgCnkpR6W9qjBSauxGfXN7R7zy3lLzv0kby5Vqk/jTcFEuNvr221jSPzQ7R0cChrLasV5t8+fwyTq+0xV/mHT58bJyeuHOfOJHzgEbLoBVaWLANFEQhqzA3bOZ6sX1qY4uXW12sbbTsYjM0B8tZiamqPTi4io/4Cl8XUQr5yjJDMyHUhJstxkvX9dMSyB4el3PZjIQQKcq0I0atqZMw5pZhRERgELQA+a7gYikn/HJOUmnSnRoqiPFAxZWLWzpoJO73Lm3Ln6x0+NmLG/yI73BFG8TbIb1SD7HgChSOjfLHT8yIEzkX2KobXFzSN5YbfJGtcUZydOTIpJgYH2IcGMKJsSI93A7xjXrXrjXaBtW8ROAi8BUPOYLTisTuoqK1jF4CrHYIZ5fNH8SG69sd+/FqjoYFI68ZnVoolpd3zLWdjn49MabDRJEQQihBmUDxxFRZPDw7JI/uG3KGxspK/sJR8Zh4M8GFbU5WuvL7m3V+5UYDrwhKsxDNBEcCkxl9amqA9uU9oN3RuLaiWz9dNk8v1vS/8R08zvB/a7IvRocSlgWfMFT0huc342wY6bV+rMBgSHBWwGRgOM0eQLtrDEBigWafMW8J9b55+uKGfTqnGAIWlglGODBQCGOJfmTAsJDEUFLAVYTrNfu789vms3e37a/dPevNjVQkHrodj+FSontWrjZieb4W/yxLIDbIKQ3tmTOupCws0Aktdlpxox9zI58LHhutZI9NDopSPpNIR6bxRXlBq1r1Kj66AZFJ0ZkZbCEMMxKtoVnsgUcKkYkltGOLvhVoRgRPAYpSxAxci6zPyHkCGSnA1kAQ30pjEgOsd+gL51ZsWVL0sZPkTg0XFO6fwyNdk3yqHnm/0dICUWyhrQWsgbSMXsyod7hhhuVEMSdwYNSfKpScT0K59UqWRseKZraaZ0glcG1DrGz23NeFS61qgEIh24MkAcMUh7Fe60UMa50UFaUQ0MYAIFhixJbAOk1SHQayrkDFtxjM2kcmy+bRibK6SwnXgzUBAFigby2h0cN6MzQ3XOLxRsd2V9ZjkGUM5qR/27C978q2eWC1zaeNMUiMBTEjtAnW2xrnV8Rzs6NqZijn5A5MEfaxOMJitw4jRicivHUjfvPMIv60pp0flzLOzFBezFQLEpFmNCNnqc9Yim2EfpTAkoByXBem3/9ZKUGAkkDeYUwWCIcHxccODMgPjhbo4EhJjY+UVC5FR76V5DMDrdBiuynaccJGEXJsDPqRRTYjUAx4QFGcI3YAawBjYK2GFRYxSyx2g6dfW/EqB4dxd8GnQUdwjo3VUcx2p222b2xG115fjP5opYmv+r7BgOP9u4ovDrgOoRkSVjvu2djJXffzEVwdotePoDzXvVVBE6eFXsljTBcJp8bF7z0wqz42N+pMZl1ACoIBQ+vdKLObVkkJFAOFsYrMW2bomNENBbK+QMKERtc22j39F0nMUGB4SsMTQCkXYLBcQFAuvH4zUl+rr+nTHkXDrON8GPZkvR2u7LTia80+PxNqASmAshN9dCKjnxgr+BMMic2WqK10vR/HTvZ6sSoQqy6azQaU4zhwHQdGaygBFFzGRFbgzmHxO+85pD57cML1XEUII4taS2NxU281utwwTBEzQ8GWsh7lZ0bdYj4r4CmBTAbI5RRAwNW1pPXqQvKdlYaBSSwqDmGsoDA5kHtsqFyY9f3AashmpLm13cVb9VZ8ulZvnm+1OjBgSOXAVRKlgDGex7+6a9L56O0T8mC1INDsWpxfNqdv1Mz3WyxA0kWl4iGXy0GREPB8D9ZqeBxjNEu4Y4w+/dBt6lNzE47HDJybj6I3l+Nz621+tdHn1wFC4KoBJSjPxrgCnHljxeQcRRlPIVPJ0sj4gDNU7/HS2QX9zTfW9BfqPUbWE7h/Nv+B9xzxf3N2gE+5opONTTfaaouVxS17Y7HdXW61ui86MZ+vZhWUkg8GioYGs3T/VFncf3RC3jM5KBxHAs2exWvz8cUfXY2evLAVIgki5EsDCLI5+J4H2n/8MEgQEPdRpC5OjuGJxw+7//HUrHvEdwgXFuLwlRv6ews1+8f9xH4749CHSz6OTQ0491ZzcsQYpvVGvLrRxuk+BW8ZFax1wk47SaJXezGw0WW0YoliqYg7pqtzTx6K/vPtQ73HA9LEuyWCsUAnNuj02NTattHqoa4ZXUFQGYcq1YIoVnMik88Q+hFjtWaSN9ftC2eW7H86v8l/ttTUaPcZwnFRqVRQqVSgGAxFhEzgYCbj4I4x/szBEXUk6wqs1jReXdDPXd3h/55Y/GAkLz97ZFy+b7RIs2MlZzSXEWAGdtpydmFLj17atM/WRPYyeYNnV1a3sVarQ3oZjE6PYbyax0hRT40VwttdGGq3LFpdDSuAbJbgO4ThopQjJVk1hqu8S7ZJkXKc2jDqHcb1TXvlwhr+8tKm+Mp8Q5zZ6jMSEIRiaK2xvbWFTqcNlVJejLxHmC6rDx2fwj3DBYlYM66s6fn5Gj8dJvjBREn8+kO3Ob92x4wz5ykCLKBNCouFIeVODMrbc0ESvLLSWY1V6WxlbBo2Owjl+qiWS8gGgBR1BZPkjbFodxPc3Iyx08Oi48okG5AzXFJDlbwMHGeXqCWgr2E6IScrO3ZttcUXr27TMwst+eWNUKCRAAkYkAKKLEAEawzCbggFEASAQDIGc/KegQKVHEVYXk9wblk/u9PHtwo+Hjo1o371ngPunLAW3dCi3rbYaJiEGTReVWqoLHHnPndfN+l/6IXV2g8K+dlzfn4AlgQEDLq9DtabrfXlXLxUmeByoSCQ6wosNHltvY7nE9Bazsdk3rPjnuSiSKM/YotmK8LyZodO7/TpmU5M6BoBAwEpCZ6yYAYSEiAQeJcnVSCABKAEI1AYUIJgDGOrZdqbHf5xYgiVgI5OlMWcBLBZM3hzFZtXd+wPNxrxmZwn9t/e5adOgEcGqgrVLE9QrzGTyM45mQ9gjEa300Knvon17vobxSj6/nA+mJ2qyOzsuA9S5k53g+P5hvjmUkf+SdQUr2jLt/hBgGD3uELBGAj41DAZP7am2dbi3HZPohELdGMgFgLWGJAQUMQp+7rL8ykigImgLaJIo2mZ4CmqeoqyxjK6MbAVBy+tJ/jqcjv6PwOG/2Ff4xdI0sgeYRlF/aSdbGI4n4PQEbY3bmB7Yx0ZB7gqxedefCs6Kg55j41XpTw4rrxSnt9VWGP/yjaGVjtWNfv0YmwJghiesCh4eFfZ5yPDOdw/UcbBrEd5w4i2u3bh7DL/17dq4jlAghJACwFjDRS9jWx8G10IKUgqgUAQwzJiw+gTkSsF4DsyM1zJzZq4/9SA23t0vEJThbxALwHWG3a120/+zNga8lHuYNnnQwOVXtBUotGN8X1jCRfX7P8AIty9z31woqryYwMCvsf3lDM8slDj47UQH+4bWhLgTMbB2EAOE+MlOjiYw3Q1T9JVAFugk+BOV9hiX3O9b3A21hJWiHTE9jhCzYTIYscygYiR80S5Eoi7dvr2O50IN+uhXWegUClITEXxXSVr1EzgexXfHDgw5gTKkbi2rLfnt/g1YmDU6/3inLf+kWOT3p3elBhutn2zuG2uXlo3f1IPcfnciv1vW+3+W8en/EdOzDgnyjmBrGenJqs8FUa3HAlHcDYXkCxkBAQxrCXEfQMlgIFA4PgoHlmu8ye2e/ZsOyYkWuyWLbsce2yATkzXuxF3B3LITo8oHNrS790M7Y9qHfO1czeT905U5P6JqlKHPKpq230YzFDSh3KAt27GjTPz5vlal94YycvPHx0XH3joiDlZCHpgBmzVxbFpDE3OR4dfuaG/c7PO37m+zb+9HUYf3Gzh43fMqFNjFRocLEtISS4B7q4qhUQzOhFjdds2Gh3bsbGtDOWQmR13MFwkHBnld99o4f61Ll7qJCn1rbA7WmECrLTxg7fWzNm8S++qZAVOTDknF7f1h6/V8Nz1Hfm1v7rm4B4jnxgsiKrnMpgFmj2ENxb766ev9L/T6ImLlaw8dvuY88h9c+7xnA/UGgbNtoFyGGODLu7Y71VKWfmrry8mh86tmtJGx/zPl26ab95sq38yXuR3lHw76TlwBdi3DJ1Y6oYRwlqI5dUWP2ctcdUT7z7G9qPjsa2UMhLVHEayLoYFpSGC93hFy4xOYrHUtOfeWLF/NJClmXwgpiYGJe474D8pluR/aHH+RzvIf/fVHefVoB6NC5uUpZCyr7m5sllvbHd6Vyq+ue/IqHr85AH3YN4nrNU1XpuPL6w17GLWpcrxCHfOjrn+9LCiYl48UMzGuZevJ8WldvJfbtTUl5a7zpcU6Kgk9jgtHoxhfiM2Aj3NiA2QU0BWmf1SicT3BGJNaPW43ovRMG/j8JW1FsZaaKuxbiwubpo/zCkczbr4lbkxJ394yh1Uvv/kcpgPdhL3zFZLr/XCaKUfdinwnWypkC96fi4/Xe39g9kBc+r4Pmd/1hNYrVucvhK/cGZRf2G9w98NHIGNUP/7VoQP7BuU+0o5iXvmvOOOwD999UYyuRLG344S9XLHygt9bWF2LbO7pT6B4UtGyeMHJ4r8yOQADSuXsNUyuLyBl7dCej426bVghtJJcktqTRINJAa+UJ8u5Z18Ka8+PFy0zuFRfVux2Spd26QDq1G4Gra6q8rqSLIY9NzuxORAMDk66R0ZKdnAcwkbTaPPzOvnf7zA77m0YdGMASkNtkJ8rtbjsydGzW/dOe28Y3xQ4p45f7aaE795YTk5tdKNn21r72Kzx3/etwy2KYUhiREoPj7g25MzRf7AyRnx6PigQF8Trm/x1Ss18ZWtnkC0y1ALIqg9qTaJYyglgEIZVB1CzfW/fK3V9oRsPzmQTTIz1XB4ILCP90YsdlrKAAo5n2QuYGT8PnyXEGmBm9u6dfZG8uMXF8Uv3Wg52IgsOn0NSUAvYXS1/Ua9x9/oJvyte63zxP5hFRyd8bL7htXD63Xz0HojWdkK6a1+YkNtKZIET0nIrMNDE2U6OFmVxWKOEGvgxobp/OQmfXWhKZ5rRClZeqtgLk+OAEQoFPIYGhrG8EAV5ZyPgtIo2tqJMbHxySODvfftG6TxfJCmLeCU59gjgozldEqs6OuvLyffOrdmP7fYkeiwh07foNvr7ykgyHoS1QCYLgDHR8Tv3DMt//GBYTUzUJCQEtAG0Dplsva0dyEYAgTXJQhK1ZirG7z40g3+xmvr4vPLXYlmsmvYrlZNE4dmUa5UUK1WUSgU4DgOkqiHdm0bprODArcwW7YfPjAo3zecw6Gyj30jZZV3XKDRtslW26zUQ15fqtvzV7ft04sN++Jah9HWEpAeQAK9KEKSJBAAlJLIugIFlzGUYcwU6d2HBsWnDgyKk7PDcnawqFKxnpBq3bTnvNSglRo2Fmt8/vI2ffNyTXxppSvQTggJi1tCCQDQfe95CKViEZ7vQ2uNVrOJWq2GdrMBk0TIOcBgVmI4L1Hy+L6CSg4P5vCAo0g1Qr661eHX6n3+850eUOsxmn2LbsyImaCkgrO7XaLf78NaCyEIjpRwJCGjGAWHMZxjTOTosf0D9MGRopzJ+7Kc9ZyCFJCx5ig2CCODZqNHa0sN/tFKW3xpo0fY6Qt0E4GEdxPCtzX6pQ+9H8yMMOyiXm+gXqshDENYZjhKwXckPEci60kEDiB0DJgYBAttCT2d0uOxsegbgjYWibHpIhYCnudBKYU4ihDHMYD0fyklxO5ugIxjkXeAogvkXCDrEqqFzMO+5wRJYnXfYDsyeC00qTraTVLmum+B2KSU9K3NErtLRPV6PTSbTezs7KDdbsMYkxrkeRBCgIWAJomulYi1gDUSYcdAJwZMaeZtmMAQsJbBELtat4XdBSYpJZTjQBsNYywsc6p7g1IxxBI6EWNLAi6lWXyuGf8wn/cgpYK2NlV3kNJxUjECIpgYiJlA4meiwt7aVwsLC2g2m0iSBK7jIAgCCCEgiCCVSj0rBEBphgJSYOWh309grUFK7vNuYZj6jYUAM8Myw+7usnFdF47jwJgoPWftbr+p7BMDMJoByVDSAmzhkEAxE0DCIN3iYdFLBBp9gXbE6Bp5y5Cfb1ScGIKjHDiOAxJid5rsThWxe+NebUQAkYAxBu12G/1+LxUB6O0e29POGMakG2GklPB9H0II9Hq9lOojQAoJEgLW2hRfmW/t+XAkI3AEAk9CiTQ7inWa+mkW0JawRx/cMm5v9w4R/i+0+uEIsQm+wwAAAABJRU5ErkJggg==';
let curveSpeedSyncStarted=false;
function startCurveSpeedSync(){
  if(curveSpeedSyncStarted)return;
  curveSpeedSyncStarted=true;
  let curveTickPhase=0;
  const tick=()=>{
    if(!curveCustomOn()){curveSpeedSyncStarted=false;return;}
    if((curveTickPhase^=1)===1){nativeRAF(tick);return;}   // espelha a cada 2 frames (imperceptivel)
    {
      for(const ref of curveIconRefs){
        const entry=ref.deref();
        if(!entry||entry.icon.destroyed){curveIconRefs.delete(ref);continue;}
        const {icon,speed}=entry;
        if(!speed||speed.destroyed)continue;
        icon.visible=speed.visible!==false;
        icon.renderable=speed.renderable!==false;
        icon.alpha=speed.alpha;
      }
    }
    nativeRAF(tick);
  };
  nativeRAF(tick);
}
let customCurveTexture=null,customCurveLoading=null;
function refreshCurveIcons(){
  const custom=curveCustomOn();
  if(custom)startCurveSpeedSync();
  for(const ref of curveIconRefs){const entry=ref.deref();if(!entry||entry.icon.destroyed){curveIconRefs.delete(ref);continue;}
    const icon=entry.icon;
    icon.texture=custom&&customCurveTexture?customCurveTexture:entry.texture;
    if(!custom){
      icon.visible=true;icon.alpha=entry.alpha;
      icon.renderable=extraPrefs.hideCurveIcon?false:entry.renderable;
    }
  }
  if(!custom||customCurveTexture||customCurveLoading||!curveIconRefs.size)return;
  let sample;for(const ref of curveIconRefs){const entry=ref.deref();if(entry&&!entry.icon.destroyed){sample=entry;break;}}
  if(!sample)return;
  const Texture=sample.icon.texture.constructor;
  customCurveLoading=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,128,128);const ratio=Math.min(116/img.naturalWidth,116/img.naturalHeight);const w=img.naturalWidth*ratio,h=img.naturalHeight*ratio;ctx.drawImage(img,(128-w)/2,(128-h)/2,w,h);customCurveTexture=Texture.from(canvas);resolve();}catch(e){reject(e)}};img.onerror=reject;img.src=CUSTOM_CURVE_IMAGE;});
  customCurveLoading.then(()=>{customCurveLoading=null;refreshCurveIcons();},e=>{customCurveLoading=null;console.warn('[Betterzilla] Custom curve icon failed to load.',e);});
}
function bindCurveIcon(owner){
  const icon=owner.qa?.H?.Mc?.o;
  const speed=owner.qa?.H?.$b?.o?.__wzgSpeedReplacement?.sprite||owner.qa?.H?.$b?.o;
  if(!icon||curveIconsBound.has(icon))return;
  curveIconsBound.add(icon);icon.__wzgCurveRenderable=icon.renderable;
  const entry={icon,speed,owner,renderable:icon.renderable,alpha:icon.alpha,texture:icon.texture};
  icon.__wzgCurveEntry=entry;
  trackWeak(curveIconRefs,entry,e=>e.icon.destroyed);
  icon.renderable=curveCustomOn()?icon.renderable:(extraPrefs.hideCurveIcon?false:icon.__wzgCurveRenderable);
  refreshCurveIcons();
  startCurveSpeedSync();
}

const redHelperEntries=new Set(),redHelperBorders=new WeakSet();
function refreshRedHelper(){
  for(const ref of redHelperEntries){const border=ref.deref();if(!border||border.destroyed){redHelperEntries.delete(ref);continue;}
    border.zIndex=extraPrefs.x1RedHelper?20000:border.__wzgRedOriginalZ;
  }
}
function bindRedHelper(owner){
  const border=hudOf(owner)?.fh;
  if(!border||redHelperBorders.has(border))return;
  redHelperBorders.add(border);border.__wzgRedOriginalZ=border.zIndex;
  trackWeak(redHelperEntries,border,b=>b.destroyed);
  border.zIndex=extraPrefs.x1RedHelper?20000:border.__wzgRedOriginalZ;
}

  const segmentHookSyncs=[];
  const lightweightSegmentPrototypes=new WeakSet();
  function bindLightweightBodies(owner){
    const segment=owner.qa?.i?.[0];
    if(!segment?.J?.o || !segment?.id?.o)return;
    const proto=Object.getPrototypeOf(segment);
    if(lightweightSegmentPrototypes.has(proto)||typeof proto.ba!=='function')return;
    lightweightSegmentPrototypes.add(proto);
    const original=proto.ba;
    const patched=function(x,y,size,glow,angle){
      if(!extraPrefs.antiLag)return original.call(this,x,y,size,glow,angle);
      this.J.Aa(true);this.J.Je(x,y);this.J.ib(size);(this.J.Ph||this.J.Qh).call(this.J,angle);
      if(this.id.yd())this.id.Aa(false);
    };
    const sync=()=>{proto.ba=extraPrefs.antiLag?patched:original;};segmentHookSyncs.push(sync);sync();
  }

  const playerTagRefs = new Set();
  function updatePlayerTags() {
    for (const ref of playerTagRefs) {
      const entry=ref.deref();
      if(!entry || entry.tag.destroyed) {playerTagRefs.delete(ref);continue;}
      entry.apply();
    }
  }
  const CUSTOM_DATA = {textures:{},regions:{},skin:{},eyes:{},mouth:{},glasses:{},hat:{},glows:{},groups:[]};
  const customDefaults={enabled:false,skin:'original',eyes:'original',mouth:'original',glasses:'original',hat:'original'};
  const customPrefs=loadJSON('wzg-custom',customDefaults);
  function sanitizeCustomPrefs(){for(const k of ['skin','eyes','mouth','glasses','hat'])if(customPrefs[k]!=='original'&&!Object.hasOwn(CUSTOM_DATA[k],customPrefs[k]))customPrefs[k]='original';}
  customPrefs.enabled=customPrefs.enabled===true;
  const customImages=new Map(),customLoads=new Map(),customAssets=new Map();
  let customOwner=null,customStatus='';
  const customEntries=new Set();
  function refreshCustomEntries(){let failure=null;for(const ref of customEntries){const entry=ref.deref();if(!entry||entry.visual.Ba.destroyed){customEntries.delete(ref);continue;}try{customApply(entry);}catch(error){failure=error;console.error('[Betterzilla] customRefresh',error);}}if(failure)throw failure;}
  function bindCustomVisual(visual){if(visual.__wzgCustom)return visual.__wzgCustom;const entry={visual,original:visual.vc,args:null};visual.__wzgCustom=entry;trackWeak(customEntries,entry,e=>e.visual?.Ba?.destroyed);visual.vc=function(...args){entry.args=args;if(!customPrefs.enabled){entry.original.apply(visual,args);return;}try{customApply(entry);}catch(e){entry.original.apply(visual,args);customMessage('4.28.2: '+(e?.message||String(e)));console.error('[Betterzilla] customApply',e);}};return entry;}
  function installCustomPreview(){const proto=PAGE.Object.prototype;if(Object.getOwnPropertyDescriptor(proto,'lc'))return;const setter=function(value){Object.defineProperty(this,'lc',{value,writable:true,configurable:true,enumerable:true});if(!this.A?.H||!Array.isArray(this.A.i)||typeof this.A.vc!=='function')return;if(Object.getOwnPropertyDescriptor(proto,'lc')?.set===setter)delete proto.lc;bindCustomVisual(this.A);customRefresh();};Object.defineProperty(proto,'lc',{configurable:true,set:setter});}
  installCustomPreview();
  function customMessage(message){customStatus=message;document.querySelectorAll('[data-custom-status]').forEach(e=>e.textContent=message);}
  function customImage(key){
    if(customImages.has(key))return Promise.resolve(customImages.get(key));
    if(customLoads.has(key))return customLoads.get(key);
    const promise=new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>{customImages.set(key,img);resolve(img);};img.onerror=()=>reject(Error('Could not load the Wormate images. Check your connection and try again.'));img.src='https://resources.wormate.io'+CUSTOM_DATA.textures[key];});
    customLoads.set(key,promise);promise.catch(()=>customLoads.delete(key));return promise;
  }
  function customAsset(id,sample){
    if(customAssets.has(id))return customAssets.get(id);
    const r=CUSTOM_DATA.regions[id],img=customImages.get(r.texture);if(!img)throw Error('Image not loaded.');
    const Texture=sample.texture.constructor,Rect=sample.texture.frame.constructor;
    let base=customAssets.get('base:'+r.texture);if(!base){base=Texture.from(img);customAssets.set('base:'+r.texture,base);}
    const texture=new Texture({source:base.source,frame:new Rect(r.x,r.y,r.w,r.h)});
    const pw=r.pw||r.w,ph=r.ph||r.h,px=r.px||pw/2,py=r.py||ph/2;
    const asset={Sb:true,km:.5-(px-.5*pw)/r.w,db:.5-(py-.5*ph)/r.h,rm:r.w/pw,wm:r.h/ph,Lg:()=>texture,Kg:()=>texture};
    if(customAssetInterface){const api=customAssetInterface;Object.assign(asset,{[api.texture]:()=>texture,[api.x]:asset.km,[api.y]:asset.db,[api.w]:asset.rm,[api.h]:asset.wm});}
    customAssets.set(id,asset);return asset;
  }
  let customAssetInterface=null;
  function detectCustomAssetInterface(visual){
    if(customAssetInterface)return;
    const wrapper=visual.i?.[0]?.J;if(typeof wrapper?.wb!=='function')return;
    const source=Function.prototype.toString.call(wrapper.wb);
    const texture=source.match(/\.texture\s*=\s*\w+\.([\w$]+)\(\)/);
    const anchor=source.match(/\.anchor\.set\(\s*\w+\.([\w$]+)\s*,\s*\w+\.([\w$]+)/);
    const dimensions=[...source.matchAll(/this\.[\w$]+\s*=\s*\w+\.([\w$]+)(?![\w$]|\s*\()/g)].map(m=>m[1]);
    if(texture&&anchor&&dimensions.length>=2)customAssetInterface={texture:texture[1],x:anchor[1],y:anchor[2],w:dimensions[0],h:dimensions[1]};
  }
  function bindCustomGlasses(visual){
    const head=visual.H;if(!head||head.__wzgGlassesGuard||typeof head.ld!=='function')return;
    head.__wzgGlassesGuard=true;const native=head.ld;
    head.ld=function(z,layer,assets){
      if(z===.005&&customPrefs.enabled){
        const selection=customPrefs.glasses;
        if(selection==='original'&&customPrefs.skin!=='original')assets=[];
        else if(selection!=='original'){
          const ids=CUSTOM_DATA.glasses[selection],sample=visual.i[0]?.J?.o;
          if(ids&&sample&&ids.every(id=>customImages.has(CUSTOM_DATA.regions[id].texture)))assets=ids.map(id=>customAsset(id,sample));
        }
      }
      return native.call(this,z,layer,assets);
    };
  }
  function customApply(entry){
    bindCustomGlasses(entry.visual);
    detectCustomAssetInterface(entry.visual);
    if(!entry.args||entry.visual.Ba.destroyed)return;
    const args=entry.args.slice(),prefs=customPrefs;
    const sample=entry.visual.i[0]?.J?.o;if(!sample)return;
    entry.original.apply(entry.visual,args);
    if(prefs.enabled){for(const [key,layer,z] of [['eyes','Ac',.002],['mouth','Bc',.003],['glasses','Cc',.005],['hat','Yb',.004]]){
      if(prefs[key]==='original')continue;const regions=CUSTOM_DATA[key][prefs[key]];
      if(regions.every(id=>customImages.has(CUSTOM_DATA.regions[id].texture)))entry.visual.H.ld(z,entry.visual.H[layer],regions.map(id=>customAsset(id,sample)));
    }}
    if(prefs.enabled&&prefs.skin!=='original'){
      const ids=CUSTOM_DATA.skin[prefs.skin];
      if(ids.length&&ids.every(id=>customImages.has(CUSTOM_DATA.regions[id].texture))){const assets=ids.map(id=>customAsset(id,sample));const glowIds=CUSTOM_DATA.glows[prefs.skin]||[];const glows=glowIds.map(id=>customAsset(id,sample));entry.visual.i.forEach((segment,i)=>{segment.J.wb(assets[i%assets.length]);if(glows.length){segment.id.wb(glows[i%glows.length]);segment.id.fe(0xffffff);segment.id.o.alpha=1;}});}
    }
  }
  async function customRefresh(){
    if(!customPrefs.enabled){refreshCustomEntries();customMessage('Original appearance restored.');return;}
    try{
      const keys=new Set();for(const category of ['skin','eyes','mouth','glasses','hat'])if(customPrefs[category]!=='original')for(const id of CUSTOM_DATA[category][customPrefs[category]])keys.add(CUSTOM_DATA.regions[id].texture);
      if(customPrefs.skin!=='original')for(const id of CUSTOM_DATA.glows[customPrefs.skin]||[])keys.add(CUSTOM_DATA.regions[id].texture);
      if(keys.size)customMessage('Loading Wormate images…');await Promise.all([...keys].map(customImage));
      refreshCustomEntries();customMessage(customEntries.size?'Custom look enabled.':'4.28.2: waiting for the game binding. Reload with only this version enabled.');
    }catch(e){customMessage('4.28.2: '+(e?.message||String(e)));}
  }
  const CUSTOM_DATA_FILE = 'custom';
  const CUSTOM_DATA_CACHE = 'wzg-custom-data-cache';
  let customDataReady = false;
  function validCustomData(d) {
    return !!d && typeof d === 'object' && d.textures && d.regions && d.skin && d.eyes && d.mouth
      && d.glasses && d.hat && d.glows && Array.isArray(d.groups);
  }
  function applyCustomData(d) {
    if (customDataReady || !validCustomData(d)) return false;
    Object.assign(CUSTOM_DATA, d);
    customDataReady = true;
    sanitizeCustomPrefs();
    return true;
  }
  function loadCustomData() {
    let cached = null;
    try { cached = store.get(CUSTOM_DATA_CACHE); } catch {}
    if (cached) { try { applyCustomData(JSON.parse(cached)); } catch {} }
    assetText(CUSTOM_DATA_FILE).then(text => {
      const parsed = JSON.parse(text);
      if (!validCustomData(parsed)) throw Error('The custom data file has an invalid format.');
      const usedNow = applyCustomData(parsed);
      try { store.set(CUSTOM_DATA_CACHE, text); } catch {}
      if (usedNow) {            // data arrived late: build the Custom tab and re-apply the look
        mountSettingsRedesign();
        if (customPrefs.enabled) customRefresh();
      }
    }).catch(error => {
      if (!customDataReady) console.warn('[Betterzilla] Could not load the custom data file; the Wormate skins tab is unavailable.', error);
    });
  }
  loadCustomData();
  function snakeInitMethod(owner){return typeof owner.dk==='function'?'dk':(typeof owner.ck==='function'?'ck':null);}
  function bindCustomSnake(owner){
    if(owner.B?.Ya!==owner.F?.G||!owner.qa||owner.qa.__wzgCustom)return;
    const visual=owner.qa;customOwner=bindCustomVisual(visual);
    nativeTimeout(()=>{if(owner.qa!==visual||visual.Ba.destroyed)return;const initName=snakeInitMethod(owner);if(initName){owner[initName]();customRefresh();}else{customMessage('Game version not recognized: custom look binding unavailable.');}},0);
  }
  function mountCustomSettings(modal){if(!customDataReady)return;
    const tabs=modal.querySelector('#settings-tabs'),body=modal.querySelector('.settings-body');if(!tabs||!body||body.querySelector('#tab-custom'))return;
    const tab=document.createElement('button');tab.type='button';tab.className='tab';tab.dataset.tab='custom';tab.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6h8a4 4 0 0 1 0 8H9a2 2 0 0 0 0 4h9M7 6a3 3 0 1 0 0 6h2"/><circle cx="5" cy="8" r=".7" fill="currentColor" stroke="none"/></svg><span>Wormate skins</span>';
    const section=document.createElement('section');section.id='tab-custom';section.className='sectionS';
    section.innerHTML=`<div class="wc-mode"><button type="button" data-mode="skin">Skins</button><button type="button" data-mode="wear">Clothing</button><label><input type="checkbox" role="switch" data-enabled> Apply custom look</label></div><div class="wc-panel"><header class="wc-header"><button type="button" data-back aria-label="Return to skins">❮</button><span data-title>Skins</span><span class="wc-local">4.28.2</span></header><div class="wc-clothing" role="tablist" aria-label="Accessories"></div><div class="wc-content"><div class="wc-stage"><canvas width="640" height="360" aria-label="Selected snake and accessories preview"></canvas><button type="button" class="wc-arrow wc-prev" aria-label="Previous item">❮<small>°◦</small></button><button type="button" class="wc-arrow wc-next" aria-label="Next item"><small>◦°</small>❯</button><span class="wc-item-name" data-select aria-live="polite"></span></div><aside class="wc-groups" aria-label="Skin categories"></aside></div></div><footer class="wc-footer"><button type="button" data-reset>Restore original</button><button type="button" data-retry>Retry images</button><span data-custom-status role="status"></span></footer>`;
    tabs.append(tab);body.append(section);tab.onclick=()=>{modal.querySelectorAll('#settings-tabs .tab,.settings-body .sectionS').forEach(e=>e.classList.remove('active'));tab.classList.add('active');section.classList.add('active');};
    let mode='skin',wear='eyes',group=null,revision=0;const select=section.querySelector('[data-select]'),canvas=section.querySelector('canvas'),ctx=canvas.getContext('2d'),enabled=section.querySelector('[data-enabled]');enabled.checked=customPrefs.enabled;
    const labels={eyes:'Eyes',mouth:'Mouth',glasses:'Glasses',hat:'Hats'};
    const art={eyes:'<ellipse cx="31" cy="27" rx="17" ry="19"/><ellipse cx="76" cy="27" rx="17" ry="19"/><circle cx="31" cy="32" r="10"/><circle cx="76" cy="32" r="10"/>',mouth:'<path d="M9 12 Q54 25 99 12 Q54 63 9 12Z"/>',glasses:'<circle cx="30" cy="29" r="17"/><circle cx="79" cy="29" r="17"/><path d="M47 25 Q54 19 62 25 M13 23 L6 19 M96 23 L103 19"/>',hat:'<path d="M13 35 Q54 45 97 35 L100 44 Q54 53 10 44Z M20 36 L26 17 Q54 33 82 17 L90 36"/><circle cx="29" cy="13" r="9"/><circle cx="80" cy="13" r="9"/>'};
    for(const key of Object.keys(labels)){const b=document.createElement('button');b.type='button';b.dataset.wear=key;b.setAttribute('role','tab');b.setAttribute('aria-label',labels[key]);b.innerHTML='<svg viewBox="0 0 110 58" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">'+art[key]+'</svg>';b.onclick=()=>{wear=key;sync();};section.querySelector('.wc-clothing').append(b);}
    const groups=section.querySelector('.wc-groups');for(const g of [{id:'all',name:'All skins'},...CUSTOM_DATA.groups]){const b=document.createElement('button');b.type='button';b.textContent=g.name;b.dataset.group=g.id;b.onclick=()=>{group=g.id==='all'?null:g;sync();};groups.append(b);}
    const key=()=>mode==='skin'?'skin':wear;
    const list=()=>mode==='skin'?(group?group.ids:Object.keys(CUSTOM_DATA.skin)):Object.keys(CUSTOM_DATA[wear]);
    function save(){store.set('wzg-custom',JSON.stringify(customPrefs));customRefresh();draw();}
    function choose(value){customPrefs[key()]=value;customPrefs.enabled=true;enabled.checked=true;save();sync(false);}

    function step(delta){const values=['original',...list()],i=values.indexOf(customPrefs[key()]);choose(values[(i+delta+values.length)%values.length]);}
    section.querySelector('.wc-prev').onclick=()=>step(-1);section.querySelector('.wc-next').onclick=()=>step(1);
    section.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;sync();});section.querySelector('[data-back]').onclick=()=>{mode='skin';sync();};
    enabled.onchange=()=>{customPrefs.enabled=enabled.checked;save();};section.querySelector('[data-reset]').onclick=()=>{Object.assign(customPrefs,customDefaults);enabled.checked=false;save();sync();};section.querySelector('[data-retry]').onclick=()=>{customRefresh();draw();};
    function sync(redraw=true){section.dataset.mode=mode;section.querySelector('[data-title]').textContent=mode==='skin'?'Skins':'Clothing';section.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));section.querySelectorAll('[data-wear]').forEach(b=>{b.classList.toggle('selected',b.dataset.wear===wear);b.setAttribute('aria-selected',String(b.dataset.wear===wear));});groups.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b.dataset.group===(group?.id||'all')));const value=customPrefs[key()];select.textContent=value==='original'?'Original':mode==='skin'?'SKIN '+value:(CUSTOM_DATA[wear][value].length?labels[wear]+' '+value:'None');if(redraw)draw();}
    let paint=null,framePending=false,inView=false,lastPaint=-Infinity;
    function animate(time){framePending=false;if(!section.isConnected){visibility.disconnect();document.removeEventListener('visibilitychange',wake);return;}if(!inView||document.hidden||!paint)return;if(time-lastPaint>=1000/30){paint(time);lastPaint=time;}framePending=true;nativeRAF(animate);}
    function wake(){if(inView&&!document.hidden&&paint&&!framePending){framePending=true;nativeRAF(animate);}}
    const visibility=new IntersectionObserver(entries=>{inView=entries.some(e=>e.isIntersecting);wake();});visibility.observe(canvas);document.addEventListener('visibilitychange',wake);
    async function draw(){const rev=++revision;const skin=customPrefs.skin==='original'?null:customPrefs.skin,base=skin?CUSTOM_DATA.skin[skin]:[],glow=skin?CUSTOM_DATA.glows[skin]||[]:[];const layers=['eyes','mouth','hat','glasses'].flatMap(k=>customPrefs[k]==='original'?[]:CUSTOM_DATA[k][customPrefs[k]]);const regions=[...base,...glow,...layers];try{await Promise.all([...new Set(regions.map(id=>CUSTOM_DATA.regions[id].texture))].map(customImage));if(rev!==revision)return;
      const parts=new Map(regions.map(id=>{const r=CUSTOM_DATA.regions[id],pw=r.pw||r.w,ph=r.ph||r.h;return [id,{r,img:customImages.get(r.texture),ax:.5-((r.px||pw/2)-.5*pw)/r.w,ay:.5-((r.py||ph/2)-.5*ph)/r.h,w:r.w/pw,h:r.h/ph}];}));
      const part=(id,x,y,size,angle=0)=>{const p=parts.get(id),r=p.r,w=size*p.w,h=size*p.h;ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.drawImage(p.img,r.x,r.y,r.w,r.h,-p.ax*w,-p.ay*h,w,h);ctx.restore();};
      const size=74,left=170,right=470,y=167,count=Math.round((right-left)/(size/4))+1;
      paint=time=>{ctx.clearRect(0,0,640,360);const phase=time/200,wave=i=>Math.cos(i/12*Math.PI-phase)*(1-Math.pow(16,-i/12))*size/4;
        for(let pass=0;pass<2;pass++)for(let i=count-1;i>=0;i--){const x=right-(right-left)*i/(count-1),cy=y+wave(i),angle=Math.atan2(wave(Math.max(0,i-1))-wave(i),(right-left)/(count-1));if(pass===0&&glow.length)part(glow[i%glow.length],x,cy,size*1.5,angle);if(pass===1){if(base.length)part(base[i%base.length],x,cy,size,angle);else{ctx.fillStyle='#dfc996';ctx.beginPath();ctx.arc(x,cy,size/2,0,Math.PI*2);ctx.fill();}}}
        const headAngle=Math.atan2(-wave(1),(right-left)/(count-1));for(const id of layers)part(id,right,y,size,headAngle);
        if(!skin){ctx.fillStyle='#92929f';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText('Neutral preview · original game skin unchanged',320,280);}
      };paint(performance.now());wake();
    }catch(e){if(rev===revision)customMessage(e.message);}}
    const style=document.createElement('style');style.textContent="#tab-custom.active{display:block!important;width:100%!important}#tab-custom{font-family:Arial,sans-serif;color:#fff}#tab-custom *{box-sizing:border-box}#tab-custom button{font:inherit;cursor:pointer;color:#fff;box-shadow:none}#tab-custom .wc-mode{display:flex;align-items:center;gap:8px;margin:0 0 14px}#tab-custom .wc-mode button,#tab-custom .wc-footer button{padding:8px 16px;background:#29334b;border:1px solid #596681;border-radius:5px;color:#fff!important}#tab-custom .wc-mode button.selected{background:#1e9faf}#tab-custom .wc-mode label{margin-left:auto;font-size:12px;display:flex;align-items:center;gap:8px}#tab-custom input{accent-color:#26c6da}#tab-custom .wc-panel{background-color:#20263f;background-image:linear-gradient(60deg,transparent 49.8%,#35406455 50%,transparent 50.2%),linear-gradient(-60deg,transparent 49.8%,#35406455 50%,transparent 50.2%);background-size:180px 310px;border-radius:4px;min-height:460px;overflow:hidden}#tab-custom .wc-header{height:42px;display:flex;align-items:center;background:#2c3851b8;position:relative;padding:0 10px}#tab-custom .wc-header>span[data-title]{position:absolute;left:50%;transform:translateX(-50%);font-size:22px;font-weight:400}#tab-custom .wc-header button{width:28px;height:28px;border:0;border-radius:50%;background:#ffa519;color:#294052!important;font-size:23px;line-height:25px;padding:0}#tab-custom .wc-local{margin-left:auto;color:#9aabc7;font-size:10px;letter-spacing:2px}#tab-custom .wc-content{display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:12px;padding:18px 12px 12px;min-height:410px}#tab-custom .wc-stage{position:relative;min-width:0;display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:355px}#tab-custom canvas{display:block;width:100%;height:auto;max-height:330px;object-fit:contain}#tab-custom .wc-arrow{position:absolute;top:45%;transform:translateY(-50%);border:0;background:none!important;color:#ff9f12!important;font-size:40px;line-height:1;padding:0;display:flex;align-items:center;gap:3px}#tab-custom .wc-arrow small{font-size:17px}#tab-custom .wc-prev{left:3px}#tab-custom .wc-next{right:3px}#tab-custom .wc-stage select{background:transparent;color:#fff;border:0;max-width:90%;font:14px Arial,sans-serif;text-align:center;padding:8px;margin:0 auto 24px;cursor:pointer}#tab-custom .wc-stage option{background:#20263f;color:#fff}#tab-custom .wc-groups{padding:8px;background:#0005;border-radius:4px;max-height:386px;overflow-y:auto;display:flex;flex-direction:column;gap:9px}#tab-custom .wc-groups button{background:#26c6da;color:#fff!important;flex-shrink:0;height:38px;font-size:18px;padding:0 6px;border:0;border-radius:4px}#tab-custom .wc-groups button:hover{background:#52d1e1}#tab-custom .wc-groups button.selected{background:#1e9faf;outline:1px solid #adf5ff}#tab-custom .wc-clothing{display:none;padding:18px 18px 0;gap:12px}#tab-custom[data-mode=wear] .wc-clothing{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}#tab-custom[data-mode=wear] .wc-groups{display:none}#tab-custom[data-mode=wear] .wc-content{grid-template-columns:1fr;min-height:338px;padding-top:0}#tab-custom[data-mode=wear] .wc-stage{min-height:300px;justify-content:flex-start}#tab-custom[data-mode=wear] canvas{max-height:285px}#tab-custom .wc-clothing button{height:48px;border:0;border-radius:4px;padding:0;color:#fff!important}#tab-custom .wc-clothing svg{width:100px;height:45px;max-width:90%;vertical-align:middle}#tab-custom [data-wear=eyes]{background:#f7941d}#tab-custom [data-wear=mouth]{background:#ffee37}#tab-custom [data-wear=glasses]{background:#8bc541}#tab-custom [data-wear=hat]{background:#48c9d9}#tab-custom .wc-clothing button.selected{filter:brightness(.75)}#tab-custom .wc-footer{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:14px 0}#tab-custom [data-custom-status]{font-size:12px;color:#afb8cc}#tab-custom button:focus-visible,#tab-custom select:focus-visible{outline:2px solid white;outline-offset:3px}@media(max-width:620px){#tab-custom .wc-content{grid-template-columns:minmax(0,1fr) 125px}#tab-custom .wc-groups button{font-size:14px}#tab-custom .wc-mode{flex-wrap:wrap}#tab-custom .wc-mode label{margin-left:0}#tab-custom .wc-clothing{gap:6px;padding:12px 8px 0}#tab-custom .wc-arrow{font-size:28px}#tab-custom .wc-stage{min-height:285px}#tab-custom .wc-panel{min-height:400px}}\r\n";style.textContent+="html.wzg-ready #settings-tabs{flex-flow:column nowrap!important;overflow-x:hidden!important;overflow-y:auto!important;align-content:normal!important;scrollbar-width:thin;overscroll-behavior:contain}html.wzg-ready #settings-tabs .tab{flex:0 0 auto!important;max-width:100%!important;white-space:normal!important}html.wzg-ready #settings-tabs::before{flex-shrink:0!important}html.wzg-ready .settings-body{max-width:100%!important;overflow-x:hidden!important;overflow-y:auto!important}html.wzg-ready #tab-custom{min-width:0!important;max-width:100%!important}#tab-custom .wc-panel,#tab-custom .wc-content,#tab-custom .wc-stage{min-width:0;max-width:100%}#tab-custom .wc-mode{flex-wrap:wrap}#tab-custom .wc-stage canvas{aspect-ratio:16/9}";style.textContent+="#tab-custom .wc-item-name{display:block;color:#fff;font:14px Arial,sans-serif;text-align:center;margin:0 auto 24px;padding:8px;max-width:90%}";style.textContent+="#tab-custom{font-family:inherit}#tab-custom .wc-mode{gap:6px;padding:6px;border:1px solid #ffffff12;border-radius:14px;background:#ffffff03;margin-bottom:16px}#tab-custom .wc-mode button{border:1px solid transparent;background:transparent;color:#a4a4b0!important;border-radius:10px;padding:10px 20px;font-size:12px;font-weight:600}#tab-custom .wc-mode button.selected{background:#ffffff12;color:#f1f1f5!important;border-color:#ffffff15;box-shadow:inset 0 1px #ffffff0a}#tab-custom .wc-mode label{padding:0 12px;color:#a5a5b1;gap:10px}#tab-custom .wc-mode input{appearance:none;width:32px;height:19px;border-radius:20px;background:#323238;position:relative;cursor:pointer;border:1px solid #ffffff20;margin:0}#tab-custom .wc-mode input:after{content:'';position:absolute;width:11px;height:11px;left:3px;top:3px;background:#90909b;border-radius:50%;transition:transform .15s}#tab-custom .wc-mode input:checked{background:#62626e}#tab-custom .wc-mode input:checked:after{transform:translateX(13px);background:white}#tab-custom .wc-panel{background:radial-gradient(ellipse at 30% 25%,#ffffff05,transparent 65%),linear-gradient(135deg,#ffffff04,#ffffff01)!important;border:1px solid #ffffff12;border-radius:18px;backdrop-filter:blur(20px);box-shadow:inset 0 1px #ffffff07,0 16px 40px #0002;min-height:410px}#tab-custom .wc-header{background:transparent;border-bottom:1px solid #ffffff0b;height:48px;padding:0 18px}#tab-custom .wc-header>span[data-title]{font-size:14px;font-weight:600;letter-spacing:.02em;color:#e4e4ec}#tab-custom .wc-header button{background:#ffffff06;border:1px solid #ffffff15;color:#bbbcc6!important;font-size:17px;border-radius:8px}#tab-custom .wc-local{color:#757580;font-size:9px}#tab-custom .wc-content{padding:16px;gap:18px;grid-template-columns:minmax(0,1fr) 166px;min-height:355px}#tab-custom .wc-groups{background:#00000016;border:1px solid #ffffff09;border-radius:12px;gap:5px;padding:7px;max-height:345px;scrollbar-width:thin;scrollbar-color:#ffffff25 transparent}#tab-custom .wc-groups button{background:transparent;color:#9696a4!important;border:1px solid transparent;border-radius:8px;font-size:12px;text-align:left;padding:0 12px;height:34px;transition:background .15s}#tab-custom .wc-groups button:hover{background:#ffffff06;color:#e1e1e8!important}#tab-custom .wc-groups button.selected{background:#ffffff0c;border-color:#ffffff14;color:#f1f1f6!important;outline:none}#tab-custom .wc-stage{min-height:320px}#tab-custom .wc-arrow{border:1px solid #ffffff16;background:#ffffff03!important;color:#b1b1bd!important;border-radius:10px;width:34px;height:38px;font-size:20px;justify-content:center}#tab-custom .wc-arrow:hover{background:#ffffff0e!important;color:white!important}#tab-custom .wc-arrow small{display:none}#tab-custom .wc-clothing{gap:10px}#tab-custom .wc-clothing button{background:#ffffff03!important;border:1px solid #ffffff12;border-radius:11px;height:50px;color:#a6a6b3!important}#tab-custom .wc-clothing button.selected{filter:none;background:#ffffff0d!important;border-color:#ffffff30;color:#eeeef4!important}#tab-custom .wc-clothing svg{height:34px}#tab-custom .wc-item-name{color:#9595a4;font-size:11px;letter-spacing:.08em}#tab-custom .wc-footer button{background:transparent;border:1px solid #ffffff13;color:#91919f!important;font-size:11px;border-radius:8px;padding:8px 12px}#tab-custom .wc-footer button:hover{background:#ffffff06;color:#eee!important}#tab-custom [data-custom-status]{color:#81818e;font-size:11px}@media(max-width:620px){#tab-custom .wc-content{grid-template-columns:minmax(0,1fr) 115px;gap:8px;padding:10px}#tab-custom .wc-groups button{font-size:11px;padding:0 8px}#tab-custom .wc-mode label{padding:8px}#tab-custom .wc-stage{min-height:270px}}";section.append(style);sync();customMessage(customStatus||'Choose a skin or accessory to apply it.');
  }

  const wormateMapBound=new WeakSet();
  let wormateClockPromise=null;
  function bindWormateMinimap(owner){
    const map=hudOf(owner)?.t;if(!map?.tc||!map.Ib||!Array.isArray(map.children)||wormateMapBound.has(map))return;
    wormateMapBound.add(map);
    for(const child of map.children){if(child.style&&child.position?.y>=map.I+14&&child.position.y<=map.I+34){child.style.fill=0xd6c900;child.style.fontWeight='bold';}}
    const border=map.children.find(c=>c!==map.Ib&&c!==map.k&&c!==map.ya&&typeof c.circle==='function'&&typeof c.stroke==='function');
    if(border){const stroke=border.stroke;border.stroke=function(style){return stroke.call(this,style&&typeof style==='object'?{...style,color:0xc38b22}:style);};nativeCameraState?.Re?.();}
    map.tc.tint=0xc9cdc3;
    const replace=child=>{if(child===map.tc||!child.texture||child.style||Math.abs(child.width-map.I*2.5)>2||Math.abs(child.height-map.I*2.5)>2)return;
      if(!wormateClockPromise)wormateClockPromise=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{try{resolve(child.texture.constructor.from(img));}catch(e){reject(e);}};img.onerror=()=>reject(Error('Clock image failed'));assetURL('wormate-clock.png').then(u=>{img.src=u;},reject);});
      wormateClockPromise.then(texture=>{if(child.destroyed)return;const width=child.width,height=child.height;child.texture=texture;child.width=width;child.height=height;child.tint=0xffffff;}).catch(()=>{});
    };
    map.children.forEach(replace);const add=map.addChild;map.addChild=function(...children){const result=add.apply(this,children);children.forEach(replace);return result;};
  }

  const zoomSliderControllers=new WeakSet();

  const TOOLBAR_ALIAS = { settingicon: 'move', mobilsos: 'sos', 'otoskın': 'afk', mobilereload: 'reload', unzoom: 'zoomout', zoom: 'zoomin' };
  const TOOLBAR_DEFAULT_ORDER = ['zoomin', 'zoomout', 'reload', 'afk', 'sos']; // de cima pra baixo, como na barra vertical
  let tbCfgRaw = null, tbCfgCache = null;
  function toolbarConfig() {
    const raw = store.get('wzg-toolbar-config');
    if (tbCfgCache && raw === tbCfgRaw) return tbCfgCache;
    const c = loadJSON('wzg-toolbar-config', { order: TOOLBAR_DEFAULT_ORDER.slice(), hidden: [], zoomMode: 'buttons' });
    const order = (Array.isArray(c.order) ? c.order : []).filter((k, i, a) => TOOLBAR_DEFAULT_ORDER.includes(k) && a.indexOf(k) === i);
    for (const k of TOOLBAR_DEFAULT_ORDER) if (!order.includes(k)) order.push(k);
    const hidden = new Set(Array.isArray(c.hidden) ? c.hidden.filter(k => TOOLBAR_DEFAULT_ORDER.includes(k)) : []);
    const zoomMode = ['slider', 'both'].includes(c.zoomMode) ? c.zoomMode : 'buttons';
    const sliderSize = Math.max(60, Math.min(160, Number(c.sliderSize) || 100)), sliderOpacity = Math.max(15, Math.min(100, Number(c.sliderOpacity) || 45));
    let visible = order.filter(k => !hidden.has(k) && !(zoomMode === 'slider' && (k === 'zoomin' || k === 'zoomout')));
    if (!visible.length) visible = ['reload'];
    tbCfgRaw = raw;
    return (tbCfgCache = { order, hidden: [...hidden], zoomMode, sliderSize, sliderOpacity, visible });
  }
  const zoomSliderNodes = new Set();
  function applyZoomMode() {
    const cfg = toolbarConfig(), show = cfg.zoomMode === 'slider' || cfg.zoomMode === 'both';
    for (const node of zoomSliderNodes) {
      if (!node || node.destroyed) { zoomSliderNodes.delete(node); continue; }
      if (node.__wzgEM === undefined) node.__wzgEM = node.eventMode || 'static';
      if (node.__wzgS0 === undefined) node.__wzgS0 = [node.scale?.x || 1, node.scale?.y || 1];
      node.visible = show;
      node.eventMode = show ? node.__wzgEM : 'none';
      if (show) {
        node.alpha = cfg.sliderOpacity / 100;
        node.scale?.set(node.__wzgS0[0] * cfg.sliderSize / 100, node.__wzgS0[1] * cfg.sliderSize / 100);
      }
    }
  }
  function hideNativeZoomSlider(owner){const controller=hudOf(owner),root=controller?.ea;if(!root||zoomSliderControllers.has(controller))return;zoomSliderControllers.add(controller);
    function inspect(node){
      if(!node||node.__wzgZoomSliderHidden)return;
      if(typeof node[zoomKey(node)]==='function'&&node.p&&node.hitArea?.height===200){node.__wzgZoomSliderHidden=true;zoomSliderNodes.add(node);applyZoomMode();}
    }
    function inspectAdded(node){inspect(node);node.children?.forEach(inspect);}
    root.children?.forEach(inspectAdded);const add=root.addChild;root.addChild=function(...nodes){const result=add.apply(this,nodes);nodes.forEach(inspectAdded);return result;};
  }

  const visualNamePrefs=loadJSON('wzg-visual-name',{enabled:false,name:''});
  const visualNameHeads=new Set();
  function visualAlias(){return visualNamePrefs.enabled?String(visualNamePrefs.name||'').trim().slice(0,32):'';}
  function bindVisualName(owner){
    const text=owner.Ic;if(!text||text.__wzgVisualName)return;
    let proto=text,descriptor;
    while(proto&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(proto,'text');proto=Object.getPrototypeOf(proto);}
    if(!descriptor?.get||!descriptor?.set||descriptor.configurable===false)return;
    let original=descriptor.get.call(text);
    const apply=()=>descriptor.set.call(text,owner.B?.Ya===owner.F?.G&&visualAlias()?visualAlias():original);
    Object.defineProperty(text,'text',{configurable:true,enumerable:descriptor.enumerable,get(){return descriptor.get.call(this);},set(value){original=value;apply();}});
    text.__wzgVisualName={apply};trackWeak(visualNameHeads,text,x=>x.destroyed);apply();
  }
  function refreshVisualName(){
    for(const ref of visualNameHeads){const text=ref.deref();if(!text||text.destroyed){visualNameHeads.delete(ref);continue;}text.__wzgVisualName.apply();}
    for(const ref of scoreboardRefs){const board=ref.deref();if(!board||board.destroyed)continue;for(const row of board.L||[]){if(row.__wzgVisualOwn&&row.$)row.$.text=visualAlias()||row.__wzgVisualOriginal;}}
  }
  function mountVisualName(card){
    if(!card)return;
    const field=document.createElement('div');field.className='wzg-extra-range';
    field.innerHTML='<label class="wzg-extra-toggle"><span class="wzg-extra-copy"><strong>Visual name spoofer</strong><small>Only you see this name above your snake and in Top 10. Your account name stays unchanged.</small></span><span class="wzg-extra-switch"><input type="checkbox" role="switch" data-visual-name-enabled aria-label="Visual name spoofer"><span class="wzg-extra-track" aria-hidden="true"></span></span></label><input type="text" data-visual-name maxlength="32" placeholder="Your visual name" aria-label="Your visual name" autocomplete="off" style="box-sizing:border-box;width:100%;min-width:0;margin-top:10px;padding:11px 12px;border:1px solid #ffffff20;border-radius:10px;background:#ffffff08;color:inherit;font:inherit">';
    const enabled=field.querySelector('[data-visual-name-enabled]'),input=field.querySelector('[data-visual-name]');
    enabled.checked=!!visualNamePrefs.enabled;input.value=String(visualNamePrefs.name||'').slice(0,32);
    const save=()=>{visualNamePrefs.enabled=enabled.checked;visualNamePrefs.name=input.value.slice(0,32);store.set('wzg-visual-name',JSON.stringify(visualNamePrefs));refreshVisualName();};
    enabled.addEventListener('change',save);input.addEventListener('input',save);card.appendChild(field);
  }
  const glassToolbarTextures=new Map();
  function glassToolbarTexture(node,kind){
    if(glassToolbarTextures.has(kind))return glassToolbarTextures.get(kind);
    const Texture=node.texture?.constructor;if(typeof Texture?.from!=='function')return null;
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
    const c=canvas.getContext('2d');c.scale(2,2);
    const bg=c.createLinearGradient(0,0,48,48);bg.addColorStop(0,'rgba(48,48,54,.94)');bg.addColorStop(1,'rgba(17,17,21,.90)');
    c.fillStyle=bg;c.strokeStyle='rgba(255,255,255,.18)';c.lineWidth=1;
    c.beginPath();c.roundRect(2.5,2.5,43,43,12);c.fill();c.stroke();
    c.strokeStyle='#e1e1e8';c.fillStyle='#e1e1e8';c.lineWidth=1.8;c.lineCap='round';c.lineJoin='round';
    const line=(...p)=>{c.beginPath();c.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)c.lineTo(p[i],p[i+1]);c.stroke();};
    if(kind==='settingicon'){
      line(24,13,24,35);line(13,24,35,24);
      line(20,17,24,13,28,17);line(20,31,24,35,28,31);
      line(17,20,13,24,17,28);line(31,20,35,24,31,28);
    }else if(kind==='mobilsos'){
      c.beginPath();c.arc(24,23,10,Math.PI,0);c.lineTo(34,28);c.lineTo(29,28);c.lineTo(29,23);c.stroke();line(14,23,14,28,19,28,19,23);line(34,28,31,33,26,33);
    }else if(kind==='otoskın'){
      c.beginPath();
      for(let i=0;i<=90;i++){const a=i/90*Math.PI*4,r=1+i/90*10,px=24+Math.cos(a)*r,py=24+Math.sin(a)*r;if(i===0)c.moveTo(px,py);else c.lineTo(px,py);}
      c.stroke();
    }else if(kind==='mobilereload'){
      c.beginPath();c.arc(24,24,10,-.7,4.6);c.stroke();line(23,13,27,14,25,18);
    }else{
      line(15,24,33,24);if(kind==='zoom')line(24,15,24,33);
    }
    const texture=Texture.from(canvas);glassToolbarTextures.set(kind,texture);return texture;
  }
  const cleanedMobileBars=new WeakSet();
  function cleanMobileToolbar(container){
    if(!container?.children||cleanedMobileBars.has(container))return;
    const urlOf=node=>{const source=node.texture?.source;return [source?.label,source?._sourceOrigin,source?.resource?.src,source?.resource?.currentSrc].filter(v=>typeof v==='string').join(' ');};
    if(!container.children.some(node=>/\/mobile\/settingicon\.png/.test(urlOf(node))))return;
    cleanedMobileBars.add(container);
    const spiralButton=container.children.find(node=>/\/mobile\/mobileafk\.png/.test(urlOf(node)));
    const skinButton=container.children.find(node=>/\/mobile\/otoskın\.png/.test(urlOf(node)));
    if(spiralButton&&skinButton&&typeof spiralButton.emit==='function'){
      skinButton.removeAllListeners('pointerdown');
      skinButton.on('pointerdown',event=>spiralButton.emit('pointerdown',event));
    }
    let x=0;
    for(const node of container.children){
      if(/\/mobile\/(mobilelazer|nclose|sch|mobileafk|mobilechangebackground)\.png/.test(urlOf(node))){node.visible=false;node.eventMode='none';continue;}
      const match=urlOf(node).match(/\/mobile\/(settingicon|mobilsos|otoskın|mobilereload|unzoom|zoom)\.png/);
      if(match){node.__wzgKind=TOOLBAR_ALIAS[match[1]];const texture=glassToolbarTexture(node,match[1]);if(texture){node.texture=texture;node.width=38;node.height=38;node.alpha=1;}}
      node.position.x=x;x+=node.width+7;
    }
    installDockToolbar(container);
  }
  let hudMoveEnabled=false,hudMoveDrag=null;
  const hudPositions=loadJSON('wzg-hud-positions',{});
  function movableHudNodes(){
    const result=[];
    if(typeof mobileHudController!=='undefined'&&mobileHudController){const c=mobileHudController;for(const [key,node] of [['map',c.t],['powers',c.Jc],['control',c.__wzgMobileMode]])if(node)result.push([key,node]);}
    for(const [node,data] of extraRuntime.ranks)result.push([data.kind==='hs'?'hs':'records',node]);
    for(const ref of scoreboardRefs){const node=ref.deref();if(node&&!node.destroyed)result.push(['ranking',node]);}
    for(const node of zoomSliderNodes)if(node&&!node.destroyed&&node.visible)result.push(['zoomslider',node]);
    return result.filter(([,n])=>!n.destroyed&&n.visible!==false);
  }
  function restoreHudPositions(){
    const w=PAGE.innerWidth,h=PAGE.innerHeight;
    for(const [key,node] of movableHudNodes()){
      const p=hudPositions[key];if(!p||hudMoveDrag?.node===node)continue;
      const width=Math.min(w,node.width||0),height=Math.min(h,node.height||0);
      node.position.set(Math.max(0,Math.min(w-width,p.x*w)),Math.max(0,Math.min(h-height,p.y*h)));
    }
  }
  PAGE.addEventListener('pointerdown',event=>{
    if(!hudMoveEnabled||event.button>0||event.target?.closest?.('input,button,textarea,.settings-modal,.wzg-store-modal'))return;
    const canvas=event.target;if(canvas?.tagName!=='CANVAS')return;
    const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
    for(const [key,node] of movableHudNodes().reverse()){
      const b=node.getBounds?.();if(!b)continue;
      const left=b.minX??b.x,top=b.minY??b.y,right=b.maxX??(b.x+b.width),bottom=b.maxY??(b.y+b.height);
      if(x<left-8||x>right+8||y<top-8||y>bottom+8)continue;
      event.preventDefault();event.stopImmediatePropagation();
      hudMoveDrag={key,node,id:event.pointerId,x:event.clientX,y:event.clientY,bx:node.x,by:node.y};canvas.setPointerCapture?.(event.pointerId);break;
    }
  },true);
  PAGE.addEventListener('pointermove',event=>{
    const d=hudMoveDrag;if(!d||event.pointerId!==d.id)return;
    event.preventDefault();event.stopImmediatePropagation();
    d.node.position.set(Math.max(0,Math.min(PAGE.innerWidth-d.node.width,d.bx+event.clientX-d.x)),Math.max(0,Math.min(PAGE.innerHeight-d.node.height,d.by+event.clientY-d.y)));
  },{capture:true,passive:false});
  function finishHudMove(event){const d=hudMoveDrag;if(!d||event.pointerId!==d.id)return;event.stopImmediatePropagation();hudPositions[d.key]={x:d.node.x/PAGE.innerWidth,y:d.node.y/PAGE.innerHeight};store.set('wzg-hud-positions',JSON.stringify(hudPositions));hudMoveDrag=null;}
  PAGE.addEventListener('pointerup',finishHudMove,true);PAGE.addEventListener('pointercancel',finishHudMove,true);

  const hudMeasure = loadJSON('wzg-hud-measure', { mobile: {}, desktop: {} });
  let hudMeasureDirty = false, hudMeasureSaved = 0, hudMeasureStable = 0, hudMeasureSig = '';
  function contentBounds(node) {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity, count = 0;
    const walk = (n, depth) => {
      if (!n || n.destroyed || n.visible === false || n.renderable === false || depth > 4) return;
      if (typeof n.text === 'string' && n.text.trim() && (n.alpha ?? 1) > 0) {
        try {
          const bb = n.getBounds(), L = bb.minX ?? bb.x, T = bb.minY ?? bb.y, R = bb.maxX ?? (bb.x + bb.width), B = bb.maxY ?? (bb.y + bb.height);
          if ([L, T, R, B].every(Number.isFinite) && R > L && B > T) { l = Math.min(l, L); t = Math.min(t, T); r = Math.max(r, R); b = Math.max(b, B); count++; }
        } catch {}
      }
      if (n.children) for (const c of n.children) walk(c, depth + 1);
    };
    walk(node, 0);
    return count ? { l, t, r, b, count } : null;
  }
  function measureHud() {
    try {
      if (document.hidden || hudMoveDrag || hudMoveEnabled) return;
      const nodes = movableHudNodes(); if (!nodes.length) return;
      bzSignal('hud');
      const w = PAGE.innerWidth, h = PAGE.innerHeight, mode = mobileHudActive() ? 'mobile' : 'desktop';
      const sig = mode + w + 'x' + h + ':' + nodes.map(n => n[0]).join(',');
      if (sig !== hudMeasureSig) { hudMeasureSig = sig; hudMeasureStable = 0; }
      if (hudMeasureStable >= 12) return;
      let measureChanged = false;
      const bucket = hudMeasure[mode] || (hudMeasure[mode] = {});
      for (const [key, node] of nodes) {
        const b = node.getBounds?.(); if (!b) continue;
        let l = b.minX ?? b.x, t = b.minY ?? b.y, r = b.maxX ?? (b.x + b.width), bt = b.maxY ?? (b.y + b.height), v;
        if (key === 'hs' || key === 'records' || key === 'ranking') {
          const cb = contentBounds(node);
          if (cb && cb.count >= 3) { l = cb.l; t = cb.t; r = cb.r; bt = cb.b; v = 2; }
        }
        if (![l, t, r, bt, node.x, node.y].every(Number.isFinite)) continue;
        let bw = Math.round(r - l), bh = Math.round(bt - t);
        if (bw < 8 || bh < 8 || bw > w || bh > h) continue;
        const prev = bucket[key] || {};
        if (!v && prev.bw && (key === 'hs' || key === 'records' || key === 'ranking')) { bw = Math.max(bw, prev.bw); bh = Math.max(bh, prev.bh); }
        const next = { ox: Math.round(node.x - l), oy: Math.round(node.y - t), bw, bh, v, nx: prev.nx, ny: prev.ny };
        if (!hudPositions[key]) { next.nx = +(node.x / w).toFixed(4); next.ny = +(node.y / h).toFixed(4); }
        const same = prev.bw !== undefined && Math.abs(prev.bw - bw) < 4 && Math.abs(prev.bh - bh) < 4 && Math.abs(prev.ox - next.ox) < 4 && Math.abs(prev.oy - next.oy) < 4 && prev.nx === next.nx && prev.ny === next.ny && prev.v === next.v;
        if (same) continue;
        bucket[key] = next; hudMeasureDirty = true; measureChanged = true;
      }
      hudMeasureStable = measureChanged ? 0 : hudMeasureStable + 1;
      if (hudMeasureDirty && Date.now() - hudMeasureSaved > 3000) { hudMeasureSaved = Date.now(); hudMeasureDirty = false; store.set('wzg-hud-measure', JSON.stringify(hudMeasure)); }
    } catch {}
  }
  nativeInterval(measureHud, 2000);

  let hudEditorSliderSize = 100;
  const HUD_EDITOR_ITEMS = [
    { key: 'map',        label: 'Minimap + HS/KILL', kind: 'map',    est: (u, r, w, h, mob) => mob ? ({ bw: 100*u, bh: 112*u, ox: 40*u, oy: 40*u, dx: 60*u, dy: 60*u }) : ({ bw: 100, bh: 128, ox: 40, oy: 40, dx: 60, dy: 57 }) },
    { key: 'control',    label: 'Mode',              kind: 'mode',   est: u => ({ bw: 52*u, bh: 42*u, ox: 0, oy: 0, dx: 116*u, dy: 8*u }) },
    { key: 'powers',     label: 'Abilities',         kind: 'icons',  est: u => ({ bw: 132*u, bh: 56*u, ox: 0, oy: 0, dx: 116*u, dy: 42*u }) },
    { key: 'hs',         label: 'TOP HS',            kind: 'rows',   est: (u, r, w, h, mob) => mob ? ({ bw: 163*r, bh: 87*r, ox: 0, oy: 0, dx: 8*u, dy: 156*u }) : ({ bw: 172*r/u, bh: 104*r/u, ox: 0, oy: 0, dx: 3, dy: 158 }) },
    { key: 'records',    label: 'Records',           kind: 'rows',   est: (u, r, w, h, mob) => mob ? ({ bw: 163*r, bh: 56*r, ox: 0, oy: 0, dx: 8*u, dy: 156*u + 87*r + 10*u }) : ({ bw: 172*r/u, bh: 70*r/u, ox: 0, oy: 0, dx: 3, dy: 262 }) },
    { key: 'ranking',    label: 'Top 10',            kind: 'rows',   est: (u, r, w) => ({ bw: 196*r/u, bh: 170*r/u, ox: 0, oy: 0, dx: w - 200, dy: 0 }) },
    { key: 'zoomslider', label: 'Zoom slider',       kind: 'slider', only: 'slider', est: (u, r, w, h) => { const k = hudEditorSliderSize / 100; return { bw: 28*k, bh: 200*k, ox: 0, oy: 0, dx: w - 44, dy: Math.max(0, (h - 200*k) / 2) }; } },
  ];
  const TOOLBAR_INFO = {
    zoomin:  { name: 'Zoom in (+)',  desc: 'Zooms the camera in.',                        svg: '<path d="M5 12h14M12 5v14"/>' },
    zoomout: { name: 'Zoom out (−)', desc: 'Zooms the camera out.',                       svg: '<path d="M5 12h14"/>' },
    reload:  { name: 'Reload',       desc: 'Game\'s reload button (circular arrow).',    svg: '<path d="M4 12a8 8 0 1 1 3 6.2"/><path d="M4 18v-5h5"/>' },
    afk:     { name: 'AFK spiral',   desc: 'Spiral button: triggers the game\'s AFK mode.', svg: '<path d="M12 12c1-1 2.5-.5 2.5 1s-2 3-4 2.5-4-3-3.5-5.5 3-5 6.5-4.5 6 4 5 8"/>' },
    sos:     { name: 'SOS (headset)', desc: 'Game\'s SOS button (headset icon).',         svg: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>' },
    move:    { name: 'Move HUD',     desc: 'In-match HUD move mode (drag pieces and this bar).', svg: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>' },
  };
  function hudEditorMetrics() {
    const w = PAGE.innerWidth, h = PAGE.innerHeight;
    const u = Math.min(1, Math.max(.65, (h - 24) / 345), Math.max(.65, w / 390));
    return { w, h, u, r: u * ((extraPrefs.rankSize || 75) / 75) };
  }
  function hudGeom(item, m, work) {
    const mob = mobileHudActive(), me0 = hudMeasure[mob ? 'mobile' : 'desktop']?.[item.key], me = me0 && item.kind !== 'rows' && item.kind !== 'slider' ? me0 : null;
    const est = item.est(m.u, m.r, m.w, m.h, mob), list = item.kind === 'rows';
    const bw = me ? me.bw : est.bw, bh = me ? me.bh : est.bh;
    const ox = me ? me.ox : est.ox, oy = me ? me.oy : est.oy;
    const saved = work[item.key];
    const okPos = me && me.nx != null && ['map', 'control'].includes(item.key);
    let x, y;
    if (saved) { x = saved.x * m.w; y = saved.y * m.h; }
    else if (okPos) { x = me.nx * m.w; y = me.ny * m.h; }
    else { x = est.dx; y = est.dy; }
    const eo = okPos || item.key === 'map' || item.key === 'control' ? { ox, oy } : (list || item.kind === 'slider' ? est : { ox, oy });
    if (item.key === 'records' && !saved) { const hs = hudGeom(HUD_EDITOR_ITEMS.find(i => i.key === 'hs'), m, work); y = Math.max(y, hs.y + hs.bh + 6); }
    x = Math.max(eo.ox, Math.min(m.w - bw + eo.ox, x)); y = Math.max(eo.oy, Math.min(m.h - bh + eo.oy, y));
    return { bw, bh, ox: eo.ox, oy: eo.oy, x, y, measured: !!me };
  }
  function openHudEditor() {
    if (document.getElementById('wzg-hud-editor')) return;
    const work = JSON.parse(JSON.stringify(hudPositions));
    const startCfg = toolbarConfig();
    const dockSaved = loadJSON('wzg-toolbar-dock', { edge: 'top', fraction: .5 });
    const cfg = { order: startCfg.order.slice(), hidden: new Set(startCfg.hidden), zoomMode: startCfg.zoomMode, sliderSize: startCfg.sliderSize, sliderOpacity: startCfg.sliderOpacity, dock: ['top', 'bottom', 'left', 'right'].includes(dockSaved.edge) ? dockSaved.edge : 'top', fraction: Number.isFinite(dockSaved.fraction) ? Math.max(0, Math.min(1, dockSaved.fraction)) : .5, dockChanged: false };
    const root = document.createElement('div');
    root.id = 'wzg-hud-editor';
    root.innerHTML = `
      <div class="wzg-he-bar"><b>HUD editor</b>
        <button type="button" data-a="undo" disabled>Undo</button>
        <button type="button" data-a="sheet">Buttons</button>
        <button type="button" data-a="reset">Reset</button>
        <button type="button" data-a="cancel">Cancel</button>
        <button type="button" data-a="save" class="is-primary">Save</button>
      </div>
      <div class="wzg-he-sheet"></div>
      <div class="wzg-he-hint"></div>`;
    const hint = root.querySelector('.wzg-he-hint'), sheet = root.querySelector('.wzg-he-sheet');
    const undoBtn = root.querySelector('[data-a="undo"]'), sheetBtn = root.querySelector('[data-a="sheet"]');
    const history = []; let rngBefore = null;
    const snapshot = () => JSON.stringify({ work, order: cfg.order, hidden: [...cfg.hidden], zoomMode: cfg.zoomMode, sliderSize: cfg.sliderSize, sliderOpacity: cfg.sliderOpacity, dock: cfg.dock, fraction: cfg.fraction, dockChanged: cfg.dockChanged });
    const refreshUndo = () => { undoBtn.disabled = !history.length; };
    function pushHistory(before) { if (before == null || before === snapshot()) return; history.push(before); if (history.length > 60) history.shift(); refreshUndo(); }
    function undo() {
      const prev = history.pop(); if (!prev) return;
      const st = JSON.parse(prev);
      for (const k of Object.keys(work)) delete work[k];
      Object.assign(work, st.work);
      cfg.order = st.order; cfg.hidden = new Set(st.hidden); cfg.zoomMode = st.zoomMode; cfg.sliderSize = st.sliderSize; cfg.sliderOpacity = st.sliderOpacity;
      cfg.dock = st.dock; cfg.fraction = st.fraction; cfg.dockChanged = st.dockChanged;
      renderSheet(); layout(); refreshUndo();
    }
    function setSheet(open) { sheet.classList.toggle('is-open', open); sheetBtn.classList.toggle('is-on', open); if (open) renderSheet(); }
    const blocks = new Map();
    for (const item of HUD_EDITOR_ITEMS) {
      const el = document.createElement('div');
      el.className = 'wzg-he-block'; el.dataset.key = item.key;
      const body = { map: '<i class="wzg-he-circle"></i><b class="wzg-he-counters">HS 0 &nbsp; KILL 0</b>', mode: '<i class="wzg-he-modeic"></i>', icons: '<i class="wzg-he-icons"></i>', rows: '<i class="wzg-he-rows"></i>', slider: '<i class="wzg-he-slider"></i>' }[item.kind];
      el.innerHTML = `<span class="wzg-he-tag">${item.label}</span>${body}`;
      root.appendChild(el); blocks.set(item.key, el);
    }
    const tbEl = document.createElement('div'); tbEl.className = 'wzg-he-block wzg-he-tb'; root.appendChild(tbEl);
    function tbShown() {
      const list = cfg.order.filter(k => !cfg.hidden.has(k) && !(cfg.zoomMode === 'slider' && (k === 'zoomin' || k === 'zoomout')));
      return list.length ? list : ['reload'];
    }
    function tbLen() { return 145 + (tbShown().length - 1) * 45; }
    function tbScale(vertical, m, L) { return vertical ? Math.min(1, Math.max(.5, (m.h - 24) / L)) : Math.min(1, m.w / L); }
    function renderTb(m) {
      const vertical = cfg.dock === 'left' || cfg.dock === 'right', L = tbLen(), scale = tbScale(vertical, m, L);
      const W = vertical ? 62 : L, H = vertical ? L : 62, bw = W * scale, bh = H * scale;
      const list = tbShown(), n = list.length;
      const x = vertical ? (cfg.dock === 'left' ? 0 : m.w - bw) : Math.max(0, Math.min(m.w - bw, (m.w - bw) * cfg.fraction));
      const y = vertical ? (m.h - bh) * cfg.fraction : (cfg.dock === 'top' ? 0 : m.h - bh);
      tbEl.style.cssText = `left:${x}px;top:${y}px;width:${bw}px;height:${bh}px`;
      const btns = list.map((k, i) => { const slot = vertical ? i : n - 1 - i, pos = 53 + slot * 45; return `<span class="b" style="left:${vertical ? 12 : pos}px;top:${vertical ? pos : 12}px"><svg viewBox="0 0 24 24">${TOOLBAR_INFO[k].svg}</svg></span>`; }).join('');
      tbEl.innerHTML = `<span class="wzg-he-tag">Side bar</span><div class="tbi" style="width:${W}px;height:${H}px;transform:scale(${scale})">${btns}</div>`;
    }
    function layout() {
      const m = hudEditorMetrics(); let anyMeasured = false;
      hudEditorSliderSize = cfg.sliderSize;
      renderTb(m);
      for (const item of HUD_EDITOR_ITEMS) {
        const el = blocks.get(item.key), hidden = item.only && !(cfg.zoomMode === 'slider' || cfg.zoomMode === 'both');
        el.style.display = hidden ? 'none' : '';
        if (hidden) continue;
        const g = hudGeom(item, m, work); anyMeasured = anyMeasured || g.measured;
        el.style.width = g.bw + 'px'; el.style.height = g.bh + 'px';
        el.style.left = (g.x - g.ox) + 'px'; el.style.top = (g.y - g.oy) + 'px';
        el.classList.toggle('is-moved', !!work[item.key]);
        if (item.key === 'zoomslider') el.style.opacity = cfg.sliderOpacity / 100;
        const rowsEl = el.querySelector('.wzg-he-rows'), nRows = { hs: 5, records: 3, ranking: 10 }[item.key];
        if (rowsEl && nRows) { const pitch = Math.max(6, (g.bh - 24) / nRows); rowsEl.style.background = `repeating-linear-gradient(to bottom, rgba(255,255,255,.55) 0 3px, transparent 3px ${pitch}px)`; }
        const circle = el.querySelector('.wzg-he-circle');
        if (circle) { const d = Math.min(g.bw, g.bh); circle.style.width = circle.style.height = d + 'px'; circle.style.left = ((g.bw - d) / 2) + 'px'; }
      }
      hint.textContent = m.h > m.w
        ? 'Rotate your phone to landscape: the layout is saved relative to the match screen.'
        : anyMeasured ? 'Drag each block. Sizes learned from your last match. Orange outline = moved.'
        : 'Drag each block. Sizes refine automatically after you play a match.';
    }
    function renderSheet() {
      const keepScroll = sheet.querySelector('.wzg-he-sheet-in')?.scrollTop || 0;
      const rows = cfg.order.map((k, i) => {
        const info = TOOLBAR_INFO[k], zoomBtn = k === 'zoomin' || k === 'zoomout', off = cfg.hidden.has(k) || (zoomBtn && cfg.zoomMode === 'slider');
        return `<div class="wzg-he-row${off ? ' is-off' : ''}" data-k="${k}"><span class="g"><svg viewBox="0 0 24 24">${info.svg}</svg></span>
          <div class="t"><b>${info.name}</b><small>${info.desc}</small></div>
          <input type="checkbox" data-vis ${cfg.hidden.has(k) ? '' : 'checked'} ${zoomBtn && cfg.zoomMode === 'slider' ? 'disabled' : ''} aria-label="Show ${info.name}">
          <span class="mv"><button type="button" data-mv="-1" ${i === 0 ? 'disabled' : ''}>▲</button><button type="button" data-mv="1" ${i === cfg.order.length - 1 ? 'disabled' : ''}>▼</button></span></div>`;
      }).join('');
      sheet.innerHTML = `<div class="wzg-he-sh-head"><h4>Side buttons</h4><button type="button" class="wzg-he-x" data-a="closesheet">✕ Close</button></div><div class="wzg-he-sheet-in"><p>Drag the bar on the screen to choose where it sits (it snaps to the nearest edge). List is top → bottom as on a vertical bar.</p>
        <div class="wzg-he-sec">Zoom</div>
        <div class="wzg-he-seg"><button type="button" data-zoom="buttons" class="${cfg.zoomMode === 'buttons' ? 'is-on' : ''}">+ / − buttons</button><button type="button" data-zoom="slider" class="${cfg.zoomMode === 'slider' ? 'is-on' : ''}">Slider</button><button type="button" data-zoom="both" class="${cfg.zoomMode === 'both' ? 'is-on' : ''}">Both</button></div>
        ${cfg.zoomMode === 'buttons' ? '' : `<div class="wzg-he-sec">Zoom slider</div>
        <label class="wzg-he-rng"><span>Size <b>${cfg.sliderSize}%</b></span><input type="range" min="60" max="160" step="5" value="${cfg.sliderSize}" data-rng="sliderSize"></label>
        <label class="wzg-he-rng"><span>Opacity (glass) <b>${cfg.sliderOpacity}%</b></span><input type="range" min="15" max="100" step="5" value="${cfg.sliderOpacity}" data-rng="sliderOpacity"></label>`}
        <div class="wzg-he-sec">Buttons</div>${rows}
        <button type="button" class="wzg-he-link" data-a="resetbtn">Reset buttons</button>
        <button type="button" class="wzg-he-link" data-a="closesheet">Done</button></div>`;
      const inner = sheet.querySelector('.wzg-he-sheet-in'); if (inner) inner.scrollTop = keepScroll;
    }
    sheet.addEventListener('click', e => {
      if (e.target.closest('[data-a="closesheet"]')) { setSheet(false); return; }
      const z = e.target.closest('[data-zoom]'); if (z) { const before = snapshot(); cfg.zoomMode = z.dataset.zoom; renderSheet(); layout(); pushHistory(before); return; }
      const mv = e.target.closest('[data-mv]'); if (mv) {
        const k = mv.closest('.wzg-he-row').dataset.k, i = cfg.order.indexOf(k), j = i + Number(mv.dataset.mv);
        if (j >= 0 && j < cfg.order.length) { const before = snapshot(); [cfg.order[i], cfg.order[j]] = [cfg.order[j], cfg.order[i]]; renderSheet(); layout(); pushHistory(before); }
        return;
      }
      if (e.target.closest('[data-a="resetbtn"]')) { const before = snapshot(); cfg.order = TOOLBAR_DEFAULT_ORDER.slice(); cfg.hidden = new Set(); cfg.zoomMode = 'buttons'; cfg.sliderSize = 100; cfg.sliderOpacity = 45; renderSheet(); layout(); pushHistory(before); }
    });
    sheet.addEventListener('input', e => {
      const key = e.target.dataset?.rng; if (!key) return;
      if (rngBefore == null) rngBefore = snapshot();
      cfg[key] = Number(e.target.value); e.target.closest('label').querySelector('b').textContent = cfg[key] + '%'; layout();
    });
    sheet.addEventListener('change', e => {
      if (e.target.matches('[data-rng]')) { pushHistory(rngBefore); rngBefore = null; return; }
      if (e.target.matches('[data-vis]')) {
        const k = e.target.closest('.wzg-he-row').dataset.k;
        const before = snapshot();
        if (e.target.checked) cfg.hidden.delete(k); else cfg.hidden.add(k);
        renderSheet(); layout(); pushHistory(before);
      }
    });
    let drag = null;
    root.addEventListener('pointerdown', e => {
      const tbDown = e.target.closest('.wzg-he-tb');
      if (tbDown) {
        const r = tbDown.getBoundingClientRect();
        drag = { tb: true, id: e.pointerId, sx: e.clientX, sy: e.clientY, x: r.left, y: r.top, w: r.width, h: r.height, m: hudEditorMetrics(), el: tbDown, nx: r.left, ny: r.top, before: snapshot() };
        tbDown.classList.add('is-drag'); tbDown.setPointerCapture?.(e.pointerId); e.preventDefault(); return;
      }
      const el = e.target.closest('.wzg-he-block'); if (!el) return;
      const item = HUD_EDITOR_ITEMS.find(i => i.key === el.dataset.key), m = hudEditorMetrics(), g = hudGeom(item, m, work);
      drag = { item, id: e.pointerId, sx: e.clientX, sy: e.clientY, x: g.x, y: g.y, g, m, el, before: snapshot() };
      el.classList.add('is-drag'); el.setPointerCapture?.(e.pointerId); e.preventDefault();
    });
    root.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.tb) {
        drag.nx = Math.max(0, Math.min(drag.m.w - drag.w, drag.x + e.clientX - drag.sx)); drag.ny = Math.max(0, Math.min(drag.m.h - drag.h, drag.y + e.clientY - drag.sy));
        drag.el.style.left = drag.nx + 'px'; drag.el.style.top = drag.ny + 'px'; e.preventDefault(); return;
      }
      const { g, m, item } = drag;
      const x = Math.max(g.ox, Math.min(m.w - g.bw + g.ox, drag.x + e.clientX - drag.sx));
      const y = Math.max(g.oy, Math.min(m.h - g.bh + g.oy, drag.y + e.clientY - drag.sy));
      work[item.key] = { x: x / m.w, y: y / m.h };
      drag.el.style.left = (x - g.ox) + 'px'; drag.el.style.top = (y - g.oy) + 'px';
      e.preventDefault();
    });
    const endDrag = e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.tb) {
        const { m } = drag, cx = drag.nx + drag.w / 2, cy = drag.ny + drag.h / 2, dist = { left: cx, right: m.w - cx, top: cy, bottom: m.h - cy };
        cfg.dock = Object.keys(dist).sort((a, b) => dist[a] - dist[b])[0]; cfg.dockChanged = true;
        const Lb = tbLen(), vert = cfg.dock === 'left' || cfg.dock === 'right', bl = Lb * tbScale(vert, m, Lb); cfg.fraction = vert ? Math.max(0, Math.min(1, (cy - bl / 2) / Math.max(1, m.h - bl))) : Math.max(0, Math.min(1, (cx - bl / 2) / Math.max(1, m.w - bl)));
        const before = drag.before; drag.el.classList.remove('is-drag'); drag = null; layout(); pushHistory(before); return;
      }
      const before = drag.before; drag.el.classList.add('is-moved'); drag.el.classList.remove('is-drag'); drag = null; pushHistory(before);
    };
    root.addEventListener('pointerup', endDrag); root.addEventListener('pointercancel', endDrag);
    const close = () => { PAGE.removeEventListener('resize', layout); document.removeEventListener('keydown', onKey, true); root.remove(); };
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); if (sheet.classList.contains('is-open')) setSheet(false); else close(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); undo(); }
    };
    root.querySelector('.wzg-he-bar').addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (a === 'cancel') close();
      if (a === 'undo') undo();
      if (a === 'sheet') setSheet(!sheet.classList.contains('is-open'));
      if (a === 'reset') { const before = snapshot(); for (const k of Object.keys(work)) delete work[k]; layout(); pushHistory(before); }
      if (a === 'save') {
        for (const k of Object.keys(hudPositions)) delete hudPositions[k];
        Object.assign(hudPositions, work);
        store.set('wzg-hud-positions', JSON.stringify(hudPositions));
        store.set('wzg-toolbar-config', JSON.stringify({ order: cfg.order, hidden: [...cfg.hidden], zoomMode: cfg.zoomMode, sliderSize: cfg.sliderSize, sliderOpacity: cfg.sliderOpacity }));
        if (cfg.dockChanged) store.set('wzg-toolbar-dock', JSON.stringify({ edge: cfg.dock, fraction: cfg.fraction }));
        try { restoreHudPositions(); applyZoomMode(); } catch {}
        close();
      }
    });
    PAGE.addEventListener('resize', layout);
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(root);
    layout();
  }
  function installDockToolbar(bar){
    const buttons=bar.children.filter(n=>n.visible&&n.texture);if(buttons.length!==6)return;
    const gear=buttons[0],Texture=gear.texture.constructor,Sprite=gear.constructor;
    const backing=new Sprite();backing.eventMode='static';bar.addChildAt(backing,0);
    bar.removeAllListeners('pointerdown');
    let editing=false,drag=null,dock='top',fraction=.5,anim=null,good=null,barLen=370,lastDockRaw=null;
    const saved=loadJSON('wzg-toolbar-dock',null);if(saved&&['top','bottom','left','right','free'].includes(saved.edge)){dock=saved.edge;fraction=Number.isFinite(saved.fraction)?Math.max(0,Math.min(1,saved.fraction)):.5;}
    const textures=new Map();
    function syncDockFromStore(){
      if(drag||anim)return;
      const raw=store.get('wzg-toolbar-dock');if(raw===lastDockRaw)return;lastDockRaw=raw;
      try{const sv=JSON.parse(raw||'null');if(sv&&['top','bottom','left','right','free'].includes(sv.edge)){dock=sv.edge;fraction=Number.isFinite(sv.fraction)?Math.max(0,Math.min(1,sv.fraction)):.5;}}catch{}
    }
    function background(edge,len,groups){
      const key=edge+'|'+len+'|'+groups.join('');
      if(textures.has(key))return textures.get(key);
      const vertical=edge==='left'||edge==='right',w=vertical?62:len,h=vertical?len:62;
      const canvas=document.createElement('canvas');canvas.width=w*2;canvas.height=h*2;const c=canvas.getContext('2d');c.scale(2,2);
      if(edge==='bottom'){c.translate(w,h);c.rotate(Math.PI);}else if(edge==='left'){c.translate(0,h);c.rotate(-Math.PI/2);}else if(edge==='right'){c.translate(w,0);c.rotate(Math.PI/2);}
      c.fillStyle='rgba(22,22,29,.42)';c.strokeStyle='rgba(255,255,255,.18)';c.lineWidth=1;c.beginPath();
      if(edge==='free')c.roundRect(.5,.5,len-1,61,18);else {c.moveTo(.5,.5);c.lineTo(len-.5,.5);c.bezierCurveTo(len-38,5,len-27,61,len-62,61);c.lineTo(62,61);c.bezierCurveTo(27,61,38,5,.5,.5);c.closePath();}c.fill();c.stroke();
      c.beginPath();for(let j=0;j<groups.length-1;j++)if(groups[j]!==groups[j+1]){const p=53+(j+1)*45-3.5,x=(edge==='bottom'||edge==='left')?len-p:p;c.moveTo(x,20);c.lineTo(x,42);}c.stroke();
      const tex=Texture.from(canvas);textures.set(key,tex);return tex;
    }
    const viewport=()=>{const controller=bar.parent?.__wzgToolbarController;const canvas=controller?.ic||document.querySelector('canvas#wgpu')||document.querySelector('#wgpu canvas');const rect=canvas?.getBoundingClientRect();const w=controller?.da?.screen?.width||canvas?.clientWidth||rect?.width||PAGE.innerWidth,h=controller?.da?.screen?.height||canvas?.clientHeight||rect?.height||PAGE.innerHeight;return {canvas,rect,w,h,sx:w/(rect?.width||w),sy:h/(rect?.height||h)};};
    function reservedHudBottom(edge,w,h){
      const nodes=new Set();
      if(typeof mobileHudController!=='undefined'&&mobileHudController?.t)nodes.add(mobileHudController.t);
      for(const [node] of extraRuntime.ranks)nodes.add(node);
      for(const ref of scoreboardRefs){const node=ref.deref();if(node)nodes.add(node);}
      let bottom=0;
      for(const node of nodes){
        if(node.destroyed||node.visible===false||node.renderable===false||!node.getBounds)continue;
        try{
          const bounds=node.getBounds();
          const left=bounds.minX??bounds.x,right=bounds.maxX??(bounds.x+bounds.width),low=bounds.maxY??(bounds.y+bounds.height);
          if(![left,right,low].every(Number.isFinite))continue;
          const a=bar.parent?.toLocal?bar.parent.toLocal({x:left,y:low}):{x:left,y:low};
          const b=bar.parent?.toLocal?bar.parent.toLocal({x:right,y:low}):{x:right,y:low};
          if(edge==='left'?a.x<74&&b.x>0:b.x>w-74&&a.x<w)bottom=Math.max(bottom,a.y+12);
        }catch{}
      }
      return Math.min(h-24,Math.max(0,bottom));
    }
    function layout(){
      if(drag)return;
      syncDockFromStore();
      const {w,h}=viewport(),vertical=dock==='left'||dock==='right';
      const reserved=vertical?reservedHudBottom(dock,w,h):0;
      const cfg=toolbarConfig(),shown=cfg.visible.map(k=>buttons.find(b=>b.__wzgKind===k)).filter(Boolean),cnt=shown.length||1;barLen=145+(cnt-1)*45;
      const scale=Math.max(vertical?.5:0,Math.min(1,(vertical?Math.max(24,h-reserved):w)/barLen));bar.scale.set(scale);
      const groupOf=n=>n.__wzgKind==='zoomin'||n.__wzgKind==='zoomout'?0:n.__wzgKind==='move'?2:1,topGroups=shown.map(groupOf);
      backing.texture=background(dock,barLen,vertical?topGroups:topGroups.slice().reverse());backing.width=vertical?62:barLen;backing.height=vertical?barLen:62;backing.position.set(0,0);
buttons.forEach(b=>{const on=shown.includes(b);if(b.__wzgEM===undefined)b.__wzgEM=b.eventMode||'static';b.visible=on;b.eventMode=on?b.__wzgEM:'none';});shown.forEach((b,i)=>{const slot=vertical?i:cnt-1-i,pos=53+slot*45;b.position.set(vertical?12:pos,vertical?pos:12);b.width=38;b.height=38;});applyZoomMode();
      const bw=(vertical?62:barLen)*scale,bh=(vertical?barLen:62)*scale;
      if(dock==='top'||dock==='bottom')bar.position.set(Math.max(0,Math.min(w-bw,(w-bw)*fraction)),dock==='top'?0:h-bh);
      else if(vertical)bar.position.set(dock==='left'?0:w-bw,Math.max(reserved,Math.min(h-bh,(h-bh)*fraction)));
      else bar.position.set(Math.max(0,Math.min(w-bw,bar.x)),Math.max(0,Math.min(h-bh,bar.y)));
      backing.alpha=editing?1:.85;gear.tint=editing?0x9fd9ff:0xffffff;gear.alpha=1;backing.cursor=editing?'grab':'default';
      if(anim){anim.tx=bar.x;anim.ty=bar.y;bar.position.set(anim.cx,anim.cy);}
      else if(!drag&&onScreen())good={dock,fraction,x:bar.x,y:bar.y};
    }
    function onScreen(){
      const {w,h}=viewport(),vertical=dock==='left'||dock==='right';
      const bw=(vertical?62:barLen)*bar.scale.x,bh=(vertical?barLen:62)*bar.scale.y;
      return [bar.x,bar.y,bw,bh,w,h].every(Number.isFinite)&&bar.x>=-4&&bar.y>=-4&&bar.x+bw<=w+4&&bar.y+bh<=h+4;
    }
    function tryDock(c){dock=c.dock;fraction=c.fraction;if(c.dock==='free')bar.position.set(c.x,c.y);layout();return onScreen();}
    function recover(prev){for(const c of [prev,good,{dock:'top',fraction:.5}])if(c&&tryDock(c))return true;return false;}
    const DOCK_ANIM_MS=750;
    function cancelDockAnim(){anim=null;}
    function startDockAnim(fx,fy,tx,ty){
      const mine=anim={t0:performance.now(),fx,fy,tx,ty,cx:fx,cy:fy};
      bar.position.set(fx,fy);
      const step=now=>{
        if(anim!==mine||bar.destroyed)return;
        layout();
        const p=Math.max(0,Math.min(1,(now-mine.t0)/DOCK_ANIM_MS)),e=p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
        mine.cx=mine.fx+(mine.tx-mine.fx)*e;mine.cy=mine.fy+(mine.ty-mine.fy)*e;
        bar.position.set(mine.cx,mine.cy);
        if(p<1)nativeRAF(step);
        else{anim=null;layout();nativeTimeout(layout,300);nativeTimeout(layout,1200);}
      };
      nativeRAF(step);
    }
    gear.removeAllListeners('pointerdown');
    gear.on('pointerdown',e=>{editing=!editing;hudMoveEnabled=editing;layout();e.stopPropagation();});
    function start(e){if(!editing||e.target===gear)return;e.stopPropagation();
      const native=e.nativeEvent||e.originalEvent;if(!native)return;
      cancelDockAnim();drag={id:native.pointerId,x:native.clientX,y:native.clientY,bx:bar.x,by:bar.y};
      native.target?.setPointerCapture?.(native.pointerId);backing.cursor='grabbing';
    }
    backing.on('pointerdown',start);
    for(const button of buttons.slice(1)){const handlers=button.listeners('pointerdown');button.removeAllListeners('pointerdown');button.on('pointerdown',function(e){if(editing)start(e);else for(const fn of handlers)fn.call(this,e);});}
    function move(e){if(!drag||e.pointerId!==drag.id)return;e.preventDefault();
      const {sx,sy}=viewport();bar.position.set(drag.bx+(e.clientX-drag.x)*sx,drag.by+(e.clientY-drag.y)*sy);
    }
    function end(e){if(!drag||e.pointerId!==drag.id)return;
      const {w,h,rect,sx,sy}=viewport(),px=(e.clientX-(rect?.left||0))*sx,py=(e.clientY-(rect?.top||0))*sy;
      const edges=[['left',px],['right',w-px],['top',py],['bottom',h-py]].sort((a,b)=>a[1]-b[1]);
      const prev={dock,fraction,x:drag.bx,y:drag.by};
      const fx=bar.x,fy=bar.y;dock=edges[0][1]<85?edges[0][0]:'free';fraction=Math.max(0,Math.min(1,(dock==='left'||dock==='right')?py/h:px/w));drag=null;layout();
      let recovered=false;
      if(!onScreen()){recovered=true;recover(prev);}
      if((dock!=='free'||recovered)&&(Math.abs(bar.x-fx)>1||Math.abs(bar.y-fy)>1))startDockAnim(fx,fy,bar.x,bar.y);
      else{nativeTimeout(layout,300);nativeTimeout(layout,1200);}
      {const raw=JSON.stringify({edge:dock,fraction});store.set('wzg-toolbar-dock',raw);lastDockRaw=raw;}
    }
    PAGE.addEventListener('pointermove',move,{passive:false});PAGE.addEventListener('pointerup',end);PAGE.addEventListener('pointercancel',end);
    PAGE.addEventListener('resize',layout);
    const dockLayoutTimer=PAGE.setInterval(()=>{if(!bar.destroyed&&!document.hidden){restoreHudPositions();layout();if(!anim&&!drag&&!onScreen())recover(null);}},1500);
    bar.on('destroyed',()=>{PAGE.clearInterval(dockLayoutTimer);PAGE.removeEventListener('pointermove',move);PAGE.removeEventListener('pointerup',end);PAGE.removeEventListener('pointercancel',end);PAGE.removeEventListener('resize',layout);for(const tex of textures.values())tex.destroy(true);});
    if(bar.cc)bar.cc['1c']=true;
    nativeTimeout(layout,0);
  }
  const mobileToolbarOwners=new WeakSet();
  function bindMobileToolbar(owner){
    const stage=hudOf(owner)?.ea;if(!stage||mobileToolbarOwners.has(stage))return;
    mobileToolbarOwners.add(stage);stage.__wzgToolbarController=hudOf(owner);stage.children.forEach(cleanMobileToolbar);
    const add=stage.addChild;stage.addChild=function(...nodes){const result=add.apply(this,nodes);nodes.forEach(cleanMobileToolbar);return result;};
  }
  let ownHudPlayerId=null;
  const directHudControllers=new WeakSet();
  function bindDirectHUD(owner){
    if(owner.B?.Ya!=null)ownHudPlayerId=owner.B.Ya;
    const controller=hudOf(owner);if(!controller?.ea)return;
    const scan=()=>{if(!controller.ea.destroyed)inspectGameHUD(controller.ea);};
    if(directHudControllers.has(controller)){scan();return;}
    directHudControllers.add(controller);
    scan();
    const add=controller.ea.addChild;
    controller.ea.addChild=function(...nodes){const result=add.apply(this,nodes);scan();return result;};
    nativeTimeout(scan,0);
    if(controller.r?.Eb)controller.r.xa(controller.r.Eb);
  }
  const featureBindingWarnings=new Set();
  function bindSnakeFeatures(owner){
    for(const bind of [bindCustomSnake,bindDirectHUD,bindVisualName,hideNativeZoomSlider,bindWormateMinimap,bindMobileHud,bindMobileToolbar,bindLightweightBodies,bindRedHelper,bindAbilityHud,bindCurveIcon,bindSpeedReplacement,bindMagnetReplacement]){
      try{bind(owner);}catch(error){
        if(!featureBindingWarnings.has(bind.name)){featureBindingWarnings.add(bind.name);console.error('[Betterzilla] '+bind.name,error);}
      }
    }
  }
  function installPlayerTagBinding() {
    const proto=PAGE.Object.prototype;
    if(Object.getOwnPropertyDescriptor(proto,'ce'))return;
    Object.defineProperty(proto,'ce',{configurable:true,set(value){
      Object.defineProperty(this,'ce',{value,writable:true,configurable:true,enumerable:true});
      if(!value || !this.Ic || !this.ca || !this.F || !value.style)return;
      const tag=value, owner=this;
      bindSnakeFeatures(owner);
      let p=tag,descriptor;
      while(p && !descriptor){descriptor=Object.getOwnPropertyDescriptor(p,'visible');p=Object.getPrototypeOf(p);}
      if(!descriptor?.get || !descriptor?.set)return;
      let requested=descriptor.get.call(tag);
      let dot=null;
      let ttText=null,ttResult=false;
      const isTT=()=>{const text=tag.text;if(text!==ttText){ttText=text;ttResult=/\bTT\b/i.test(String(text??''));}return ttResult;};
      const ensureDot=()=>{
        if(dot && !dot.destroyed)return dot;
        try{
          const base=parseFloat(tag.style.fontSize)||14;
          dot=new tag.constructor({text:'\u25CF',resolution:3,style:{
            fontFamily:'Arial',fontSize:Math.max(6,Math.round(base*0.6)),fontWeight:'700',fill:'#ff2d3a',
            stroke:{color:'#ffd9dc',width:1},
            dropShadow:{color:'#ff2d3a',alpha:.85,blur:4,distance:0,angle:0},
            padding:6
          }});
          if(dot.anchor)dot.anchor.set(.5,1);
          dot.eventMode='none';
          owner.ca.addChild(dot);
        }catch(error){dot=null;}
        return dot;
      };
      const entry={tag,apply(){
        if(tag.destroyed || owner.Ic.destroyed || owner.ca.destroyed)return;
        descriptor.set.call(tag,extraPrefs.hidePlayerTags?false:requested);
        const showDot=!!(extraPrefs.hidePlayerTags && requested && isTT());
        const d=showDot?ensureDot():dot;
        if(d && !d.destroyed){
          d.visible=showDot;
          if(showDot)d.position.set(owner.Ic.width/2, owner.Ic.position.y-owner.Ic.height*(owner.Ic.anchor?.y||0)-1);
        }
        if(extraPrefs.hidePlayerTags) {
          owner.Ic.position.x=0;
          owner.ca.pivot.x=owner.Ic.position.x + owner.Ic.width/2;
        } else {
          owner.Ic.position.x=owner.F.mg ? tag.width+1 : 0;
          owner.ca.pivot.x=owner.ca.width/2;
        }
      }};
      Object.defineProperty(tag,'visible',{configurable:true,get(){return descriptor.get.call(this);},set(next){requested=next;entry.apply();}});
      tag.__wzgTagVisibility=entry;
      trackWeak(playerTagRefs,entry,e=>e.tag.destroyed);
      const initName=snakeInitMethod(owner),original=initName?owner[initName]:null;
      if(typeof original==='function')owner[initName]=function(){
        const result=original.apply(this,arguments);entry.apply();return result;
      };
      nativeTimeout(()=>entry.apply(),0);
    }});
  }
  installPlayerTagBinding();

  const antiLagBackupKey='wzg-anti-lag-backup';
  function writeNativeConfig(value) {
    const input=encodeURIComponent(JSON.stringify(value));
    let key=73,encoded=key.toString(16).padStart(2,'0');
    for(let i=0;i<input.length;i++){key=(3793+4513*key)&255;encoded+=(input.charCodeAt(i)^key).toString(16).padStart(2,'0');}
    store.set('wtr_config',encoded);
  }
  function restorePreviousResolution() {
    const backup=loadJSON(antiLagBackupKey,null);
    if(!backup)return;
    const config=readNativeConfig();
    config['1n']=backup.low;config['1ac']=backup.ultra;
    writeNativeConfig(config);
    store.remove(antiLagBackupKey);
  }
  restorePreviousResolution();
const abilityHudOwners=new Set(),abilityHudBound=new WeakSet();let abilityHudTextures=null,abilityHudLoading=null;
const abilityHudColors=[0xf1d600,0xe6a832,0x00b7d5,0xff3944,0x00b7d5,0xd7e600,0xed4394,0x219bd6];
function ensureAbilityHudTextures(sample){
 if(abilityHudTextures||abilityHudLoading||!sample)return;
 const Texture=sample.texture.constructor,Rect=sample.texture.frame.constructor;
 abilityHudLoading=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{try{// Source cells are 62px apart, not 64px. Repack with a transparent gutter.
const packed=document.createElement('canvas');packed.width=256;packed.height=128;const paint=packed.getContext('2d');
for(let row=0;row<2;row++)for(let col=0;col<4;col++)paint.drawImage(img,col*62,row*62,62,62,col*64+1,row*64+1,62,62);
const base=Texture.from(packed);const coords=[[64,0],[128,0],[0,0],[64,64],[192,64],[128,64],[0,64],[192,0]];abilityHudTextures=coords.map(([x,y])=>new Texture({source:base.source,frame:new Rect(x,y,64,64)}));resolve()}catch(e){reject(e)}};img.onerror=reject;assetURL('ability-hud.png').then(u=>{img.src=u;},reject);});
 abilityHudLoading.then(()=>{abilityHudLoading=null;refreshAbilityHud();},()=>{abilityHudLoading=null;});
}
function styleAbilityHud(hud){
 if(!extraPrefs.wormateAbilityHud&&!hud.__wzgAbilityStyled)return;
 hud.__wzgAbilityStyled=!!extraPrefs.wormateAbilityHud;
 let sample;for(const [key,row] of Object.entries(hud.uc||{})){
 const icon=row.getChildAt(0),label=row.getChildAt(1);if(!icon||!label?.style)continue;
 if(!row.__wzgHudOriginal)row.__wzgHudOriginal={texture:icon.texture,fill:label.style.fill};
 sample=icon;const id=Number(key),active=extraPrefs.wormateAbilityHud&&abilityHudTextures&&abilityHudTextures[id];
 const texture=active||row.__wzgHudOriginal.texture;if(icon.texture!==texture)icon.texture=texture;
 const color=active?abilityHudColors[id]:row.__wzgHudOriginal.fill;if(label.style.fill!==color)label.style.fill=color;
 }
 if(extraPrefs.wormateAbilityHud)ensureAbilityHudTextures(sample);
}
function refreshAbilityHud(){for(const ref of abilityHudOwners){const hud=ref.deref();if(!hud||hud.destroyed){abilityHudOwners.delete(ref);continue;}styleAbilityHud(hud);}}
function bindAbilityHud(owner){const hud=hudOf(owner)?.Jc;if(!hud?.uc||typeof hud.xa!=='function'||abilityHudBound.has(hud))return;abilityHudBound.add(hud);abilityHudOwners.add(new WeakRef(hud));const update=hud.xa;hud.xa=function(){const result=update.apply(this,arguments);styleAbilityHud(this);applyMobileHud();return result;};styleAbilityHud(hud);}

const FX_DUR=[40,40,40,120,50,25,40];
function decorateEffects(snake){
  const V=snake.V;if(!V||!V.Eb||V.destroyed)return;
  let swapped=false;
  for(const id in V.Eb){
    const icon=V.Eb[id],fx=snake.ga&&snake.ga[id];
    if(!icon||icon.destroyed||!fx||!fx.sa)continue;
    if(!icon.__wzgFxOrig)icon.__wzgFxOrig=icon.texture;
    const wantWormate=extraPrefs.wormateEffectIcons;
    if(wantWormate&&!abilityHudTextures)ensureAbilityHudTextures(icon);
    const want=(wantWormate&&abilityHudTextures&&abilityHudTextures[id])||icon.__wzgFxOrig;
    if(icon.texture!==want){icon.texture=want;icon.width=30;icon.height=30;}
    if(icon.texture!==icon.__wzgFxOrig)swapped=true;
  }
  snake.__wzgFxTouched=swapped;   // enquanto houver icone trocado, essa cobra ainda precisa ser restaurada se o toggle for desligado
}
const fxPatchedOwners=new WeakSet();
let fxStableCount=0,fxNeedsSetter=false;
const fxPerf={on:false,calls:0,shown:0,culled:0,ms:0,timer:0};
const fxWin={calls:0,on:0};
let fxCullOff=false;
function snakeOnScreen(V){
  try{
    let x,y;
    const wt=V.worldTransform;
    if(wt&&typeof wt.tx==='number'){x=wt.tx;y=wt.ty;}
    else if(typeof V.getGlobalPosition==='function'){const p=V.getGlobalPosition();x=p.x;y=p.y;}
    else return true;
    if(!Number.isFinite(x)||!Number.isFinite(y))return true;
    const w=PAGE.innerWidth,h=PAGE.innerHeight,m=Math.max(w,h)*.35+100;
    return x>-m&&y>-m&&x<w+m&&y<h+m;
  }catch(e){return true;}
}
PAGE.betterzillaPerf=function(on){
  fxPerf.on=on===undefined?!fxPerf.on:!!on;
  if(fxPerf.timer){PAGE.clearInterval(fxPerf.timer);fxPerf.timer=0;}
  fxPerf.calls=fxPerf.shown=fxPerf.culled=fxPerf.ms=0;
  if(fxPerf.on){
    fxPerf.timer=nativeInterval(()=>{
      console.log('[Betterzilla perf] /s -> Pe chamado: '+Math.round(fxPerf.calls/2)+' | processadas: '+Math.round(fxPerf.shown/2)+' | fora da tela (puladas): '+Math.round(fxPerf.culled/2)+' | tempo no efeito: '+(fxPerf.ms/2).toFixed(2)+' ms/s'+(fxCullOff?' | corte por tela DESLIGADO (posicao invalida)':''));
      fxPerf.calls=fxPerf.shown=fxPerf.culled=fxPerf.ms=0;
    },2000);
  }
  return fxPerf.on;
};
function fxWrap(orig){
  const patched=function(){
    const r=orig.apply(this,arguments);
    if(fxPerf.on)fxPerf.calls++;
    if(!extraPrefs.wormateEffectIcons&&!this.__wzgFxTouched)return r;
    const V=this.V;
    if(!fxCullOff&&V){
      const on=snakeOnScreen(V);
      if(on)fxWin.on++;
      if(++fxWin.calls>=1500){if(fxWin.on===0){fxCullOff=true;console.warn('[Betterzilla] corte por tela desligado: posicao das cobras invalida.');}fxWin.calls=fxWin.on=0;}
      if(!on){if(fxPerf.on)fxPerf.culled++;return r;}
    }
    const t0=fxPerf.on?performance.now():0;
    try{decorateEffects(this);}catch(error){if(!featureBindingWarnings.has('decorateEffects')){featureBindingWarnings.add('decorateEffects');console.error('[Betterzilla] decorateEffects',error);}}
    if(fxPerf.on){fxPerf.ms+=performance.now()-t0;fxPerf.shown++;}
    return r;
  };
  patched.__wzgFxProto=true;
  return patched;
}
function hookEffectSnake(s){
  if(typeof s.Pe!=='function'||typeof s.Le!=='function'||(typeof s.dk!=='function'&&typeof s.Bf!=='function'))return;
  const objProto=PAGE.Object.prototype,has=Object.prototype.hasOwnProperty;
  if(!has.call(s,'Pe')){
    let owner=Object.getPrototypeOf(s);
    while(owner&&owner!==objProto&&!has.call(owner,'Pe'))owner=Object.getPrototypeOf(owner);
    if(owner&&owner!==objProto&&typeof owner.Pe==='function'){
      if(!fxPatchedOwners.has(owner)&&!owner.Pe.__wzgFxProto){owner.Pe=fxWrap(owner.Pe);fxPatchedOwners.add(owner);fxStableCount=0;bzSignal('fx');}
      else fxStableCount++;
      return;
    }
  }
  if(s.__wzgFxHooked)return;
  s.__wzgFxHooked=true;
  s.Pe=fxWrap(s.Pe);
  fxNeedsSetter=true;fxStableCount=0;bzSignal('fx');
}
(function installEffectHook(){
  const fxProto=PAGE.Object.prototype;
  if(Object.getOwnPropertyDescriptor(fxProto,'ga')){console.warn('[Betterzilla] "ga" ja esta hookado (outro script de efeitos instalado?). Timers e icones Wormate desativados.');return;}
  const setter=function(value){
    Object.defineProperty(this,'ga',{value,writable:true,configurable:true,enumerable:true});
    try{hookEffectSnake(this);}catch(error){}
    if(fxStableCount>=40&&!fxNeedsSetter){const d=Object.getOwnPropertyDescriptor(fxProto,'ga');if(d&&d.set===setter)delete fxProto.ga;}
  };
  Object.defineProperty(fxProto,'ga',{configurable:true,set:setter});
})();
const wormateFoodEntries=new Set(),wormateFoodParts=new WeakSet();
let wormateFoodTextures=null,wormateFoodLoading=null;
const wormateFoodCrops=[[263,0,60,64],[325,0,61,64],[450,0,60,66],[326,66,54,66],[197,135,56,59],[378,122,64,52],[384,240,49,61],[49,320,54,68],[0,260,49,64],[307,290,51,61],[103,252,51,66],[54,254,47,61],[0,66,64,64],[198,0,64,64],[447,187,63,47],[380,187,63,47],[253,192,63,47],[200,66,58,62],[2,131,58,62],[326,2,58,62],[2,431,62,33],[264,2,58,62],[320,238,61,46],[246,243,61,46],[180,253,61,46],[2,326,37,62],[361,300,37,62],[295,350,37,62],[402,332,62,33],[68,69,58,62],[205,355,64,35],[2,392,63,35],[102,376,64,35],[453,2,49,63],[64,135,50,63],[2,197,49,63],[170,394,62,33],[135,68,58,62],[130,134,50,63],[327,68,51,64],[69,415,62,33],[336,366,62,33],[118,201,58,51],[184,198,58,51],[435,238,59,43],[435,285,58,43],[382,119,58,52],[318,136,58,52],[262,126,52,62],[197,132,52,62],[262,68,61,54],[388,61,61,54]];
function applyWormateFood(entry){
 const potion=entry.type>=200&&entry.type<=205;
 const active=extraPrefs.wormateFood&&wormateFoodTextures;
 entry.sprite.texture=active?wormateFoodTextures[potion?6+entry.type-200:14+entry.foodVariant]:entry.texture;
 if(entry.glow&&!entry.glow.destroyed){
 entry.glow.texture=active?wormateFoodTextures[potion?13:12]:entry.glowTexture;
 if(entry.glow.anchor)entry.glow.anchor.set(active?.5:entry.glowAnchorX,active?.5:entry.glowAnchorY);
 }
}
function refreshWormateFood(){
 let sample;
 for(const ref of wormateFoodEntries){const entry=ref.deref();if(!entry||entry.sprite.destroyed){wormateFoodEntries.delete(ref);continue;}sample=entry;applyWormateFood(entry);}
 if(!extraPrefs.wormateFood||wormateFoodTextures||wormateFoodLoading||!sample)return;
 const Texture=sample.texture.constructor;
 wormateFoodLoading=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{try{
 const textures=wormateFoodCrops.map(([x,y,w,h],index)=>{
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
 if(index>=6&&index<=11){
  const probe=document.createElement('canvas');probe.width=w;probe.height=h;const pc=probe.getContext('2d');pc.drawImage(img,x,y,w,h,0,0,w,h);
  const pixels=pc.getImageData(0,0,w,h).data;let left=w,top=h,right=-1,bottom=-1;
  for(let py=0;py<h;py++)for(let px=0;px<w;px++)if(pixels[(py*w+px)*4+3]>40){left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);}
  if(right>=left){x+=left;y+=top;w=right-left+1;h=bottom-top+1;}
 }
 const scale=60/Math.max(w,h);canvas.getContext('2d').drawImage(img,x,y,w,h,(64-w*scale)/2,(64-h*scale)/2,w*scale,h*scale);return canvas;
 });
 const sheet=document.createElement('canvas');sheet.width=64*textures.length;sheet.height=64;const sheetContext=sheet.getContext('2d');textures.forEach((canvas,index)=>sheetContext.drawImage(canvas,index*64,0));
 const base=Texture.from(sheet),Rect=sample.texture.frame.constructor;
 wormateFoodTextures=textures.map((_,index)=>new Texture({source:base.source,frame:new Rect(index*64,0,64,64)}));resolve();
 }catch(error){reject(error)}};img.onerror=reject;assetURL('wormate-food.png').then(u=>{img.src=u;},reject);});
 wormateFoodLoading.then(()=>{wormateFoodLoading=null;refreshWormateFood();},error=>{wormateFoodLoading=null;console.warn('[Betterzilla] Food images unavailable; keeping originals.',error);});
}
function bindWormateFood(view,food){
 const sprite=view.Oa?.J?.o,type=food.F?.$a;
 if(!sprite||!Number.isInteger(type)||type<0||(type>=80&&(type<200||type>205))||wormateFoodParts.has(sprite))return;
 wormateFoodParts.add(sprite);const glow=view.Oa.id?.o;const foodVariant=((Math.imul(type,31)^Math.imul(Math.floor((food.Nc||0)*64),73856093)^Math.imul(Math.floor((food.Qc||0)*64),19349663))>>>0)%38;const entry={sprite,type,foodVariant,texture:sprite.texture,glow,glowTexture:glow?.texture,glowAnchorX:glow?.anchor?.x,glowAnchorY:glow?.anchor?.y};sprite.__wzgFoodReplacement=entry;trackWeak(wormateFoodEntries,entry,e=>e.sprite.destroyed);
 if(wormateFoodTextures)applyWormateFood(entry);else if(extraPrefs.wormateFood&&!wormateFoodLoading)refreshWormateFood();
}
function installWormateFoodBinding(view){
 const proto=Object.getPrototypeOf(view);if(proto.__wzgFoodReplacementBound||typeof proto.xa!=='function')return;
 const update=proto.xa;Object.defineProperty(proto,'__wzgFoodReplacementBound',{value:true});
 proto.xa=function(food){
    if(!this.__wzgFoodReplacementChecked){
      this.__wzgFoodReplacementChecked=true;bindWormateFood(this,food);
      if(Object.getPrototypeOf(this)===proto)Object.defineProperty(this,'xa',{value:update,writable:true,configurable:true,enumerable:false});
    }
    return arguments.length<2?update.call(this,food):update.apply(this,arguments);
  };
}

  let foodHookSync = null;
  function installFoodGlowFilter() {
    const objectProto=PAGE.Object.prototype;
    if(Object.getOwnPropertyDescriptor(objectProto,'Oa'))return;
    const capture=function(value){
      Object.defineProperty(this,'Oa',{value,writable:true,configurable:true,enumerable:true});
      if(!value?.J?.o || !value?.id?.o || typeof value.ba!=='function' || value.ba.length!==6 || typeof value.la!=='function')return;
      installWormateFoodBinding(this);bzSignal('food');
      const proto=Object.getPrototypeOf(value),original=proto.ba;
      if(typeof original!=='function')return;
      let foodGen=0;
      const patched=function(x,y,size,alpha,glowSize,glowAlpha){
        if(!extraPrefs.hideFoodGlow && !extraPrefs.lightFood){this.__wzgFoodCache=null;return original.call(this,x,y,size,alpha,glowSize,glowAlpha);}
        this.J.Aa(true);
        let c=this.__wzgFoodCache;
        if(!c||c.g!==foodGen)c=this.__wzgFoodCache={g:foodGen};
        if(c.x!==x||c.y!==y){this.J.Je(x,y);c.x=x;c.y=y;}
        if(c.size!==size){this.J.ib(size);c.size=size;}
        if(c.alpha!==alpha){this.J.Ca(alpha);c.alpha=alpha;}
        if(this.id.yd())this.id.Aa(false);
      };
      foodHookSync=()=>{foodGen++;proto.ba=(extraPrefs.hideFoodGlow||extraPrefs.lightFood)?patched:original;};foodHookSync();
      if(Object.getOwnPropertyDescriptor(objectProto,'Oa')?.set===capture)delete objectProto.Oa;
    };
    Object.defineProperty(objectProto,'Oa',{configurable:true,set:capture});
  }
  installFoodGlowFilter();

  function installScreenEffectControl(){
    const proto=PAGE.Object.prototype;
    function captureProperty(key,bind){
      if(Object.getOwnPropertyDescriptor(proto,key))return;
      const capture=function(value){
        Object.defineProperty(this,key,{value,writable:true,configurable:true,enumerable:true});
        if(bind(this,value)&&Object.getOwnPropertyDescriptor(proto,key)?.set===capture)delete proto[key];
      };
      Object.defineProperty(proto,key,{configurable:true,set:capture});
    }
    captureProperty('md',(owner,shader)=>{
      if(!shader?.resources?.uniforms?.uniforms?.uColorOverlay||typeof owner.fe!=='function')return false;
      const original=owner.fe;
      owner.fe=function(r,g,b,a){return original.call(this,r,g,b,extraPrefs.noScreenEffects?0:a);};
      return true;
    });
    captureProperty('Fb',(owner,sprite)=>{
      if(!owner.da||!owner.Xa||!owner.qd||!sprite)return false;
      let p=sprite,d;
      while(p&&!d){d=Object.getOwnPropertyDescriptor(p,'alpha');p=Object.getPrototypeOf(p);}
      if(!d?.get||!d?.set)return false;
      Object.defineProperty(sprite,'alpha',{configurable:true,get(){return d.get.call(this)},set(v){d.set.call(this,extraPrefs.noScreenEffects?0:v)}});
      return true;
    });
  }
  installScreenEffectControl();

  const extraRuntime = { ranks: new Map(), effects: new Set() };
  let formattingScoreboard = false;
  const NativeNumberFormat = PAGE.Intl?.NumberFormat;
  if (NativeNumberFormat && extraPrefs.fullScores) {
    const optionsForScores = args => {
      if (!formattingScoreboard || !extraPrefs.fullScores || args[1]?.notation !== 'compact') return args;
      return [args[0], {...args[1], notation:'standard', useGrouping:false, maximumFractionDigits:0}];
    };
    PAGE.Intl.NumberFormat = new Proxy(NativeNumberFormat, {
      construct(target,args,newTarget) { return Reflect.construct(target,optionsForScores(args),newTarget); },
      apply(target,self,args) { return Reflect.apply(target,self,optionsForScores(args)); },
    });
  }
  const scoreboardRefs = new Set();
  const playerColors = [0x9856dc,0x84b936,0x955cdb,0xb76b29,0xe66a34,0xd6be45,0xa0a0a0,0x25a8b4,0xac94b5,0xd34646,0x619ccb,0xb56bc9];
  function playerScoreColor(name) {
    let hash=2166136261;
    for(let i=0;i<name.length;i++)hash=Math.imul(hash^name.charCodeAt(i),16777619);
    return playerColors[(hash>>>0)%playerColors.length];
  }
  function refreshScoreboardColors(){
    for(const ref of scoreboardRefs){const board=ref.deref();if(!board||board.destroyed){scoreboardRefs.delete(ref);continue;}if(board.Eb)board.xa(board.Eb);}
  }
  const scoreboards = new WeakSet();
  function bindFullScores(node) {
    if (scoreboards.has(node)) return;
    scoreboards.add(node);
    scoreboardRefs.add(new WeakRef(node));
    const update = node.xa;
    node.xa = function() {
      const previous = formattingScoreboard;
      formattingScoreboard = true;
      try {
        const result = update.apply(this,arguments);
        for (const row of this.L) {
          if (!row.od || !row.$) continue;
          const numbered=/^\d+$/.test(String(row.kd?.text));
          const rank=Number(row.kd?.text),players=this.Eb?.hd;
          const rankedPlayer=Array.isArray(players)?players[rank-1]:null;
          const playerId=rankedPlayer?.Oi??rankedPlayer?.Qi??rankedPlayer?.Mi;
          const own=numbered&&(ownHudPlayerId!=null
            ? (playerId!=null?playerId===ownHudPlayerId:rank> (players?.length??Infinity))
            : row.$.alpha===1);
          row.__wzgVisualOwn=own;
          row.__wzgVisualOriginal=row.$.text;
          if(own&&visualAlias()&&row.$.text!==visualAlias())row.$.text=visualAlias();
          if(extraPrefs.colorfulScoreboard) {
            if(row===this.L[0]&&row.$.text!=='Top 10')row.$.text='Top 10';
            for(const text of [row.kd,row.$,row.od])if(text?.style){
              {const st=text.style;if(st.fontFamily!=='Arial')st.fontFamily='Arial';if(st.fontSize!==12)st.fontSize=12;if(st.fontWeight!=='400')st.fontWeight='400';}
            }
            if(numbered && row.$.text && row.$.text!=='---' && row.$.text!=='No nickname') {
              const color=own?0xffffff:playerScoreColor(String(row.$.text));
              for(const text of [row.kd,row.$,row.od]){if(text.style.fill!==color)text.style.fill=color;if(text.alpha!==1)text.alpha=1;}
            }
          }
          if(!extraPrefs.colorfulScoreboard)for(const text of [row.kd,row.$,row.od])if(text?.style){{const st=text.style;if(st.fontFamily!=='PTSans')st.fontFamily='PTSans';if(st.fontSize!==12)st.fontSize=12;if(st.fontWeight!=='400')st.fontWeight='400';}}
          const wide = extraPrefs.fullScores;
          row.od.position.x = 220;
          const clip = row.$.parent?.mask;
          const width = wide ? Math.max(60,212-row.od.width) : 180;
          if (clip?.clear && clip.rect && row.__wzgClipWidth !== width) {clip.clear().rect(0,0,width,20).fill();row.__wzgClipWidth=width;}
        }
        return result;
      } finally { formattingScoreboard = previous; }
    };
  }
  extraPrefs.rankSize = Number.isFinite(Number(extraPrefs.rankSize)) ? Math.max(50,Math.min(130,Number(extraPrefs.rankSize))) : 75;
  const mobileHudControllers=new WeakSet();
  let mobileHudController=null;
  const coarsePointerMQ=PAGE.matchMedia('(pointer:coarse)');
  function mobileHudActive(){return extraPrefs.mobileHudLayout&&(coarsePointerMQ.matches||PAGE.innerWidth<=900);}
  function mobileHudRemember(node){if(!node.__wzgMobileHud)node.__wzgMobileHud={x:node.position.x,y:node.position.y,sx:node.scale.x,sy:node.scale.y,eventMode:node.eventMode};return node.__wzgMobileHud;}
  let mobileHudDirty=false; // true once the mobile layout moved something that must be restored
  function applyMobileHud(){
    const controller=mobileHudController,map=controller?.t;if(!map||map.destroyed)return;
    const active=mobileHudActive();
    if(!active&&!mobileHudDirty)return; // desktop fast path: nothing was ever moved
    const nodes=[map,...[controller.__wzgMobileMode,controller.Jc,...Object.values(controller.Jc?.uc||{})].filter(Boolean),...[...extraRuntime.ranks].filter(([n])=>!n.destroyed&&n.parent===map.parent).map(([n])=>n)];
    if(!active){for(const node of nodes){const state=node.__wzgMobileHud;if(!state)continue;node.position.set(state.x,state.y);node.scale.set(state.sx,state.sy);node.eventMode=state.eventMode;delete node.__wzgMobileHud;}mobileHudDirty=false;return;}
    mobileHudDirty=true;
    const moving=hudMoveDrag?{node:hudMoveDrag.node,x:hudMoveDrag.node.x,y:hudMoveDrag.node.y}:null;
    const height=controller.ic?.clientHeight||PAGE.innerHeight,width=controller.ic?.clientWidth||PAGE.innerWidth;
    const unit=Math.min(1,Math.max(.65,(height-24)/345),Math.max(.65,width/390));
    mobileHudRemember(map);map.scale.set(40/map.I*unit);map.position.set(60*unit,60*unit);map.eventMode='none';
    const modeButton=controller.__wzgMobileMode;if(modeButton&&!modeButton.destroyed){mobileHudRemember(modeButton);modeButton.scale.set(.65*unit);modeButton.position.set(116*unit,8*unit);}
    const powers=controller.Jc;if(powers){mobileHudRemember(powers);powers.position.set(116*unit,42*unit);powers.scale.set(.8*unit);const columns=Math.max(1,Math.min(4,Math.floor((width-140*unit)/(40*.8*unit))));Object.values(powers.uc||{}).forEach((row,index)=>{mobileHudRemember(row);row.position.set(index%columns*40,Math.floor(index/columns)*68);});}
    const entries=[...extraRuntime.ranks].filter(([n])=>!n.destroyed&&n.parent===map.parent),hs=entries.find(([,v])=>v.kind==='hs')?.[0],record=entries.find(([,v])=>v.kind==='record')?.[0];
    let bottom=156*unit;
    for(const node of [hs,record]){if(!node)continue;mobileHudRemember(node);node.scale.set(.6*unit*extraPrefs.rankSize/75);node.position.set(8*unit,bottom);node.eventMode='none';const labels=[node.Ye,...node.children.slice(2)];bottom=node.position.y+Math.max(25,...labels.map(t=>t.position.y+t.height))*.6*unit*extraPrefs.rankSize/75+10*unit;}
    restoreHudPositions();if(moving)moving.node.position.set(moving.x,moving.y);
  }
  function bindMobileHud(owner){const controller=hudOf(owner);if(!controller?.t||mobileHudControllers.has(controller))return;mobileHudControllers.add(controller);mobileHudController=controller;
    const captureMode=node=>{if(!node?.texture||node.cursor!=='pointer')return;const source=node.texture.source;const url=[source?.label,source?._sourceOrigin,source?.resource?.src,source?.resource?.currentSrc].filter(v=>typeof v==='string').join(' ');const callbacks=typeof node.listeners==='function'?node.listeners('pointerup'):[];if(/mobile\/mobile_[1-4]\.png/.test(url)||callbacks.some(fn=>typeof fn==='function'&&/1f/.test(Function.prototype.toString.call(fn))&&/\.length/.test(Function.prototype.toString.call(fn)))){controller.__wzgMobileMode=node;applyMobileHud();}};
    controller.ea?.children?.forEach(captureMode);if(controller.ea){const add=controller.ea.addChild;controller.ea.addChild=function(...nodes){const result=add.apply(this,nodes);nodes.forEach(captureMode);return result;};}
    const resize=controller.fa;if(typeof resize==='function')controller.fa=function(){const result=resize.apply(this,arguments);applyMobileHud();return result;};applyMobileHud();}
  let mobileHudResizePending=false;
  PAGE.addEventListener('resize',()=>{if(mobileHudResizePending)return;mobileHudResizePending=true;nativeRAF(()=>{mobileHudResizePending=false;refreshMobileHud();});});
  function refreshMobileHud(){applyMobileHud();for(const [node,data] of extraRuntime.ranks)if(!node.destroyed)node.tf(data.rows);updateRankSize();}

  function updateRankSize() {
    for (const [node,data] of extraRuntime.ranks) if (!node.destroyed) {
      node.scale.set(data.scaleX * extraPrefs.rankSize / 100, data.scaleY * extraPrefs.rankSize / 100);
    }
    if (!extraPrefs.rankRedesign) {applyMobileHud();return;}
    const entries = [...extraRuntime.ranks].filter(([node]) => !node.destroyed);
    const hs = entries.find(([,data]) => data.kind === 'hs')?.[0];
    const record = entries.find(([,data]) => data.kind === 'record')?.[0];
    if (hs && record && hs.parent === record.parent) {
      const labels = [hs.Ye, ...hs.children.slice(2)];
      const bottom = Math.max(...labels.map(text => text.position.y + text.height));
      record.position.y = hs.position.y + bottom * hs.scale.y + 8 - record.Ye.position.y * record.scale.y;
    }
    applyMobileHud();
  }
  function readNativeConfig() {
    try {
      const value = store.get('wtr_config') || '{}';
      if (value.startsWith('{')) return JSON.parse(value);
      let key = parseInt(value.slice(0,2),16), result = '';
      for (let i=2;i<value.length;i+=2) {
        key = (3793 + 4513 * key) & 255;
        result += String.fromCharCode(parseInt(value.slice(i,i+2),16) ^ key);
      }
      return JSON.parse(decodeURIComponent(result));
    } catch { return {}; }
  }

  function clearScoreEffects(container) {
    for (const text of container.L.splice(0)) {
      if (text.parent === container) container.removeChild(text);
      if (!text.destroyed) text.destroy?.();
    }
    container.Zc = 0;
  }
  function scorePointsKey(node) { return typeof node.Pl==='function' ? 'Pl' : (typeof node.Ol==='function' ? 'Ol' : null); }
  function bindScoreEffects(container) {
    if (extraRuntime.effects.has(container)) return;
    const killKey = typeof container.Ej==='function' ? 'Ej' : 'Fj';
    const pointsKey = scorePointsKey(container);
    if (!pointsKey) return;
    const points = container[pointsKey], kill = container[killKey], animate = container.xa;
    container[pointsKey] = function() {
      if (extraPrefs.antiLag || extraPrefs.hideScorePopups) { this.Zc = 0; return; }
      return points.apply(this, arguments);
    };
    container[killKey] = function() {
      const result = kill.apply(this, arguments);
      if (extraPrefs.antiLag) clearScoreEffects(this);
      return result;
    };
    container.xa = function() {
      if (extraPrefs.antiLag) { if (this.L.length) clearScoreEffects(this); return; }
      return animate.apply(this, arguments);
    };
    extraRuntime.effects.add(container);
    if (extraPrefs.antiLag) clearScoreEffects(container);
  }

  function snapshotRank(node) {
    const scores = node.children.slice(2);
    return scores.map(score => {
      const pieces = node.Tb.children.slice(1).filter(text => text.position.y === score.position.y);
      const name = pieces.map(text => String(text.text || '')).join('').replace(/^\d+\.\s*/, '');
      return [name, score.text, -1];
    });
  }
  function styleRank(node, kind) {
    const enabled = extraPrefs.rankRedesign||mobileHudActive();
    Object.assign(node.Ye.style, {fontFamily:enabled ? 'Arial' : 'PTSans', fontWeight:enabled ? '700' : '400', fontSize:enabled ? 18 : 12, fill:enabled ? 0xf3d326 : 0xffffff});
    node.Ye.text = enabled ? (kind === 'record' ? 'Records' : 'TOP HS') : (kind === 'record' ? 'RECORD' : 'HS');
    node.Ye.anchor.x = enabled ? 0 : .5;
    node.Ye.position.x = enabled ? 5 : 100;
    const mask = node.Tb.children[0];
    if (mask?.clear && mask.rect) mask.clear().rect(0,0,enabled ? 240 : 170,enabled ? 400 : 155).fill();
    if (!enabled) return;
    const names = node.Tb.children.slice(1), scores = node.children.slice(2);
    names.forEach((text, index) => {
      Object.assign(text.style, {fontFamily:'Arial', fontSize:16, fontWeight:'700', fill:0xe9e9e9});
      text.position.set(5, 32 + index * 25);
      if (kind === 'record') text.text = (['🥇','🥈','🥉'][index] || (index+1)+'.') + ' ' + String(text.text).replace(/^\d+\.\s*/, '');
    });
    scores.forEach((text,index) => {
      Object.assign(text.style, {fontFamily:'Arial', fontSize:16, fontWeight:'700', fill:0xe9e9e9});
      text.position.set(270,32 + index * 25);
    });
    if (node.hitArea) {node.hitArea.width=275; node.hitArea.height=36+scores.length*25;}
  }
  function bindRank(node, kind) {
    if (extraRuntime.ranks.has(node)) return;
    const original = node.tf;
    const data = {kind, rows:snapshotRank(node), scaleX:node.scale.x ?? 1, scaleY:node.scale.y ?? 1};
    extraRuntime.ranks.set(node,data);
    node.tf = function(rows) {
      const mode = String(extraPrefs.rankRedesign) + ':' + String(extraPrefs.recordTop3)+':'+mobileHudActive();
      if (data.mode === mode && data.rows.length === rows.length
        && rows.every((row,index) => row.length === data.rows[index].length && row.every((value,column) => value === data.rows[index][column]))) { updateRankSize(); return; }
      data.mode = mode;
      data.rows = rows.map(row => [...row]);
      const limited = kind === 'record' && (extraPrefs.recordTop3||mobileHudActive()) ? data.rows.slice(0,3) : data.rows;
      const input = (extraPrefs.rankRedesign||mobileHudActive()) ? limited.map(row => [row[0],row[1],-1]) : limited;
      const retired = [...this.Tb.children.slice(1),...this.children.slice(2)];
      const result = original.call(this,input);
      for (const old of retired) if (!old.parent && !old.destroyed) old.destroy?.();
      styleRank(this,kind);
      updateRankSize();
      return result;
    };
    node.tf(data.rows);
  }
  function inspectGameHUD(root) {
    const found = [];
    for (const node of (root?.children || []).slice(0,48)) {
      try {
      const title = node.Ye?.text;
      if (['HS','RECORD','TOP HS','Records'].includes(title) && typeof node.tf === 'function' && node.Tb?.children) {
        const kind = title === 'RECORD' || title === 'Records' ? 'record' : 'hs';
        bindRank(node,kind); found.push(kind);
      }
      if (scorePointsKey(node) && (typeof node.Ej === 'function' || typeof node.Fj === 'function') && typeof node.xa === 'function' && Array.isArray(node.L)) {bindScoreEffects(node);found.push('effects');}
      if (typeof node.be === 'function' && typeof node.xa === 'function' && Array.isArray(node.L) && typeof node.Rb === 'boolean') {bindFullScores(node);found.push('scoreboard');}
      } catch(error) {console.error('[Betterzilla] HUD node',error);}
    }
    return found;
  }
  function installHUDIntegration() {
    const previous = PAGE.__PIXI_RENDERER_INIT__;
    PAGE.__PIXI_RENDERER_INIT__ = function(renderer, version) {
      if (typeof previous === 'function') previous.apply(this, arguments);
      if (!renderer?.render) return;
      const render = renderer.render;
      const scanned = new WeakMap();
      const bound = new Set();
      renderer.render = function(options) {
        if (this.canvas?.id !== 'gameCanvas') { this.render = render; return render.apply(this, arguments); }
        const root = options?.container || options;
        if (root?.children && scanned.get(root) !== root.children.length) {
          scanned.set(root, root.children.length);
          try { for (const kind of inspectGameHUD(root)) bound.add(kind); } catch (error) { console.warn('[Betterzilla] HUD integration:',error); }
        }
        if (bound.size === 4) renderer.render = render;
        return render.apply(this, arguments);
      };
    };
  }
  installHUDIntegration();

  const ENEMY_CD_BACKUP='wzg-enemy-cd-backup';
  let enemyCdWarned=false;
  function findAbilitySelect(){
    const body=document.querySelector('.settings-modal .settings-body');if(!body)return null;
    const hasFull=sel=>[...sel.options].some(o=>/full/i.test(o.value)||/full/i.test(o.textContent));
    const candidates=[...body.querySelectorAll('select')].filter(hasFull);
    const label=sel=>{const row=sel.closest('.opt');return (row?.querySelector('.opT')?.textContent||row?.textContent||'');};
    return candidates.find(sel=>/abilit|habilit/i.test(label(sel)))
      || candidates.find(sel=>/abilit|habilit|power|skill|effect|icon/i.test(label(sel)))
      || null;
  }
  function setNativeSelect(select,value){
    if(select.value===value)return;
    select.value=value;
    select.dispatchEvent(new Event('input',{bubbles:true}));
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function applyAbilityDisplay(){
    const select=findAbilitySelect();
    if(!select){
      if(!enemyCdWarned){enemyCdWarned=true;console.warn('[Betterzilla] select "Show abilities" nao encontrado em Controls.');}
      return;
    }
    if(extraPrefs.wormateEffectIcons){
      const full=[...select.options].find(o=>/^full$/i.test(o.value.trim())||/^full$/i.test(o.textContent.trim()))
        ||[...select.options].find(o=>/full/i.test(o.value)||/full/i.test(o.textContent));
      if(!full||select.value===full.value)return;
      if(store.get(ENEMY_CD_BACKUP)===null)store.set(ENEMY_CD_BACKUP,select.value);
      setNativeSelect(select,full.value);
    }else{
      const previous=store.get(ENEMY_CD_BACKUP);
      if(previous===null)return;
      store.remove(ENEMY_CD_BACKUP);
      if([...select.options].some(o=>o.value===previous))setNativeSelect(select,previous);
    }
  }

  function mountExtraSettings(modal) {
    const section = modal.querySelector('#tab-extension');
    if (!section || document.getElementById('wzg-extra-options')) return;
    const row = document.createElement('div');
    row.id = 'wzg-extra-options'; row.className = 'opt';
    const toggle = (key,label,description) => `<label class="wzg-extra-toggle"><span class="wzg-extra-copy"><strong>${label}</strong><small>${description}</small></span><span class="wzg-extra-switch"><input type="checkbox" role="switch" data-extra="${key}" aria-label="${label}"><span class="wzg-extra-track" aria-hidden="true"></span></span></label>`;
    row.innerHTML = `<header class="wzg-extra-heading"><div><span class="wzg-extra-eyebrow">GAME CUSTOMIZATIONS</span><h4>Your game, your way</h4></div><span class="wzg-extra-badge">AUTO-SAVE</span></header>
      <div class="wzg-extra-grid wzg-organized-grid">
        <div class="wzg-settings-stack">
        <section class="wzg-extra-card" aria-label="Performance"><header><span class="wzg-extra-icon">${icons.performance}</span><div><h5>Performance</h5><p>Reduce visual work without changing resolution.</p></div></header>
${toggle('lightFood','Lightweight food','Remove food glow and skip unchanged food transforms. Keeps every item visible.')}
${toggle('antiLag','Anti-lag mode','Remove body glow and its updates, and hide floating effects. Keeps your resolution unchanged.')}
        </section>
        <section class="wzg-extra-card" aria-label="Helpers"><header><span class="wzg-extra-icon">${icons.controls}</span><div><h5>Helpers</h5><p>Visual guides for heads and the arena border.</p></div></header>
${toggle('x1RedHelper','X1 Red Helper','Show the arena border above snake bodies.')}
        </section>
<section class="wzg-extra-card" aria-label="Screen & food effects"><header><span class="wzg-extra-icon">${icons.visual}</span><div><h5>Screen & food effects</h5><p>Control flashes, food glow and floating text.</p></div></header>
${toggle('noScreenEffects','Disable screen flashes','Keep the background neutral near the border and remove the full-screen power-up overlay.')}
${toggle('wormateFood','Wormate food & portions','Wormate food, potions and glows. Hide food glow and Lightweight food still take priority.')}
${toggle('hideFoodGlow','Hide food glow','Remove the glow around food. Keeps food visible and restores glow when off.')}
${toggle('hideScorePopups','Hide +points popups','Hide the floating +2510 style texts when you eat food. Your score and HS counters keep working.')}
</section>
        </div>
        <div class="wzg-settings-stack">
        <section class="wzg-extra-card" aria-label="Rankings & scores"><header><span class="wzg-extra-icon">${icons.rank}</span><div><h5>Rankings & scores</h5><p>Size, colors and score display.</p></div></header>
          <label class="wzg-extra-range"><span>Ranking size <output id="wzg-rank-size-value"></output></span><small>Scales TOP HS and Records together.</small><input id="wzg-rank-size" type="range" min="50" max="130" step="5" aria-label="Ranking size"></label>
${toggle('mobileHudLayout','Mobile HUD layout','On phones: minimap, HS/KILL, TOP HS and three Records in a fixed left column. Desktop layout is unchanged.')}
${toggle('fullScores','Full score numbers','Show complete scores without M or B. Reload after enabling.')}
        </section>
        <section class="wzg-extra-card" aria-label="Names & effects"><header><span class="wzg-extra-icon">${icons.visual}</span><div><h5>Names & messages</h5><p>Choose what appears during a match.</p></div></header>








        </section>
<section class="wzg-extra-card" aria-label="Ability icons"><header><span class="wzg-extra-icon">${icons.visual}</span><div><h5>Ability icons</h5><p>Choose the effects shown in front of snakes.</p></div></header>
${toggle('wormateExtensionAbilities','Show speed & curve like Wormate extensions','Green speed arrows plus the golden curve chevron, shown together like the Wormate Extensions. Overrides Replace speed icon and Hide curve icon while on.')}
${toggle('hideCurveIcon','Hide curve icon','Hide only the blue curve spiral in front of snakes. Keep other ability effects.')}
${toggle('wormateEffectIcons','Wormate icons above snakes','Swap the effect icons shown above opponents (speed, curve, 2x, 5x...) for the Wormate ones. Needs the icon display set to full.')}
</section>
        </div>
      </div>`;
    section.appendChild(row);
    for(const delay of [0,400,1500,4000])nativeTimeout(applyAbilityDisplay,delay);
    const feed=section.querySelector('.wzg-kill-feed-option');
    const effects=row.querySelector('[aria-label="Names & effects"]');
    mountVisualName(effects);
    if(feed&&effects){
      effects.appendChild(feed);
    }
    function save() {
      store.set('wzg-game-extras',JSON.stringify(extraPrefs));
    }
    const colorCard=document.createElement('section');colorCard.className='wzg-extra-card';colorCard.setAttribute('aria-label','Colors');colorCard.innerHTML='<header><span class="wzg-extra-icon">'+icons.visual+'</span><div><h5>Colors</h5><p>Adjust the colors of the game.</p></div></header><label class="wzg-extra-range"><span>Saturation <output data-saturation-output></output></span><small>100% is original. Applies to the game, including its HUD.</small><input type="range" min="0" max="200" step="5" data-saturation aria-label="Game saturation"></label><button type="button" data-saturation-reset style="color:inherit;background:#ffffff08;border:1px solid #ffffff15;border-radius:8px;padding:7px 12px;cursor:pointer">Reset to 100%</button>';
    const stacks=row.querySelectorAll('.wzg-settings-stack');stacks[1].prepend(colorCard);
    for(const label of ['Camera','Performance','Helpers','Rankings & scores','Audio alerts']){const card=row.querySelector('[aria-label="'+label+'"]');if(card)stacks[0].appendChild(card);}
    for(const label of ['Colors','Map border','Screen & food effects','Ability icons','Names & effects']){const card=row.querySelector('[aria-label="'+label+'"]');if(card)stacks[1].appendChild(card);}
    const saturationInput=colorCard.querySelector('[data-saturation]'),saturationOutput=colorCard.querySelector('[data-saturation-output]');
    function syncSaturation(){saturationInput.value=extraPrefs.saturation;saturationOutput.textContent=extraPrefs.saturation+'%';applyGameSaturation();}
    saturationInput.addEventListener('input',()=>{extraPrefs.saturation=Number(saturationInput.value);syncSaturation();});saturationInput.addEventListener('change',save);colorCard.querySelector('[data-saturation-reset]').onclick=()=>{extraPrefs.saturation=100;syncSaturation();save();};syncSaturation();
    const rankSlider = row.querySelector('#wzg-rank-size');
    const rankOutput = row.querySelector('#wzg-rank-size-value');
    rankSlider.value = extraPrefs.rankSize;
    rankOutput.textContent = extraPrefs.rankSize + '%';
    rankSlider.addEventListener('input', () => {
      extraPrefs.rankSize = Number(rankSlider.value);
      rankOutput.textContent = extraPrefs.rankSize + '%';
      updateRankSize();
    });
    rankSlider.addEventListener('change', save);
    row.querySelectorAll('[data-extra]').forEach(input=>{
      const key=input.dataset.extra;input.checked=!!extraPrefs[key];
      input.addEventListener('change',()=>{
        extraPrefs[key]=input.checked;save();
        if(key==='wormateEffectIcons')applyAbilityDisplay(true);
        if(key==='x1RedHelper')refreshRedHelper();
        if(key==='hideCurveIcon')refreshCurveIcons();
        if(key==='mobileHudLayout')refreshMobileHud();
        if(key==='wormateFood')refreshWormateFood();
        if(key==='wormateAbilityHud')refreshAbilityHud();
        if(key==='replaceSpeedIcon')refreshSpeedReplacement();
        if(key==='wormateExtensionAbilities'){refreshSpeedReplacement();refreshCurveIcons();}
        if(key==='replaceMagnetIcon')refreshMagnetReplacement();
        if(key==='colorfulScoreboard')refreshScoreboardColors();
        if(key==='hideScorePopups'){if(input.checked)for(const node of extraRuntime.effects)if(!node.destroyed)clearScoreEffects(node);}
        if(key==='antiLag'){if(input.checked)for(const node of extraRuntime.effects)if(!node.destroyed)clearScoreEffects(node);}
        if(key==='hidePlayerTags')updatePlayerTags();
        if(key==='hideFoodGlow'||key==='lightFood')foodHookSync?.();
        if(key==='antiLag')segmentHookSyncs.forEach(f=>f());

        if (key==='recordTop3'||key==='rankRedesign') for(const [node,data] of extraRuntime.ranks) if(!node.destroyed)node.tf(data.rows);
      });
    });
    row.querySelectorAll('input[type="range"]').forEach(slider => {
      const paint = () => slider.style.setProperty('--wzg-fill', ((Number(slider.value)-Number(slider.min))/(Number(slider.max)-Number(slider.min))*100)+'%');
      paint(); slider.addEventListener('input',paint);
    });
  }



  const GAME_FONTS = {
    original: {label: 'Original', family: ''},
    arial: {label: 'Arial', family: 'Arial, sans-serif'},
    verdana: {label: 'Verdana', family: 'Verdana, sans-serif'},
    tahoma: {label: 'Tahoma', family: 'Tahoma, sans-serif'},
    trebuchet: {label: 'Trebuchet MS', family: '"Trebuchet MS", sans-serif'},
    georgia: {label: 'Georgia', family: 'Georgia, serif'},
    mono: {label: 'Consolas', family: 'Consolas, monospace'},
    system: {label: 'System', family: 'system-ui, sans-serif'},
  };
  const fontPrefs = loadJSON('wzg-game-font', {family:'arial'});
  if(store.get('wzg-arial-default-v1')!=='1'){fontPrefs.family='arial';store.set('wzg-game-font',JSON.stringify(fontPrefs));store.set('wzg-arial-default-v1','1');}
  if (!GAME_FONTS[fontPrefs.family]) fontPrefs.family = 'arial';
  const activeFont = fontPrefs.family;
  function replaceCanvasFont(value, family) {
    if (typeof value !== 'string') return value;
    return value.replace(/^(.*?\b\d*\.?\d+(?:px|pt|em|rem|%)(?:\s*\/\s*[\d.]+(?:px|pt|em|rem|%)?)?\s+).+$/i, '$1' + family);
  }
  function installGameFont() {
    const family = GAME_FONTS[activeFont].family;
    if (!family) return;
    const cache = new Map();
    const prototypes = new Set([
      PAGE.CanvasRenderingContext2D?.prototype,
      PAGE.OffscreenCanvasRenderingContext2D?.prototype,
    ]);
    for (const proto of prototypes) {
      if (!proto) continue;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'font');
      if (!descriptor?.set || !descriptor.configurable) continue;
      Object.defineProperty(proto, 'font', {
        ...descriptor,
        set(value) {
          if (typeof value !== 'string') { descriptor.set.call(this, value); return; }
          let mapped = cache.get(value);
          if (mapped === undefined) {
            mapped = replaceCanvasFont(value, family);
            if (cache.size >= 128) cache.clear();
            cache.set(value, mapped);
          }
          descriptor.set.call(this, mapped);
        },
      });
    }
  }
  installGameFont();
  const mobileLayout=document.createElement("style");mobileLayout.id="wzg-mobile-layout";mobileLayout.textContent="@media(max-width:900px){\nhtml.wzg-ready body .stage{display:block!important;width:100%!important;height:100dvh!important;min-height:0!important;padding:8px!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}\nhtml.wzg-ready body .shell,html.wzg-ready.wzg-focus body .shell{display:flex!important;flex-direction:column!important;height:auto!important;min-height:calc(100dvh - 16px)!important;width:100%!important;max-width:100%!important;padding:8px!important;gap:12px!important;overflow:visible!important;box-sizing:border-box!important}\nhtml.wzg-ready body .shell>.panel{width:100%!important;max-width:100%!important;height:auto!important;min-height:0!important;flex:0 0 auto!important;overflow:visible!important;border-radius:12px!important;box-sizing:border-box!important}\nhtml.wzg-ready body .shell>.panel:nth-child(2){order:0!important}\nhtml.wzg-ready body .shell>.panel:first-child{order:1!important}\nhtml.wzg-ready body .shell>.panel:last-child{order:2!important}\nhtml.wzg-ready body #homeMain,html.wzg-ready body #centerPanel{height:auto!important;min-height:0!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important}\nhtml.wzg-ready body #centerPanel{display:flex!important;flex-direction:column!important;padding:10px!important;gap:12px!important}\nhtml.wzg-ready body #wzg-sidebar{min-height:0!important}html.wzg-ready body .logo-item{min-height:80px!important}html.wzg-ready body .logo-item img{max-height:75px!important;width:auto!important}html.wzg-ready body .wzg-nav{grid-template-columns:repeat(2,minmax(0,1fr))!important}\nhtml.wzg-ready body .player-card{max-width:none!important}html.wzg-ready body .pi-rows{grid-template-columns:repeat(2,minmax(0,1fr))!important}\nhtml.wzg-ready body .settings-wrap{padding:6px!important}html.wzg-ready body .settings-modal{width:100%!important;max-width:100%!important;height:calc(100dvh - 12px)!important;max-height:calc(100dvh - 12px)!important;grid-template-columns:150px minmax(0,1fr)!important;grid-template-rows:64px minmax(0,1fr)!important}\nhtml.wzg-ready body .settings-body{min-width:0!important;padding:12px!important;overflow:auto!important;overflow-x:hidden!important}html.wzg-ready body #wzg-extra-options .wzg-organized-grid{grid-template-columns:1fr!important}html.wzg-ready body #tab-custom .wc-content{grid-template-columns:minmax(0,1fr) 120px!important}\nhtml.wzg-ready body button,html.wzg-ready body select{touch-action:manipulation}html.wzg-ready body .wzg-nav-btn,html.wzg-ready body .wc-mode button,html.wzg-ready body .wc-footer button{min-height:44px!important}html.wzg-ready body input[type=range]{min-height:36px;touch-action:pan-y}\nhtml.wzg-ready body .wzg-store-modal{height:calc(100dvh - 12px)!important;max-height:calc(100dvh - 12px)!important;width:calc(100vw - 12px)!important}\n}\n@media(max-width:620px){\nhtml.wzg-ready body .settings-modal{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:58px 112px minmax(0,1fr)!important}html.wzg-ready body .settings-head{grid-row:1!important;min-height:58px!important;padding:8px 12px!important}\nhtml.wzg-ready body #settings-tabs{grid-row:2!important;grid-column:1!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-auto-rows:44px!important;gap:4px!important;padding:6px!important;overflow-y:auto!important;overflow-x:hidden!important;align-content:start!important;border-bottom:1px solid #ffffff16!important}\nhtml.wzg-ready body #settings-tabs .tab{display:flex!important;width:100%!important;min-width:0!important;min-height:44px!important;height:44px!important;justify-content:flex-start!important;padding:0 9px!important;font-size:11px!important}\nhtml.wzg-ready body #settings-tabs .tab span{display:block!important;white-space:normal!important}html.wzg-ready body #settings-tabs .wzg-sidebar-divider,html.wzg-ready body #settings-tabs::before,html.wzg-ready body #settings-tabs .tab::after{display:none!important}\nhtml.wzg-ready body .settings-body{grid-column:1!important;grid-row:3!important}html.wzg-ready body #tab-custom .wc-content{display:flex!important;flex-direction:column!important}html.wzg-ready body #tab-custom .wc-groups{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));max-height:170px;width:100%}html.wzg-ready body #tab-custom[data-mode=wear] .wc-groups{display:none!important}html.wzg-ready body #tab-custom .wc-stage{min-height:210px!important}html.wzg-ready body #tab-custom .wc-panel{min-height:0!important}\nhtml.wzg-ready body input[type=text],html.wzg-ready body input[type=number],html.wzg-ready body select{font-size:16px!important}html.wzg-ready body .wzg-search{display:flex!important;flex-wrap:wrap!important}html.wzg-ready body .wzg-search input{min-width:0!important;max-width:100%!important}\nhtml.wzg-ready body .wzs-stage{min-height:320px!important}html.wzg-ready body .wzs-canvas{min-height:200px!important}html.wzg-ready body .wzg-store-modal .wzs-tabs{max-height:110px!important;overflow-y:auto!important}\n}\r\n"+"@media(min-width:640px) and (max-width:1100px){html.wzg-ready body .stage{height:100dvh!important;padding:6px!important;overflow:hidden!important}html.wzg-ready body .shell{display:grid!important;grid-template-columns:145px minmax(0,1fr) 165px!important;grid-template-rows:minmax(0,1fr)!important;height:calc(100dvh - 12px)!important;min-height:0!important;gap:0!important;padding:7px!important;overflow:hidden!important}html.wzg-ready body .shell>.panel{order:initial!important;height:100%!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;padding:9px!important}html.wzg-ready body .shell>.panel:first-child{grid-column:1!important;grid-row:1!important}html.wzg-ready body .shell>.panel:nth-child(2){grid-column:2!important;grid-row:1!important}html.wzg-ready body .shell>.panel:last-child{grid-column:3!important;grid-row:1!important}html.wzg-ready body #homeMain{height:100%!important;min-height:0!important}html.wzg-ready body #centerPanel{height:100%!important;display:grid!important;grid-template-rows:auto minmax(0,1fr)!important;gap:12px!important;padding:8px!important}html.wzg-ready body .home-center-server-list{min-height:0!important;overflow-y:auto!important}html.wzg-ready body .logo-item{min-height:100px!important;padding:8px 0!important}html.wzg-ready body .logo-item img{width:125px!important;max-width:100%!important;max-height:90px!important}html.wzg-ready body #wzg-sidebar{min-height:0!important;margin-top:10px!important}html.wzg-ready body .wzg-nav{grid-template-columns:1fr!important;gap:3px!important}html.wzg-ready body .wzg-nav-btn{font-size:10px!important;padding:0 7px!important;gap:7px!important;min-height:40px!important}html.wzg-ready body .wzg-kicker{font-size:8px!important}html.wzg-ready body .home-center-skins{min-height:115px!important}html.wzg-ready body .player-card{padding:7px!important;font-size:10px!important}html.wzg-ready body .pi-rows{grid-template-columns:repeat(2,minmax(0,1fr))!important}html.wzg-ready body .pi-row .value{font-size:9px!important}html.wzg-ready body .pi-row .label{font-size:7px!important}html.wzg-ready body .center-top{gap:10px!important}html.wzg-ready body .home-center-server-map{font-size:9px!important}}\n@media(max-width:639px){html.wzg-ready body .shell>.panel:first-child{order:0!important}html.wzg-ready body .shell>.panel:nth-child(2){order:1!important}html.wzg-ready body .shell>.panel:last-child{order:2!important}html.wzg-ready body .logo-item{display:none!important}html.wzg-ready body .wzg-nav{grid-template-columns:repeat(3,minmax(0,1fr))!important}html.wzg-ready body .wzg-nav-btn{font-size:10px!important;padding:6px!important;gap:5px!important}html.wzg-ready body #wzg-sidebar{margin-top:0!important}html.wzg-ready body .wzg-kicker{display:none!important}}"+"@media(min-width:640px) and (max-width:1100px){html.wzg-ready body .shell{grid-template-columns:140px minmax(0,1fr) 190px!important}html.wzg-ready body .player-card{padding:10px!important;width:100%!important;min-width:0!important}html.wzg-ready body .player-card .pi-top{padding:5px 3px 12px!important}html.wzg-ready body .player-card .pi-name{flex-wrap:wrap!important;gap:8px!important;align-items:flex-start!important}html.wzg-ready body .player-card #p-name{flex:1 1 100%!important;min-width:0!important;max-width:100%!important;white-space:normal!important;overflow-wrap:anywhere!important;line-height:1.45!important;font-size:11px!important}html.wzg-ready body .player-card .badge{flex:0 0 auto!important}html.wzg-ready body .player-card .pi-rows{grid-template-columns:minmax(0,1fr)!important;padding:4px 0 0!important}html.wzg-ready body .player-card .pi-row{padding:9px 3px!important;min-height:45px!important;border-right:0!important;gap:5px!important}html.wzg-ready body .player-card .pi-row .value{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere!important;font-size:11px!important;line-height:1.45!important;max-width:100%!important}html.wzg-ready body .player-card .pi-row .label{font-size:8px!important;line-height:1.3!important}html.wzg-ready body .player-card .pi-row .value:has(button){display:flex!important;flex-wrap:wrap!important;gap:6px!important;align-items:center!important}}"+"@media(min-width:621px) and (max-width:900px){html.wzg-ready body .settings-modal{grid-template-rows:76px minmax(0,1fr)!important}html.wzg-ready body .settings-modal>.settings-head{grid-column:1/-1!important;grid-row:1!important;height:76px!important;min-height:0!important;max-height:76px!important;margin:0!important;padding:12px 18px!important;box-sizing:border-box!important}html.wzg-ready body .settings-modal>#settings-tabs{grid-column:1!important;grid-row:2!important}html.wzg-ready body .settings-modal>.settings-body{grid-column:2!important;grid-row:2!important;padding:18px 14px 14px!important;min-height:0!important;box-sizing:border-box!important}}@media(max-width:620px){html.wzg-ready body .settings-modal>.settings-head{height:58px!important;min-height:0!important;max-height:58px!important;margin:0!important;box-sizing:border-box!important}html.wzg-ready body .settings-modal>.settings-body{padding-top:16px!important}}html.wzg-ready body #tab-custom .wc-mode{position:relative!important;top:auto!important;min-height:48px;box-sizing:border-box!important;flex-shrink:0;gap:8px}html.wzg-ready body #tab-custom .wc-mode label{min-width:0;white-space:normal;line-height:1.4}html.wzg-ready body #tab-custom .wc-mode label input{flex-shrink:0}";(document.head||document.documentElement).appendChild(mobileLayout);
  const arialUIStyle=document.createElement('style');arialUIStyle.id='wzg-arial-ui';arialUIStyle.textContent='html.wzg-ready body,html.wzg-ready div,html.wzg-ready p,html.wzg-ready label,html.wzg-ready button,html.wzg-ready input,html.wzg-ready select,html.wzg-ready option,html.wzg-ready output,html.wzg-ready strong,html.wzg-ready small,html.wzg-ready h1,html.wzg-ready h2,html.wzg-ready h3,html.wzg-ready h4,html.wzg-ready h5,html.wzg-ready span:not([class*="icon"]):not([class*="fa-"]){font-family:Arial,sans-serif!important;}';(document.head||document.documentElement).appendChild(arialUIStyle);


  function mountFontSettings(modal) {
    const section = modal.querySelector('#tab-extension');
    if (!section || document.getElementById('wzg-game-font')) return;
    const row = document.createElement('div');
    row.className = 'opt wzg-font-option';
    row.innerHTML = `<div class="opL"><div class="opT">Game font</div>
      <div class="hint">Font used for canvas text, including names and scoreboards. Keeps the game's text sizes.</div></div>
      <div class="opR"><select id="wzg-game-font" aria-label="Game font">${Object.entries(GAME_FONTS).map(([key, font]) => `<option value="${key}">${font.label}</option>`).join('')}</select></div>
      <div id="wzg-font-preview">Player • 123456 • Ranking</div>
      <div class="hint" id="wzg-font-status" role="status"></div>
      <button id="wzg-font-reload" type="button" hidden>Reload to apply</button>`;
    section.appendChild(row);
    const select = row.querySelector('select');
    const preview = row.querySelector('#wzg-font-preview');
    const status = row.querySelector('#wzg-font-status');
    const reload = row.querySelector('#wzg-font-reload');
    const sync = () => {
      preview.style.fontFamily = GAME_FONTS[fontPrefs.family].family || 'serif';
      reload.hidden = fontPrefs.family === activeFont;
      status.textContent = reload.hidden ? 'Current selection: ' + GAME_FONTS[activeFont].label : 'Saved. Reload outside a match to refresh the game text.';
    };
    select.value = fontPrefs.family;
    select.addEventListener('change', () => {
      if (!GAME_FONTS[select.value]) return;
      fontPrefs.family = select.value;
      store.set('wzg-game-font', JSON.stringify(fontPrefs));
      sync();
    });
    reload.addEventListener('click', () => PAGE.location.reload());
    sync();
  }

  function createSpeedController(host) {
    const original = {
      perf: host.performance.now.bind(host.performance), date: host.Date.now.bind(host.Date),
      timeout: host.setTimeout.bind(host), interval: host.setInterval.bind(host),
      raf: host.requestAnimationFrame.bind(host),
    };
    let anchor = original.perf();
    let virtualPerf = anchor;
    let virtualDate = original.date();
    let rate = 1;
    let installed = false;
    const perfAt = now => virtualPerf + (now - anchor) * rate;
    const dateAt = now => virtualDate + (now - anchor) * rate;
    function install() {
      if (installed) return;
      host.performance.now = () => perfAt(original.perf());
      host.Date.now = () => Math.floor(dateAt(original.perf()));
      host.setTimeout = function(callback, delay, ...args) {
        return original.timeout(callback, Number(delay || 0) / rate, ...args);
      };
      host.setInterval = function(callback, delay, ...args) {
        return original.interval(callback, Number(delay || 0) / rate, ...args);
      };
      host.requestAnimationFrame = callback => original.raf(timestamp => callback(perfAt(timestamp)));
      installed = true;
    }
    return {
      setRate(value) {
        if (!Number.isFinite(value) || value < .7 || value > 1.5) return false;
        if (value === rate) return true;
        const now = original.perf();
        virtualPerf = perfAt(now);
        virtualDate = dateAt(now);
        anchor = now;
        if (!installed && value !== 1) install();
        rate = value;
        return true;
      },
      getRate: () => rate,
    };
  }

  const SEPARATE_SPEED_SCRIPT_FLAG = '__speedHackInjected', LEGACY_SPEED_STORAGE_KEY = 'speedhack_settings';
  const oldSpeedSettings = loadJSON(LEGACY_SPEED_STORAGE_KEY, {});
  const speedPrefs = loadJSON('wzg-speed-settings', {
    speed: Number.isFinite(Number(oldSpeedSettings.speed)) ? Math.min(1.5, Math.max(.7, Number(oldSpeedSettings.speed))) : 1,
    enabled: false,
  });
  speedPrefs.speed = Number.isFinite(Number(speedPrefs.speed)) ? Math.max(.7,Math.min(1.5,Number(speedPrefs.speed))) : 1;
  speedPrefs.speed = Number(speedPrefs.speed);
  speedPrefs.enabled = speedPrefs.enabled === true;
  const speedController = createSpeedController(PAGE);
  if (!PAGE[SEPARATE_SPEED_SCRIPT_FLAG]) speedController.setRate(speedPrefs.enabled ? speedPrefs.speed : 1);

  const mobileSpacingFix=document.createElement("style");mobileSpacingFix.id="wzg-mobile-spacing-fix";mobileSpacingFix.textContent="\n@media (max-width:1200px), (pointer:coarse) {\n html.wzg-ready body #centerPanel {display:flex!important;flex-direction:column!important;gap:18px!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;}\n html.wzg-ready body .center-top {flex:0 0 auto!important;min-height:min-content!important;height:auto!important;padding-bottom:4px!important;}\n html.wzg-ready body .center-controls {position:relative!important;top:auto!important;bottom:auto!important;transform:none!important;margin:0!important;min-height:48px!important;flex-shrink:0!important;}\n html.wzg-ready body .home-center-server-list {flex:1 1 0!important;height:auto!important;min-height:0!important;max-height:100%!important;margin-top:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;box-sizing:border-box!important;padding-bottom:4px!important;} html.wzg-ready body #centerPanel>.center-bottom {flex:1 1 240px!important;min-height:160px!important;overflow:hidden!important;box-sizing:border-box!important;} html.wzg-ready body .home-center-server-map {flex-shrink:0!important;} html.wzg-ready body .server-item {box-sizing:border-box!important;}\n html.wzg-ready body .shell>.panel:first-child {overflow-y:auto!important;overflow-x:hidden!important;min-height:0!important;}\n html.wzg-ready body #wzg-sidebar {flex:0 0 auto!important;min-height:min-content!important;padding-bottom:14px!important;}\n html.wzg-ready body .wzg-tools {flex-shrink:0!important;margin-bottom:8px!important;}\n html.wzg-ready body .wzg-store-modal {width:calc(100vw - 16px)!important;max-width:calc(100vw - 16px)!important;min-width:0!important;height:calc(100dvh - 16px)!important;max-height:calc(100dvh - 16px)!important;box-sizing:border-box!important;}\n html.wzg-ready body .wzg-store-modal .wzs-tabs {min-width:0!important;overflow-x:hidden!important;scrollbar-width:thin;scrollbar-color:#ffffff30 transparent;}\n html.wzg-ready body .wzg-store-modal .wzs-tabs::-webkit-scrollbar {width:4px;background:transparent;}\n html.wzg-ready body .wzg-store-modal .wzs-tabs::-webkit-scrollbar-thumb {background:#ffffff30;border-radius:8px;}\n html.wzg-ready body .wzg-store-modal .wzs-pill {box-sizing:border-box!important;min-width:0!important;max-width:100%!important;}\n}\n@media (max-height:700px) and (min-width:640px) {\n html.wzg-ready body .logo-item {min-height:95px!important;max-height:125px!important;flex-shrink:0!important;}\n html.wzg-ready body .logo-item img {max-height:100px!important;width:auto!important;max-width:90%!important;}\n html.wzg-ready body .wzg-nav-spacer {min-height:8px!important;}\n html.wzg-ready body #wzg-sidebar {margin-top:8px!important;}\n}\n@media (max-width:650px) {\n html.wzg-ready body .wzg-store-modal {grid-template-columns:minmax(0,1fr)!important;grid-template-rows:64px auto minmax(0,1fr)!important;}\n html.wzg-ready body .wzg-store-modal .wzs-head {grid-column:1!important;grid-row:1!important;min-width:0!important;min-height:64px!important;}\n html.wzg-ready body .wzg-store-modal .wzs-tabs {grid-column:1!important;grid-row:2!important;display:flex!important;flex-direction:row!important;gap:8px!important;padding:8px!important;overflow:hidden!important;border-right:0!important;border-bottom:1px solid #ffffff16!important;}\n html.wzg-ready body .wzg-store-modal .wzs-tabs::before {display:none!important;}\n html.wzg-ready body .wzg-store-modal .wzs-pill {flex:1 1 0!important;width:auto!important;min-height:44px!important;}\n html.wzg-ready body .wzg-store-modal>.wzs-body {grid-column:1!important;grid-row:3!important;min-width:0!important;padding:10px!important;overflow-x:hidden!important;}\n}\n";(document.head||document.documentElement).appendChild(mobileSpacingFix);
  function cleanSettingsFile(file){
    if((file?.format!=='betterzilla'&&file?.format!=='wormzilla-null-glass')||file.version!==1||!file.settings||typeof file.settings!=='object')throw Error('Invalid settings file.');
    const out={};
    for(const [storage,defaults] of [['wzg-game-extras',extraPrefs],['wzg-speed-settings',speedPrefs],['wzg-game-font',fontPrefs]]){
      const source=file.settings[storage];if(!source||typeof source!=='object'||Array.isArray(source))throw Error('Missing settings group.');
      const values={};
      for(const key of Object.keys(defaults)){
        if(!Object.hasOwn(source,key))continue;
        const value=source[key];
        if(typeof defaults[key]==='boolean'){if(typeof value!=='boolean')throw Error('Invalid toggle.');values[key]=value;}
        else if(typeof defaults[key]==='number'){
          const bounds=key==='saturation'?[0,200]:key==='rankSize'?[50,130]:key==='speed'?[.7,1.5]:[0,100];
          if(typeof value!=='number'||!Number.isFinite(value)||value<bounds[0]||value>bounds[1])throw Error('Invalid numeric setting.');values[key]=value;
        }else if(key==='family'){if(!Object.hasOwn(GAME_FONTS,value))throw Error('Unknown font.');values[key]=value;}
      }
      out[storage]=values;
    }
    return out;
  }
  function mountConfigFiles(modal){
    const tabs=modal.querySelector('#settings-tabs'),body=modal.querySelector('.settings-body');
    if(!tabs||!body||body.querySelector('#tab-configfiles'))return;
    const tab=document.createElement('button');tab.className='tab';tab.dataset.tab='configfiles';tab.innerHTML=icons.settings+'<span>Config files</span>';
    const section=document.createElement('section');section.id='tab-configfiles';section.className='sectionS';
    section.innerHTML=`<div class="wzg-settings-intro"><div><strong>Config files</strong><span>Keep your setup. Take it with you.</span></div><b>JSON</b></div>
      <div class="wzg-file-grid"><article class="wzg-file-card"><span class="wzg-file-kicker">BACKUP</span><h3>Export your setup</h3><p>Save alerts, rankings, effects, speed and font preferences.</p><button type="button" data-export>Export settings</button></article>
      <article class="wzg-file-card"><span class="wzg-file-kicker">RESTORE</span><h3>Import a setup</h3><p>Select a Betterzilla JSON file. Settings are validated before saving.</p><button type="button" data-import>Choose file</button><input type="file" accept=".json,application/json" hidden data-file></article></div>
      <p class="wzg-file-note">Includes the saved speed toggle. Login, account data and uploaded images are not included.</p><p role="status" data-status></p><button type="button" data-reload hidden>Reload to apply</button>`;
    tabs.appendChild(tab);body.appendChild(section);
    tab.addEventListener('click',()=>{modal.querySelectorAll('#settings-tabs .tab,.settings-body .sectionS').forEach(e=>e.classList.remove('active'));tab.classList.add('active');section.classList.add('active');});
    const status=section.querySelector('[data-status]'),input=section.querySelector('[data-file]');
    section.querySelector('[data-export]').addEventListener('click',()=>{
      const file={format:'betterzilla',version:1,settings:{'wzg-game-extras':extraPrefs,'wzg-speed-settings':speedPrefs,'wzg-game-font':loadJSON('wzg-game-font',fontPrefs)}};
      const safe=cleanSettingsFile(file);const blob=new Blob([JSON.stringify({...file,settings:safe},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='betterzilla-settings.json';a.click();nativeTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Settings exported.';
    });
    section.querySelector('[data-import]').addEventListener('click',()=>input.click());
    input.addEventListener('change',async()=>{
      try{
        const file=input.files[0];if(!file)return;if(file.size>100000)throw Error('File is too large.');
        const values=cleanSettingsFile(JSON.parse(await file.text()));
        const prior=Object.fromEntries(Object.keys(values).map(k=>[k,store.get(k)]));
        try{for(const [k,v] of Object.entries(values))localStorage.setItem(k,JSON.stringify({...loadJSON(k,{}),...v}));}
        catch(e){for(const [k,v] of Object.entries(prior))v===null?localStorage.removeItem(k):localStorage.setItem(k,v);throw e;}
        status.textContent='Imported. Reload to apply your setup.';section.querySelector('[data-reload]').hidden=false;
      }catch(e){status.textContent='Import failed: '+e.message;}finally{input.value='';}
    });
    section.querySelector('[data-reload]').addEventListener('click',()=>PAGE.location.reload());
  }

  function mountSpeedSettings(modal) {
    const bar=modal.querySelector('#settings-tabs'),body=modal.querySelector('.settings-body');
    if(!bar||!body)return;
    let section=body.querySelector('#tab-speed');
    if(!section){
      section=document.createElement('section');section.id='tab-speed';section.className='sectionS';
      section.innerHTML='<div class="wzg-settings-intro"><div><strong>Speed Control</strong><span>Your pace, saved across sessions.</span></div><b>AUTO-SAVE</b></div>';
      body.appendChild(section);
      const button=document.createElement('button');button.className='tab';button.dataset.tab='speed';button.innerHTML=icons.speed+'<span>Speed Control</span>';bar.appendChild(button);
      button.addEventListener('click',()=>{modal.querySelectorAll('#settings-tabs .tab,.settings-body .sectionS').forEach(e=>e.classList.remove('active'));button.classList.add('active');section.classList.add('active');});
    }
    const speedTab = bar.querySelector('.tab[data-tab="speed"]');
    if (speedTab) speedTab.innerHTML = icons.speed + '<span>Speed Control</span>';
    if (!body.querySelector('#tab-language')) mountLanguageSettings(modal);
    if (!document.getElementById('wzg-speed-language-style')) {
      const style = document.createElement('style'); style.id = 'wzg-speed-language-style';
      style.textContent = `
        #tab-speed #wzg-speed-controls { display:grid!important;gap:8px!important;width:100%!important; }
        #tab-speed > .wzg-settings-intro > div > span { display:none!important; }
        #tab-speed #wzg-speed-controls .wzg-speed-enable-row,
        #tab-speed #wzg-speed-controls .wzg-speed-range-row { display:flex!important;align-items:center!important;justify-content:space-between!important;gap:14px!important;min-width:0!important;min-height:54px!important;margin:0!important;padding:10px 14px!important;border:1px solid #ffffff10!important;border-radius:9px!important;background:#0e0e0e!important;box-shadow:none!important; }
        #tab-speed #wzg-speed-controls .wzg-speed-enable-row .opL,
        #tab-speed #wzg-speed-controls .wzg-speed-range-row .opL { flex:1 1 200px!important;min-width:0!important; }
        #tab-speed #wzg-speed-controls .wzg-speed-enable-row .opT,
        #tab-speed #wzg-speed-controls .wzg-speed-range-row .opT { color:#cfcfcf!important;font-size:12px!important;font-weight:500!important; }
        #tab-speed #wzg-speed-controls .wzg-speed-enable-row .hint,
        #tab-speed #wzg-speed-controls .wzg-speed-range-row .hint { margin-top:3px!important;color:#777780!important;font-size:10px!important;line-height:1.4!important; }
        #tab-speed #wzg-speed-controls .wzg-speed-enable-row .hint,
        #tab-speed #wzg-speed-controls .wzg-speed-range-row .hint,
        #tab-speed #wzg-speed-controls .wzg-speed-toggle-word,
        #tab-speed #wzg-speed-controls #wzg-speed-status { display:none!important; }
        #tab-speed #wzg-speed-controls .wzg-speed-toggle { display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:9px!important;flex:0 0 auto!important; }
        #tab-speed #wzg-speed-controls .wzg-speed-toggle-word { color:#aaaab2!important;font-size:10px!important;font-weight:600!important; }
        #tab-speed #wzg-speed-controls .wzg-speed-range-control { order:2!important;display:grid!important;grid-template-columns:minmax(120px,1fr) 54px!important;align-items:center!important;gap:10px!important;flex:0 1 260px!important;min-width:0!important; }
        #tab-speed #wzg-speed-controls #wzg-speed-range { width:100%!important;margin:0!important;accent-color:#d7d7e2!important; }
        #tab-speed #wzg-speed-controls .wzg-speed-range-control > output#wzg-speed-readout { display:flex!important;float:none!important;align-items:center!important;justify-content:center!important;width:54px!important;min-width:54px!important;height:28px!important;margin:0!important;padding:0 5px!important;border:1px solid #ffffff12!important;border-radius:7px!important;background:#1b1b1b!important;color:#cfcfcf!important;text-align:center!important;font-size:10px!important;line-height:1!important;font-weight:600!important;font-variant-numeric:tabular-nums!important; }
        #tab-speed #wzg-speed-controls .wzg-speed-limits { display:none!important; }
        #tab-speed #wzg-speed-controls #wzg-speed-status { margin:0 2px!important;color:#777780!important;font-size:10px!important;line-height:1.5!important; }
        #tab-speed .wzg-speed-explainer { margin:4px 0 8px;padding:2px 2px 16px;border:0;border-bottom:1px solid #2e2e2e;border-radius:0;background:transparent; }
        #tab-speed .wzg-speed-explainer b { display:block;margin-bottom:4px;color:#cfcfcf;font-size:12px;font-weight:500; }
        #tab-speed .wzg-speed-explainer p { margin:0;color:#6e6e6e;font-size:11.5px;line-height:1.6; }
        #tab-language.active { display:block!important;width:100%!important; }
        #tab-language .wzg-language-card { max-width:700px;padding:24px;border:1px solid #ffffff14;border-radius:16px;background:linear-gradient(135deg,#ffffff07,#ffffff02); }
        #tab-language .wzg-language-card label { display:block;margin-bottom:9px;color:#eee;font-size:12px;font-weight:650; }
        #tab-language .wzg-language-card select { width:100%;min-height:44px;padding:0 12px;border:1px solid #ffffff18;border-radius:10px;background:#151518;color:#eee;font-size:13px; }
        #tab-language .wzg-language-card p { margin:10px 0 0;color:#9696a1;font-size:11px;line-height:1.6; }
        html[dir="rtl"] #tab-speed .wzg-speed-enable-row, html[dir="rtl"] #tab-speed .wzg-speed-range-row { text-align:right; }
        @media(max-width:560px){#tab-speed #wzg-speed-controls .wzg-speed-range-row{align-items:stretch!important;flex-direction:column!important}#tab-speed #wzg-speed-controls .wzg-speed-range-control{flex:1 1 auto!important;width:100%!important}}
      `;
      document.head.appendChild(style);
    }
    if (!section || section.querySelector('#wzg-speed-controls')) return;
    const controls = document.createElement('div');
    controls.id = 'wzg-speed-controls';
    controls.innerHTML = `
      <div class="opt wzg-speed-enable-row">
        <div class="opL"><div class="opT">Speed control</div><div class="hint">Visual speed only · useful for reflex practice.</div></div>
        <div class="opR wzg-speed-toggle"><span class="wzg-speed-toggle-word" id="wzg-speed-toggle-word">Enable</span><label class="switch" title="Enable speed control"><input id="wzg-speed-enabled" type="checkbox" aria-label="Enable speed control"></label></div>
      </div>
      <div class="opt wzg-speed-range-row">
        <div class="opL"><div class="opT">Speed multiplier</div><div class="hint">0.7× to 1.5× · saved automatically</div></div>
        <div class="wzg-speed-range-control"><input id="wzg-speed-range" type="range" min="0.7" max="1.5" step="0.001" aria-label="Speed multiplier slider"><output id="wzg-speed-readout">1×</output></div>
      </div>
      <div id="wzg-speed-status" role="status" aria-live="polite"></div>`;
    section.appendChild(controls);
    const explainer = document.createElement('div');
    explainer.className = 'wzg-speed-explainer';
    explainer.innerHTML = '<b>How this works</b><p>Speed control changes how fast the game runs on your own device, from 0.7× to 1.5×. It only affects your screen and local timers: the server and other players keep running at normal speed. It is meant for practice, for example training your reflexes at a faster pace. Because it scales the page clock, you may notice stutter or lag at extreme values. Set it back to 1× or turn it off to restore normal speed.</p>';
    controls.insertAdjacentElement('beforebegin', explainer);
    const slider = controls.querySelector('#wzg-speed-range');
    const enabled = controls.querySelector('#wzg-speed-enabled');
    const readout = controls.querySelector('#wzg-speed-readout');
    const status = controls.querySelector('#wzg-speed-status');
    const format = value => `${Number(value.toFixed(3))}×`;
    function sync() {
      slider.value = speedPrefs.speed;
      enabled.checked = !!speedPrefs.enabled;
      controls.dataset.enabled = String(speedPrefs.enabled);
      controls.querySelector('#wzg-speed-toggle-word').textContent = speedPrefs.enabled ? 'Disable' : 'Enable';
      controls.querySelector('.wzg-speed-toggle .switch').title = speedPrefs.enabled ? 'Disable speed control' : 'Enable speed control';
      enabled.setAttribute('aria-label', speedPrefs.enabled ? 'Disable speed control' : 'Enable speed control');
      status.textContent = speedPrefs.enabled ? 'Enabled · restored automatically after refresh.' : 'Disabled · your selected speed is saved.';
      readout.textContent = format(speedPrefs.speed);
    }
    function apply(value, on = speedPrefs.enabled) {
      value = Number(value);
      if (!Number.isFinite(value) || value < .7 || value > 1.5) {
        status.textContent = 'Enter a speed between 0.7 and 1.5.';
        return;
      }
      if (PAGE[SEPARATE_SPEED_SCRIPT_FLAG]) {
        status.textContent = 'Disable the separate speed userscript and reload to use the integrated control.';
        return;
      }
      speedPrefs.speed = value;
      speedPrefs.enabled = on;
      speedController.setRate(on ? value : 1);
      store.set('wzg-speed-settings', JSON.stringify(speedPrefs));
      status.textContent = on && value !== 1 ? 'Applied. Choose your speed before entering a match.' : 'Normal timing: 1×.';
      sync();
    }
    enabled.addEventListener('change', () => apply(slider.value, enabled.checked));
    slider.addEventListener('input', () => {
      const value = Math.round(Number(slider.value) * 1000) / 1000;
      readout.textContent = format(value);
      status.textContent = 'Selected: ' + format(value) + ' · release to save.';
    });
    slider.addEventListener('change', () => apply(slider.value));
    sync();
    if (PAGE[SEPARATE_SPEED_SCRIPT_FLAG]) status.textContent = 'Disable the separate speed userscript and reload to use the integrated control.';
  }

  function mountLanguageSettings(modal) {
    const bar = modal.querySelector('#settings-tabs'), body = modal.querySelector('.settings-body');
    if (!bar || !body) return;
    let section = body.querySelector('#tab-language');
    if (!section) {
      section = document.createElement('section'); section.id = 'tab-language'; section.className = 'sectionS';
      section.innerHTML = '<div class="wzg-settings-intro"><div><strong>Language</strong><span>Choose the language for the Betterzilla interface.</span></div><b>4 LANGUAGES</b></div><div class="wzg-language-card"><label for="wzg-language-select">Select a language</label><select id="wzg-language-select"></select><p>Changes apply immediately and are saved on this device.</p></div>';
      body.appendChild(section);
      const button = document.createElement('button'); button.className = 'tab'; button.dataset.tab = 'language'; button.innerHTML = `${icons.general}<span>Language</span>`; bar.appendChild(button);
      button.addEventListener('click', () => { modal.querySelectorAll('#settings-tabs .tab,.settings-body .sectionS').forEach(el => el.classList.remove('active')); button.classList.add('active'); section.classList.add('active'); });
    }
    const select = section.querySelector('#wzg-language-select');
    if (!select) return;
    if (!select.dataset.wzgFilled) {
      select.dataset.wzgFilled = '1';
      for (const [code, meta] of Object.entries(LANGUAGES)) { const option = document.createElement('option'); option.value = code; option.textContent = meta.native; select.appendChild(option); }
      select.addEventListener('change', () => {
        currentLanguage = LANGUAGES[select.value] ? select.value : 'en';
        store.set(LANGUAGE_KEY, currentLanguage);
        if (currentLanguage !== 'en') languageTouched = true;
        watchLanguage();
        applyLanguage(document.body);
        select.value = currentLanguage;
        select.closest('#tab-language').querySelector('p').textContent = 'Changes apply immediately and are saved on this device.';
        applyLanguage(document.body);
      });
    }
    select.value = currentLanguage;
  }


  function wzgEsc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function wzgNum(text) {
    const digits = String(text || '').replace(/[^\d]/g, '');
    return digits ? Number(digits) : null;
  }
  function wzgCleanName(text) {
    return String(text || '')
      .replace(/[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u2060-\u206F\u2800\u3164\uFEFF\uFFA0\uFFF9-\uFFFC]|\uDB40[\uDC00-\uDFFF]/g, '')
      .replace(/[\u0000-\u001F\u007F-\u009F\u00A0\u2000-\u200A\u2028-\u202F\u205F\u3000]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/(?:\s*(?:\.{2,}|\u2026))+\s*$/, '')
      .trim();
  }
  function readProfile() {
    const card = document.querySelector('.player-card');
    if (!card) return null;
    const name = wzgCleanName(card.querySelector('#p-name')?.textContent || '');
    const rows = [];
    let level = null, xp = null, xpMax = null;
    card.querySelectorAll('.pi-row').forEach(row => {
      const label = (row.querySelector('.label')?.textContent || '').trim();
      const value = (row.querySelector('.value')?.textContent || '').trim();
      if (!label) return;
      const pair = /(\d[\d.,\s]*)\s*\/\s*(\d[\d.,\s]*)/.exec(value);
      if (/^(level|lvl|n[ií]vel)\b/i.test(label) && level === null) { level = wzgNum(value); return; }
      if (/\b(xp|exp|experience|experi[eê]ncia)\b/i.test(label) && pair) { xp = wzgNum(pair[1]); xpMax = wzgNum(pair[2]); return; }
      if (row.classList.contains('wzg-hide')) return;
      rows.push({ label, value });
    });
    if (level === null) {
      const el = card.querySelector('[class*="level" i], [id*="level" i], [class*="lvl" i], [id*="lvl" i]');
      if (el) level = wzgNum(el.textContent);
    }
    let avatar = '';
    const img = card.querySelector('.avatar img') || card.querySelector('img');
    if (img) avatar = img.currentSrc || img.src || '';
    if (!avatar) {
      const av = card.querySelector('.avatar');
      const bg = av ? getComputedStyle(av).backgroundImage : '';
      const m = bg && /url\(["']?(.*?)["']?\)/.exec(bg);
      if (m) avatar = m[1];
    }
    return { name, rows, level, xp, xpMax, avatar };
  }
  const CUSTOM_AVATAR = 'https://i.pinimg.com/736x/d5/99/fe/d599fe0296ca45cb6b138d5f410fda11.jpg';
  let customAvatarSrc = '';
  const AVATAR_KEY = 'wzg-custom-avatar';
  let userAvatar = '';
  try { userAvatar = store.get(AVATAR_KEY) || ''; } catch {}
  function wzgResizeImage(file, size) {
    return new Promise((resolve, reject) => {
      const src = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const side = Math.min(img.naturalWidth, img.naturalHeight);
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = size;
          canvas.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        } catch (err) { reject(err); } finally { URL.revokeObjectURL(src); }
      };
      img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('image')); };
      img.src = src;
    });
  }
  assetURL(CUSTOM_AVATAR).then(u => { customAvatarSrc = u; }, () => { customAvatarSrc = CUSTOM_AVATAR; })
    .then(() => nativeTimeout(() => { try { refreshProfile(); } catch {} }, 0));
  function profileTopHTML(d) {
    const pct = d.xp != null && d.xpMax ? Math.max(0, Math.min(100, d.xp / d.xpMax * 100)) : 0;
    const barText = d.xp != null && d.xpMax ? `${d.xp} / ${d.xpMax}` : '';
    const avatarSrc = userAvatar || customAvatarSrc || d.avatar;
    const avatar = avatarSrc
      ? `<img src="${wzgEsc(avatarSrc)}" alt="" decoding="async">`
      : `<span>${wzgEsc((d.name || '?').slice(0, 1).toUpperCase())}</span>`;
    const star = d.level != null
      ? `<span class="wzg-pf-star"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 4l13 26 29 4-21 20 5 29-26-14-26 14 5-29L8 34l29-4z" fill="#f7931e" stroke="#f7931e" stroke-width="8" stroke-linejoin="round"/></svg><b>${wzgEsc(d.level)}</b></span>`
      : '';
    return `<span class="wzg-pf-avatar">${avatar}</span>
      <span class="wzg-pf-main"><strong class="wzg-pf-name">${wzgEsc(d.name || 'Player')}</strong>
      ${barText ? `<span class="wzg-pf-bar"><i style="width:${pct}%"></i><b>${wzgEsc(barText)}</b></span>` : ''}</span>${star}`;
  }
  function refreshProfile() {
    const data = readProfile();
    if (!data) return;
    const widget = document.getElementById('wzg-profile-widget');
    if (widget) {
      const html = profileTopHTML(data);
      if (widget.dataset.sig !== html) { widget.dataset.sig = html; widget.innerHTML = html; }
    }
    const modal = document.getElementById('wzg-profile-modal');
    if (modal && modal.classList.contains('is-open')) {
      modal.querySelector('.wzg-pm-top').innerHTML = profileTopHTML(data);
      modal.classList.toggle('has-custom-avatar', !!userAvatar);
      const tokens = (document.querySelector('#nameTokenCount')?.textContent || '').trim();
      modal.querySelector('.wzg-pm-name').textContent = tokens ? `Change name (${tokens} tokens)` : 'Change name';
      modal.querySelector('.wzg-pm-rows').innerHTML = data.rows.map(r => `<div class="wzg-pm-row"><span>${wzgEsc(r.label)}</span><b>${wzgEsc(r.value)}</b></div>`).join('') || '<div class="wzg-pm-empty">No stats available yet.</div>';
    }
  }
  function closeProfile() { document.getElementById('wzg-profile-modal')?.classList.remove('is-open'); }
  function openProfile() {
    document.getElementById('wzg-profile-modal')?.classList.add('is-open');
    refreshProfile();
  }
  let profileObserved = null;
  function mountProfileWidget() {
    const card = document.querySelector('.player-card');
    if (!card) return;
    if (!document.getElementById('wzg-profile-style')) {
      const style = document.createElement('style');
      style.id = 'wzg-profile-style';
      style.textContent = `
        html.wzg-ready.wzg-swap .shell > .panel:last-child > .player-card { display: none !important; }
        #wzg-profile-widget { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 9px; width: 100%; padding: 8px 10px; margin: 0 0 8px; flex: 0 0 auto; cursor: pointer; border: 1px solid var(--wzg-line, #ffffff18); border-radius: 12px; background: rgba(255,255,255,.04); }
        #wzg-profile-widget:hover { background: rgba(255,255,255,.08); }
        #wzg-profile-widget:focus-visible { outline: 2px solid #ddd; outline-offset: 2px; }
        .wzg-pf-avatar { flex: 0 0 auto; display: grid; place-items: center; width: 40px; height: 40px; overflow: hidden; border-radius: 6px; background: rgba(255,255,255,.1); color: #fff; font-weight: 800; }
        .wzg-pf-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .wzg-pf-main { flex: 1 1 auto; min-width: 0; display: grid; gap: 5px; }
        .wzg-pf-name { overflow: hidden; text-overflow: clip; white-space: nowrap; color: #fff; font-size: 14px; font-weight: 600; }
        .wzg-pf-bar { position: relative; display: block; height: 14px; overflow: hidden; border-radius: 99px; background: rgba(255,255,255,.12); }
        .wzg-pf-bar i { position: absolute; inset: 0 auto 0 0; display: block; background: #f7931e; border-radius: 99px; }
        .wzg-pf-bar b { position: relative; display: block; text-align: center; color: #fff; font-size: 9px; font-weight: 600; line-height: 14px; text-shadow: 0 1px 2px #0008; }
        .wzg-pf-star { position: relative; flex: 0 0 auto; display: grid; place-items: center; width: 38px; height: 38px; }
        .wzg-pf-star svg { position: absolute; inset: 0; width: 100%; height: 100%; }
        .wzg-pf-star b { position: relative; color: #fff; font-size: 15px; font-weight: 800; text-shadow: 0 1px 3px #0007; }
        #wzg-profile-modal { position: fixed; inset: 0; z-index: 100000; display: none; place-items: center; padding: 22px; }
        #wzg-profile-modal.is-open { display: grid; }
        #wzg-profile-modal .wzg-pm-overlay { position: absolute; inset: 0; background: rgba(5,5,6,.72); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
        /* Mesmo tema blur das outras janelas do Betterzilla (escuro, dessaturado, preto e branco) */
        #wzg-profile-modal .wzg-pm-card { position: relative; box-sizing: border-box; width: min(430px, 100%); max-height: 92vh; overflow-y: auto; overflow-x: hidden; padding: 0; border: 1px solid rgba(255,255,255,.14); border-radius: 20px; background: radial-gradient(circle at 84% -12%, rgba(255,255,255,.07), transparent 34%), rgba(17,17,20,.78); backdrop-filter: blur(12px) saturate(50%); -webkit-backdrop-filter: blur(12px) saturate(50%); color: var(--wzg-text, #f2f2f3); box-shadow: inset 0 1px rgba(255,255,255,.04), 0 34px 100px rgba(0,0,0,.62); scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent; }
        #wzg-profile-modal.is-open .wzg-pm-card { animation: wzgPmIn .2s ease-out; }
        @keyframes wzgPmIn { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: none; } }
        #wzg-profile-modal .wzg-pm-bar { position: relative; display: flex; align-items: center; justify-content: space-between; min-height: 62px; padding: 12px 14px 12px 20px; border-bottom: 1px solid var(--wzg-line, rgba(255,255,255,.085)); background: rgba(255,255,255,.018); }
        #wzg-profile-modal .wzg-pm-title { color: var(--wzg-text, #f2f2f3); font-size: 15px; font-weight: 700; letter-spacing: .01em; text-transform: none; }
        #wzg-profile-modal .wzg-pm-close { position: static; transform: none; display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 1px solid var(--wzg-line, rgba(255,255,255,.085)); border-radius: 10px; background: var(--wzg-soft, rgba(255,255,255,.055)); color: var(--wzg-text, #f2f2f3); font-size: 14px; line-height: 1; cursor: pointer; transition: background .15s; }
        #wzg-profile-modal .wzg-pm-close:hover { background: var(--wzg-soft-hover, rgba(255,255,255,.095)); }
        #wzg-profile-modal .wzg-pm-top { display: flex; align-items: center; gap: 16px; margin: 16px 16px 0; padding: 16px; border: 1px solid var(--wzg-line, rgba(255,255,255,.085)); border-radius: 16px; background: var(--wzg-soft, rgba(255,255,255,.055)); }
        #wzg-profile-modal .wzg-pf-avatar { position: relative; cursor: pointer; width: 72px; height: 72px; border-radius: 16px; font-size: 26px; border: 1px solid var(--wzg-line-strong, rgba(255,255,255,.16)); box-shadow: 0 8px 22px rgba(0,0,0,.4); }
        #wzg-profile-modal .wzg-pf-avatar::after { content: 'Change'; position: absolute; inset: 0; display: grid; place-items: center; background: rgba(0,0,0,.55); color: #fff; font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; opacity: 0; transition: opacity .15s; }
        #wzg-profile-modal .wzg-pf-avatar:hover::after { opacity: 1; }
        #wzg-profile-modal .wzg-pf-main { gap: 8px; }
        #wzg-profile-modal .wzg-pf-name { font-size: 21px; font-weight: 700; white-space: normal; overflow-wrap: anywhere; text-overflow: clip; line-height: 1.15; }
        #wzg-profile-modal .wzg-pf-bar { height: 18px; background: rgba(255,255,255,.12); }
        #wzg-profile-modal .wzg-pf-bar b { font-size: 11px; line-height: 18px; }
        #wzg-profile-modal .wzg-pf-star { width: 60px; height: 60px; }
        #wzg-profile-modal .wzg-pf-star b { font-size: 22px; }
        #wzg-profile-modal .wzg-pm-body { padding: 12px 16px 16px; }
        #wzg-profile-modal .wzg-pm-rows { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .wzg-pm-row { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 11px 14px; border: 1px solid var(--wzg-line, rgba(255,255,255,.085)); border-radius: 12px; background: var(--wzg-soft, rgba(255,255,255,.055)); transition: background .15s, border-color .15s; }
        .wzg-pm-row:hover { background: var(--wzg-soft-hover, rgba(255,255,255,.095)); border-color: var(--wzg-line-strong, rgba(255,255,255,.16)); }
        .wzg-pm-row:last-child:nth-child(odd) { grid-column: 1 / -1; }
        .wzg-pm-row span { color: var(--wzg-dim, #99999f); font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
        .wzg-pm-row b { color: var(--wzg-text, #f2f2f3); font-size: 16px; font-weight: 700; text-align: left; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
        #wzg-profile-modal .wzg-pm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
        .wzg-pm-photo, .wzg-pm-name { min-width: 0; margin: 0; padding: 12px 8px; border-radius: 12px; font-size: 13px; font-weight: 700; cursor: pointer; transition: background .15s, transform .15s; }
        .wzg-pm-photo { border: 1px solid var(--wzg-line-strong, rgba(255,255,255,.16)); background: var(--wzg-soft, rgba(255,255,255,.055)); color: var(--wzg-text, #f2f2f3); }
        .wzg-pm-photo:hover { background: var(--wzg-soft-hover, rgba(255,255,255,.095)); }
        .wzg-pm-name { width: auto; border: 0; background: var(--wzg-white, #f5f5f5); color: var(--wzg-black, #101011); }
        .wzg-pm-name:hover { background: #fff; transform: translateY(-1px); }
        .wzg-pm-photo:active, .wzg-pm-name:active { transform: none; }
        .wzg-pm-reset { display: none; width: 100%; margin-top: 8px; padding: 6px; border: 0; background: none; color: var(--wzg-dim, #99999f); font-size: 11px; text-decoration: underline; cursor: pointer; }
        #wzg-profile-modal.has-custom-avatar .wzg-pm-reset { display: block; }
        .wzg-pm-reset:hover { color: var(--wzg-text, #f2f2f3); }
        .wzg-pm-empty { grid-column: 1 / -1; padding: 14px; text-align: center; color: var(--wzg-dim, #99999f); font-size: 13px; }
        .wzg-pf-star, .wzg-pf-star * { transform: none !important; rotate: none !important; animation: none !important; font-style: normal !important; }
        .wzg-pf-star { border: 0 !important; background: none !important; box-shadow: none !important; overflow: visible !important; }
        .wzg-pf-star::before, .wzg-pf-star::after { content: none !important; display: none !important; }
      `;
      document.head.appendChild(style);
    }
    let widget = document.getElementById('wzg-profile-widget');
    if (!widget) {
      widget = document.createElement('button');
      widget.type = 'button';
      widget.id = 'wzg-profile-widget';
      widget.title = 'Open profile';
      widget.setAttribute('aria-label', 'Open profile');
      widget.addEventListener('click', openProfile);
    }
    const left = document.querySelector('.shell > .panel:first-child');
    const host = DESKTOP_MQ.matches && left ? left : card;
    if (widget.parentElement !== host || host.firstChild !== widget) host.insertBefore(widget, host.firstChild);
    if (!document.getElementById('wzg-profile-modal')) {
      const modal = document.createElement('div');
      modal.id = 'wzg-profile-modal';
      modal.innerHTML = '<div class="wzg-pm-overlay"></div><div class="wzg-pm-card" role="dialog" aria-label="Profile"><div class="wzg-pm-bar"><span class="wzg-pm-title">Profile</span><button type="button" class="wzg-pm-close" aria-label="Close">&#10005;</button></div><div class="wzg-pm-top"></div><div class="wzg-pm-body"><div class="wzg-pm-rows"></div><div class="wzg-pm-actions"><button type="button" class="wzg-pm-photo">Change photo</button><button type="button" class="wzg-pm-name">Change name</button></div><button type="button" class="wzg-pm-reset">Reset photo</button><input type="file" accept="image/*" class="wzg-pm-file" hidden></div></div>';
      modal.querySelector('.wzg-pm-overlay').addEventListener('click', closeProfile);
      modal.querySelector('.wzg-pm-close').addEventListener('click', closeProfile);
      modal.querySelector('.wzg-pm-name').addEventListener('click', () => {
        closeProfile();
        document.querySelector('.player-card .change-name-btn')?.click();
      });
      const fileInput = modal.querySelector('.wzg-pm-file');
      const photoBtn = modal.querySelector('.wzg-pm-photo');
      const pickPhoto = () => fileInput.click();
      photoBtn.addEventListener('click', pickPhoto);
      modal.querySelector('.wzg-pm-top').addEventListener('click', event => { if (event.target.closest('.wzg-pf-avatar')) pickPhoto(); });
      modal.querySelector('.wzg-pm-reset').addEventListener('click', () => {
        userAvatar = '';
        try { store.remove(AVATAR_KEY); } catch {}
        refreshProfile();
      });
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        try {
          userAvatar = await wzgResizeImage(file, 256);
          try { store.set(AVATAR_KEY, userAvatar); } catch {}
          refreshProfile();
        } catch {
          photoBtn.textContent = 'Could not load image';
          nativeTimeout(() => { photoBtn.textContent = 'Change photo'; }, 2200);
        }
      });
      document.body.appendChild(modal);
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal.classList.contains('is-open')) { closeProfile(); event.stopPropagation(); }
      }, true);
    }
    refreshProfile();
    if (profileObserved !== card) {
      profileObserved = card;
      let queued = false;
      new MutationObserver(records => {
        const own = '#wzg-profile-widget, #wzg-profile-modal';
        if (!records.some(r => { const el = r.target.nodeType === 1 ? r.target : r.target.parentElement; return !el?.closest?.(own); })) return;
        if (queued) return;
        queued = true;
        nativeRAF(() => {
          queued = false;
          if (document.hidden || document.documentElement.classList.contains('wzg-ingame')) return;
          refreshProfile();
        });
      }).observe(card, { childList: true, subtree: true, characterData: true });
    }
  }

  let alignRetried = false;
  function mount() {
    installKillFeedFilter();
    injectStyle();
    injectSwapStyle();
    applyPreferences();
    mountSidebar();
    mountSwappedLayout();
    decorateRooms();
    mountBackgroundModal();
    mountGuideModal();
    fixRegions();
    mountVIPModal();
    neutralizeVIPFeatures();
    cleanSkinPreview();
    cleanActionButtons();
    cleanAccountCard();
    mountProfileWidget();
    mountStoreRedesign();
    mountHomeOptions();
    alignHomeColumns();
    if (!alignRetried) { alignRetried = true; nativeTimeout(alignHomeColumns, 400); nativeTimeout(alignHomeColumns, 1600); }
    mountIDTool();
    labelSections();
    mountSettingsRedesign();
  }

  function boot() {
    mount();
    watchLanguage();
    nativeTimeout(maybeShowUpdateNotice, 900);
    const roots = '.settings-modal, .wzs-modal, .player-card, #centerPanel, .home-skins-prev, .home-skins-next, .vip-card, .server-map';
    const feed = '#killFeed, #kill-feed, .kill-feed, .killfeed';
    let queued = false;
    const observer = new MutationObserver(records => {
      let relevant = false;
      const playing = document.documentElement.classList.contains('wzg-ingame');
      const activeRoots = playing ? '.settings-modal, .wzs-modal' : roots;
      for (const record of records) {
        if (record.target.closest?.('.home-center-server-list')) continue;
        if (record.target.closest?.(activeRoots)
          && Array.from(record.removedNodes).some(node => node.nodeType === 1)) relevant = true;
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (state.prefs.hideKillFeed) {
            if (node.matches(feed)) node.classList.add('wzg-kill-feed-hidden');
            node.querySelectorAll(feed).forEach(el => el.classList.add('wzg-kill-feed-hidden'));
          }
          if (node.matches(activeRoots) || node.querySelector(activeRoots)
            || record.target.closest?.(activeRoots)) relevant = true;
        }
      }
      if (relevant) scheduleMount();
    });
    function observe() { observer.observe(document.body, {childList:true, subtree:true}); }
    function scheduleMount() {
      if (queued) return;
      queued = true;
      nativeTimeout(() => {
        queued = false;
        observer.disconnect();
        try { mount(); watchRooms(); watchInGame(); } finally { observe(); }
      }, 180);
    }
    observe();
    DESKTOP_MQ.addEventListener("change", scheduleMount);
    cleanDOMKillFeed();
    const inGame = () => document.documentElement.classList.contains('wzg-ingame');
    document.addEventListener('click', event => {
      const t = event.target;
      if (t?.closest?.('.play-game-btn, #result-play-again, #result-continue, .replay-btn, [class*="play"], [class*="replay"], [class*="respawn"]')
        || (!inGame() && t?.closest?.('button, .btn, [role="button"]'))) rearmKillFeedFilter();
      nativeTimeout(updateInGame, 300); nativeTimeout(updateInGame, 1500);
      if (t?.closest?.('#wzg-sidebar, .wzs-tabs, #settings-tabs, .change-name-btn, .server-map')) scheduleMount();
    }, true);
    document.addEventListener('keydown', event => {
      const key = (event.key || '').toLowerCase();
      if ((key === 'enter' && !inGame()) || (key === 'r' && !event.ctrlKey && !event.metaKey && !event.altKey)) { rearmKillFeedFilter(); nativeTimeout(updateInGame, 300); nativeTimeout(updateInGame, 1500); }
    }, true);
    let wasPlaying = false;
    function updateInGame() {
      const canvas = document.getElementById('gameCanvas');
      const shell = document.querySelector('.shell');
      const playing = !!canvas && canvas.getClientRects().length > 0 && !(shell && shell.getClientRects().length > 0);
      document.documentElement.classList.toggle('wzg-ingame', playing);
      if (playing && !wasPlaying) { rearmKillFeedFilter(); hideUpdateNotice(); armBrokenWatch(); }
      if (!playing && wasPlaying) { try { refreshProfile(); } catch {} nativeTimeout(maybeShowUpdateNotice, 600); }
      wasPlaying = playing;
    }
    const igSeen = new WeakSet();
    const igObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(updateInGame) : null;
    function watchInGame() {
      if (!igObserver) return;
      for (const el of [document.getElementById('gameCanvas'), document.querySelector('.shell')]) {
        if (el && !igSeen.has(el)) { igSeen.add(el); igObserver.observe(el); }
      }
    }
    if (igObserver) { watchInGame(); updateInGame(); document.addEventListener('visibilitychange', updateInGame); }
    else nativeInterval(updateInGame, 1000);
    let roomsBox = null, roomsQueued = false;
    function watchRooms() {
      const box = document.querySelector('.center-bottom');
      if (!box || roomsBox === box) return;
      roomsBox = box;
      new MutationObserver(() => {
        if (roomsQueued) return;
        roomsQueued = true;
        nativeRAF(() => { roomsQueued = false; if (!document.hidden && !inGame()) decorateRooms(); });
      }).observe(box, { childList: true, subtree: true, characterData: true });
    }
    watchRooms();
    nativeTimeout(decorateRooms, 1500);
    nativeTimeout(decorateRooms, 4000);


    document.addEventListener('keydown', event => {
      if (!event.key || event.key.toLowerCase() !== 'r') return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const t = event.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const btn = document.querySelector('.replay-btn');
      if (btn && btn.getClientRects().length > 0) {
        event.preventDefault();
        btn.click();
      }
    }, true);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.getElementById(`${ID}-vip-modal`)?.classList.contains('is-open')) {
        closeVIP();
        return;
      }
      if (event.key === 'Escape' && document.getElementById(`${ID}-bg-modal`)?.classList.contains('is-open')) {
        closeBackgrounds();
        return;
      }
      if (event.key === 'Escape' && document.getElementById(`${ID}-guide-modal`)?.classList.contains('is-open')) {
        closeGuide();
        return;
      }
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
