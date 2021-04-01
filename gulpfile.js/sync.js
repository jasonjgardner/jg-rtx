const { join } = require('path')
const { src, dest, parallel } = require('gulp')
const { DIR_RP_DIST, DIR_RP_SRC, DIR_SRC, DIR_DEV_PACKS, PACK_NAME } = require('../scripts/config.js')

function copyLanguageFiles() {
    return src(join(DIR_RP_SRC, 'texts/*.lang'), {
        base: DIR_RP_SRC
    })
        .pipe(dest(DIR_RP_DIST))
}

function copyBaked() {
    const bakedTextures = join(DIR_SRC, 'textures/blocks/baked')

    return src(join(bakedTextures, '/**/*.png'), {
        base: bakedTextures
    })
    .pipe(dest(join(DIR_DEV_PACKS, `/${PACK_NAME}_rtxoff/textures/blocks`)))
}

function copyRtx() {
    const base = join(DIR_SRC, 'textures/blocks/')
    const rtxTextures = [
        join(base, '**/*.{png,tga}'),
        `!${join(DIR_SRC, 'textures/blocks/baked/**')}`
    ]

    return src(rtxTextures, { base })
        .pipe(dest(join(DIR_RP_SRC, 'textures/blocks/')))
}

exports.lang = copyLanguageFiles
exports.copyBaked = copyBaked
exports.copyRtx = copyRtx

exports.default = parallel(copyRtx, copyBaked, copyLanguageFiles)
