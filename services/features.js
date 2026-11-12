const runtimeConfig = require('./runtimeConfig');

// Whole sections of the site that can be switched off without deleting
// anything. Simchas are paused by default: the posts, their categories and
// their pricing all stay in the database, but nothing public shows, accepts
// or emails them until Settings -> Site Sections turns them back on.
function isOn(key) {
  const v = runtimeConfig.get(key);
  return v === true || v === 1 || v === '1' || v === 'true';
}

const simchasEnabled = () => isOn('simchas_enabled');

// SQL fragment for queries that span post types (bookmarks, sitemap, digest
// "view all"): keeps simchas out while the section is paused.
const hiddenTypesSql = (col = 'type') => (simchasEnabled() ? '1=1' : `${col} != 'simcha'`);

module.exports = { simchasEnabled, hiddenTypesSql };
