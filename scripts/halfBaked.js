#!/usr/bin/env node
const path = require('path')
const fs = require('fs')
const mergeImages = require('merge-images')
const { Canvas, Image } = require('canvas')

const { DIR_BASE, DIR_BAKED, DIR_OUTPUT, SIZE, colors, asyncGlob } = require('./config')

/**
 * Save base64-encoded data to an image file
 * @async
 * @param {String} dest Destination file path
 * @param {String} base64 Base64-encoded data
 * @returns {Promise} Results of `fs.writeFile`
 */
const saveImage = (dest, base64) => new Promise((resolve, reject) => {
  fs.writeFile(dest, base64.replace(/^data:image\/png;base64,/, ''), 'base64', err => err ? reject(err) : resolve(dest))
})

/**
 * Merge baked and base images
 * @param {String} dest Output file path
 * @param {String[]} src Array containing base file path and baked file path
 * @param {Object} options Additional options to pass to image merger process
 * @returns {Promise} Output file path
 */
async function bake (dest, src, options = {}) {
  const [base, baked] = src

  const b64 = await mergeImages([
    {
      src: base,
      x: 0,
      y: 0
    },
    {
      src: baked,
      x: 0,
      y: 0,
      opacity: 0.5
    }
  ],
  {
    Canvas,
    Image,
    width: SIZE,
    height: SIZE,
    format: 'image/png',
    quality: 100,
    ...options
  })

  return await saveImage(dest, b64)
}

/**
 * Get list of base textures and their corresponding baked textures
 * @async
 * @todo Ignore normal maps
 */
async function getImagesPairs () {
  const baseImages = await asyncGlob(`${DIR_BASE}/**/*.{png,tga}`, {
    ignore: ['*_mer.{png,tga}']
  })

  return baseImages.map(img => {
    const filename = path.basename(img)
    return [filename, [img, path.resolve(`${DIR_BAKED}/${filename}`)]]
  })
}

/**
 * Start baking process
 * @async
 * @returns {void}
 */
async function init () {
  console.log(colors.yellow('Initializing image blending...'))

  const pairs = await getImagesPairs()
  const found = pairs.length

  if (!found) {
    console.error(colors.error('No image pairs found!'))
    return
  }

  console.log(colors.verbose('Found %i image pairs'), found)

  for (const [key, imgs] of pairs) {
    const dest = path.resolve(`${DIR_OUTPUT}/${key}`)

    try {
      const result = await bake(dest, imgs)

      console.log(colors.success(key))
      console.log(colors.info(`${result}\n`))
    } catch (err) {
      console.log(colors.error(key))
      console.error(colors.italic(err))
    }
  }
}

module.exports = init
