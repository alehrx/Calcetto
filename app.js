/**
 * CALCIO BALILLA - WEB APP & ELO ENGINE
 * Standalone client-side application with optional Supabase cloud sync.
 */

// --- DATI PREDEFINITI (Migrati da statistiche.json e presenti.json) ---
const DEFAULT_PLAYERS = {
  "Luca": { "ruolo": "Indifferente", "vinte": 1, "perse": 2, "elo": 1177.83 },
  "Giovanni": { "ruolo": "Indifferente", "vinte": 1, "perse": 0, "elo": 1219.99 },
  "Alessandro": { "ruolo": "Indifferente", "vinte": 0, "perse": 1, "elo": 1180.0 },
  "Lorenzo": { "ruolo": "Indifferente", "vinte": 0, "perse": 1, "elo": 1178.85 },
  "Alex": { "ruolo": "Indifferente", "vinte": 0, "perse": 1, "elo": 1180.0 },
  "Alexander": { "ruolo": "Difesa", "vinte": 3, "perse": 0, "elo": 1297.22 },
  "Rafael": { "ruolo": "Indifferente", "vinte": 0, "perse": 2, "elo": 1162.25 },
  "Chiara": { "ruolo": "Indifferente", "vinte": 2, "perse": 2, "elo": 1161.83 },
  "Ludovica": { "ruolo": "Indifferente", "vinte": 1, "perse": 1, "elo": 1200.49 },
  "Lucio": { "ruolo": "Indifferente", "vinte": 0, "perse": 0, "elo": 1238.85 },
  "Libero": { "ruolo": "Indifferente", "vinte": 1, "perse": 0, "elo": 1221.15 },
  "Alberto": { "ruolo": "Attaccante", "vinte": 1, "perse": 0, "elo": 1181.15 },
  "Salvatore": { "ruolo": "Indifferente", "vinte": 0, "perse": 0, "elo": 1200 },
  "Massimo": { "ruolo": "Indifferente", "vinte": 2, "perse": 1, "elo": 1219.86 },
  "Eden": { "ruolo": "Indifferente", "vinte": 0, "perse": 0, "elo": 1200 },
  "Francesco": { "ruolo": "Indifferente", "vinte": 0, "perse": 1, "elo": 1180.55 },
  "Nicola": { "ruolo": "Indifferente", "vinte": 0, "perse": 0, "elo": 1200 }
};

const DEFAULT_PRESENTI = [
  "Ludovica", "Luca", "Chiara", "Alexander", "Massimo", "Rafael", "Giovanni", "Alessandro", "Lorenzo"
];

// --- STATO APPLICAZIONE ---
let state = {
  stats: {},
  presenti: [],
  storico_squadre_oggi: [],
  partite_giocate_oggi: {},
  coppie_giocate_oggi: [] // array of string keys "P1|P2" (sorted)
};

const STORAGE_KEY = 'calcetto_state_v1';
const CLOUD_CONFIG_KEY = 'calcetto_cloud_config';

// --- INIZIALIZZAZIONE ---
function initApp() {
  caricaStato();
  renderAll();
  initCloudLive();
  registerServiceWorker();
}

function caricaStato() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
    } else {
      state.stats = JSON.parse(JSON.stringify(DEFAULT_PLAYERS));
      state.presenti = [...DEFAULT_PRESENTI];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch (e) {
    console.error("Errore caricamento stato locale:", e);
    state.stats = JSON.parse(JSON.stringify(DEFAULT_PLAYERS));
    state.presenti = [...DEFAULT_PRESENTI];
  }

  // Assicura che tutti i giocatori abbiano un contatore per oggi
  Object.keys(state.stats).forEach(g => {
    if (state.partite_giocate_oggi[g] === undefined) {
      state.partite_giocate_oggi[g] = 0;
    }
  });

  // Filtra presenti per giocatori validi
  state.presenti = state.presenti.filter(g => state.stats[g]);
}

function salvaStatoLocale() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  pushToCloud();
}

// --- NAVIGAZIONE TABS ---
function switchTab(tabName) {
  const tabs = ['partita', 'classifica', 'gestione'];
  tabs.forEach(t => {
    const view = document.getElementById(`view-${t}`);
    const navBtn = document.getElementById(`nav-${t}`);
    if (t === tabName) {
      view.classList.remove('hidden');
      navBtn.classList.remove('text-slate-400', 'hover:text-slate-200');
      navBtn.classList.add('text-emerald-400');
    } else {
      view.classList.add('hidden');
      navBtn.classList.add('text-slate-400', 'hover:text-slate-200');
      navBtn.classList.remove('text-emerald-400');
    }
  });

  if (tabName === 'classifica') {
    renderClassifica();
  } else if (tabName === 'gestione') {
    renderGestione();
  } else if (tabName === 'partita') {
    renderPartita();
  }
}

// --- TOAST NOTIFICATIONS ---
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.innerText = msg;
  toast.className = `fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-xs font-semibold shadow-xl transition-all duration-300 transform ${
    type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
  } opacity-100 translate-y-0`;

  setTimeout(() => {
    toast.className = toast.className.replace('opacity-100 translate-y-0', 'opacity-0 -translate-y-2 pointer-events-none');
  }, 2200);
}

// --- RENDERING GENERALE ---
function renderAll() {
  renderPartita();
  renderClassifica();
  renderGestione();
}

// ==========================================
// SEZIONE 1: GENERATORE PARTITE & ATTENDANCE
// ==========================================
function renderPartita() {
  renderPresentiPills();
  renderManualMatchDropdowns();
  renderMatchesList();
}

function renderManualMatchDropdowns() {
  const ids = ['manual-sq1-p1', 'manual-sq1-p2', 'manual-sq2-p1', 'manual-sq2-p2'];
  const allNames = Object.keys(state.stats).sort();

  ids.forEach((id, idx) => {
    const select = document.getElementById(id);
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '';

    allNames.forEach(name => {
      const elo = Math.round(state.stats[name].elo || 1200);
      const isPresent = state.presenti.includes(name);
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = `${name} (${elo} pt)${isPresent ? ' 🟢' : ''}`;
      select.appendChild(opt);
    });

    if (currentVal && allNames.includes(currentVal)) {
      select.value = currentVal;
    } else if (allNames[idx]) {
      select.value = allNames[idx];
    }
  });
}

function renderPresentiPills() {
  const container = document.getElementById('presenti-pills-container');
  const countBadge = document.getElementById('count-presenti');
  container.innerHTML = '';

  const allNames = Object.keys(state.stats).sort();
  countBadge.innerText = `${state.presenti.length} presenti`;

  allNames.forEach(name => {
    const isPresent = state.presenti.includes(name);
    const role = state.stats[name].ruolo || 'Indifferente';
    const roleShort = role === 'Attaccante' ? 'ATT' : role === 'Difesa' ? 'DIF' : 'IND';
    const matchesToday = state.partite_giocate_oggi[name] || 0;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.onclick = () => togglePresenza(name);

    if (isPresent) {
      btn.className = 'px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 flex items-center space-x-1.5 transition active:scale-95';
    } else {
      btn.className = 'px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600 flex items-center space-x-1.5 transition active:scale-95';
    }

    btn.innerHTML = `
      <span class="w-1.5 h-1.5 rounded-full ${isPresent ? 'bg-emerald-400' : 'bg-slate-500'}"></span>
      <span class="font-semibold">${name}</span>
      <span class="text-[10px] opacity-70">(${roleShort})</span>
      ${matchesToday > 0 ? `<span class="bg-slate-900/80 px-1 rounded text-[10px] text-amber-400 font-bold">${matchesToday}</span>` : ''}
    `;
    container.appendChild(btn);
  });
}

function togglePresenza(name) {
  if (state.presenti.includes(name)) {
    state.presenti = state.presenti.filter(n => n !== name);
  } else {
    state.presenti.push(name);
  }
  salvaStatoLocale();
  renderPresentiPills();
}

function selezionaTuttiPresenti() {
  state.presenti = Object.keys(state.stats);
  salvaStatoLocale();
  renderPresentiPills();
}

function deselezionaTuttiPresenti() {
  state.presenti = [];
  salvaStatoLocale();
  renderPresentiPills();
}

// --- ALGORITMO MATCHMAKING (PORT DA PYTHON) ---
function pairKey(p1, p2) {
  return [p1, p2].sort().join('|');
}

function valutaFormazione(sq1, sq2) {
  let penalita = 0;
  
  const elo_sq1 = (state.stats[sq1[0]].elo + state.stats[sq1[1]].elo) / 2;
  const elo_sq2 = (state.stats[sq2[0]].elo + state.stats[sq2[1]].elo) / 2;
  penalita += Math.abs(elo_sq1 - elo_sq2);

  const contaRuolo = (sq, r) => sq.filter(g => state.stats[g].ruolo === r).length;

  if (contaRuolo(sq1, "Difesa") === 2 || contaRuolo(sq2, "Difesa") === 2) penalita += 500;
  if (contaRuolo(sq1, "Attaccante") === 2 || contaRuolo(sq2, "Attaccante") === 2) penalita += 150;

  const key1 = pairKey(sq1[0], sq1[1]);
  const key2 = pairKey(sq2[0], sq2[1]);

  if (state.coppie_giocate_oggi.includes(key1) || state.coppie_giocate_oggi.includes(key2)) {
    penalita += 5000;
  }

  return penalita;
}

function generaProssimaPartita() {
  if (state.presenti.length < 4) {
    showToast("Servono almeno 4 colleghi presenti!", "error");
    return;
  }

  const usaRanking = document.getElementById('toggle-ranking').checked;

  // Ordina dando priorità a chi ha giocato meno oggi, con casualità nei pari-merito
  const shuffledPresenti = [...state.presenti].sort(() => Math.random() - 0.5);
  shuffledPresenti.sort((a, b) => (state.partite_giocate_oggi[a] || 0) - (state.partite_giocate_oggi[b] || 0));

  const P = shuffledPresenti.slice(0, 4);
  P.sort(() => Math.random() - 0.5);

  let squadra_a = [];
  let squadra_b = [];

  if (usaRanking) {
    const combinazioni = [
      { sq1: [P[0], P[1]], sq2: [P[2], P[3]] },
      { sq1: [P[0], P[2]], sq2: [P[1], P[3]] },
      { sq1: [P[0], P[3]], sq2: [P[1], P[2]] }
    ];

    let migliorFormazione = combinazioni[0];
    let minPenalita = Infinity;

    combinazioni.forEach(c => {
      const pen = valutaFormazione(c.sq1, c.sq2);
      if (pen < minPenalita) {
        minPenalita = pen;
        migliorFormazione = c;
      }
    });

    squadra_a = migliorFormazione.sq1;
    squadra_b = migliorFormazione.sq2;
  } else {
    squadra_a = [P[0], P[1]];
    squadra_b = [P[2], P[3]];
  }

  // Registra coppie oggi
  state.coppie_giocate_oggi.push(pairKey(squadra_a[0], squadra_a[1]));
  state.coppie_giocate_oggi.push(pairKey(squadra_b[0], squadra_b[1]));

  const nuovoMatch = {
    id: 'm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    sq1: [squadra_a[0], squadra_a[1]],
    sq2: [squadra_b[0], squadra_b[1]],
    risolta: false,
    vincitrice: null,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  state.storico_squadre_oggi.unshift(nuovoMatch);

  // Incrementa partite giocate oggi per i 4 partecipanti
  [...squadra_a, ...squadra_b].forEach(g => {
    state.partite_giocate_oggi[g] = (state.partite_giocate_oggi[g] || 0) + 1;
  });

  salvaStatoLocale();
  renderPartita();
  showToast("Partita 2 vs 2 generata!");
}

function creaPartitaManuale() {
  const p1 = document.getElementById('manual-sq1-p1')?.value;
  const p2 = document.getElementById('manual-sq1-p2')?.value;
  const p3 = document.getElementById('manual-sq2-p1')?.value;
  const p4 = document.getElementById('manual-sq2-p2')?.value;

  if (!p1 || !p2 || !p3 || !p4) {
    showToast("Seleziona tutti e 4 i giocatori!", "error");
    return;
  }

  const unique = new Set([p1, p2, p3, p4]);
  if (unique.size < 4) {
    showToast("I 4 giocatori devono essere tutti diversi!", "error");
    return;
  }

  const squadra_a = [p1, p2];
  const squadra_b = [p3, p4];

  // Registra coppie oggi
  state.coppie_giocate_oggi.push(pairKey(squadra_a[0], squadra_a[1]));
  state.coppie_giocate_oggi.push(pairKey(squadra_b[0], squadra_b[1]));

  const nuovoMatch = {
    id: 'm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    sq1: [squadra_a[0], squadra_a[1]],
    sq2: [squadra_b[0], squadra_b[1]],
    risolta: false,
    vincitrice: null,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  state.storico_squadre_oggi.unshift(nuovoMatch);

  // Incrementa contatori partite
  [...squadra_a, ...squadra_b].forEach(g => {
    state.partite_giocate_oggi[g] = (state.partite_giocate_oggi[g] || 0) + 1;
  });

  salvaStatoLocale();
  renderPartita();
  showToast("⚔️ Sfida manuale creata!");
}

function renderMatchesList() {
  const container = document.getElementById('matches-container');
  const countLabel = document.getElementById('session-matches-count');
  container.innerHTML = '';

  countLabel.innerText = `${state.storico_squadre_oggi.length} partite`;

  if (state.storico_squadre_oggi.length === 0) {
    container.innerHTML = `
      <div class="bg-slate-800/40 border border-slate-700/40 rounded-xl p-6 text-center text-slate-400 text-sm">
        Nessuna partita generata in questa sessione.<br>Seleziona almeno 4 colleghi e premi il tasto verde!
      </div>
    `;
    return;
  }

  state.storico_squadre_oggi.forEach(match => {
    const elo1_a = Math.round(state.stats[match.sq1[0]]?.elo || 1200);
    const elo1_b = Math.round(state.stats[match.sq1[1]]?.elo || 1200);
    const mediaSq1 = Math.round((elo1_a + elo1_b) / 2);

    const elo2_a = Math.round(state.stats[match.sq2[0]]?.elo || 1200);
    const elo2_b = Math.round(state.stats[match.sq2[1]]?.elo || 1200);
    const mediaSq2 = Math.round((elo2_a + elo2_b) / 2);

    const card = document.createElement('div');
    card.className = 'bg-slate-800/90 border border-slate-700 rounded-2xl p-4 shadow-md space-y-3';

    card.innerHTML = `
      <div class="flex items-center justify-between text-xs text-slate-400 border-b border-slate-700/60 pb-2">
        <span class="font-medium">Match ore ${match.timestamp || ''}</span>
        ${match.risolta 
          ? `<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">Conclusa</span>`
          : `<span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-semibold border border-amber-500/30">In corso...</span>`
        }
      </div>

      <!-- Teams Display -->
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="p-2.5 rounded-xl bg-blue-950/40 border ${match.vincitrice === 1 ? 'border-amber-400/80 bg-amber-500/10' : 'border-blue-500/30'}">
          <div class="flex justify-between items-center text-blue-400 font-bold mb-1">
            <span>🔵 SQUADRA 1</span>
            <span class="text-[11px] font-normal">${mediaSq1} pt</span>
          </div>
          <div class="text-slate-200 font-medium">${match.sq1[0]} <span class="text-slate-400 text-[10px]">(${elo1_a})</span></div>
          <div class="text-slate-200 font-medium">${match.sq1[1]} <span class="text-slate-400 text-[10px]">(${elo1_b})</span></div>
        </div>

        <div class="p-2.5 rounded-xl bg-rose-950/40 border ${match.vincitrice === 2 ? 'border-amber-400/80 bg-amber-500/10' : 'border-rose-500/30'}">
          <div class="flex justify-between items-center text-rose-400 font-bold mb-1">
            <span>🔴 SQUADRA 2</span>
            <span class="text-[11px] font-normal">${mediaSq2} pt</span>
          </div>
          <div class="text-slate-200 font-medium">${match.sq2[0]} <span class="text-slate-400 text-[10px]">(${elo2_a})</span></div>
          <div class="text-slate-200 font-medium">${match.sq2[1]} <span class="text-slate-400 text-[10px]">(${elo2_b})</span></div>
        </div>
      </div>

      <!-- Actions -->
      ${!match.risolta ? `
        <div class="grid grid-cols-3 gap-2 pt-1">
          <button onclick="registraVittoria('${match.id}', 1)" class="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-semibold py-2 px-1 rounded-xl text-xs transition flex items-center justify-center space-x-1 shadow">
            <span>🏆</span>
            <span>Vince Sq. 1</span>
          </button>
          <button onclick="registraVittoria('${match.id}', 2)" class="bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-semibold py-2 px-1 rounded-xl text-xs transition flex items-center justify-center space-x-1 shadow">
            <span>🏆</span>
            <span>Vince Sq. 2</span>
          </button>
          <button onclick="scartaPartita('${match.id}')" class="bg-slate-700/80 hover:bg-slate-700 text-slate-300 active:scale-95 py-2 px-1 rounded-xl text-xs transition flex items-center justify-center space-x-1">
            <span>❌</span>
            <span>Scarta</span>
          </button>
        </div>
      ` : `
        <div class="text-xs text-center font-semibold text-emerald-400 bg-emerald-500/10 py-1.5 rounded-lg border border-emerald-500/20">
          🏆 Ha vinto la <b>${match.vincitrice === 1 ? 'Squadra 1 (Blu)' : 'Squadra 2 (Rossa)'}</b>! Elo aggiornato.
        </div>
      `}
    `;

    container.appendChild(card);
  });
}

// --- CALCOLO VITTORIA & AGGIORNAMENTO ELO ---
function registraVittoria(matchId, squadraVincente) {
  const match = state.storico_squadre_oggi.find(m => m.id === matchId);
  if (!match || match.risolta) return;

  match.risolta = true;
  match.vincitrice = squadraVincente;

  const vincenti = squadraVincente === 1 ? match.sq1 : match.sq2;
  const perdenti = squadraVincente === 1 ? match.sq2 : match.sq1;

  // Calcolo Elo
  const K = 40;
  const elo_v = (state.stats[vincenti[0]].elo + state.stats[vincenti[1]].elo) / 2;
  const elo_p = (state.stats[perdenti[0]].elo + state.stats[perdenti[1]].elo) / 2;

  const prob_v = 1 / (1 + Math.pow(10, (elo_p - elo_v) / 400));
  const prob_p = 1 / (1 + Math.pow(10, (elo_v - elo_p) / 400));

  const delta_v = K * (1 - prob_v);
  const delta_p = K * (0 - prob_p);

  vincenti.forEach(g => {
    state.stats[g].elo += delta_v;
    state.stats[g].vinte = (state.stats[g].vinte || 0) + 1;
  });

  perdenti.forEach(g => {
    state.stats[g].elo += delta_p;
    state.stats[g].perse = (state.stats[g].perse || 0) + 1;
  });

  salvaStatoLocale();
  renderMatchesList();
  showToast(`Vittoria registrata! Elo: +${delta_v.toFixed(1)} / ${delta_p.toFixed(1)} pt`);
}

function scartaPartita(matchId) {
  const idx = state.storico_squadre_oggi.findIndex(m => m.id === matchId);
  if (idx === -1) return;

  const match = state.storico_squadre_oggi[idx];
  [...match.sq1, ...match.sq2].forEach(g => {
    state.partite_giocate_oggi[g] = Math.max(0, (state.partite_giocate_oggi[g] || 0) - 1);
  });

  const k1 = pairKey(match.sq1[0], match.sq1[1]);
  const k2 = pairKey(match.sq2[0], match.sq2[1]);
  state.coppie_giocate_oggi = state.coppie_giocate_oggi.filter(k => k !== k1 && k !== k2);

  state.storico_squadre_oggi.splice(idx, 1);

  salvaStatoLocale();
  renderPartita();
  showToast("Partita scartata");
}

function confermaAzzeraSessione() {
  if (confirm("Vuoi azzerare le partite e le rotazioni di oggi? La classifica generale Elo NON verrà toccata.")) {
    state.storico_squadre_oggi = [];
    state.coppie_giocate_oggi = [];
    Object.keys(state.partite_giocate_oggi).forEach(g => state.partite_giocate_oggi[g] = 0);
    salvaStatoLocale();
    renderPartita();
    showToast("Sessione odierna azzerata!");
  }
}

// ==========================================
// SEZIONE 2: CLASSIFICA ELO & PODIO
// ==========================================
function renderClassifica() {
  const allNames = Object.keys(state.stats);
  const list = allNames.map(name => {
    const s = state.stats[name];
    const totali = (s.vinte || 0) + (s.perse || 0);
    const winRate = totali > 0 ? (s.vinte / totali) * 100 : 0;
    return {
      nome: name,
      elo: s.elo || 1200,
      vinte: s.vinte || 0,
      perse: s.perse || 0,
      totali: totali,
      winRate: winRate,
      ruolo: s.ruolo || 'Indifferente'
    };
  });

  list.sort((a, b) => b.elo - a.elo || b.vinte - a.vinte);

  const attivi = list.filter(p => p.totali > 0);
  const inattivi = list.filter(p => p.totali === 0);

  // Podio Top 3
  const podiumContainer = document.getElementById('podium-container');
  podiumContainer.innerHTML = '';

  if (attivi.length >= 1) {
    const top3 = [attivi[1], attivi[0], attivi[2]]; // ordine visuale: 2° (sx), 1° (centro), 3° (dx)
    const positions = [2, 1, 3];
    const medals = ["🥈", "🥇", "🥉"];
    const colors = [
      "border-slate-400 bg-slate-800/80 text-slate-200",
      "border-amber-400 bg-amber-500/10 text-amber-300 scale-105",
      "border-amber-700 bg-amber-950/20 text-amber-500"
    ];

    top3.forEach((p, idx) => {
      if (!p) {
        podiumContainer.innerHTML += `<div></div>`;
        return;
      }
      podiumContainer.innerHTML += `
        <div class="rounded-2xl border ${colors[idx]} p-3 text-center flex flex-col items-center justify-between shadow-sm">
          <span class="text-2xl">${medals[idx]}</span>
          <div class="font-bold text-xs truncate w-full mt-1">${p.nome}</div>
          <div class="text-sm font-extrabold mt-0.5">${Math.round(p.elo)} pt</div>
          <div class="text-[10px] opacity-75 mt-0.5">${p.winRate.toFixed(0)}% WR (${p.vinte}V)</div>
        </div>
      `;
    });
  }

  // Lista Giocatori Attivi
  const rankedList = document.getElementById('ranked-list');
  const countBadge = document.getElementById('active-players-count');
  rankedList.innerHTML = '';
  countBadge.innerText = `${attivi.length} attivi`;

  if (attivi.length === 0) {
    rankedList.innerHTML = `
      <div class="p-6 text-center text-slate-400 text-xs">
        Nessuna vittoria ancora registrata. Gioca la prima partita per scalare il ranking!
      </div>
    `;
  } else {
    attivi.forEach((p, i) => {
      const pos = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      rankedList.innerHTML += `
        <div class="px-4 py-3 flex items-center justify-between hover:bg-slate-700/30 transition">
          <div class="flex items-center space-x-3">
            <span class="font-bold text-sm text-slate-300 w-6">${pos}</span>
            <div>
              <div class="font-bold text-sm text-white flex items-center space-x-1.5">
                <span>${p.nome}</span>
                <span class="text-[10px] font-normal px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">${p.ruolo}</span>
              </div>
              <div class="text-xs text-slate-400 mt-0.5">
                Vinte: <b class="text-emerald-400">${p.vinte}</b> | Perse: <b class="text-rose-400">${p.perse}</b> 
                (${p.winRate.toFixed(1)}% Win Rate)
              </div>
            </div>
          </div>
          <div class="text-right">
            <span class="text-base font-extrabold text-emerald-400">${Math.round(p.elo)}</span>
            <span class="text-xs text-slate-400 block -mt-1">punti</span>
          </div>
        </div>
      `;
    });
  }

  // Sezione Inattivi
  const inactiveCard = document.getElementById('inactive-card');
  const inactiveList = document.getElementById('inactive-players-list');
  if (inattivi.length > 0) {
    inactiveCard.classList.remove('hidden');
    inactiveList.innerText = inattivi.map(p => p.nome).join(', ');
  } else {
    inactiveCard.classList.add('hidden');
  }
}

// ==========================================
// SEZIONE 3: GESTIONE GIOCATORI & DATABASE
// ==========================================
function renderGestione() {
  const container = document.getElementById('gestione-players-list');
  const totalBadge = document.getElementById('total-registered-badge');
  container.innerHTML = '';

  const names = Object.keys(state.stats).sort();
  totalBadge.innerText = `${names.length} colleghi`;

  names.forEach(name => {
    const p = state.stats[name];
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60 text-xs';

    row.innerHTML = `
      <div class="flex items-center space-x-2">
        <span class="font-bold text-sm text-white">${name}</span>
        <select onchange="cambiaRuolo('${name}', this.value)" class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-200">
          <option value="Indifferente" ${p.ruolo === 'Indifferente' ? 'selected' : ''}>Indifferente</option>
          <option value="Attaccante" ${p.ruolo === 'Attaccante' ? 'selected' : ''}>Attaccante</option>
          <option value="Difesa" ${p.ruolo === 'Difesa' ? 'selected' : ''}>Difesa</option>
        </select>
      </div>

      <div class="flex items-center space-x-2">
        <span class="text-slate-400 font-mono">${Math.round(p.elo || 1200)} pt</span>
        <button onclick="rimuoviGiocatore('${name}')" class="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-rose-500/10 transition" title="Elimina">
          🗑️
        </button>
      </div>
    `;
    container.appendChild(row);
  });
}

function handleAggiungiGiocatore(e) {
  e.preventDefault();
  const input = document.getElementById('input-new-name');
  const roleSelect = document.getElementById('select-new-role');
  const name = input.value.trim();

  if (!name) return;

  if (state.stats[name]) {
    showToast(`"${name}" è già registrato!`, "error");
    return;
  }

  state.stats[name] = {
    ruolo: roleSelect.value,
    vinte: 0,
    perse: 0,
    elo: 1200
  };

  state.partite_giocate_oggi[name] = 0;
  if (!state.presenti.includes(name)) {
    state.presenti.push(name);
  }

  input.value = '';
  salvaStatoLocale();
  renderAll();
  showToast(`${name} aggiunto con successo!`);
}

function cambiaRuolo(name, nuovoRuolo) {
  if (state.stats[name]) {
    state.stats[name].ruolo = nuovoRuolo;
    salvaStatoLocale();
    renderAll();
    showToast(`Ruolo di ${name} aggiornato`);
  }
}

// --- PIN AMMINISTRATORE (Per azioni distruttive: reset classifica o eliminazione collega) ---
const ADMIN_PIN = "0000";
let pendingPinAction = null;

function richiediPin(titolo, desc, onConfirm) {
  pendingPinAction = onConfirm;
  const titleEl = document.getElementById('pin-modal-title');
  const descEl = document.getElementById('pin-modal-desc');
  const inputEl = document.getElementById('pin-modal-input');
  const errorEl = document.getElementById('pin-modal-error');
  const modalEl = document.getElementById('pin-modal');

  if (titleEl) titleEl.innerText = titolo;
  if (descEl) descEl.innerText = desc;
  if (inputEl) inputEl.value = '';
  if (errorEl) errorEl.classList.add('hidden');
  if (modalEl) modalEl.classList.remove('hidden');
  if (inputEl) inputEl.focus();
}

function chiudiPinModal() {
  const modalEl = document.getElementById('pin-modal');
  if (modalEl) modalEl.classList.add('hidden');
  pendingPinAction = null;
}

function confermaPinModal() {
  const inputEl = document.getElementById('pin-modal-input');
  const errorEl = document.getElementById('pin-modal-error');
  const modalEl = document.getElementById('pin-modal');
  const pin = inputEl ? inputEl.value.trim() : '';

  if (pin === ADMIN_PIN) {
    if (modalEl) modalEl.classList.add('hidden');
    if (typeof pendingPinAction === 'function') {
      const action = pendingPinAction;
      pendingPinAction = null;
      action();
    }
  } else {
    if (errorEl) errorEl.classList.remove('hidden');
  }
}

function rimuoviGiocatore(name) {
  richiediPin("Elimina Collega", `Sei sicuro di voler eliminare definitivamente ${name} dal database?`, () => {
    delete state.stats[name];
    delete state.partite_giocate_oggi[name];
    state.presenti = state.presenti.filter(g => g !== name);
    salvaStatoLocale();
    renderAll();
    showToast(`${name} eliminato`);
  });
}

// --- AZZERA CLASSIFICA STAGIONALE (PROTETTA DA PIN) ---
function confermaResetClassifica() {
  richiediPin("Azzera Classifica", "Tutti i punteggi Elo torneranno a 1200 e le vittorie a 0.", () => {
    Object.keys(state.stats).forEach(name => {
      state.stats[name].elo = 1200;
      state.stats[name].vinte = 0;
      state.stats[name].perse = 0;
    });

    state.storico_squadre_oggi = [];
    state.coppie_giocate_oggi = [];
    Object.keys(state.partite_giocate_oggi).forEach(g => {
      state.partite_giocate_oggi[g] = 0;
    });

    salvaStatoLocale();
    renderAll();
    showToast("Classifica stagionale azzerata! Tutti a 1200 pt.");
  });
}

// ==========================================
// SEZIONE 4: CLOUD SYNC LIVE (SUPABASE)
// ==========================================
const SUPABASE_URL = "https://zxdelivduwrbbthflqys.supabase.co";
const SUPABASE_KEY = "sb_publishable_UOTWumLKxj3hqJ2KMXDn6Q_IpQNdRxI";

let isSyncing = false;
let lastRemoteUpdatedAt = null;

function initCloudLive() {
  // Pull iniziale immediato
  pullFromCloud();

  // Polling automatico ogni 8 secondi in background
  setInterval(() => {
    if (!document.hidden) {
      pullFromCloud();
    }
  }, 8000);

  // Quando un collega sblocca il telefono o torna sulla pagina, ricarica subito
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      pullFromCloud();
    }
  });
}

async function pushToCloud() {
  if (isSyncing) return;
  try {
    const now = new Date().toISOString();
    lastRemoteUpdatedAt = now;
    const endpoint = `${SUPABASE_URL}/rest/v1/calcetto_state`;
    const payload = {
      id: 'global',
      data: state,
      updated_at: now
    };

    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn("Push cloud fallita (normale se offline):", err);
  }
}

async function pullFromCloud(showToastFeedback = false) {
  try {
    const endpoint = `${SUPABASE_URL}/rest/v1/calcetto_state?id=eq.global&select=data,updated_at`;
    const res = await fetch(endpoint, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (res.ok) {
      const rows = await res.json();
      if (rows && rows.length > 0 && rows[0].data) {
        const remote = rows[0];
        if (remote.data && remote.data.stats && typeof remote.data.stats === 'object' && Object.keys(remote.data.stats).length > 0) {
          if (!lastRemoteUpdatedAt || remote.updated_at !== lastRemoteUpdatedAt) {
            lastRemoteUpdatedAt = remote.updated_at;
            isSyncing = true;
            state = { ...state, ...remote.data };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            renderAll();
            isSyncing = false;
            if (showToastFeedback) {
              showToast("Classifica aggiornata dal Cloud!", "success");
            }
          } else if (showToastFeedback) {
            showToast("I dati sono già sincronizzati!", "success");
          }
        }
      }
    }
  } catch (err) {
    console.warn("Pull cloud fallita:", err);
    if (showToastFeedback) {
      showToast("Impossibile connettersi al Cloud (offline)", "error");
    }
  }
}

// --- SERVICE WORKER REGISTRATION (PWA) ---
function registerServiceWorker() {
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('SW registration skipped or error:', err);
    });
  }
}

// Avvio
window.addEventListener('DOMContentLoaded', initApp);
