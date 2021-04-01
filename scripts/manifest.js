#!/usr/bin/env node
import { readFile, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { DIR_PACK, DIR_SRC } from './config.js'
import { v4 as uuidv4 } from 'uuid'
import JSON5 from 'json5'

const args = process.argv.slice(2)
const regenerateId = args.includes('-u')

const readJson = filePath => new Promise((res, rej) => {
  readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      rej(err)
      return
    }

    try {
      res(JSON5.parse(data))
    } catch (err) {
      console.error('JSON parse error: %s', err)
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
  const { header } = await readJson(join(DIR_SRC, '/manifests/', `${packName}.json5`))
  const pkgVersion = await getVersion()

  let uuid = header.uuid

  if (regenerateId || !uuid.length) {
    uuid = uuidv4()
    console.log('Assigned new UUID: %s', uuid)
  }
  
  return {
    format_version: 2,
    header: {
      uuid,
      name: header.name.replace('(Preview)', pkgVersion.join('.')),
      description: header.description,
      version: pkgVersion,
      min_engine_version: header.min_engine_version || [1, 16, 2],
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
  const dest = join(DIR_PACK, '/manifest.json')

  try {
    writeFileSync(dest, JSON.stringify(merged, null, 2))
    console.log('Manifest file written to:\n%s', dest)
  } catch (err) {
    console.error(err)
  }
})()
