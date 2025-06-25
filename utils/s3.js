/* eslint-disable class-methods-use-this */
// const Archiver = require('archiver');
// const { Stream } = require('stream');

const fs = require('fs');
const AWS = require('aws-sdk');
// const { generateHash } = require('random-hash');
// const { invoke } = require('lodash');
// const { log } = require('console');

const s3 = new AWS.S3({
  signatureVersion: 'v4',
  region: 'ap-southeast-2',
});

class S3Helper {
  /**
   * Remove a document from a bucket - returns a promise
   * @param {string} bucket: bucket name
   * @param {string} id: name of document
   */
  removeDocument(Bucket, Key) {
    return new Promise((resolve, reject) => {
      const params = { Bucket, Key };
      s3.deleteObject(params, (err) => {
        if (err) reject();
        else resolve();
      });
    });
  }

  /**
   * Retrieve a PUT presigned URL from a bucket
   * @param {string} Bucket: bucket name
   * @param {string} Key: name of document
   * @param {object} options: support more option
   */
  async getSignedUrlPUT(Bucket, Key, Expires = 900, options = {}) {
    return s3.getSignedUrlPromise('putObject', {
      Bucket,
      Key,
      Expires,
      ContentType: '*/*',
      ...options
    });
  }

  /**
   * Get Object from S3
   * @param {*} Bucket
   * @param {*} Key
   */
  async getObject(Bucket, Key) {
    return s3.getObject({
      Bucket,
      Key,
    }).promise();
  }

  /**
   * Retrieve a GET presigned URL from a bucket
   * @param {string} Bucket: bucket name
   * @param {string} Key: name of document
   */
  async getSignedUrlGET(Bucket, Key, Expires = 10) {
    return new Promise((resolve, reject) => {
      s3.getSignedUrl('getObject', {
        Bucket,
        Key,
        Expires
      }, (err, url) => {
        if (err) reject(err);
        else resolve(url);
      });
    });
  }

  /**
   * Uploading a file to a pre-existing bucket
   * @param {string} Bucket: bucket name
   * @param {string} Key: name of document
   * @param {file} file: file object
   * @param {string} ContentType: content type / defaults to image if not specified
   * @param {bool} isPublic: whether or not object should be publicly accessible
   */
  uploadFileToBucket(Bucket, Key, file, ContentType = 'image/*', isPublic = false) {
    return new Promise((resolve, reject) => {
      const params = {
        Bucket,
        Key,
        ContentType,
        Body: fs.createReadStream(file.path)
      };
      if (isPublic) params.ACL = 'public-read';
      s3.putObject(params, (error) => {
        if (!error) resolve();
        else {
          Logger.error(error);
          reject();
        }
        fs.unlinkSync(file.path);
      });
    });
  }

  /**
   * Uploading a file from path to s3
   * @param {string} Bucket: bucket name
   * @param {string} Key: name of document
   * @param {file} Path: file path
   * @param {string} ContentType: content type / defaults to image if not specified
   * @param {bool} isPublic: whether or not object should be publicly accessible
   */
  uploadFromPath(Bucket, Key, Path, ContentType = 'image/*', isPublic = true) {
    return new Promise((resolve, reject) => {
      const params = {
        Bucket,
        Key,
        ContentType,
        Body: fs.createReadStream(Path)
      };
      if (isPublic) params.ACL = 'public-read';
      s3.putObject(params, (error) => {
        if (!error) resolve();
        else {
          Logger.error(error);
          reject();
        }
        fs.unlinkSync(Path);
      });
    });
  }

  uploadXmlFileToBucket(Bucket, Key, file, ContentType = 'xml/*', isPublic = false) {
    return new Promise((resolve, reject) => {
      const params = {
        Bucket,
        Key,
        ContentType,
        Body: fs.createReadStream(file)
      };
      if (isPublic) params.ACL = 'public-read';
      s3.putObject(params, (error) => {
        if (!error) resolve();
        else {
          Logger.error(error);
          reject();
        }
        fs.unlinkSync(file);
      });
    });
  }

  /**
   * Rename a file from a pre-existing bucket
   * @param {string} Bucket: bucket name
   * @param {string} Key: Key to be renamed
   * @param {string} NewKey: New Key Name
   */
  renameFile(Bucket, Key, NewKey) {
    return new Promise((resolve, reject) => {
      s3.copyObject({
        Bucket,
        CopySource: `${Bucket}/${Key}`,
        Key: NewKey,
      })
        .promise()
        .then(() => s3.deleteObject({
          Bucket,
          Key,
        })
          .promise()
          .then(() => {
            resolve();
          }))
        .catch((e) => {
          Logger.error(e);
          reject(e);
        });
    });
  }

  /**
   * Bulk download from a pre-existing bucket
   * @param {string} Bucket: bucket name
   * @param {array} Kesy: arr[] keys
   */
  async downloadMany(Keys) {
    const params = {
      FunctionName: 'lambda-dev-autozipper',
      Payload: JSON.stringify({
        Keys
      })
    };
    const result = await (new AWS.Lambda().invoke(params).promise());
    return JSON.parse(result.Payload);
  }
}

module.exports = new S3Helper();
