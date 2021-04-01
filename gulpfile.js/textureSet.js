function writeTextureSets() {
    const nameExceptions = ['piston_top_normal', 'rail_normal', 'red_sandstone_normal', 'sandstone_normal']

   return src(join(DIR_RP_DIST, 'textures/blocks/**/*.{png,tga,jpeg,jpg,gif}'))
    .pipe(through2.obj(
        /**
         * 
         * @param {Vinyl} file Chunk
         * @param {string} enc Encoding
         * @param {function} cb Callback
         */
        (file, enc, cb) => {
        let err;

        console.log(file.stem)

        cb(err, file)
    }))
}

exports.textureSets = writeTextureSets