const { join } = require('path')
const { src, dest, parallel } = require('gulp')
const { DIR_RP_DIST, DIR_RP_SRC, DIR_SRC, DIR_DEV_PACKS, PACK_NAME, DIR_DEV } = require('../scripts/config.js')

function copyLanguageFiles() {
    return src(join(DIR_RP_SRC, 'texts/*.lang'), {
        base: DIR_RP_SRC
    })
        .pipe(dest(DIR_RP_DIST))
}

function copyBaked() {
    const base = join(DIR_SRC, 'textures/blocks/')

    return src(join(base, '**/*_carried.png'), { base })
        .pipe(dest(join(DIR_DEV_PACKS, `/${PACK_NAME}_rtxoff/textures/blocks`)))
}

function copyRtx() {
    const base = join(DIR_SRC, 'textures/blocks/')
    const rtxTextures = [
        join(base, '**/*_mer.png'),
        join(base, '**/*_normal.png'),
        join(base, '**/*.{tga,png}'),
        `!${join(base, '**/*_carried.{tga,png}')}`
    ]

    return src(rtxTextures, { base })
        .pipe(dest(join(DIR_RP_SRC, 'textures/blocks/')))
}

/**
 * Path to Minecraft installation's `development_resource_packs` directory
 */
 const DIR_RP_MINECRAFT = dest(join(DIR_DEV, '/', PACK_NAME))

 /**
  * Copy repo's `dist` directory to Minecraft
  * Make sure `dist` contains something first!
  */
 function reloadFromDist() {
     return src(join(DIR_RP_DIST, '/**'), {
         base: DIR_RP_DIST
     }).pipe(DIR_RP_MINECRAFT)
 }
 
 /**
  * Copy from repo's `development_resource_packs` into Minecraft
  */
 function reloadFromSrc() {
     return src(join(DIR_RP_SRC, '/**'), {
         base: DIR_RP_SRC
     }).pipe(DIR_RP_MINECRAFT)
 }

exports.reloadFromSrc = reloadFromSrc
exports.reloadFromDist = reloadFromDist

exports.copyLanguageFiles = copyLanguageFiles
exports.copyBaked = copyBaked
exports.copyRtx = copyRtx

exports.default = parallel(copyRtx, copyBaked, copyLanguageFiles)
