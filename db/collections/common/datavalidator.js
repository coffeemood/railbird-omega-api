/* eslint-disable max-len */
const _ = require('lodash');

/**
 * Collection Data Validator
 * - for validating data type of value using collection schema
 */
class DataValidator {
  /* ---- JS Data Types ---- */
  static validateNumber(field, value, collection) {
    if (!_.isFinite(value)) throw new Error(`Invalid value '${value}' found for field '${field}' in ${collection} collection schema, required type: Number`);
    return value;
  }

  static validateString(field, value, collection) {
    if (!_.isString(value)) throw new Error(`Invalid value '${value}' found for field '${field}' in ${collection} collection schema, required type: String`);
    return value;
  }

  static validateBoolean(field, value, collection) {
    if (!_.isBoolean(value)) throw new Error(`Invalid value '${value}' found for field '${field}' in ${collection} collection schema, required type: Boolean`);
    return value;
  }

  static validateObject(field, value, collection) {
    if (!_.isPlainObject(value)) throw new Error(`Invalid value '${value}' found for field '${field}' in ${collection} collection schema, required type: Object`);
    return value;
  }

  static validateArray(field, value, collection) {
    if (!_.isArray(value)) throw new Error(`Invalid value '${value}' found for field '${field}' in ${collection} collection schema, required type: Array`);
    return value;
  }

  /* ---- Custom Validation Types ---- */
  static validateID(field, value, collection) {
    if (!_.isInteger(value) || value <= 0) throw new Error(`Invalid value '${value}' found for field '${field}' in ${collection} collection schema, required type: ID, ID value must be a positive integer which is greater than 0`);
    return value;
  }

  static validateInt(field, value, collection) {
    if (!_.isInteger(value)) throw new Error(`Invalid value '${value}' found for field '${field}' in ${collection} collection schema, required type: Integer`);
    return value;
  }

  static validatePositiveInt(field, value, collection) {
    if (!_.isInteger(value) || value <= 0) throw new Error(`Invalid value '${value}' found for field '${field}' in ${collection} collection schema, required type: PositiveInt, PositiveInt value must be a positive integer`);
    return value;
  }

  static validatePositiveIntZero(field, value, collection) {
    if (!_.isInteger(value) || value < 0) throw new Error(`Invalid value '${value}' found for field '${field}' in ${collection} collection schema, required type: PositiveIntZero, PositiveIntZero value must be a positive integer or 0`);
    return value;
  }

  static validateTimestamp(field, value, collection) {
    if (!_.isInteger(value) || value < 0) throw new Error(`Invalid value '${value}' found for field '${field}' in ${collection} collection schema, required type: Timestamp, Timestamp value must be integer which is greater than or equal to 0 from moment().valueOf()`);
    return value;
  }
}

module.exports = DataValidator;
