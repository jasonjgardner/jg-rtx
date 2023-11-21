$javaDir = "C:\Users\jason\AppData\Roaming\.minecraft\resourcepacks\PBR-JG\assets\minecraft\textures\block"
$sbar = "..\src\shelf\Converter.sbsar"

function ConvertTexture {
    param(
        [Parameter(Mandatory=$true, Position=0)]
        [string] $Path,
        [Parameter(Mandatory=$false, Position=1)]
        [string] $Dest
    )

    $name = [System.IO.Path]::GetFileNameWithoutExtension($path)

    if (-not $dest) {
        $dest = $name
    } else {
        $dest = [System.IO.Path]::GetFileNameWithoutExtension($dest.ToLower())
    }

    $base = "..\bedrock\pack\RP\textures\blocks\$name`.png"
    $normal = "..\bedrock\pack\RP\textures\blocks\$name`_normal.png"
    $mer = "..\bedrock\pack\RP\textures\blocks\$name`_mer.png"

    $res = Start-Process "sbsrender.exe" `
        -WorkingDirectory .\dist `
        -ArgumentList `
            "--input $sbar render", `
            "--set-entry base@$base", `
            "--set-entry normal@$normal",  `
            "--set-entry mer@$mer", `
            "--output-name $name`_{outputNodeName}" `
        -Wait -NoNewWindow -PassThru `
        -RedirectStandardOutput "output.json" `
        -RedirectStandardError "error.txt" `

    if ($res.ExitCode -ne 0) {
        Write-Host "Error: $($res.ExitCode)"
        Get-Content "error.txt"
        exit $res.ExitCode
    }

    $json = Get-Content "output.json" | ConvertFrom-Json
    $textures = $json[0].outputs

    # Find the "identifier" and "value" property for each texture
    $props = $textures | ForEach-Object { [PSCustomObject]@{ identifier = $_.identifier; value = $_.value } }

    # Rename the "color" texture file to just $name.png

    $color = $props | Where-Object { $_.identifier -eq "color" }

    $colorPath = $color.value.Replace("_color.png", ".png")

    Move-Item $color.value $colorPath -Force

    $specularPath = $props | Where-Object { $_.identifier -eq "s" } | Select-Object -ExpandProperty value
    $normalPath = $props | Where-Object { $_.identifier -eq "n" } | Select-Object -ExpandProperty value

    Move-Item $specularPath $javaDir -Force
    Move-Item $normalPath $javaDir -Force
    Move-Item $colorPath $javaDir -Force

    # Rename the files to the new name
    Move-Item "$javaDir\$name.png" "$javaDir\$dest.png" -Force
    Move-Item "$javaDir\$name`_s.png" "$javaDir\$dest`_s.png" -Force
    Move-Item "$javaDir\$name`_n.png" "$javaDir\$dest`_n.png" -Force
}

# Get Java texture names from "javatextures.txt"
$javaTextures = Get-Content ".\src\scripts\javatextures.txt"

$javaTextureNames = $javaTextures | ForEach-Object { [System.IO.Path]::GetFileNameWithoutExtension($_).ToLower() }

$textureSets = Get-ChildItem -Path ".\bedrock\pack\RP\textures\blocks" -Filter "*.texture_set.json"

# Get the basename of all texture set files
$textureSetNames = $textureSets | ForEach-Object { [System.IO.Path]::GetFileNameWithoutExtension($_.FullName).Replace(".texture_set", "") }

# Prompt for which texture set to convert
$selectedTextures = $textureSetNames | Out-GridView -Title "Select texture set to convert" -OutputMode Multiple

foreach ($texture in $selectedTextures) {
    # Prompt for the Java texture name prior to conversion
    $javaTexture = $javaTextureNames | Out-GridView -Title "Select Java texture name for $texture" -OutputMode Single

    ConvertTexture $texture -dest "$javaTexture"
}
