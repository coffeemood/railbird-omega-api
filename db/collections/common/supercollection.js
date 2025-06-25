/* eslint-disable no-param-reassign */
/* eslint-disable no-restricted-syntax */
/* eslint-disable max-len, guard-for-in, no-return-assign, consistent-return, array-callback-return */
const {
  isEmpty, has, assign, get
} = require('lodash');
const DataValidator = require('./datavalidator');

/**
 * Read object's leaf with path
 * @param {object} obj: object
 * @param {string} path: path string example: 'xx.yy'
 */
const leaf = (obj, path) => (obj ? (path.split('.').reduce((value, field) => (value ? value[field] : undefined), obj)) : undefined);

class SuperCollection {
  /**
   * Constructor
   * @param {Collection} collection: collection object
   * @param {array} collectionSchema: collection schema
   * @param {array} collectionRelationMaps: collection relation maps, it's array of relation map objects using for updating _id and name in related collections
   * Relation map object structure:
   * - @param {string} collection: related collection name, like 'teams'
   * - @param {string} field: field for updating field's _id and name, like 'orgtree.club'
   * - @param {array} arrayField: array field for updating element field's _id and name in array contains [arrayFieldName, elementFieldName]
   */
  constructor(collection, collectionSchema, collectionRelationMaps, collectionPublicFields) {
    this.db = collection.db;
    this.collection = collection;
    this.collectionSchema = collectionSchema;
    this.collectionRelationMaps = collectionRelationMaps;
    this.collectionPublicFields = collectionPublicFields;
  }

  /* -------------------- Collection Helper Methods -------------------- */
  /**
   * Validate and convert insert to mongo insert object using collection's schema or custom schema
   * @param {object} insert: insert object
   * @param {object} [customSchema]: optional custom schema, using default collectionSchema if not pass
   */
  toMongoInsertObject(insert, customSchema) {
    const collectionSchema = customSchema || this.collectionSchema;
    if (!collectionSchema) {
      throw new Error(`collectionSchema required before using this function. Set up schema fields with super(collection, collectionSchema) in ${this.collection.name} collection class constructor or pass customSchema`);
    }
    const insertObj = {};
    for (const field in collectionSchema) {
      let value = leaf(insert, field);
      if (value !== undefined && value !== null) {
        const parts = field.split('.');
        const fieldDataType = collectionSchema[field];
        parts.reduce((obj, prop, idx, arr) => {
          if (arr.length === 1 || idx === arr.length - 1) {
            value = DataValidator[`validate${fieldDataType.name}`](field, value, customSchema ? 'custom' : this.collection.name);
            obj[prop] = value;
          } else return obj[prop] ? obj[prop] : obj[prop] = {};
        }, insertObj);
      }
    }
    return insertObj;
  }

  /**
   * Validate and convert update to mongo set object using collection's schema or custom schema
   * @param {object} update: update object
   * @param {object} [customSchema]: optional custom schema, using default collectionSchema if not pass
   */
  toMongoSetObject(update, customSchema) {
    const collectionSchema = customSchema || this.collectionSchema;
    if (!collectionSchema) {
      throw new Error(`collectionSchema required before using this function. Set up schema fields with super(collection, collectionSchema) in ${this.collection.name} collection class constructor or pass customSchema`);
    }
    const updateSetObj = {};
    for (const field in collectionSchema) {
      let value = leaf(update, field);
      if (value !== undefined && value !== null) {
        const fieldDataType = collectionSchema[field];
        value = DataValidator[`validate${fieldDataType.name}`](field, value, customSchema ? 'custom' : this.collection.name);
        updateSetObj[field] = value;
      }
    }
    return updateSetObj;
  }

  /**
   * Validate and convert update to mongo set and unset object using collection's schema or custom schema
   * Unset the field only if pass field value as null
   * @param {object} update: update object
   * @param {array} unsetFields: field array use for unsetting fields like 'homeTeam', 'homeTeam._id' etc. To unsert field pass its value as null (note: undefined is not working, only null)
   * @param {object} [customSchema]: optional custom schema, using default collectionSchema if not pass
   */
  toMongoSetAndUnsetObject(update, unsetFields = [], customSchema) {
    const updateObj = {};
    updateObj.$set = this.toMongoSetObject(update, customSchema);

    const updateUnset = {};
    for (const field of unsetFields) {
      if (leaf(update, field) === null) updateUnset[field] = '';
    }
    if (!isEmpty(updateUnset)) updateObj.$unset = updateUnset;

    return updateObj;
  }

  /* -------------------- Mongo Collection General Methods -------------------- */

  /**
   * generate default query
   */
  get defaultQuery() {
    return {};
  }

  /**
   * Raw collection
   */
  rawCollection() {
    return this.collection.raw();
  }

  /**
   * Insert document
   * @param {object} doc: insert document
   * @param {object} [options]: optional options
   */
  async insert(doc, options) {
    const result = await this.collection.insertOne(doc, options);
    return result && result.insertedId ? result.insertedId : undefined;
  }

  /**
   * Insert many document
   * @param {object} docs: insert documents
   * @param {object} [options]: optional options
   */
  async insertMany(docs, options) {
    const result = await this.collection.insertMany(docs, options);
    return result && result.insertedIds ? Object.keys(result.insertedIds).map(i => result.insertedIds[i]) : undefined;
  }

  /**
   * Find document by id
   * @param {int} id: document id
   * @param {object} [options]: optional options
   */
  async findById(id, options) {
    return this.collection.findOne(assign(this.defaultQuery, { _id: id }), options);
  }

  /**
   * Find document by query
   * @param {object} query: query to find
   * @param {object} [options]: optional options
   */
  async findOneByQuery(query, options) {
    return this.collection.findOne(assign(this.defaultQuery, query), options);
  }

  /**
   * Find documents by query
   * @param {object} query: query to find
   * @param {object} [options]: optional options
   */
  async findByQuery(query, options) {
    return (await this.collection.find(assign(this.defaultQuery, query), options)).toArray();
  }

  /**
   * Update document by id
   * @param {int} id: document id
   * @param {object} updateSet: update $set object
   * @param {object} [options]: optional options
   */
  async updateById(id, updateSet, options) {
    return this.collection.updateOne(assign(this.defaultQuery, { _id: id }), { $set: updateSet }, options);
  }

  /**
   * Update documents by query
   * @param {object} query: query to update
   * @param {object} updateSet: update $set object
   * @param {object} [options]: optional options
   */
  async updateByQuery(query, updateSet, options) {
    return this.collection.updateMany(assign(this.defaultQuery, query), { $set: updateSet }, options);
  }

  /**
   * Raw update documents by query
   * @param {int} id: document id
   * @param {object} update: update object
   * @param {object} [options]: optional options
   */
  async updateRawById(id, update, options) {
    return this.collection.updateOne(assign(this.defaultQuery, { _id: id }), update, options);
  }

  /**
   * Raw update documents by query
   * @param {object} query: query to update
   * @param {object} update: update object
   * @param {object} [options]: optional options
   */
  async updateRawByQuery(query, update, options) {
    return this.collection.updateMany(assign(this.defaultQuery, query), update, options);
  }

  /**
   * Delete document by id
   * @param {int} id: document id
   */
  async deleteById(id) {
    return this.collection.deleteOne(assign(this.defaultQuery, { _id: id }));
  }

  /**
   * Delete documents by query
   * @param {object} query: query to delete
   */
  async deleteByQuery(query) {
    return this.collection.deleteMany(assign(this.defaultQuery, query));
  }

  /**
   * Aggregate documents by pipeline
   * @param {array} pipeline: aggregate pipeline
   * @param {object} [options]: optional options
   */
  async aggregate(pipeline, options) {
    return (await this.collection.aggregate(pipeline, options)).toArray();
  }

  /**
   * Count documents by query
   * @param {object} query: query to delete
   */
  async countByQuery(query) {
    return this.collection.raw().countDocuments(assign(this.defaultQuery, query));
  }

  /**
   * Aggregate documents by query
   * - Like findByQuery but can use advance query for options
   * @param {object} query: query to find
   * @param {object} [options]: optional options (project, skip, limit, sort)
   */
  async aggregateByQuery(query, options) {
    const pipeline = [ { $match: assign(this.defaultQuery, query) } ];
    if (options.skip) pipeline.push({ $skip: options.skip });
    if (options.limit) pipeline.push({ $limit: options.limit });
    if (options.sort) pipeline.push({ $sort: options.sort });
    if (options.projection) pipeline.push({ $project: options.projection });
    return (await this.collection.aggregate(pipeline)).toArray();
  }

  /**
   * Aggregate documents by pipeline, returns aggregate cursor
   * @param {array} pipeline: aggregate pipeline
   * @param {object} [options]: optional options
   */
  async aggregateRaw(pipeline, options) {
    return this.collection.aggregate(pipeline, options);
  }

  /* -------------------- Mongo Collection Atomic Methods -------------------- */

  /**
   * Find one and update
   * @param {object} query: query to find
   * @param {object} update: update object
   * @param {object} options: optional options
   */
  async findOneAndUpdate(query, update, options) {
    const result = await this.collection.findOneAndUpdate(assign(this.defaultQuery, query), update, options);
    return result && result.value ? result.value : undefined;
  }

  /**
   * Find one and delete
   * @param {object} query: query to find
   * @param {object} options: optional options
   */
  async findOneAndDelete(query, options) {
    return this.collection.findOneAndDelete(assign(this.defaultQuery, query), options);
  }

  /* -------------------- Mongo Collection Advance Methods -------------------- */
  /**
   * Update document by id and using relation maps, relations maps also update name for map fields in other relation collection which has same id
   * @param {int} id: document id
   * @param {object} updateSet: update $set object
   * @param {object} [options]: optional options
   */
  async updateByIdWithRelationMaps(id, updateSet, options) {
    if (!Array.isArray(this.collectionRelationMaps)) throw new Error(`collectionRelationMaps array is required before using this function. Set up schema fields with super(collection, collectionSchema, collectionRelationMaps) in ${this.collection.name} collection class constructor`);

    const query = assign(this.defaultQuery, { _id: id });
    // Update
    const updateResult = await this.collection.updateOne(query, { $set: updateSet }, options);

    // Update name in related collections
    if (updateSet.name !== undefined && updateSet.name !== null && this.collectionRelationMaps.length > 0) {
      const entity = this.collection.findOne(query);
      if (updateSet.name !== entity.name) {
        const results = [];
        for (const map of this.collectionRelationMaps) {
          if (map.collection) {
            if (Array.isArray(map.arrayField)) {
              if (map.arrayField.length !== 2) throw new Error(`arrayField must contain two elements arrayFieldName and elementFieldName in ${this.collection.name} collection relation maps, like: arrayField: [arrayFieldName, elementFieldName]`);
              results.push(this.db.collection(map.collection).updateMany({ [map.arrayField[0]]: { $exists: true } }, { $set: { [`${map.arrayField[0]}.$[elem].${map.arrayField[1] ? `${map.arrayField[1]}.` : ''}name`]: updateSet.name } }, { arrayFilters: [ { [`elem.${map.arrayField[1] ? `${map.arrayField[1]}.` : ''}_id`]: id } ] }));
            } else if (map.field) {
              results.push(this.db.collection(map.collection).updateMany({ [`${map.field}._id`]: id }, { $set: { [`${map.field}.name`]: updateSet.name } }));
            } else throw new Error(`valid field or arrayField is required for relation map object in ${this.collection.name} collection relation maps`);
          } else throw new Error(`collection is required for relation map object in ${this.collection.name} collection relation maps`);
        }
        await Promise.all(results);
      }
    }

    return updateResult;
  }

  /**
   * Raw update document by id and using relation maps, relations maps also update name for map fields in other relation collection which has same id
   * @param {int} id: document id
   * @param {object} update: update object
   * @param {object} [options]: optional options
   */
  async updateRawByIdWithRelationMaps(id, update, options) {
    if (!Array.isArray(this.collectionRelationMaps)) throw new Error(`collectionRelationMaps array is required before using this function. Set up schema fields with super(collection, collectionSchema, collectionRelationMaps) in ${this.collection.name} collection class constructor`);

    const query = assign(this.defaultQuery, { _id: id });
    // Update
    const updateResult = await this.collection.updateOne(query, update, options);

    // Update name in related collections
    const updateSet = update.$set;
    if (updateSet && updateSet.name !== undefined && updateSet.name !== null && this.collectionRelationMaps.length > 0) {
      const entity = this.collection.findOne(query);
      if (updateSet.name !== entity.name) {
        const results = [];
        for (const map of this.collectionRelationMaps) {
          if (map.collection) {
            if (Array.isArray(map.arrayField)) {
              if (map.arrayField.length !== 2) throw new Error(`arrayField must contain two elements arrayFieldName and elementFieldName in ${this.collection.name} collection relation maps, like: arrayField: [arrayFieldName, elementFieldName]`);
              results.push(this.db.collection(map.collection).updateMany({ [map.arrayField[0]]: { $exists: true } }, { $set: { [`${map.arrayField[0]}.$[elem].${map.arrayField[1] ? `${map.arrayField[1]}.` : ''}name`]: updateSet.name } }, { arrayFilters: [ { [`elem.${map.arrayField[1] ? `${map.arrayField[1]}.` : ''}_id`]: id } ] }));
            } else if (map.field) {
              results.push(this.db.collection(map.collection).updateMany({ [`${map.field}._id`]: id }, { $set: { [`${map.field}.name`]: updateSet.name } }));
            } else throw new Error(`valid field or arrayField is required for relation map object in ${this.collection.name} collection relation maps`);
          } else throw new Error(`collection is required for relation map object in ${this.collection.name} collection relation maps`);
        }
        await Promise.all(results);
      }
    }

    return updateResult;
  }

  /**
   * Find by id and return result using collections' public fields as projection
   * @param {int} id: document id
   * @param {object} [options]: optional options
   */
  async findByIdWithPublicFields(id, options = {}) {
    if (!this.collectionPublicFields) throw new Error(`collectionPublicFields object is required before using this function. Set up schema fields with super(collection, collectionSchema, collectionRelationMaps, collectionPublicFields) in ${this.collection.name} collection class constructor`);
    options.projection = this.collectionPublicFields;
    return this.findById(id, options);
  }

  /**
   * Find by query and return result using collections' public fields as projection
   * @param {object} query: query to find
   * @param {object} [options]: optional options
   */
  async findByQueryWithPublicFields(id, options = {}) {
    if (!this.collectionPublicFields) throw new Error(`collectionPublicFields object is required before using this function. Set up schema fields with super(collection, collectionSchema, collectionRelationMaps, collectionPublicFields) in ${this.collection.name} collection class constructor`);
    options.projection = this.collectionPublicFields;
    return this.findByQuery(id, options);
  }

  /**
   * Find documents by query with pagination
   * @param {object} query: query to find
   * @param {number} pageNumber: page number
   * @param {number} pageSize: page size
   * @param {object} [options]: optional options (without skip and limit)
   */
  async findByQueryWithPagination(query, pageNumber, pageSize, options = {}) {
    options.skip = (pageNumber - 1) * pageSize;
    options.limit = pageSize;

    assign(query, this.defaultQuery);

    const total = await this.collection.countDocuments(query);
    const pageData = await (await this.collection.find(query, options)).toArray();
    return {
      pageNumber, pageSize, total, pageData
    };
  }

  async aggregateWithPagination(pipeline, pageNumber, pageSize, options = {}, withOwner = false) {
    if (!Number.isNaN((pageNumber - 1) * pageSize)) {
      options.skip = (pageNumber - 1) * pageSize;
    }
    options.limit = pageSize;

    const aggregation = withOwner
      ? [
        ...pipeline,
        {
          $lookup: {
            from: 'users',
            let: { userId: '$ownerId' },
            pipeline: [
              { $match: { $expr: { $eq: [ '$user_id', '$$userId' ] } } },
              {
                $project: {
                  family_name: 1, given_name: 1, nickname: 1, picture: 1
                }
              },
            ],
            as: 'user'
          }
        },
        {
          $unwind: { path: '$user' }
        }
      ] : pipeline;

    const skipAndLimit = [];
    if (options.skip) skipAndLimit.push({ $skip: options.skip });
    if (options.limit) skipAndLimit.push({ $limit: options.limit });
    const aggregationPipeline = [
      ...aggregation,
      {
        $facet: {
          metadata: [ { $count: 'count' } ],
          data: skipAndLimit,
        }
      }
    ];

    try {
      const resultCursor = await this.collection.aggregate(aggregationPipeline, { allowDiskUse: true });
      const [ result ] = await resultCursor.toArray();
      const total = result ? get(result, 'metadata[0].count', 0) : 0;

      return {
        pageNumber,
        pageSize,
        total,
        pageData: result ? result.data : [],
      };
    } catch (error) {
      console.log(error);
      Logger.error('Error during aggregation stage');
    }
  }
}

module.exports = SuperCollection;
