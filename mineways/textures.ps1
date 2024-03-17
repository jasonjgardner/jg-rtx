# Copy all textures from bedrock\pack\RP and mineways\textures to dist\mineways\blocks

Copy-Item -Path .\bedrock\pack\RP\textures\blocks -Filter *.png -Destination .\dist\mineways\blocks -Recurse -Force
Copy-Item -Path .\mineways\textures -Destination .\dist\mineways\blocks -Recurse -Force

$ChannelMixerPath = ".\mineways\bin\mineways\TileMaker\ChannelMixer.exe"
$TileMakerPath = ".\mineways\bin\mineways\TileMaker\TileMaker.exe"

$cmInput = ".\dist\mineways\blocks"
$cmOutput = ".\dist\mineways\channelMixer"

if (-not (Test-Path $cmOutput)) {
    New-Item -Path $cmOutput -ItemType Directory
}

Start-Process -FilePath $ChannelMixerPath -ArgumentList "-v -i `"$($cmInput)`" -o `"$($cmOutput)`" -m" -Wait -NoNewWindow
Start-Process -FilePath $TileMakerPath -ArgumentList "-v -m -i .\mineways\bin\mineways\TileMaker\terrainBase.png -d $($cmOutput) -o .\dist\mineways\terrainExt_JGRTX256.png -t 256" -Wait -NoNewWindow
