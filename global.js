/* eslint-disable no-underscore-dangle */
const router = require('express').Router();
const Users = require('./db/collections/Users');
const { checkJwt } = require('./auth/checkJWT');

/* -- Authentication Filter -- */
router.all('*',
  checkJwt.unless(
    {
      path: [
        '/v1/public/subscribe',
        '/v1/session-posts',
        '/v1/hand-posts',
        '/v1/webhook',
        '/v1/comments-and-likes',
        // '/api/hands'
        
      ],
    },
  ),
  async (req, res, next) => {
    const { path } = req;
    if (path === '/v1/webhook') return next();

    const publicPaths = [
      '/v1/public/subscribe',
      '/v1/session-posts',
      '/v1/hand-posts',
      '/v1/comments-and-likes'
    ];
    if (publicPaths.includes(path)) return next();

    const { sub } = req.auth;
    console.log('sub', sub);
    const user = await Users.findOneByQuery({ user_id: sub });
    if (!user) return res.status(400).json({ message: 'Invalid user' });
    Account._setUser(user);
    return next();
  });

module.exports = router;
