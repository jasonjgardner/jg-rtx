#!/usr/bin/env node
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import glob from 'glob'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Minecraft Windows install directory
 * @type {string}
 */
export const DIR_MINECRAFT = join(process.env.LocalAppData, '/Packages/Microsoft.MinecraftUWP_8wekyb3d8bbwe/LocalState/games/com.mojang')

/**
 * Workspace directory
 * @type {string}
 */
export const DIR_ROOT = dirname(__dirname)

/**
 * Texture files source directory
 * @type {string}
 */
export const DIR_SRC = join(DIR_ROOT, '/src')

/**
 * .mcpack source directory
 * @type {string}
 */
export const DIR_DIST = join(DIR_ROOT, '/development_resource_packs/', process.env.PACK_NAME || 'JG-RTX')

/**
 * Minecraft development_resource_packs directory
 * @type {string}
 */
export const DIR_DEV = join(DIR_MINECRAFT, '/development_resource_packs')

/**
   * Texture set base layer files
   * @type {string}
   */
export const DIR_BASE = join(DIR_SRC, '/bakery/unbaked')

/**
 * Baked/2D texture set base layer files
 * @type {string}
 */
export const DIR_BAKED = join(DIR_SRC, '/bakery/baked')

/**
 * Half-baked and/or optimized texture set base layer files
 * @type {string}
 */
export const DIR_OUTPUT = join(DIR_SRC, '/bakery/output')

/**
 * Texture size in pixels. Clamped between 128px and 1024px. Defaults to 256px
 * @type {number}
 */
export const SIZE = Math.max(128, Math.min(1024, process.env.SIZE || 256))

/**
 * Asyncronous glob helper
 * @param {String} pattern Glob pattern
 * @param {glob.IOptions} options Glob configuration
 * @returns {Promise<String|glob.IGlob>} Matches or error message
 */
export const asyncGlob = (pattern, options = {}) => new Promise((resolve, reject) => glob(
  pattern,
  {
    nosort: true,
    nodir: true,
    realpath: true,
    ...options
  },
  /**
   * Callback for async
   * @param {string} err Glob error message
   * @param {glob.IGlob} matches List of files matched by glob pattern
   * @returns {mixed}
   */
  (err, matches) => err ? reject(err) : resolve(matches)
))
