#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { DIR_DIST } = require('../config')
const { mergeManifests } = require('./update')

mergeManifests(process.env.PACK_NAME || 'JG-RTX').then(merged => {
  const dest = path.join(DIR_DIST, '/manifest.json')

  try {
    fs.writeFileSync(dest, JSON.stringify(merged))
    console.log('Manifest file written to %s', dest)
  } catch (err) {
    console.error(err)
  }
})
