# Copy all textures from bedrock\pack\RP and mineways\textures to dist\mineways\blocks

Copy-Item -Path ..\bedrock\pack\RP -Destination ..\dist\mineways\blocks -Recurse -Force
Copy-Item -Path ..\textures -Destination ..\dist\mineways\blocks -Recurse -Force

& "bin\TileMaker\ChannelMixer.exe" -v -m -i bedrock\pack\RP dist\mineways\blocks
& "bin\TileMaker\TileMaker.exe" -v -m -i bin\TileMaker\terrainBase.png -d dist\mineways\blocks -o dist\mineways\terrainExt_JGRTX256.png -t 256
