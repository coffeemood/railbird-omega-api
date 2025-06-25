/* eslint-disable max-classes-per-file */
/**
 * Custom data type for collection schema, using for doing validation in DataValidator
 */

/**
 * ID Data Type Class
 * - ID type is a positive integer which is greater than 0
 * - Validate by validateID method in DataValidator
 */
class ID {
  constructor() { this.name = 'ID'; }
}

/**
 * Int Data Type Class
 * - Int type is an integer
 * - Validate by validateInt method in DataValidator
 */
class Int {
  constructor() { this.name = 'Int'; }
}

/**
 * PositiveInt Data Type Class
 * - PositiveInt type is an integer which is greater than 0
 * - Validate by validatePositiveInt method in DataValidator
 */
class PositiveInt {
  constructor() { this.name = 'PositiveInt'; }
}

/**
 * PositiveIntZero Data Type Class
 * - PositiveIntZero type is a positive integer or 0
 * - Validate by validatePositiveInt method in DataValidator
 */
class PositiveIntZero {
  constructor() { this.name = 'PositiveIntZero'; }
}

/**
 * Timestamp Data Type Class
 * - Timestamp type is an integer which is greater than or equal to 0
 * - Validate by validateTimestamp method in DataValidator
 */
class Timestamp {
  constructor() { this.name = 'Timestamp'; }
}

module.exports = {
  ID,
  Int,
  PositiveInt,
  PositiveIntZero,
  Timestamp
};
