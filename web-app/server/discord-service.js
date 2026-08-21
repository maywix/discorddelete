const API = "https://discord.com/api/v10";
const DELAY_MS = 900; // délai entre suppressions pour éviter le rate-limit

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// File d'attente globale des suppressions : même si plusieurs salons/MP sont
// nettoyés en parallèle, une seule suppression part toutes les DELAY_MS pour
// tout le monde. Le rate-limit reste le même qu'avec une seule cible à la fois.
let deleteQueue = Promise.resolve();
function withGlobalRateLimit(task) {
  const run = deleteQueue.then(async () => {
    const result = await task();
    await sleep(DELAY_MS);
    return result;
  });
  deleteQueue = run.catch(() => {}); // ne bloque pas la file si une suppression échoue
  return run;
}

async function apiFetch(token, path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      authorization: token,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (res.status === 429) {
    const data = await res.json().catch(() => ({}));
    const retryAfter = (data.retry_after ?? 1) * 1000;
    console.log(`Rate limited, attente ${retryAfter}ms...`);
    await sleep(retryAfter);
    return apiFetch(token, path, options);
  }

  return res;
}

async function fetchMessages(token, channelId, before) {
  const query = new URLSearchParams({ limit: "100" });
  if (before) query.set("before", before);
  const res = await apiFetch(token, `/channels/${channelId}/messages?${query}`);
  if (!res.ok) {
    console.error(`Erreur fetch messages (${channelId}):`, res.status, await res.text());
    return [];
  }
  return res.json();
}

async function deleteMessage(token, channelId, messageId) {
  return withGlobalRateLimit(async () => {
    const res = await apiFetch(token, `/channels/${channelId}/messages/${messageId}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      console.error(`Erreur suppression ${messageId}:`, res.status, await res.text());
    }
  });
}

async function cleanChannel(token, userId, channelId, progressCallback) {
  console.log(`\n--- Nettoyage du salon ${channelId} ---`);
  let before = undefined;
  let totalDeleted = 0;

  while (true) {
    const messages = await fetchMessages(token, channelId, before);
    if (!messages.length) break;

    before = messages[messages.length - 1].id;

    const myMessages = messages.filter((m) => m.author?.id === userId);
    for (const msg of myMessages) {
      await deleteMessage(token, channelId, msg.id);
      totalDeleted++;
      const messageContent = msg.content ? msg.content.slice(0, 40) : '<empty content>';
      const logMessage = `Supprimé (${totalDeleted}) : "${messageContent}"`;
      console.log(logMessage);
      if (progressCallback) progressCallback(logMessage);
    }
  }

  console.log(`Terminé pour ${channelId} : ${totalDeleted} message(s) supprimé(s).`);
  return totalDeleted;
}

async function fetchDMChannels(token) {
  const res = await apiFetch(token, `/users/@me/channels`);
  if (!res.ok) {
    console.error(`Erreur fetch DMs:`, res.status, await res.text());
    return [];
  }
  return res.json();
}

module.exports = {
  cleanChannel,
  fetchDMChannels,
  deleteMessage, // Though not directly used by frontend, good to expose
  fetchMessages, // same
};