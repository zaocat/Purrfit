/**
 * Cloudflare Worker - Cat Weight Tracker (v6.5 - Fix Content Error)
 * Fixes: "ReferenceError: content is not defined"
 * Features: All previous features (Dark Mode, PWA, Filters, Smart Tooltip, etc.)
 */

const STORAGE_KEY = 'weights';
const SESSION_COOKIE_NAME = 'cat_session';
const FAVICON_URL = 'https://p.929255.xyz/black-cat1.png';

// 更加稳定的 Base64 编码函数 (支持中文)
function safeBtoa(str) {
  try {
    const bytes = new TextEncoder().encode(str);
    const binString = String.fromCodePoint(...bytes);
    return btoa(binString);
  } catch (e) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
    }));
  }
}

export default {
  async fetch(request, env) {
    // --- 🛡️ 全局错误捕获 (防止 1101) ---
    try {
      return await handleRequest(request, env);
    } catch (e) {
      return new Response(`
        <h1>💥 程序运行出错 (诊断模式)</h1>
        <pre style="background:#eee;padding:10px;border-radius:5px;color:red;font-weight:bold">${e.stack || e.message}</pre>
        <p><strong>请检查：</strong>后台 KV Namespace Bindings 是否绑定了变量名 <code>CAT_KV</code>。</p>
      `, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
    }
  },
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // --- 0. 关键检查 ---
  if (!env.CAT_KV) {
    throw new Error("未检测到 KV 绑定！请在后台添加绑定，变量名必须为 'CAT_KV'。");
  }

  // --- 1. 配置 ---
  const catNamesStr = env.CAT_NAMES || '我的猫咪';
  const catNames = catNamesStr.split(',').map(s => s.trim()).filter(s => s);
  const adminUser = env.ADMIN_USER || 'admin';
  const adminPass = env.ADMIN_PASS || 'password';

  // --- 2. 路由 ---
  if (path === '/login' && request.method === 'GET') {
    return new Response(renderLogin(), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  if (path === '/auth/login' && request.method === 'POST') {
    const formData = await request.formData();
    const user = formData.get('username');
    const pass = formData.get('password');

    if (user === adminUser && pass === adminPass) {
      const token = safeBtoa(`${user}:${pass}`);
      const headers = new Headers();
      headers.append('Set-Cookie', `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Max-Age=604800; SameSite=Lax`);
      headers.append('Location', '/add');
      return new Response(null, { status: 302, headers });
    } else {
      return new Response(renderLogin('账号或密码错误'), { status: 401, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }
  }

  if (path === '/logout') {
    const headers = new Headers();
    headers.append('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0`);
    headers.append('Location', '/');
    return new Response(null, { status: 302, headers });
  }

  // 鉴权保护
  const protectedPaths = ['/add', '/api/save', '/api/delete'];
  if (protectedPaths.includes(path)) {
    const cookie = request.headers.get('Cookie');
    const validToken = safeBtoa(`${adminUser}:${adminPass}`);
    if (!cookie || !cookie.includes(`${SESSION_COOKIE_NAME}=${validToken}`)) {
      return Response.redirect(url.origin + '/login', 302);
    }
  }

  // API
  if (path === '/api/save' && request.method === 'POST') {
    const formData = await request.formData();
    const id = formData.get('id');
    const date = formData.get('date');
    const weight = parseFloat(formData.get('weight'));
    const name = formData.get('name');
    const note = formData.get('note') || '';
    const currentCat = formData.get('current_cat') || name;

    if (!date || isNaN(weight)) return new Response('Invalid', { status: 400 });

    let data = await getData(env);
    if (id) {
      const index = data.findIndex(item => item.id === id);
      if (index !== -1) data[index] = { ...data[index], date, weight, name, note };
    } else {
      data.push({ id: Date.now().toString(), date, weight, name, note });
    }
    data.sort((a, b) => new Date(a.date) - new Date(b.date));
    await env.CAT_KV.put(STORAGE_KEY, JSON.stringify(data));
    return Response.redirect(`${url.origin}/add?cat=${encodeURIComponent(currentCat)}`, 303);
  }

  if (path === '/api/delete' && request.method === 'POST') {
    const formData = await request.formData();
    const id = formData.get('id');
    const currentCat = formData.get('current_cat');
    let data = await getData(env);
    data = data.filter(item => item.id !== id);
    await env.CAT_KV.put(STORAGE_KEY, JSON.stringify(data));
    return Response.redirect(`${url.origin}/add?cat=${encodeURIComponent(currentCat)}`, 303);
  }

  // 渲染
  const data = await getData(env);
  const cookie = request.headers.get('Cookie');
  const validToken = safeBtoa(`${adminUser}:${adminPass}`);
  const isLoggedIn = cookie && cookie.includes(`${SESSION_COOKIE_NAME}=${validToken}`);
  const pageType = path === '/add' ? 'admin' : 'home';

  return new Response(renderHTML(data, pageType, catNames, isLoggedIn), {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}

async function getData(env) {
  const json = await env.CAT_KV.get(STORAGE_KEY);
  return json ? JSON.parse(json) : [];
}

// --- 登录页 ---
function renderLogin(error = '') {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>登录</title><link rel="icon" href="${FAVICON_URL}"><link href="https://fonts.googleapis.com/css2?family=Varela+Round&display=swap" rel="stylesheet"><style>:root { --bg: linear-gradient(135deg,#fff1eb 0%,#ace0f9 100%); --card: rgba(255,255,255,0.85); --text: #444; --input: #f0f4f8; } @media (prefers-color-scheme: dark) { :root { --bg: linear-gradient(135deg,#1e293b 0%,#0f172a 100%); --card: rgba(30,41,59,0.85); --text: #f1f5f9; --input: #334155; } } body{display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:var(--bg);font-family:'Varela Round',sans-serif;color:var(--text)}.card{background:var(--card);backdrop-filter:blur(12px);padding:2.5rem;border-radius:24px;box-shadow:0 10px 30px rgba(0,0,0,0.1);width:100%;max-width:380px;border:1px solid rgba(255,255,255,0.2);text-align:center;transition:transform 0.3s}.card:hover{transform:translateY(-5px)}h1{margin-bottom:1.5rem;font-size:1.6rem}input{width:100%;padding:14px;margin-bottom:1rem;border:none;background:var(--input);border-radius:12px;font-size:1rem;box-sizing:border-box;outline:none;transition:0.2s;font-family:inherit;color:var(--text)}input:focus{box-shadow:0 0 0 2px #ff9a9e}button{width:100%;padding:14px;background:linear-gradient(to right,#ff9a9e,#fecfef);color:#fff;border:none;border-radius:12px;font-size:1.1rem;cursor:pointer;font-family:inherit;box-shadow:0 4px 10px rgba(255,154,158,0.3);transition:0.2s}button:hover{transform:translateY(-2px)}.err{color:#ff6b6b;margin-bottom:1rem;background:rgba(255,0,0,0.1);padding:8px;border-radius:8px;font-size:0.9rem}.back{display:block;margin-top:1.5rem;color:#888;text-decoration:none;font-size:0.9rem}</style></head><body><div class="card"><h1>🐱 铲屎官登录</h1>${error?`<div class="err">${error}</div>`:''}<form action="/auth/login" method="POST"><input type="text" name="username" placeholder="用户名" required><input type="password" name="password" placeholder="密码" required><button type="submit">芝麻开门</button></form><a href="/" class="back">← 返回首页</a></div></body></html>`;
}

// --- 主页面 ---
function renderHTML(allData, page, catNames, isLoggedIn) {
  const normalizedData = allData.map(item => ({ ...item, name: item.name || catNames[0], note: item.note || '' }));
  const safeData = JSON.stringify(normalizedData);
  const safeCats = JSON.stringify(catNames);
  
  const manifest = {
    name: "猫咪体重本",
    short_name: "猫咪体重",
    start_url: "/",
    display: "standalone",
    background_color: "#fff9f5",
    theme_color: "#ff6b6b",
    icons: [{ src: FAVICON_URL, sizes: "192x192", type: "image/png" }]
  };
  const manifestUri = `data:application/manifest+json;charset=utf-8,${encodeURIComponent(JSON.stringify(manifest))}`;

  const css = `
    :root { --bg-grad: linear-gradient(180deg, #fff9f5 0%, #fdfbf7 100%); --text: #2d3436; --text-sub: #636e72; --card-bg: #ffffff; --border: #f1f2f6; --input-bg: #fdfdfd; --grid: #f1f2f6; --shadow: rgba(0,0,0,0.05); --tooltip-bg: rgba(45, 52, 54, 0.95); --primary: #ff6b6b; --primary-grad: linear-gradient(135deg, #ff6b6b 0%, #ff8e8e 100%); --dot-fill: #fff; }
    html.dark { --bg-grad: linear-gradient(180deg, #0f172a 0%, #1e293b 100%); --text: #f1f5f9; --text-sub: #94a3b8; --card-bg: rgba(30, 41, 59, 0.7); --border: #334155; --input-bg: #1e293b; --grid: #334155; --shadow: rgba(0,0,0,0.3); --tooltip-bg: rgba(0, 0, 0, 0.95); --dot-fill: #1e293b; }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { font-family: 'Varela Round', -apple-system, BlinkMacSystemFont, sans-serif; background: var(--bg-grad); color: var(--text); margin: 0; padding: 20px 10px; min-height: 100vh; perspective: 1000px; transition: color 0.3s, background 0.3s; }
    .container { max-width: 850px; margin: 0 auto; position: relative; }
    body::before { content: ''; position: fixed; top: -100px; right: -50px; width: 400px; height: 400px; background: radial-gradient(circle, rgba(255,107,107,0.08) 0%, rgba(255,255,255,0) 70%); z-index: -1; pointer-events: none; }
    .theme-toggle { position: fixed; top: 20px; right: 20px; z-index: 100; background: var(--card-bg); border: 1px solid var(--border); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 12px var(--shadow); font-size: 1.2rem; transition: transform 0.2s; backdrop-filter: blur(10px); }
    .theme-toggle:hover { transform: scale(1.1); }
    .cat-switcher { background: var(--card-bg); backdrop-filter: blur(12px); border-radius: 20px; padding: 12px 20px; box-shadow: 0 4px 20px var(--shadow); margin-bottom: 30px; border: 1px solid var(--border); text-align: center; transition: transform 0.3s; }
    .cat-switcher:hover { transform: translateY(-2px); }
    .curr-cat { display: flex; justify-content: center; align-items: center; gap: 10px; font-weight: 800; font-size: 1.4rem; cursor: pointer; color: var(--text); }
    .cat-list { display: none; justify-content: center; flex-wrap: wrap; gap: 10px; margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border); animation: slideDown 0.2s ease; }
    @keyframes slideDown { from{opacity:0;transform:translateY(-5px)} to{opacity:1;transform:translateY(0)} }
    .cat-tag { padding: 8px 18px; border-radius: 99px; background: var(--border); color: var(--text-sub); font-size: 0.95rem; font-weight: 500; cursor: pointer; transition: 0.2s; }
    .cat-tag.active { background: var(--primary-grad); color: white; box-shadow: 0 4px 10px rgba(255,107,107,0.3); }
    .card { background: var(--card-bg); border-radius: 24px; padding: 30px; margin-bottom: 30px; box-shadow: 0 10px 30px -10px var(--shadow); border: 1px solid var(--border); position: relative; overflow: hidden; transform-style: preserve-3d; will-change: transform; transition: transform 0.1s ease, box-shadow 0.2s ease, background 0.3s; backdrop-filter: blur(10px); }
    .card::after { content: ""; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: radial-gradient(800px circle at var(--mouse-x) var(--mouse-y), rgba(255, 255, 255, 0.15), transparent 40%); opacity: 0; transition: opacity 0.5s; pointer-events: none; z-index: 1; mix-blend-mode: overlay; }
    .card:hover::after { opacity: 1; }
    .card > * { position: relative; z-index: 2; }
    h3 { margin: 0 0 20px 0; font-size: 1.2rem; display: flex; justify-content: space-between; align-items: center; color: var(--text); font-weight: 700; }
    .filters { display: flex; gap: 8px; font-size: 0.85rem; }
    .filter-btn { background: transparent; border: 1px solid var(--border); color: var(--text-sub); padding: 4px 12px; border-radius: 12px; cursor: pointer; transition: 0.2s; font-family: inherit; }
    .filter-btn:hover { background: var(--border); }
    .filter-btn.active { background: var(--primary-grad); color: white; border-color: transparent; }
    .chart-box { height: 280px; width: 100%; position: relative; cursor: crosshair; }
    svg { width: 100%; height: 100%; overflow: visible; }
    .area-fill { fill: url(#gradientFill); opacity: 0.3; }
    .line { fill: none; stroke: var(--primary); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .dot { fill: var(--dot-fill); stroke: var(--primary); stroke-width: 2.5; transition: all 0.2s; cursor: pointer; }
    .dot:hover { stroke-width: 4; r: 7; }
    .axis { font-size: 11px; fill: var(--text-sub); font-family: monospace; }
    .grid { stroke: var(--grid); stroke-dasharray: 4; }
    
    /* 智能气泡 */
    .chart-tooltip { position: absolute; background: var(--tooltip-bg); color: white; padding: 8px 14px; border-radius: 12px; font-size: 0.9rem; pointer-events: none; opacity: 0; transition: opacity 0.2s, top 0.2s, left 0.2s; transform: translate(-50%, -115%); white-space: nowrap; z-index: 10; box-shadow: 0 5px 15px rgba(0,0,0,0.3); text-align: center; }
    .chart-tooltip::after { content: ''; position: absolute; top: 100%; left: 50%; margin-left: -6px; border-width: 6px; border-style: solid; border-color: var(--tooltip-bg) transparent transparent transparent; transition: left 0.2s; }
    .chart-tooltip.is-right { transform: translate(-90%, -115%); } .chart-tooltip.is-right::after { left: 90%; }
    .chart-tooltip.is-left { transform: translate(-10%, -115%); } .chart-tooltip.is-left::after { left: 10%; }
    
    .tooltip-date { font-size: 0.75rem; color: #dfe6e9; margin-top: 2px; font-family: monospace; }
    .tooltip-note { font-size: 0.8rem; color: #ffeaa7; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 4px; display: block; font-weight: normal; }
    .item { display: flex; justify-content: space-between; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--border); }
    .item:last-child { border-bottom: none; }
    .w-val { font-size: 1.3rem; font-weight: 700; color: var(--text); }
    .w-date { font-size: 0.85rem; color: var(--text-sub); margin-top: 2px; }
    .note { font-size: 0.85rem; color: #6c5ce7; background: #e0e0fc; padding: 4px 10px; border-radius: 8px; margin-top: 6px; display: inline-block; font-weight: 500; }
    .actions { display: flex; gap: 10px; }
    .btn-icon { width: 38px; height: 38px; border-radius: 10px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; transition: 0.2s; }
    .btn-edit { background: var(--border); color: var(--text); }
    .btn-edit:hover { background: #dfe6e9; transform: scale(1.05); }
    .btn-del { background: #ffeaa7; color: #d63031; }
    .btn-del:hover { transform: scale(1.05); }
    input, select { width: 100%; padding: 14px; border: 2px solid var(--border); border-radius: 16px; font-size: 16px; outline: none; background: var(--input-bg); margin-bottom: 15px; transition: 0.2s; font-family: inherit; color: var(--text); }
    input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(255,107,107,0.1); }
    .form-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 15px; }
    .btn-main { width: 100%; padding: 16px; background: var(--primary-grad); color: white; border: none; border-radius: 16px; font-weight: 700; font-size: 1.1rem; cursor: pointer; box-shadow: 0 8px 20px rgba(255,107,107,0.25); transition: transform 0.1s; font-family: inherit; }
    .btn-main:active { transform: scale(0.98); }
    .btn-cancel { width: 100%; padding: 12px; background: transparent; color: var(--text-sub); border: none; cursor: pointer; margin-top: 5px; display: none; font-family: inherit; }
    .nav-link { display: block; text-align: center; margin-top: 40px; color: var(--text-sub); text-decoration: none; font-size: 0.9rem; font-weight: 500; transition: color 0.2s; }
    .nav-link:hover { color: var(--primary); }
    .empty { text-align: center; padding: 60px 0; color: var(--text-sub); font-style: italic; font-size: 1.1rem; }
    @media (max-width: 600px) { .card { padding: 20px; } .chart-box { height: 240px; } .theme-toggle { top: 15px; right: 15px; width: 36px; height: 36px; } }
    @media (hover: none) { .card { transform: none !important; } .card::after { display: none; } }
  `;

  const js = `
    <script>
      const rawData = ${safeData};
      const catNames = ${safeCats};
      const params = new URLSearchParams(window.location.search);
      let currentCat = params.get('cat') || catNames[0];
      if(!catNames.includes(currentCat)) currentCat = catNames[0];
      let isEditMode = false;
      let timeFilter = 'all';

      document.addEventListener('DOMContentLoaded', () => {
        renderApp();
        initTiltEffect(); 
        const sel = document.getElementById('catSelect');
        if(sel) sel.value = currentCat;
        updateThemeIcon();
      });

      function toggleTheme() {
        const html = document.documentElement;
        if (html.classList.contains('dark')) {
          html.classList.remove('dark');
          localStorage.setItem('theme', 'light');
        } else {
          html.classList.add('dark');
          localStorage.setItem('theme', 'dark');
        }
        updateThemeIcon();
      }

      function updateThemeIcon() {
        const btn = document.getElementById('themeToggle');
        const isDark = document.documentElement.classList.contains('dark');
        btn.innerHTML = isDark ? '🌙' : '☀️';
      }

      function initTiltEffect() {
        if(window.matchMedia("(hover: none)").matches) return; 
        const cards = document.querySelectorAll('.card');
        cards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                card.style.setProperty('--mouse-x', \`\${x}px\`);
                card.style.setProperty('--mouse-y', \`\${y}px\`);
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = ((centerY - y) / centerY) * 1.5; 
                const rotateY = ((x - centerX) / centerX) * 1.5;
                card.style.transform = \`perspective(1000px) rotateX(\${rotateX}deg) rotateY(\${rotateY}deg) scale3d(1.005, 1.005, 1.005)\`;
                card.style.transition = 'none'; 
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
                card.style.transition = 'transform 0.5s ease';
            });
        });
      }

      function toggleMenu() {
        const list = document.getElementById('catList');
        const icon = document.getElementById('arrowIcon');
        const isHidden = list.style.display !== 'flex';
        list.style.display = isHidden ? 'flex' : 'none';
        icon.innerText = isHidden ? '▲' : '▼';
      }

      function switchCat(name) {
        currentCat = name;
        cancelEdit();
        const url = new URL(window.location);
        url.searchParams.set('cat', name);
        window.history.replaceState({}, '', url);
        document.getElementById('catList').style.display = 'none';
        document.getElementById('arrowIcon').innerText = '▼';
        const sel = document.getElementById('catSelect');
        if(sel) sel.value = currentCat;
        renderApp();
      }

      function setFilter(range) {
        timeFilter = range;
        renderApp();
      }

      function renderApp() {
        document.getElementById('currCatName').innerText = currentCat;
        document.getElementById('catList').innerHTML = catNames.map(n => 
          \`<div class="cat-tag \${n===currentCat?'active':''}" onclick="switchCat('\${n}')">\${n}</div>\`
        ).join('');
        let catData = rawData.filter(d => d.name === currentCat);
        if (timeFilter !== 'all') {
            const now = new Date();
            const days = timeFilter === '3m' ? 90 : 180;
            const limit = new Date(now.setDate(now.getDate() - days));
            catData = catData.filter(d => new Date(d.date) >= limit);
        }
        ['3m', '6m', 'all'].forEach(f => {
            const btn = document.getElementById('btn-'+f);
            if(btn) {
                if(f === timeFilter) btn.classList.add('active');
                else btn.classList.remove('active');
            }
        });
        renderChart(catData);
        renderList(catData);
        setTimeout(initTiltEffect, 50);
      }

      // 智能气泡逻辑
      window.showTooltip = function(el, weight, date, noteEncoded) {
        const tip = document.getElementById('chartTooltip');
        if(!tip) return;
        const note = decodeURIComponent(noteEncoded);
        const noteHtml = note ? \`<div class="tooltip-note">📝 \${note}</div>\` : '';
        
        const box = document.getElementById('chart');
        const cx = parseFloat(el.getAttribute('cx'));
        const cy = parseFloat(el.getAttribute('cy'));
        const width = box.clientWidth;
        const ratio = cx / width;
        
        tip.className = 'chart-tooltip'; 
        if (ratio > 0.8) tip.classList.add('is-right');
        else if (ratio < 0.2) tip.classList.add('is-left');

        tip.innerHTML = \`<strong>\${weight} kg</strong><div class="tooltip-date">\${date}</div>\${noteHtml}\`;
        tip.style.left = cx + 'px';
        tip.style.top = cy + 'px';
        tip.style.opacity = 1;
      }

      window.hideTooltip = function() {
        const tip = document.getElementById('chartTooltip');
        if(tip) tip.style.opacity = 0;
      }

      function renderChart(data) {
        const box = document.getElementById('chart');
        if(!box) return;
        if(data.length < 1) { box.innerHTML = '<div class="empty">此时段无数据</div>'; return; }
        const w = box.clientWidth;
        const h = box.clientHeight;
        const p = {t:20, b:30, l:35, r:10};
        const weights = data.map(d => d.weight);
        let min = Math.min(...weights);
        let max = Math.max(...weights);
        let pad = (max - min) * 0.1; if(pad===0) pad=0.5;
        min -= pad; max += pad;
        const getX = i => p.l + i * (w - p.l - p.r) / (data.length - 1 || 1);
        const getY = v => h - p.b - ((v - min)/(max - min)) * (h - p.t - p.b);
        const points = data.map((d, i) => ({x: getX(i), y: getY(d.weight)}));
        let dPath = '';
        points.forEach((pt, i) => { dPath += (i===0 ? 'M' : 'L') + \` \${pt.x} \${pt.y}\`; });
        const areaPath = dPath + \` L \${points[points.length-1].x} \${h-p.b} L \${points[0].x} \${h-p.b} Z\`;
        let grids = '', yLabels = '', xLabels = '', dotHtml = '';
        for(let i=0; i<=4; i++) {
           const val = min + (max - min) * (i/4);
           const y = getY(val);
           grids += \`<line x1="\${p.l}" y1="\${y}" x2="\${w-p.r}" y2="\${y}" class="grid"/>\`;
           yLabels += \`<text x="\${p.l-5}" y="\${y+4}" text-anchor="end" class="axis">\${val.toFixed(1)}</text>\`;
        }
        const xStep = Math.ceil(data.length / ((w-p.l)/60));
        points.forEach((pt, i) => {
           const safeNote = encodeURIComponent(data[i].note || '');
           dotHtml += \`<circle cx="\${pt.x}" cy="\${pt.y}" r="4" class="dot" 
                        onmouseenter="showTooltip(this, '\${data[i].weight}', '\${data[i].date}', '\${safeNote}')" 
                        onmouseleave="hideTooltip()" />\`;
           if(i===0 || i===points.length-1 || i%xStep===0) {
              const date = data[i].date.slice(5).replace('-','/');
              let anchor = i===0 ? 'start' : (i===points.length-1 ? 'end' : 'middle');
              let tx = pt.x; if(i===0) tx = Math.max(tx, p.l);
              xLabels += \`<text x="\${tx}" y="\${h-5}" text-anchor="\${anchor}" class="axis">\${date}</text>\`;
           }
        });
        box.innerHTML = \`<svg viewBox="0 0 \${w} \${h}"><defs><linearGradient id="gradientFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#ff6b6b"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>\${grids}<path d="\${areaPath}" class="area-fill"/><path d="\${dPath}" class="line"/>\${dotHtml}\${yLabels}\${xLabels}</svg><div id="chartTooltip" class="chart-tooltip"></div>\`;
      }

      function renderList(data) {
        const list = document.getElementById('list');
        if(!list) return;
        if(!data.length) { list.innerHTML = ''; return; }
        const isAdmin = !!document.getElementById('editForm');
        list.innerHTML = [...data].reverse().map(item => {
          const note = item.note ? \`<div class="note">\${item.note}</div>\` : '';
          const actions = isAdmin ? \`
            <div class="actions">
              <button class="btn-icon btn-edit" onclick='startEdit(\${JSON.stringify(item)})'>✏️</button>
              <form action="/api/delete" method="POST" onsubmit="return confirm('确定删除？')">
                <input type="hidden" name="id" value="\${item.id}">
                <input type="hidden" name="current_cat" value="\${currentCat}">
                <button class="btn-icon btn-del">🗑️</button>
              </form>
            </div>\` : '';
          return \`<div class="item"><div class="item-l"><div class="w-val">\${item.weight} <span style="font-size:0.8rem;font-weight:400;color:var(--text-sub)">kg</span></div><div class="w-date">\${item.date}</div>\${note}</div>\${actions}</div>\`;
        }).join('');
      }

      function startEdit(item) {
        isEditMode = true;
        document.getElementById('formId').value = item.id;
        document.querySelector('input[name="date"]').value = item.date;
        document.querySelector('input[name="weight"]').value = item.weight;
        document.querySelector('input[name="note"]').value = item.note;
        const btn = document.getElementById('submitBtn');
        btn.innerHTML = '💾 保存修改';
        btn.style.background = 'linear-gradient(135deg, #0984e3, #74b9ff)';
        document.getElementById('cancelBtn').style.display = 'block';
        document.getElementById('formTitle').innerText = '📝 编辑记录';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      function cancelEdit() {
        isEditMode = false;
        document.getElementById('editForm').reset();
        document.getElementById('formId').value = '';
        document.querySelector('input[name="date"]').value = new Date().toISOString().split('T')[0];
        const btn = document.getElementById('submitBtn');
        btn.innerHTML = '✨ 添加记录';
        btn.style.background = ''; 
        document.getElementById('cancelBtn').style.display = 'none';
        document.getElementById('formTitle').innerText = '✨ 新记录';
        const sel = document.getElementById('catSelect');
        if(sel) sel.value = currentCat;
      }
      
      function exportCSV() {
        const d = rawData.filter(x => x.name === currentCat);
        if(!d.length) return alert('没有数据');
        const csv = "data:text/csv;charset=utf-8,\uFEFF日期,体重,备注\\n" + d.map(x => \`\${x.date},\${x.weight},\${x.note}\`).join('\\n');
        const a = document.createElement('a');
        a.href = encodeURI(csv); a.download = currentCat+'_records.csv'; a.click();
      }
    </script>
  `;

  const themeInitScript = `
    <script>
      (function() {
        const saved = localStorage.getItem('theme');
        const sys = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (saved === 'dark' || (!saved && sys)) {
          document.documentElement.classList.add('dark');
        }
      })();
    </script>
  `;

  // !! 这里是 v6.2 漏掉的关键部分，现在补回来了 !!
  const switcher = `
    <div class="cat-switcher">
      <div class="curr-cat" onclick="toggleMenu()">
        <span id="currCatName">加载中...</span>
        <span id="arrowIcon" style="font-size:0.8rem; color:#ff6b6b; transition:0.2s">▼</span>
      </div>
      <div class="cat-list" id="catList"></div>
    </div>
  `;

  let content = '';
  if (page === 'home') {
    const adminLink = isLoggedIn ? `<a href="/add" class="nav-link">🔐 进入后台</a>` : `<a href="/login" class="nav-link">👤 铲屎官登录</a>`;
    content = `
      ${switcher}
      <div class="card">
        <h3>
            <span>📈 体重走势 <span id="trend"></span></span>
            <div class="filters">
                <button id="btn-3m" class="filter-btn" onclick="setFilter('3m')">近3月</button>
                <button id="btn-6m" class="filter-btn" onclick="setFilter('6m')">近半年</button>
                <button id="btn-all" class="filter-btn active" onclick="setFilter('all')">全部</button>
            </div>
        </h3>
        <div id="chart" class="chart-box"></div>
      </div>
      <div class="card">
        <h3>📅 历史记录</h3>
        <div id="list"></div>
      </div>
      ${adminLink}
    `;
  } else {
    const today = new Date().toISOString().split('T')[0];
    content = `
      ${switcher}
      <div class="card">
        <h3 id="formTitle">✨ 新记录</h3>
        <form action="/api/save" method="POST" id="editForm">
          <input type="hidden" name="id" id="formId">
          <input type="hidden" name="current_cat" value="${allData.length>0?allData[0].name:''}" id="currentCatInput">
          <select name="name" id="catSelect" onchange="switchCat(this.value)" style="display:none">${catNames.map(n=>`<option value="${n}">${n}</option>`).join('')}</select>
          <div class="form-grid">
            <input type="date" name="date" value="${today}" required>
            <input type="number" name="weight" step="0.01" placeholder="体重 (kg)" required>
          </div>
          <input type="text" name="note" placeholder="备注 (例如：换粮，生病)" maxlength="50">
          <button type="submit" class="btn-main" id="submitBtn">✨ 添加记录</button>
          <button type="button" class="btn-cancel" id="cancelBtn" onclick="cancelEdit()">取消</button>
        </form>
      </div>
      <div class="card">
        <h3>
            📝 数据管理
            <div class="filters">
                <button id="btn-3m" class="filter-btn" onclick="setFilter('3m')">近3月</button>
                <button id="btn-6m" class="filter-btn" onclick="setFilter('6m')">近半年</button>
                <button id="btn-all" class="filter-btn active" onclick="setFilter('all')">全部</button>
            </div>
        </h3>
        <div id="list"></div>
        <button onclick="exportCSV()" style="width:100%;margin-top:20px;padding:12px;background:var(--border);border:none;border-radius:12px;color:var(--text-sub);font-weight:600;cursor:pointer;font-family:inherit">📥 导出 CSV</button>
      </div>
      <a href="/" class="nav-link">🏠 返回首页</a><a href="/logout" class="nav-link" style="color:#ff7675;margin-top:15px">🚫 退出登录</a>
    `;
  }

  return `<!DOCTYPE html><html lang="zh-CN"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=0">
  <title>猫咪体重本</title>
  <link rel="icon" href="${FAVICON_URL}">
  <link href="https://fonts.googleapis.com/css2?family=Varela+Round&display=swap" rel="stylesheet">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#ff6b6b">
  <link rel="apple-touch-icon" href="${FAVICON_URL}">
  <link rel="manifest" href="${manifestUri}">
  ${themeInitScript}
  <style>${css}</style></head>
  <body>
    <button id="themeToggle" class="theme-toggle" onclick="toggleTheme()">☀️</button>
    <div class="container">${content}</div>
    ${js}
  </body></html>`;
}
