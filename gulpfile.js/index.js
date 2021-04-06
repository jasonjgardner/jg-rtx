//const sprite = require('gulp-sprite-generator')
const { join } = require('path')
const { series, parallel, src, dest } = require('gulp')
const { image: optimizeImages, json: minifyJson } = require('./optimize.js')
const { copyLanguageFiles, copyBaked, copyRtx, reloadFromDist, reloadFromSrc } = require('./sync.js')
const { zip } = require('./zip.js')
const { DIR_RP_DIST, DIR_RP_SRC } = require('../scripts/config.js')
const { pipeTextures, createTextureSets, listTextures } = require('./textureSet.js')
const { pipeAtlasTextures, stitchAtlas } = require('./atlas.js')

function includeNonOptimized() {
    return src(join(DIR_RP_SRC, '**/*.tga'), {
        base: DIR_RP_SRC
    }).pipe(dest(join(DIR_RP_DIST)))
}

/**
 * Generate textures_list.json
 */
exports.textureList = series(pipeTextures, listTextures)

/**
 * Generate .texture_set.json files
 */
exports.textureSet = series(pipeTextures, createTextureSets)

exports.atlas = series(pipeAtlasTextures, stitchAtlas)

/**
 * Copy source files into Minecraft's development_resource_packs directory
 */
exports.reload = series(
    parallel(copyBaked, copyRtx),
    reloadFromSrc
)

/**
 * Build and copy dist files into Minecraft's development_resource_packs directory
 */
exports.test = series(
    parallel(copyLanguageFiles, copyBaked, copyRtx, minifyJson, includeNonOptimized),
    reloadFromDist
)

/**
 * Copies new textures into texture packs
 * Copies language files
 */
exports.sync = parallel(copyLanguageFiles, copyBaked, copyRtx)

/**
 * Copy and minify files
 */
exports.build = series(
    pipeTextures,
    parallel(listTextures, createTextureSets),
    series(pipeTextures, createTextureSets),
    parallel(includeNonOptimized, minifyJson, copyLanguageFiles), optimizeImages
)

/**
 * Minify and archive files
 */
exports.default = series(
    pipeTextures,
    parallel(
        listTextures,
        createTextureSets,
        copyLanguageFiles,
        includeNonOptimized
    ),
    minifyJson,
    optimizeImages,
    zip
)