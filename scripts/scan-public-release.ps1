$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$target = Join-Path $repo 'apps'
$patterns = @(
  '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
  '\b(?:ghp|github_pat|AKIA|ASIA|xox[baprs])[-_A-Za-z0-9]{12,}\b',
  '\bou_[A-Za-z0-9]{8,}\b',
  '\b1[3-9]\d{9}\b',
  '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}',
  '(?i)(password|passwd|api[_-]?key|client[_-]?secret)\s*[:=]\s*["''][^"'']{6,}["'']'
)

$failed = $false
$textExtensions = @('.js', '.cjs', '.json', '.md', '.html', '.wxml', '.wxss', '.ps1', '.webmanifest')
$files = Get-ChildItem -LiteralPath $target -Recurse -File | Where-Object { $_.Extension -in $textExtensions }
foreach ($pattern in $patterns) {
  $hits = $files | Select-String -Pattern $pattern
  if ($hits) {
    $failed = $true
    Write-Host "Potential sensitive value: $pattern" -ForegroundColor Red
    $hits | Write-Host
  }
}

if ($failed) {
  throw 'Public release scan failed.'
}

Write-Host 'Public release scan passed.' -ForegroundColor Green
