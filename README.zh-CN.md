# pi-notify-mac

[English](README.md) | 中文

面向 macOS 的 Pi 完成通知扩展。Pi 会话完成重试、上下文压缩和后续队列处理，进入 `agent_settled` 后，会发送系统通知、播放默认的 `Glass` 提示音、将终端标题改为 `✓ <项目名>`，并发出终端响铃。适合同时运行多个 Pi 会话、经常切换终端的场景。

## 要求

- macOS；
- 支持扩展与包管理的 Pi；
- 系统自带的 `osascript`。

## 安装

推荐固定 GitHub 发布版本：

```bash
pi install git:github.com/chenhaoxiang/pi-notify-mac@v0.1.0
```

需要跟踪维护主线时使用 `@main`。安装后重启 Pi，已有会话也可执行 `/reload`。用 `pi list` 查看安装来源，用 `pi remove git:github.com/chenhaoxiang/pi-notify-mac@v0.1.0` 卸载。

如果已经把扩展复制到 `~/.pi/agent/extensions/pi-notify-mac.ts`，不要同时启用包安装，两份扩展会重复通知。切换前保全旧副本，再停用其中一个来源。

### 手动安装（备选）

```bash
mkdir -p ~/.pi/agent/extensions
cp src/pi-notify-mac.ts ~/.pi/agent/extensions/pi-notify-mac.ts
```

手动安装与包安装二选一。

## 发布与维护

当前制品版本为 **0.1.0**。本项目是原创扩展，使用普通 SemVer 和 `v<版本>` tag，不虚构社区上游或 `upstream-main`。`main` 是经过 PR 更新的发布主线，历史 v0.0.1 保留不变。

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

macOS 通知权限以及终端的响铃、标题设置会影响实际效果。

## 工作原理

扩展监听最终的 `agent_settled`，不在较早的 `agent_end` 触发。通知失败会输出错误，但不能影响 Pi 的主流程。

## 开发与验证

源码位于 `src/pi-notify-mac.ts`。临时加载：

```bash
pi -e ./src/pi-notify-mac.ts
```

当前没有自动化功能测试套件；发布验证覆盖事件注册、打包内容和不调用模型的隔离加载，不实际发出系统通知。真实声音、系统通知及标题表现仍需在 macOS 通知权限与终端环境中手工核验，加载通过不等于通知已验收。

## 许可证

MIT
