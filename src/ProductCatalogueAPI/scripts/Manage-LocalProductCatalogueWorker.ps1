[CmdletBinding()]
param(
    [ValidateSet("Start", "Stop", "Restart", "Status")]
    [string]$Action = "Start",

    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug",

    [string]$Platform = "x64"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $PSScriptRoot
$projectFile = Join-Path $projectDirectory "ProductCatalogueAPI.csproj"
$stateRoot = Join-Path $env:LOCALAPPDATA "ProductCatalogue\LocalWorker"
$stateFile = Join-Path $stateRoot "worker-state.json"

function Get-LocalWorkerState {
    if (-not (Test-Path -LiteralPath $stateFile)) {
        return $null
    }

    try {
        return Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    }
    catch {
        Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
        return $null
    }
}

function Get-LocalWorkerProcess {
    param($State)

    if ($null -eq $State -or $null -eq $State.ProcessId) {
        return $null
    }

    try {
        $process = Get-Process -Id ([int]$State.ProcessId) -ErrorAction Stop
    }
    catch {
        return $null
    }

    if ($State.StartTimeUtc) {
        try {
            $expectedStartTime = [DateTimeOffset]::Parse($State.StartTimeUtc).UtcDateTime
            $actualStartTime = $process.StartTime.ToUniversalTime()
            if ([Math]::Abs(($actualStartTime - $expectedStartTime).TotalSeconds) -gt 5) {
                return $null
            }
        }
        catch {
            return $null
        }
    }

    if ($State.ExecutablePath) {
        try {
            if (-not [string]::Equals(
                $process.Path,
                [string]$State.ExecutablePath,
                [StringComparison]::OrdinalIgnoreCase
            )) {
                return $null
            }
        }
        catch {
            return $null
        }
    }

    return $process
}

function Remove-WorkerRuntime {
    param($State)

    if ($null -eq $State -or -not $State.RuntimeDirectory) {
        return
    }

    $runtimeDirectory = [string]$State.RuntimeDirectory
    if (Test-Path -LiteralPath $runtimeDirectory) {
        Remove-Item -LiteralPath $runtimeDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Clear-StaleWorkerState {
    $state = Get-LocalWorkerState
    if ($null -eq $state) {
        return
    }

    if ($null -eq (Get-LocalWorkerProcess -State $state)) {
        Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
        Remove-WorkerRuntime -State $state
    }
}

function Stop-LocalWorker {
    $state = Get-LocalWorkerState
    if ($null -eq $state) {
        Write-Host "Product Catalogue local Worker is not running."
        return
    }

    $process = Get-LocalWorkerProcess -State $state
    if ($null -eq $process) {
        Write-Host "Product Catalogue local Worker is not running. Removing stale local state."
        Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
        Remove-WorkerRuntime -State $state
        return
    }

    Write-Host "Stopping Product Catalogue local Worker (PID $($process.Id))..."
    Stop-Process -Id $process.Id -ErrorAction Stop

    try {
        $process.WaitForExit(10000) | Out-Null
    }
    catch {
        # The process may already have exited between Stop-Process and WaitForExit.
    }

    Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 250
    Remove-WorkerRuntime -State $state
    Write-Host "Product Catalogue local Worker stopped."
}

function Get-TargetFramework {
    if (-not (Test-Path -LiteralPath $projectFile)) {
        throw "Project file not found: $projectFile"
    }

    $projectText = Get-Content -LiteralPath $projectFile -Raw
    $singleTargetMatch = [regex]::Match(
        $projectText,
        "<TargetFramework>\s*([^<]+?)\s*</TargetFramework>",
        [Text.RegularExpressions.RegexOptions]::IgnoreCase
    )
    if ($singleTargetMatch.Success) {
        return $singleTargetMatch.Groups[1].Value.Trim()
    }

    $multiTargetMatch = [regex]::Match(
        $projectText,
        "<TargetFrameworks>\s*([^<]+?)\s*</TargetFrameworks>",
        [Text.RegularExpressions.RegexOptions]::IgnoreCase
    )
    if ($multiTargetMatch.Success) {
        $frameworks = $multiTargetMatch.Groups[1].Value.Split(
            ";",
            [StringSplitOptions]::RemoveEmptyEntries
        )
        if ($frameworks.Count -gt 0) {
            return $frameworks[0].Trim()
        }
    }

    throw "Could not determine TargetFramework from $projectFile"
}

function Start-LocalWorker {
    Clear-StaleWorkerState

    $existingState = Get-LocalWorkerState
    $existingProcess = Get-LocalWorkerProcess -State $existingState
    if ($null -ne $existingProcess) {
        Write-Host "Product Catalogue local Worker is already running (PID $($existingProcess.Id))."
        Write-Host "Use -Action Restart to replace it."
        return
    }

    $targetFramework = Get-TargetFramework
    $sourceDirectory = Join-Path $projectDirectory "bin\$Platform\$Configuration\$targetFramework"
    $sourceExecutable = Join-Path $sourceDirectory "ProductCatalogueAPI.exe"

    if (-not (Test-Path -LiteralPath $sourceExecutable)) {
        throw @"
Product Catalogue API build output was not found:
$sourceExecutable

Build ProductCatalogueAPI using $Configuration | $Platform in Visual Studio, then run this script again.
"@
    }

    New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null

    $runtimeDirectory = Join-Path $stateRoot (
        "runtime-{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), ([Guid]::NewGuid().ToString("N"))
    )
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null

    Write-Host "Preparing Product Catalogue local Worker..."
    Write-Host "Source:  $sourceDirectory"
    Write-Host "Runtime: $runtimeDirectory"

    Get-ChildItem -LiteralPath $sourceDirectory -Force |
        Copy-Item -Destination $runtimeDirectory -Recurse -Force

    $workerExecutable = Join-Path $runtimeDirectory "ProductCatalogueAPI.exe"
    if (-not (Test-Path -LiteralPath $workerExecutable)) {
        Remove-Item -LiteralPath $runtimeDirectory -Recurse -Force -ErrorAction SilentlyContinue
        throw "Worker executable was not copied to the local runtime directory."
    }

    $previousDotnetEnvironment = $env:DOTNET_ENVIRONMENT
    $previousAspNetCoreEnvironment = $env:ASPNETCORE_ENVIRONMENT

    try {
        $env:DOTNET_ENVIRONMENT = "Development"
        $env:ASPNETCORE_ENVIRONMENT = "Development"

        $startProcessArguments = @{
            FilePath = $workerExecutable
            ArgumentList = "--ProductCatalogue:ProcessRole=Worker"
            WorkingDirectory = $runtimeDirectory
            PassThru = $true
        }
        $process = Start-Process @startProcessArguments
    }
    finally {
        $env:DOTNET_ENVIRONMENT = $previousDotnetEnvironment
        $env:ASPNETCORE_ENVIRONMENT = $previousAspNetCoreEnvironment
    }

    Start-Sleep -Milliseconds 750
    $process.Refresh()
    if ($process.HasExited) {
        Remove-Item -LiteralPath $runtimeDirectory -Recurse -Force -ErrorAction SilentlyContinue
        throw "Product Catalogue local Worker exited during startup with exit code $($process.ExitCode)."
    }

    $state = [ordered]@{
        ProcessId = $process.Id
        StartTimeUtc = $process.StartTime.ToUniversalTime().ToString("O")
        ExecutablePath = $workerExecutable
        RuntimeDirectory = $runtimeDirectory
        SourceDirectory = $sourceDirectory
        Configuration = $Configuration
        Platform = $Platform
        TargetFramework = $targetFramework
    }

    $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $stateFile -Encoding UTF8

    Write-Host ""
    Write-Host "Product Catalogue local Worker started."
    Write-Host "PID:         $($process.Id)"
    Write-Host "ProcessRole: Worker"
    Write-Host "Environment: Development"
    Write-Host ""
    Write-Warning "If another Product Catalogue Worker uses the same Hangfire storage and queue, that Worker may consume jobs before this local Worker."
    Write-Host "Stop with: $PSCommandPath -Action Stop"
}

function Show-LocalWorkerStatus {
    Clear-StaleWorkerState

    $state = Get-LocalWorkerState
    $process = Get-LocalWorkerProcess -State $state
    if ($null -eq $process) {
        Write-Host "Product Catalogue local Worker is not running."
        return
    }

    Write-Host "Product Catalogue local Worker is running."
    Write-Host "PID:         $($process.Id)"
    Write-Host "Started:     $($process.StartTime)"
    Write-Host "Runtime:     $($state.RuntimeDirectory)"
    Write-Host "Source:      $($state.SourceDirectory)"
    Write-Host "ProcessRole: Worker"
}

switch ($Action) {
    "Start" {
        Start-LocalWorker
    }
    "Stop" {
        Stop-LocalWorker
    }
    "Restart" {
        Stop-LocalWorker
        Start-LocalWorker
    }
    "Status" {
        Show-LocalWorkerStatus
    }
}
