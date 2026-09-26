$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " Business For All v7.1 - FRESH D1 DATABASE" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "This creates a NEW D1 database. The old DB is not deleted." -ForegroundColor Yellow

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "Node.js/npm was not found. Install Node.js first."
}

Write-Host "[1/5] Installing dependencies..." -ForegroundColor Green
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

$dbName = "business-for-all-db-v71-" + (Get-Date -Format "yyyyMMdd-HHmmss")
Write-Host "[2/5] Creating fresh D1 database: $dbName" -ForegroundColor Green
npx wrangler d1 create $dbName --location weur --binding DB --update-config
if ($LASTEXITCODE -ne 0) { throw "Could not create D1. Run: npx wrangler login, then retry." }

Write-Host "[3/5] Applying clean schema..." -ForegroundColor Green
npx wrangler d1 execute DB --remote --file migrations/0001_initial.sql --yes
if ($LASTEXITCODE -ne 0) { throw "Applying schema failed" }

Write-Host "[4/5] Validating project..." -ForegroundColor Green
npm run validate
if ($LASTEXITCODE -ne 0) { throw "Validation failed" }

Write-Host "[5/5] Deploying Worker..." -ForegroundColor Green
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw "Deployment failed" }

Write-Host "" 
Write-Host "SUCCESS: Fresh database + deployment completed." -ForegroundColor Green
Write-Host "Open the site and create the Owner account on first visit." -ForegroundColor Cyan
