# 更新日志 / Changelog

## 未发布 — 2026-10-08

- 接入 DSH 官方 browser use 的会话连接适配，新增每对话独立的服务端 Chromium 和认证画面流。
- 新增只读“AI 浏览器”面板：自动展示 AI 的当前页面，支持收起、重连及后台对话隔离；原生 iframe“浏览器”继续供用户独立操作。
- 保存每对话 Cookie 和最近 URL，修复启动空白页、进程退出和关闭流程覆盖恢复信息的问题。
- 新增真实浏览器、崩溃重试、同 URL 页面身份、只读 API 及真实 DSH 侧栏回归。

- 注释出处跳转通过原生阅读位置控制器平滑滚动，保存语义位置并稳定高亮；用户滚动可立即取消动画，包括首帧之前的操作。
- 注释评论输入框支持点击页面、编辑器或 PDF 空白区域取消；取消后不会被旧选区重新打开，直接拖选新文字也能正常添加注释。
- 编辑器 PDF 的注释入口贴近可见选区焦点显示，转换嵌套 iframe 坐标并保留缩放与边框偏移；支持直接打开 PDF 后用鼠标选择文字。
- 注释详情弹层改为页面顶层定位，跟随引用、滚动与侧栏移动，适应可视区域大小并支持键盘操作。
- 带注释请求从发送中到已发送使用一致的注释卡片；只有注释时不再先出现普通消息气泡。发送开始清理旧选区，防止注释输入框被过期选区事件重新打开。
- 原生 Markdown 注释引用由 React 渲染，避免直接替换文字节点导致后续内容更新异常。
- 修复回答中 `<u>` 被显示为原文的问题，并支持无属性的下划线、上标、下标和换行；同步修补实际加载的前端渲染器并更新资源 URL。
- 注释引用改为蓝色无框，浅色与深色主题使用独立的正文、悬停和焦点颜色。
- 支持 code-server 内 LaTeX Workshop PDF 文字层选区注释，保留 PDF 路径和跨页页码；避免旧代码选区覆盖 PDF 选区，并清理已隐藏或移除的 PDF 标签选区。
- 注释包装保留原生聊天插槽的注入、选择器与存储绑定，修复新版 DSH 中丢失 `usePresentation` 的渲染错误。
- 插件构建使用 DSH 提供的 `react-dom`，避免重复打包导致的 Portal 渲染异常。
- 带注释请求的发送临时气泡和处理中追加消息在首次渲染前显示注释摘要，避免闪现内置说明与 JSON；发送给模型的注释信息保持完整。

## 1.2.0-rc.1 — 2026-10-02 （预发布；2026-10-04 更新）

### 新增功能

- 文件浏览、自然排序、目录展开、自动刷新和预览导航改用 DSH 原生工作区文件树，保留 Amadeus 上传、ZIP 下载、重名处理、删除确认和 code-server 编辑入口。 由 [**@whyself**](https://github.com/whyself)
- 在注释中保留准确的文件、页码和 Markdown 章节链接，使 Agent 整理的笔记保留原文出处。 由 [**@YJC18368291437-ai**](https://github.com/YJC18368291437-ai), [**@whyself**](https://github.com/whyself)

### 问题修复

- 恢复回答中注释引用的渲染和点击定位；正确关联回合开始前的用户消息，保持流式更新中的引用，加载远处 PDF 页和跨页选区后定位并高亮原文。 由 [**@whyself**](https://github.com/whyself)
- 防止后续普通请求继承旧注释，打开出处时使用对应回答所属的会话。 由 [**@whyself**](https://github.com/whyself)
- 删除读取旧 `state.queue` 的队列包装，修复输入区渲染异常。 由 [**@whyself**](https://github.com/whyself)
- 改善 Safari 缺失 API、PDF worker 兼容、触屏滚动、整页缩放防护和独立窗口编辑。 由 [**@YJC18368291437-ai**](https://github.com/YJC18368291437-ai), [**@whyself**](https://github.com/whyself)
- 关闭干净标签后保留编辑器工作台并恢复文件树布局，同时保护未保存内容。 由 [**@YJC18368291437-ai**](https://github.com/YJC18368291437-ai), [**@whyself**](https://github.com/whyself)
- 保留 POSIX 文件名中的字面反斜杠，将删除确认绑定到准确路径与当前版本。 由 [**@whyself**](https://github.com/whyself)
- 适配 DSH 0.2 图标接口，恢复编辑器浅色、深色和跟随系统的外观设置，并保留已保存偏好。 由 [**@whyself**](https://github.com/whyself)

### 体验优化

- 采用原生 PDF/Office 选区颜色，删除旧自建 PDF 和文件树的残留样式。 由 [**@whyself**](https://github.com/whyself)
- 使用 Modern 浅色/深色主题统一编辑区、活动栏、文件侧栏和状态栏颜色，并保留自定义覆盖。 由 [**@whyself**](https://github.com/whyself)
- 完善部署教程中的服务部署与连接方式说明。 由 [**@YJC18368291437-ai**](https://github.com/YJC18368291437-ai), [**@whyself**](https://github.com/whyself)

### 其他变更

- DSH 与 WebServer 固定至 `0.2.1-alpha.1`，Cordis/Schemastery 对齐为 `4.0.5-alpha.1`/`3.18.5-alpha.1`；接入内核的原生 Web 自动化及草稿、Markdown 预览、插件生命周期和目标/队列修复。Amadeus 与四个插件保持 `1.2.0-rc.1`，重新生成锁文件和发布包，并更新 PWA 缓存修订号。内核完整变更及作者见下方上游说明。 由 [**@whyself**](https://github.com/whyself)
- 删除 Safari 原生构造器校验补丁和对应测试，直接使用并验证上游跨 realm 校验；仍保留尚未被上游覆盖的聊天输入框 IME seed 修复。 由 [**@whyself**](https://github.com/whyself)
- 重新发布 Login、Files、Reader、Editor 插件包及 `SHA256SUMS`；验证覆盖 Node、浏览器、Docker、真实 code-server 同步、XeLaTeX、LibreOffice、原生 PDF/Office、IME 和 PWA。 由 [**@whyself**](https://github.com/whyself)
- 升级前保存编辑器内容并备份配置、工作区和数据；使用 `git fetch --force origin tag v1.2.0-rc.1` 获取更新后的 RC1，切换标签后运行 `docker compose up -d --build`，沿用原 Compose 项目及数据卷，随后刷新浏览器。 由 [**@whyself**](https://github.com/whyself)

## 1.1.3 — 2026-09-26

### 问题修复

- 修复 Android 平板和慢速客户端保存时的竞态：成功保存后立即确认磁盘版本，避免将编辑器自身写入误报为外部修改。 由 [**@whyself**](https://github.com/whyself)
- 其他进程修改文件时保留未保存草稿，仅在用户明确确认后重新加载。 由 [**@whyself**](https://github.com/whyself)

### 其他变更

- 四个插件与 PWA 缓存统一为 `1.1.3`；65 项 Node 测试、构建、打包、校验和 Docker 启动验证通过。 由 [**@whyself**](https://github.com/whyself)

## 1.1.2 — 2026-09-25

### 新增功能

- 新增可安装 PWA，包含 manifest、service worker、192/512 图标、独立缓存和移动端元信息，支持桌面浏览器与 Android 平板。 由 [**@whyself**](https://github.com/whyself)
- 支持 Tailscale HTTPS 下的 PWA 启动和安装；manifest、worker 和图标可在登录前读取，业务 HTTP/WebSocket 路由仍由 Basic Auth 保护。 由 [**@whyself**](https://github.com/whyself)

### 问题修复

- 恢复对话收起的原生 0.3 秒网格动画，并尊重减少动态效果的设置。 由 [**@whyself**](https://github.com/whyself)

### 其他变更

- 默认本地端口统一为 `3080`，四个插件统一为 `1.1.2`；64 项 Node 测试、构建、包校验、Docker 部署和 HTTPS service worker 注册验证通过。 由 [**@whyself**](https://github.com/whyself)

## 1.1.1 — 2026-09-25

### 新增功能

- 在右侧侧栏启用原生隔离 HTTP(S) 浏览器，接入 DSH 终端恢复、会话归档、改动审阅及扩展 Office/CSV/TSV 预览。 由 [**@whyself**](https://github.com/whyself)

### 问题修复

- 通过扩展维护文档生命周期、目录事件及逐文件元数据检查，使编辑器失焦或 Windows/Docker 挂载漏发事件时也能刷新已打开文档。 由 [**@whyself**](https://github.com/whyself)
- 只刷新发生变化的 code-server 文本模型，不切换当前标签；保留未保存草稿，跨重连恢复冲突状态，并重试失败的刷新。 由 [**@whyself**](https://github.com/whyself)
- 防止 LaTeX Workshop PDF webview 中的 Ctrl+P 绕过外层打印拦截。 由 [**@whyself**](https://github.com/whyself)

### 体验优化

- 使用原生 `content-visibility` 延迟布局和绘制视口外的已完成回答，流式输出保持即时显示。 由 [**@whyself**](https://github.com/whyself)
- 将 Amadeus PDF 控件替换为 DSH 原生缩放、比例选择和适应宽度控件，删除重复的前端同步订阅。 由 [**@whyself**](https://github.com/whyself)

### 其他变更

- DSH/WebServer 从 `0.1.7-rc.1` 推进至 `0.1.7-rc.2`，Login、Files、Reader 和 Editor 统一为 `1.1.1`。 由 [**@whyself**](https://github.com/whyself)
- 60 项 Node 测试、构建、打包、Docker 启动及真实 code-server 宿主机写入、原子替换、多文档和未保存内容保护回归通过。 由 [**@whyself**](https://github.com/whyself)

## 1.1.0 — 2026-09-24

### 新增功能

- 点击文件默认使用 DSH 原生预览，文件列表及侧栏开始页提供明确的 code-server 编辑入口。 由 [**@whyself**](https://github.com/whyself)
- 对话、文档和代码选区共用评论输入框与蓝色确认流程；回答中的注释引用可定位原文。 由 [**@whyself**](https://github.com/whyself)
- 新增独立编辑器外观设置、代码字号快捷键、实时英文标签和带动画的对话收起入口。 由 [**@whyself**](https://github.com/whyself)

### 问题修复

- 稳定 code-server 启动、文件切换和工作台状态恢复，避免首次打开的文件覆盖上次视图，并保持深色模式下注释标记清晰。 由 [**@whyself**](https://github.com/whyself)

### 体验优化

- 整理文件分类和侧栏组件，重写 Docker Compose 部署说明，保留原生连接与恢复提示。 由 [**@whyself**](https://github.com/whyself)

### 其他变更

- 发布四个 `1.1.0` 插件包，固定 DSH `0.1.6-alpha.2`、code-server `4.104.2` 和 LaTeX Workshop `10.9.0`；Node、浏览器、Docker 和真实编辑器流程验证通过。 由 [**@whyself**](https://github.com/whyself)

## 1.1.0-alpha.2 — 2026-09-23 （预发布）

### 新增功能

- 新增 `dsh-amadeus-editor` 插件，提供带认证的同源 code-server HTTP/WebSocket 代理、各工作台持久化 VS Code 工作区，以及私有的文件/选区/保存状态桥接。 由 [**@whyself**](https://github.com/whyself)
- 编辑、保存、撤销重做和 Markdown 预览改由 code-server 提供；编辑器选区可加入已有 DSH 注释对话。 由 [**@whyself**](https://github.com/whyself)
- 新增 Docker Compose，包含 TeX Live、XeLaTeX、latexmk、Biber、中文字体和 LaTeX Workshop，在服务端完成原生编译。 由 [**@whyself**](https://github.com/whyself)
- 新增连接延迟显示和可配置的原生文件预览读取上限。 由 [**@whyself**](https://github.com/whyself)

### 问题修复

- 在 DSH 标签切换、浮动/全屏布局和冷启动恢复过程中保留编辑器 iframe、草稿与工作台身份。 由 [**@whyself**](https://github.com/whyself)
- 转发 code-server 与扩展动态端口的 WebSocket，使中文 PDF 字体资源保持在认证代理路径下。 由 [**@whyself**](https://github.com/whyself)
- 改善中文输入法组合输入和原生 PDF 缩放/页码控件。 由 [**@whyself**](https://github.com/whyself)

### 体验优化

- 采用 code-server 与 LaTeX Workshop 原生按钮、快捷键和 TeX 右键菜单，移除重复操作栏。 由 [**@whyself**](https://github.com/whyself)

### 其他变更

- 删除自建 CodeMirror 编辑器、草稿/合并管理、Markdown 渲染与打印组件、SwiftLaTeX 资源和旧 source/artifact/texlive 路由。 由 [**@whyself**](https://github.com/whyself)
- 删除 `maxTextBytes`、`kpsewhich` 和 `texliveUpstream`，新增 `editor.upstream` 与 `editor.bridgeDir`；迁移前保存旧浏览器草稿，VS Code 无法自动导入。 由 [**@whyself**](https://github.com/whyself)
- 工作区和四个插件统一为 `1.1.0-alpha.2`，固定 DSH `0.1.6-alpha.2`；50 项 Node 测试、生命周期回归、打包、Compose 检查及真实 Docker Markdown/中文 TeX/PDF/Biber 流程通过。 由 [**@whyself**](https://github.com/whyself)

## 1.1.0-alpha.1 — 2026-09-22 （预发布）

### 新增功能

- 接入 DSH 原生 PDF/Office 文字层，支持记录注释页码和通过引用返回原文。 由 [**@whyself**](https://github.com/whyself)
- 将生成的 LaTeX PDF 写入工作区，并通过上传文档使用的原生侧栏预览；新增有大小限制的原子产物上传。 由 [**@whyself**](https://github.com/whyself)
- 使用蓝色文字层选区提高 PDF/Office 选中内容的可见性。 由 [**@whyself**](https://github.com/whyself)

### 问题修复

- 适配 DSH `0.1.6-alpha.2` 的活跃会话捕获、侧栏分屏和品牌首页标题接口。 由 [**@whyself**](https://github.com/whyself)

### 体验优化

- 采用原生侧栏文件预览和终端；Office 转换交给 DSH 的 LibreOffice 引擎，并支持 Excel。 由 [**@whyself**](https://github.com/whyself)

### 其他变更

- 删除自定义 `open_sidebar` 工具/SSE 通道、terminal 插件、ONLYOFFICE 转换链路、缓存与分页阅读器路由及旧转换配置。 由 [**@whyself**](https://github.com/whyself)
- 删除生成 PDF 的独立查看器、自定义缩放/页码/双指缩放组件及 Reader 自有 PDF.js worker、字体和 WASM 资源；该历史版本仍保留 SwiftLaTeX 与 KaTeX。 由 [**@whyself**](https://github.com/whyself)
- 在 DSH `0.1.6-alpha.2` 上发布工作区/Reader `1.1.0-alpha.1`、Files `1.0.3` 和 Login `1.0.1`。 由 [**@whyself**](https://github.com/whyself)

## 1.0.3 — 2026-09-21

### 问题修复

- 修复重复编译 Markdown 或打开并排预览导致的文档反复创建、浏览器卡顿和内存增长。 由 [**@whyself**](https://github.com/whyself)
- 仅在正文持有者和订阅者均释放后回收文档；将清理延迟到微任务并核对对象身份，保留未保存或正在保存的文档。 由 [**@whyself**](https://github.com/whyself)
- 按监听器快照发送通知，避免重新订阅延长同一轮通知循环。 由 [**@whyself**](https://github.com/whyself)
- 复用已有分栏，并在分栏更新后打开预览，防止重复预览。 由 [**@whyself**](https://github.com/whyself)

### 其他变更

- 增加生命周期和订阅回归；77 项测试通过，1 项未配置的 ONLYOFFICE 集成测试跳过，构建、打包和重复预览浏览器检查通过。 由 [**@whyself**](https://github.com/whyself)
- 工作区及 Reader 升至 `1.0.3`，Files 保持 `1.0.2`，Login/Terminal 保持 `1.0.1`；附件从干净的标签源码构建。 由 [**@whyself**](https://github.com/whyself)

## 1.0.2 — 2026-09-20

### 新增功能

- 接入 Playwright MCP，支持 Agent 浏览网页、操作表单、截图和检查 DOM，并自动准备 Chromium 运行环境。 由 [**@whyself**](https://github.com/whyself)
- 新增 `open_sidebar` 工具和 SSE 通道，供 Agent 打开生成的资源并聚焦侧栏标签。 由 [**@whyself**](https://github.com/whyself)

### 体验优化

- 使用 `--idle-timeout 600000` 在闲置 10 分钟后停止 Playwright 浏览器，后续调用时重新启动。 由 [**@whyself**](https://github.com/whyself)

### 其他变更

- 适配 Cordis 4 沙盒依赖注入，通过 74 项自动化测试。 由 [**@whyself**](https://github.com/whyself)

## 1.0.1 — 2026-09-19

### 问题修复

- 将 DSH WebSocket 心跳间隔从 2 秒延长至 15 秒，约 30 秒未收到应答才判定断连，减少慢速或不稳定网络下的误断线。 由 [**@whyself**](https://github.com/whyself)

### 体验优化

- 保留自动重连和可见的连接状态，目录与文本轮询行为保持原有设计。 由 [**@whyself**](https://github.com/whyself)

## 1.0.0 — 2026-09-18

### 新增功能

- 新增 PDF、Word、PowerPoint 分页阅读，支持文字选择、缩放、跳页、移动端手势和 Range 请求。 由 [**@whyself**](https://github.com/whyself)
- 通过 ONLYOFFICE Document Builder 将 Office 文档转换为可缓存的 PDF 阅读版本。 由 [**@whyself**](https://github.com/whyself)
- 新增安全 Markdown 渲染、KaTeX 公式、同标签及并排预览和打印导出。 由 [**@whyself**](https://github.com/whyself)
- 使用浏览器端 SwiftLaTeX XeTeX/dvipdfmx 编译 LaTeX，支持中文、`ctexart`、TikZ、PDF 文字层和下载。 由 [**@whyself**](https://github.com/whyself)
- 新增 CodeMirror 6 编辑、语法高亮、自动换行、字号调整、撤销重做和保存快捷键。 由 [**@whyself**](https://github.com/whyself)
- 跟踪未保存修改，关闭前确认，刷新外部文件更新；支持基于版本的原子保存、自动合并和三方冲突编辑。 由 [**@whyself**](https://github.com/whyself)
- 新增文件及对话选区注释、已发送注释摘要、回答引用、悬浮详情和原文高亮。 由 [**@whyself**](https://github.com/whyself)
- 新增工作区上传、下载、ZIP、删除和轮询，提供可恢复会话的持久 WebSocket 终端。 由 [**@whyself**](https://github.com/whyself)
- 新增 Amadeus 品牌、Logo、主题和“El Psy Kongroo”首页。 由 [**@whyself**](https://github.com/whyself)

### 其他变更

- 建立 Basic Auth、HTTPS/nginx 与 systemd 模板、工作区边界、符号链接逃逸防护、传输与预览上限及单用户权限模型。 由 [**@whyself**](https://github.com/whyself)
- 建立 Node.js 24 构建、四个独立 DSH 插件包和测试基线。 由 [**@whyself**](https://github.com/whyself)
- 破坏性变更：项目命名空间、路由、插件 ID、DOM 扩展点和缓存键统一为 `amadeus`；使用 `amadeus.local.yml`、`AMADEUS_CONFIG`、`.amadeus/dsh-home`、`amadeus` profile 和 `amadeus.service`。 由 [**@whyself**](https://github.com/whyself)

## 1.2.0-rc.1 — 2026-10-02 (prerelease; updated 2026-10-04)

### New Features

- Use the DSH native workspace file tree for browsing, natural sorting, directory expansion, automatic refresh, and preview navigation. Keep Amadeus upload, ZIP download, collision handling, confirmed deletion, and code-server actions. by [**@whyself**](https://github.com/whyself)
- Keep exact file, page, and Markdown heading links in annotations so agent-authored notes retain their sources. by [**@YJC18368291437-ai**](https://github.com/YJC18368291437-ai), [**@whyself**](https://github.com/whyself)

### Bug Fixes

- Restore rendered, clickable annotation references in assistant replies. Resolve turn-opening user messages outside the turn index, preserve references during streaming, and load distant PDF pages and cross-page selections before locating and highlighting the quoted source. by [**@whyself**](https://github.com/whyself)
- Stop later plain requests from inheriting stale annotation references and use the reply’s session when opening its source. by [**@whyself**](https://github.com/whyself)
- Remove the obsolete queue wrapper that read `state.queue` and caused composer rendering errors. by [**@whyself**](https://github.com/whyself)
- Improve Safari missing-API/PDF-worker compatibility and touch scrolling, page-zoom prevention, and standalone editing. by [**@YJC18368291437-ai**](https://github.com/YJC18368291437-ai), [**@whyself**](https://github.com/whyself)
- Preserve the editor workbench after closing clean tabs and restore its file-tree layout while protecting unsaved content. by [**@YJC18368291437-ai**](https://github.com/YJC18368291437-ai), [**@whyself**](https://github.com/whyself)
- Preserve POSIX filenames containing literal backslashes and bind deletion confirmation to the exact path and current version. by [**@whyself**](https://github.com/whyself)
- Restore light, dark, and system-following editor appearance controls with the DSH 0.2 icon API and preserve saved preferences. by [**@whyself**](https://github.com/whyself)

### Improvements

- Use native PDF/Office selection colors and remove obsolete custom PDF and file-tree styling. by [**@whyself**](https://github.com/whyself)
- Synchronize editor, activity bar, file sidebar, and status bar colors using Modern light/dark themes while preserving custom overrides. by [**@whyself**](https://github.com/whyself)
- Clarify service deployment and connection options in the deployment guide. by [**@YJC18368291437-ai**](https://github.com/YJC18368291437-ai), [**@whyself**](https://github.com/whyself)

### Chores

- Pin DSH and WebServer to `0.2.1-alpha.1`, align Cordis/Schemastery at `4.0.5-alpha.1`/`3.18.5-alpha.1`, and adopt native Web Automation plus upstream draft, Markdown-preview, plugin-lifecycle, and goal/queue fixes. Keep Amadeus and all four plugins at `1.2.0-rc.1`, rebuild the lockfile and release archives, and rotate the PWA cache revision. See the upstream notes below for the core changes and their authors. by [**@whyself**](https://github.com/whyself)
- Remove the Safari intrinsic-constructor patch and its tests; use and verify upstream cross-realm validation directly. Retain the chat-composer IME seed fix that upstream has not yet replaced. by [**@whyself**](https://github.com/whyself)
- Publish rebuilt Login, Files, Reader, and Editor archives with `SHA256SUMS`; validate Node tests, browser regressions, Docker startup, real code-server synchronization, XeLaTeX, LibreOffice, native PDF/Office previews, IME, and PWA behavior. by [**@whyself**](https://github.com/whyself)
- Upgrade by saving editor content, backing up configuration/workspace/data, fetching the refreshed RC1 tag with `git fetch --force origin tag v1.2.0-rc.1`, switching to it, and running `docker compose up -d --build`. Keep the existing Compose project and data volume, then refresh the browser. by [**@whyself**](https://github.com/whyself)

## 1.1.3 — 2026-09-26

### Bug Fixes

- Fix a save race on Android tablets and slow clients by acknowledging the disk version immediately after a successful save, preventing the editor’s own writes from being reported as external changes. by [**@whyself**](https://github.com/whyself)
- Preserve unsaved drafts when another process changes a file; reload only after explicit confirmation. by [**@whyself**](https://github.com/whyself)

### Chores

- Align all four plugins and the PWA cache at `1.1.3`; pass 65 Node tests, build/package/checksum checks, and Docker startup verification. by [**@whyself**](https://github.com/whyself)

## 1.1.2 — 2026-09-25

### New Features

- Add an installable PWA with a manifest, service worker, 192/512 icons, separate caches, and mobile metadata for desktop browsers and Android tablets. by [**@whyself**](https://github.com/whyself)
- Support PWA bootstrap and installation over Tailscale HTTPS. Serve manifest, worker, and icons before login while keeping business HTTP and WebSocket routes behind Basic Auth. by [**@whyself**](https://github.com/whyself)

### Bug Fixes

- Restore the conversation-collapse animation with the native 0.3-second grid transition and respect reduced-motion preferences. by [**@whyself**](https://github.com/whyself)

### Chores

- Use local port `3080` by default, align all four plugins at `1.1.2`, and verify 64 Node tests, builds, package checksums, Docker deployment, and HTTPS service-worker registration. by [**@whyself**](https://github.com/whyself)

## 1.1.1 — 2026-09-25

### New Features

- Enable the native isolated HTTP(S) browser in the right sidebar and inherit DSH terminal restoration, archived-session management, change review, and expanded Office/CSV/TSV previews. by [**@whyself**](https://github.com/whyself)

### Bug Fixes

- Refresh open editor documents even when the browser is unfocused or Windows/Docker mounts miss file events, using extension-owned lifecycle tracking, directory events, and per-file metadata checks. by [**@whyself**](https://github.com/whyself)
- Refresh only the changed code-server text model without switching tabs. Preserve dirty drafts, persist conflicts across reconnects, and retry failed reloads. by [**@whyself**](https://github.com/whyself)
- Prevent Ctrl+P inside the LaTeX Workshop PDF webview from bypassing the outer print guard. by [**@whyself**](https://github.com/whyself)

### Improvements

- Defer layout and painting for settled assistant messages outside the viewport with native `content-visibility`, while keeping streaming output immediate. by [**@whyself**](https://github.com/whyself)
- Replace Amadeus PDF controls with DSH native zoom, scale selection, and fit-width controls; remove duplicated frontend synchronization subscriptions. by [**@whyself**](https://github.com/whyself)

### Chores

- Upgrade DSH/WebServer through `0.1.7-rc.1` to `0.1.7-rc.2` and align Login, Files, Reader, and Editor at `1.1.1`. by [**@whyself**](https://github.com/whyself)
- Pass 60 Node tests, builds, packaging, Docker startup, and real code-server regressions for host writes, atomic replacement, multiple documents, and dirty-draft protection. by [**@whyself**](https://github.com/whyself)

## 1.1.0 — 2026-09-24

### New Features

- Open files in the native DSH preview by default and offer explicit code-server edit actions from the file list and sidebar start page. by [**@whyself**](https://github.com/whyself)
- Use one comment editor and blue confirmation flow for conversation, document, and code selections; let assistant annotation references navigate to the source. by [**@whyself**](https://github.com/whyself)
- Add separate editor appearance settings, code-font shortcuts, live English labels, and an animated conversation-collapse action. by [**@whyself**](https://github.com/whyself)

### Bug Fixes

- Stabilize code-server startup, file switching, and restored workspace state so the first opened file does not overwrite the previous view; retain clear annotation markers in dark mode. by [**@whyself**](https://github.com/whyself)

### Improvements

- Organize file classification and sidebar components, rewrite Docker Compose deployment guidance, and retain native connection/recovery indicators. by [**@whyself**](https://github.com/whyself)

### Chores

- Release four `1.1.0` plugin packages with DSH `0.1.6-alpha.2`, code-server `4.104.2`, and LaTeX Workshop `10.9.0`; verify Node, browser, Docker, and real editor workflows. by [**@whyself**](https://github.com/whyself)

## 1.1.0-alpha.2 — 2026-09-23 (prerelease)

### New Features

- Add the `dsh-amadeus-editor` plugin with authenticated same-origin code-server HTTP/WebSocket proxying, persistent per-workbench VS Code workspaces, and a private file/selection/save-state bridge. by [**@whyself**](https://github.com/whyself)
- Move editing, saves, undo/redo, and Markdown preview to code-server; attach editor selections to existing DSH annotation conversations. by [**@whyself**](https://github.com/whyself)
- Add Docker Compose with TeX Live, XeLaTeX, latexmk, Biber, Chinese fonts, and LaTeX Workshop for native server-side compilation. by [**@whyself**](https://github.com/whyself)
- Add connection latency display and a configurable native file-preview read limit. by [**@whyself**](https://github.com/whyself)

### Bug Fixes

- Retain editor iframes, drafts, and workspace identity across DSH tab changes, floating/fullscreen layouts, and cold-start restoration. by [**@whyself**](https://github.com/whyself)
- Forward code-server and extension dynamic-port WebSockets and keep Chinese PDF fonts under the authenticated proxy path. by [**@whyself**](https://github.com/whyself)
- Improve Chinese IME composition and native PDF zoom/page controls. by [**@whyself**](https://github.com/whyself)

### Improvements

- Use code-server and LaTeX Workshop native buttons, shortcuts, and TeX context menus; remove the duplicated action bar. by [**@whyself**](https://github.com/whyself)

### Chores

- Remove the custom CodeMirror editor, draft/merge manager, Markdown renderer/print components, SwiftLaTeX assets, and old source/artifact/texlive routes. by [**@whyself**](https://github.com/whyself)
- Remove `maxTextBytes`, `kpsewhich`, and `texliveUpstream`; add `editor.upstream` and `editor.bridgeDir`. Save old unsaved browser drafts before migration because VS Code cannot import them. by [**@whyself**](https://github.com/whyself)
- Align the workspace and four plugins at `1.1.0-alpha.2`, pin DSH `0.1.6-alpha.2`, and pass 50 Node tests, lifecycle regressions, packaging, Compose checks, and real Docker Markdown/Chinese TeX/PDF/Biber workflows. by [**@whyself**](https://github.com/whyself)

## 1.1.0-alpha.1 — 2026-09-22 (prerelease)

### New Features

- Integrate native DSH PDF/Office text layers with annotation page provenance and reference navigation. by [**@whyself**](https://github.com/whyself)
- Write generated LaTeX PDFs into the workspace and preview them through the same native sidebar route as uploaded documents; add bounded atomic artifact uploads. by [**@whyself**](https://github.com/whyself)
- Improve PDF/Office selection visibility with a blue text-layer selection color. by [**@whyself**](https://github.com/whyself)

### Bug Fixes

- Adapt active-session capture, sidebar split handling, and the branded conversation headline to DSH `0.1.6-alpha.2` APIs. by [**@whyself**](https://github.com/whyself)

### Improvements

- Use native sidebar file previews and terminals; delegate Office conversion to DSH’s LibreOffice-based converter with Excel support. by [**@whyself**](https://github.com/whyself)

### Chores

- Remove the custom `open_sidebar` tool/SSE channel, terminal plugin, ONLYOFFICE pipeline, cached/page reader routes, and obsolete conversion settings. by [**@whyself**](https://github.com/whyself)
- Remove the generated-PDF viewer, custom zoom/page/pinch components, and reader-owned PDF.js worker/font/WASM assets; retain SwiftLaTeX and KaTeX for this historical version. by [**@whyself**](https://github.com/whyself)
- Release workspace/Reader `1.1.0-alpha.1`, Files `1.0.3`, and Login `1.0.1` on DSH `0.1.6-alpha.2`. by [**@whyself**](https://github.com/whyself)

## 1.0.3 — 2026-09-21

### Bug Fixes

- Fix repeated Markdown compilation/adjacent preview causing document recreation loops, browser stalls, and growing memory use. by [**@whyself**](https://github.com/whyself)
- Reclaim document records only after both owners and subscribers are gone, defer cleanup to a microtask, recheck object identity, and preserve dirty/saving documents. by [**@whyself**](https://github.com/whyself)
- Notify a snapshot of listeners so resubscription cannot extend the same notification loop. by [**@whyself**](https://github.com/whyself)
- Reuse an existing split pane and open previews after its update to prevent duplicate previews. by [**@whyself**](https://github.com/whyself)

### Chores

- Add lifecycle and subscription regressions; verify 77 tests with one unconfigured ONLYOFFICE integration test skipped, build/package checks, and repeated-preview browser checks. by [**@whyself**](https://github.com/whyself)
- Set workspace/Reader to `1.0.3`, retain Files `1.0.2` and Login/Terminal `1.0.1`, and build release assets from clean tagged source. by [**@whyself**](https://github.com/whyself)

## 1.0.2 — 2026-09-20

### New Features

- Integrate Playwright MCP for agent browser navigation, form actions, screenshots, and DOM inspection, with automatic Chromium runtime setup. by [**@whyself**](https://github.com/whyself)
- Add the `open_sidebar` tool and an SSE delivery channel so the agent can open generated resources and focus sidebar tabs. by [**@whyself**](https://github.com/whyself)

### Improvements

- Stop idle Playwright browsers after 10 minutes using `--idle-timeout 600000`; restart them on subsequent use. by [**@whyself**](https://github.com/whyself)

### Chores

- Adapt the integration to Cordis 4 sandbox dependency injection and pass 74 automated tests. by [**@whyself**](https://github.com/whyself)

## 1.0.1 — 2026-09-19

### Bug Fixes

- Increase the DSH WebSocket heartbeat interval from 2 to 15 seconds and declare disconnection after approximately 30 seconds without replies, reducing false disconnects on slow or unstable connections. by [**@whyself**](https://github.com/whyself)

### Improvements

- Retain automatic reconnection and visible connection status while preserving directory/text polling behavior. by [**@whyself**](https://github.com/whyself)

## 1.0.0 — 2026-09-18

### New Features

- Add paginated PDF, Word, and PowerPoint reading with selectable text, zoom, page navigation, mobile gestures, and Range requests. by [**@whyself**](https://github.com/whyself)
- Convert Office documents to cached reading PDFs through ONLYOFFICE Document Builder. by [**@whyself**](https://github.com/whyself)
- Add safe Markdown rendering, KaTeX formulas, same-tab/adjacent previews, and print export. by [**@whyself**](https://github.com/whyself)
- Compile LaTeX in the browser with SwiftLaTeX XeTeX/dvipdfmx, Chinese text, `ctexart`, TikZ, PDF text layers, and downloads. by [**@whyself**](https://github.com/whyself)
- Add CodeMirror 6 editing, syntax highlighting, wrapping, font-size controls, undo/redo, and save shortcuts. by [**@whyself**](https://github.com/whyself)
- Track unsaved changes, confirm closes, refresh external file changes, and support atomic versioned saves, automatic merges, and three-way conflict editing. by [**@whyself**](https://github.com/whyself)
- Add file/conversation annotations, sent annotation summaries, assistant reference links, hover details, and source highlighting. by [**@whyself**](https://github.com/whyself)
- Add workspace uploads, downloads, ZIP archives, deletion, and polling; provide persistent WebSocket terminals with restored sessions. by [**@whyself**](https://github.com/whyself)
- Add Amadeus branding, logo, theme, and the “El Psy Kongroo” home page. by [**@whyself**](https://github.com/whyself)

### Chores

- Establish Basic Auth, HTTPS/nginx and systemd templates, workspace boundaries, symlink-escape protection, transfer/preview limits, and the single-user permission model. by [**@whyself**](https://github.com/whyself)
- Establish Node.js 24 builds, four standalone DSH plugin archives, and the test baseline. by [**@whyself**](https://github.com/whyself)
- Breaking change: unify project namespaces, routes, plugin IDs, DOM extension points, and cache keys under `amadeus`; use `amadeus.local.yml`, `AMADEUS_CONFIG`, `.amadeus/dsh-home`, the `amadeus` profile, and `amadeus.service`. by [**@whyself**](https://github.com/whyself)
