require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const {
  ensureUser,
  getInviteLinkByReferrer,
  saveInviteLink,
  recordReferral,
  getReferralCount,
  getLeaderboard,
  resetAllReferrals
} = require('./db');

const token = process.env.BOT_TOKEN;
const botUsername = process.env.BOT_USERNAME;
const groupId = Number(process.env.GROUP_ID);
const adminId = Number(process.env.ADMIN_ID);
const port = process.env.PORT || 3000;

// IMPORTANT: allow chat_member updates
const bot = new TelegramBot(token, {
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      allowed_updates: ['chat_member']
    }
  }
});

// Keep-alive server for Render
const app = express();
app.get('/', (req, res) => res.send('Bot running'));
app.listen(port, () => console.log("HTTP server running"));

// Create or get invite link for user
async function getOrCreateInviteLinkForUser(user) {
  return new Promise((resolve, reject) => {
    getInviteLinkByReferrer(user.id, async (err, existing) => {
      if (err) return reject(err);
      if (existing) return resolve(existing);

      try {
        const linkObj = await bot.createChatInviteLink(groupId, {
          name: `ref_${user.id}`,
          creates_join_request: false
        });

        saveInviteLink(linkObj.invite_link, user.id, (err2) => {
          if (err2) return reject(err2);
          resolve(linkObj.invite_link);
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

// /start in DM
bot.onText(/\/start/, async (msg) => {
  if (msg.chat.type !== 'private') return;

  const user = msg.from;

  ensureUser(user, async () => {
    try {
      const link = await getOrCreateInviteLinkForUser(user);

      getReferralCount(user.id, (err, count) => {
        let text = `Hello ${user.first_name}!\n\n`;
        text += `Your personal invite link:\n${link}\n\n`;
        text += `Referrals: ${count}\n\n`;
        text += `/myreferrals\n/leaderboard\n`;

        if (user.id === adminId) text += `/resetreferrals`;

        bot.sendMessage(msg.chat.id, text);
      });
    } catch (e) {
      bot.sendMessage(msg.chat.id, "Error creating invite link. Is bot admin?");
    }
  });
});

// /myreferrals
bot.onText(/\/myreferrals/, (msg) => {
  getReferralCount(msg.from.id, (err, count) => {
    bot.sendMessage(msg.chat.id, `You have ${count} referrals.`);
  });
});

// /leaderboard
bot.onText(/\/leaderboard/, (msg) => {
  getLeaderboard(10, (err, rows) => {
    if (!rows.length) return bot.sendMessage(msg.chat.id, "No referrals yet.");

    let text = "🏆 Leaderboard:\n\n";
    rows.forEach((r, i) => {
      const name = r.username ? `@${r.username}` : r.first_name;
      text += `${i + 1}. ${name} — ${r.total_referrals}\n`;
    });

    bot.sendMessage(msg.chat.id, text);
  });
});

// Admin reset
bot.onText(/\/resetreferrals/, (msg) => {
  if (msg.from.id !== adminId) return;

  resetAllReferrals(() => {
    bot.sendMessage(msg.chat.id, "All referrals reset.");
  });
});

// JOIN HANDLER — COUNTS REFERRALS + WELCOMES NEW MEMBER
bot.on('chat_member', async (update) => {
  console.log("JOIN EVENT:", JSON.stringify(update, null, 2));

  const chat = update.chat;
  const newMember = update.new_chat_member;
  const oldMember = update.old_chat_member;
  const inviteLink = update.invite_link;

  // Only track joins in your group
  if (!chat || chat.id !== groupId) return;

  // Must be a real join event
  const joined =
    (oldMember.status === 'left' || oldMember.status === 'kicked') &&
    (newMember.status === 'member');

  if (!joined) return;

  // Must have invite link metadata
  if (!inviteLink || !inviteLink.invite_link) {
    console.log("User joined WITHOUT invite link");
    return;
  }

  const usedLink = inviteLink.invite_link;
  const referredId = newMember.user.id;

  // Look up referrer from DB
  const sqlite3 = require('sqlite3').verbose();
  const path = require('path');
  const dbPath = path.join(__dirname, 'referrals.db');
  const tempDb = new sqlite3.Database(dbPath);

  tempDb.get(
    'SELECT referrer_id FROM invite_links WHERE invite_link = ?',
    [usedLink],
    (err, row) => {
      if (err) {
        console.error('DB error:', err);
        tempDb.close();
        return;
      }

      if (!row) {
        console.log("Invite link not found in DB");
        tempDb.close();
        return;
      }

      const referrerId = row.referrer_id;

      // SAVE REFERRAL (NO SELF-REFERRAL BLOCKING)
      recordReferral(referrerId, referredId, chat.id, (err2) => {
        tempDb.close();
        if (err2) {
          console.error('recordReferral error:', err2);
          return;
        }

        // Welcome message in group
        bot.sendMessage(
          chat.id,
          `🎉 Welcome <a href="tg://user?id=${referredId}">${newMember.user.first_name}</a>!\n` +
          `Invited by <a href="tg://user?id=${referrerId}">this awesome member</a> 🙌`,
          { parse_mode: 'HTML' }
        );
      });
    }
  );
});
