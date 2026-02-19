const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'referrals.db');
const db = new sqlite3.Database(dbPath);

// Initialize tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      referred_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER,
      referred_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

function addUserIfNotExists(user, referredBy, callback) {
  const { id, username, first_name } = user;

  db.get(
    'SELECT user_id FROM users WHERE user_id = ?',
    [id],
    (err, row) => {
      if (err) return callback(err);

      if (row) {
        return callback(null, false);
      }

      db.run(
        'INSERT INTO users (user_id, username, first_name, referred_by) VALUES (?, ?, ?, ?)',
        [id, username || null, first_name || null, referredBy || null],
        function (err2) {
          if (err2) return callback(err2);

          if (referredBy) {
            db.run(
              'INSERT INTO referrals (referrer_id, referred_id) VALUES (?, ?)',
              [referredBy, id],
              function (err3) {
                if (err3) return callback(err3);
                callback(null, true);
              }
            );
          } else {
            callback(null, true);
          }
        }
      );
    }
  );
}

function getReferralCount(userId, callback) {
  db.get(
    'SELECT COUNT(*) AS count FROM referrals WHERE referrer_id = ?',
    [userId],
    (err, row) => {
      if (err) return callback(err);
      callback(null, row.count);
    }
  );
}

function getLeaderboard(limit, callback) {
  db.all(
    `
    SELECT u.user_id,
           COALESCE(u.username, '') AS username,
           COALESCE(u.first_name, '') AS first_name,
           COUNT(r.id) AS referrals
    FROM users u
    LEFT JOIN referrals r ON u.user_id = r.referrer_id
    GROUP BY u.user_id
    ORDER BY referrals DESC, u.user_id ASC
    LIMIT ?
    `,
    [limit],
    (err, rows) => {
      if (err) return callback(err);
      callback(null, rows);
    }
  );
}

module.exports = {
  addUserIfNotExists,
  getReferralCount,
  getLeaderboard
};