$javaDir = ".\dist\java"
$sbar = "..\src\shelf\Converter.sbsar"

function ConvertTexture {
    param(
        [Parameter(Mandatory=$true)]
        [string]$path
    )

    $name = [System.IO.Path]::GetFileNameWithoutExtension($path)

    $base = "..\bedrock\pack\RP\textures\blocks\$name`.png"
    $normal = "..\bedrock\pack\RP\textures\blocks\$name`_normal.png"
    $mer = "..\bedrock\pack\RP\textures\blocks\$name`_mer.png"


    # Default to $name if $dest is empty
    if ($dest -eq "") {
        $dest = $name
    }

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

    # Prompt for new name
    $javaName = Read-Host "Enter Java name for block: $name"

    if ($javaName -eq "") {
        $javaName = $name
    }

    # Rename the files to the new name
    Move-Item "$javaDir\$name.png" "$javaDir\$javaName.png" -Force
    Move-Item "$javaDir\$name`_s.png" "$javaDir\$javaName`_s.png" -Force
    Move-Item "$javaDir\$name`_n.png" "$javaDir\$javaName`_n.png" -Force
}

# Prompt for a block first, then fallback to iterating through all blocks
$block = Read-Host "Enter block name"

if ($block -ne "") {
    ConvertTexture ".\bedrock\pack\RP\textures\blocks\$block"
    exit
}

# Iterate through all .texture_set.json in bedrock\pack\RP\textures\blocks.
# Use the basename from the texture_set.json file as the $name variable.

Get-ChildItem -Path ".\bedrock\pack\RP\textures\blocks" -Filter "*.texture_set.json" | ForEach-Object {
    ConvertTexture $_.FullName.Replace(".texture_set.json", "")
}