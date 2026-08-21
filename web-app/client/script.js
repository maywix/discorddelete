document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('cleanForm');
    const tokenInput = document.getElementById('token');
    const toggleTokenBtn = document.getElementById('toggleToken');
    const userIdInput = document.getElementById('userId');
    const targetsList = document.getElementById('targetsList');
    const addTargetBtn = document.getElementById('addTargetBtn');
    const cleanButton = document.getElementById('cleanButton');
    const stopButton = document.getElementById('stopButton');
    const statusEl = document.getElementById('status');
    const consoleSection = document.getElementById('consoleSection');
    const logEl = document.getElementById('log');
    const counterEl = document.getElementById('counter');

    const backendUrl = '/clean';
    const MAX_TARGETS = 10;
    let deletedCount = 0;
    let abortController = null;

    // --- Token visibility ---
    toggleTokenBtn.addEventListener('click', () => {
        const showing = tokenInput.type === 'text';
        tokenInput.type = showing ? 'password' : 'text';
        toggleTokenBtn.setAttribute('aria-label', showing ? 'Afficher le token' : 'Masquer le token');
    });

    // --- Targets list (up to MAX_TARGETS) ---
    function createTargetRow() {
        const row = document.createElement('div');
        row.className = 'target-row';
        row.innerHTML = `
            <select class="target-type">
                <option value="guild">Salon</option>
                <option value="dm">MP</option>
            </select>
            <input type="text" class="target-id" placeholder="ID du salon" inputmode="numeric">
            <button type="button" class="remove-target-btn" aria-label="Retirer cette cible">×</button>
        `;
        return row;
    }

    function updateTargetsUi() {
        const count = targetsList.children.length;
        addTargetBtn.disabled = count >= MAX_TARGETS;
        addTargetBtn.textContent = count >= MAX_TARGETS ? 'Limite atteinte (10)' : '+ Ajouter une cible';
        targetsList.querySelectorAll('.remove-target-btn').forEach((btn) => {
            btn.disabled = count <= 1;
        });
    }

    function addTargetRow() {
        if (targetsList.children.length >= MAX_TARGETS) return;
        targetsList.appendChild(createTargetRow());
        updateTargetsUi();
    }

    addTargetBtn.addEventListener('click', addTargetRow);

    targetsList.addEventListener('click', (e) => {
        const btn = e.target.closest('.remove-target-btn');
        if (!btn || btn.disabled) return;
        btn.closest('.target-row').remove();
        updateTargetsUi();
    });

    targetsList.addEventListener('change', (e) => {
        if (!e.target.classList.contains('target-type')) return;
        const input = e.target.closest('.target-row').querySelector('.target-id');
        input.placeholder = e.target.value === 'dm' ? "ID de l'interlocuteur" : 'ID du salon';
    });

    addTargetRow(); // une cible par défaut

    function collectTargets() {
        return Array.from(targetsList.querySelectorAll('.target-row'))
            .map((row) => ({
                type: row.querySelector('.target-type').value,
                id: row.querySelector('.target-id').value.trim(),
            }))
            .filter((t) => t.id);
    }

    // --- Status / console ---
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
        stopButton.hidden = !isLoading;
        stopButton.disabled = false;
    }

    stopButton.addEventListener('click', () => {
        if (!abortController) return;
        stopButton.disabled = true;
        setStatus('Arrêt du nettoyage…');
        abortController.abort();
    });

    // --- Fin de nettoyage : notification navigateur + bip + titre d'onglet ---
    const originalTitle = document.title;
    let titleFlashTimer = null;

    function flashTitle(text) {
        if (!document.hidden) return;
        let flashed = false;
        clearInterval(titleFlashTimer);
        titleFlashTimer = setInterval(() => {
            document.title = flashed ? originalTitle : text;
            flashed = !flashed;
        }, 900);
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && titleFlashTimer) {
            clearInterval(titleFlashTimer);
            titleFlashTimer = null;
            document.title = originalTitle;
        }
    });

    function beep() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
            osc.connect(gain).connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.35);
        } catch {
            // audio indisponible, tant pis
        }
    }

    function notifyDone(totalDeleted) {
        beep();
        flashTitle('✅ Terminé');
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Nettoyage terminé', {
                body: `${totalDeleted} message(s) supprimé(s).`,
            });
        }
    }

    // --- Streaming NDJSON ---
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
                    appendLine(payload.label ? `[${payload.label}] ${payload.message}` : payload.message);
                    deletedCount += 1;
                    counterEl.textContent = `${deletedCount} supprimé${deletedCount > 1 ? 's' : ''}`;
                } else if (payload.type === 'target-done') {
                    appendLine(`— ${payload.label} : ${payload.totalDeleted} supprimé(s) —`);
                } else if (payload.type === 'target-stopped') {
                    appendLine(`— ${payload.label} : arrêté après ${payload.totalDeleted} supprimé(s) —`);
                } else if (payload.type === 'error') {
                    appendLine(`⚠ ${payload.label ? `[${payload.label}] ` : ''}${payload.message}`);
                    if (!payload.label) setStatus(payload.message, 'error');
                } else if (payload.type === 'done') {
                    setStatus(`Terminé — ${payload.totalDeleted} message(s) supprimé(s) au total.`, 'success');
                    notifyDone(payload.totalDeleted);
                }
            }
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Demande la permission de notification pendant le geste utilisateur (clic).
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {});
        }

        const token = tokenInput.value.trim();
        const userId = userIdInput.value.trim();
        const targets = collectTargets();

        if (!targets.length) {
            setStatus('Ajoute au moins une cible avec un ID.', 'error');
            return;
        }

        deletedCount = 0;
        counterEl.textContent = '0 supprimé';
        logEl.textContent = '';
        consoleSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setLoading(true);
        setStatus('Connexion au serveur…');

        abortController = new AbortController();

        try {
            const response = await fetch(backendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, userId, targets }),
                signal: abortController.signal,
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                setStatus(data.error || `Erreur (${response.status})`, 'error');
                return;
            }

            setStatus('Nettoyage en cours…');
            await handleStream(response);
        } catch (err) {
            if (err.name === 'AbortError') {
                setStatus('Nettoyage arrêté.');
            } else {
                console.error(err);
                setStatus('Serveur injoignable — vérifie que le backend tourne.', 'error');
            }
        } finally {
            setLoading(false);
            abortController = null;
        }
    });
});
