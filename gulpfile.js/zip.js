const zip = require('gulp-zip')
const { src, dest, series } = require('gulp')
const { PACK_NAME, DIR_RP_DIST, DIR_DIST } = require('../scripts/config.js')

function createArchive() {
    return src(['**/*.json', '**/*.png', '**/*.lang', '**/*.tga'], {
        base: DIR_RP_DIST,
        cwd: DIR_RP_DIST
    })
    .pipe(zip(`${PACK_NAME}.mcpack`, {
        compress: false,
        modifiedTime: new Date()
    }))
    .pipe(dest(DIR_DIST))
}

exports.zip = createArchive

exports.default = series(createArchive)