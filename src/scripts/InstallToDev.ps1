#requires -PSEdition Core
param (
    [Parameter(
        ValueFromPipeline = $true,
        ValueFromPipelineByPropertyName = $true,
        ParameterSetName = "rp",
        HelpMessage = "Resource Pack"
    )
    ]
    [Alias('Directory')]
    [string]$mcpack = 'JG-RTX.mcpack',
    [switch]$preview = $false
)

$comMojangPreview = Join-Path -Path $Env:LocalAppData -ChildPath 'Packages\Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe\LocalState\games\com.mojang'
$comMojang = Join-Path -Path $Env:LocalAppData -ChildPath 'Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang'

$rpDest = Join-Path -Path $comMojang -ChildPath "development_resource_packs\"

if (($preview -eq $true) -and (Test-Path -Path $comMojangPreview)) {
    $rpDest = Join-Path -Path $comMojangPreview -ChildPath 'development_resource_packs'
}

$dirName = $mcpack -replace '\.mcpack$', ''
$rpDir = Join-Path -Path $rpDest -ChildPath $dirName

if (Test-Path -Path $rpDir) {
    Remove-Item -Path $rpDir -Recurse -Force
}

Expand-Archive -Path $mcpack -DestinationPath $rpDir -Force