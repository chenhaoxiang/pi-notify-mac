# pi-notify-mac

一个面向 macOS 的 Pi 全局完成通知扩展。

当 Pi session 完成并进入等待输入状态时，它会：

- 发送 macOS 系统通知；
- 播放 `Glass` 提示音；
- 将当前终端标题改为 `✓ <项目名>`；
- 发出终端响铃作为额外兜底。

适合同时运行多个 Pi session、经常切换终端窗口的场景。

## 要求

- macOS
- Pi 支持扩展机制与包管理（`pi install`）
- `osascript`（macOS 系统自带）

## 安装

### 作为 Pi package 安装（推荐）

本仓库是一个标准的 [Pi package](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)，直接从 git 安装：

```bash
pi install git:github.com/chenhaoxiang/pi-notify-mac
```

安装后重新启动 Pi 即可生效。用 `pi list` 查看已安装包，`pi remove git:github.com/chenhaoxiang/pi-notify-mac` 卸载。

发布后也可以从 npm 安装：

```bash
pi install npm:pi-notify-mac
```

### 手动安装（备选）

将扩展复制到 Pi 的全局扩展目录：

```bash
mkdir -p ~/.pi/agent/extensions
cp src/pi-notify-mac.ts ~/.pi/agent/extensions/pi-notify-mac.ts
```

重新启动 Pi；已经运行的 session 可以执行 `/reload`（如果当前 Pi 版本支持）。

## 配置

默认提示音为 `Glass`。可以通过环境变量修改：

```bash
PI_NOTIFY_MAC_SOUND=Ping pi
```

不播放声音：

```bash
PI_NOTIFY_MAC_SOUND='' pi
```

## 工作原理

扩展监听 Pi 的 `agent_settled` 事件，而不是较早的 `agent_end` 事件。这样只有在 Pi 完成重试、上下文压缩和后续队列处理后，才发送通知。

通知失败不会影响 Pi 主流程。

## 开发

扩展源码位于：

```text
src/pi-notify-mac.ts
```

使用 Pi 临时加载测试：

```bash
pi -e ./src/pi-notify-mac.ts
```

## 开源说明

本项目按 MIT License 发布，适合作为独立 Pi 扩展使用或二次开发。
