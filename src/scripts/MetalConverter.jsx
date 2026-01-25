#target photoshop

// 1. Setup - Make sure you have your Albedo open
var doc = app.activeDocument;
var originalLayer = doc.activeLayer;

// 2. The Metals Database (sRGB Targets for Photoshop)
var metals = [
    { name: "Iron", r: 191, g: 187, b: 184, id: 230 },
    { name: "Gold", r: 249, g: 227, b: 166, id: 231 },
    { name: "Aluminum", r: 245, g: 245, b: 246, id: 232 },
    { name: "Chrome", r: 195, g: 195, b: 195, id: 233 },
    { name: "Copper", r: 246, g: 220, b: 188, id: 234 },
    { name: "Lead", r: 207, g: 206, b: 209, id: 235 },
    { name: "Platinum", r: 213, g: 208, b: 200, id: 236 },
    { name: "Silver", r: 251, g: 249, b: 246, id: 237 }
];

// 3. Create Output Layer
var outLayer = doc.artLayers.add();
outLayer.name = "labPBR_F0_Output";
doc.selection.selectAll();
// Fill background with Dielectric (RGB 10)
var colorRef = new SolidColor();
colorRef.rgb.red = 10; colorRef.rgb.green = 10; colorRef.rgb.blue = 10;
doc.selection.fill(colorRef);
doc.selection.deselect();

// 4. The Loop
for (var i = 0; i < metals.length; i++) {
    var m = metals[i];

    // Select the Albedo again to sample from
    doc.activeLayer = originalLayer;

    // Run "Color Range" via ScriptListener code (Color Range isn't in standard DOM)
    selectColorRange(m.r, m.g, m.b, 40); // 40 is Fuzziness

    // Switch to Output Layer and Fill
    doc.activeLayer = outLayer;

    try {
        var fillCol = new SolidColor();
        fillCol.rgb.red = m.id; fillCol.rgb.green = m.id; fillCol.rgb.blue = m.id;
        doc.selection.fill(fillCol);
    } catch (e) {
        // Selection was empty, skip
    }

    doc.selection.deselect();
}

alert("Done! Now add a Layer Mask using your Metallic map.");

// --- Helper Function for Color Range ---
function selectColorRange(r, g, b, fuzziness) {
    var desc = new ActionDescriptor();
    desc.putInteger(charIDToTypeID("Fzns"), fuzziness);
    var colorDesc = new ActionDescriptor();
    colorDesc.putDouble(charIDToTypeID("Rd  "), r);
    colorDesc.putDouble(charIDToTypeID("Grn "), g);
    colorDesc.putDouble(charIDToTypeID("Bl  "), b);
    desc.putObject(charIDToTypeID("Mnm "), charIDToTypeID("RGBC"), colorDesc);
    desc.putObject(charIDToTypeID("Mxm "), charIDToTypeID("RGBC"), colorDesc);
    executeAction(charIDToTypeID("ClrR"), desc, DialogModes.NO);
}