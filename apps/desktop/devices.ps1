# sally精灵 · 探测本机接入的设备（打印机 / USB / 串口 / 摄像头 / 蓝牙 / 音频）
# 输出：一行紧凑 JSON，交给 Electron 主进程解析。
$ErrorActionPreference = 'SilentlyContinue'
$out = @{ printers = @(); usb = @(); ports = @(); cameras = @(); audio = @(); bluetooth = @(); com = @() }

# 1) 打印机（含默认、端口、是否离线）
try {
  $out.printers = @(Get-CimInstance Win32_Printer | ForEach-Object {
    @{ name = [string]$_.Name; driver = [string]$_.DriverName; port = [string]$_.PortName; default = [bool]$_.Default; offline = [bool]$_.WorkOffline }
  })
} catch {}

# 2) 即插即用设备按类别归类（Win32_PnPEntity 通用）
function PickClasses($classes) {
  try {
    return @(Get-CimInstance Win32_PnPEntity | Where-Object { $classes -contains $_.PNPClass } | ForEach-Object {
      @{ name = [string]$_.Name; cls = [string]$_.PNPClass }
    })
  } catch { return @() }
}
$out.usb       = PickClasses @('USB', 'USBDevice')
$out.ports     = PickClasses @('Ports')
$out.cameras   = PickClasses @('Camera', 'Image', 'Media')
$out.audio     = PickClasses @('AudioEndpoint', 'MEDIA')
$out.bluetooth = PickClasses @('Bluetooth')

# 3) 串口名（电子秤/条码枪常用 COM）
try { $out.com = @([System.IO.Ports.SerialPort]::GetPortNames()) } catch {}

# 去重（同名同类只留一条），并限流
foreach ($k in @('usb', 'ports', 'cameras', 'audio', 'bluetooth')) {
  $seen = @{}; $arr = @()
  foreach ($d in $out[$k]) {
    $key = ([string]$d.cls) + '|' + ([string]$d.name)
    if ($d.name -and -not $seen.ContainsKey($key)) { $seen[$key] = 1; $arr += $d }
  }
  $out[$k] = @($arr | Select-Object -First 40)
}
try { $out | ConvertTo-Json -Depth 5 -Compress } catch { Write-Output '{"printers":[],"usb":[],"ports":[],"cameras":[],"audio":[],"bluetooth":[],"com":[]}' }
