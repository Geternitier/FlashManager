param([string]$ReleaseDirectory)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
if (-not $ReleaseDirectory) {
    $ReleaseDirectory = Join-Path $repoRoot "src-tauri\target\release"
}
$sourceRoot = (Resolve-Path -LiteralPath $ReleaseDirectory).Path
$runtime = Join-Path $repoRoot "runtime"
if ([IO.Path]::GetPathRoot($sourceRoot) -ne [IO.Path]::GetPathRoot($runtime)) {
    throw "The release directory and runtime must be on the same volume."
}

if (-not ("DeploymentFileZone" -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("79EAC9EE-BAF9-11CE-8C82-00AA004BA90B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDeploymentSecurityManager {
    [PreserveSig] int SetSecuritySite(IntPtr site);
    [PreserveSig] int GetSecuritySite(out IntPtr site);
    [PreserveSig] int MapUrlToZone([MarshalAs(UnmanagedType.LPWStr)] string url, out uint zone, uint flags);
}

public static class DeploymentFileZone {
    [DllImport("urlmon.dll")]
    static extern int CoInternetCreateSecurityManager(IntPtr provider, out IDeploymentSecurityManager manager, uint reserved);

    public static uint Read(string path) {
        IDeploymentSecurityManager manager;
        Marshal.ThrowExceptionForHR(CoInternetCreateSecurityManager(IntPtr.Zero, out manager, 0));
        try {
            uint zone;
            const uint DontUseCache = 0x1000;
            Marshal.ThrowExceptionForHR(manager.MapUrlToZone(new Uri(path).AbsoluteUri, out zone, DontUseCache));
            return zone;
        } finally {
            Marshal.ReleaseComObject(manager);
        }
    }
}
'@
}

New-Item -ItemType Directory -Path $runtime -Force | Out-Null
$lock = [IO.File]::Open((Join-Path $runtime ".deploy.lock"), "OpenOrCreate", "ReadWrite", "None")
$files = @(
    @{ Source = "flash-manager.exe"; Target = "FlashManager.exe" },
    @{ Source = "flash-manager-cli.exe"; Target = "flash-manager-cli.exe" }
)
$id = (Get-Date -Format "yyyyMMdd-HHmmss") + "-" + [Guid]::NewGuid().ToString("N").Substring(0, 8)
$backupDir = Join-Path $runtime "backups\deploy-$id"
try {
    $targets = $files | ForEach-Object { Join-Path $runtime $_.Target }
    $running = Get-Process -Name FlashManager,flash-manager-cli -ErrorAction SilentlyContinue |
        Where-Object { $targets -contains $_.Path }
    if ($running) {
        throw "Exit the deployed FlashManager and its CLI before deploying."
    }

    foreach ($file in $files) {
        $source = Join-Path $sourceRoot $file.Source
        $file.Destination = Join-Path $runtime $file.Target
        $file.Stage = Join-Path $sourceRoot ".deploy-$id-$($file.Source)"
        $file.Hash = (Get-FileHash -LiteralPath $source).Hash
        if ([DeploymentFileZone]::Read($source) -ne 0) {
            throw "The build is not in the Windows local-machine zone: $source"
        }
        # Stage next to the build so the copy inherits the build directory's label.
        Copy-Item -LiteralPath $source -Destination $file.Stage
        if ((Get-FileHash -LiteralPath $file.Stage).Hash -ne $file.Hash -or
            [DeploymentFileZone]::Read($file.Stage) -ne 0) {
            throw "The staged build failed hash or Windows zone verification: $($file.Stage)"
        }
    }

    foreach ($file in $files) {
        if (Test-Path -LiteralPath $file.Destination) {
            New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
            $file.Backup = Join-Path $backupDir $file.Target
            [IO.File]::Replace($file.Stage, $file.Destination, $file.Backup)
        } else {
            [IO.File]::Move($file.Stage, $file.Destination)
        }
        $file.Installed = $true
        if ((Get-FileHash -LiteralPath $file.Destination).Hash -ne $file.Hash -or
            [DeploymentFileZone]::Read($file.Destination) -ne 0) {
            throw "The deployed build failed hash or Windows zone verification: $($file.Destination)"
        }
    }
    $files | ForEach-Object {
        [pscustomobject]@{ Path = $_.Destination; SHA256 = $_.Hash; Zone = 0; Backup = $_.Backup }
    }
} catch {
    for ($i = $files.Count - 1; $i -ge 0; $i--) {
        $file = $files[$i]
        if (-not $file.Installed) { continue }
        try {
            if ($file.Backup) {
                $failed = Join-Path $backupDir "failed-$($file.Target)"
                [IO.File]::Replace($file.Backup, $file.Destination, $failed)
            } else {
                Remove-Item -LiteralPath $file.Destination
            }
        } catch {
            Write-Warning "Rollback failed for $($file.Destination). Backup: $($file.Backup)"
        }
    }
    throw
} finally {
    $lock.Dispose()
    foreach ($file in $files) {
        if ($file.Stage -and (Test-Path -LiteralPath $file.Stage)) {
            Remove-Item -LiteralPath $file.Stage
        }
    }
}
