/**
 * ⚠️ ATTENTION ⚠️
 * Ce script utilise ton token de compte UTILISATEUR pour automatiser des actions.
 * C'est une violation des conditions d'utilisation de Discord (self-bot), qui peut
 * entraîner un bannissement définitif de ton compte. Utilise-le à tes risques et
 * périls, idéalement sur un compte secondaire, et pas trop agressivement (le script
 * inclut des délais pour respecter le rate-limit, ne les réduis pas).
 *
 * Prérequis : Node.js 18+ (fetch natif inclus)
 * Usage :
 *   1. Renseigne TOKEN et USER_ID ci-dessous
 *   2. Renseigne CHANNEL_IDS avec les salons où tu veux nettoyer tes messages
 *   3. node discord-delete-messages.js
 *
 * Comment récupérer ton token (navigateur, DevTools > onglet Network, filtre "api",
 * regarde le header "authorization" d'une requête) et ton USER_ID (Paramètres >
 * Avancé > Mode développeur, puis clic droit sur ton profil > Copier l'ID).
 */

const TOKEN = "TON_TOKEN_ICI"; // token de compte utilisateur (PAS "Bot ...")
const USER_ID = "TON_USER_ID_ICI"; // ton ID Discord

// Liste des salons (guild channels) où supprimer tes messages. Laisse vide [] pour skip.
const CHANNEL_IDS = ["ID_DU_SALON_ICI"];

// Passe à false si tu ne veux PAS toucher aux MP
const CLEAN_DMS = true;

const API = "https://discord.com/api/v10";
const DELAY_MS = 900; // délai entre suppressions pour éviter le rate-limit

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      authorization: TOKEN,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (res.status === 429) {
    const data = await res.json().catch(() => ({}));
    const retryAfter = (data.retry_after ?? 1) * 1000;
    console.log(`Rate limited, attente ${retryAfter}ms...`);
    await sleep(retryAfter);
    return apiFetch(path, options);
  }

  return res;
}

async function fetchMessages(channelId, before) {
  const query = new URLSearchParams({ limit: "100" });
  if (before) query.set("before", before);
  const res = await apiFetch(`/channels/${channelId}/messages?${query}`);
  if (!res.ok) {
    console.error(
      `Erreur fetch messages (${channelId}):`,
      res.status,
      await res.text(),
    );
    return [];
  }
  return res.json();
}

async function deleteMessage(channelId, messageId) {
  const res = await apiFetch(`/channels/${channelId}/messages/${messageId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    console.error(
      `Erreur suppression ${messageId}:`,
      res.status,
      await res.text(),
    );
  }
}

async function cleanChannel(channelId) {
  console.log(`\n--- Nettoyage du salon ${channelId} ---`);
  let before = undefined;
  let totalDeleted = 0;

  while (true) {
    const messages = await fetchMessages(channelId, before);
    if (!messages.length) break;

    before = messages[messages.length - 1].id;

    const myMessages = messages.filter((m) => m.author?.id === USER_ID);
    for (const msg of myMessages) {
      await deleteMessage(channelId, msg.id);
      totalDeleted++;
      console.log(
        `Supprimé (${totalDeleted}) : "${msg.content ? msg.content.slice(0, 40) : "<empty content>"}"`,
      );
      await sleep(DELAY_MS);
    }
  }

  console.log(
    `Terminé pour ${channelId} : ${totalDeleted} message(s) supprimé(s).`,
  );
}

async function fetchDMChannels() {
  const res = await apiFetch(`/users/@me/channels`);
  if (!res.ok) {
    console.error(`Erreur fetch DMs:`, res.status, await res.text());
    return [];
  }
  return res.json();
}

async function run() {
  if (TOKEN === "TON_TOKEN_ICI" || USER_ID === "TON_USER_ID_ICI") {
    console.error("Renseigne TOKEN et USER_ID avant de lancer le script.");
    return;
  }

  for (const channelId of CHANNEL_IDS) {
    if (!channelId || channelId === "ID_DU_SALON_ICI") continue;
    await cleanChannel(channelId);
  }

  if (CLEAN_DMS) {
    console.log("\n=== Nettoyage des MP ===");
    const dmChannels = await fetchDMChannels();
    for (const dm of dmChannels) {
      await cleanChannel(dm.id);
    }
  }

  console.log("\nTerminé !");
}

run();

async function main() {
  if (CHANNEL_IDS.length) {
    for (const channelId of CHANNEL_IDS) {
      await cleanChannel(channelId);
    }
  } else {
    console.log(
      "Aucun salon de guilde spécifié, skip le nettoyage des salons.",
    );
  }

  if (CLEAN_DMS) {
    console.log("\n--- Nettoyage des messages privés ---");
    const dmChannels = await fetchDMChannels();
    const myDmChannels = dmChannels.filter((c) =>
      c.recipients?.some((r) => r.id === USER_ID),
    );
    for (const dmChannel of myDmChannels) {
      await cleanChannel(dmChannel.id);
    }
  } else {
    console.log("Nettoyage des messages privés désactivé.");
  }

  console.log("\nScript terminé.");
}

main();
