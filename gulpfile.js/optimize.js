const imagemin = require('gulp-imagemin')
const through2 = require('through2')
const JSON5 = require('json5')
const { join } = require('path')
const { src, dest, series } = require('gulp')
const { DIR_RP_DIST, DIR_RP_SRC } = require('../scripts/config.js')

function optimizeImages() {
    return src(join(DIR_RP_SRC, '/**/*.png'), {
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

exports.json = minifyJson
exports.image = optimizeImages

exports.default = series(minifyJson, optimizeImages)