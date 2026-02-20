import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

/**
 * CourseAssetsModule extends AbstractApiModule which requires a running app.
 * We test the extractAssetIds method logic in isolation.
 */

/* ---------- inline helper: extract extractAssetIds logic ---------- */
function extractAssetIds (schema, data, assets = []) {
  Object.entries(schema).forEach(([key, val]) => {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      return
    }
    if (val.properties) {
      extractAssetIds(val.properties, data[key], assets)
    } else if (val?.items?.properties) {
      data[key].forEach(d => extractAssetIds(val.items.properties, d, assets))
    } else if ((val?._backboneForms?.type === 'Asset' || val?._backboneForms === 'Asset') && data[key]) {
      const v = data[key].toString()
      if (!v.startsWith('http://') && !v.startsWith('https://')) {
        assets.push(v)
      }
    }
  })
  return Array.from(new Set(assets))
}

describe('CourseAssetsModule', () => {
  describe('#extractAssetIds()', () => {
    it('should extract asset IDs from flat schema', () => {
      const schema = {
        heroImage: { _backboneForms: { type: 'Asset' } }
      }
      const data = { heroImage: 'asset123' }
      const result = extractAssetIds(schema, data)
      assert.deepEqual(result, ['asset123'])
    })

    it('should extract asset IDs using short _backboneForms notation', () => {
      const schema = {
        graphic: { _backboneForms: 'Asset' }
      }
      const data = { graphic: 'asset456' }
      const result = extractAssetIds(schema, data)
      assert.deepEqual(result, ['asset456'])
    })

    it('should skip HTTP URLs', () => {
      const schema = {
        image: { _backboneForms: 'Asset' }
      }
      const data = { image: 'http://example.com/img.png' }
      const result = extractAssetIds(schema, data)
      assert.deepEqual(result, [])
    })

    it('should skip HTTPS URLs', () => {
      const schema = {
        image: { _backboneForms: 'Asset' }
      }
      const data = { image: 'https://example.com/img.png' }
      const result = extractAssetIds(schema, data)
      assert.deepEqual(result, [])
    })

    it('should recurse into nested properties', () => {
      const schema = {
        _globals: {
          properties: {
            logo: { _backboneForms: 'Asset' }
          }
        }
      }
      const data = { _globals: { logo: 'logo123' } }
      const result = extractAssetIds(schema, data)
      assert.deepEqual(result, ['logo123'])
    })

    it('should recurse into array items', () => {
      const schema = {
        _items: {
          items: {
            properties: {
              src: { _backboneForms: { type: 'Asset' } }
            }
          }
        }
      }
      const data = {
        _items: [
          { src: 'item1' },
          { src: 'item2' }
        ]
      }
      const result = extractAssetIds(schema, data)
      assert.deepEqual(result, ['item1', 'item2'])
    })

    it('should deduplicate asset IDs', () => {
      const schema = {
        img1: { _backboneForms: 'Asset' },
        img2: { _backboneForms: 'Asset' }
      }
      const data = { img1: 'same', img2: 'same' }
      const result = extractAssetIds(schema, data)
      assert.deepEqual(result, ['same'])
    })

    it('should skip keys not present in data', () => {
      const schema = {
        present: { _backboneForms: 'Asset' },
        missing: { _backboneForms: 'Asset' }
      }
      const data = { present: 'val1' }
      const result = extractAssetIds(schema, data)
      assert.deepEqual(result, ['val1'])
    })

    it('should skip falsy data values', () => {
      const schema = {
        image: { _backboneForms: 'Asset' }
      }
      const data = { image: '' }
      const result = extractAssetIds(schema, data)
      assert.deepEqual(result, [])
    })

    it('should return empty array when no assets found', () => {
      const schema = {
        title: { type: 'string' }
      }
      const data = { title: 'hello' }
      const result = extractAssetIds(schema, data)
      assert.deepEqual(result, [])
    })
  })
})
