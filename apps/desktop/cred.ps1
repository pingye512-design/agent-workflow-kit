# sally精灵 · 凭据管理器命令行
# 用法（由 Electron 主进程调用，密码走环境变量，绝不进命令行参数）：
#   powershell -File cred.ps1 set  <target>      <-env SALLY_CUSER / SALLY_CPASS
#   powershell -File cred.ps1 get  <target>       -> 输出 "用户名<TAB>密码"
#   powershell -File cred.ps1 list                -> 每行一个 app（去掉 sally: 前缀）
#   powershell -File cred.ps1 del  <target>
param([string]$Cmd, [string]$Target)
. "$PSScriptRoot\credlib.ps1"
switch ($Cmd) {
  'set' {
    $u = $env:SALLY_CUSER; $p = $env:SALLY_CPASS
    if (-not $u -or $null -eq $p) { Write-Output "FAIL"; exit 1 }
    $ok = Set-Cred -Target $Target -User $u -Pass $p
    Write-Output $(if ($ok) { 'OK' } else { 'FAIL' })
    exit $(if ($ok) { 0 } else { 1 })
  }
  'get' {
    $c = Get-Cred -Target $Target
    if ($c) { Write-Output ($c.User + "`t" + $c.Pass) } else { Write-Output "NONE"; exit 3 }
  }
  'list' {
    $l = List-Creds
    if ($l -and $l.Count) { $l | ForEach-Object { Write-Output $_ } } else { Write-Output "EMPTY" }
  }
  'del' {
    $ok = Del-Cred -Target $Target
    Write-Output $(if ($ok) { 'OK' } else { 'FAIL' })
    exit $(if ($ok) { 0 } else { 1 })
  }
  default { Write-Output "USAGE"; exit 2 }
}
