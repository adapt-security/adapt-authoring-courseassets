import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractAssetIds } from '../lib/utils/extractAssetIds.js'

describe('extractAssetIds()', () => {
  it('should return empty array when no asset fields exist', () => {
    const schema = { title: { type: 'string' } }
    const data = { title: 'test' }
    assert.deepEqual(extractAssetIds(schema, data), [])
  })

  it('should extract asset ID from _backboneForms Asset string type', () => {
    const schema = { image: { _backboneForms: 'Asset' } }
    const data = { image: 'abc123' }
    assert.deepEqual(extractAssetIds(schema, data), ['abc123'])
  })

  it('should extract asset ID from _backboneForms.type Asset', () => {
    const schema = { image: { _backboneForms: { type: 'Asset' } } }
    const data = { image: 'abc123' }
    assert.deepEqual(extractAssetIds(schema, data), ['abc123'])
  })

  it('should skip keys not present in data', () => {
    const schema = { image: { _backboneForms: 'Asset' } }
    const data = {}
    assert.deepEqual(extractAssetIds(schema, data), [])
  })

  it('should skip falsy asset values', () => {
    const schema = { image: { _backboneForms: 'Asset' } }
    const data = { image: '' }
    assert.deepEqual(extractAssetIds(schema, data), [])
  })

  it('should skip HTTP URLs', () => {
    const schema = { image: { _backboneForms: 'Asset' } }
    const data = { image: 'http://example.com/image.png' }
    assert.deepEqual(extractAssetIds(schema, data), [])
  })

  it('should skip HTTPS URLs', () => {
    const schema = { image: { _backboneForms: 'Asset' } }
    const data = { image: 'https://example.com/image.png' }
    assert.deepEqual(extractAssetIds(schema, data), [])
  })

  it('should recurse into nested schema properties', () => {
    const schema = {
      _graphic: {
        properties: {
          src: { _backboneForms: 'Asset' }
        }
      }
    }
    const data = { _graphic: { src: 'img123' } }
    assert.deepEqual(extractAssetIds(schema, data), ['img123'])
  })

  it('should recurse into array items with properties', () => {
    const schema = {
      _items: {
        items: {
          properties: {
            src: { _backboneForms: 'Asset' }
          }
        }
      }
    }
    const data = { _items: [{ src: 'a1' }, { src: 'a2' }] }
    assert.deepEqual(extractAssetIds(schema, data), ['a1', 'a2'])
  })

  it('should deduplicate asset IDs', () => {
    const schema = {
      _items: {
        items: {
          properties: {
            src: { _backboneForms: 'Asset' }
          }
        }
      }
    }
    const data = { _items: [{ src: 'same' }, { src: 'same' }] }
    assert.deepEqual(extractAssetIds(schema, data), ['same'])
  })

  it('should accumulate with provided assets array', () => {
    const schema = { image: { _backboneForms: 'Asset' } }
    const data = { image: 'new1' }
    const existing = ['existing1']
    const result = extractAssetIds(schema, data, existing)
    assert.ok(result.includes('existing1'))
    assert.ok(result.includes('new1'))
  })

  it('should handle toString on non-string asset values', () => {
    const schema = { image: { _backboneForms: 'Asset' } }
    const data = { image: { toString: () => 'obj123' } }
    assert.deepEqual(extractAssetIds(schema, data), ['obj123'])
  })

  it('should handle multiple asset fields at the same level', () => {
    const schema = {
      image1: { _backboneForms: 'Asset' },
      image2: { _backboneForms: { type: 'Asset' } },
      title: { type: 'string' }
    }
    const data = { image1: 'a1', image2: 'a2', title: 'test' }
    assert.deepEqual(extractAssetIds(schema, data), ['a1', 'a2'])
  })
})
