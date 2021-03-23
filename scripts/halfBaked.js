#!/usr/bin/env node
import { resolve } from 'path'
import { writeFile } from 'fs'
import mergeImages from 'merge-images'
import Canvas from 'canvas/lib/canvas.js'
import Image from 'canvas/lib/image.js'
import colors from 'colors/safe.js'
import { DIR_BASE, DIR_BAKED, DIR_OUTPUT, SIZE, asyncGlob } from './config.js'

/**
 * Save base64-encoded data to an image file
 * @async
 * @param {String} dest Destination file path
 * @param {String} base64 Base64-encoded data
 * @returns {Promise} Results of `fs.writeFile`
 */
const saveImage = (dest, base64) => new Promise((res, rej) => {
  writeFile(dest, base64.replace(/^data:image\/png;base64,/, ''), 'base64', err => err ? rej(err) : res(dest))
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
    const filename = img.replace(DIR_BASE, '')
    return [filename, [img, resolve(`${DIR_BAKED}/${filename}`)]]
  })
}

(async () => {
  console.log(colors.yellow('Initializing image blending...'))

  const pairs = await getImagesPairs()

  console.log(colors.cyan('Found %i image pairs'), pairs.length)

  for (const [key, imgs] of pairs) {
    const dest = resolve(`${DIR_OUTPUT}/${key}`)

    try {
      const result = await bake(dest, imgs)

      console.log(colors.green(key))
      console.log(colors.cyan(`${result}\n`))
    } catch (err) {
      console.log(colors.red(key))
      console.error(colors.italic(err))
    }
  }
})()
