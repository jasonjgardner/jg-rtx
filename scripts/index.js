#!/usr/bin/env node
const { colors, DIR_DIST, DIR_DEV } = require('./config')
const bakery = require('./halfBaked')
const deploy = require('./copy')
const mcpack = require('./mcpack')

console.log(colors.title('Getting baked...'))
bakery().then(() => {
  console.log(colors.title('Copying textures...'))
  return deploy(DIR_DIST, DIR_DEV)
})
  .then(() => {
    console.log(colors.title('Creating resource pack...'))
    mcpack(process.env.PACK_NAME || 'JG-RTX')
  })
