/**
 * Cloudflare Worker - Purrfit (v20.15 Dark Mode Glow Fix)
 * 1. Visual: Customized dark mode glow to be subtle white/light instead of red.
 * 2. Visual: Light mode glow remains reddish.
 * 3. Base: v20.14 (Glow + Flex Footer).
 */

// ==========================================
// 1. CONSTANTS & CORE LOGIC
// ==========================================
const STORAGE_KEY = 'weights';
const CONFIG_KEY = 'config';
const SESSION_COOKIE_NAME = 'cat_session';
const GITHUB_URL = 'https://github.com/zaocat/Purrfit';

// 【配置】图标地址
const ICON_URL = 'https://img.icons8.com/?size=100&id=ftgzqv4ry3uF&format=png&color=000000'; 

const DEFAULT_TITLE_ZH = 'Purrfit 喵体';
const DEFAULT_TITLE_EN = 'Purrfit';
const DEFAULT_FAVICON = '/app-icon.png';

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // ============================================================
  // 【修复逻辑】图标代理与 Manifest
  // ============================================================

  if (path === '/app-icon.png') {
    try {
      const response = await fetch(ICON_URL);
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*'); 
      newHeaders.set('Cache-Control', 'public, max-age=86400'); 
      newHeaders.set('Content-Type', 'image/png');
      return new Response(response.body, {
        status: response.status,
        headers: newHeaders
      });
    } catch (e) {
      return new Response('Icon Error', { status: 500 });
    }
  }

  if (path === '/manifest.json') {
    let configTitle = "Purrfit";
    try {
        const config = await env.CAT_KV.get(CONFIG_KEY, 'json');
        if (config && config.title_en) configTitle = config.title_en;
    } catch(e) {}

    const manifest = {
      name: configTitle,
      short_name: "Purrfit",
      start_url: ".",
      display: "standalone",
      background_color: "#fff9f5",
      theme_color: "#ff6b6b",
      icons: [
        {
          src: "/app-icon.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any maskable"
        },
        {
          src: "/app-icon.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable"
        }
      ]
    };
    return new Response(JSON.stringify(manifest), {
      headers: { 
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // ============================================================
  // 【业务逻辑】KV 数据与路由
  // ============================================================

  if (!env.CAT_KV) throw new Error("CAT_KV binding missing.");

  let config = await env.CAT_KV.get(CONFIG_KEY, 'json');
  let allData = [];
  try {
      const raw = await env.CAT_KV.get(STORAGE_KEY);
      if(raw) allData = JSON.parse(raw);
  } catch(e) {}

  if (!config) {
    const envCats = (env.CAT_NAMES || 'My Cat').split(',').map(s => s.trim()).filter(s => s);
    config = { title_zh: DEFAULT_TITLE_ZH, title_en: DEFAULT_TITLE_EN, favicon: DEFAULT_FAVICON, cats: envCats };
  }
  if (!config.cats || config.cats.length === 0) {
      config.cats = ['My Cat'];
      await env.CAT_KV.put(CONFIG_KEY, JSON.stringify(config));
  }

  const adminUser = env.ADMIN_USER || 'admin';
  const adminPass = env.ADMIN_PASS || 'password';

  // Routes
  if (path === '/login' && request.method === 'GET') {
    return new Response(renderLogin(config), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
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
    }
    return Response.redirect(url.origin + '/login?error=1', 302);
  }

  if (path === '/logout') {
    const headers = new Headers();
    headers.append('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0`);
    headers.append('Location', '/');
    return new Response(null, { status: 302, headers });
  }

  if (path === '/api/reset' && request.method === 'POST') {
      const cookie = request.headers.get('Cookie');
      const validToken = safeBtoa(`${adminUser}:${adminPass}`);
      if (!cookie || !cookie.includes(`${SESSION_COOKIE_NAME}=${validToken}`)) return Response.redirect(url.origin + '/login', 302);
      await env.CAT_KV.delete(STORAGE_KEY);
      await env.CAT_KV.delete(CONFIG_KEY);
      return Response.redirect(url.origin + '/add', 302);
  }

  const protectedPaths = ['/add', '/api/save', '/api/delete', '/api/import', '/api/settings', '/api/rename_cat'];
  if (protectedPaths.includes(path)) {
    const cookie = request.headers.get('Cookie');
    const validToken = safeBtoa(`${adminUser}:${adminPass}`);
    if (!cookie || !cookie.includes(`${SESSION_COOKIE_NAME}=${validToken}`)) {
      return Response.redirect(url.origin + '/login', 302);
    }
  }

  if (path === '/add' && !url.searchParams.get('cat')) {
      const defaultCat = config.cats[0] || 'My Cat';
      return Response.redirect(`${url.origin}/add?cat=${encodeURIComponent(defaultCat)}`, 302);
  }

  if (path === '/api/save' && request.method === 'POST') {
    const formData = await request.formData();
    const id = formData.get('id');
    const date = formData.get('date');
    const weight = parseFloat(formData.get('weight'));
    const name = formData.get('name');
    const note = formData.get('note') || '';
    const currentCat = formData.get('current_cat') || name || config.cats[0]; 
    
    if (currentCat && !config.cats.includes(currentCat)) {
        config.cats.push(currentCat);
        await env.CAT_KV.put(CONFIG_KEY, JSON.stringify(config));
    }
    if (!date || isNaN(weight)) return new Response('Invalid', { status: 400 });
    
    if (id) {
      const index = allData.findIndex(item => item.id === id);
      if (indexindex !== -1) allData[index] = { ...allData[index], date, weight, name: currentCat, note };
    } else {
      allData.push({ id: Date.now().toString(), date, weight, name: currentCat, note });
    }
    allData.sort((a, b) => new Date(a.date) - new Date(b.date));
    await env.CAT_KV.put(STORAGE_KEY, JSON.stringify(allData));
    return Response.redirect(`${url.origin}/add?cat=${encodeURIComponent(currentCat)}&t=${Date.now()}`, 303);
  }

  if (path === '/api/delete' && request.method === 'POST') {
    const formData = await request.formData();
    const id = formData.get('id');
    const currentCat = formData.get('current_cat') || config.cats[0];
    allData = allData.filter(item => item.id !== id);
    await env.CAT_KV.put(STORAGE_KEY, JSON.stringify(allData));
    return Response.redirect(`${url.origin}/add?cat=${encodeURIComponent(currentCat)}&t=${Date.now()}`, 303);
  }

  if (path === '/api/rename_cat' && request.method === 'POST') {
    const formData = await request.formData();
    const oldName = formData.get('old_name');
    const newName = formData.get('new_name');
    if (oldName && newName && oldName !== newName) {
        let newCats = config.cats.filter(c => c !== oldName);
        if (!newCats.includes(newName)) newCats.push(newName);
        if(newCats.length === 0) newCats = ['My Cat'];
        config.cats = newCats;
        await env.CAT_KV.put(CONFIG_KEY, JSON.stringify(config));
        
        let updatedCount = 0;
        allData = allData.map(record => {
            if (record.name === oldName) { updatedCount++; return { ...record, name: newName }; }
            return record;
        });
        if (updatedCount > 0) await env.CAT_KV.put(STORAGE_KEY, JSON.stringify(allData));
    }
    return Response.redirect(`${url.origin}/add?cat=${encodeURIComponent(newName)}&t=${Date.now()}`, 303);
  }

  if (path === '/api/import' && request.method === 'POST') {
    const formData = await request.formData();
    const file = formData.get('csv_file');
    const currentCat = formData.get('target_name') || config.cats[0];
    if (!file || typeof file === 'string') return new Response('File required', {status: 400});
    const text = await file.text();
    const lines = text.split(/\r?\n/);
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
        else if (parts.length >= 4) { name = parts[2].trim() || currentCat; note = parts.slice(3).join(',').trim(); }
        
        if(name && !config.cats.includes(name)) {
            config.cats.push(name);
            await env.CAT_KV.put(CONFIG_KEY, JSON.stringify(config));
        }
        const existingIdx = allData.findIndex(d => d.date === date && d.name === name);
        if (existingIdx !== -1) allData[existingIdx] = { ...allData[existingIdx], weight, note };
        else allData.push({ id: Date.now().toString() + Math.random().toString().substr(2,5), date, weight, name, note });
    }
    allData.sort((a, b) => new Date(a.date) - new Date(b.date));
    await env.CAT_KV.put(STORAGE_KEY, JSON.stringify(allData));
    return Response.redirect(`${url.origin}/add?cat=${encodeURIComponent(currentCat)}&t=${Date.now()}`, 303);
  }

  if (path === '/api/settings' && request.method === 'POST') {
    const formData = await request.formData();
    const rawCats = formData.get('cats_list').split(',').map(s => s.trim()).filter(s => s);
    const validCats = rawCats.length > 0 ? rawCats : ['My Cat'];
    const newConfig = {
        title_zh: formData.get('title_zh'), title_en: formData.get('title_en'), favicon: formData.get('favicon'),
        cats: validCats
    };
    await env.CAT_KV.put(CONFIG_KEY, JSON.stringify(newConfig));
    return Response.redirect(`${url.origin}/add?t=${Date.now()}`, 303);
  }

  const cookie = request.headers.get('Cookie');
  const validToken = safeBtoa(`${adminUser}:${adminPass}`);
  const isLoggedIn = cookie && cookie.includes(`${SESSION_COOKIE_NAME}=${validToken}`);
  const pageType = path === '/add' ? 'admin' : 'home';
  let currentCatName = url.searchParams.get('cat') || config.cats[0];
  if (config.cats.length > 0 && !config.cats.includes(currentCatName)) currentCatName = config.cats[0];

  return new Response(renderHTML(allData, pageType, config, isLoggedIn, currentCatName), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

// ==========================================
// 2. UTILITY & HTML GENERATORS
// ==========================================

function safeBtoa(str) {
  try {
    const bytes = new TextEncoder().encode(str);
    const binString = String.fromCodePoint(...bytes);
    return btoa(binString);
  } catch (e) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (m, p1) => String.fromCharCode('0x' + p1)));
  }
}

function getI18nData() {
  return {
    zh: {
      login_title: "铲屎官登录", username: "用户名", password: "密码", login_btn: "芝麻开门", back_home: "← 返回首页", login_err: "账号或密码错误",
      trend: "📈 体重走势", filter_3m: "近3月", filter_6m: "近半年", filter_all: "全部", history: "📅 历史记录", manage: "📝 数据管理",
      new_record: "✨ 新记录", add_btn: "✨ 添加记录", save_btn: "💾 保存修改", cancel_btn: "取消",
      import_btn: "📤 导入 CSV", export_btn: "📥 导出 CSV", logout: "🚫 退出登录", login_link: "👤 铲屎官登录", admin_link: "🔐 进入后台",
      empty_chart: "此时段无数据", empty_list: "暂无记录", confirm_delete: "确定要删除这条记录吗？", confirm_import: "导入将合并数据，重复日期将被覆盖。继续？",
      no_data_export: "没有数据可导出", placeholder_weight: "体重 (kg)", placeholder_note: "备注 (例如：换粮，生病)", unit: "kg",
      settings_btn: "⚙️ 网站设置", settings_title: "⚙️ 全局设置", lbl_title_zh: "中文标题", lbl_title_en: "英文标题", lbl_favicon: "图标 URL",
      lbl_cats: "猫咪管理", add_cat_placeholder: "输入名字...", save_settings: "💾 保存设置",
      footer_github: "GitHub 开源",
      rename_title: "✏️ 重命名猫咪", rename_desc: "将同步更新该猫咪的所有历史数据。", rename_placeholder: "新名字", rename_btn: "确认修改",
      reset_btn: "⚠️ 重置所有数据", reset_confirm: "警告：这将清空所有配置和体重记录，且无法恢复！确定要重置吗？",
      delete_cat_title: "🗑️ 删除猫咪", delete_cat_desc: "确定要删除这个标签吗？(需点击保存生效)", delete_confirm_btn: "确定删除",
      prev_page: "上一页", next_page: "下一页", switched_to: "已切换到：",
      refresh_tip: "💡 若数据未显示，请点击顶部重新选择"
    },
    en: {
      login_title: "Admin Login", username: "Username", password: "Password", login_btn: "Login", back_home: "← Back to Home", login_err: "Invalid credentials",
      trend: "📈 Weight Trend", filter_3m: "3 Months", filter_6m: "6 Months", filter_all: "All", history: "📅 History", manage: "📝 Data Management",
      new_record: "✨ New Record", add_btn: "✨ Add Record", save_btn: "💾 Save Changes", cancel_btn: "Cancel",
      import_btn: "📤 Import CSV", export_btn: "📥 Export CSV", logout: "🚫 Logout", login_link: "👤 Admin Login", admin_link: "🔐 Dashboard",
      empty_chart: "No data in this period", empty_list: "No records found", confirm_delete: "Delete this record?", confirm_import: "Import will merge data. Overwrite duplicates?",
      no_data_export: "No data to export", placeholder_weight: "Weight (kg)", placeholder_note: "Note (e.g. diet change)", unit: "kg",
      settings_btn: "⚙️ Settings", settings_title: "⚙️ Global Settings", lbl_title_zh: "CN Title", lbl_title_en: "EN Title", lbl_favicon: "Favicon URL",
      lbl_cats: "Manage Cats", add_cat_placeholder: "Type name...", save_settings: "💾 Save Settings",
      footer_github: "Open Source",
      rename_title: "✏️ Rename Cat", rename_desc: "This will update all historical records.", rename_placeholder: "New Name", rename_btn: "Confirm",
      remove_cat_confirm: "Remove this cat tag? (Data remains but hidden)",
      reset_btn: "⚠️ Factory Reset", reset_confirm: "WARNING: This will wipe ALL data and configs permanently! Are you sure?",
      delete_cat_title: "🗑️ Delete Cat", delete_cat_desc: "Remove this tag? Data remains but will be hidden.", delete_confirm_btn: "Confirm Delete",
      prev_page: "Prev", next_page: "Next", switched_to: "Switched to: ",
      refresh_tip: "💡 Data hidden? Re-select cat above"
    }
  };
}

function getCss() {
  return `
  <style>
    :root { 
        --bg-grad: linear-gradient(135deg, #fff9f5 0%, #fdfbf7 100%); 
        --text: #2d3436; --text-sub: #636e72; --card-bg: rgba(255, 255, 255, 0.95); 
        --border: #f1f2f6; --input-bg: #fdfdfd; --grid: #f1f2f6; 
        --shadow: rgba(0,0,0,0.06); --tooltip-bg: rgba(45, 52, 54, 0.95); 
        --primary: #ff6b6b; --primary-grad: linear-gradient(135deg, #ff6b6b 0%, #ff8e8e 100%); 
        --dot-fill: #fff;
        --pill-inactive-bg: #f5f6fa; --pill-inactive-text: #636e72;
        /* Default Light Mode Glow (Reddish) */
        --glow-color: rgba(255, 107, 107, 0.08);
    }
    html.dark { 
        --bg-grad: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); 
        --text: #f1f5f9; --text-sub: #94a3b8; --card-bg: rgba(30, 41, 59, 0.85); 
        --border: #334155; --input-bg: #1e293b; --grid: #334155; 
        --shadow: rgba(0,0,0,0.4); --tooltip-bg: rgba(0, 0, 0, 0.95); --dot-fill: #1e293b;
        --pill-inactive-bg: #1e293b; --pill-inactive-text: #94a3b8;
        /* Dark Mode Glow (Subtle White/Light) */
        --glow-color: rgba(255, 255, 255, 0.06);
    }
    html, body { height: 100%; margin: 0; padding: 0; overflow-x: hidden; }
    body { 
        font-family: 'Varela Round', sans-serif; 
        background: var(--bg-grad); 
        background-attachment: fixed; 
        color: var(--text); 
        transition: 0.3s; 
        min-height: 100dvh; 
        display: flex;
        flex-direction: column;
    }
    
    .container { max-width: 900px; margin: 0 auto; position: relative; padding: 25px; width: 100%; box-sizing: border-box; flex: 1; }

    /* Controls */
    .top-controls { position: absolute; top: 25px; right: 25px; display: flex; gap: 10px; z-index: 100; }
    .control-btn { background: var(--card-bg); border: 1px solid var(--border); width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.85rem; color: var(--text); transition: 0.2s; box-shadow: 0 4px 12px var(--shadow); backdrop-filter: blur(5px); font-weight: 700; }
    .control-btn:hover { transform: scale(1.1); color: var(--primary); border-color: var(--primary); }
    @media (max-width: 600px) { .top-controls { top: 15px; right: 15px; } }

    /* === CARD WITH DYNAMIC GLOW EFFECT === */
    .card { 
        background: var(--card-bg); 
        border-radius: 24px; 
        padding: 28px; 
        margin-bottom: 25px; 
        box-shadow: 0 10px 30px -10px var(--shadow); 
        border: 1px solid var(--border); 
        position: relative; 
        overflow: hidden; 
        transform-style: preserve-3d; 
        transition: transform 0.1s ease, box-shadow 0.2s ease; 
        backdrop-filter: blur(12px); 
        width: 100%; 
        box-sizing: border-box; 
    }
    /* Glow pseudo-element uses variable color */
    .card::after { 
        content: ""; 
        position: absolute; 
        top: 0; left: 0; right: 0; bottom: 0; 
        background: radial-gradient(800px circle at var(--mouse-x) var(--mouse-y), var(--glow-color), transparent 40%); 
        opacity: 0; 
        transition: opacity 0.5s; 
        pointer-events: none; 
        z-index: 1; 
    }
    .card:hover::after { opacity: 1; }
    @media (max-width: 600px) { .card { padding: 20px; } }

    /* Accordion */
    .cat-header-card { display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: 0.3s; padding: 12px 20px; min-height: 40px; }
    .cat-title-toggle { font-size: 1.4rem; font-weight: 800; display: flex; align-items: center; gap: 8px; color: var(--text); user-select: none; }
    .cat-title-toggle .arrow { font-size: 0.8rem; color: var(--primary); transition: transform 0.3s; }
    .cat-title-toggle:hover .arrow { transform: translateY(2px); }
    .cat-header-card.open .arrow { transform: rotate(180deg); }
    .cat-pills-area { display: none; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 12px; padding-top: 15px; border-top: 1px solid rgba(0,0,0,0.05); width: 100%; animation: slideDown 0.3s ease-out; }
    .dark .cat-pills-area { border-top-color: rgba(255,255,255,0.1); }
    .cat-header-card.open .cat-pills-area { display: flex; }
    @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
    .cat-pill { border: none; padding: 8px 24px; border-radius: 99px; font-size: 0.95rem; font-weight: 700; cursor: pointer; transition: 0.2s; font-family: inherit; background: var(--pill-inactive-bg); color: var(--pill-inactive-text); border: 2px solid transparent; }
    .cat-pill:hover { transform: translateY(-2px); color: var(--primary); box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
    .cat-pill.active { background: var(--primary-grad); color: white; box-shadow: 0 5px 15px rgba(255,107,107,0.3); }

    /* Inputs */
    input, select:not(.cat-select) { width: 100%; padding: 14px; border: 2px solid var(--border); border-radius: 16px; font-size: 16px; outline: none; background: var(--input-bg); margin-bottom: 15px; color: var(--text); box-sizing: border-box; font-family: inherit; transition: 0.2s; }
    input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(255,107,107,0.15); }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }

    /* Buttons */
    .btn-main { width: 100%; padding: 16px; background: var(--primary-grad); color: white; border: none; border-radius: 16px; font-weight: 700; font-size: 1.1rem; cursor: pointer; box-shadow: 0 8px 20px rgba(255,107,107,0.25); transition: transform 0.1s; font-family: inherit; }
    .btn-main:active { transform: scale(0.98); }
    .btn-cancel { width: 100%; padding: 12px; background: transparent; color: var(--text-sub); border: none; cursor: pointer; margin-top: 5px; display: none; font-family: inherit; font-weight: 600; }
    .io-group { display: flex; gap: 15px; margin-top: 20px; }
    .btn-io { width: 100%; padding: 12px; background: var(--border); border: none; border-radius: 12px; color: var(--text-sub); font-weight: 600; cursor: pointer; font-family: inherit; transition: 0.2s; }
    .btn-io:hover { background: #dfe6e9; color: var(--text); }

    /* Headers & Filters */
    h3 { margin: 0 0 20px 0; font-size: 1.2rem; font-weight: 800; display: flex; justify-content: space-between; align-items: center; letter-spacing: -0.5px; }
    .filters { display: flex; gap: 8px; font-size: 0.85rem; }
    .filter-btn { background: transparent; border: 1px solid var(--border); color: var(--text-sub); padding: 4px 12px; border-radius: 10px; cursor: pointer; transition: 0.2s; font-family: inherit; font-weight: 600; }
    .filter-btn:hover { background: var(--border); }
    .filter-btn.active { background: var(--primary-grad); color: white; border-color: transparent; box-shadow: 0 2px 8px rgba(255,107,107,0.2); }
    .settings-btn-style { background: var(--input-bg); border: 1px solid var(--border); color: var(--text); box-shadow: none; font-weight: 600; display: flex; align-items: center; gap: 5px; padding: 6px 14px; }
    .settings-btn-style:hover { border-color: var(--primary); color: var(--primary); }

    /* Chart */
    .chart-box { height: 280px; width: 100%; position: relative; cursor: crosshair; }
    svg { width: 100%; height: 100%; overflow: visible; }
    .line { fill: none; stroke: var(--primary); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .dot { fill: var(--card-bg); stroke: var(--primary); stroke-width: 2.5px; r: 3.5; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); cursor: pointer; }
    .dot:hover { r: 6; stroke-width: 3px; fill: var(--primary); }
    .axis { font-size: 11px; fill: var(--text-sub); font-family: monospace; }
    .grid { stroke: var(--grid); stroke-dasharray: 4; }
    .area-fill { fill: url(#gradientFill); opacity: 0.3; }
    
    /* Tooltip */
    .chart-tooltip { position: absolute; top: 0; left: 0; background: var(--tooltip-bg); color: white; padding: 10px 14px; border-radius: 12px; font-size: 0.9rem; pointer-events: none; opacity: 0; transition: opacity 0.2s; transform: translate(-50%, -115%); z-index: 10000; box-shadow: 0 5px 15px rgba(0,0,0,0.3); text-align: left; min-width: 120px; }
    .chart-tooltip::after { content: ''; position: absolute; top: 100%; left: 50%; margin-left: -6px; border-width: 6px; border-style: solid; border-color: var(--tooltip-bg) transparent transparent transparent; transition: left 0.2s; }
    .chart-tooltip.shift-left { transform: translate(-90%, -115%); }
    .chart-tooltip.shift-left::after { left: 90%; }
    .chart-tooltip.shift-right { transform: translate(-10%, -115%); }
    .chart-tooltip.shift-right::after { left: 10%; }
    .tooltip-date { font-size: 0.8rem; opacity: 0.8; margin-bottom: 4px; }
    .tooltip-note { margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.2); color: #ffeaa7; font-size: 0.85rem; line-height: 1.4; }

    /* List */
    .item { display: flex; justify-content: space-between; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--border); }
    .item:last-child { border-bottom: none; }
    .w-val { font-size: 1.3rem; font-weight: 700; color: var(--text); }
    .w-date { font-size: 0.85rem; color: var(--text-sub); margin-top: 2px; }
    .note { font-size: 0.85rem; color: #6c5ce7; background: rgba(108, 92, 231, 0.1); padding: 4px 10px; border-radius: 8px; margin-top: 6px; display: inline-block; font-weight: 600; }
    .actions { display: flex; gap: 8px; align-items: center; } 
    .btn-icon { width: 36px; height: 36px; border-radius: 12px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; transition: 0.2s; }
    .btn-icon:hover { transform: scale(1.1); }
    .btn-edit { background: var(--border); color: var(--text); } 
    .btn-del { background: rgba(255, 118, 117, 0.15); color: #d63031; }
    .empty { text-align: center; padding: 60px 0; color: var(--text-sub); font-style: italic; font-size: 1.1rem; }
    .pagination { display: flex; justify-content: center; align-items: center; gap: 20px; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border); }
    .page-btn { padding: 8px 24px; border-radius: 12px; border: 1px solid var(--border); background: var(--card-bg); cursor: pointer; color: var(--text-sub); font-size: 0.95rem; transition: 0.2s; font-weight: 700; }
    .page-btn:hover:not(:disabled) { background: var(--primary); color: white; border-color: var(--primary); transform: translateY(-1px); box-shadow: 0 4px 10px rgba(255,107,107,0.2); }

    /* Footer */
    .app-footer { display: flex; justify-content: space-between; align-items: center; width: 100%; max-width: 900px; margin: 0 auto; margin-top: auto; padding: 20px 25px; box-sizing: border-box; color: var(--text-sub); font-size: 0.8rem; opacity: 0.7; flex-shrink: 0; }
    .footer-link { display: inline-flex; align-items: center; gap: 6px; color: var(--text); text-decoration: none; padding: 6px 14px; border-radius: 99px; background: var(--card-bg); border: 1px solid var(--border); box-shadow: 0 2px 8px var(--shadow); font-weight: 600; font-size: 0.75rem; transition: 0.2s; height: 28px; }
    .footer-link:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); color: var(--primary); border-color: var(--primary); }
    .footer-link svg { fill: currentColor; width: 14px; height: 14px; }

    /* Modals & Tags */
    .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); z-index: 200; backdrop-filter: blur(8px); }
    .modal { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 400px; background: var(--card-bg); border-radius: 24px; padding: 30px; border: 1px solid var(--border); box-shadow: 0 20px 60px rgba(0,0,0,0.2); animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
    @keyframes popIn { from { opacity: 0; transform: translate(-50%, -45%) scale(0.95); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
    .modal h3 { margin-top: 0; }
    .tags-container { display: flex; flex-wrap: wrap; gap: 8px; border: 2px solid var(--border); border-radius: 16px; padding: 10px; background: var(--input-bg); min-height: 52px; align-items: center; margin-bottom: 20px; }
    .tag-chip { background: #ff7675; color: white; padding: 6px 14px; border-radius: 99px; font-size: 0.95rem; font-weight: 700; display: flex; align-items: center; gap: 8px; box-shadow: 0 3px 8px rgba(255,118,117,0.3); transition: 0.2s; }
    .tag-chip:hover { transform: translateY(-1px); box-shadow: 0 5px 12px rgba(255,118,117,0.5); }
    .tag-actions { display: flex; gap: 8px; margin-left: 4px; padding-left: 8px; border-left: 1px solid rgba(255,255,255,0.4); }
    .tag-icon { cursor: pointer; opacity: 0.9; font-size: 0.9rem; display: flex; align-items: center; color: white; } 
    .tag-icon:hover { transform: scale(1.2); }
    .tag-input-group { flex-grow: 1; display: flex; align-items: center; gap: 5px; }
    .tag-input { border: none !important; box-shadow: none !important; background: transparent !important; padding: 5px !important; margin: 0 !important; }
    .tag-add-btn { background: var(--primary); color: white; border: none; width: 32px; height: 32px; border-radius: 10px; cursor: pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
    .tag-add-btn:hover { transform: scale(1.1); }
    .btn-danger { background: rgba(255, 118, 117, 0.15); color: #d63031; border: none; width: 100%; margin-top: 15px; padding: 12px; border-radius: 12px; cursor: pointer; font-weight: bold; transition: 0.2s; }
    .btn-danger:hover { background: #d63031; color: white; }
    .nav-card { display: flex; justify-content: center; align-items: center; gap: 20px; padding: 20px; margin-top: 20px; }
    .nav-link { text-decoration: none; color: var(--text-sub); font-weight: 600; transition: color 0.2s; font-size: 0.95rem; }
    .nav-link:hover { color: var(--primary); }
    .logout-link { color: #ff7675; }
    .logout-link:hover { color: #d63031; }

    /* Login */
    .login-body { display: flex; justify-content: center; align-items: center; min-height: 100vh; flex-direction: column; background: var(--bg-grad); margin: 0; }
    .login-card { text-align: center; width: 100%; max-width: 400px; margin: 20px; padding: 50px 40px; border-radius: 32px; background: var(--card-bg); box-shadow: 0 20px 60px rgba(0,0,0,0.1); border: 1px solid var(--border); backdrop-filter: blur(15px); }
    .login-card h1 { font-size: 2.2rem; margin-bottom: 35px; background: var(--primary-grad); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 900; }
    .login-card input { padding: 16px; font-size: 1rem; margin-bottom: 20px; border-radius: 14px; background: rgba(0,0,0,0.03); border: 1px solid transparent; }
    .login-card input:focus { background: white; border-color: var(--primary); box-shadow: 0 4px 15px rgba(255,107,107,0.15); }
    .login-card button { margin-top: 10px; padding: 18px; font-size: 1.1rem; border-radius: 14px; }
    .login-card .back { margin-top: 30px; font-size: 0.9rem; opacity: 0.7; }

    /* Toast */
    .toast { position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.85); color: white; padding: 12px 24px; border-radius: 50px; font-size: 0.95rem; z-index: 2000; animation: floatUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); pointer-events: none; backdrop-filter: blur(8px); box-shadow: 0 10px 30px rgba(0,0,0,0.3); font-weight: 600; letter-spacing: 0.5px; }
    @keyframes floatUp { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }
  </style>
  `;
}

function getHead(config) {
  return `
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=0,viewport-fit=cover">
  <link rel="icon" type="image/png" href="${config.favicon}">
  <link rel="shortcut icon" type="image/png" href="${config.favicon}">
  <link rel="apple-touch-icon" href="${config.favicon}">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="mobile-web-app-capable" content="yes">
  <link rel="manifest" href="/manifest.json">
  <link href="https://fonts.googleapis.com/css2?family=Varela+Round&display=swap" rel="stylesheet">
  ${getCss()}
  <script>
    (function() {
        const saved = localStorage.getItem('theme');
        const sys = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (saved === 'dark' || (!saved && sys)) { document.documentElement.classList.add('dark'); }
    })();
  </script>
  `;
}

function getFooterHTML() {
  return `
    <footer class="app-footer">
        <div class="footer-left">© 2025 Purrfit</div>
        <a href="${GITHUB_URL}" target="_blank" class="footer-link">
            <svg viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            <span style="margin-left: 5px;">Open Source</span>
        </a>
    </footer>
  `;
}

// ==========================================
// 4. RENDERERS
// ==========================================

function renderLogin(config) {
  const loginScript = `
  <script>
    const i18nData = ${JSON.stringify(getI18nData())};
    let curLang = localStorage.getItem('lang') || 'zh';
    function t(key) { return i18nData[curLang][key] || key; }
    function updatePageText() {
        document.title = curLang === 'zh' ? '${config.title_zh}' : '${config.title_en}';
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if(i18nData[curLang][key]) {
                if(el.tagName === 'INPUT') el.placeholder = i18nData[curLang][key];
                else el.innerText = i18nData[curLang][key];
            }
        });
    }
    window.onload = function() { updatePageText(); if(window.location.search.includes('error=1')) document.getElementById('errMsg').style.display = 'block'; }
  </script>`;
  return `<!DOCTYPE html><html><head>${getHead(config)}<title>Login</title></head><body class="login-body"><div class="top-controls"><button class="control-btn" onclick="document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');">☀️</button></div><div class="login-card"><h1 data-i18n="login_title">${config.title_zh}</h1><div id="errMsg" class="err" style="display:none" data-i18n="login_err">Invalid credentials</div><form action="/auth/login" method="POST"><input type="text" name="username" data-i18n="username" placeholder="Username" required><input type="password" name="password" data-i18n="password" placeholder="Password" required><button type="submit" class="btn-main" data-i18n="login_btn">Login</button></form><a href="/" class="back" data-i18n="back_home">← Back</a></div>${getFooterHTML()}${loginScript}</body></html>`;
}

function renderHTML(allData, page, config, isLoggedIn, currentCatName) {
  const safeData = JSON.stringify(allData);
  const safeConfig = JSON.stringify(config);
  const safeCurrentCat = JSON.stringify(currentCatName); 

  // Accordion Switcher
  const switcher = `
    <div class="cat-header-card card" onclick="window.toggleCatMenu(this)">
        <div class="cat-title-toggle">
            ${currentCatName} <span class="arrow">▼</span>
        </div>
        <div class="cat-pills-area" onclick="event.stopPropagation()">
            ${config.cats.map(n => `<button class="cat-pill ${n===currentCatName?'active':''}" onclick="window.switchCat('${n}')">${n}</button>`).join('')}
        </div>
    </div>
  `;

  // HTML Modals
  const settingsModal = `
    <div id="settingsModal" class="modal-overlay">
        <div class="modal">
            <div class="modal-header">
                <h3 style="margin:0" data-i18n="settings_title">Global Settings</h3>
                <div class="close-icon" onclick="window.closeSettings()">×</div>
            </div>
            <form action="/api/settings" method="POST">
                <label style="display:block;margin-bottom:5px;font-size:0.9rem;color:var(--text-sub)" data-i18n="lbl_title_zh">Title (ZH)</label>
                <input type="text" name="title_zh" value="${config.title_zh}" required>
                <label style="display:block;margin-bottom:5px;font-size:0.9rem;color:var(--text-sub)" data-i18n="lbl_title_en">Title (EN)</label>
                <input type="text" name="title_en" value="${config.title_en}" required>
                <label style="display:block;margin-bottom:5px;font-size:0.9rem;color:var(--text-sub)" data-i18n="lbl_favicon">Favicon URL</label>
                <input type="text" name="favicon" value="${config.favicon}" required>
                <label style="display:block;margin-bottom:5px;font-size:0.9rem;color:var(--text-sub)" data-i18n="lbl_cats">Manage Cats</label>
                <div id="catTags" class="tags-container">
                    <div class="tag-input-group">
                        <input type="text" id="catInput" class="tag-input" data-i18n="add_cat_placeholder" placeholder="Add...">
                        <button type="button" class="tag-add-btn" onclick="window.addTagFromInput()">+</button>
                    </div>
                </div>
                <input type="hidden" name="cats_list" id="catsListInput">
                <button type="submit" class="btn-main" onclick="window.addTagFromInput()" data-i18n="save_settings">Save</button>
                <button type="button" class="btn-cancel" style="display:block" onclick="window.closeSettings()" data-i18n="cancel_btn">Cancel</button>
            </form>
            <hr style="border:0;border-top:1px solid var(--border);margin:20px 0">
            <form action="/api/reset" method="POST" onsubmit="return confirm(window.t('reset_confirm'))">
                <button type="submit" class="btn-danger" data-i18n="reset_btn">Factory Reset</button>
            </form>
        </div>
    </div>`;

  const renameModal = `
    <div id="renameModal" class="modal-overlay" style="z-index: 210;">
        <div class="modal" style="max-width: 350px;">
            <div class="modal-header">
                <h3 style="margin:0" data-i18n="rename_title">Rename Cat</h3>
                <div class="close-icon" onclick="window.closeRename()">×</div>
            </div>
            <p style="margin-bottom: 15px; color: var(--text-sub); font-size: 0.9rem;" data-i18n="rename_desc">Migrate history to new name.</p>
            <input type="text" id="newCatNameInput" data-i18n="rename_placeholder" placeholder="New Name">
            <button onclick="window.confirmRename()" class="btn-main" data-i18n="rename_btn">Confirm</button>
        </div>
    </div>
    <form id="renameForm" action="/api/rename_cat" method="POST" style="display:none">
        <input type="hidden" name="old_name" id="renameOld">
        <input type="hidden" name="new_name" id="renameNew">
    </form>`;

  const deleteCatModal = `
    <div id="deleteCatModal" class="modal-overlay" style="z-index: 210;">
        <div class="modal" style="max-width: 350px; text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 10px;">🗑️</div>
            <h3 style="margin:0 0 10px 0" data-i18n="delete_cat_title">Delete Cat</h3>
            <p style="margin-bottom: 20px; color: var(--text-sub); font-size: 0.95rem;" data-i18n="delete_cat_desc">Remove this tag?</p>
            <button onclick="window.confirmDeleteCat()" class="btn-main" style="background:#ff7675; margin-bottom: 10px;" data-i18n="delete_confirm_btn">Confirm</button>
            <button onclick="window.closeDeleteCatModal()" class="btn-cancel" data-i18n="cancel_btn">Cancel</button>
        </div>
    </div>`;

  let content = `
    <div class="top-controls">
        <button class="control-btn" id="langToggle" onclick="window.toggleLang()">CN</button>
        <button class="control-btn" id="themeToggle" onclick="window.toggleTheme()">☀️</button>
    </div>
    <div style="margin-bottom: 25px; margin-top: 10px;">
        ${switcher}
    </div>
  `;

  const today = new Date().toISOString().split('T')[0];
  
  if (page === 'home') {
      content += `
      <div class="card">
        <h3>
            <span><span data-i18n="trend">Weight Trend</span></span>
            <div class="filters">
                <button id="btn-3m" class="filter-btn" onclick="window.setFilter('3m')" data-i18n="filter_3m">3M</button>
                <button id="btn-6m" class="filter-btn" onclick="window.setFilter('6m')" data-i18n="filter_6m">6M</button>
                <button id="btn-all" class="filter-btn active" onclick="window.setFilter('all')" data-i18n="filter_all">All</button>
            </div>
        </h3>
        <div id="chart" class="chart-box"></div>
      </div>`;
  } else {
    content += `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
            <h3 style="margin:0" id="formTitle" data-i18n="new_record">New Record</h3>
            <button onclick="window.openSettings()" class="filter-btn settings-btn-style" data-i18n="settings_btn">⚙️ Settings</button>
        </div>
        <form action="/api/save" method="POST" id="editForm">
          <input type="hidden" name="id" id="formId">
          <input type="hidden" name="current_cat" value="${currentCatName}" id="currentCatInput">
          <div class="form-grid">
            <input type="date" name="date" value="${today}" required>
            <input type="number" name="weight" step="0.01" data-i18n="placeholder_weight" placeholder="Weight" required>
          </div>
          <input type="text" name="note" data-i18n="placeholder_note" placeholder="Note" maxlength="50">
          <button type="submit" class="btn-main" id="submitBtn" data-i18n="add_btn">Add</button>
          <button type="button" class="btn-cancel" id="cancelBtn" onclick="window.cancelEdit()" data-i18n="cancel_btn">Cancel</button>
        </form>
      </div>`;
  }

  const listHeader = page === 'admin' 
    ? `<h3 style="margin-bottom:15px">
        <span data-i18n="manage">Manage</span>
        <span style="font-size:0.8rem; font-weight:400; color:#b2bec3; margin-left:8px;" data-i18n="refresh_tip"></span>
       </h3>`
    : `<h3 data-i18n="history">History</h3>`;

  content += `
      <div class="card">
        ${listHeader}
        <div id="list"></div>
        <div class="pagination" id="paginationControls" style="display:none">
            <button class="page-btn" id="prevPage" onclick="window.changePage(-1)" data-i18n="prev_page">Prev</button>
            <button class="page-btn" id="nextPage" onclick="window.changePage(1)" data-i18n="next_page">Next</button>
        </div>
        ${page === 'admin' ? `
        <div class="io-group">
            <form action="/api/import" method="POST" enctype="multipart/form-data" style="flex:1; display:flex;">
               <input type="hidden" name="target_name" id="importTargetCat">
               <input type="file" name="csv_file" accept=".csv" onchange="window.submitImport(this)" style="display:none" id="importFile">
               <button type="button" onclick="document.getElementById('importFile').click()" class="btn-io" data-i18n="import_btn">Import</button>
            </form>
            <div style="flex:1">
               <button onclick="window.exportCSV()" class="btn-io" data-i18n="export_btn">Export</button>
            </div>
        </div>` : ''}
      </div>`;

  const navLink = page === 'admin' 
    ? `<a href="/" class="nav-link" data-i18n="back_home">🏠 Home</a><a href="/logout" class="nav-link logout-link" data-i18n="logout">🚫 Logout</a>`
    : (isLoggedIn ? `<a href="/add" class="nav-link" data-i18n="admin_link">🔐 Dashboard</a>` : `<a href="/login" class="nav-link" data-i18n="login_link">👤 Login</a>`);
  content += `<div class="card nav-card">${navLink}</div>`;
  content += settingsModal + renameModal + deleteCatModal;
  
  // MOVED TOOLTIP OUTSIDE CONTAINER
  const tooltipDiv = `<div id="chartTooltip" class="chart-tooltip"></div>`;

  const scriptBlock = `
    <script>
      window.onerror = function(msg, url, line) { alert("Error: " + msg + "\\nLine: " + line); return false; };

      const rawData = ${safeData};
      const config = ${safeConfig};
      let catNames = config.cats;
      const i18nData = ${JSON.stringify(getI18nData())};
      let currentCat = ${safeCurrentCat};
      let isEditMode = false;
      let timeFilter = 'all';
      let renameTargetIndex = -1;
      let deleteTargetIndex = -1;
      let curLang = localStorage.getItem('lang') || 'zh';
      let currentPage = 1;
      const itemsPerPage = 8;

      window.t = function(key) { return i18nData[curLang][key] || key; }

      window.showToast = function(msg) {
          const existing = document.querySelector('.toast');
          if(existing) existing.remove();
          const toast = document.createElement('div');
          toast.className = 'toast';
          toast.innerText = msg;
          document.body.appendChild(toast);
          setTimeout(() => { 
             toast.style.opacity = '0'; 
             setTimeout(() => toast.remove(), 300);
          }, 2000);
      };
      
      window.toggleCatMenu = function(card) {
          card.classList.toggle('open');
      };

      window.updatePageText = function() {
        document.title = curLang === 'zh' ? '${config.title_zh}' : '${config.title_en}';
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
        const githubLink = document.getElementById('footerGithub');
        if(githubLink) githubLink.innerText = window.t('footer_github');
        
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        if(prevBtn) prevBtn.innerText = window.t('prev_page');
        if(nextBtn) nextBtn.innerText = window.t('next_page');
      };

      window.toggleLang = function() {
        curLang = curLang === 'zh' ? 'en' : 'zh';
        localStorage.setItem('lang', curLang);
        window.updatePageText();
        window.dispatchEvent(new Event('langChanged'));
      };

      window.toggleTheme = function() {
        const html = document.documentElement;
        if (html.classList.contains('dark')) { html.classList.remove('dark'); localStorage.setItem('theme', 'light'); } 
        else { html.classList.add('dark'); localStorage.setItem('theme', 'dark'); }
        window.updatePageText();
      };

      window.openSettings = function() { document.getElementById('settingsModal').style.display = 'block'; window.initCatTags(); };
      window.closeSettings = function() { document.getElementById('settingsModal').style.display = 'none'; };

      window.renameCat = function(index) { renameTargetIndex = index; document.getElementById('newCatNameInput').value = catNames[index]; document.getElementById('renameModal').style.display = 'block'; };
      window.closeRename = function() { document.getElementById('renameModal').style.display = 'none'; renameTargetIndex = -1; };
      window.confirmRename = function() {
        if (renameTargetIndex === -1) return;
        const newName = document.getElementById('newCatNameInput').value.trim();
        const oldName = catNames[renameTargetIndex];
        if (newName && newName !== oldName) { document.getElementById('renameOld').value = oldName; document.getElementById('renameNew').value = newName; document.getElementById('renameForm').submit(); }
        window.closeRename();
      };

      window.removeCat = function(index) { deleteTargetIndex = index; document.getElementById('deleteCatModal').style.display = 'block'; };
      window.closeDeleteCatModal = function() { document.getElementById('deleteCatModal').style.display = 'none'; deleteTargetIndex = -1; };
      
      window.confirmDeleteCat = function() { 
          if (deleteTargetIndex === -1) return; 
          catNames.splice(deleteTargetIndex, 1); 
          window.initCatTags(); 
          window.closeDeleteCatModal(); 
      };

      window.initCatTags = function() {
        const container = document.getElementById('catTags');
        const inputGroup = document.querySelector('.tag-input-group');
        const hiddenInput = document.getElementById('catsListInput');
        function renderTags() {
            Array.from(container.getElementsByClassName('tag-chip')).forEach(el => el.remove());
            catNames.forEach((cat, index) => {
                const tag = document.createElement('div');
                tag.className = 'tag-chip';
                tag.innerHTML = \`<span>\${cat}</span><div class="tag-actions"><span class="tag-icon" onclick="renameCat(\${index})">✏️</span><span class="tag-icon" onclick="removeCat(\${index})">✕</span></div>\`;
                container.insertBefore(tag, inputGroup);
            });
            hiddenInput.value = catNames.join(','); // Fix: ensure input updated
        }
        window.addTagFromInput = function() { const input = document.getElementById('catInput'); const val = input.value.trim(); if(val && !catNames.includes(val)) { catNames.push(val); input.value = ''; renderTags(); } hiddenInput.value = catNames.join(','); };
        const input = document.getElementById('catInput'); const newClone = input.cloneNode(true); input.parentNode.replaceChild(newClone, input);
        newClone.addEventListener('keydown', (e) => { if(e.key === 'Enter') { e.preventDefault(); window.addTagFromInput(); } });
        renderTags(); 
        hiddenInput.value = catNames.join(','); 
      };

      window.switchCat = function(name) {
        currentCat = name; currentPage = 1; window.cancelEdit();
        const catInput = document.getElementById('currentCatInput'); if(catInput) catInput.value = name;
        const url = new URL(window.location); url.searchParams.set('cat', name); window.history.replaceState({}, '', url);
        const imp = document.getElementById('importTargetCat'); if(imp) imp.value = currentCat;
        
        // Auto-collapse menu
        const headerCard = document.querySelector('.cat-header-card');
        if(headerCard) headerCard.classList.remove('open');
        
        window.renderApp();
        window.showToast(window.t('switched_to') + name);
      };

      window.setFilter = function(range) { timeFilter = range; window.renderApp(); };

      window.initTiltEffect = function() {
        if(window.matchMedia("(hover: none)").matches) return; 
        const cards = document.querySelectorAll('.card');
        cards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left; 
                const y = e.clientY - rect.top;
                // GLOW LOGIC: Update CSS variables for radial gradient position
                card.style.setProperty('--mouse-x', \`\${x}px\`);
                card.style.setProperty('--mouse-y', \`\${y}px\`);
                
                const centerX = rect.width / 2; const centerY = rect.height / 2;
                const rotateX = ((centerY - y) / centerY) * 1.5; const rotateY = ((x - centerX) / centerX) * 1.5;
                card.style.transform = \`perspective(1000px) rotateX(\${rotateX}deg) rotateY(\${rotateY}deg) scale3d(1.005, 1.005, 1.005)\`;
            });
            card.addEventListener('mouseleave', () => { card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)'; });
        });
      };

      window.renderApp = function() {
        const titleEl = document.querySelector('.cat-title-toggle');
        if(titleEl) {
            titleEl.innerHTML = \`\${currentCat} <span class="arrow">▼</span>\`;
        }
        document.querySelectorAll('.cat-pill').forEach(btn => {
           if(btn.innerText === currentCat) btn.classList.add('active');
           else btn.classList.remove('active');
        });
        
        let allCatData = rawData.filter(d => d.name === currentCat);
        let chartData = [...allCatData];
        if (timeFilter !== 'all') {
            const now = new Date();
            const days = timeFilter === '3m' ? 90 : 180;
            const limit = new Date(now.setDate(now.getDate() - days));
            chartData = chartData.filter(d => new Date(d.date) >= limit);
        }
        ['3m', '6m', 'all'].forEach(f => {
            const btn = document.getElementById('btn-'+f);
            if(btn) {
                if(f === timeFilter) btn.classList.add('active'); else btn.classList.remove('active');
                btn.innerText = window.t('filter_'+f); 
            }
        });
        if(document.getElementById('chart')) window.renderChart(chartData);
        window.renderList(allCatData);
        setTimeout(window.initTiltEffect, 50);
      };

      // UPDATED TOOLTIP LOGIC (FIXED POSITIONING & SCROLL)
      window.showTooltip = function(el, weight, date, noteEncoded) {
        const tip = document.getElementById('chartTooltip'); if(!tip) return;
        const note = decodeURIComponent(noteEncoded);
        const noteHtml = note ? \`<div class="tooltip-note">📝 \${note}</div>\` : '';
        
        // Calculate Position based on Screen Coordinates
        const rect = el.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        
        tip.className = 'chart-tooltip';
        
        // Edge detection relative to viewport width
        const ratio = rect.left / window.innerWidth;
        if (ratio > 0.8) {
            tip.classList.add('shift-left');
        } else if (ratio < 0.2) {
            tip.classList.add('shift-right');
        }
        
        tip.innerHTML = \`<div style="font-size:1.1rem;font-weight:bold">\${weight} <span style="font-size:0.8rem">\${window.t('unit')}</span></div><div class="tooltip-date">\${date}</div>\${noteHtml}\`;
        
        // Absolute position on page
        tip.style.left = (rect.left + scrollLeft + rect.width / 2) + 'px';
        tip.style.top = (rect.top + scrollTop + rect.height / 2) + 'px';
        tip.style.opacity = 1;
      };
      
      window.hideTooltip = function() { const tip = document.getElementById('chartTooltip'); if(tip) tip.style.opacity = 0; };

      // UPDATED CHART LOGIC
      window.renderChart = function(data) {
        const box = document.getElementById('chart'); if(!box) return;
        if(data.length < 1) { box.innerHTML = \`<div class="empty">\${window.t('empty_chart')}</div>\`; return; }
        const w = box.clientWidth; const h = box.clientHeight;
        const p = {t:20, b:30, l:35, r:25};
        const weights = data.map(d => d.weight);
        let min = Math.min(...weights); let max = Math.max(...weights);
        let pad = (max - min) * 0.1; if(pad===0) pad=0.5;
        min -= pad; max += pad;
        const getX = i => p.l + i * (w - p.l - p.r) / (data.length - 1 || 1);
        const getY = v => h - p.b - ((v - min)/(max - min)) * (h - p.t - p.b);
        const points = data.map((d, i) => ({x: getX(i), y: getY(d.weight)}));
        let dPath = ''; points.forEach((pt, i) => { dPath += (i===0 ? 'M' : 'L') + \` \${pt.x} \${pt.y}\`; });
        const areaPath = dPath + \` L \${points[points.length-1].x} \${h-p.b} L \${points[0].x} \${h-p.b} Z\`;
        let grids = '', yLabels = '', xLabels = '', dotHtml = '';
        const xStep = Math.ceil(data.length / Math.floor((w - p.l - p.r) / 65));
        
        for(let i=0; i<=4; i++) {
           const val = min + (max - min) * (i/4); const y = getY(val);
           grids += \`<line x1="\${p.l}" y1="\${y}" x2="\${w-p.r}" y2="\${y}" class="grid"/>\`;
           yLabels += \`<text x="\${p.l-5}" y="\${y+4}" text-anchor="end" class="axis">\${val.toFixed(1)}</text>\`;
        }
        
        points.forEach((pt, i) => {
           const safeNote = encodeURIComponent(data[i].note || '');
           dotHtml += \`<circle cx="\${pt.x}" cy="\${pt.y}" class="dot" onmouseenter="window.showTooltip(this, '\${data[i].weight}', '\${data[i].date}', '\${safeNote}')" onmouseleave="window.hideTooltip()" />\`;
           
           if(i===0 || i===points.length-1 || (i%xStep===0 && i < points.length - Math.floor(xStep/2))) {
              const date = data[i].date.slice(5).replace('-','/');
              let anchor = i===0 ? 'start' : (i===points.length-1 ? 'end' : 'middle');
              let tx = pt.x; if(i===0) tx = Math.max(tx, p.l); if(i===points.length-1) tx = Math.min(tx, w - p.r);
              xLabels += \`<text x="\${tx}" y="\${h-5}" text-anchor="\${anchor}" class="axis">\${date}</text>\`;
           }
        });
        const defs = \`<defs><linearGradient id="gradientFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#ff6b6b"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>\`;
        box.innerHTML = \`<svg viewBox="0 0 \${w} \${h}>\${defs}\${grids}<path d="\${areaPath}" class="area-fill"/><path d="\${dPath}" class="line"/>\${dotHtml}\${yLabels}\${xLabels}</svg>\`;
      };

      window.renderList = function(data) {
        const list = document.getElementById('list');
        const pagination = document.getElementById('paginationControls');
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        
        if(!list) return;
        const displayData = [...data].reverse();
        if(!displayData.length) { list.innerHTML = \`<div class="empty">\${window.t('empty_list')}</div>\`; if(pagination) pagination.style.display='none'; return; }
        
        const totalPages = Math.ceil(displayData.length / itemsPerPage);
        if (currentPage > totalPages) currentPage = totalPages;
        const start = (currentPage - 1) * itemsPerPage;
        const pagedData = displayData.slice(start, start + itemsPerPage);
        const isAdmin = !!document.getElementById('editForm');
        
        list.innerHTML = pagedData.map(item => {
          const note = item.note ? \`<div class="note">\${item.note}</div>\` : '';
          const actions = isAdmin ? \`
            <div class="actions">
              <button class="btn-icon btn-edit" onclick='window.startEdit(\${JSON.stringify(item)})'>✏️</button>
              <form action="/api/delete" method="POST" onsubmit="return confirm('\${window.t('confirm_delete')}')">
                <input type="hidden" name="id" value="\${item.id}">
                <input type="hidden" name="current_cat" value="\${currentCat}">
                <button class="btn-icon btn-del">🗑️</button>
              </form>
            </div>\` : '';
          return \`<div class="item"><div class="item-l"><div class="w-val">\${item.weight} <span style="font-size:0.8rem;font-weight:400;color:var(--text-sub)">\${window.t('unit')}</span></div><div class="w-date">\${item.date}</div>\${note}</div>\${actions}</div>\`;
        }).join('');
        
        if(pagination) {
            if(totalPages > 1) {
                pagination.style.display = 'flex';
                if (currentPage === 1) {
                    prevBtn.style.display = 'none';
                    nextBtn.style.display = 'block';
                } else if (currentPage === totalPages) {
                    prevBtn.style.display = 'block';
                    nextBtn.style.display = 'none';
                } else {
                    prevBtn.style.display = 'block';
                    nextBtn.style.display = 'block';
                }
            } else { pagination.style.display = 'none'; }
        }
      };

      window.changePage = function(delta) { currentPage += delta; window.renderList(rawData.filter(d => d.name === currentCat)); document.getElementById('list').scrollIntoView({behavior: 'smooth', block: 'start'}); };

      window.startEdit = function(item) {
        isEditMode = true;
        document.getElementById('formId').value = item.id;
        document.querySelector('input[name="date"]').value = item.date;
        document.querySelector('input[name="weight"]').value = item.weight;
        document.querySelector('input[name="note"]').value = item.note;
        const btn = document.getElementById('submitBtn');
        btn.innerText = window.t('save_btn');
        btn.style.background = 'linear-gradient(135deg, #0984e3, #74b9ff)';
        document.getElementById('cancelBtn').style.display = 'block';
        document.getElementById('formTitle').innerText = window.t('manage');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };

      window.cancelEdit = function() {
        isEditMode = false;
        const form = document.getElementById('editForm');
        if (form) {
            form.reset();
            document.getElementById('formId').value = '';
            document.querySelector('input[name="date"]').value = new Date().toISOString().split('T')[0];
            const btn = document.getElementById('submitBtn');
            btn.innerText = window.t('add_btn');
            btn.style.background = ''; 
            document.getElementById('cancelBtn').style.display = 'none';
            document.getElementById('formTitle').innerText = window.t('new_record');
        }
      };
      
      window.exportCSV = function() {
        const d = rawData.filter(x => x.name === currentCat);
        if(!d.length) return alert(window.t('no_data_export'));
        const csv = "data:text/csv;charset=utf-8,\uFEFFDate,Weight,Name,Note\\n" + d.map(x => \`\${x.date},\${x.weight},\${x.name},\${x.note}\`).join('\\n');
        const a = document.createElement('a'); a.href = encodeURI(csv); a.download = currentCat+'_records.csv'; a.click();
      };

      window.submitImport = function(input) { if(confirm(window.t('confirm_import'))) { input.form.submit(); } else { input.value = ''; } };

      window.onload = function() {
          if(document.getElementById('chart')) { window.renderApp(); window.initTiltEffect(); }
          window.updatePageText();
          if(document.getElementById('catTags')) window.initCatTags();
      };
      window.addEventListener('langChanged', () => { if(document.getElementById('chart')) window.renderApp(); });
    </script>
  `;

  // Moved footer HTML out of container div
  return `<!DOCTYPE html><html lang="zh-CN"><head><title>${config.title_en}</title>${getHead(config)}</head><body><div class="container">${content}</div>${getFooterHTML()}${tooltipDiv}${scriptBlock}</body></html>`;
}

// ==========================================
// 5. EXPORT DEFAULT (LAST)
// ==========================================

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      return new Response(`<h1>Error</h1><pre>${e.stack || e.message}</pre>`, { headers: { 'Content-Type': 'text/html' } });
    }
  },
};
