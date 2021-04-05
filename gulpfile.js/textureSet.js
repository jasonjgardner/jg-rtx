const { join, basename } = require('path')
const { statSync, writeFileSync } = require('fs')
const filenames = require('gulp-filenames')
const { src } = require('gulp')
const { DIR_RP_SRC } = require('../scripts/config.js')

const stripExtension = filename => filename.replace(/\.[^/.]+$/, '')

/**
 * Replace directory separator and remove extension name from texture path
 * @param {string} name Texture path
 * @returns {string}
 */
const sanitize = name => `${name}`.replace(/\\+/g, '/') //.replace(/\.(png|tga|jpe?g|gif)$/i, '')

/**
 * Get list of textures to parse
 * @returns {Array}
 */
const getTextureNames = () => [...filenames.get('textures')].map(sanitize)

function pipeTextures() {
    const blocksDir = join(DIR_RP_SRC, 'textures/blocks')

    return src(`${blocksDir}/**/*.{png,tga,jpeg,jpg,gif}`, {
        base: blocksDir
    })
        .pipe(filenames('textures'))
}

function listTextures(cb) {
    writeFileSync(join(DIR_RP_SRC, '/textures/textures_list.json'), JSON.stringify(getTextureNames(), null, 2))
    cb()
}



function parseTextures() {
    const nameExceptions = ['piston_top_normal', 'rail_normal', 'red_sandstone_normal', 'sandstone_normal']
    const allTextures = getTextureNames().map(stripExtension)

    /// Get list of MERs and normal maps
    const shaderTextures = allTextures.filter(v => v.match(/_(mer|normal)$/i) && !nameExceptions.includes(v))
    const baseTextures = allTextures.filter(v => !shaderTextures.includes(v))

    return {
        shaderTextures,
        baseTextures
    }
}

function createTextureSets(cb) {
    const { baseTextures, shaderTextures } = parseTextures()

    baseTextures.forEach(
        /**
         * 
         * @param {string} textureName Texture name which may include subdirectory
         */
        textureName => {
            const baseTextureName = basename(textureName).replace(/\.[^/.]+$/, '')
            const textureSetFilename = `${baseTextureName}.texture_set.json`
            const textureSetPath = join(DIR_RP_SRC, '/textures/blocks/', `${textureName}.texture_set.json`)

            if (baseTextureName.match(/_carried$/i)) {
                console.log('Carried textures do not require a texture set. Skipping %s', baseTextureName)
                return
            }

            try {
                if (statSync(join('./', textureSetPath))) {
                    console.log('Texture set exists: %s', textureSetPath)
                    return
                }
            } catch {
                console.log('Generating texture set: %s', textureSetPath)
            }

            /// TODO: Allow dynamic version input
            const format_version = '1.16.100'

            const textureSet = {
                format_version,
                'minecraft:texture_set': {
                    color: baseTextureName
                }
            }

            if (shaderTextures.includes(`${baseTextureName}_mer`)) {
                textureSet['minecraft:texture_set'].metalness_emissive_roughness = `${baseTextureName}_mer`
            } else {
                console.warn('Missing MER: %s', `${baseTextureName}_mer`)
                /// TODO: Prompt for array input or color
            }

            if (shaderTextures.includes(`${baseTextureName}_normal`)) { /// FIXME: This includes subdirectories with file names which match a base texture's name 
                textureSet['minecraft:texture_set'].normal = `${baseTextureName}_normal`
            } else {
                console.warn('Missing normal: %s', `${baseTextureName}_normal`)
            }

            /// Write texture set object to JSON file
            try {
                writeFileSync(textureSetPath, JSON.stringify(textureSet, null, 2))
                console.log('Created texture set file: %s', textureSetFilename)
            } catch (err) {
                console.error('Failed creating texture set file "%s": %s', textureSetFilename, err)
            }            
        })

    cb()
}

exports.pipeTextures = pipeTextures
exports.createTextureSets = createTextureSets
exports.listTextures = listTextures