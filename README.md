# 🐱 Cat Weight Tracker | 猫咪体重本

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
Keep track of your furry friend's health with interactive charts, dark mode, multi-language support, and a modern UI—all running for free on your own Cloudflare account.

### ✨ Features

* **Serverless Architecture**: Hosted entirely on Cloudflare Workers + KV Storage. Zero maintenance.
* **Modern UI**: Glassmorphism design, 3D tilt card effects, and smooth animations using the "Varela Round" font.
* **🌍 Multi-Language**: One-click switching between **English** and **Chinese**.
* **🌗 Theme Toggle**: Switch between **Sunny Light** and **Midnight Dark** modes with persistence.
* **Data Visualization**: Interactive SVG charts with time filters (3 Months/6 Months/All) and smart tooltips.
* **PWA Support**: Installable on mobile devices! Offers a native app-like full-screen experience.
* **Multi-Cat Support**: Manage weight records for multiple cats in one place.
* **Import & Export**: Full CSV support. Backup your data or bulk import records from other apps.
* **Secure**: Password-protected management dashboard.

### 🚀 Quick Deployment

#### 1. Create a KV Namespace
1.  Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2.  Go to **Workers & Pages** -> **KV**.
3.  Click **Create a Namespace**, name it `CAT_WEIGHT_KV` (or any name you prefer), and click **Add**.

#### 2. Create a Worker
1.  Go to **Workers & Pages** -> **Overview** -> **Create Application** -> **Create Worker**.
2.  Name it (e.g., `cat-tracker`) and click **Deploy**.

#### 3. Configure Bindings & Variables (Crucial Step!)

**A. Bind KV Namespace:**
1.  Go to your Worker's dashboard and click the **Bindings** tab (in the top menu).
2.  Scroll down to **KV Namespace Bindings**.
3.  Click **Add** (or **Connect**).
    * **Variable name**: `CAT_KV` (**Must be exactly this!**).
    * **KV Namespace**: Select the namespace you created in Step 1.
4.  Click **Deploy** to save.

**B. Set Environment Variables:**
1.  Click the **Settings** tab (top menu) -> **Variables**.
2.  Scroll to **Environment Variables** and click **Add variable**.
3.  Add the following variables:
    * `ADMIN_USER`: Your login username (e.g., `admin`).
    * `ADMIN_PASS`: Your login password.
    * `CAT_NAMES`: Names of your cats, separated by commas (e.g., `Luna, Oreo`).
4.  Click **Deploy** to save.

#### 4. Deploy Code
1.  Click the **Edit code** button (usually top right).
2.  Copy the content of `worker.js` from this repository.
3.  Paste it into the Cloudflare editor (replace the original "Hello World" code).
4.  Click **Deploy**.

🎉 **Done!** Visit your worker URL to start tracking.

### 📂 Data Management

Manage your data in the Admin Dashboard (login required).

* **Export**: Click **📥 Export CSV** to download records for the selected cat.
* **Import**: Click **📤 Import CSV** to bulk upload data.
    * **Logic**: The system uses "Date + Cat Name" as a unique key. Existing records with the same date will be overwritten; new dates will be added.

### 📱 Mobile Usage (PWA)
1.  Open the website in Safari (iOS) or Chrome (Android).
2.  Tap **Share** -> **Add to Home Screen**.
3.  Open the app from your home screen for an immersive experience.

---

<a name="中文说明"></a>
## 🇨🇳 中文说明

一个基于 **Cloudflare Workers** 构建的简约、精美、无服务器的猫咪体重记录本。
通过交互式图表、深色模式、双语界面和现代化的 UI，轻松记录毛孩子的健康趋势。完全免费托管在您自己的 Cloudflare 账户上。

### ✨ 功能特性

* **无服务器架构**：完全运行在 Cloudflare Workers + KV 存储上，零服务器维护成本。
* **现代 UI 设计**：采用磨砂玻璃质感、卡片 3D 跟随动效、光晕流光效果以及圆润可爱的字体。
* **🌍 中英双语**：支持一键切换 **中文 / English**，并自动记忆语言偏好。
* **🌗 明暗切换**：支持手动切换 **日间 / 夜间** 模式，适配不同光线环境。
* **数据可视化**：原生 SVG 绘制的平滑曲线图，支持时间筛选（近3月/半年/全部），以及智能防遮挡的气泡提示。
* **PWA 支持**：支持“添加到主屏幕”，在手机上拥有原生 App 般的全面屏体验。
* **多猫管理**：支持同时记录多只猫咪的数据，一键切换。
* **导入导出**：支持导出 CSV 备份，也支持批量导入数据（智能合并去重）。
* **安全隐私**：管理界面由密码保护，数据存储在您私有的 KV 数据库中。

### 🚀 快速部署指南

#### 1. 创建 KV 数据库
1.  登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2.  进入 **Workers & Pages** -> **KV**。
3.  点击 **创建命名空间 (Create a Namespace)**，命名为 `CAT_WEIGHT_KV`（名字随意），点击添加。

#### 2. 创建 Worker
1.  进入 **Workers & Pages** -> **概述 (Overview)** -> **创建应用程序** -> **创建 Worker**。
2.  起个名字（例如 `cat-tracker`），点击 **部署 (Deploy)**。

#### 3. 配置绑定与变量（关键步骤！）

**A. 绑定 KV 数据库:**
1.  进入你的 Worker 详情页，点击顶部菜单栏的 **绑定 (Bindings)**。
2.  向下滑动找到 **KV 命名空间绑定 (KV Namespace Bindings)** 区域。
3.  点击 **添加 (Add)** 或 **连接 (Connect)**。
    * **变量名称 (Variable name)**: 填写 `CAT_KV` (**必须完全一致，不能改**)。
    * **KV 命名空间**: 选择第 1 步创建的数据库。
4.  点击 **部署 (Deploy)** 保存设置。

**B. 添加环境变量:**
1.  点击顶部菜单栏的 **设置 (Settings)** -> **变量 (Variables)**。
2.  找到 **环境变量 (Environment Variables)** 区域，点击 **添加变量**。
3.  添加以下变量：
    * `ADMIN_USER`: 后台登录用户名（例如 `admin`）。
    * `ADMIN_PASS`: 后台登录密码。
    * `CAT_NAMES`: 你猫咪的名字，多只猫用英文逗号分隔（例如 `汤圆,麻薯`）。
4.  点击 **部署 (Deploy)** 保存设置。

#### 4. 部署代码
1.  点击右上角的 **编辑代码 (Edit code)**。
2.  复制本项目 `worker.js` 的全部代码。
3.  粘贴到 Cloudflare 编辑器中（覆盖原有的 Hello World 代码）。
4.  点击 **部署 (Deploy)**。

🎉 **大功告成！** 访问你的 Worker 域名即可开始使用。

### 📂 数据导入与导出

进入后台管理界面后，您可以在底部找到数据操作区：

* **导出 (Export)**：点击 **📥 导出 CSV** 可下载当前猫咪的所有记录。
* **导入 (Import)**：点击 **📤 导入 CSV** 可批量上传数据。
    * **文件格式**：推荐使用本工具导出的标准格式 `日期,体重,猫咪,备注`。如果 CSV 中没有猫咪名字列，数据将默认归属给当前选中的猫咪。
    * **合并逻辑**：系统基于“日期+猫咪名字”判断。如果同一天已有记录，新导入的数据会**覆盖**旧数据；如果是新日期，则会新增记录。

### 📱 手机端使用 (PWA)
1.  在手机 Safari (iOS) 或 Chrome (Android) 中打开网站。
2.  点击 **分享** 按钮 -> 选择 **添加到主屏幕**。
3.  从桌面图标打开，即可享受无地址栏的沉浸式体验。

### 🛠️ 常见问题 (FAQ)

**Q: 部署后显示 "程序运行出错" 或 Error 1101?**
A: 这通常是因为 KV 数据库没有绑定成功。请再次检查 **绑定 (Bindings)** 菜单下，KV 绑定的变量名是否严格填写为 `CAT_KV` (全大写)。

**Q: 导入 CSV 失败？**
A: 请确保 CSV 文件是以 UTF-8 编码保存的，且至少包含 `日期` 和 `体重` 两列。

---

## 📄 License

[MIT License](LICENSE) © 2025
