# 00) 실행 위치: 프로젝트 루트(예: agm-golf-manager)
# 01) 목적: 소스코드 스냅샷 ZIP 생성 + SHA256 해시 생성
# 02) 주의: node_modules, build, .git, service-account, .env 등은 제외(영업비밀/용량/보안)

param(
  [string]$ProjectRoot = ".",
  [string]$OutDir = ".",
  [string]$Version = "v1.0"
)

$ErrorActionPreference = "Stop"
$Date = Get-Date -Format "yyyyMMdd"
$ZipName = "GolRoomPick_SourceSnapshot_${Date}_${Version}.zip"
$ZipPath = Join-Path $OutDir $ZipName

# 임시 스테이징 폴더
$Stage = Join-Path $env:TEMP ("GolRoomPick_SNAPSHOT_" + (Get-Date -Format "yyyyMMdd_HHmmss"))
New-Item -ItemType Directory -Force -Path $Stage | Out-Null

Write-Host "==> Stage: $Stage"
Write-Host "==> Copying filtered files with robocopy..."

# robocopy는 기본 포함(Windows). /XD: 제외 폴더, /XF: 제외 파일
robocopy $ProjectRoot $Stage /E /NFL /NDL /NJH /NJS /NP `
  /XD node_modules build dist coverage .git .vercel .netlify .firebase service-account .history .cache `
  /XF .env .env.local .env.development .env.production *.pem *.key *serviceAccount*.json *.log `
  | Out-Null

# ZIP 생성
if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $ZipPath -Force

# 해시 생성
$hash = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash
$hashFile = "${ZipPath}.sha256.txt"
"$hash  $ZipName" | Out-File -FilePath $hashFile -Encoding utf8

Write-Host ""
Write-Host "✅ Source Snapshot ZIP created:"
Write-Host "   $ZipPath"
Write-Host "✅ SHA256 file created:"
Write-Host "   $hashFile"
Write-Host ""
Write-Host "TIP) 다음 단계에서 EvidencePack 빌드 스크립트에 이 ZIP을 넣으세요."

# 정리
Remove-Item -Recurse -Force $Stage
