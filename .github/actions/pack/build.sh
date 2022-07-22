#!/bin/bash
echo "Creating output directory..."
rm -r dist/
mkdir dist

echo "Copying source files into output directory..."
cp -r bedrock/pack dist
cp -r bedrock/addon dist
cp -r bedrock/variety dist
cp -r java dist

echo "Creating main pack archive..."
cd dist/pack
zip -0 -r ../JG-RTX.mcpack .

if [[ $1 == nofog ]]; then
    echo "Removing fogs..."
    zip -d ../JG-RTX.mcpack biomes_client.json
fi

echo "Creating add-on archive..."
cd ../addon
zip -0 -r ../JG-RTX.mcaddon .

echo "Creating variety add-ons archive..."
cd ../variety
zip -0 -r ../JG-RTX_GlassVariety.mcpack ./glass

echo "Creating Java resource pack archive..."
cd ../java
zip -0 -r ../JG.zip .

echo "Cleaning up temporary files..."
cd ..
rm -r addon/
rm -r java/
rm -r pack/
rm -r variety/

echo "Generated packs:"
ls