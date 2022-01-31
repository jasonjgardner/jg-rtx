# Assets

## [shelf](src/shelf/)
Contains Adobe Substance 3D templates and presets based on those mentioned in [NVIDIA's Minecraft PBR texturing guide](https://www.nvidia.com/en-us/geforce/guides/minecraft-rtx-texturing-guide/).

> ![JG RTX Substance Painter output template](https://user-images.githubusercontent.com/1903667/151726146-91e7da12-c5ee-415f-8301-69d4cbbe555a.png)
>
> Recommended [export preset](src/shelf/export-presets/) example. Similar to `_MINECRAFT_PBR__PNG` in NVIDIA tutorial, but includes 2D view output and supports multiple texture sets in a project.

### Substance Painter Plugin
[Try my __Texture Set JSON Generator Substance Painter plugin__](https://github.com/jasonjgardner/painter-plugin-texture-set-json/releases)! The plugin will export the required .texutre_set.json files directly from Substance Painter.

## [meshes](src/meshes/)
Contains 3D meshes used in Substance Painter. Includes [cube.fbx](src/meshes/cube.fbx) file from NVIDIA tutorial.

## [entity](src/entity/)

> ### *"At this time there is no support for authoring PBR materials for entities, skins, or Character Creator items"*
> __– [RTX FAQ](http://aka.ms/ray-tracing-faq)__

This directory contains normal and MER maps for entities. These textures are currently unused in the resouce pack. They're here for safe keeping / wishful thinking.
