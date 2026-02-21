/**
 * Searches a data object for asset-type schema properties and collects their IDs
 * @param {Object} schema The schema properties to traverse
 * @param {Object} data The data object to search for asset values
 * @param {Array<String>} assets Accumulator array for found asset IDs
 * @return {Array<String>} Unique array of asset IDs found in the data
 * @memberof courseassets
 */
export function extractAssetIds (schema, data, assets = []) {
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
