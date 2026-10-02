# Amadeus

Amadeus 是面向单用户的 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 工作台扩展。它在 DSH 原生对话和文件侧栏中加入项目文件管理、内嵌 code-server、LaTeX 编译，以及可定位原文的选区注释。

**当前版本：v1.2.0。** 当前代码固定依赖 DSH `0.2.0-rc.2`（预发布候选版）、code-server `4.104.2` 和 LaTeX Workshop `10.9.0`。推荐用 Docker Compose 部署；宿主机无需单独安装 Node.js、code-server 或 TeX Live。

第一次安装请看 [部署与连接教程](docs/guide-deployment.md)：先选择 Windows Docker、WSL Ubuntu 或远端 Linux 部署服务，再选择本机、Tailscale 私有 HTTPS 或公网域名访问。v1.2.0 包含 DSH 升级、Safari 兼容、注释出处链接和编辑器工作台恢复改进。

## 能做什么

| 功能 | 使用方式 |
| --- | --- |
| 文件预览 | 点击文件默认使用 DSH 原生侧栏；支持 HTML、Markdown、PDF、Office、图片和代码等格式 |
| 代码编辑 | 点击文件旁的编辑按钮，或从侧栏开始页打开 code-server；文件标签、保存和扩展由 code-server 管理 |
| LaTeX | 镜像内含 TeX Live、XeLaTeX、latexmk、Biber、中文字体和 LaTeX Workshop |
| 选区注释 | 选中对话、原生文档或编辑器文本，填写可选评论后点蓝色对勾；回答里的注释引用可定位原文 |
| 工作区 | DSH 原生文件树负责浏览与自动刷新；文件旁的按钮提供上传、ZIP 下载、重名处理和删除确认 |
| 网页浏览器 | 在右侧侧栏打开隔离的 HTTP(S) 网页，与当前工作区并排浏览 |
| 外观 | DSH 与编辑器可分别选择浅色、深色或跟随系统；侧栏可收起中间对话 |

## Docker Compose 部署

### 1. 准备

安装 Docker Engine 与 Compose，或启用 Linux 容器的 Docker Desktop。克隆正式版并准备私有配置和工作区：

~~~bash
git clone --branch v1.2.0 --depth 1 https://github.com/whyself/Amadeus.git
cd Amadeus
cp amadeus.docker.example.yml amadeus.local.yml
mkdir -p workspace
~~~

Windows PowerShell 对应命令：

~~~powershell
git clone --branch v1.2.0 --depth 1 https://github.com/whyself/Amadeus.git
Set-Location Amadeus
Copy-Item amadeus.docker.example.yml amadeus.local.yml
New-Item -ItemType Directory -Force workspace
~~~

打开 `amadeus.local.yml`，至少把 `username` 和 `password: CHANGE-ME` 改为自己的登录凭据。Docker 示例中的路径已与 [compose.yml](compose.yml) 对应：

~~~yaml
host: 0.0.0.0
port: 3080
home: /data/dsh-home
workspace: /workspace
~~~

`host: 0.0.0.0` 只表示容器内监听；Compose 默认将宿主机端口绑定到 `127.0.0.1:3080`。文件放在宿主机的 `workspace/` 目录中。

### 2. 构建并启动

~~~bash
docker compose config --quiet
docker compose up -d --build
docker compose logs -f amadeus
~~~

首次构建会下载 code-server、LaTeX Workshop 和 TeX Live，耗时及镜像体积取决于网络和 Docker 缓存。日志出现 `dsh web: http://127.0.0.1:3080` 后，打开 <http://127.0.0.1:3080> 并使用上一步设置的凭据登录。停止查看日志用 `Ctrl+C`，不会停止容器。

Docker Hub 无法访问时，可改用 Docker 官方镜像的 AWS 镜像源构建基础层：

~~~bash
docker compose build --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:24-bookworm-slim
docker compose up -d
~~~

### 3. 数据与升级

| 位置 | 保存的内容 |
| --- | --- |
| `./workspace` → `/workspace` | 项目文件、TeX 源码和编译产物 |
| Compose 命名卷 `amadeus-data` → `/data` | DSH 会话与设置、code-server 配置和扩展、工作台恢复数据 |
| `./amadeus.local.yml` → `/config/amadeus.yml` | 私有登录与服务配置，只读挂载 |

`amadeus-data` 是 Compose 中的卷键；Docker 显示的实际卷名通常还带有 Compose 项目前缀。升级时保持同一项目目录或相同的 `COMPOSE_PROJECT_NAME`，才能自动复用原卷。

升级前备份这三处数据。`docker compose down` 会保留命名卷；升级时沿用原来的 `amadeus.local.yml`、`workspace/` 和卷，然后执行：

~~~bash
git fetch --tags
git switch --detach v1.2.0
docker compose up -d --build
~~~

从旧版迁移到 Docker 时，把项目文件放进 `workspace/`，并把配置里的工作区路径改为容器路径 `/workspace`；历史记录中原有的 Windows 绝对路径不会自动变成容器路径。更新时保留 `/data` 卷，VS Code 设置、已安装扩展和会话才能继续使用。

### 4. 远程访问

默认配置仅开放宿主机回环地址。远程访问时，在同一台机器上用 HTTPS 反向代理转发到 `127.0.0.1:3080`，并启用 WebSocket 转发；[nginx 示例](deploy/nginx.conf.example)可放入现有 HTTPS `server` 块。Basic 登录凭据必须通过 HTTPS 传输。

容器中的无密码 code-server 只监听容器回环地址 `127.0.0.1:8080`，不向宿主机发布端口；Amadeus 的认证代理负责它的 HTTP 和 WebSocket 请求。

### PWA 安装

Amadeus 内置可安装 PWA。使用 `http://127.0.0.1:3080` 或配置 HTTPS 反向代理访问，登录后即可在 Chrome、Edge 等浏览器的地址栏或菜单中选择“安装 Amadeus”。PWA 使用独立缓存保存已访问的页面和静态资源；文件、编辑器、会话接口和 WebSocket 始终走网络，不会被 service worker 离线缓存。

## 日常使用

1. 在 DSH 中选工作区，侧栏的“工作区文件”列出 `/workspace` 内容。点击文件得到原生预览；点文件旁的编辑按钮才进入 code-server。
2. 编辑器内 `Ctrl/Cmd + S` 保存。选中文字后点击“＋ 添加到对话”，填写可选评论并用蓝色对勾提交。`Ctrl/Cmd` + `+`、`-`、`0` 只调整代码字号。
3. Markdown 预览是 code-server 内置功能；`Ctrl+Shift+V` 打开预览，`Ctrl+K` 后按 `V` 打开侧边预览。code-server 可安装兼容的 VS Code 扩展。
4. LaTeX Workshop 默认使用 `latexmk -xelatex`。`Ctrl+Alt+B` 编译，`Ctrl+Alt+V` 查看 PDF；多文件项目可用 `% !TEX root = ../main.tex` 指定主文件。自动构建默认关闭。
5. DSH 设置中的“外观”和“编辑器外观”分别控制两套主题。左侧“收起对话”可让右侧工作台获得更多空间。

## 维护与排查

~~~bash
docker compose ps
docker compose logs --tail=200 amadeus
docker compose restart amadeus
~~~

编辑器首次打开需等待 code-server 和 Amadeus Bridge 就绪。若页面长期显示连接错误，先查看容器日志，再检查 Docker 数据卷是否可由容器内 `node` 用户读写。`amadeus.local.yml` 中的 `playwrightMcp.enabled` 可设为 `false`，以关闭内置浏览器自动化。

Office 文件通过 DSH 原生 LibreOffice 服务转成预览 PDF；扫描件没有可选择的文字层。Amadeus 按单用户工作台设计，登录用户可操作工作区文件和容器内终端。

## 开发与发布产物

非 Docker 开发需要 Node.js 24+，并自行启动 code-server、安装 `packages/editor/extension` 中的桥接扩展及 LaTeX Workshop；[非 Docker 配置示例](amadeus.example.yml)列出服务参数。

启动 code-server 前，对固定的 `4.104.2` 安装目录执行 `node scripts/patch-code-server.mjs <code-server安装目录>`，然后重启 code-server 并刷新编辑器页面。Docker 构建自动完成此步骤。补丁安装按文件更新文档模型的内部命令，未知 workbench 构建会拒绝修改。

~~~bash
npm ci
npm test
npm run build
npm run test:editor-browser
npm run test:files-browser
npm run test:browser-compat
npm run pack:plugins
~~~

浏览器回归默认调用已安装的 Edge，可用 `TEST_BROWSER_CHANNEL=chrome` 切换。打包结果在 `.release/`：Login、Files、Reader、Editor 四个 `1.2.0` 插件包。正式 GitHub Release 附带这四个压缩包和 `SHA256SUMS`。

`npm run test:editor-browser` 验证组件与模拟 iframe。真实失焦刷新回归使用 `npm run test:editor-live`：先将 `AMADEUS_TEST_IMAGE` 环境变量设为本地构建的 Amadeus 镜像标签。测试自动启动独立 Docker 容器，使用 `test-results/` 下的测试工作区验证宿主机写入、原子替换和未保存修改保护，结束时删除测试容器并保留截图。

后台同步不依赖浏览器焦点：扩展监听文档生命周期与目录事件，并每秒对已跟踪的打开文件执行一次元数据检查。该检查用于 Docker Desktop 等可能漏文件事件的挂载目录，不扫描整个工作区；只有发现版本变化时才读取文档。未保存修改会显示冲突，需用户明确选择重新加载才会丢弃。

代码位置：`packages/login` 负责认证，`packages/files` 负责工作区文件，`packages/reader` 负责注释与原生预览增强，`packages/editor` 负责 code-server 集成。详细变更见 [CHANGELOG.md](CHANGELOG.md)。

## 贡献

感谢社区对浏览器兼容、编辑器体验与部署文档的改进。贡献者及所采用修改的来源见 [CONTRIBUTORS.md](CONTRIBUTORS.md)。
