#!/usr/bin/env node
import { readFile, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { DIR_DIST, DIR_SRC } from './config.js'
import { v4 as uuidv4 } from 'uuid'

const readJson = filePath => new Promise((res, rej) => {
  readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      rej(err)
      return
    }

    try {
      res(JSON.parse(data))
    } catch {
      rej('Failed parsing JSON data')
    }
  })
})

const getVersion = async () => {
    const data = await readJson(resolve('./package.json'))
    const { version } = data
    const pkgVersion = version.split('.').map(n => Math.max(0, +n))

    pkgVersion.length = 3;

    return pkgVersion
}

const mergeManifests = async packName => {
  const { header: { description, name } } = await readJson(join(DIR_SRC, '/manifests/', `${packName}.json`))
  const pkgVersion = await getVersion()

  return {
    format_version: 2,
    header: {
      name,
      description,
      version: pkgVersion,
      min_engine_version: [1, 16, 2],
      uuid: uuidv4()
    },
    modules: [
      {
        description: 'RTX resources',
        type: 'resources',
        uuid: uuidv4(),
        version: pkgVersion
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
  const dest = join(DIR_DIST, '/manifest.json')

  try {
    writeFileSync(dest, JSON.stringify(merged))
    console.log('Manifest file written to %s', dest)
  } catch (err) {
    console.error(err)
  }
})()
