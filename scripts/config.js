#!/usr/bin/env node
const { join, dirname } = require('path')

const PACK_NAME = process.env.PACK_NAME || 'JG-RTX'

/**
 * Minecraft Windows install directory
 * @type {string}
 */
const DIR_MINECRAFT = join(process.env.LocalAppData, '/Packages/Microsoft.MinecraftUWP_8wekyb3d8bbwe/LocalState/games/com.mojang')

/**
 * Workspace directory
 * @type {string}
 */
const DIR_ROOT = '.'

/**
 * Texture files source directory
 * @type {string}
 */
const DIR_SRC = join(DIR_ROOT, '/src')

/**
 * Directory containing distributable output
 * @type {string}
 */
const DIR_DIST = join(DIR_ROOT, '/dist')

const DIR_DEV_PACKS = './development_resource_packs'

/**
 * Minecraft development_resource_packs directory
 * @type {string}
 */
const DIR_DEV = join(DIR_MINECRAFT, '/development_resource_packs')

const DIR_RP_SRC = join(DIR_DEV_PACKS, '/', PACK_NAME, '/')

const DIR_RP_DIST = join(DIR_DIST, '/', PACK_NAME, '/')

/**
 * Texture size in pixels. Clamped between 128px and 1024px. Defaults to 256px
 * @type {number}
 */
const SIZE = Math.max(128, Math.min(1024, process.env.SIZE || 256))

module.exports = {
  DIR_MINECRAFT,
  DIR_DIST,
  DIR_ROOT,
  DIR_SRC,
  DIR_DEV,
  DIR_DEV_PACKS,
  DIR_RP_SRC,
  DIR_RP_DIST,
  PACK_NAME,
  SIZE
}