param(
    [string]$SourceDirectory = (Get-Location)
)

$blocksSource = Join-Path -Path $PSScriptRoot -ChildPath "bedrock_blocks.txt"

# First read the valid block names from blocks.txt
$validBlocks = @()
if (Test-Path $blocksSource) {
    $validBlocks = Get-Content $blocksSource | ForEach-Object { $_.Trim() }
}
else {
    Write-Error "bedrock_blocks.txt not found in current directory!"
    exit 1
}

# Get all base texture files (those without _mer, _mers, _normal, or _heightmap suffix)
$baseTextures = Get-ChildItem -Recurse -Filter "*.png" | Where-Object {
    $_.Name -notmatch "_(mer|mers|normal|heightmap)\.png$"
}

# First, check for invalid textures and prompt for removal
$invalidTextures = $baseTextures | Where-Object {
    $_.Name -notin $validBlocks
}

if ($invalidTextures.Count -gt 0) {
    Write-Host "`nFound $($invalidTextures.Count) textures not listed in blocks.txt:"
    $invalidTextures | ForEach-Object {
        Write-Host "- $($_.Name)"
    }
    
    $removeChoice = Read-Host "`nWould you like to remove these invalid textures and their associated files? (y/n)"
    
    if ($removeChoice -eq 'y') {
        foreach ($invalidTexture in $invalidTextures) {
            $baseName = $invalidTexture.BaseName
            $directory = $invalidTexture.DirectoryName
            
            # Find all associated files
            $relatedFiles = Get-ChildItem -Path $directory -Filter "${baseName}*.png"
            
            # Remove each file
            foreach ($file in $relatedFiles) {
                Remove-Item $file.FullName -Force
                Write-Host "Removed: $($file.Name)"
            }
            
            # Also remove texture set json if it exists
            $jsonPath = Join-Path -Path $directory -ChildPath "$baseName.texture_set.json"
            if (Test-Path $jsonPath) {
                Remove-Item $jsonPath -Force
                Write-Host "Removed: $baseName.texture_set.json"
            }
        }
        Write-Host "`nCleanup complete!`n"
    }
}

# Now process only valid textures
$validBaseTextures = $baseTextures | Where-Object {
    $_.Name -in $validBlocks
}

foreach ($baseTexture in $validBaseTextures) {
    $baseName = $baseTexture.BaseName
    $directory = $baseTexture.DirectoryName
    $outputPath = Join-Path -Path $directory -ChildPath "$baseName.texture_set.json"

    # Check if the output file already exists
    if (Test-Path -Path $outputPath) {
        Write-Host "File $outputPath already exists. Skipping."
        continue
    }

    # Find associated texture files
    $merTexture = Get-ChildItem -Path $directory -Filter "${baseName}_mer.png" -ErrorAction SilentlyContinue
    $mersTexture = Get-ChildItem -Path $directory -Filter "${baseName}_mers.png" -ErrorAction SilentlyContinue
    $normalTexture = Get-ChildItem -Path $directory -Filter "${baseName}_normal.png" -ErrorAction SilentlyContinue
    $heightmapTexture = Get-ChildItem -Path $directory -Filter "${baseName}_heightmap.png" -ErrorAction SilentlyContinue

    # Initialize texture set object
    $textureSet = @{
        format_version          = "1.16.100"
        "minecraft:texture_set" = @{
            color = $baseTexture.Name -replace "\.tga|\.png", ""
        }
    }

    # Handle MER/MERS selection
    if ($merTexture -and $mersTexture) {
        Write-Host "Found both MER and MERS for $baseName"
        $useMers = Read-Host "Use MERS? y/n"
        if ($useMers -eq "yes" -or $useMers -eq "y") {
            $textureSet."minecraft:texture_set".metalness_emissive_roughness = $mersTexture.Name -replace "\.tga|\.png", ""
            return
        }
        $textureSet."minecraft:texture_set".metalness_emissive_roughness = $merTexture.Name -replace "\.tga|\.png", ""

        if ($merChoice -eq "mer") {
            $textureSet."minecraft:texture_set".metalness_emissive_roughness = $merTexture.Name -replace "\.tga|\.png", ""
        }
        if ($merChoice -eq "mers") {
            $textureSet."minecraft:texture_set".metalness_emissive_roughness = $mersTexture.Name -replace "\.tga|\.png", ""
        }
    }

    if ($merTexture -and -not $mersTexture) {
        $textureSet."minecraft:texture_set".metalness_emissive_roughness = $merTexture.Name -replace "\.tga|\.png", ""
    }

    if ($mersTexture -and -not $merTexture) {
        $textureSet."minecraft:texture_set".metalness_emissive_roughness = $mersTexture.Name -replace "\.tga|\.png", ""
    }

    # Handle normal texture
    if ($normalTexture) {
        $textureSet."minecraft:texture_set".normal = $normalTexture.Name -replace "\.tga|\.png", ""
    }

    # Handle heightmap texture
    if ($heightmapTexture) {
        $textureSet."minecraft:texture_set".heightmap = $heightmapTexture.Name -replace "\.tga|\.png", ""
    }

    # Save the texture set to JSON file
    $textureSetJson = $textureSet | ConvertTo-Json -Depth 10 -Compress
    $textureSetJson | Out-File -FilePath $outputPath -Encoding UTF8
}