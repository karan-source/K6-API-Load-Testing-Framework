<#
.SYNOPSIS
    Runs a k6 profile against the SaveLab API.

.EXAMPLE
    .\run-tests.ps1 -Profile smoke
    .\run-tests.ps1 -Profile load -DataMode random
    .\run-tests.ps1 -Profile contention -Verbose
    .\run-tests.ps1 -Profile load -Scenario optimizedSave -OpenReport
#>
[CmdletBinding()]
param(
    [ValidateSet('smoke', 'load', 'stress', 'soak', 'contention')]
    [string]$Profile = 'smoke',

    [string]$BaseUrl = 'http://localhost:5181',

    [ValidateSet('sequential', 'random')]
    [string]$DataMode = 'sequential',

    [ValidateSet('naiveSave', 'optimizedSave', 'readCustomer')]
    [string]$Scenario,

    [int]$HotRows = 0,
    [int]$SeedCustomers = 0,
    [switch]$OpenReport
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) {
    Write-Error "k6 is not on PATH. Install it with 'winget install k6' or see https://k6.io/docs/get-started/installation/"
}

Write-Host "Checking SaveLab API at $BaseUrl ..." -ForegroundColor Cyan
try {
    Invoke-WebRequest -Uri "$BaseUrl/swagger/v1/swagger.json" -UseBasicParsing -TimeoutSec 10 | Out-Null
    Write-Host "  API is reachable." -ForegroundColor Green
}
catch {
    Write-Error "Could not reach $BaseUrl. Start it with: dotnet run --project src/SaveLab.Api"
}

New-Item -ItemType Directory -Force -Path 'reports' | Out-Null

$k6Args = @(
    'run',
    '-e', "TEST_PROFILE=$Profile",
    '-e', "BASE_URL=$BaseUrl",
    '-e', "DATA_MODE=$DataMode"
)

if ($Scenario) { $k6Args += @('-e', "SCENARIO=$Scenario") }
if ($HotRows -gt 0) { $k6Args += @('-e', "HOT_ROWS=$HotRows") }
if ($SeedCustomers -gt 0) { $k6Args += @('-e', "SEED_CUSTOMERS=$SeedCustomers") }
if ($VerbosePreference -eq 'Continue') { $k6Args += @('-e', 'VERBOSE=true') }

$k6Args += 'save-comparison-load-test.js'

Write-Host "`nk6 $($k6Args -join ' ')`n" -ForegroundColor DarkGray

$before = Get-ChildItem -Path 'reports' -Filter '*.html' -ErrorAction SilentlyContinue

# k6 writes its INFO logs to stderr, which PowerShell would otherwise treat as terminating.
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& k6 @k6Args
$exitCode = $LASTEXITCODE
$ErrorActionPreference = $previousPreference

$report = Get-ChildItem -Path 'reports' -Filter '*.html' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notin $before.Name } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if ($report) {
    Write-Host "`nReport: $($report.FullName)" -ForegroundColor Cyan
    if ($OpenReport) { Start-Process $report.FullName }
}

if ($exitCode -ne 0) {
    Write-Host "`nk6 exited with $exitCode - one or more thresholds were breached." -ForegroundColor Yellow
}

exit $exitCode
