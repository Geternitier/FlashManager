# Agent 接入与排障

Agent 可通过 CLI 或本机 HTTP API 登记、启动和诊断服务。下面的命令从仓库根目录运行，示例中的项目路径和服务 ID 请按实际情况替换。

## 用 CLI 登记服务

```powershell
$cli = ".\runtime\flash-manager-cli.exe"
& $cli auto-detect "D:\projects\my-api" --name "My API" --group "AI Agent 项目"
& $cli diagnose svc-my-api
& $cli status
```

- `auto-detect` 默认登记并启动。加 `--no-start` 只登记。探测结果优先使用项目内有效的 `.flashservice.json`，否则按入口文件识别运行器。同一探测路径和类型会得到稳定的服务 ID。
- `register .\service.json` 接受显式配置。启动选择依次取 CLI 的 `--start` 或 `--no-start`、JSON 的 `autoStartOnRegister`，最后默认启动。
- `start`、`stop`、`restart` 和 `diagnose` 都接受服务 ID，并需要守护进程在线。在线登记成功时，从返回结果的 `service.id` 读取 ID。
- `auto-detect` 的 HTTP 调用失败时会尝试写入 `config/services.d/<id>.json`。如果得到离线清单，登记和启动仍需等待守护进程扫描。在线时出现此结果，也应检查令牌、HTTP 错误和服务是否已登记。
- [PowerShell 接入脚本](scripts/agent-register.ps1) 优先调用数据目录里的 CLI，其次使用 Cargo release 产物。找不到 CLI 时改用 HTTP。

## 本机 HTTP API

API 只监听 `127.0.0.1:19527`。`GET /api/v1/health` 和 `POST /api/v1/focus` 可直接调用。其他请求使用 `Authorization: Bearer <token>`，令牌由守护进程保存在数据目录的 `config/agent.token` 中。令牌只在本机读取和使用，避免写入文档、日志或对话。

```powershell
$base = "http://127.0.0.1:19527/api/v1"
Invoke-RestMethod "$base/health"
$headers = @{ Authorization = "Bearer $((Get-Content -Raw .\runtime\config\agent.token).Trim())" }
$request = @{
    path = "D:/projects/my-api"
    name = "My API"
    group = "AI Agent 项目"
    startNow = $true
    diagnoseMs = 1500
} | ConvertTo-Json
$result = Invoke-RestMethod "$base/services/auto-detect" -Method Post `
    -Headers $headers -ContentType "application/json; charset=utf-8" `
    -Body ([Text.Encoding]::UTF8.GetBytes($request))
$result.service | Select-Object id, name, status, pid
$result.diagnose | Select-Object healthy, portActive, summary
```

下面的路径以 `/api/v1` 为前缀。字段定义以 [Rust 数据模型](src-tauri/src/models.rs) 和 [路由实现](src-tauri/src/agent_api.rs) 为准。

| 方法与路径 | 用途 |
| --- | --- |
| `GET /snapshot`、`GET /services` | 读取仪表盘和服务快照。日志正文通过日志接口分页读取。 |
| `POST /services/detect-preview` | 根据 `path` 预览探测出的配置。 |
| `POST /services/auto-detect` | 探测并登记，`startNow` 默认 `true`。 |
| `POST /services/register?startNow=false&diagnoseMs=1500` | 按 ID 写入服务配置。省略 `startNow` 时使用 JSON 的 `autoStartOnRegister`。 |
| `POST /services/{id}/start`、`/stop`、`/restart` | 控制单个服务。 |
| `POST /services/batch` | 传入 `action`（`start` 或 `stop`）及可选 `group`，读取逐项结果。 |
| `GET /services/{id}/logs?after=0` | 按游标增量取日志，后续请求使用返回的 `cursor`。 |
| `GET /services/{id}/diagnose?waitMs=1500&lines=50` | 查看运行状态、端口与最近日志。 |
| `POST /services/{id}/clear-logs`、`POST /services/{id}/encoding`、`DELETE /services/{id}` | 清理日志、设置编码或删除服务。 |
| `GET /proxies`、`POST /proxies`、`DELETE /proxies/{id}` | 读取、保存或删除反代规则。 |
| `GET /proxies/preview?gatewayId=…`、`POST /proxies/apply?gatewayId=…` | 预览或应用指定 Nginx 网关的规则。 |

## 离线投递

在线 API 不可用时，可向数据目录的 `config/services.d/<id>.json` 投递服务配置。本仓库本机部署的数据目录为 `runtime/`。示例：

```json
{
  "id": "svc-my-api",
  "name": "My API",
  "group": "AI Agent 项目",
  "serviceType": "python",
  "executable": "python",
  "scriptPath": "D:/projects/my-api/server.py",
  "args": ["--port", "8090"],
  "cwd": "D:/projects/my-api",
  "port": 8090,
  "autoStartOnRegister": false
}
```

守护进程约每 1.5 秒扫描一次。首次扫描和文件修改都会按 ID 登记，`autoStartOnRegister` 为真时还会启动。若希望彻底移除这类服务，先移出对应的投递文件，再删除已登记的服务，避免下次启动时重新登记。

## 本次排查记录

### 托盘唤醒时先出现白窗口

关闭主窗口会销毁 WebView2，以便释放渲染资源。原先托盘唤醒会立刻显示新建窗口，用户会先看到空白窗口，再看到 React 界面。现在先隐藏创建窗口，待内联骨架就绪再显示，随后加载仪表盘。约 3 秒后由 Rust 兜底显示，远程字体在后台加载。排查时可分别确认首个可见画面、React 接管和服务快照到达。

### 同一构建的桌面 EXE 弹出 SmartScreen

迁移前，项目根目录 EXE 和 release EXE 的 SHA-256 相同，两个文件均未签名，也没有 `Zone.Identifier`。部署时在带可继承低完整性标签的备份目录暂存新版，`File.Replace` 将暂存副本的标签带进了桌面目标。Windows 的 `MapUrlToZone` 将该文件判为 Internet 区（3），而 release 和旧版备份为本机区（0）。临时副本复现了同哈希文件因标签不同而改变分区。

修复采用正常用户权限，在已验证为本机区的 release 目录暂存副本并替换桌面目标。现在用 [本地部署脚本](scripts/deploy-local.ps1) 将相同验证流程应用到 `runtime/`，在暂存和安装后检查 SHA-256 与 `MapUrlToZone`。遇到安全区差异时，可用 `icacls.exe` 核对完整性标签，再从原快捷方式实测启动。SmartScreen 提示和程序启动故障应分别核对。

### 沙箱里的文件替换测试报拒绝访问

Rust 测试在 Codex 沙箱临时目录中有 5 项因配置文件替换返回 Windows 错误 5 而失败。同一测试二进制使用正常 Windows 用户权限和独立临时配置重跑，18 项均通过。遇到这类结果时，先核对测试目录权限和失败步骤，再判断是否属于持久化回归。
