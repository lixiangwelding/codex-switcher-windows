# Codex Switcher（Windows 托盘版）

[znary/codex-switcher](https://github.com/znary/codex-switcher) 的 Windows 移植。
原版是 macOS 菜单栏小工具（Swift/SwiftUI），Windows 没有菜单栏，
本项目用系统托盘图标 + 弹出面板实现同样的体验。

功能保持单纯，只做三件事：

- 管理多个 Codex 账号（每个账号一份独立的 `auth.json` 快照）
- 查看每个账号的用量窗口（5 小时 / 每周等）与重置时间
- 一键切换当前账号

没有本地代理、没有中转站、没有自动切号。

## 原理

与原版一致：

- 切换 = 把该账号保存的 `auth.json` 快照覆盖回 `%USERPROFILE%\.codex\auth.json`
  （覆盖前会备份为 `auth.json.bak-switcher`）。
- 用量 = 启动 `codex app-server`，通过 JSON-RPC 调用 `account/read` 与
  `account/rateLimits/read` 读取。

数据保存在 `%APPDATA%\CodexSwitcherWindows\`，只存本机。

## 安装

从 [Releases](../../releases) 下载 `Codex-Switcher-Setup-x64.exe`，双击安装。
安装后图标出现在任务栏右下角的系统托盘，左键单击打开面板。

## 使用

1. 先在终端执行 `codex login` 登录一个账号。
2. 单击托盘图标，点「导入当前账号」。
3. 换账号重复 1、2。之后在面板里点「切换」即可，不用再重新登录。
4. 「刷新用量」读取该账号的额度窗口。

## 从源码运行 / 打包

需要 Node.js 20+。

```bash
npm install
npm start        # 开发运行
npm test         # 核心逻辑测试（不依赖 Electron）
npm run dist     # 打包 Windows 安装包到 dist/
```

`codex` 不在默认路径时，用环境变量 `CODEX_BINARY_PATH` 指定。

## 许可

MIT，与上游一致。见 [LICENSE](./LICENSE)。
