# pi-notify-mac

[English](README.md) | 中文

面向 macOS 的 Pi 完成通知扩展。Pi 会话完成重试、上下文压缩和后续队列处理，进入 `agent_settled` 后，会发送系统通知、播放默认的 `Glass` 提示音、将终端标题改为 `✓ <项目名>`，并发出终端响铃。适合同时运行多个 Pi 会话、经常切换终端的场景。

## 要求

- macOS；
- 支持扩展与包管理的 Pi；
- 系统自带的 `osascript`。

## 安装

**安装前先保全已有手工副本，并将它移到 `~/.pi/agent/extensions/` 之外。** 两份同时启用会重复通知；只在仍被发现的扩展目录内改个文件名，不是可靠的停用方法。

推荐固定 GitHub 发布版本：

```bash
pi install git:github.com/chenhaoxiang/pi-notify-mac@v0.1.1
```

需要跟踪维护主线时才使用 `@main`。安装后重启 Pi；活跃的 Subagents 0.76.1 运行时可能拒绝混用新旧模块的 `/reload`，不要为升级强制停止会话。用 `pi list` 查看来源，用 `pi remove git:github.com/chenhaoxiang/pi-notify-mac@v0.1.1` 卸载。也可下载Release、校验后解压到永久目录，作为固定本地package安装。

### 手动安装（备选）

```bash
mkdir -p ~/.pi/agent/extensions
cp src/pi-notify-mac.ts ~/.pi/agent/extensions/pi-notify-mac.ts
```

手动安装与包安装二选一。

## 发布与维护

当前制品版本为 **0.1.1**。本项目是原创扩展，使用普通 SemVer 和 `v<版本>` tag，不虚构社区上游或 `upstream-main`。`main` 是经过 PR 更新的发布主线，历史 v0.0.1 保留不变。

[GitHub Releases](https://github.com/chenhaoxiang/pi-notify-mac/releases) 提供可安装包、来源清单和 `SHA256SUMS`，校验后再安装。GitHub 发布不等于 npm 发布。完整流程见[维护说明](docs/releasing.md)。

## 配置

默认声音为 `Glass`，可通过环境变量修改：

```bash
PI_NOTIFY_MAC_SOUND=Ping pi
```

不播放声音：

```bash
PI_NOTIFY_MAC_SOUND='' pi
```

默认留出可取消的6000毫秒，让异步结果有机会先唤醒父会话。可用 `PI_NOTIFY_MAC_GRACE_MS=8000 pi` 调整；`0` 只取消延迟，不取消保护检查。仅接受0至2147483647的十进制整数毫秒，非法值使用默认值。若扩大Subagents结果合并窗口，应同步增大延迟；它不是任意负载下的绝对时序保证。

macOS 通知权限以及终端的响铃、标题设置会影响实际效果。

## 工作原理

扩展监听最终的 `agent_settled`，不在较早的 `agent_end` 触发。存在待处理消息、或本会话的顶层/嵌套Subagents仍处于queued/running时不通知；以磁盘状态判断，恢复后也不依赖开始/完成事件计数配对。未知或损坏状态抑制通知，不当成已完成。新任务、会话切换或关闭会取消定时器，真正发送前再次复查。

只有TUI模式产生系统通知、标题和响铃，RPC/JSON/print保持安静。这是会话回到等待输入的提示，不证明所有子任务成功或任意外部工作已结束。通知失败不能影响主流程。Subagents支持限定在已核验的0.76.1-fork.1源码/状态合同，详见[行为与迁移合同](docs/notification-completion.md)。

## 开发与验证

源码位于 `src/pi-notify-mac.ts`。临时加载：

```bash
pi -e ./src/pi-notify-mac.ts
```

使用Node24或支持TypeScript擦除及VM模块的版本运行 `npm test`。测试保留发布版/手工版基线，以假的文件系统、定时器、进程输出和通知传输验证行为，不发送真实通知/声音，不读取真实会话或调用模型。

`node scripts/check-subagents-contract.mjs --repo <Subagents检出目录>` 核对固定0.76.1-fork.1提交的五份公开源码哈希，以及状态、归属、布局和结果合并合同；CI运行两类检查，不安装或执行Subagents。隔离Pi RPC启动只证明注册/加载。真实macOS通知、声音、标题与所有活跃会话热加载，仍需单独人工验收。

## 许可证

MIT
