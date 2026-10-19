param(
    [Parameter(Mandatory=$true)]
    [string]$Path,
    [string]$Name = "",
    [string]$Group = "AI Agent 项目",
    [switch]$NoStart
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$cli = @(
    (Join-Path $repoRoot "flash-manager-cli.exe"),
    (Join-Path $repoRoot "src-tauri\target\release\flash-manager-cli.exe")
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($cli) {
    $cliArgs = @("auto-detect", (Resolve-Path $Path).Path, "--group", $Group)
    if ($Name -ne "") { $cliArgs += @("--name", $Name) }
    if ($NoStart.IsPresent) { $cliArgs += "--no-start" }
    & $cli @cliArgs
    exit $LASTEXITCODE
}

$tokenFile = Join-Path $repoRoot "config\agent.token"
if (-not (Test-Path $tokenFile)) {
    throw "找不到 $tokenFile。请先启动一次 FlashManager。"
}
$token = (Get-Content -Raw $tokenFile).Trim()
$apiUrl = "http://127.0.0.1:19527/api/v1/services/auto-detect"
$payload = @{
    path = (Resolve-Path $Path).Path
    group = $Group
    startNow = (-not $NoStart.IsPresent)
    diagnoseMs = 1500
}
if ($Name -ne "") { $payload.name = $Name }
$jsonBody = $payload | ConvertTo-Json -Depth 5

try {
    $response = Invoke-RestMethod -Method Post -Uri $apiUrl `
        -Headers @{ Authorization = "Bearer $token" } `
        -ContentType "application/json; charset=utf-8" `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($jsonBody))
    Write-Host "[FlashManager] 服务已自动配置并托管:" -ForegroundColor Green
    Write-Host "   ID     : $($response.service.id)"
    Write-Host "   名称   : $($response.service.name)"
    Write-Host "   类型   : $($response.service.serviceType)"
    Write-Host "   状态   : $($response.service.status) (PID: $($response.service.pid))"
    if ($response.diagnose) {
        Write-Host "   诊断   : $($response.diagnose.summary)" -ForegroundColor Cyan
    }
} catch {
    throw "FlashManager 未接受注册。请确认程序在运行，且 config\agent.token 属于这次启动。原始错误: $($_.Exception.Message)"
}
