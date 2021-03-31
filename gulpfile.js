const { join } = require('path')
const { src, dest, series, parallel } = require('gulp')
const imagemin = require('gulp-imagemin')
const zip = require('gulp-zip')
const del = require('del')
const through2 = require('through2')
const JSON5 = require('json5')
const DIR_DIST = 'dist/'
const PACK_NAME = process.env.PACK_NAME || 'JG-RTX'
const DIR_RP_SRC = join('development_resource_packs/', PACK_NAME, '/')
const DIR_RP_DIST = join(DIR_DIST, PACK_NAME, '/')

function purgeDirectory(cb) {
    del([join(DIR_DIST, '*')])
    cb()
}

function optimizeImages() {
    return src(join(DIR_RP_SRC, '**/*.png'), {
        base: DIR_RP_SRC
    })
        .pipe(imagemin([
            imagemin.optipng({
                optimizationLevel: 4,
                bitDepthReduction: false,
                colorTypeReduction: false,
                paletteReduction: false,
                interlaced: false
            })
        ]))
    .pipe(dest(DIR_RP_DIST))
}

function copyLanguageFiles() {
    return src(join(DIR_RP_SRC, 'texts/*.lang'), {
        base: DIR_RP_SRC
    })
        .pipe(dest(DIR_RP_DIST))
}

function minifyJson() {
    return src(join(DIR_RP_SRC, '**/*.json'), {
        base: DIR_RP_SRC
    })
    .pipe(through2.obj((file, _, cb) => {
        let err;

        if (file.isBuffer()) {
            try {
                const json = JSON5.parse(file.contents.toString())
                file.contents = Buffer.from(JSON.stringify(json))
            } catch (e) {
                err = e
            }
        }

        cb(err, file)
    }))
    .pipe(dest(DIR_RP_DIST))
}

function createArchive() {
    /// TGAs excluded!
    return src(['**/*.json', '**/*.png', '**/*.lang'], {
        base: DIR_RP_DIST,
        cwd: DIR_RP_DIST
    })
    .pipe(zip(`${PACK_NAME}.mcpack`, {
        compress: false,
        modifiedTime: new Date()
    }))
    .pipe(dest(DIR_DIST))
}

/// TODO: Create texture_set.json files
// function writeTextureSets() {
//     const nameExceptions = ['piston_top_normal', 'rail_normal', 'red_sandstone_normal', 'sandstone_normal']

//    return src(join(DIR_RP_DIST, 'textures/blocks/**/*.{png,tga,jpeg,jpg,gif}'))
//     .pipe(through2.obj(
//         /**
//          * 
//          * @param {Vinyl} file Chunk
//          * @param {string} enc Encoding
//          * @param {function} cb Callback
//          */
//         (file, enc, cb) => {
//         let err;

//         console.log(file.stem)

//         cb(err, file)
//     }))
// }

exports.textureSets = parallel(writeTextureSets)

exports.zip = series(createArchive)
exports.clean = series(purgeDirectory)
exports.build = parallel(optimizeImages, minifyJson, copyLanguageFiles)
exports.default = series(
    optimizeImages,
    minifyJson,
    copyLanguageFiles,
    createArchive
)