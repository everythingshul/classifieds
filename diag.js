const fs = require('fs');
const path = require('path');

console.log('--- diag start ---');
console.log('node', process.version, process.platform, process.arch);
console.log('DATA_DIR env =', process.env.DATA_DIR);

const Database = require('better-sqlite3');
console.log('better-sqlite3 required OK');

// Step 1: open + WAL on an ephemeral, definitely-local path (container filesystem, not the persistent disk).
try {
  const p1 = '/tmp/diag-local.db';
  if (fs.existsSync(p1)) fs.unlinkSync(p1);
  console.log('opening local tmp db at', p1, '...');
  const db1 = new Database(p1);
  console.log('local db opened');
  db1.pragma('journal_mode = WAL');
  console.log('local db WAL mode set OK');
  db1.exec('CREATE TABLE t (id INTEGER)');
  db1.prepare('INSERT INTO t (id) VALUES (1)').run();
  console.log('local db write OK');
  db1.close();
  console.log('--- LOCAL DISK + WAL: PASS ---');
} catch (e) {
  console.log('--- LOCAL DISK + WAL: FAILED (threw, did not crash) ---', e.message);
}

// Step 2: open + WAL on the actual configured persistent-disk path.
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
try {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const p2 = path.join(dataDir, 'diag-persistent.db');
  console.log('opening persistent-disk db at', p2, '...');
  const db2 = new Database(p2);
  console.log('persistent db opened');
  db2.pragma('journal_mode = WAL');
  console.log('persistent db WAL mode set OK');
  db2.exec('CREATE TABLE IF NOT EXISTS t (id INTEGER)');
  db2.prepare('INSERT INTO t (id) VALUES (1)').run();
  console.log('persistent db write OK');
  db2.close();
  console.log('--- PERSISTENT DISK + WAL: PASS ---');
} catch (e) {
  console.log('--- PERSISTENT DISK + WAL: FAILED (threw, did not crash) ---', e.message);
}

console.log('--- diag done ---');
