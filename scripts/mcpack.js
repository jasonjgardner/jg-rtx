#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { colors, DIR_ROOT, DIR_DEV } = require('./config')
const archiver = require('archiver')

/**
 * Create .mcpack archive
 * @param {string} packName Target resource pack
 * @returns {Promise}
 */
async function pack (packName) {
  const archive = archiver('zip')
  const dest = path.join(DIR_ROOT, `/dist/${packName}.mcpack`)
  const output = fs.createWriteStream(dest)

  output.on('close', () => {
    console.log(colors.info('%i total bytes'), archive.pointer())
    console.log(colors.inverse('Created resource pack: %s\n'), dest)
  })

  archive.on('warning', err => {
    if (err.code === 'ENOENT') {
      console.warn(colors.warn(err))
      return
    }

    throw err
  })

  archive.on('error', err => {
    throw err
  })

  archive.pipe(output)

  archive.directory(path.join(DIR_DEV, `/${packName}`), false)

  return await archive.finalize()
}

module.exports = pack
