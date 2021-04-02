const { join } = require('path')
const { series, parallel, src, dest } = require('gulp')
const { image: optimizeImages, json: minifyJson } = require('./optimize.js')
const { lang: copyLanguageFiles, copyBaked, copyRtx } = require('./sync.js')
const { zip } = require('./zip.js')
const { DIR_RP_DIST, DIR_RP_SRC } = require('../scripts/config.js')

function includeNonOptimized() {
    return src(join(DIR_RP_SRC, '**/*.tga')).pipe(dest(join(DIR_RP_DIST)))
}

exports.sync = parallel(copyLanguageFiles, copyBaked, copyRtx)
exports.build = series(optimizeImages, parallel(includeNonOptimized, minifyJson, copyLanguageFiles))
exports.default = series(
    includeNonOptimized,
    optimizeImages,
    minifyJson,
    copyLanguageFiles,
    zip
)