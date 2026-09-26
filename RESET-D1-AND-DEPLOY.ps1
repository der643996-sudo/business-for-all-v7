$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$dbId = '5bcf36c6-e1fc-47d4-8431-6d1fc1c8aa5a'

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Business For All v8 - FRESH D1 / NO R2" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "Target D1 ID: $dbId" -ForegroundColor Yellow
Write-Host "IMPORTANT: Existing Business For All tables in this D1 will be reset." -ForegroundColor Red
Write-Host "No R2 bucket will be created or used." -ForegroundColor Yellow

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "Node.js/npm was not found. Install Node.js first."
}

Write-Host "[1/7] Installing dependencies..." -ForegroundColor Green
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

Write-Host "[2/7] Finding the D1 database name from its ID..." -ForegroundColor Green
$dbListRaw = & npx wrangler d1 list --json
if ($LASTEXITCODE -ne 0) {
  throw "Could not read D1 databases. Run: npx wrangler login, then retry."
}
try {
  $dbList = (($dbListRaw -join "`n") | ConvertFrom-Json)
} catch {
  throw "Wrangler returned an unreadable D1 list. Update Wrangler or run: npx wrangler d1 list --json"
}
$db = $dbList | Where-Object {
  ($_.uuid -eq $dbId) -or ($_.id -eq $dbId) -or ($_.database_id -eq $dbId)
} | Select-Object -First 1
if (-not $db) {
  throw "D1 database $dbId was not found in the currently logged-in Cloudflare account. Check the account or run: npx wrangler login"
}
$dbName = [string]$db.name
if ([string]::IsNullOrWhiteSpace($dbName)) {
  throw "Found the D1 ID but could not determine its database name. Run: npx wrangler d1 list --json"
}
Write-Host "Using D1 database: $dbName" -ForegroundColor Cyan

Write-Host "[3/7] Binding D1 to env.DB..." -ForegroundColor Green
$configPath = Join-Path $PSScriptRoot 'wrangler.jsonc'
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$binding = [PSCustomObject]@{
  binding = 'DB'
  database_name = $dbName
  database_id = $dbId
  migrations_dir = 'migrations'
}
if ($config.PSObject.Properties.Name -contains 'd1_databases') {
  $config.d1_databases = @($binding)
} else {
  $config | Add-Member -NotePropertyName d1_databases -NotePropertyValue @($binding)
}
$json = $config | ConvertTo-Json -Depth 30
[System.IO.File]::WriteAllText($configPath, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "[4/7] Resetting Business For All tables in D1..." -ForegroundColor Green
npx wrangler d1 execute DB --remote --file migrations/0000_reset_app.sql --yes
if ($LASTEXITCODE -ne 0) { throw "Resetting D1 failed" }

Write-Host "[5/7] Creating the clean v8 schema..." -ForegroundColor Green
npx wrangler d1 execute DB --remote --file migrations/0001_initial.sql --yes
if ($LASTEXITCODE -ne 0) { throw "Applying the D1 schema failed" }

Write-Host "[6/7] Validating the project..." -ForegroundColor Green
npm run validate
if ($LASTEXITCODE -ne 0) { throw "Validation failed" }

Write-Host "[7/7] Deploying Worker + static assets..." -ForegroundColor Green
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw "Deployment failed" }

Write-Host ""
Write-Host "SUCCESS: D1 was reset and Business For All v8 was deployed." -ForegroundColor Green
Write-Host "Open the deployed site and create the Owner account on first visit." -ForegroundColor Cyan
Write-Host "No R2 was used." -ForegroundColor Cyan
