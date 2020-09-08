// Copyright (C) 2016 Allegorithmic
//
// This software may be modified and distributed under the terms
// of the MIT license.  See the LICENSE file for details.

#target photoshop
app.bringToFront();
var startRulerUnits = app.preferences.rulerUnits;
var startTypeUnits = app.preferences.typeUnits;
var startDisplayDialogs = app.displayDialogs;
app.preferences.rulerUnits = Units.PIXELS;
app.preferences.typeUnits = TypeUnits.PIXELS;
app.displayDialogs = DialogModes.NO;

/*=============CODE GENERATED=============*/

var progressBar = new Window("window{\
text:'Loading',bounds:[100,100,700,200],\
stack:Progressbar{bounds:[0,10,580,20] , value:0,maxvalue:100}, \
channel:Progressbar{bounds:[0,30,580,40] , value:0,maxvalue:100}, \
layer:Progressbar{bounds:[0,50,580,60] , value:0,maxvalue:100}};");
progressBar.show();
progressBar.stack.value = 100;
progressBar.channel.value = 20;


//New Document 
   var exportFile = File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_basecolor.png"); 
   open(exportFile); 
   exportFile.remove();
   var folders = []; 
   folders.push(app.activeDocument); 
   var snapshot = app.activeDocument.activeLayer; 
   snapshot.name = "snapshot"; progressBar.layer.value = 50;


 //Add layer 
   folders[folders.length - 1].artLayers.add(); 
   var layerFile = File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_basecolor_1035.png"); 
   open_png(layerFile); 
   layerFile.remove(); 
   app.activeDocument.activeLayer.opacity = 100;
   app.activeDocument.activeLayer.blendMode = BlendMode.NORMAL;
   app.activeDocument.activeLayer.name = "Gold Pure";
   app.activeDocument.activeLayer.visible = true;progressBar.layer.value = 100;


 //Add layer 
   folders[folders.length - 1].artLayers.add(); 
   var layerFile = File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_basecolor_994.png"); 
   open_png(layerFile); 
   layerFile.remove(); 
   app.activeDocument.activeLayer.opacity = 100;
   app.activeDocument.activeLayer.blendMode = BlendMode.NORMAL;
   app.activeDocument.activeLayer.name = "Layer 1";
   app.activeDocument.activeLayer.visible = true;app.activeDocument.rasterizeAllLayers(); 
progressBar.layer.value = 0; 
 convert_to_profile(); 
snapshot.move(app.activeDocument, ElementPlacement.PLACEATBEGINNING); 
app.activeDocument.activeLayer = snapshot; 
snapshot.visible = false; 
 app.activeDocument.saveAs(File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_basecolor")); 
progressBar.channel.value = 40;


//New Document 
   var exportFile = File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_height.png"); 
   open(exportFile); 
   exportFile.remove();
   var folders = []; 
   folders.push(app.activeDocument); 
   var snapshot = app.activeDocument.activeLayer; 
   snapshot.name = "snapshot"; progressBar.layer.value = 50;


 //Add layer 
   folders[folders.length - 1].artLayers.add(); 
   var layerFile = File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_height_1035.png"); 
   open_png(layerFile); 
   layerFile.remove(); 
   app.activeDocument.activeLayer.opacity = 100;
   app.activeDocument.activeLayer.blendMode = BlendMode.LINEARDODGE;
   app.activeDocument.activeLayer.name = "Gold Pure";
   app.activeDocument.activeLayer.visible = true;progressBar.layer.value = 100;


 //Add layer 
   folders[folders.length - 1].artLayers.add(); 
   var layerFile = File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_height_994.png"); 
   open_png(layerFile); 
   layerFile.remove(); 
   app.activeDocument.activeLayer.opacity = 100;
   app.activeDocument.activeLayer.blendMode = BlendMode.LINEARDODGE;
   app.activeDocument.activeLayer.name = "Layer 1";
   app.activeDocument.activeLayer.visible = true;app.activeDocument.rasterizeAllLayers(); 
progressBar.layer.value = 0; 
snapshot.move(app.activeDocument, ElementPlacement.PLACEATBEGINNING); 
app.activeDocument.activeLayer = snapshot; 
snapshot.visible = false; 
 app.activeDocument.saveAs(File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_height")); 
progressBar.channel.value = 60;


//New Document 
   var exportFile = File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_roughness.png"); 
   open(exportFile); 
   exportFile.remove();
   var folders = []; 
   folders.push(app.activeDocument); 
   var snapshot = app.activeDocument.activeLayer; 
   snapshot.name = "snapshot"; progressBar.layer.value = 50;


 //Add layer 
   folders[folders.length - 1].artLayers.add(); 
   var layerFile = File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_roughness_1035.png"); 
   open_png(layerFile); 
   layerFile.remove(); 
   app.activeDocument.activeLayer.opacity = 100;
   app.activeDocument.activeLayer.blendMode = BlendMode.NORMAL;
   app.activeDocument.activeLayer.name = "Gold Pure";
   app.activeDocument.activeLayer.visible = true;progressBar.layer.value = 100;


 //Add layer 
   folders[folders.length - 1].artLayers.add(); 
   var layerFile = File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_roughness_994.png"); 
   open_png(layerFile); 
   layerFile.remove(); 
   app.activeDocument.activeLayer.opacity = 100;
   app.activeDocument.activeLayer.blendMode = BlendMode.NORMAL;
   app.activeDocument.activeLayer.name = "Layer 1";
   app.activeDocument.activeLayer.visible = true;app.activeDocument.rasterizeAllLayers(); 
progressBar.layer.value = 0; 
snapshot.move(app.activeDocument, ElementPlacement.PLACEATBEGINNING); 
app.activeDocument.activeLayer = snapshot; 
snapshot.visible = false; 
 app.activeDocument.saveAs(File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_roughness")); 
progressBar.channel.value = 80;


//New Document 
   var exportFile = File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_metallic.png"); 
   open(exportFile); 
   exportFile.remove();
   var folders = []; 
   folders.push(app.activeDocument); 
   var snapshot = app.activeDocument.activeLayer; 
   snapshot.name = "snapshot"; progressBar.layer.value = 50;


 //Add layer 
   folders[folders.length - 1].artLayers.add(); 
   var layerFile = File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_metallic_1035.png"); 
   open_png(layerFile); 
   layerFile.remove(); 
   app.activeDocument.activeLayer.opacity = 100;
   app.activeDocument.activeLayer.blendMode = BlendMode.NORMAL;
   app.activeDocument.activeLayer.name = "Gold Pure";
   app.activeDocument.activeLayer.visible = true;progressBar.layer.value = 100;


 //Add layer 
   folders[folders.length - 1].artLayers.add(); 
   var layerFile = File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_metallic_994.png"); 
   open_png(layerFile); 
   layerFile.remove(); 
   app.activeDocument.activeLayer.opacity = 100;
   app.activeDocument.activeLayer.blendMode = BlendMode.NORMAL;
   app.activeDocument.activeLayer.name = "Layer 1";
   app.activeDocument.activeLayer.visible = true;app.activeDocument.rasterizeAllLayers(); 
progressBar.layer.value = 0; 
snapshot.move(app.activeDocument, ElementPlacement.PLACEATBEGINNING); 
app.activeDocument.activeLayer = snapshot; 
snapshot.visible = false; 
 app.activeDocument.saveAs(File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_metallic")); 
progressBar.channel.value = 100;


//New Document 
   var exportFile = File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_normal.png"); 
   open(exportFile); 
   exportFile.remove();
   var folders = []; 
   folders.push(app.activeDocument); 
   var snapshot = app.activeDocument.activeLayer; 
   snapshot.name = "snapshot"; progressBar.layer.value = 50;


 //Add layer 
   folders[folders.length - 1].artLayers.add(); 
   var layerFile = File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_normal_1035.png"); 
   open_png(layerFile); 
   layerFile.remove(); 
   app.activeDocument.activeLayer.opacity = 100;
   Overlay_Normal();
   app.activeDocument.activeLayer.name = "Gold Pure";
   app.activeDocument.activeLayer.visible = true;progressBar.layer.value = 100;


 //Add layer 
   folders[folders.length - 1].artLayers.add(); 
   var layerFile = File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_normal_994.png"); 
   open_png(layerFile); 
   layerFile.remove(); 
   app.activeDocument.activeLayer.opacity = 100;
   Overlay_Normal();
   app.activeDocument.activeLayer.name = "Layer 1";
   app.activeDocument.activeLayer.visible = true;app.activeDocument.rasterizeAllLayers(); 
progressBar.layer.value = 0; 


 //Add fill layer 
   var layer = folders[folders.length - 1].artLayers.add(); 
   app.activeDocument.activeLayer.name = "Background"; 
   fillSolidColour(128,128,255);
   app.activeDocument.activeLayer.move(app.activeDocument, ElementPlacement.PLACEATEND); 
snapshot.move(app.activeDocument, ElementPlacement.PLACEATBEGINNING); 
app.activeDocument.activeLayer = snapshot; 
snapshot.visible = false; 
 app.activeDocument.saveAs(File("F:/Games/Minecraft/Minecraft Resource Packs/Development/JG Blocks/assets/blocks/Minecraft_photoshop_export/Material_34_normal")); 
progressBar.channel.value = 0; 


// Copyright (C) 2016 Allegorithmic
//
// This software may be modified and distributed under the terms
// of the MIT license.  See the LICENSE file for details.

progressBar.close();

/*=============HELPER=============*/

// Rasterize all layers.
function rasterize_All()
{
	try {
		executeAction(stringIDToTypeID('rasterizeAll'), undefined, DialogModes.NO);
	}
	catch (ignored) {}
}
function del_bg()
{
	try {
		var idslct = charIDToTypeID('slct');
		var descB = new ActionDescriptor();
		var idnull = charIDToTypeID('null');
		var refB = new ActionReference();
		var idLyr = charIDToTypeID('Lyr ');
		refB.putName(idLyr, 'Background');
		descB.putReference(idnull, refB);
		var idMkVs = charIDToTypeID('MkVs');
		descB.putBoolean(idMkVs, false);
		executeAction(idslct, descB, DialogModes.NO);
		app.activeDocument.activeLayer.remove();
	}
	catch (ignored) {}
	try {
		var idslct = charIDToTypeID('slct');
		var descB = new ActionDescriptor();
		var idnull = charIDToTypeID('null');
		var refB = new ActionReference();
		var idLyr = charIDToTypeID('Lyr ');
		refB.putName(idLyr, 'Layer 0');
		descB.putReference(idnull, refB);
		var idMkVs = charIDToTypeID('MkVs');
		descB.putBoolean(idMkVs, false);
		executeAction(idslct, descB, DialogModes.NO);
		app.activeDocument.activeLayer.remove();
	}
	catch (ignored) {}
}
function new_layer()
{
	var idMk = charIDToTypeID('Mk  ');
	var desc = new ActionDescriptor();
	var idnull = charIDToTypeID('null');
	var ref = new ActionReference();
	var idLyr = charIDToTypeID('Lyr ');
	ref.putClass(idLyr);
	desc.putReference(idnull, ref);
	executeAction(idMk, desc, DialogModes.NO);
}
function fillSolidColour(R, G, B)
{
  var id117 = charIDToTypeID( "Mk  " );
  var desc25 = new ActionDescriptor();
  var id118 = charIDToTypeID( "null" );
  var ref13 = new ActionReference();
  var id119 = stringIDToTypeID( "contentLayer" );
  ref13.putClass( id119 );
  desc25.putReference( id118, ref13 );
  var id120 = charIDToTypeID( "Usng" );
  var desc26 = new ActionDescriptor();
  var id121 = charIDToTypeID( "Type" );
  var desc27 = new ActionDescriptor();
  var id122 = charIDToTypeID( "Clr " );
  var desc28 = new ActionDescriptor();
  var id123 = charIDToTypeID( "Rd  " );
  desc28.putDouble( id123, R ); //red
  var id124 = charIDToTypeID( "Grn " );
  desc28.putDouble( id124, G ); //green
  var id125 = charIDToTypeID( "Bl  " );
  desc28.putDouble( id125, B ); //blue
  var id126 = charIDToTypeID( "RGBC" );
  desc27.putObject( id122, id126, desc28 );
  var id127 = stringIDToTypeID( "solidColorLayer" );
  desc26.putObject( id121, id127, desc27 );
  var id128 = stringIDToTypeID( "contentLayer" );
  desc25.putObject( id120, id128, desc26 );
  executeAction( id117, desc25, DialogModes.NO );
}
function send_backward()
{
	var id_mov = charIDToTypeID('move');
	var desc_ll = new ActionDescriptor();
	var id_null = charIDToTypeID('null');
	var ref_ll = new ActionReference();
	var id_Lyr = charIDToTypeID('Lyr ');
	var id_Ord = charIDToTypeID('Ordn');
	var id_Trg = charIDToTypeID('Trgt');
	ref_ll.putEnumerated(id_Lyr, id_Ord, id_Trg);
	desc_ll.putReference(id_null, ref_ll);
	var id_T = charIDToTypeID('T   ');
	var ref_d = new ActionReference();
	var id_LL = charIDToTypeID('Lyr ');
	var id_OO = charIDToTypeID('Ordn');
	var id_Prv = charIDToTypeID('Prvs');
	ref_d.putEnumerated(id_LL, id_OO, id_Prv);
	desc_ll.putReference(id_T, ref_d);
	executeAction(id_mov, desc_ll, DialogModes.NO);
}
function center_layer()
{
	var doc = activeDocument;
	var layer = doc.activeLayer;
	var bounds = layer.bounds;
	var res = doc.resolution;
	doc.resizeImage(undefined, undefined, 72, ResampleMethod.NONE);
	var docWidth = Number(doc.width);
	var docHeight = Number(doc.height);
	var layerWidth = Number(bounds[2] - bounds[0]);
	var layerHeight = Number(bounds[3] - bounds[1]);
	var dX = (docWidth - layerWidth) / 2 - Number(bounds[0]);
	var dY = (docHeight - layerHeight) / 2 - Number(bounds[1]);
	try
	{
		if (docWidth == layerWidth &  docHeight == layerHeight)
		{
			layer.translate(dX, dY);
		}
	}
	catch (e) {}
}
function open_png(path_f)
{
	var idPlc = charIDToTypeID('Plc ');
	var desc_sObj = new ActionDescriptor();
	var idnull = charIDToTypeID('null');
	desc_sObj.putPath(idnull, path_f);
	var idFTcs = charIDToTypeID('FTcs');
	var idQCSt = charIDToTypeID('QCSt');
	var idQcsa = charIDToTypeID('Qcsa');
	desc_sObj.putEnumerated(idFTcs, idQCSt, idQcsa);
	var idOfst = charIDToTypeID('Ofst');
	var desc_sObj_2 = new ActionDescriptor();
	var idHrzn = charIDToTypeID('Hrzn');
	var idPxlH = charIDToTypeID('#Pxl');
	desc_sObj_2.putUnitDouble(idHrzn, idPxlH, 0.000000);
	var idVrtc = charIDToTypeID('Vrtc');
	var idPxlV = charIDToTypeID('#Pxl');
	desc_sObj_2.putUnitDouble(idVrtc, idPxlV, 0.000000);
	var idOfst2 = charIDToTypeID('Ofst');
	desc_sObj.putObject(idOfst, idOfst2, desc_sObj_2);
	try
	{
		executeAction(idPlc, desc_sObj, DialogModes.NONE);
		return true;
	}
	catch (e)
	{
		return false;
	}
}
function layerToMask()
{
	var idsetd = charIDToTypeID('setd');
	var desc_Mask = new ActionDescriptor();
	var idnull = charIDToTypeID('null');
	var ref_Mask = new ActionReference();
	var idChnl = charIDToTypeID('Chnl');
	var idfsel = charIDToTypeID('fsel');
	ref_Mask.putProperty(idChnl, idfsel);
	desc_Mask.putReference(idnull, ref_Mask);
	var idT = charIDToTypeID('T   ');
	var idOrdn = charIDToTypeID('Ordn');
	var idAl = charIDToTypeID('Al  ');
	desc_Mask.putEnumerated(idT, idOrdn, idAl);
	executeAction(idsetd, desc_Mask, DialogModes.NO);
	var idcopy = charIDToTypeID('copy');
	executeAction(idcopy, undefined, DialogModes.NO);
	app.activeDocument.activeLayer.remove();
	var idMk = charIDToTypeID('Mk  ');
	var desc_select_all = new ActionDescriptor();
	var idNw = charIDToTypeID('Nw  ');
	var idChnl = charIDToTypeID('Chnl');
	desc_select_all.putClass(idNw, idChnl);
	var idAt = charIDToTypeID('At  ');
	var ref_select_all = new ActionReference();
	var idChnl = charIDToTypeID('Chnl');
	var idChnl = charIDToTypeID('Chnl');
	var idMsk = charIDToTypeID('Msk ');
	ref_select_all.putEnumerated(idChnl, idChnl, idMsk);
	desc_select_all.putReference(idAt, ref_select_all);
	var idUsng = charIDToTypeID('Usng');
	var idUsrM = charIDToTypeID('UsrM');
	var idRvlS = charIDToTypeID('RvlS');
	desc_select_all.putEnumerated(idUsng, idUsrM, idRvlS);
	executeAction(idMk, desc_select_all, DialogModes.NO);
	var idslct = charIDToTypeID('slct');
	var desc_aa = new ActionDescriptor();
	var idnull = charIDToTypeID('null');
	var ref_aa = new ActionReference();
	var idChnl = charIDToTypeID('Chnl');
	var idOrdn = charIDToTypeID('Ordn');
	var idTrgt = charIDToTypeID('Trgt');
	ref_aa.putEnumerated(idChnl, idOrdn, idTrgt);
	desc_aa.putReference(idnull, ref_aa);
	var idMkVs = charIDToTypeID('MkVs');
	desc_aa.putBoolean(idMkVs, true);
	executeAction(idslct, desc_aa, DialogModes.NO);
	var idpast = charIDToTypeID('past');
	var desc_past = new ActionDescriptor();
	var idAntA = charIDToTypeID('AntA');
	var idAnnt = charIDToTypeID('Annt');
	var idAnno = charIDToTypeID('Anno');
	desc_past.putEnumerated(idAntA, idAnnt, idAnno);
	executeAction(idpast, desc_past, DialogModes.NO);
	var idsetd = charIDToTypeID('setd');
	var desc_deselect = new ActionDescriptor();
	var idnull = charIDToTypeID('null');
	var ref_deselect = new ActionReference();
	var idChnl = charIDToTypeID('Chnl');
	var idfsel = charIDToTypeID('fsel');
	ref_deselect.putProperty(idChnl, idfsel);
	desc_deselect.putReference(idnull, ref_deselect);
	var idT = charIDToTypeID('T   ');
	var idOrdn = charIDToTypeID('Ordn');
	var idNone = charIDToTypeID('None');
	desc_deselect.putEnumerated(idT, idOrdn, idNone);
	executeAction(idsetd, desc_deselect, DialogModes.NO);
}
function Overlay_Normal(enabled, withDialog)
{
	try {
		if (enabled != undefined && !enabled)
			return;
		var dialogMode = (withDialog ? DialogModes.ALL : DialogModes.NO);
		var desc_on_1 = new ActionDescriptor();
		var ref_on = new ActionReference();
		ref_on.putEnumerated(charIDToTypeID('Lyr '), charIDToTypeID('Ordn'), charIDToTypeID('Trgt'));
		desc_on_1.putReference(charIDToTypeID('null'), ref_on);
		var desc_on_2 = new ActionDescriptor();
		desc_on_2.putEnumerated(charIDToTypeID('Md  '), charIDToTypeID('BlnM'), stringIDToTypeID('linearLight'));
		desc_on_2.putUnitDouble(stringIDToTypeID('fillOpacity'), charIDToTypeID('#Prc'), 50);
		desc_on_2.putBoolean(stringIDToTypeID('blendInterior'), true);
		var desc_on_3 = new ActionDescriptor();
		desc_on_3.putUnitDouble(charIDToTypeID('Scl '), charIDToTypeID('#Prc'), 100);
		var desc_on_4 = new ActionDescriptor();
		desc_on_4.putBoolean(charIDToTypeID('enab'), true);
		desc_on_4.putEnumerated(charIDToTypeID('Md  '), charIDToTypeID('BlnM'), stringIDToTypeID('linearBurn'));
		desc_on_4.putUnitDouble(charIDToTypeID('Opct'), charIDToTypeID('#Prc'), 100);
		var desc_on_5 = new ActionDescriptor();
		desc_on_5.putDouble(charIDToTypeID('Rd  '), 255);
		desc_on_5.putDouble(charIDToTypeID('Grn '), 255);
		desc_on_5.putDouble(charIDToTypeID('Bl  '), 127.998046875);
		desc_on_4.putObject(charIDToTypeID('Clr '), stringIDToTypeID('RGBColor'), desc_on_5);
		desc_on_3.putObject(charIDToTypeID('SoFi'), charIDToTypeID('SoFi'), desc_on_4);
		desc_on_2.putObject(charIDToTypeID('Lefx'), charIDToTypeID('Lefx'), desc_on_3);
		desc_on_1.putObject(charIDToTypeID('T   '), charIDToTypeID('Lyr '), desc_on_2);
		executeAction(charIDToTypeID('setd'), desc_on_1, dialogMode);
	}
	catch (ignored) {}
}
//Convert to profile Custom RGB... Gamma 1.0
// =========================================
function convert_to_profile()
{
	try
	{
		var idconvertToProfile = stringIDToTypeID('convertToProfile');
		var desc_cp = new ActionDescriptor();
		var idnull = charIDToTypeID('null');
		var ref_cp = new ActionReference();
		var idDcmn = charIDToTypeID('Dcmn');
		var idOrdn = charIDToTypeID('Ordn');
		var idTrgt = charIDToTypeID('Trgt');
		ref_cp.putEnumerated(idDcmn, idOrdn, idTrgt);
		desc_cp.putReference(idnull, ref_cp);
		var idT = charIDToTypeID('T   ');
		desc_cp.putData(
      idT,
      String.fromCharCode(
        0, 0, 1, 236, 65, 68, 66, 69, 2, 16, 0, 0, 109, 110, 116, 114, 82, 71, 66, 32, 88, 89,
        90, 32, 7, 224, 0, 8, 0, 31, 0, 20, 0, 22, 0, 17, 97, 99, 115, 112, 65, 80, 80, 76, 0,
        0, 0, 0, 110, 111, 110, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 246,
        214, 0, 1, 0, 0, 0, 0, 211, 44, 65, 68, 66, 69, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 9, 99, 112, 114, 116, 0, 0, 0, 240, 0, 0, 0, 50, 100, 101, 115, 99, 0, 0,
        1, 36, 0, 0, 0, 101, 119, 116, 112, 116, 0, 0, 1, 140, 0, 0, 0, 20, 114, 88, 89, 90, 0,
        0, 1, 160, 0, 0, 0, 20, 103, 88, 89, 90, 0, 0, 1, 180, 0, 0, 0, 20, 98, 88, 89, 90, 0, 0,
        1, 200, 0, 0, 0, 20, 114, 84, 82, 67, 0, 0, 1, 220, 0, 0, 0, 14, 103, 84, 82, 67, 0, 0,
        1, 220, 0, 0, 0, 14, 98, 84, 82, 67, 0, 0, 1, 220, 0, 0, 0, 14, 116, 101, 120, 116, 0, 0,
        0, 0, 67, 111, 112, 121, 114, 105, 103, 104, 116, 32, 50, 48, 49, 54, 32, 65, 100, 111,
        98, 101, 32, 83, 121, 115, 116, 101, 109, 115, 32, 73, 110, 99, 111, 114, 112, 111, 114,
        97, 116, 101, 100, 0, 0, 0, 100, 101, 115, 99, 0, 0, 0, 0, 0, 0, 0, 11, 67, 117, 115, 116,
        111, 109, 32, 82, 71, 66, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        88, 89, 90, 32, 0, 0, 0, 0, 0, 0, 243, 82, 0, 1, 0, 0, 0, 1, 22, 204, 88, 89, 90, 32, 0, 0,
        0, 0, 0, 0, 111, 161, 0, 0, 56, 245, 0, 0, 3, 144, 88, 89, 90, 32, 0, 0, 0, 0, 0, 0, 98,
        150, 0, 0, 183, 135, 0, 0, 24, 218, 88, 89, 90, 32, 0, 0, 0, 0, 0, 0, 36, 159, 0, 0, 15,
        132, 0, 0, 182, 194, 99, 117, 114, 118, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0));
		var idInte = charIDToTypeID('Inte');
		var idInte = charIDToTypeID('Inte');
		var idClrm = charIDToTypeID('Clrm');
		desc_cp.putEnumerated(idInte, idInte, idClrm);
		var idMpBl = charIDToTypeID('MpBl');
		desc_cp.putBoolean(idMpBl, true);
		var idDthr = charIDToTypeID('Dthr');
		desc_cp.putBoolean(idDthr, true);
		var idFltt = charIDToTypeID('Fltt');
		desc_cp.putBoolean(idFltt, false);
		var idsdwM = charIDToTypeID('sdwM');
		desc_cp.putInteger(idsdwM, 2);
		executeAction(idconvertToProfile, desc_cp, DialogModes.NO);
	}
	catch (ignored) {}
}
