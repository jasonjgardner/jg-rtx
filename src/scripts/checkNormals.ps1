$ntpPath = ".\bin\NormalTextureProcessor.exe"

$ntpDir = ".\dist\ntp"

$src = ".\bedrock\pack\RP\textures\blocks";

if (-not (Test-Path $ntpDir)) {
    New-Item -Path $ntpDir -ItemType Directory
}

Copy-Item -Path $src -Filter "*_normal.png" -Destination $ntpDir -Recurse -Force

Start-Process -FilePath $ntpPath -ArgumentList "-a -v -idir .\dist\ntp\blocks" -Wait -NoNewWindow -RedirectStandardOutput ".\dist\ntp\ntp.log" -RedirectStandardError ".\dist\ntp\ntp.err"
