document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('cleanForm');
    const tokenInput = document.getElementById('token');
    const toggleTokenBtn = document.getElementById('toggleToken');
    const userIdInput = document.getElementById('userId');
    const segButtons = Array.from(document.querySelectorAll('.seg-btn'));
    const channelIdGroup = document.getElementById('channelIdGroup');
    const channelIdInput = document.getElementById('channelId');
    const dmUserIdGroup = document.getElementById('dmUserIdGroup');
    const dmUserIdInput = document.getElementById('dmUserId');
    const cleanButton = document.getElementById('cleanButton');
    const statusEl = document.getElementById('status');
    const consoleSection = document.getElementById('consoleSection');
    const logEl = document.getElementById('log');
    const counterEl = document.getElementById('counter');

    const backendUrl = '/clean';
    let cleanupType = 'guild';
    let deletedCount = 0;

    toggleTokenBtn.addEventListener('click', () => {
        const showing = tokenInput.type === 'text';
        tokenInput.type = showing ? 'password' : 'text';
        toggleTokenBtn.setAttribute('aria-label', showing ? 'Afficher le token' : 'Masquer le token');
    });

    segButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            cleanupType = btn.dataset.type;
            segButtons.forEach((b) => {
                b.classList.toggle('active', b === btn);
                b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
            });
            channelIdGroup.classList.toggle('hidden', cleanupType !== 'guild');
            dmUserIdGroup.classList.toggle('hidden', cleanupType !== 'dm');
        });
    });

    function setStatus(text, kind) {
        statusEl.textContent = text;
        statusEl.className = 'status' + (kind ? ` ${kind}` : '');
    }

    function appendLine(text) {
        const line = document.createElement('div');
        line.className = 'line';
        line.textContent = text;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
    }

    function setLoading(isLoading) {
        cleanButton.disabled = isLoading;
        cleanButton.classList.toggle('loading', isLoading);
    }

    async function handleStream(response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const raw of lines) {
                if (!raw.trim()) continue;
                let payload;
                try {
                    payload = JSON.parse(raw);
                } catch {
                    continue;
                }

                if (payload.type === 'log') {
                    appendLine(payload.message);
                    deletedCount += 1;
                    counterEl.textContent = `${deletedCount} supprimé${deletedCount > 1 ? 's' : ''}`;
                } else if (payload.type === 'error') {
                    setStatus(payload.message, 'error');
                } else if (payload.type === 'done') {
                    setStatus(`Terminé — ${payload.totalDeleted} message(s) supprimé(s).`, 'success');
                }
            }
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const token = tokenInput.value.trim();
        const userId = userIdInput.value.trim();
        const channelId = channelIdInput.value.trim();
        const dmUserId = dmUserIdInput.value.trim();

        if (cleanupType === 'guild' && !channelId) {
            setStatus('Renseigne un ID de salon.', 'error');
            return;
        }
        if (cleanupType === 'dm' && !dmUserId) {
            setStatus("Renseigne l'ID de l'interlocuteur.", 'error');
            return;
        }

        const payload = { token, userId };
        if (cleanupType === 'guild') payload.channelId = channelId;
        else payload.dmUserId = dmUserId;

        deletedCount = 0;
        counterEl.textContent = '0 supprimé';
        logEl.textContent = '';
        consoleSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setLoading(true);
        setStatus('Connexion au serveur…');

        try {
            const response = await fetch(backendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                setStatus(data.error || `Erreur (${response.status})`, 'error');
                return;
            }

            setStatus('Nettoyage en cours…');
            await handleStream(response);
        } catch (err) {
            console.error(err);
            setStatus('Serveur injoignable — vérifie que le backend tourne.', 'error');
        } finally {
            setLoading(false);
        }
    });
});
