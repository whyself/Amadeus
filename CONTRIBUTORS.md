# 贡献者与修改来源

## YeJingchen · [@YJC18368291437-ai](https://github.com/YJC18368291437-ai)

感谢 YeJingchen 在 [Amadeus fork](https://github.com/YJC18368291437-ai/Amadeus) 中提供的兼容修复、编辑器体验改进和部署文档。本仓库于 2026-10-02 按维护者审批范围选择并调整了部分实现；以下记录只对应实际采用的功能，不表示整体合并 fork。

| 采用或参考的功能 | 原始提交 |
| --- | --- |
| Safari 缺失 API 与 PDF worker 兼容 | [082db1c](https://github.com/YJC18368291437-ai/Amadeus/commit/082db1c3d73c4332533778b3b7860a311fca36d8)，以及最初的 [441df31](https://github.com/YJC18368291437-ai/Amadeus/commit/441df31609f7e4b669df1108de1fc51d15ed4e93) 中的相关实现 |
| Safari 原生构造器校验修复 | [fceec6d](https://github.com/YJC18368291437-ai/Amadeus/commit/fceec6dfc2478efc1ebbb11ddcf49a822f4bbb27) |
| 编辑标签关闭后保留工作台、显示文件树等编辑器布局参考 | [c2e3903](https://github.com/YJC18368291437-ai/Amadeus/commit/c2e39031b76d5535a1c47920d5c7d3a93af4dad7) 中获准的部分 |
| 注释中的出处链接与 AI 整理时保留出处 | [0096da1](https://github.com/YJC18368291437-ai/Amadeus/commit/0096da172abe1fd93836fb48c3dee47f456528c2)，[fd8d1e4](https://github.com/YJC18368291437-ai/Amadeus/commit/fd8d1e452403657fdc0355e268390669fba29c14) 中的出处部分 |
| iPad 整页缩放与漂移防护 | [53431f3](https://github.com/YJC18368291437-ai/Amadeus/commit/53431f398ffd76a6cc40835164e6241d1dff27c4)，[0f5f0ab](https://github.com/YJC18368291437-ai/Amadeus/commit/0f5f0ab8bd845c1731ca9e499bb5e86cc56f504a)，[44ffdf0](https://github.com/YJC18368291437-ai/Amadeus/commit/44ffdf0927731ba3bef644d7ad030f2c1f704463) 中的手势与布局部分 |
| 部署教程结构参考，按主仓库脚本重写成“部署服务端 → 选择连接方式” | [da370a1](https://github.com/YJC18368291437-ai/Amadeus/commit/da370a168fbfaa9b25dbc70fff03fdff3f3de233)，[cb6da4d](https://github.com/YJC18368291437-ai/Amadeus/commit/cb6da4dd4b51ece919012de8ca2e701e651513aa) |

Safari 兼容按适用环境接入，保留 PWA 和 Chrome 的原有行为。编辑器保持主仓库的工作台身份与未保存内容保护。没有采用 notebook 扩展、`/note` 快记与自动 Git 推送、Synapse 会话地图、学习面板、关闭 PWA、服务更新强制刷新，以及全局移除长聊天渲染优化。

### Git 中如何记录共同贡献

对于保留原提交的直接 cherry-pick，Git 会保留原作者。本次是选择、改写多个提交中的部分功能，集成提交由维护者提交，并通过 `Co-authored-by` trailer 标注共同贡献：

~~~text
Co-authored-by: YeJingchen <314240075+YJC18368291437-ai@users.noreply.github.com>
~~~

这里使用该公开 GitHub 账号的 ID 与登录名组成 GitHub noreply 地址，无需获取个人邮箱或登录贡献者账号。GitHub 通过提交作者/共同作者邮箱关联账号；共同作者标记是归属记录，不代表贡献者对集成提交进行了签名或审批。贡献活动是否显示还受 GitHub 默认分支等规则影响。
