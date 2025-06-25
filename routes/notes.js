/* eslint-disable no-underscore-dangle */
const router = require('express').Router();
const Notes = require('../db/collections/Notes');
const validator = require('../utils/validator');
const notesSchemas = require('../schemas/notes');

router.get(
  '/v1/notes/:id',
  async (req, res) => {
    const ownerId = Account.userId();
    const _id = +req.params.id;
    const data = await Notes.findOneByQuery({
      $or: [
        { ownerId, _id },
        { 'shares.recipientId': ownerId, _id },
      ]
    }, {
      fields: {
        _id: 1,
        title: 1,
        content: 1,
        labels: 1,
        createdAt: 1,
        ownerId: 1,
      }
    });
    if (!data) return res.status(400).json({ message: 'Invalid Note' });
    return res.status(200).json({ status: 'success', data });
  }
);

router.post(
  '/v1/notes',
  async (req, res) => {
    const ownerId = Account.userId();
    const id = await Notes.insert({ ownerId });
    res.status(200).json({ status: 'success', id });
  }
);

router.patch(
  '/v1/notes/:id',
  validator(notesSchemas.notesPATCH, 'body'),
  async (req, res) => {
    const ownerId = Account.userId();
    const _id = +req.params.id;
    const update = Notes.toMongoSetObject(req.body);
    const { matchedCount } = await Notes.updateByQuery({
      $or: [
        { _id, ownerId },
        {
          _id,
          shares: {
            $elemMatch: {
              recipientId: ownerId,
              access: 'write',
            }
          }
        },
      ]
    }, update);
    if (!matchedCount) return res.status(400).json({ message: 'Invalid note' });
    return res.status(200).json({ status: 'success' });
  }
);

router.patch(
  '/v1/notes/:id/permissions',
  validator(notesSchemas.notesPermissionPATCH, 'body'),
  async (req, res) => {
    const ownerId = Account.userId();
    const _id = +req.params.id;
    const { recipientIds, access } = req.body;
    const updates = recipientIds.map(recipientId => ({ recipientId, access }));
    const { matchedCount } = await Notes.updateRawByQuery(
      { _id, ownerId },
      { $addToSet: { shares: { $each: updates } } }
    );
    if (!matchedCount) return res.status(400).json({ message: 'Invalid note' });
    // TODO: Notify each recipient of the share
    return res.status(200).json({ status: 'success' });
  }
);

router.delete(
  '/v1/notes/:id',
  async (req, res) => {
    const ownerId = Account.userId();
    const _id = +req.params.id;
    const { deletedCount } = await Notes.deleteByQuery({ _id, ownerId });
    if (!deletedCount) return res.status(400).json({ message: 'Invalid note' });
    return res.status(200).json({ status: 'success' });
  }
);
module.exports = router;
