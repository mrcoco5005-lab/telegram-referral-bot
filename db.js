const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'referrals.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      total_referrals INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS invite_links (
      invite_link TEXT PRIMARY KEY,
      referrer_id INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER,
      referred_id INTEGER,
      chat_id INTEGER,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

function ensureUser(user, callback) {
  const { id, username, first_name } = user;

  db.get(
    'SELECT user_id FROM users WHERE user_id = ?',
    [id],
    (err, row) => {
      if (err) return callback(err);

      if (row) return callback(null, false);

      db.run(
        'INSERT INTO users (user_id, username, first_name, total_referrals) VALUES (?, ?, ?, 0)',
        [id, username || null, first_name || null],
        function (err2) {
          if (err2) return callback(err2);
          callback(null, true);
        }
      );
    }
  );
}

function getInviteLinkByReferrer(referrerId, callback) {
  db.get(
    'SELECT invite_link FROM invite_links WHERE referrer_id = ?',
    [referrerId],
    (err, row) => {
      if (err) return callback(err);
      callback(null, row ? row.invite_link : null);
    }
  );
}

function saveInviteLink(inviteLink, referrerId, callback) {
  db.run(
    'INSERT OR REPLACE INTO invite_links (invite_link, referrer_id) VALUES (?, ?)',
    [inviteLink, referrerId],
    function (err) {
      if (err) return callback(err);
      callback(null);
    }
  );
}

function recordReferral(referrerId, referredId, chatId, callback) {
  db.run(
    'INSERT INTO referrals (referrer_id, referred_id, chat_id) VALUES (?, ?, ?)',
    [referrerId, referredId, chatId],
    function (err) {
      if (err) return callback(err);

      db.run(
        'UPDATE users SET total_referrals = total_referrals + 1 WHERE user_id = ?',
        [referrerId],
        function (err2) {
          if (err2) return callback(err2);
          callback(null);
        }
      );
    }
  );
}

function getReferralCount(userId, callback) {
  db.get(
    'SELECT total_referrals AS count FROM users WHERE user_id = ?',
    [userId],
    (err, row) => {
      if (err) return callback(err);
      callback(null, row ? row.count : 0);
    }
  );
}

function getLeaderboard(limit, callback) {
  db.all(
    `
    SELECT user_id,
           COALESCE(username, '') AS username,
           COALESCE(first_name, '') AS first_name,
           total_referrals
    FROM users
    WHERE total_referrals > 0
    ORDER BY total_referrals DESC, user_id ASC
    LIMIT ?
    `,
    [limit],
    (err, rows) => {
      if (err) return callback(err);
      callback(null, rows);
    }
  );
}

function resetAllReferrals(callback) {
  db.serialize(() => {
    db.run('DELETE FROM referrals', [], function (err) {
      if (err) return callback(err);

      db.run('UPDATE users SET total_referrals = 0', [], function (err2) {
        if (err2) return callback(err2);

        callback(null);
      });
    });
  });
}

module.exports = {
  ensureUser,
  getInviteLinkByReferrer,
  saveInviteLink,
  recordReferral,
  getReferralCount,
  getLeaderboard,
  resetAllReferrals
};
