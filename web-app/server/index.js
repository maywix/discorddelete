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

const MAX_TARGETS = 10;

app.post('/clean', async (req, res) => {
  const { token, userId, targets } = req.body;

  if (!token || !userId) {
    return res.status(400).json({ error: 'Token and User ID are required.' });
  }

  if (!Array.isArray(targets) || targets.length === 0) {
    return res.status(400).json({ error: 'Ajoute au moins une cible.' });
  }

  if (targets.length > MAX_TARGETS) {
    return res.status(400).json({ error: `${MAX_TARGETS} cibles maximum par lancement.` });
  }

  for (const t of targets) {
    if (!t || !t.id || !['guild', 'dm'].includes(t.type)) {
      return res.status(400).json({ error: 'Cible invalide.' });
    }
  }

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');

  const send = (payload) => {
    if (res.writableEnded) return;
    try {
      res.write(`${JSON.stringify(payload)}\n`);
    } catch {
      // client déjà déconnecté
    }
  };

  // Le client coupe la connexion (bouton Arrêter) pour stopper le nettoyage.
  // 'close' se déclenche aussi après une réponse terminée normalement, donc on
  // ne considère que c'est un arrêt que si on n'avait pas encore fini d'écrire.
  let stopped = false;
  res.on('close', () => {
    if (!res.writableEnded) stopped = true;
  });
  const shouldStop = () => stopped;

  // Les salons/MP sont nettoyés en parallèle, mais toutes les suppressions
  // passent par la même file d'attente globale (voir discord-service.js) :
  // le rythme des requêtes vers Discord reste identique à une seule cible.
  let dmChannelsCache = null;
  async function resolveDmChannelId(dmUserId) {
    if (!dmChannelsCache) dmChannelsCache = await fetchDMChannels(token);
    const found = dmChannelsCache.find(
      (c) => c.recipients?.length === 1 && c.recipients[0].id === dmUserId
    );
    return found ? found.id : null;
  }

  async function runTarget(target, index) {
    const label = target.type === 'dm' ? `MP ${target.id}` : `Salon ${target.id}`;
    const progressCallback = (message) => send({ type: 'log', targetId: index, label, message });

    try {
      let channelId = target.id;
      if (target.type === 'dm') {
        channelId = await resolveDmChannelId(target.id);
        if (!channelId) {
          send({ type: 'error', targetId: index, label, message: 'MP introuvable pour cet utilisateur.' });
          return 0;
        }
      }
      const totalDeleted = await cleanChannel(token, userId, channelId, progressCallback, shouldStop);
      send({ type: stopped ? 'target-stopped' : 'target-done', targetId: index, label, totalDeleted });
      return totalDeleted;
    } catch (error) {
      console.error(`Error cleaning target ${label}:`, error);
      send({ type: 'error', targetId: index, label, message: error.message });
      return 0;
    }
  }

  try {
    const results = await Promise.all(targets.map((t, i) => runTarget(t, i)));
    const totalDeleted = results.reduce((sum, n) => sum + n, 0);
    if (!stopped) send({ type: 'done', totalDeleted });
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