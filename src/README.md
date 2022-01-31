# Creator Resources

The `src/` directory contains some of the tools and assets used to develop JG RTX.

#### LICENSE
The assets within this directory share [the repository's CC license](../LICENSE). Scripts may contain dependencies using MIT, BSD or Apache licenses.

## Scripts

### [main.ts](main.ts)
This is a nifty Deno script. It extracts the uniform color from .texture_set.json files and encodes the value as a texture. Currently used to generate [Mineways output](../mineways/).

## Assets

### [shelf/](shelf/)
Contains Adobe Substance 3D templates and presets based on those mentioned in [NVIDIA's Minecraft PBR texturing guide](https://www.nvidia.com/en-us/geforce/guides/minecraft-rtx-texturing-guide/).

> ![JG RTX Substance Painter output template](https://user-images.githubusercontent.com/1903667/151726146-91e7da12-c5ee-415f-8301-69d4cbbe555a.png)
>
> Recommended [export preset](shelf/export-presets/) example. Similar to `_MINECRAFT_PBR__PNG` in NVIDIA tutorial, but includes 2D view output and supports multiple texture sets in a project.

#### Substance Painter Plugin
[Try my __Texture Set JSON Generator Substance Painter plugin__](https://github.com/jasonjgardner/painter-plugin-texture-set-json/releases)! The plugin will export the required .texutre_set.json files directly from Substance Painter.

### [meshes/](meshes/)
Contains 3D meshes used in Substance Painter. Includes [cube.fbx](src/meshes/cube.fbx) file from NVIDIA tutorial.

### [entity/](entity/)

> ### *"At this time there is no support for authoring PBR materials for entities, skins, or Character Creator items"*
> __– [RTX FAQ](http://aka.ms/ray-tracing-faq)__

This directory contains normal and MER maps for entities. These textures are currently unused in the resouce pack. They're here for safe keeping / wishful thinking.
