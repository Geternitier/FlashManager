# 守饭人 · FlashManager

守饭人是一个 Windows 本地服务管理器。它用一个窗口管理 EXE、Node.js、Python、PowerShell / 批处理脚本和 Nginx，提供启停、分组、批量操作、实时日志和端口诊断。也可以给受管的 Nginx 生成反向代理配置，预览、检查并应用规则。

## 快速使用

1. 打开 `runtime/FlashManager.exe`，或运行本地构建产物 `src-tauri/target/release/flash-manager.exe`。已配置桌面快捷方式时，双击「守饭人」即可。
2. 点击「添加服务」手动填写配置，或用「从文件夹自动识别」输入项目、脚本或可执行文件的路径。确认命令、工作目录和端口后保存，按需启动。
3. 点击服务卡片查看日志、配置和健康诊断。修改正在运行的服务后，界面的「待重启」提示表示启动配置将在下次启动时生效。
4. 关闭窗口会回到托盘，服务继续运行。左键点击托盘图标打开窗口。需要停止所有服务并退出时，使用托盘菜单的「彻底退出并清理子进程」。

本地运行文件集中在 `runtime/`，包括 GUI、CLI、`config/` 和部署备份。`runtime/` 由 Git 忽略。单独复制到其他目录的便携 EXE 会读取其所在目录的 `config/`。

## 从源码运行

在 Windows 上安装 Node.js、pnpm、Rust 的 MSVC 工具链、WebView2 Runtime 和 Visual Studio Build Tools。当前 [Cargo 配置](.cargo/config.toml) 使用 VS 2026 Build Tools 的 MSVC `14.50.35717` 和 Windows SDK `10.0.26100.0`。机器的安装路径或版本不同时，先核对该配置中的路径。

在仓库根目录运行：

```powershell
pnpm install --frozen-lockfile
pnpm tauri dev
```

构建可执行文件并运行测试：

```powershell
pnpm build
cargo build --locked --release --manifest-path src-tauri/Cargo.toml
pnpm test
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
```

Release 目录包含窗口程序 `flash-manager.exe` 和控制台程序 `flash-manager-cli.exe`。退出正在运行的守饭人后，可从正常用户 PowerShell 发布到本地运行目录：

```powershell
.\scripts\deploy-local.ps1
```

脚本校验两个 EXE 的 SHA-256 和 Windows 安全区。升级时旧 EXE 备份到 `runtime/backups/`，运行配置继续由 `runtime/config/` 提供。首次配置桌面快捷方式时，目标选择 `runtime/FlashManager.exe`。

## 文档

- [架构与运行机制](docs/ARCH.md)
- [前端设计](docs/design.html)
- [Agent 接入与排障](AGENT-INTEGRATION.md)
