const Pusher = require('pusher');

module.exports = new Pusher({
  appId: '1175088',
  key: 'ea29e943c503bfcafd7a',
  secret: 'c137162fb71e8243dfd2',
  cluster: 'ap4',
  useTLS: true
});
