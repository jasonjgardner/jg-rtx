# Based on https://github.com/Outlandishly-Crafted/OLC-Texture-Pixel-Counter-Tool/
# Define the path to the directory containing the images
$imageDirectory = '.\bedrock\pack\RP\textures\blocks'

# Initialize the total pixel count
$totalPixels = 0

# Get all image files in the directory
$imageFiles = Get-ChildItem -Path $imageDirectory -Filter *.png -Recurse

# Loop through each image file
foreach ($file in $imageFiles) {
    # Load the image
    $image = [System.Drawing.Image]::FromFile($file.FullName)

    # Calculate the number of pixels (width x height)
    $pixelCount = $image.Width * $image.Height

    # Add to the total pixel count
    $totalPixels += $pixelCount

    # Dispose the image object to free resources
    $image.Dispose()
}

$maxPixels = 16384 * 16384

# Output the total pixel count
Write-Host "Total pixels in directory: $totalPixels"

# Output the percentage of the maximum pixel count
Write-Host "Percentage of maximum: $([math]::Round(($totalPixels / $maxPixels) * 100, 2))%"

# Calculate the number of textures that can be added to the current atlas
$remainingPixels = $maxPixels - $totalPixels

# Loop through each texture size
for ($i = 16; $i -le 1024; $i *= 2) {
    # Calculate the number of textures that can be added to the current atlas
    $remainingTextures = [math]::Floor(($remainingPixels / ($i * $i)) / 3) # Divide by each map type (color, normal, mer)

    # Output the number of textures that can be added to the current atlas
    Write-Host "Remaining textures @$i`: $remainingTextures"
}
