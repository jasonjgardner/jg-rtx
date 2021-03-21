#!/usr/bin/env node
const path = require('path')
const colors = require('colors/safe')
const glob = require('glob')

colors.setTheme({
  title: 'blue',
  error: ['red', 'underline'],
  success: ['green', 'underline'],
  info: 'cyan',
  verbose: 'grey',
  warn: ['yellow', 'italic']
})

/**
 * Minecraft Windows install directory
 * @type {string}
 */
const DIR_MINECRAFT = path.join(process.env.LocalAppData, '/Packages/Microsoft.MinecraftUWP_8wekyb3d8bbwe/LocalState/games/com.mojang')

/**
 * Workspace directory
 * @type {string}
 */
const DIR_ROOT = path.dirname(__dirname)

/**
 * Texture files source directory
 * @type {string}
 */
const DIR_SRC = path.join(DIR_ROOT, '/src')

module.exports = {
  colors,
  DIR_MINECRAFT,
  DIR_ROOT,
  DIR_SRC,
  /**
   * .mcpack source directory
   * @type {string}
   */
  DIR_DIST: path.join(DIR_ROOT, '/development_resource_packs/', process.env.PACK_NAME || 'JG-RTX'),
  /**
   * Minecraft development_resource_packs directory
   * @type {string}
   */
  DIR_DEV: path.join(DIR_MINECRAFT, '/development_resource_packs'),
  /**
   * Texture set base layer files
   * @type {string}
   */
  DIR_BASE: path.join(DIR_SRC, '/bakery/unbaked'),
  /**
   * Baked/2D texture set base layer files
   * @type {string}
   */
  DIR_BAKED: path.join(DIR_SRC, '/bakery/baked'),
  /**
   * Half-baked and/or optimized texture set base layer files
   * @type {string}
   */
  DIR_OUTPUT: path.join(DIR_SRC, '/bakery/output'),
  /**
   * Texture size in pixels. Clamped between 128px and 1024px. Defaults to 256px
   * @type {number}
   */
  SIZE: Math.max(128, Math.min(1024, process.env.SIZE || 256)),
  /**
     * Asyncronous glob helper
     * @param {String} pattern Glob pattern
     * @param {glob.IOptions} options Glob configuration
     * @returns {Promise<String|glob.IGlob>} Matches or error message
     */
  asyncGlob: (pattern, options = {}) => new Promise((resolve, reject) => glob(
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
}
