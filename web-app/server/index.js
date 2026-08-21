const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { cleanChannel, fetchDMChannels } = require('./discord-service');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../client')));

app.post('/clean', async (req, res) => {
  const { token, userId, channelId, dmUserId } = req.body;

  if (!token || !userId) {
    return res.status(400).json({ error: 'Token and User ID are required.' });
  }

  if (!channelId && !dmUserId) {
    return res.status(400).json({ error: 'Either channelId or dmUserId must be provided.' });
  }

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');

  const send = (payload) => res.write(`${JSON.stringify(payload)}\n`);
  const progressCallback = (message) => send({ type: 'log', message });

  try {
    let totalDeleted;
    if (channelId) {
      console.log(`Cleaning guild channel: ${channelId}`);
      totalDeleted = await cleanChannel(token, userId, channelId, progressCallback);
    } else {
      console.log(`Cleaning DMs with user: ${dmUserId}`);
      const dmChannels = await fetchDMChannels(token);
      const targetDmChannel = dmChannels.find(
        (c) => c.recipients?.length === 1 && c.recipients[0].id === dmUserId
      );

      if (!targetDmChannel) {
        send({ type: 'error', message: 'DM channel not found for the specified user.' });
        return res.end();
      }
      totalDeleted = await cleanChannel(token, userId, targetDmChannel.id, progressCallback);
    }
    send({ type: 'done', totalDeleted });
  } catch (error) {
    console.error('Error during cleanup:', error);
    send({ type: 'error', message: error.message });
  } finally {
    res.end();
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${port}`);
});