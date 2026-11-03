// Makes the current HTTP request's own origin (protocol + Host) available
// to any function down the call stack - including deep in services/utils
// that have no access to `req` - without threading it through every
// function signature. Used so links built for emails, the sitemap, social
// previews etc. can reflect whichever domain the visitor actually used
// (see services/appUrl.js) instead of always hardcoding one.
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function middleware(req, res, next) {
  const origin = `${req.protocol}://${req.get('host') || ''}`;
  storage.run({ origin }, next);
}

function currentOrigin() {
  return storage.getStore()?.origin;
}

module.exports = { middleware, currentOrigin };
