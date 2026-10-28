# sally精灵 · 打印文件（默认打印机，支持 N 份）
#   powershell -File print.ps1 -Path <文件> -Copies <份数>
# 四种通道，按文件类型自动选：
#   1) 文本类 -> Get-Content | Out-Printer（静默，逐份）
#   2) PDF + 有 SumatraPDF -> SumatraPDF -print-to-default -print-settings "Nx"（静默，真·多份）
#   3) 图片 -> rundll32 的 print 动词（静默、快，且不会像 Office 那样抢文件锁）
#   4) 其它（xlsx/docx/pptx…）-> 默认程序的「打印」动词，逐份
# 🔴 打印前先做「文件占用」预检：Office/WPS 开着这个文件时再发打印，
#    会连开 N 个实例互相抢锁，用户看到一堆「文档已被占用」弹窗（实测踩过）。
param([string]$Path, [int]$Copies = 1)
if (-not (Test-Path -LiteralPath $Path)) { Write-Output "NO_FILE"; exit 3 }
if ($Copies -lt 1) { $Copies = 1 }
if ($Copies -gt 99) { $Copies = 99 }
$ext = [System.IO.Path]::GetExtension($Path).ToLower()

# 0) 占用预检：能不能以「独占」方式打开？不能就是被别的程序占着
try {
  $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
  $fs.Close(); $fs.Dispose()
} catch {
  Write-Output "LOCKED"; exit 6
}

# 1) 文本类
if (@('.txt', '.csv', '.log', '.md', '.ini', '.json', '.xml') -contains $ext) {
  try {
    for ($i = 0; $i -lt $Copies; $i++) { Get-Content -LiteralPath $Path | Out-Printer; Start-Sleep -Milliseconds 700 }
    Write-Output ("OK text copies=" + $Copies); exit 0
  } catch { Write-Output "TEXT_FAIL"; exit 4 }
}

# 2) PDF（优先 SumatraPDF，能静默打多份）
if ($ext -eq '.pdf') {
  $cands = @(
    (Join-Path $env:LOCALAPPDATA 'SumatraPDF\SumatraPDF.exe'),
    (Join-Path $env:ProgramFiles 'SumatraPDF\SumatraPDF.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'SumatraPDF\SumatraPDF.exe')
  )
  $sum = $cands | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if ($sum) {
    & $sum -print-to-default -print-settings ($Copies.ToString() + 'x') -silent $Path
    Start-Sleep -Seconds 2
    Write-Output ("OK sumatra copies=" + $Copies); exit 0
  }
}

# 3) 图片：rundll32 的 print 动词，静默且不抢锁
if (@('.png', '.jpg', '.jpeg', '.bmp', '.gif', '.tif', '.tiff', '.webp') -contains $ext) {
  try {
    for ($i = 0; $i -lt $Copies; $i++) {
      Start-Process -FilePath 'rundll32.exe' -ArgumentList @('C:\Windows\System32\shimgvw.dll,ImageView_PrintTo', $Path) -ErrorAction Stop
      Start-Sleep -Milliseconds 1800
    }
    Write-Output ("OK image copies=" + $Copies); exit 0
  } catch { }   # 失败就落到通用通道
}

# 4) 通用：默认程序的「打印」动词，逐份
#    ⚠️ Office/WPS 系每启动一次就是一个实例、且会独占文件。
#       占用检查只做【一次】（在最前面）—— 千万别在循环里再查：
#       我们自己的第一个实例就会占住文件，再查会把自己误判成"被占用"，永远只打得出 1 份。
#       间隔给足（3 秒），让上一个实例有机会收工。
$sent = 0
for ($i = 0; $i -lt $Copies; $i++) {
  if ($i -gt 0) { Start-Sleep -Milliseconds 3000 }
  try { Start-Process -FilePath $Path -Verb Print -ErrorAction Stop } catch {
    if ($sent -gt 0) { Write-Output ("OK verb copies=" + $sent + " partial_noverb"); exit 0 }
    Write-Output "NO_PRINT_VERB"; exit 5
  }
  $sent++
}
Write-Output ("OK verb copies=" + $sent)
