#!/usr/bin/env node
const path = require('path')
const { colors, DIR_DIST, DIR_DEV } = require('./config')
const bakery = require('./halfBaked')
const deploy = require('./copy')
const mcpack = require('./mcpack')

const packName = process.env.PACK_NAME || 'JG-RTX'

bakery().then(() => {
  console.log(colors.title('Copying textures...'))
  return deploy(DIR_DIST, path.join(DIR_DEV, `/${packName}`))
})
  .then(() => {
    console.log(colors.title('Creating resource pack...'))
    mcpack(packName)
  })
