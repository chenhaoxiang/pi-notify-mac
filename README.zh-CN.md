# pi-notify-mac

[English](README.md) | 中文

面向 macOS 的 Pi 通知扩展，一个包负责两类提醒：**任务完成**与**等待人工处理**。任务收尾后发送系统通知、播放 Glass、更新终端标题并响铃；确认、选择或输入界面真正打开后，显示可取消的系统警告窗、播放 Hero，每 30 秒重复提醒，并支持跳回对应 Terminal/iTerm 标签。提醒不会代替你回答，也不授予执行权限。

## 要求

- macOS 与支持扩展/包管理的 Pi；输入生命周期已按 Pi 1.3.0-fork.1 核对。
- 系统自带的 `osascript` 和 `afplay`，不新增运行时依赖。

## 安装与迁移

候选版本为 **0.3.0**；PR、CI、不可变 Release 与校验回读完成前，不视为已发布。历史版本保持不变。

全新安装使用固定发布版本：

```bash
pi install git:github.com/chenhaoxiang/pi-notify-mac@v0.3.0
```

**已经安装手工扩展的用户需要先迁移。** 在可信、完成校验的解压包内执行：

```bash
sh install.sh
```

安装器将完整包放入个人 agent 目录，把旧的 `approval-notify.ts` / `pi-notify-mac.ts` 及原设置保全到扩展发现目录之外，移除对应声明，只启用一个包来源。可用 `PI_AGENT_DIR` 或 `PI_CODING_AGENT_DIR` 指定隔离目录。其他设置和已有资源过滤配置保持不变；同版本目录字节冲突或过滤配置冲突时停止，不覆盖。

**新版不能只复制入口文件**，入口已经依赖同目录模块。不要同时启用包与旧手工扩展；仅在扩展目录内改文件名不足以停用。详见[输入提醒、迁移与恢复](docs/input-reminders.md)。

需要跟踪维护主线时才使用 `@main`。用 `pi list` 核对来源，卸载时使用 `pi remove <实际来源>`。安装只改变磁盘，不会热加载已运行的会话；请在方便时自行重启。活跃的 Subagents 可能拒绝混合模块的 `/reload`，不为升级强停任务。

## 配置

两类提醒默认分别启用，可以单独关闭：

| 环境变量 | 默认值 | 作用 |
|---|---|---|
| `PI_NOTIFY_MAC_COMPLETION` | 启用 | `0`、`false` 或 `off` 只关闭完成提醒 |
| `PI_NOTIFY_MAC_SOUND` | `Glass` | 完成提示音；空值不关闭终端标题和响铃 |
| `PI_NOTIFY_MAC_GRACE_MS` | `6000` | 可取消的完成提醒延迟；零值不取消保护检查 |
| `PI_NOTIFY_MAC_INPUT` | 启用 | 使用相同关闭值，只关闭输入提醒 |
| `PI_NOTIFY_MAC_INPUT_SOUND` | `Hero` | 系统声音名；空值保留弹窗但不播放声音 |
| `PI_NOTIFY_MAC_INPUT_DELAY_MS` | `250` | 输入弹窗出现前的可取消延迟 |
| `PI_NOTIFY_MAC_INPUT_REPEAT_MS` | `30000` | 弹窗打开期间重复播放声音的间隔；零值不重复 |

```bash
PI_NOTIFY_MAC_INPUT=0 pi
PI_NOTIFY_MAC_INPUT_SOUND='' pi
PI_NOTIFY_MAC_COMPLETION=0 pi
```

关闭值忽略大小写与两端空格。毫秒值仅接受 0 至 2147483647 的十进制整数，非法值使用默认值；非零重复间隔小于 1000ms 时回退 30000ms，避免大量创建声音进程。扩大 Subagents 结果合并窗口后，应相应增大完成提醒延迟；固定延迟不是任意负载下的时序保证。macOS 权限及终端设置影响实际效果。

## 工作原理

完成提醒监听最终的 `agent_settled`，而不是较早的 `agent_end`。存在待处理消息或同会话顶层/嵌套 queued/running 子任务时抑制通知，以磁盘和会话文件身份判断归属；未知、损坏或无法核验的状态不当作“已完成”。发送前再次检查。这只表示会话回到空闲，不保证所有子任务成功或外部工作结束。原有四个冻结发送辅助函数及断言保持不变。

输入提醒跟随真实 `ui_prompt_start/end` 生命周期。确认、选择、输入和编辑器会提醒；custom 问答只根据 `rpiv-ask-user-question` 0.1.4-fork.5 或兼容实现发出的 `pi:input-required` 明确生命周期提醒。即使已有提问工具执行，其他 custom 浮层仍不提醒；仅发出工具调用也不提醒。旧版提问工具仍正常工作，但不提供这条可选的精确提醒信号。每个最外层交互区间只提醒一次；回答、取消、新任务、会话替换和退出会取消定时器并终止所属弹窗、声音与跳转进程。点“知道了”只关闭提醒，不回答原问题。系统弹窗不显示问题标题、正文、选项、答案或工具参数。

Terminal 按进程与 tty 精确定位，查询与跳转异步且有超时；失败不会激活另一个 Terminal 实例冒充成功。其他受支持终端只明确提供“打开终端应用”。详见[输入提醒与旧扩展迁移](docs/input-reminders.md)。

只有 macOS TUI 产生这些效果；RPC/JSON/print 及无 UI 输入场景保持安静。任何阻塞 UI 都会暂停尚未发送的完成提醒；关闭后使用当前上下文重验，仍符合条件才重新延迟提醒。见[恢复合同](docs/settled-ui-resume.md)。

## 查看通知状态

`/notify-status` 只读显示完成保护条件、上次生命周期判断、两个开关及输入提醒状态，不发送系统通知、弹窗、响铃或模型请求。满足条件不等于任务成功，请求发送也不等于 macOS 已显示。Subagents 合同限定在已核验的 0.76.1-fork.1 与 0.78.0-fork.1，不承诺所有后续版本。见[诊断与兼容说明](docs/notification-diagnostics.md)。

## 开发与验证

完整源码目录可临时加载，不需要安装：

```bash
pi -e ./src/pi-notify-mac.ts
npm test
node scripts/check-subagents-contract.mjs --repo <Subagents检出目录>
node scripts/check-subagents-contract.mjs --repo <Subagents检出目录> --fixture subagents-0.78.0-contract.json
```

测试需要 Node 24 或支持 TypeScript 擦除及 VM 模块的版本。保留发布版/手工版冻结 fixtures 与断言；运行时用虚拟文件系统、子进程、定时器和终端输出，安装器使用 `tmp/` 下的一次性 agent 目录。不发送真实通知、声音或模型请求，不读取真实运行数据。CI 核对固定公开 Subagents 源码，不执行 Subagents。隔离 Pi RPC 只证明包注册和加载，不等于真实 macOS 效果或现有会话热加载通过。

## 发布与维护

本项目是原创扩展，使用普通 SemVer 与 `v<版本>` tag，`main` 经过 PR 更新，不虚构社区上游。[GitHub Releases](https://github.com/chenhaoxiang/pi-notify-mac/releases) 提供可安装包、精确来源清单与 SHA256SUMS；下载回读校验后再安装。GitHub 发布不等于 npm 发布。详见[维护说明](docs/releasing.md)和历史[完成提醒迁移合同](docs/notification-completion.md)。

## 许可证

MIT
