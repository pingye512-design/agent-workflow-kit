# sally精灵 · Windows 凭据管理器封装（不落明文文件）
# 通过 advapi32.dll 的 CredWrite/CredRead/CredDelete/CredEnumerate 读写本机凭据。
# 凭据以 CRED_TYPE_GENERIC 存进「企业/用户」凭据仓库（CRED_PERSIST_ENTERPRISE），
# 只有本机当前用户能读，重启后仍在。密码经 UTF-8 编码后以二进制 blob 存储。
$src = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class CredM {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
  }
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredWrite(ref CREDENTIAL pcred, uint flags);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredRead(string target, uint type, uint reserved, out IntPtr pcred);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredDelete(string target, uint type, uint reserved);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredEnumerate(string filter, uint flags, out uint count, out IntPtr pArray);
  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr ptr);
}
'@
Add-Type -TypeDefinition $src -ErrorAction SilentlyContinue

function Set-Cred {
  param([string]$Target, [string]$User, [string]$Pass)
  $pw = [System.Text.Encoding]::UTF8.GetBytes($Pass)
  $c = New-Object CredM+CREDENTIAL
  $c.Type = 1          # CRED_TYPE_GENERIC
  $c.Persist = 3       # CRED_PERSIST_ENTERPRISE（随用户持久，重启保留）
  $c.CredentialBlobSize = [uint32]$pw.Length
  $pPw = [System.Runtime.InteropServices.Marshal]::AllocCoTaskMem([Math]::Max(1, $pw.Length))
  [System.Runtime.InteropServices.Marshal]::Copy($pw, 0, $pPw, $pw.Length)
  $pUn = [System.Runtime.InteropServices.Marshal]::StringToCoTaskMemUni($User)
  $pTn = [System.Runtime.InteropServices.Marshal]::StringToCoTaskMemUni($Target)
  $c.CredentialBlob = $pPw
  $c.UserName = $pUn
  $c.TargetName = $pTn
  $ok = $false
  try { $ok = [CredM]::CredWrite([ref]$c, 0) } finally {
    [System.Runtime.InteropServices.Marshal]::FreeCoTaskMem($pPw)
    [System.Runtime.InteropServices.Marshal]::FreeCoTaskMem($pUn)
    [System.Runtime.InteropServices.Marshal]::FreeCoTaskMem($pTn)
  }
  return $ok
}

function Get-Cred {
  param([string]$Target)
  $p = [IntPtr]::Zero
  if (-not [CredM]::CredRead($Target, 1, 0, [ref]$p)) { return $null }
  try {
    $c = [System.Runtime.InteropServices.Marshal]::PtrToStructure($p, [CredM+CREDENTIAL])
    $un = [System.Runtime.InteropServices.Marshal]::PtrToStringUni($c.UserName)
    $blob = New-Object byte[] $c.CredentialBlobSize
    [System.Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob, $blob, 0, [int]$c.CredentialBlobSize)
    $pw = [System.Text.Encoding]::UTF8.GetString($blob)
    return @{ User = $un; Pass = $pw }
  } finally { [CredM]::CredFree($p) }
}

function Del-Cred {
  param([string]$Target)
  return [CredM]::CredDelete($Target, 1, 0)
}

function List-Creds {
  $cnt = 0
  $arr = [IntPtr]::Zero
  $out = @()
  if ([CredM]::CredEnumerate('sally:*', 0, [ref]$cnt, [ref]$arr)) {
    try {
      for ($i = 0; $i -lt [int]$cnt; $i++) {
        $p = [System.Runtime.InteropServices.Marshal]::ReadIntPtr($arr, $i * [IntPtr]::Size)
        $c = [System.Runtime.InteropServices.Marshal]::PtrToStructure($p, [CredM+CREDENTIAL])
        $tn = [System.Runtime.InteropServices.Marshal]::PtrToStringUni($c.TargetName)
        if ($tn -and $tn.StartsWith('sally:')) { $out += $tn.Substring(6) }
      }
    } finally { [CredM]::CredFree($arr) }
  }
  return $out
}
