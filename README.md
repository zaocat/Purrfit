# 🐱 Cat Weight Tracker | 猫咪体重追踪

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange?logo=cloudflare)](https://workers.cloudflare.com/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![Dark Mode](screenshots/screenshots_dark.png) 
<p align="center">Dark Mode screenshot</p>

![Dark Mode](screenshots/screenshots_light.png)
<p align="center">Light Mode screenshot</p>


**[English](#english) | [中文说明](#中文说明)**

---

<a name="english"></a>
## 🇬🇧 English

A minimalist, beautiful, serverless Cat Weight Tracker built on **Cloudflare Workers**.
Keep track of your furry friend's health with interactive charts, dark mode, and a modern UI—all running for free on your own Cloudflare account.

### ✨ Features

* **Serverless Architecture**: Hosted entirely on Cloudflare Workers + KV Storage. No server maintenance required.
* **Modern UI**: Glassmorphism design, 3D tilt card effects, and smooth animations using the "Varela Round" font.
* **Data Visualization**: Interactive SVG charts with smart tooltips (prevents screen cutoff) and trend indicators.
* **Dark/Light Mode**: Toggle between a sunny day theme and a midnight blue theme. Persistence supported.
* **PWA Support**: Install it on your phone! Supports "Add to Home Screen" with a native app-like experience (no browser address bar).
* **Multi-Cat Support**: Manage weight records for multiple cats in one place.
* **Secure**: Basic Authentication (Admin/Password) protected management interface.
* **Data Ownership**: 100% of your data lives in your Cloudflare KV. Export to CSV anytime.

### 🚀 Quick Deployment

#### 1. Create a KV Namespace
1.  Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2.  Go to **Workers & Pages** -> **KV**.
3.  Create a namespace named `CAT_WEIGHT_KV` (or any name you prefer).

#### 2. Create a Worker
1.  Go to **Workers & Pages** -> **Overview** -> **Create Application** -> **Create Worker**.
2.  Name it (e.g., `cat-tracker`) and click **Deploy**.

#### 3. Configure Variables (Crucial Step!)
Go to your Worker's **Settings** -> **Variables**.

**A. KV Namespace Bindings:**
* Click **Add binding**.
* **Variable name**: `CAT_KV` (Must be exactly this!).
* **KV Namespace**: Select the namespace you created in Step 1.

**B. Environment Variables:**
Add the following variables:
* `ADMIN_USER`: Your login username (e.g., `admin`).
* `ADMIN_PASS`: Your login password.
* `CAT_NAMES`: Names of your cats, separated by commas (e.g., `Luna, Oreo`).

#### 4. Deploy Code
1.  Click **Edit code**.
2.  Copy the content of `worker.js` from this repository.
3.  Paste it into the Cloudflare editor (replace everything).
4.  Click **Deploy**.

🎉 **Done!** Visit your worker URL to start tracking.

### 📱 Mobile Usage (PWA)
1.  Open the website in Safari (iOS) or Chrome (Android).
2.  Tap **Share** -> **Add to Home Screen**.
3.  Open the app from your home screen for a fullscreen experience.

---

<a name="中文说明"></a>
## 🇨🇳 中文说明

一个基于 **Cloudflare Workers** 构建的简约、精美、无服务器的猫咪体重记录本。
通过交互式图表、深色模式和现代化的 UI 界面，轻松记录毛孩子的健康趋势。完全免费托管在您自己的 Cloudflare 账户上。

### ✨ 功能特性

* **无服务器架构**：完全运行在 Cloudflare Workers + KV 存储上，零服务器维护成本。
* **现代 UI 设计**：采用磨砂玻璃质感、卡片 3D 跟随动效、光晕流光效果以及圆润可爱的字体。
* **数据可视化**：原生 SVG 绘制的平滑曲线图，支持时间筛选（近3月/半年/全部），以及智能防遮挡的气泡提示。
* **深色/浅色模式**：支持手动切换日间/夜间模式，并自动保存偏好。
* **PWA 支持**：支持“添加到主屏幕”，在手机上拥有原生 App 般的全面屏体验。
* **多猫管理**：支持同时记录多只猫咪的数据，一键切换。
* **安全隐私**：管理界面由密码保护，数据存储在您私有的 KV 数据库中，支持 CSV 导出。

### 🚀 快速部署指南

#### 1. 创建 KV 数据库
1.  登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2.  进入 **Workers & Pages** -> **KV**。
3.  点击 **Create a Namespace**，命名为 `CAT_WEIGHT_KV`（名字随意）。

#### 2. 创建 Worker
1.  进入 **Workers & Pages** -> **Overview** -> **Create Application** -> **Create Worker**。
2.  起个名字（例如 `cat-tracker`），点击 **Deploy**。

#### 3. 配置变量（关键步骤！）
进入你刚才创建的 Worker 的 **Settings (设置)** -> **Variables (变量)** 页面。

**A. 绑定 KV 命名空间 (KV Namespace Bindings):**
* 点击 **Add binding**。
* **Variable name (变量名)**: 填写 `CAT_KV` (**必须完全一致，不能改**)。
* **KV Namespace**: 选择第 1 步创建的数据库。

**B. 添加环境变量 (Environment Variables):**
点击 Add variable 添加以下变量：
* `ADMIN_USER`: 后台登录用户名（例如 `admin`）。
* `ADMIN_PASS`: 后台登录密码。
* `CAT_NAMES`: 你猫咪的名字，多只猫用英文逗号分隔（例如 `汤圆,麻薯`）。

#### 4. 部署代码
1.  点击右上角的 **Edit code (编辑代码)**。
2.  复制本项目 `worker.js` 的全部代码。
3.  粘贴到 Cloudflare 编辑器中（覆盖原有代码）。
4.  点击 **Deploy (部署)**。

🎉 **大功告成！** 访问你的 Worker 域名即可开始使用。

### 📱 手机端使用 (PWA)
1.  在手机 Safari (iOS) 或 Chrome (Android) 中打开网站。
2.  点击 **分享** 按钮 -> 选择 **添加到主屏幕**。
3.  从桌面图标打开，即可享受无地址栏的沉浸式体验。

### 🛠️ 常见问题 (FAQ)

**Q: 部署后显示 Error 1101?**
A: 这通常是因为 KV 数据库没有绑定成功。请再次检查 Settings -> Variables -> KV Namespace Bindings 中的变量名是否严格为 `CAT_KV`。

**Q: 如何备份数据？**
A: 登录后台管理页，点击底部的 "📥 导出 CSV" 按钮即可将数据下载到本地。

---

## 📄 License

[MIT License](LICENSE) © 2025
