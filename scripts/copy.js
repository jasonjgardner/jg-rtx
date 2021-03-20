#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const { DIR_OUTPUT, asyncGlob } = require('./config')

/**
 * Deploy bakery output to repo and Minecraft
 * @async
 * @param {string} src Source file path
 * @param {string[]} dirs Array of directories to which `src` will be copied
 */
const deployTo = (src, dirs) => new Promise((resolve, reject) => {
  [...new Set(dirs)].forEach(dir => {
    const dest = path.join(dir, '/textures/blocks/', path.basename(src))

    fs.copyFile(src, dest, err => err ? reject(err) : resolve(dest))
  })
})

/**
 * Copy baked/optimized textures
 * @param  {string[]} dirs List of directories to which textures will be copied
 */
async function copyOutput (...dirs) {
  const textures = await asyncGlob(`${DIR_OUTPUT}/*.{png,tga}`)

  textures.map(file => deployTo(file, dirs))
}

module.exports = copyOutput
