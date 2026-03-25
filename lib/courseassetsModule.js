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

    const [assets, content, mongodb] = await this.app.waitForModule('assets', 'content', 'mongodb')
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
    /** @ignore */
    this.collection = mongodb.getCollection(this.collectionName)
    /** @ignore */
    this.pendingDeletes = { courseIds: new Set(), contentIds: new Set(), promise: null }

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
      const items = Array.isArray(arg1) ? arg1 : [arg1]
      for (const c of items) {
        if (c._type === 'course') this.pendingDeletes.courseIds.add(c._id.toString())
        else this.pendingDeletes.contentIds.add(c._id.toString())
      }
      if (!this.pendingDeletes.promise) {
        this.pendingDeletes.promise = new Promise(resolve => setImmediate(resolve))
          .then(() => this.flushDeletes())
      }
      return this.pendingDeletes.promise
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
    await this.collection.deleteMany({ courseId, contentId })

    if (!ids.length) {
      return
    }
    const found = await this.assets.find({ _id: { $in: ids } })
    const foundIds = new Set(found.map(a => a._id.toString()))
    const validIds = ids.filter(id => foundIds.has(id))

    if (validIds.length) {
      const docs = validIds.map(assetId => ({ courseId, contentId, assetId }))
      await this.collection.insertMany(docs)
    }
    this.log('debug', 'UPDATE', courseId, contentId)
  }

  async flushDeletes () {
    const { courseIds, contentIds } = this.pendingDeletes
    this.pendingDeletes = { courseIds: new Set(), contentIds: new Set(), promise: null }

    const ops = []
    if (courseIds.size) ops.push(this.collection.deleteMany({ courseId: { $in: [...courseIds] } }))
    if (contentIds.size) ops.push(this.collection.deleteMany({ contentId: { $in: [...contentIds] } }))
    await Promise.all(ops)
    this.log('debug', 'DELETE', `${courseIds.size} courses, ${contentIds.size} content items`)
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
