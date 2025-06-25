/* eslint-disable no-underscore-dangle */
/* eslint-disable class-methods-use-this */
const httpContext = require('express-http-context');

class Account {
  /**
   * Get current user
   */
  user() {
    return httpContext.get('user');
  }

  /**
   * Get current user id
   */
  userId() {
    const user = httpContext.get('user');
    return user ? user.user_id : undefined;
  }

  userName() {
    const currentUser = httpContext.get('user');
    if (!currentUser) return '';
    console.log(currentUser.nickname || currentUser.given_name || currentUser.family_name);
    return currentUser.nickname || `${currentUser.given_name} ${currentUser.family_name}`;
  }

  clearance() {
    return httpContext.get('clearance') || [];
  }

  /**
   * Set user
   * @param {object} user: user object
   */
  _setUser(user) {
    httpContext.set('user', user);
  }

  /**
   * Set permissions/clearance
   * @param {object} clearance: clearance
   */
  _setPermission(clearance) {
    httpContext.set('clearance', clearance);
  }
}

module.exports = new Account();
