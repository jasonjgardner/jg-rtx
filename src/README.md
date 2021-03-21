# Half-Baked Textures

Baked textures at 50% opacity merged with unbaked base texture.

## Why?

Have you ever pre-ordered an Xbox Series X expecting it will be able to play your raytracing-enabled resource pack? Of course you have. It happens to all of us.

[So it's nice to have a fallback](https://github.com/jasonjgardner/jg-rtx/issues/8) when raytracing is not an option.

This "half-baked" approach is a compromise. It joins the unbaked base texture with its pre-rendered 2D-view to produce a new texture which hints at the material's lights and shadows with RTX off, while not overpowering those effects when RTX is on.

The half-baked textures will be used in the resource pack. The baked and unbaked base textures will be available in the repository.

This will also assist in eventually creating a fully-baked JG RTX option.

## How?

![JG RTX texture export output template](https://d26mkv3tdw1wgb.cloudfront.net/minecraft/export.jpg)

Substance Painter exports the texture's MERs, normal maps, base texture and 2D view.

The build process joins the base texture and 2D view to create the texture which will be used as the __color__ layer in `.texture_set.json`.

```shell
npm run build
```

...
