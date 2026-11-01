# 把便携版安装到当前用户并创建开始菜单快捷方式。
# 用法：在解压后的目录里右键「使用 PowerShell 运行」，或：
#   powershell -ExecutionPolicy Bypass -File install.ps1
$ErrorActionPreference = 'Stop'
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $env:LOCALAPPDATA 'Codex Switcher Windows'
Write-Host "安装到 $dest"
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Recurse -Force (Join-Path $src '*') $dest
$exe = Join-Path $dest 'Codex Switcher.exe'
$menu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$sc = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $menu 'Codex Switcher.lnk'))
$sc.TargetPath = $exe
$sc.WorkingDirectory = $dest
$sc.Save()
Start-Process $exe
Write-Host '已安装并启动。图标在任务栏右下角系统托盘，左键单击打开面板。'
