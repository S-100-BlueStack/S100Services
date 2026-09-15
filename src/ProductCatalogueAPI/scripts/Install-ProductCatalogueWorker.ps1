[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$ExecutablePath,

    [switch]$StartService
)

$ErrorActionPreference = "Stop"

$serviceName = "ProductCatalogueWorker"
$displayName = "Product Catalogue Worker"
$description = "Product Catalogue isolated Hangfire and ArcGIS background worker."

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an elevated PowerShell session."
}

if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
    throw "Windows service '$serviceName' already exists. Stop and remove or reconfigure it before reinstalling."
}

$resolvedExecutablePath = (Resolve-Path -LiteralPath $ExecutablePath).Path
if ([IO.Path]::GetExtension($resolvedExecutablePath) -ne ".exe") {
    throw "ExecutablePath must point to the published ProductCatalogueAPI.exe."
}

$binaryPath = '"{0}" --ProductCatalogue:ProcessRole=Worker' -f $resolvedExecutablePath
$scExe = Join-Path $env:SystemRoot "System32\sc.exe"

function Invoke-ServiceControl {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & $scExe @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "sc.exe failed with exit code ${LASTEXITCODE}: $($Arguments -join ' ')"
    }
}

Invoke-ServiceControl -Arguments @(
    "create",
    $serviceName,
    "binPath=",
    $binaryPath,
    "start=",
    "auto",
    "obj=",
    "LocalSystem",
    "DisplayName=",
    $displayName
)

try {
    Invoke-ServiceControl -Arguments @("description", $serviceName, $description)
    Invoke-ServiceControl -Arguments @(
        "failure",
        $serviceName,
        "reset=",
        "86400",
        "actions=",
        "restart/60000/restart/60000/restart/60000"
    )
}
catch {
    & $scExe delete $serviceName | Out-Null
    throw
}

$service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'"
if ($null -eq $service) {
    throw "Windows service '$serviceName' was created but could not be queried."
}
if ($service.StartName -notin @("LocalSystem", ".\LocalSystem")) {
    throw "Windows service '$serviceName' is not configured for LocalSystem. Actual account: $($service.StartName)"
}

Write-Host "Installed $serviceName."
Write-Host "Binary: $($service.PathName)"
Write-Host "Account: $($service.StartName)"
Write-Host "Start mode: $($service.StartMode)"

if ($StartService) {
    Start-Service -Name $serviceName
    $startedService = Get-Service -Name $serviceName
    Write-Host "State: $($startedService.Status)"
}
else {
    Write-Host "Service was not started. Use Start-Service $serviceName after validating deployment configuration."
}
