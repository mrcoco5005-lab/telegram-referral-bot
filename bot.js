require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const {
  addUserIfNotExists,
  getReferralCount,
  getLeaderboard
} = require('./db');

const token = process.env.BOT_TOKEN;
const botUsername = process.env.BOT_USERNAME;
const port = process.env.PORT || 3000;

if (!token || !botUsername) {
  console.error('Please set BOT_TOKEN and BOT_USERNAME in .env');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

const app = express();
app.get('/', (req, res) => {
  res.send('Telegram referral bot is running.');
});
app.listen(port, () => {
  console.log(`HTTP server listening on port ${port}`);
});

function getReferralLink(userId) {
  return `https://t.me/${botUsername}?start=${userId}`;
}

bot.onText(/\/start(?:\s+(.+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const user = msg.from;
  const arg = match[1];

  let referredBy = null;

  if (arg) {
    const parsed = parseInt(arg, 10);
    if (!isNaN(parsed) && parsed !== user.id) {
      referredBy = parsed;
    }
  }

  addUserIfNotExists(user, referredBy, (err, isNew) => {
    if (err) {
      console.error('Error adding user:', err);
      bot.sendMessage(chatId, 'An error occurred. Please try again later.');
      return;
    }

    let welcomeText = `Hey ${user.first_name || 'there'}! 👋\n\n`;
    if (isNew && referredBy) {
      welcomeText += `You joined using a referral link from user ID: ${referredBy}.\n\n`;
    }

    const myLink = getReferralLink(user.id);
    welcomeText += `Here is your personal referral link:\n${myLink}\n\n` +
      `Share this link with friends. When they start the bot using your link, they become your referrals.\n\n` +
      `Commands:\n` +
      `/myreferrals - See how many people you referred\n` +
      `/leaderboard - See top referrers`;

    bot.sendMessage(chatId, welcomeText);
  });
});

bot.onText(/\/myreferrals/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  getReferralCount(userId, (err, count) => {
    if (err) {
      console.error('Error getting referral count:', err);
      bot.sendMessage(chatId, 'Could not fetch your referrals right now.');
      return;
    }

    const text = `You have **${count}** referral${count === 1 ? '' : 's'}.`;
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  });
});

bot.onText(/\/leaderboard/, (msg) => {
  const chatId = msg.chat.id;

  getLeaderboard(10, (err, rows) => {
    if (err) {
      console.error('Error getting leaderboard:', err);
      bot.sendMessage(chatId, 'Could not fetch leaderboard right now.');
      return;
    }

    if (!rows || rows.length === 0) {
      bot.sendMessage(chatId, 'No referrals yet.');
      return;
    }

    let text = '🏆 *Top Referrers*\n\n';
    rows.forEach((row, index) => {
      const name =
        row.username
          ? `@${row.username}`
          : (row.first_name || `User ${row.user_id}`);
      text += `${index + 1}. ${name} — ${row.referrals} referral${row.referrals === 1 ? '' : 's'}\n`;
    });

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  });
});

bot.on('message', (msg) => {
  if (!msg.text.startsWith('/')) {
    bot.sendMessage(
      msg.chat.id,
      'Use /start to get your referral link, /myreferrals to see your count, or /leaderboard.'
    );
  }
});

console.log('Bot is running with long polling...');