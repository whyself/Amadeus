# Changelog

## 1.2.0-rc.1 — 2026-10-02（预发布）

- DSH 与 WebServer 升级到 `0.2.0-rc.2`；四个插件版本统一为 `1.2.0-rc.1`。
- 文件浏览、排序、展开、自动刷新和预览导航改用 DSH 原生文件树，保留上传、ZIP 下载、重名替换、删除确认及编辑器入口。
- 修复输入区的队列渲染异常，PDF/Office 选区采用上游主题样式。
- 改进 Safari API 与 PDF worker 兼容、触屏缩放和滚动。
- 关闭干净的编辑标签后保留工作台，恢复编辑器文件树布局，继续保护未保存内容。
- 文件注释增加出处链接，整理笔记时保留原文来源。
- 修复 POSIX 特殊文件名的操作路径与删除确认不一致。
- 更新 PWA 缓存版本和插件兼容元数据。
- 恢复编辑器背景颜色的浅色、深色和跟随系统设置，兼容 DSH 0.2 的图标接口。
- 编辑器采用 Modern 浅色/深色主题，统一活动栏、文件侧栏和状态栏的颜色模式。

## 1.1.3 — 2026-09-26（正式版）

- 修复 Android 平板和慢速客户端保存文件时的竞态误报：保存完成后立即确认磁盘版本，不再把编辑器自己的保存动作提示为“文件被外部修改”。
- 真正由其他进程写入文件时仍保留未保存修改保护，避免自动覆盖用户草稿。
- 四个插件统一发布为 `1.1.3`；通过 65 项 Node 测试、构建、打包校验和 Docker 启动验证。

## 1.1.2 — 2026-09-25（正式版）

- 新增可安装 PWA：提供 manifest、service worker、192/512 图标、独立缓存和移动端元信息，支持桌面浏览器与 Android 平板安装。
- PWA 启动资源支持 Tailscale HTTPS 和 Android 安装检查；manifest、service worker 与图标无需登录即可读取，文件、会话、编辑器和 WebSocket 业务接口仍由 Basic Auth 保护。
- 默认本地服务端口统一为 `3080`，并完成 `3080` Docker 部署验证。
- 四个插件统一发布为 `1.1.2`；通过完整 Node 测试、构建、打包校验和浏览器 service worker 注册验证。
- 修复“收起对话”只改变宽度但没有动画的问题，恢复与侧边栏一致的 `0.3s` 网格过渡，并尊重减少动态效果设置。

## 1.1.1 — 2026-09-25（正式版）

- 修复编辑器失去焦点后文件不刷新的问题。扩展在后台维护已打开文档，结合文件事件和元数据检查，即使 Windows/Docker 挂载目录漏发文件事件，也能自动刷新。
- 优化长对话流显示性能：已完成且远离视口的助手消息使用浏览器原生 `content-visibility` 延迟布局和绘制，正在流式输出的消息保持即时显示，长对话滚动更流畅。
- 外部文件更新不再切换当前编辑器标签；有未保存修改时保留草稿并显示冲突，只有明确选择重新载入才会丢弃草稿。
- DSH 升级到 `0.1.7-rc.2`，Login、Files、Reader、Editor 四个插件统一发布为 `1.1.1`。
- 删除 Amadeus 自定义 PDF 工具栏，改用 DSH 原生缩放、缩放菜单和“适应宽度”功能，修复重复按钮。
- 增加 code-server 真实浏览器回归，覆盖失焦刷新、宿主机写入、原子替换、多文件同步和未保存修改保护。
- 发布包包含四个插件压缩包及 `SHA256SUMS`；完整 Node 测试、构建、浏览器回归和 Docker 启动验证通过。

- 将 DSH 与 Login 的 WebServer 依赖从 `0.1.7-rc.1` 推进到 `0.1.7-rc.2`；依赖树统一到同一预发布候选版本，并通过完整测试、构建和隔离 Docker 启动验证。
- 删除 Amadeus 自定义 PDF 控件，改用 DSH `rc.2` 原生缩放和 fit-width 控件，避免重复按钮并减少对文档预览内部实现的依赖。
- 将 DSH 从 `0.1.6-alpha.2` 升级到 `0.1.7-rc.1`，并同步更新 Cordis、Schemastery 和 Login 插件的 WebServer 依赖。该 DSH 版本仍是预发布候选版。
- 接入 DSH 的侧栏终端恢复、会话归档管理、文件改动审阅和扩展 Office/CSV/TSV 预览功能。
- 在 Web profile 中启用 DSH 的隔离网页浏览器，可从右侧侧栏打开 HTTP(S) 页面。
- 重构编辑器后台同步：扩展统一维护文档生命周期、磁盘版本和冲突，DSH 文件操作及目录监听作为即时提示，每秒只核对已打开文件的元数据，补足 Windows/Docker 挂载目录不发文件事件的情况。移除前端重复订阅和聚焦补刷，失焦时也自动更新；冲突状态可跨事件流重连恢复。
- code-server 按资源更新对应文本模型，不再切换当前标签执行还原；自动刷新保留未保存修改，失败后重试。新增真实 code-server 浏览器回归，验证外部焦点、宿主机写入、原子替换、多文件刷新和草稿保护。
- 修复 LaTeX Workshop PDF Webview 中 Ctrl+P 绕过外层拦截并触发打印的问题。

## 1.1.0 — 2026-09-24（正式版）

- 以 DSH 原生侧栏作为所有文件的默认预览；项目文件列表和开始页提供显式 code-server 编辑入口。HTML、Markdown、PDF 与 Office 文件保留原生预览。
- 稳定 code-server 工作台加载、标签切换与浏览状态恢复，避免首次打开的文件覆盖上次浏览文件；编辑器代码字号可用 `Ctrl/Cmd` + `+`、`-`、`0` 调整。
- 编辑器选区使用与聊天相同的评论输入框和蓝色对勾提交流程；注释标记在深色模式下保持清晰。英语模式下文件列表、编辑器和已打开标签实时切换语言。
- 增加独立的编辑器外观设置；左侧加入带图标旋转动画的对话收起入口。连接延迟保留 DSH 原生断线、重连与恢复提示。
- 整理文件分类和侧栏组件源码，重写 Docker Compose 部署文档。镜像仍固定 DSH `0.1.6-alpha.2`、code-server `4.104.2` 和 LaTeX Workshop `10.9.0`。
- 发布 Login、Files、Reader、Editor 四个 `1.1.0` 插件包。验证覆盖 Node 测试、编辑器浏览器回归、Docker 构建与真实 code-server 操作。

## 1.1.0-alpha.2 — 2026-09-23（预发布）

- 新增 `dsh-amadeus-editor`：同源认证 HTTP/WebSocket 代理、DSH 文件打开入口、每个工作台的持久化 VS Code 工作区及仅负责打开文件、读取选区/保存状态的私有桥接。
- 代码编辑、保存、撤销重做和 Markdown 侧边预览改由 code-server 提供；编辑选区可加入原有 DSH 注释对话。
- 新增 Docker Compose 部署，镜像包含 LaTeX Workshop、TeX Live、XeLaTeX、latexmk、Biber 与中文字体。TeX 在容器内编译，不再由浏览器下载宏包或执行 WASM。
- 删除自建 CodeMirror 编辑器、草稿/合并状态管理、Markdown 渲染和打印组件、SwiftLaTeX 资产，以及旧 `/amadeus/files/source`、`/amadeus/files/artifact`、`/amadeus/texlive` 路由。
- 删除配置 `maxTextBytes`、`kpsewhich`、`texliveUpstream`；新增 `editor.upstream`、`editor.bridgeDir`。Docker 使用独立配置示例，保留原有原生 PDF/Office 预览与会话认证。
- 迁移前保存旧编辑器中的未保存内容。新版编辑器使用 VS Code 自身的工作区恢复数据，不能导入旧版内存草稿。

- 修复切换 DSH 标签导致编辑器重载；保留 iframe、草稿和工作区身份，并适配浮动/全屏布局。
- 转发工作台及扩展动态端口的 WebSocket，修复中文 PDF 字体资源在代理子路径下的加载，并增加工作区冷启动恢复。
- 使用 code-server / LaTeX Workshop 原生按钮、快捷键和 TeX 右键菜单，移除重复操作栏。
- 改善中文输入法组合输入、原生 PDF 缩放与页码控件；新增连接延迟显示和可配置的原生文件预览读取上限。
- 主项目与 Login、Files、Reader、Editor 四个插件统一版本为 `1.1.0-alpha.2`；DSH 固定为 `0.1.6-alpha.2`。
- 已通过 50 项 Node 测试、浏览器生命周期回归、Docker 构建及真实 MD/中文 TeX/PDF 验证。

## 1.1.0-alpha.1（预发布）

基于 `@deepseek-ai/dsh@0.1.6-alpha.2` 的兼容重写，删除与 DSH 原生能力重复的代码。

### 移除（由 DSH 原生能力替代）

- 移除 `open_sidebar` 主动工具及配套 SSE 通道：原生侧栏已默认预览文件引用。
- 移除 terminal 插件：原生侧栏终端支持多标签、刷新恢复与系统用户权限。
- 移除 ONLYOFFICE 转换链路（`convert.mjs`、`onlyoffice.mjs`、`pdf-http.mjs`、`/amadeus/preview` 路由、预览缓存与分页阅读器）：原生 `dsh-office-to-pdf` 使用 LibreOffice 引擎转换 Office 文件，原生 PDF/Office 预览自带可选择文字层，并支持 Excel。
- 移除配置项 `onlyOffice*`、`previewWorkers`、`previewTimeoutMs`、`previewCacheVersion`、`maxPreviewBytes`。

### 新增

- 为原生侧栏 PDF/Office 文字层注入固定半透明蓝选中色 `rgba(68,118,254,.45)`，替代几乎不可见的主题悬停色（需 `!important` 以压过后插入的懒加载 PDF 样式）。
- 注释引用点击跳转在原生 PDF 预览内按 `data-pdf-page` 定位到原页；原生预览内的文字选区自动记录页码。
- files 插件新增 `PUT /amadeus/files/artifact`：编译产物等自生成文件的无条件覆盖写入（原子临时文件 + 改名，受 `maxUploadBytes` 限制）。
- LaTeX「编译为 PDF」：编译结果写入工作区同名 `.pdf`，并作为普通文件交给原生侧栏预览（文字层 + 蓝色选中），与手动上传的 PDF 走同一条渲染路线。

### 移除（LaTeX 自带查看器）

- 删除 `GeneratedPdfPreview` 及其缩放、页码跳转、双指缩放控件，连带 `latex-preview.jsx`、`page-control.*`、`scroll-page.mjs`、`loading.*`、`usePdfPinchZoom`、`currentPageAt`。
- 移除 `pdfjs-dist` 依赖与 reader 资产中的 pdf.worker/cmaps/standard_fonts/wasm 拷贝；reader 资产只保留 SwiftLaTeX 与 KaTeX。

### 兼容适配（0.1.6-alpha.2 破坏性变更）

- 会话多实例：`sessions.list` 快照不再含 `current`，改为从 Amadeus 渲染的会话级表面捕获活跃会话。
- `sidebarRight.mounted()` 已移除，「编译并在右侧打开预览」改为记忆分栏并在失败时重新分栏。
- 首页标题 `El Psy Kongroo` 改为文本节点替换（locale 词典由命名空间所有者独占注册，`main.conversation` 不再透传 `t`）。
- 编辑器接管逻辑保留：原生 `text` 标签页中可编辑文档仍由 CodeMirror 编辑器渲染，PDF/Office 完全交回原生预览。

### 版本

- 工作区与 Reader 1.1.0-alpha.1；Files 1.0.3；login 保持 1.0.1。

## 1.0.3 - 2026-09-21

- 修复 Markdown「编译并在右侧打开预览」触发的文档状态反复创建、加载和渲染，以及由此导致的浏览器卡死和内存持续增长。
- 文档回收同时检查正文持有者和订阅者；分屏切换时将回收延迟到微任务，并再次核对引用状态，允许同一次 React 更新中的卸载与重挂载复用记录。
- 回收前确认缓存中的对象仍是原记录，防止旧记录的清理回调误删新记录；保留未保存和正在保存的文档。
- 通知订阅者时遍历集合快照，避免监听器在通知期间取消并重新订阅后，被同一轮 Set 遍历反复调用。
- 重复打开并排预览时复用已有分栏，并在分栏更新后再打开预览，避免连续点击产生重复预览。
- 增加分屏重挂载、多个活跃文档、旧记录清理和订阅重入回归测试。
- 工作区和 Reader 版本更新为 1.0.3；其他插件保留各自版本。

## 1.0.1 — 2026-09-19

- 将 DSH WebSocket 心跳间隔从 2 秒调整为 15 秒，连续两次漏回后约 30 秒才判定连接失效。
- 保留断线检测和自动重连，同时降低公网短暂抖动、浏览器暂停或网络切换引发的误断线。
- 目录与文本轮询行为保持不变。

## 1.0.0 — 2026-09-18

Amadeus 1.0 建立后续开发与部署基线。

### 文档与预览

- PDF、Word、PowerPoint 分页阅读，支持文字层、缩放、跳页、移动端手势和大文件 Range 请求。
- Office 文件通过 ONLYOFFICE Document Builder 转为可缓存的 PDF 阅读版本。
- Markdown 安全渲染、KaTeX 公式、同标签及并排预览和打印导出。
- 浏览器 SwiftLaTeX XeTeX/dvipdfmx 编译，支持中文、`ctexart`、常用 TikZ、PDF 文字层和下载。

### 编辑与同步

- CodeMirror 6 文本编辑、语法高亮、自动换行、字号控制、撤销/重做和保存快捷键。
- 未保存状态、关闭确认、文件轮询与服务器变更自动刷新。
- 基于文件版本的原子保存、自动合并和 CodeMirror 三方冲突编辑。

### 对话与工作区

- 文件和对话选区注释、注释胶囊、回答引用、悬浮详情与原文荧光定位。
- 项目文件上传、下载、ZIP、删除和目录轮询。
- 持久终端 WebSocket、输入合并与会话恢复。
- Amadeus 品牌、Logo、主题和 `El Psy Kongroo` 首页。

### 部署与安全

- Basic 认证、HTTPS/nginx 模板、systemd 模板与单用户权限模型。
- 工作区边界、符号链接逃逸防护、上传与预览大小限制。
- Node.js 24 构建、四个独立 DSH 插件包和完整测试基线。

### 破坏性变更

- 项目自有命名空间统一为 `amadeus`。
- 配置文件改为 `amadeus.local.yml`，覆盖变量改为 `AMADEUS_CONFIG`。
- HTTP 路由改为 `/amadeus/*`，插件 ID、缓存键和 DOM 扩展点同步更名。
- 默认数据目录改为 `.amadeus/dsh-home`，DSH Profile 改为 `amadeus`。
- systemd 单元改为 `amadeus.service`。
