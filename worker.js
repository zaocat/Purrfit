/**
 * Cloudflare Worker - Cat Weight Tracker (v7.1 - Bottom Nav Card)
 * Features: Bottom Nav Card, i18n, Theme Toggle, Import/Export, Smart Tooltip
 */

const STORAGE_KEY = 'weights';
const SESSION_COOKIE_NAME = 'cat_session';
const FAVICON_URL = 'https://p.929255.xyz/black-cat1.png';

// Base64 Encoding Helper
function safeBtoa(str) {
  try {
    const bytes = new TextEncoder().encode(str);
    const binString = String.fromCodePoint(...bytes);
    return btoa(binString);
  } catch (e) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
  }
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      return new Response(`<h1>Error 1101 Diagnosis</h1><pre>${e.stack || e.message}</pre><p>Check KV Binding: CAT_KV</p>`, { headers: { 'Content-Type': 'text/html' } });
    }
  },
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!env.CAT_KV) throw new Error("CAT_KV binding missing.");

  // Config
  const catNamesStr = env.CAT_NAMES || 'My Cat';
  const catNames = catNamesStr.split(',').map(s => s.trim()).filter(s => s);
  const adminUser = env.ADMIN_USER || 'admin';
  const adminPass = env.ADMIN_PASS || 'password';

  // --- Login Routes ---
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
      return Response.redirect(url.origin + '/login?error=1', 302);
    }
  }

  if (path === '/logout') {
    const headers = new Headers();
    headers.append('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0`);
    headers.append('Location', '/');
    return new Response(null, { status: 302, headers });
  }

  // --- Auth Check ---
  const protectedPaths = ['/add', '/api/save', '/api/delete', '/api/import'];
  if (protectedPaths.includes(path)) {
    const cookie = request.headers.get('Cookie');
    const validToken = safeBtoa(`${adminUser}:${adminPass}`);
    if (!cookie || !cookie.includes(`${SESSION_COOKIE_NAME}=${validToken}`)) {
      return Response.redirect(url.origin + '/login', 302);
    }
  }

  // --- Data APIs ---
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

  if (path === '/api/import' && request.method === 'POST') {
    const formData = await request.formData();
    const file = formData.get('csv_file');
    const currentCat = formData.get('target_name') || catNames[0];
    if (!file || typeof file === 'string') return new Response('File required', {status: 400});
    
    const text = await file.text();
    const lines = text.split(/\r?\n/);
    let data = await getData(env);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.toLowerCase().includes('date') || line.includes('日期')) continue;
        
        const parts = line.split(',');
        if (parts.length < 2) continue;
        const date = parts[0].trim();
        const weight = parseFloat(parts[1]);
        if (!date || isNaN(weight)) continue;

        let name = currentCat;
        let note = '';
        if (parts.length === 3) note = parts[2].trim();
        else if (parts.length >= 4) {
            name = parts[2].trim() || currentCat;
            note = parts.slice(3).join(',').trim();
        }

        const existingIdx = data.findIndex(d => d.date === date && d.name === name);
        if (existingIdx !== -1) data[existingIdx] = { ...data[existingIdx], weight, note };
        else data.push({ id: Date.now().toString() + Math.random().toString().substr(2,5), date, weight, name, note });
    }
    data.sort((a, b) => new Date(a.date) - new Date(b.date));
    await env.CAT_KV.put(STORAGE_KEY, JSON.stringify(data));
    return Response.redirect(`${url.origin}/add?cat=${encodeURIComponent(currentCat)}`, 303);
  }

  // --- Main Render ---
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

// --- Translation Dictionary ---
const I18N_DATA = {
  zh: {
    title: "猫咪体重本",
    login_title: "🐱 铲屎官登录",
    username: "用户名",
    password: "密码",
    login_btn: "芝麻开门",
    back_home: "← 返回首页",
    login_err: "账号或密码错误",
    trend: "📈 体重走势",
    filter_3m: "近3月",
    filter_6m: "近半年",
    filter_all: "全部",
    history: "📅 历史记录",
    manage: "📝 数据管理",
    new_record: "✨ 新记录",
    add_btn: "✨ 添加记录",
    save_btn: "💾 保存修改",
    cancel_btn: "取消",
    import_btn: "📤 导入 CSV",
    export_btn: "📥 导出 CSV",
    logout: "🚫 退出登录",
    login_link: "👤 铲屎官登录",
    admin_link: "🔐 进入后台",
    empty_chart: "此时段无数据",
    empty_list: "暂无记录",
    confirm_delete: "确定要删除这条记录吗？",
    confirm_import: "导入将合并数据，重复日期的记录将被覆盖。确定继续吗？",
    no_data_export: "没有数据可导出",
    placeholder_weight: "体重 (kg)",
    placeholder_note: "备注 (例如：换粮，生病)",
    unit: "kg"
  },
  en: {
    title: "Cat Weight Tracker",
    login_title: "🐱 Admin Login",
    username: "Username",
    password: "Password",
    login_btn: "Login",
    back_home: "← Back to Home",
    login_err: "Invalid credentials",
    trend: "📈 Weight Trend",
    filter_3m: "3 Months",
    filter_6m: "6 Months",
    filter_all: "All",
    history: "📅 History",
    manage: "📝 Data Management",
    new_record: "✨ New Record",
    add_btn: "✨ Add Record",
    save_btn: "💾 Save Changes",
    cancel_btn: "Cancel",
    import_btn: "📤 Import CSV",
    export_btn: "📥 Export CSV",
    logout: "🚫 Logout",
    login_link: "👤 Admin Login",
    admin_link: "🔐 Dashboard",
    empty_chart: "No data in this period",
    empty_list: "No records found",
    confirm_delete: "Are you sure you want to delete this record?",
    confirm_import: "Import will merge data. Records with the same date will be overwritten. Continue?",
    no_data_export: "No data to export",
    placeholder_weight: "Weight (kg)",
    placeholder_note: "Note (e.g. diet change)",
    unit: "kg"
  }
};

// Shared CSS/JS
const SHARED_HEAD = `
<link rel="icon" href="${FAVICON_URL}">
<link href="https://fonts.googleapis.com/css2?family=Varela+Round&display=swap" rel="stylesheet">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=0">
<style>
:root {
  --bg-grad: linear-gradient(180deg, #fff9f5 0%, #fdfbf7 100%);
  --text: #2d3436; --text-sub: #636e72; --card-bg: #ffffff; --border: #f1f2f6;
  --input-bg: #fdfdfd; --grid: #f1f2f6; --shadow: rgba(0,0,0,0.05);
  --tooltip-bg: rgba(45, 52, 54, 0.95); --primary: #ff6b6b;
  --primary-grad: linear-gradient(135deg, #ff6b6b 0%, #ff8e8e 100%); --dot-fill: #fff;
}
html.dark {
  --bg-grad: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
  --text: #f1f5f9; --text-sub: #94a3b8; --card-bg: rgba(30, 41, 59, 0.7);
  --border: #334155; --input-bg: #1e293b; --grid: #334155;
  --shadow: rgba(0,0,0,0.3); --tooltip-bg: rgba(0, 0, 0, 0.95); --dot-fill: #1e293b;
}
body { font-family: 'Varela Round', sans-serif; background: var(--bg-grad); color: var(--text); transition: 0.3s; margin: 0; min-height: 100vh; }
.btn-float-group { position: fixed; top: 20px; right: 20px; z-index: 100; display: flex; gap: 10px; }
.float-btn {
    background: var(--card-bg); border: 1px solid var(--border);
    width: 40px; height: 40px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; box-shadow: 0 4px 12px var(--shadow);
    font-size: 1rem; transition: transform 0.2s; backdrop-filter: blur(10px);
    font-weight: 700; color: var(--text);
}
.float-btn:hover { transform: scale(1.1); }
</style>
<script>
  const i18nData = ${JSON.stringify(I18N_DATA)};
  let curLang = localStorage.getItem('lang') || 'zh';
  
  function applyTheme() {
    const saved = localStorage.getItem('theme');
    const sys = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && sys)) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }
  applyTheme();

  function t(key) { return i18nData[curLang][key] || key; }
  
  function updatePageText() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if(i18nData[curLang][key]) {
            if(el.tagName === 'INPUT') el.placeholder = i18nData[curLang][key];
            else el.innerText = i18nData[curLang][key];
        }
    });
    const langBtn = document.getElementById('langToggle');
    if(langBtn) langBtn.innerText = curLang === 'zh' ? 'CN' : 'EN';
    const themeBtn = document.getElementById('themeToggle');
    if(themeBtn) themeBtn.innerText = document.documentElement.classList.contains('dark') ? '🌙' : '☀️';
  }

  function toggleLang() {
    curLang = curLang === 'zh' ? 'en' : 'zh';
    localStorage.setItem('lang', curLang);
    updatePageText();
    window.dispatchEvent(new Event('langChanged'));
  }

  function toggleTheme() {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
      html.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else {
      html.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    }
    updatePageText();
  }

  document.addEventListener('DOMContentLoaded', updatePageText);
</script>
`;

function renderLogin() {
  return `<!DOCTYPE html><html><head>${SHARED_HEAD}<title>Login</title>
  <style>
    body{display:flex;justify-content:center;align-items:center;}
    .card{background:var(--card-bg);backdrop-filter:blur(12px);padding:2.5rem;border-radius:24px;box-shadow:0 10px 30px rgba(0,0,0,0.1);width:100%;max-width:380px;border:1px solid rgba(255,255,255,0.2);text-align:center;}
    input{width:100%;padding:14px;margin-bottom:1rem;border:none;background:var(--input-bg);border-radius:12px;font-size:1rem;box-sizing:border-box;outline:none;color:var(--text);}
    button.login{width:100%;padding:14px;background:linear-gradient(to right,#ff9a9e,#fecfef);color:#fff;border:none;border-radius:12px;font-size:1.1rem;cursor:pointer;font-family:inherit;box-shadow:0 4px 10px rgba(255,154,158,0.3);}
    .err{color:#ff6b6b;margin-bottom:1rem;background:rgba(255,0,0,0.1);padding:8px;border-radius:8px;font-size:0.9rem}
    .back{display:block;margin-top:1.5rem;color:var(--text-sub);text-decoration:none;font-size:0.9rem}
  </style>
  </head><body>
    <div class="btn-float-group">
        <button id="langToggle" class="float-btn" onclick="toggleLang()">CN</button>
        <button id="themeToggle" class="float-btn" onclick="toggleTheme()">☀️</button>
    </div>
    <div class="card">
        <h1 data-i18n="login_title">🐱 Admin Login</h1>
        <div id="errMsg" class="err" style="display:none" data-i18n="login_err">Invalid credentials</div>
        <form action="/auth/login" method="POST">
            <input type="text" name="username" data-i18n="username" placeholder="Username" required>
            <input type="password" name="password" data-i18n="password" placeholder="Password" required>
            <button type="submit" class="login" data-i18n="login_btn">Login</button>
        </form>
        <a href="/" class="back" data-i18n="back_home">← Back to Home</a>
    </div>
    <script>
        if(window.location.search.includes('error=1')) document.getElementById('errMsg').style.display = 'block';
    </script>
  </body></html>`;
}

function renderHTML(allData, page, catNames, isLoggedIn) {
  const normalizedData = allData.map(item => ({ ...item, name: item.name || catNames[0], note: item.note || '' }));
  const safeData = JSON.stringify(normalizedData);
  const safeCats = JSON.stringify(catNames);
  const manifestUri = `data:application/manifest+json;charset=utf-8,${encodeURIComponent(JSON.stringify({
    name: "Cat Weight",
    short_name: "CatWeight",
    start_url: "/",
    display: "standalone",
    background_color: "#fff9f5",
    theme_color: "#ff6b6b",
    icons: [{ src: FAVICON_URL, sizes: "192x192", type: "image/png" }]
  }))}`;

  const css = `
    .container { max-width: 850px; margin: 0 auto; position: relative; padding-top: 20px; padding-bottom: 40px; }
    body::before { content: ''; position: fixed; top: -100px; right: -50px; width: 400px; height: 400px; background: radial-gradient(circle, rgba(255,107,107,0.08) 0%, rgba(255,255,255,0) 70%); z-index: -1; pointer-events: none; }
    .cat-switcher { background: var(--card-bg); backdrop-filter: blur(12px); border-radius: 20px; padding: 12px 20px; box-shadow: 0 4px 20px var(--shadow); margin-bottom: 30px; border: 1px solid var(--border); text-align: center; transition: transform 0.3s; }
    .curr-cat { display: flex; justify-content: center; align-items: center; gap: 10px; font-weight: 800; font-size: 1.4rem; cursor: pointer; }
    .cat-list { display: none; justify-content: center; flex-wrap: wrap; gap: 10px; margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border); animation: slideDown 0.2s ease; }
    @keyframes slideDown { from{opacity:0;transform:translateY(-5px)} to{opacity:1;transform:translateY(0)} }
    .cat-tag { padding: 8px 18px; border-radius: 99px; background: var(--border); color: var(--text-sub); font-size: 0.95rem; font-weight: 500; cursor: pointer; transition: 0.2s; }
    .cat-tag.active { background: var(--primary-grad); color: white; box-shadow: 0 4px 10px rgba(255,107,107,0.3); }
    .card { background: var(--card-bg); border-radius: 24px; padding: 30px; margin-bottom: 30px; box-shadow: 0 10px 30px -10px var(--shadow); border: 1px solid var(--border); position: relative; overflow: hidden; transform-style: preserve-3d; will-change: transform; transition: transform 0.1s ease, box-shadow 0.2s ease, background 0.3s; backdrop-filter: blur(10px); }
    .card::after { content: ""; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: radial-gradient(800px circle at var(--mouse-x) var(--mouse-y), rgba(255, 255, 255, 0.15), transparent 40%); opacity: 0; transition: opacity 0.5s; pointer-events: none; z-index: 1; mix-blend-mode: overlay; }
    .card:hover::after { opacity: 1; }
    .card > * { position: relative; z-index: 2; }
    h3 { margin: 0 0 20px 0; font-size: 1.2rem; display: flex; justify-content: space-between; align-items: center; font-weight: 700; }
    .filters { display: flex; gap: 8px; font-size: 0.85rem; }
    .filter-btn { background: transparent; border: 1px solid var(--border); color: var(--text-sub); padding: 4px 12px; border-radius: 12px; cursor: pointer; transition: 0.2s; font-family: inherit; }
    .filter-btn:hover { background: var(--border); }
    .filter-btn.active { background: var(--primary-grad); color: white; border-color: transparent; }
    .chart-box { height: 280px; width: 100%; position: relative; cursor: crosshair; }
    svg { width: 100%; height: 100%; overflow: visible; }
    .line { fill: none; stroke: var(--primary); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .dot { fill: var(--dot-fill); stroke: var(--primary); stroke-width: 2.5; transition: all 0.2s; cursor: pointer; }
    .dot:hover { stroke-width: 4; r: 7; }
    .axis { font-size: 11px; fill: var(--text-sub); font-family: monospace; }
    .grid { stroke: var(--grid); stroke-dasharray: 4; }
    .area-fill { fill: url(#gradientFill); opacity: 0.3; }
    .chart-tooltip { position: absolute; background: var(--tooltip-bg); color: white; padding: 8px 14px; border-radius: 12px; font-size: 0.9rem; pointer-events: none; opacity: 0; transition: opacity 0.2s, top 0.2s, left 0.2s; transform: translate(-50%, -115%); white-space: nowrap; z-index: 10; box-shadow: 0 5px 15px rgba(0,0,0,0.3); text-align: center; }
    .chart-tooltip::after { content: ''; position: absolute; top: 100%; left: 50%; margin-left: -6px; border-width: 6px; border-style: solid; border-color: var(--tooltip-bg) transparent transparent transparent; transition: left 0.2s; }
    .chart-tooltip.is-right { transform: translate(-90%, -115%); } .chart-tooltip.is-right::after { left: 90%; }
    .chart-tooltip.is-left { transform: translate(-10%, -115%); } .chart-tooltip.is-left::after { left: 10%; }
    .tooltip-date { font-size: 0.75rem; color: #dfe6e9; margin-top: 2px; font-family: monospace; }
    .tooltip-note { font-size: 0.8rem; color: #ffeaa7; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 4px; display: block; font-weight: normal; }
    .item { display: flex; justify-content: space-between; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--border); }
    .item:last-child { border-bottom: none; }
    .w-val { font-size: 1.3rem; font-weight: 700; }
    .w-date { font-size: 0.85rem; color: var(--text-sub); margin-top: 2px; }
    .note { font-size: 0.85rem; color: #6c5ce7; background: #e0e0fc; padding: 4px 10px; border-radius: 8px; margin-top: 6px; display: inline-block; font-weight: 500; }
    .actions { display: flex; gap: 10px; }
    .btn-icon { width: 38px; height: 38px; border-radius: 10px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; transition: 0.2s; }
    .btn-edit { background: var(--border); color: var(--text); } .btn-del { background: #ffeaa7; color: #d63031; }
    input, select { width: 100%; padding: 14px; border: 2px solid var(--border); border-radius: 16px; font-size: 16px; outline: none; background: var(--input-bg); margin-bottom: 15px; transition: 0.2s; font-family: inherit; color: var(--text); }
    input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(255,107,107,0.1); }
    .form-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 15px; }
    .btn-main { width: 100%; padding: 16px; background: var(--primary-grad); color: white; border: none; border-radius: 16px; font-weight: 700; font-size: 1.1rem; cursor: pointer; box-shadow: 0 8px 20px rgba(255,107,107,0.25); transition: transform 0.1s; font-family: inherit; }
    .btn-cancel { width: 100%; padding: 12px; background: transparent; color: var(--text-sub); border: none; cursor: pointer; margin-top: 5px; display: none; font-family: inherit; }
    .io-group { display: flex; gap: 10px; margin-top: 20px; }
    .btn-io { flex: 1; padding: 12px; background: var(--border); border: none; border-radius: 12px; color: var(--text-sub); font-weight: 600; cursor: pointer; font-family: inherit; text-align: center; transition: 0.2s; }
    .btn-io:hover { background: #dfe6e9; color: var(--text); }
    .empty { text-align: center; padding: 60px 0; color: var(--text-sub); font-style: italic; font-size: 1.1rem; }
    
    /* Nav Card Style */
    .nav-card { display: flex; justify-content: center; align-items: center; gap: 20px; padding: 20px; margin-top: 20px; }
    .nav-link { text-decoration: none; color: var(--text-sub); font-weight: 600; transition: color 0.2s; font-size: 0.95rem; }
    .nav-link:hover { color: var(--primary); }
    .logout-link { color: #ff7675; }
    .logout-link:hover { color: #d63031; }

    @media (max-width: 600px) { .card { padding: 20px; } .chart-box { height: 240px; } .btn-float-group { top: 15px; right: 15px; } .float-btn { width: 36px; height: 36px; } .nav-card { gap: 15px; } }
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
        const imp = document.getElementById('importTargetCat');
        if(imp) imp.value = currentCat;
        
        updatePageText();
      });
      
      window.addEventListener('langChanged', () => {
        renderApp();
      });

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
        const imp = document.getElementById('importTargetCat');
        if(imp) imp.value = currentCat;
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
                btn.innerText = t('filter_'+f); 
            }
        });

        renderChart(catData);
        renderList(catData);
        setTimeout(initTiltEffect, 50);
      }

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

        tip.innerHTML = \`<strong>\${weight} \${t('unit')}</strong><div class="tooltip-date">\${date}</div>\${noteHtml}\`;
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
        if(data.length < 1) { box.innerHTML = \`<div class="empty">\${t('empty_chart')}</div>\`; return; }
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
        
        const trend = document.getElementById('trend');
        if(trend && data.length > 1) {
           const diff = (data[data.length-1].weight - data[data.length-2].weight).toFixed(2);
           const cls = diff > 0 ? 'trend-up' : 'trend-down';
           const sign = diff > 0 ? '↗ +' : '↘ ';
           trend.innerHTML = \`<span class="\${cls}">\${sign}\${Math.abs(diff)} \${t('unit')}</span>\`;
        } else if(trend) trend.innerHTML = '';
      }

      function renderList(data) {
        const list = document.getElementById('list');
        if(!list) return;
        if(!data.length) { list.innerHTML = \`<div class="empty">\${t('empty_list')}</div>\`; return; }
        const isAdmin = !!document.getElementById('editForm');
        list.innerHTML = [...data].reverse().map(item => {
          const note = item.note ? \`<div class="note">\${item.note}</div>\` : '';
          const actions = isAdmin ? \`
            <div class="actions">
              <button class="btn-icon btn-edit" onclick='startEdit(\${JSON.stringify(item)})'>✏️</button>
              <form action="/api/delete" method="POST" onsubmit="return confirm('\${t('confirm_delete')}')">
                <input type="hidden" name="id" value="\${item.id}">
                <input type="hidden" name="current_cat" value="\${currentCat}">
                <button class="btn-icon btn-del">🗑️</button>
              </form>
            </div>\` : '';
          return \`<div class="item"><div class="item-l"><div class="w-val">\${item.weight} <span style="font-size:0.8rem;font-weight:400;color:var(--text-sub)">\${t('unit')}</span></div><div class="w-date">\${item.date}</div>\${note}</div>\${actions}</div>\`;
        }).join('');
      }

      function startEdit(item) {
        isEditMode = true;
        document.getElementById('formId').value = item.id;
        document.querySelector('input[name="date"]').value = item.date;
        document.querySelector('input[name="weight"]').value = item.weight;
        document.querySelector('input[name="note"]').value = item.note;
        const btn = document.getElementById('submitBtn');
        btn.innerText = t('save_btn');
        btn.style.background = 'linear-gradient(135deg, #0984e3, #74b9ff)';
        document.getElementById('cancelBtn').style.display = 'block';
        document.getElementById('formTitle').innerText = t('manage');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      function cancelEdit() {
        isEditMode = false;
        document.getElementById('editForm').reset();
        document.getElementById('formId').value = '';
        document.querySelector('input[name="date"]').value = new Date().toISOString().split('T')[0];
        const btn = document.getElementById('submitBtn');
        btn.innerText = t('add_btn');
        btn.style.background = ''; 
        document.getElementById('cancelBtn').style.display = 'none';
        document.getElementById('formTitle').innerText = t('new_record');
        const sel = document.getElementById('catSelect');
        if(sel) sel.value = currentCat;
      }
      
      function exportCSV() {
        const d = rawData.filter(x => x.name === currentCat);
        if(!d.length) return alert(t('no_data_export'));
        const csv = "data:text/csv;charset=utf-8,\uFEFFDate,Weight,Name,Note\\n" + d.map(x => \`\${x.date},\${x.weight},\${x.name},\${x.note}\`).join('\\n');
        const a = document.createElement('a');
        a.href = encodeURI(csv); a.download = currentCat+'_records.csv'; a.click();
      }

      function submitImport(input) {
        if(confirm(t('confirm_import'))) {
            input.form.submit();
        } else {
            input.value = '';
        }
      }
    </script>
  `;

  let content = '';
  
  // Button Group (Theme + Lang)
  const floatBtns = `
    <div class="btn-float-group">
        <button id="langToggle" class="float-btn" onclick="toggleLang()">CN</button>
        <button id="themeToggle" class="float-btn" onclick="toggleTheme()">☀️</button>
    </div>
  `;

  const switcher = `
    <div class="cat-switcher">
      <div class="curr-cat" onclick="toggleMenu()">
        <span id="currCatName">Loading...</span>
        <span id="arrowIcon" style="font-size:0.8rem; color:#ff6b6b; transition:0.2s">▼</span>
      </div>
      <div class="cat-list" id="catList"></div>
    </div>
  `;

  if (page === 'home') {
    // Wrap login link in a nav card
    const adminLink = isLoggedIn ? `<a href="/add" class="nav-link" data-i18n="admin_link">🔐 Dashboard</a>` : `<a href="/login" class="nav-link" data-i18n="login_link">👤 Login</a>`;
    
    content = `
      ${floatBtns}
      ${switcher}
      <div class="card">
        <h3>
            <span><span data-i18n="trend">Weight Trend</span> <span id="trend"></span></span>
            <div class="filters">
                <button id="btn-3m" class="filter-btn" onclick="setFilter('3m')" data-i18n="filter_3m">3M</button>
                <button id="btn-6m" class="filter-btn" onclick="setFilter('6m')" data-i18n="filter_6m">6M</button>
                <button id="btn-all" class="filter-btn active" onclick="setFilter('all')" data-i18n="filter_all">All</button>
            </div>
        </h3>
        <div id="chart" class="chart-box"></div>
      </div>
      <div class="card">
        <h3 data-i18n="history">History</h3>
        <div id="list"></div>
      </div>
      <div class="card nav-card">
        ${adminLink}
      </div>
    `;
  } else {
    const today = new Date().toISOString().split('T')[0];
    content = `
      ${floatBtns}
      ${switcher}
      <div class="card">
        <h3 id="formTitle" data-i18n="new_record">New Record</h3>
        <form action="/api/save" method="POST" id="editForm">
          <input type="hidden" name="id" id="formId">
          <input type="hidden" name="current_cat" value="${allData.length>0?allData[0].name:''}" id="currentCatInput">
          <select name="name" id="catSelect" onchange="switchCat(this.value)" style="display:none">${catNames.map(n=>`<option value="${n}">${n}</option>`).join('')}</select>
          <div class="form-grid">
            <input type="date" name="date" value="${today}" required>
            <input type="number" name="weight" step="0.01" data-i18n="placeholder_weight" placeholder="Weight" required>
          </div>
          <input type="text" name="note" data-i18n="placeholder_note" placeholder="Note" maxlength="50">
          <button type="submit" class="btn-main" id="submitBtn" data-i18n="add_btn">Add</button>
          <button type="button" class="btn-cancel" id="cancelBtn" onclick="cancelEdit()" data-i18n="cancel_btn">Cancel</button>
        </form>
      </div>
      <div class="card">
        <h3>
            <span data-i18n="manage">Manage</span>
            <div class="filters">
                <button id="btn-3m" class="filter-btn" onclick="setFilter('3m')" data-i18n="filter_3m">3M</button>
                <button id="btn-6m" class="filter-btn" onclick="setFilter('6m')" data-i18n="filter_6m">6M</button>
                <button id="btn-all" class="filter-btn active" onclick="setFilter('all')" data-i18n="filter_all">All</button>
            </div>
        </h3>
        <div id="list"></div>
        <div class="io-group">
            <form action="/api/import" method="POST" enctype="multipart/form-data" style="flex:1">
               <input type="hidden" name="target_name" id="importTargetCat">
               <input type="file" name="csv_file" accept=".csv" onchange="submitImport(this)" style="display:none" id="importFile">
               <button type="button" onclick="document.getElementById('importFile').click()" class="btn-io" data-i18n="import_btn">Import</button>
            </form>
            <button onclick="exportCSV()" class="btn-io" data-i18n="export_btn">Export</button>
        </div>
      </div>
      <div class="card nav-card">
        <a href="/" class="nav-link" data-i18n="back_home">🏠 Home</a>
        <a href="/logout" class="nav-link logout-link" data-i18n="logout">🚫 Logout</a>
      </div>
    `;
  }

  return `<!DOCTYPE html><html lang="zh-CN"><head><title>Cat Weight</title>${SHARED_HEAD}<link rel="manifest" href="${manifestUri}"><style>${css}</style></head><body><div class="container">${content}</div>${js}</body></html>`;
}
