# Minecraft Resource Pack Build Scripts

Start with:

```shell
npm install
```

## How to deploy to Minecraft

Use this script to copy the Substance Painter output files saved in [the "bakery" directory](https://github.com/jasonjgardner/jg-rtx/tree/main/src/bakery) into Minecraft's  `development_resource_packs` folder.

```shell
npm run play
```

 1. Runs [half-baked script](https://github.com/jasonjgardner/jg-rtx/blob/main/scripts/halfBaked.js)
 2. Runs [install command](https://github.com/jasonjgardner/jg-rtx/blob/main/scripts/install.cmd)

## How to pack a new release

When adding new textures:
```shell
npm version minor
```

When fixing existing textures:
```shell
npm version patch
```

Then archive the resource pack directory and update its manifest with the new version number and a new UUID:

 ```shell
npm run release
 ```

1. Runs [half-baked script](https://github.com/jasonjgardner/jg-rtx/blob/main/scripts/halfBaked.js)
2. Runs [manifest update script](https://github.com/jasonjgardner/jg-rtx/blob/main/scripts/manifest.js) to generate a new UUID
3. Runs [.mcpack script](https://github.com/jasonjgardner/jg-rtx/blob/main/scripts/mcpack.js)

## How to use in Mineways

This script runs the steps from the [how-to guide on the Mineways website](http://www.realtimerendering.com/erich/minecraft/public/mineways/textures.html). It uses textures in the [repository's `development_resource_packs`](https://github.com/jasonjgardner/jg-rtx/tree/main/development_resource_packs) folder as the source.

> **TO DO:** Use [base textures](https://github.com/jasonjgardner/jg-rtx/tree/main/src/bakery/unbaked) as the source for Mineways

Simply cross your fingers and run:
```shell
npm run mineways
```

You can log this output by using:
```shell
npm run log:mineways
```