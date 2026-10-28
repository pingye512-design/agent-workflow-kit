# sally精灵 · 自动登录（通用 UI 自动化填充）
# 流程：从 Windows 凭据管理器读出账号密码 -> 激活登录窗口 -> 用 UI Automation 找输入框
#       -> 填用户名(第一个非密码框) + 密码(IsPassword 框) -> 点「登录/Sign in」按钮或回车。
# 这是尽力而为的通用方案，会逐步骤把结果打到 stdout，让桌面宠物把状态反馈给用户。
#   powershell -File autologin.ps1 -Target sally:<app> -Window <窗口标题关键字>
param([string]$Target, [string]$Window)
. "$PSScriptRoot\credlib.ps1"

$c = Get-Cred -Target $Target
if (-not $c) { Write-Output "NO_CRED"; exit 4 }
$user = $c.User
$pass = $c.Pass

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

# 把会破坏 SendKeys 的特殊字符转义（^ % + ~ { }）
function ES($s) {
  $t = [string]$s
  $t = $t.Replace('{', '{{}').Replace('}', '{}}').Replace('^', '{^}').Replace('%', '{%}').Replace('+', '{+}').Replace('~', '{~}')
  return $t
}

# 激活目标窗口（最多等 ~7 秒）
$ws = New-Object -ComObject WScript.Shell
$activated = $false
for ($i = 0; $i -lt 15; $i++) {
  if ($Window -and $ws.AppActivate($Window)) { $activated = $true; break }
  Start-Sleep -Milliseconds 500
}
if (-not $activated) { Write-Output "NO_WINDOW" }
Start-Sleep -Milliseconds 1500

function Fill($el, $txt) {
  if (-not $el) { return $false }
  $vp = $null
  try { $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern) } catch {}
  if ($vp) {
    try { $vp.SetValue([string]$txt); return $true } catch {}
  }
  # 兜底：聚焦 + 全选 + 键入（中文/特殊字符也走这条）
  try {
    $el.SetFocus()
    Start-Sleep -Milliseconds 150
    [System.Windows.Forms.SendKeys]::SendWait('^a')
    Start-Sleep -Milliseconds 80
    [System.Windows.Forms.SendKeys]::SendWait((ES $txt))
    return $true
  } catch { return $false }
}

$root = [System.Windows.Automation.AutomationElement]::RootElement
$editCond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::Edit)

# 等登录框出现（最多 ~9 秒）
$edits = $null
for ($k = 0; $k -lt 12; $k++) {
  $edits = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $editCond)
  if ($edits -and $edits.Count -gt 0) { break }
  Start-Sleep -Milliseconds 700
}
if (-not $edits -or $edits.Count -eq 0) { Write-Output "NO_FIELDS"; exit 5 }

$userField = $null
$passField = $null
foreach ($e in $edits) {
  $isP = $false
  try { $isP = [bool]($e.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsPasswordProperty)) } catch {}
  if ($isP) { if (-not $passField) { $passField = $e } }
  else { if (-not $userField) { $userField = $e } }
}

if ($userField) { if (Fill $userField $user) { Write-Output "USER_FILLED" } }
if ($passField) { if (Fill $passField $pass) { Write-Output "PASS_FILLED" } }
Start-Sleep -Milliseconds 300

# 找登录按钮
$btnCond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::Button)
$btns = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
$re = [regex]'(登录|登 录|sign\s*in|log\s*in|确定|下一步|提交|enter|done|ok)'
$hit = $null
foreach ($b in $btns) {
  $nm = ''
  try { $nm = [string]($b.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::NameProperty)) } catch {}
  if ($re.IsMatch($nm)) { $hit = $b; break }
}
if ($hit) {
  try {
    $ip = $hit.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $ip.Invoke()
    Write-Output ("CLICKED:" + $nm)
  } catch {
    if ($passField) { $passField.SetFocus(); [System.Windows.Forms.SendKeys]::SendWait('{ENTER}'); Write-Output "ENTER_SENT" }
    else { Write-Output "CLICK_FAIL" }
  }
} else {
  if ($passField) { $passField.SetFocus(); [System.Windows.Forms.SendKeys]::SendWait('{ENTER}'); Write-Output "ENTER_SENT" }
  else { Write-Output "NO_BUTTON" }
}
Write-Output ("DONE fields=" + $edits.Count + " user=" + ($null -ne $userField) + " pass=" + ($null -ne $passField))
