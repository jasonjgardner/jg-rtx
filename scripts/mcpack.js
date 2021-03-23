#!/usr/bin/env node
import { createWriteStream } from 'fs'
import { join } from 'path'
import { DIR_ROOT, DIR_DEV } from './config.js'
import archiver from 'archiver'
import colors from 'colors/safe.js'

/**
 * Create .mcpack archive
 * @param {string} packName Target resource pack
 * @returns {Promise}
 */
async function pack (packName) {
  const archive = archiver('zip')
  const dest = join(DIR_ROOT, `/dist/${packName}.mcpack`)
  const output = createWriteStream(dest)

  output.on('close', () => {
    console.log(colors.blue('%i total bytes'), archive.pointer())
    console.log(colors.green('Created resource pack: %s\n'), dest)
  })

  archive.on('warning', err => {
    if (err.code === 'ENOENT') {
      console.warn(colors.yellow(err))
      return
    }

    throw err
  })

  archive.on('error', err => {
    throw err
  })

  archive.pipe(output)

  archive.directory(join(DIR_DEV, `/${packName}`), false)

  return await archive.finalize()
}

(async () => {
  const packName = process.env.PACK_NAME || 'JG-RTX'

  try {
    await pack(packName)
  } catch {
    console.error('Failed packing %s', packName)
  }
})()
