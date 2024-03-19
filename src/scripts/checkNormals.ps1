$ntpPath = ".\bin\NormalTextureProcessor.exe"

$ntpDir = ".\dist\ntp"

$bedrockSrc = ".\bedrock\pack\RP\textures\blocks\*";
$javaSrc = ".\java\pack\assets\minecraft\textures\block\*";

if (-not (Test-Path $ntpDir)) {
    New-Item -Path $ntpDir -ItemType Directory | Out-Null
}

Copy-Item -Path $bedrockSrc -Filter "*_normal.png" -Destination $ntpDir -Recurse -Force
Copy-Item -Path $javaSrc -Filter "*_n.png" -Destination $ntpDir -Recurse -Force

Start-Process -FilePath $ntpPath -ArgumentList "-a -v -etol 7 -idir .\dist\ntp" -Wait -NoNewWindow -RedirectStandardOutput ".\dist\ntp\ntp.log" -RedirectStandardError ".\dist\ntp\ntp.err"
