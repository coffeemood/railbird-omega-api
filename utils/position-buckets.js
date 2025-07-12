// Position bucket mappings
const POSITION_BUCKETS = {
  'EARLY': ['utg', 'utg+1', 'utg+2', 'utg+3'],
  'MP': ['mp', 'mp+1', 'mp+2', 'lj'],
  'LP': ['hj', 'co', 'bu', 'btn'],
  'BLINDS': ['sb', 'bb']
};

// Reverse mapping for quick lookup
const POSITION_TO_BUCKET = {};
Object.entries(POSITION_BUCKETS).forEach(([bucket, positions]) => {
  positions.forEach(pos => {
    POSITION_TO_BUCKET[pos] = bucket;
  });
});

/**
 * Get the bucket for a given position
 * @param {string} position - Position name (e.g., 'btn', 'bb', 'utg')
 * @returns {string|null} - Bucket name or null if not found
 */
function getPositionBucket(position) {
  return POSITION_TO_BUCKET[position.toLowerCase()] || null;
}

/**
 * Check if positions belong to specified buckets
 * @param {Object} positions - Object with 'ip' and 'oop' properties
 * @param {Object} bucketFilter - Object with 'ip' and 'oop' bucket names
 * @returns {boolean} - True if positions match the bucket filter
 */
function matchesPositionBuckets(positions, bucketFilter) {
  if (!positions || !bucketFilter) return true;
  
  // Check IP position bucket
  if (bucketFilter.ip) {
    const ipBucket = getPositionBucket(positions.ip);
    if (ipBucket !== bucketFilter.ip) return false;
  }
  
  // Check OOP position bucket
  if (bucketFilter.oop) {
    const oopBucket = getPositionBucket(positions.oop);
    if (oopBucket !== bucketFilter.oop) return false;
  }
  
  return true;
}

/**
 * Get all positions in a bucket
 * @param {string} bucketName - Name of the bucket (EARLY, MP, LP, BLINDS)
 * @returns {string[]} - Array of position names
 */
function getPositionsInBucket(bucketName) {
  return POSITION_BUCKETS[bucketName] || [];
}

/**
 * Build Qdrant filter conditions for position buckets
 * @param {Object} bucketFilter - Object with 'ip' and 'oop' bucket names
 * @returns {Object[]} - Array of Qdrant filter conditions
 */
function buildPositionBucketFilters(bucketFilter) {
  const filters = [];
  
  if (bucketFilter.ip) {
    filters.push({
      key: 'position_bucket_ip',
      match: {
        value: bucketFilter.ip
      }
    });
  }
  
  if (bucketFilter.oop) {
    filters.push({
      key: 'position_bucket_oop',
      match: {
        value: bucketFilter.oop
      }
    });
  }
  
  return filters;
}

module.exports = {
  getPositionBucket,
  matchesPositionBuckets,
  getPositionsInBucket,
  buildPositionBucketFilters,
  POSITION_BUCKETS,
  POSITION_TO_BUCKET
};