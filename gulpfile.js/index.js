const { series, parallel } = require('gulp')
const { image: optimizeImages, json: minifyJson } = require('./optimize.js')
const { lang: copyLanguageFiles, copyBaked, copyRtx } = require('./sync.js')
const { zip } = require('./zip.js')

exports.sync = parallel(copyLanguageFiles, copyBaked, copyRtx)
exports.build = series(optimizeImages, parallel(minifyJson, copyLanguageFiles))
exports.default = series(
    optimizeImages,
    minifyJson,
    copyLanguageFiles,
    zip
)