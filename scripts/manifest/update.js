#!/usr/bin/env node
const pkg = require('../../package.json')
const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const { DIR_SRC } = require('../config')

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

module.exports = {
  mergeManifests
}
