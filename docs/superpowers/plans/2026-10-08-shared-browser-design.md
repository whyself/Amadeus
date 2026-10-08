# AI 浏览器只读展示：实现记录

日期：2026-10-08。分支：`codex/shared-browser`。独立 worktree：`C:/Users/11588/.codex/worktrees/shared-browser/Amadeus`。

## 用户调整后的范围

用户明确选择：原生 iframe 浏览器供用户独立操作，展示 AI 操作过程的流式面板只读。此前接管、输入回传和交还流程取消。ZCode 的实例归属、页面身份、幂等打开、可见性与生命周期分离仍作为参考。

## 架构

- 原生 `kind: browser` 完整保留。新增 `kind: amadeus-ai-browser`，不覆盖或接管原生 iframe。
- 每个普通对话对应同容器内独立 Chromium 子进程；CDP 仅回环访问，宿主只发布现有 3080 端口。
- 使用官方 DSH SessionResources、MCP 客户端和工具管线；在明确来源、版本和 MIT 声明的 checked-in 运行时副本中加入每 Agent 连接获取、运行回调、重连与 ready 通知。没有修改 node_modules。
- 固定 MCP 0.0.80 的公开 `browser_run_code_unsafe` 工具用于静态、可信的内部身份读取：通过 Playwright Page 的 CDP Target.getTargetInfo 获取真实 targetId。内部调用复用已有连接、在会话队列内执行，避免嵌套调度死锁；不用 URL 或页面数组索引猜身份。
- 当前对话的浏览器导航/读取/操作完成后发布 reveal。客户端每轮至多自动打开一次，后台对话不抢当前侧栏；本轮收起后保持收起，下一轮可重新展开。
- Page.startScreencast JPEG 帧经认证 WebSocket 到 canvas。客户端不监听输入，服务端除恢复连接外拒绝用户操作命令。只保留可发送帧，不积压旧帧。
- 可见性只影响画面订阅，AI 无需等待 viewer，收起或切换后照常操作。
- Cookie/profile 按对话保存在现有数据卷；最近非空 URL 保存到独立 checkpoint。退出与启动空白页不会清空它；不承诺页面内存/表单恢复。
- 崩溃后重新连接重建 Chromium/MCP；Chromium 或 MCP 初始化失败时保留可再次重试的状态。

## 已完成

- [x] 官方插件接入前置改动独立提交到 worktree。
- [x] BrowserManager 进程、页面、实例代次和持久数据。
- [x] 官方会话运行时的连接适配与串行执行。
- [x] 同 URL 页面和当前 MCP Page 的 targetId 验证。
- [x] 认证画面流及有界发送。
- [x] 只读 AI 侧栏与事件自动打开。
- [x] 原生用户 iframe 保留，输入/登录状态独立。
- [x] 当前轮收起抑制、下一轮展开、后台状态隔离。
- [x] 退出持久信息与崩溃重试回归。

## 验证与限制

针对性 Windows 实测包含：独立对话、同 URL 页面身份、拒绝用户操作的 API、JPEG 画面、保存页面恢复、故意使用错误可执行文件后的再次重试，以及完整 DSH 页面中的自动打开、只读地址/画布、收起与原生 iframe 独立输入。

截图位于忽略的 test-results/。Docker 构建和 Linux 运行结果在最终验证完成后补充。外部模型调用、真实远端公网网络和 iPad 硬件未作为此次测试样本。开发分支尚未合并或部署到现有用户服务。

## 参考

- [ZCode 视图](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/packages/ui/src/browser-use/UnifiedBrowserView.tsx)
- [ZCode 实例管理](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/packages/desktop/src/main/browserView/browserGuestManager.ts)
- [ZCode 侧栏状态](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/packages/ui/src/lib/workspaceSidePane.ts)
- [DSH 原始运行时](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/experimental/browser-use-runtime/src/mcp.ts)
