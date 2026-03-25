import { AbstractApiModule } from 'adapt-authoring-api'
import { extractAssetIds } from './utils.js'
/**
 * Module which handles courseassets automatically using on content events
 * @memberof courseassets
 * @extends {AbstractApiModule}
*/
class CourseAssetsModule extends AbstractApiModule {
  /** @override */
  async setValues () {
    await super.setValues()
    /** @ignore */ this.schemaName = 'courseasset'
    /** @ignore */ this.collectionName = 'courseassets'
  }

  /**
  * Initialise the module
  * @return {Promise}
  */
  async init () {
    await super.init()

    const [assets, content] = await this.app.waitForModule('assets', 'content')
    /**
     * Cached module instance for easy access
     * @type {AssetsModule}
     */
    this.assets = assets
    /**
     * Cached module instance for easy access
     * @type {ContentModule}
     */
    this.content = content

    this.assets.preDeleteHook.tap(this.handleDeletedAsset.bind(this));

    ['insert', 'update', 'delete'].forEach(action => { // note we just log any errors
      const hookName = `post${action[0].toUpperCase()}${action.slice(1)}Hook`
      this.content[hookName].tap(async (...args) => {
        try {
          await this.handleContentEvent(action, ...args).catch(e => this.log('error', e))
        } catch (e) {
          this.log('error', 'COURSEASSETS_UPDATE', e)
        }
      })
    })
  }

  /**
   * Handler for content event
   * @param {String} action The action performed
   * @param {object} arg1 First argument passed by the event
   * @param {object} arg2 Second argument passed by the event
   */
  async handleContentEvent (action, arg1, arg2) {
    if (action === 'delete') {
      return Promise.all((Array.isArray(arg1) ? arg1 : [arg1]).map(async c => {
        const key = c._type === 'course' ? 'courseId' : 'contentId'
        await this.deleteMany({ [key]: c._id })
        this.log('debug', 'DELETE', c._courseId.toString(), c._id.toString())
      }))
    }
    const type = arg1._type
    const contentId = arg1._id.toString()
    const courseId = arg1._courseId?.toString() ?? (type === 'course' ? contentId : undefined)
    const isModify = action === 'update'

    if (!contentId || !courseId) {
      return
    }
    const data = isModify ? arg2 : arg1
    const schema = await this.content.getSchema(this.content.schemaName, data)
    const ids = extractAssetIds(schema.built.properties, data)

    if (isModify) {
      const existing = await this.find({ courseId, contentId })
      const existingIds = existing.map(r => r.assetId.toString()).sort()
      if (ids.length === existingIds.length && ids.slice().sort().every((id, i) => id === existingIds[i])) {
        return
      }
    }
    // delete any existing course assets for content
    await this.deleteMany({ courseId, contentId })

    if (!ids.length) {
      return
    }
    const found = await this.assets.find({ _id: { $in: ids } })
    const foundIds = new Set(found.map(a => a._id.toString()))
    const validIds = ids.filter(id => foundIds.has(id))

    if (validIds.length) {
      const mongodb = await this.app.waitForModule('mongodb')
      const docs = validIds.map(assetId => ({ courseId, contentId, assetId }))
      await mongodb.getCollection(this.collectionName).insertMany(docs)
    }
    this.log('debug', 'UPDATE', courseId, contentId)
  }

  async handleDeletedAsset (asset) {
    const results = await this.find({ assetId: asset._id })
    if (!results.length) {
      return
    }
    const courses = (await this.content.find({ _id: { $in: results.map(r => r.courseId) } }))
      .map(c => c.displayTitle || c.title)

    throw this.app.errors.RESOURCE_IN_USE.setData({ type: 'asset', courses })
  }
}

export default CourseAssetsModule
