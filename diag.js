console.log('--- diag start ---');
console.log('node', process.version, process.platform, process.arch);

console.log('requiring better-sqlite3...');
require('better-sqlite3');
console.log('better-sqlite3 OK');

console.log('requiring sharp...');
require('sharp');
console.log('sharp OK');

console.log('--- diag done, both native modules loaded fine ---');
