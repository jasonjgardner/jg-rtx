const { join } = require('path')
const { src, dest, series } = require('gulp')
const { DIR_RP_SRC, PACK_NAME, DIR_MINECRAFT } = require('../scripts/config.js')

/**
 * Copy resource packs from development_resource_packs into Minecraft's "resource_packs" directory
 */
 function upload() {
    return src(join(DIR_RP_SRC, '/*'), { base: DIR_RP_SRC })
        .pipe(dest(join(DIR_MINECRAFT, '/resource_packs/', PACK_NAME, '/')))
}

exports.default = series(upload)