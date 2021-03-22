#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const pkg = require('../package.json')
const { DIR_DIST, DIR_SRC } = require('./config')
const { v4: uuidv4 } = require('uuid')

const PKG_VERSION = pkg.version.split('.').map(n => Math.max(0, +n))
PKG_VERSION.length = 3

const readManifest = filePath => new Promise(resolve => {
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      resolve(null)
      return
    }

    try {
      resolve(JSON.parse(data))
    } catch {
      resolve(null)
    }
  })
})

const mergeManifests = async packName => {
  const { header: { description, name } } = await readManifest(path.join(DIR_SRC, '/manifests/', `${packName}.json`))

  return {
    format_version: 2,
    header: {
      name,
      description,
      version: PKG_VERSION,
      min_engine_version: [1, 16, 2],
      uuid: uuidv4()
    },
    modules: [
      {
        description: 'RTX resources',
        type: 'resources',
        uuid: uuidv4(),
        version: PKG_VERSION
      }
    ],
    capabilities: [
      'raytraced'
    ]
  }
}

(async () => {
  const packName = process.env.PACK_NAME || 'JG-RTX'
  const merged = await mergeManifests(packName)
  const dest = path.join(DIR_DIST, '/manifest.json')

  try {
    fs.writeFileSync(dest, JSON.stringify(merged))
    console.log('Manifest file written to %s', dest)
  } catch (err) {
    console.error(err)
  }
})()
