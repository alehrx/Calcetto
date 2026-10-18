/**
 * CALCIO BALILLA V2 - MULTI-TEAM & ELO ENGINE
 * Multi-tenant architecture: each group is completely isolated in Supabase.
 */

// --- CONFIGURAZIONE GRUPPO & SUPABASE ---
const SUPABASE_URL = "https://zxdelivduwrbbthflqys.supabase.co";
const SUPABASE_KEY = "sb_publishable_UOTWumLKxj3hqJ2KMXDn6Q_IpQNdRxI";

// Rileva il gruppo dall'URL (?group=...) o usa il gruppo predefinito
const urlParams = new URLSearchParams(window.location.search);
let CURRENT_GROUP_ID = (urlParams.get('group') || 'phd-polimi').toLowerCase().replace(/[^a-z0-9_-]/g, '');
if (!CURRENT_GROUP_ID) CURRENT_GROUP_ID = 'phd-polimi';

const STORAGE_KEY = `calcetto_state_v2_${CURRENT_GROUP_ID}`;

// Stato dell'applicazione
let state = {
  group_name: CURRENT_GROUP_ID.toUpperCase(),
  admin_pin: "1234",
  stats: {},
  presenti: [],
  storico_squadre_oggi: [],
  partite_giocate_oggi: {},
  coppie_giocate_oggi: []
};

let isSyncing = false;
let lastRemoteUpdatedAt = null;
let pendingPinAction = null;

// --- INIZIALIZZAZIONE ---
function initApp() {
  aggiornaHeaderGruppo();
  caricaStatoLocale();
  renderAll();
  initCloudLive();
  registerServiceWorker();
}

function aggiornaHeaderGruppo() {
  const headerEl = document.getElementById('header-group-name');
  const gestioneEl = document.getElementById('gestione-group-name');
  const subtitleEl = document.getElementById('classifica-group-subtitle');
  const displayName = state.group_name || CURRENT_GROUP_ID.toUpperCase();

  if (headerEl) headerEl.innerText = displayName;
  if (gestioneEl) gestioneEl.innerText = displayName;
  if (subtitleEl) subtitleEl.innerText = `Ranking per il gruppo: ${displayName} (K=40)`;
}

function caricaStatoLocale() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = { ...state, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error("Errore caricamento stato locale:", e);
  }
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

  if (tabName === 'classifica') renderClassifica();
  else if (tabName === 'gestione') renderGestione();
  else if (tabName === 'partita') renderPartita();
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
  aggiornaHeaderGruppo();
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

function renderPresentiPills() {
  const container = document.getElementById('presenti-pills-container');
  const countBadge = document.getElementById('count-presenti');
  container.innerHTML = '';

  const allNames = Object.keys(state.stats || {}).sort();
  countBadge.innerText = `${(state.presenti || []).length} presenti`;

  if (allNames.length === 0) {
    container.innerHTML = `<span class="text-xs text-slate-500 italic py-2">Nessun collega registrato in questo gruppo. Aggiungine uno nella scheda Gestione!</span>`;
    return;
  }

  allNames.forEach(name => {
    const isPresent = (state.presenti || []).includes(name);
    const role = state.stats[name].ruolo || 'Indifferente';
    const roleShort = role === 'Attaccante' ? 'ATT' : role === 'Difesa' ? 'DIF' : 'IND';
    const matchesToday = (state.partite_giocate_oggi || {})[name] || 0;

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

function renderManualMatchDropdowns() {
  const ids = ['manual-sq1-p1', 'manual-sq1-p2', 'manual-sq2-p1', 'manual-sq2-p2'];
  const allNames = Object.keys(state.stats || {}).sort();

  ids.forEach((id, idx) => {
    const select = document.getElementById(id);
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '';

    allNames.forEach(name => {
      const elo = Math.round(state.stats[name].elo || 1200);
      const isPresent = (state.presenti || []).includes(name);
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

function togglePresenza(name) {
  if (!state.presenti) state.presenti = [];
  if (state.presenti.includes(name)) {
    state.presenti = state.presenti.filter(n => n !== name);
  } else {
    state.presenti.push(name);
  }
  salvaStatoLocale();
  renderPresentiPills();
}

function selezionaTuttiPresenti() {
  state.presenti = Object.keys(state.stats || {});
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

  if ((state.coppie_giocate_oggi || []).includes(key1) || (state.coppie_giocate_oggi || []).includes(key2)) {
    penalita += 5000;
  }

  return penalita;
}

function generaProssimaPartita() {
  if (!state.presenti || state.presenti.length < 4) {
    showToast("Servono almeno 4 colleghi presenti!", "error");
    return;
  }

  const usaRanking = document.getElementById('toggle-ranking').checked;

  const shuffledPresenti = [...state.presenti].sort(() => Math.random() - 0.5);
  shuffledPresenti.sort((a, b) => ((state.partite_giocate_oggi || {})[a] || 0) - ((state.partite_giocate_oggi || {})[b] || 0));

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

  if (!state.coppie_giocate_oggi) state.coppie_giocate_oggi = [];
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

  if (!state.storico_squadre_oggi) state.storico_squadre_oggi = [];
  state.storico_squadre_oggi.unshift(nuovoMatch);

  if (!state.partite_giocate_oggi) state.partite_giocate_oggi = {};
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

  if (!state.coppie_giocate_oggi) state.coppie_giocate_oggi = [];
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

  if (!state.storico_squadre_oggi) state.storico_squadre_oggi = [];
  state.storico_squadre_oggi.unshift(nuovoMatch);

  if (!state.partite_giocate_oggi) state.partite_giocate_oggi = {};
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

  const matches = state.storico_squadre_oggi || [];
  countLabel.innerText = `${matches.length} partite`;

  if (matches.length === 0) {
    container.innerHTML = `
      <div class="bg-slate-800/40 border border-slate-700/40 rounded-xl p-6 text-center text-slate-400 text-sm">
        Nessuna partita generata in questa sessione.<br>Seleziona almeno 4 colleghi e premi il tasto verde!
      </div>
    `;
    return;
  }

  matches.forEach(match => {
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

function registraVittoria(matchId, squadraVincente) {
  const match = (state.storico_squadre_oggi || []).find(m => m.id === matchId);
  if (!match || match.risolta) return;

  match.risolta = true;
  match.vincitrice = squadraVincente;

  const vincenti = squadraVincente === 1 ? match.sq1 : match.sq2;
  const perdenti = squadraVincente === 1 ? match.sq2 : match.sq1;

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
  const idx = (state.storico_squadre_oggi || []).findIndex(m => m.id === matchId);
  if (idx === -1) return;

  const match = state.storico_squadre_oggi[idx];
  [...match.sq1, ...match.sq2].forEach(g => {
    state.partite_giocate_oggi[g] = Math.max(0, ((state.partite_giocate_oggi || {})[g] || 0) - 1);
  });

  const k1 = pairKey(match.sq1[0], match.sq1[1]);
  const k2 = pairKey(match.sq2[0], match.sq2[1]);
  state.coppie_giocate_oggi = (state.coppie_giocate_oggi || []).filter(k => k !== k1 && k !== k2);

  state.storico_squadre_oggi.splice(idx, 1);

  salvaStatoLocale();
  renderPartita();
  showToast("Partita scartata");
}

function confermaAzzeraSessione() {
  if (confirm("Vuoi azzerare le partite e le rotazioni di oggi? La classifica generale Elo NON verrà toccata.")) {
    state.storico_squadre_oggi = [];
    state.coppie_giocate_oggi = [];
    Object.keys(state.partite_giocate_oggi || {}).forEach(g => state.partite_giocate_oggi[g] = 0);
    salvaStatoLocale();
    renderPartita();
    showToast("Sessione odierna azzerata!");
  }
}

// ==========================================
// SEZIONE 2: CLASSIFICA ELO & PODIO
// ==========================================
function renderClassifica() {
  const allNames = Object.keys(state.stats || {});
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

  const podiumContainer = document.getElementById('podium-container');
  podiumContainer.innerHTML = '';

  if (attivi.length >= 1) {
    const top3 = [attivi[1], attivi[0], attivi[2]];
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

  const rankedList = document.getElementById('ranked-list');
  const countBadge = document.getElementById('active-players-count');
  rankedList.innerHTML = '';
  countBadge.innerText = `${attivi.length} attivi`;

  if (attivi.length === 0) {
    rankedList.innerHTML = `
      <div class="p-6 text-center text-slate-400 text-xs">
        Nessuna partita ancora registrata in questo gruppo.
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
// SEZIONE 3: GESTIONE GIOCATORI & GRUPPO
// ==========================================
function renderGestione() {
  const container = document.getElementById('gestione-players-list');
  const totalBadge = document.getElementById('total-registered-badge');
  container.innerHTML = '';

  const names = Object.keys(state.stats || {}).sort();
  totalBadge.innerText = `${names.length} colleghi`;

  if (names.length === 0) {
    container.innerHTML = `<span class="text-xs text-slate-500 italic py-2 block text-center">Nessun collega ancora aggiunto.</span>`;
    return;
  }

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
  if (e) e.preventDefault();
  const input = document.getElementById('input-new-name');
  const roleSelect = document.getElementById('select-new-role');
  const name = input.value.trim();

  if (!name) return;

  if (state.stats && state.stats[name]) {
    showToast(`"${name}" è già registrato!`, "error");
    return;
  }

  if (!state.stats) state.stats = {};
  if (!state.partite_giocate_oggi) state.partite_giocate_oggi = {};
  if (!state.presenti) state.presenti = [];

  state.stats[name] = {
    ruolo: roleSelect.value || "Indifferente",
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
  if (state.stats && state.stats[name]) {
    state.stats[name].ruolo = nuovoRuolo;
    salvaStatoLocale();
    renderAll();
    showToast(`Ruolo di ${name} aggiornato`);
  }
}

// --- PIN MODAL ACTIONS ---
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

  const expectedPin = state.admin_pin || "1234";

  if (pin === expectedPin) {
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
  richiediPin("Elimina Collega", `Sei sicuro di voler eliminare definitivamente ${name} dal gruppo?`, () => {
    delete state.stats[name];
    delete state.partite_giocate_oggi[name];
    state.presenti = (state.presenti || []).filter(g => g !== name);
    salvaStatoLocale();
    renderAll();
    showToast(`${name} eliminato`);
  });
}

function confermaResetClassifica() {
  richiediPin("Azzera Classifica Gruppo", "Tutti i punteggi Elo torneranno a 1200 e le vittorie a 0.", () => {
    Object.keys(state.stats || {}).forEach(name => {
      state.stats[name].elo = 1200;
      state.stats[name].vinte = 0;
      state.stats[name].perse = 0;
    });

    state.storico_squadre_oggi = [];
    state.coppie_giocate_oggi = [];
    Object.keys(state.partite_giocate_oggi || {}).forEach(g => {
      state.partite_giocate_oggi[g] = 0;
    });

    salvaStatoLocale();
    renderAll();
    showToast("Classifica stagionale azzerata! Tutti a 1200 pt.");
  });
}

// --- MODAL CAMBIA / CREA GRUPPO ---
function apriModalCambiaGruppo() {
  document.getElementById('group-modal-code').value = CURRENT_GROUP_ID;
  document.getElementById('group-modal-name').value = state.group_name || '';
  document.getElementById('group-modal-pin').value = '';
  document.getElementById('group-modal').classList.remove('hidden');
}

function chiudiModalCambiaGruppo() {
  document.getElementById('group-modal').classList.add('hidden');
}

function confermaCambioGruppo() {
  const code = (document.getElementById('group-modal-code').value.trim() || 'phd-polimi').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const name = document.getElementById('group-modal-name').value.trim();
  const pin = document.getElementById('group-modal-pin').value.trim();

  if (!code) {
    showToast("Inserisci un codice valido!", "error");
    return;
  }

  // Se l'utente sta creando un nuovo gruppo con pin e nome
  if (pin) {
    localStorage.setItem(`pending_pin_${code}`, pin);
  }
  if (name) {
    localStorage.setItem(`pending_name_${code}`, name);
  }

  // Ricarica la pagina con il nuovo parametro group
  const newUrl = `${window.location.pathname}?group=${encodeURIComponent(code)}`;
  window.location.href = newUrl;
}

function copiaLinkGruppo() {
  const fullUrl = `${window.location.origin}${window.location.pathname}?group=${encodeURIComponent(CURRENT_GROUP_ID)}`;
  navigator.clipboard.writeText(fullUrl).then(() => {
    showToast("📋 Link copiato negli appunti! Condividilo con i colleghi.");
  }).catch(() => {
    prompt("Copia questo link:", fullUrl);
  });
}

// ==========================================
// SEZIONE 4: CLOUD SYNC MULTI-TENANT (SUPABASE)
// ==========================================
function initCloudLive() {
  pullFromCloud();

  setInterval(() => {
    if (!document.hidden) {
      pullFromCloud();
    }
  }, 8000);

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
      id: CURRENT_GROUP_ID,
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
    const endpoint = `${SUPABASE_URL}/rest/v1/calcetto_state?id=eq.${encodeURIComponent(CURRENT_GROUP_ID)}&select=data,updated_at`;
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
        if (!lastRemoteUpdatedAt || remote.updated_at !== lastRemoteUpdatedAt) {
          lastRemoteUpdatedAt = remote.updated_at;
          isSyncing = true;
          state = { ...state, ...remote.data };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          renderAll();
          isSyncing = false;
          if (showToastFeedback) {
            showToast("Dati sincronizzati con il Cloud!", "success");
          }
        } else if (showToastFeedback) {
          showToast("I dati sono già aggiornati!", "success");
        }
      } else {
        // Il gruppo non esiste ancora in Supabase: crealo!
        console.log(`Inizializzazione nuovo gruppo: ${CURRENT_GROUP_ID}`);
        const pendingPin = localStorage.getItem(`pending_pin_${CURRENT_GROUP_ID}`);
        const pendingName = localStorage.getItem(`pending_name_${CURRENT_GROUP_ID}`);
        if (pendingPin) state.admin_pin = pendingPin;
        if (pendingName) state.group_name = pendingName;

        // Se è phd-polimi ed è vuoto, importa i dati originali da 'global'
        if (CURRENT_GROUP_ID === 'phd-polimi') {
          await importaDaGruppoGlobal();
        } else {
          await pushToCloud();
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

async function importaDaGruppoGlobal() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/calcetto_state?id=eq.global&select=data`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (res.ok) {
      const rows = await res.json();
      if (rows && rows.length > 0 && rows[0].data) {
        state = { ...state, ...rows[0].data, group_name: "POLIMI PHD", admin_pin: "0000" };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        await pushToCloud();
        renderAll();
      }
    }
  } catch (e) {
    console.warn("Import global fallito:", e);
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

window.addEventListener('DOMContentLoaded', initApp);
