const { join } = require('path')
const { writeFile } = require('fs')
const filenames = require('gulp-filenames')
const mergeImages = require('merge-images')
const { Canvas, Image } = require('canvas');
const { src } = require('gulp')
const { DIR_SRC, DIR_ROOT, DIR_RP_SRC } = require('../scripts/config.js')

const TEXTURE_SIZE = 256
const KEY_ATLAS = 'atlases'
const DIR_ATLAS = join(DIR_ROOT, '/', DIR_SRC, '/atlases')

function pipeAtlasTextures() {
    return src(join(DIR_ATLAS, '/**/*.{png,tga,jpg,jpeg}')).pipe(filenames(KEY_ATLAS))
}   

function stitchAtlas(cb) {
    const files = Array.from(filenames.get(KEY_ATLAS))

    const merge = files.reduce((prev, cur, idx) => ({
        src,
        x: 0,
        y: idx * TEXTURE_SIZE
    }), [])

    if (!merge.length) {
        console.warn('No atlas textures found')
        return cb()
    }

    mergeImages(merge, {
        Canvas,
        Image,
        width: TEXTURE_SIZE,
        height: files.length * TEXTURE_SIZE
    }).then(b64 => {
        const out = join(DIR_RP_SRC, '/textures/blocks/', merge[0], '.png')

        /// Write b64 to file
        writeFile(out, b64, err => {
            if (err) {
                throw err
            }

            console.log('Created atlas file: %s', out)

            cb()
        })
    })
}

exports.pipeAtlasTextures = pipeAtlasTextures
exports.stitchAtlas = stitchAtlas