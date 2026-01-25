# Mineways Terrain Generator - Local PowerShell Script
# This script wraps the TypeScript tooling for local development.
#
# Usage:
#   ./mineways/textures.ps1                    # Use TypeScript tooling (recommended)
#   ./mineways/textures.ps1 -Direct            # Use binaries directly (legacy mode)
#   ./mineways/textures.ps1 -Sizes "256,128"   # Custom sizes
#   ./mineways/textures.ps1 -DryRun            # Preview without writing

param(
    [switch]$Direct,
    [switch]$DryRun,
    [switch]$Verbose,
    [string]$Sizes = "256,128,64",
    [string]$Output = "dist\mineways",
    [string]$TerrainName = "JG-RTX"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

# Check if bun is available
$bunAvailable = Get-Command bun -ErrorAction SilentlyContinue

if (-not $Direct -and $bunAvailable) {
    Write-Host "Using TypeScript tooling..." -ForegroundColor Cyan

    $args = @()
    $args += "--sizes=$Sizes"
    $args += "--output=$Output"
    $args += "--terrain-name=$TerrainName"

    if ($DryRun) {
        $args += "--dry-run"
    }
    if ($Verbose) {
        $args += "--verbose"
    }

    & bun ./src/scripts/mineways.ts @args
    exit $LASTEXITCODE
}

# Legacy direct mode - use binaries directly
Write-Host "Using direct binary execution (legacy mode)..." -ForegroundColor Yellow

$ChannelMixerPath = ".\mineways\bin\mineways\TileMaker\ChannelMixer.exe"
$TileMakerPath = ".\mineways\bin\mineways\TileMaker\TileMaker.exe"
$TerrainBasePath = ".\mineways\bin\mineways\TileMaker\terrainBase.png"

# Check for local binaries, fall back to cache
if (-not (Test-Path $ChannelMixerPath)) {
    $CacheDir = ".\node_modules\.cache\mineways"
    if (Test-Path "$CacheDir\ChannelMixer.exe") {
        $ChannelMixerPath = "$CacheDir\ChannelMixer.exe"
        $TileMakerPath = "$CacheDir\TileMaker.exe"
        $TerrainBasePath = "$CacheDir\terrainBase.png"
        Write-Host "Using cached binaries from $CacheDir" -ForegroundColor Gray
    } else {
        Write-Host "Error: Binaries not found. Run 'bun ./src/scripts/mineways.ts' first to download them." -ForegroundColor Red
        exit 1
    }
}

# Create output directories
$StagingDir = "$Output\staging\blocks"
$ChannelMixerOutput = "$Output\channelMixer"
$TerrainDir = "$Output\terrain"

if ($DryRun) {
    Write-Host "[dry-run] Would create directories: $StagingDir, $ChannelMixerOutput, $TerrainDir" -ForegroundColor Gray
} else {
    New-Item -Path $StagingDir -ItemType Directory -Force | Out-Null
    New-Item -Path $ChannelMixerOutput -ItemType Directory -Force | Out-Null
    New-Item -Path $TerrainDir -ItemType Directory -Force | Out-Null
}

# Copy textures to staging
Write-Host "Copying textures to staging..." -ForegroundColor Cyan
if (-not $DryRun) {
    Copy-Item -Path ".\bedrock\pack\RP\textures\blocks\*.png" -Destination $StagingDir -Force
    if (Test-Path ".\mineways\textures\blocks") {
        Copy-Item -Path ".\mineways\textures\blocks\*.png" -Destination $StagingDir -Force
    }
}

# Run ChannelMixer
Write-Host "Running ChannelMixer..." -ForegroundColor Cyan
if ($DryRun) {
    Write-Host "[dry-run] Would run: $ChannelMixerPath -v -m -i $StagingDir -o $ChannelMixerOutput" -ForegroundColor Gray
} else {
    Start-Process -FilePath $ChannelMixerPath -ArgumentList "-v -m -i `"$StagingDir`" -o `"$ChannelMixerOutput`"" -Wait -NoNewWindow
}

# Run TileMaker for each size
$SizeList = $Sizes -split ","
foreach ($Size in $SizeList) {
    $Size = $Size.Trim()
    $OutputFile = "$TerrainDir\terrainExt_${TerrainName}${Size}.png"

    Write-Host "Running TileMaker @ ${Size}px..." -ForegroundColor Cyan
    if ($DryRun) {
        Write-Host "[dry-run] Would run: $TileMakerPath -v -m -i $TerrainBasePath -d $ChannelMixerOutput -o $OutputFile -t $Size" -ForegroundColor Gray
    } else {
        Start-Process -FilePath $TileMakerPath -ArgumentList "-v -m -i `"$TerrainBasePath`" -d `"$ChannelMixerOutput`" -o `"$OutputFile`" -t $Size" -Wait -NoNewWindow
    }
}

Write-Host "`nTerrain generation complete!" -ForegroundColor Green
Write-Host "Output: $TerrainDir" -ForegroundColor Gray
