/**
 * CALCIO BALILLA - MULTI-TEAM & ELO ENGINE
 * Multi-tenant architecture: each group is completely isolated in Supabase.
 * Default group: 'global' (PhD PoliMi).
 */

// --- CONFIGURAZIONE GRUPPO & SUPABASE ---
const SUPABASE_URL = "https://zxdelivduwrbbthflqys.supabase.co";
const SUPABASE_KEY = "sb_publishable_UOTWumLKxj3hqJ2KMXDn6Q_IpQNdRxI";

// Rileva il gruppo dall'URL (?group=...) o usa il gruppo predefinito 'sigmalab'
const urlParams = new URLSearchParams(window.location.search);
let CURRENT_GROUP_ID = (urlParams.get('group') || 'sigmalab').toLowerCase().replace(/[^a-z0-9_-]/g, '');
if (!CURRENT_GROUP_ID) CURRENT_GROUP_ID = 'sigmalab';

const STORAGE_KEY = `calcetto_state_${CURRENT_GROUP_ID}`;

// Stato dell'applicazione
let state = {
  group_name: CURRENT_GROUP_ID.toUpperCase(),
  admin_pin: "1234",
  stats: {},
  presenti: [],
  storico_squadre_oggi: [],
  partite_giocate_oggi: {},
  coppie_giocate_oggi: [],
  storico_partite: []
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
  const displayName = state.group_name || (CURRENT_GROUP_ID === 'global' ? "POLIMI PHD" : CURRENT_GROUP_ID.toUpperCase());

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
// SEZIONE 1: GESTIONE PRESENZE & PARTITA
// ==========================================
function renderPartita() {
  renderPresentiPills();
  renderMatchesList();
  aggiornaDropdownManuali();
}

function renderPresentiPills() {
  const container = document.getElementById('presenti-pills-container');
  const countBadge = document.getElementById('count-presenti');
  container.innerHTML = '';

  const allNames = Object.keys(state.stats || {}).sort();
  countBadge.innerText = `${(state.presenti || []).length} presenti`;

  if (allNames.length === 0) {
    container.innerHTML = `
      <div class="w-full text-center py-4 text-xs text-slate-400">
        Nessun collega nel gruppo.<br>Vai nella scheda <b>Gestione</b> per aggiungerli!
      </div>
    `;
    return;
  }

  allNames.forEach(name => {
    const isSelected = (state.presenti || []).includes(name);
    const role = state.stats[name].ruolo || 'Indifferente';
    const numPartiteOggi = (state.partite_giocate_oggi || {})[name] || 0;

    let roleIcon = '⚽';
    if (role === 'Attaccante') roleIcon = '⚡';
    else if (role === 'Difesa') roleIcon = '🛡️';

    const pill = document.createElement('button');
    pill.type = 'button';
    pill.onclick = () => togglePresenza(name);
    pill.className = `px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 ${
      isSelected
        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-900/40 ring-1 ring-emerald-400'
        : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700 hover:text-white'
    }`;

    pill.innerHTML = `
      <span class="text-[11px] opacity-80">${roleIcon}</span>
      <span>${name}</span>
      ${numPartiteOggi > 0 ? `<span class="ml-1 text-[10px] px-1 rounded-full bg-black/25">${numPartiteOggi}</span>` : ''}
    `;

    container.appendChild(pill);
  });
}

function togglePresenza(name) {
  if (!state.presenti) state.presenti = [];
  const idx = state.presenti.indexOf(name);
  if (idx >= 0) {
    state.presenti.splice(idx, 1);
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
  showToast("⚽ Nuova partita generata!");
}

// --- CREAZIONE PARTITA MANUALE ---
function aggiornaDropdownManuali() {
  const selects = ['manual-sq1-p1', 'manual-sq1-p2', 'manual-sq2-p1', 'manual-sq2-p2'];
  const allNames = Object.keys(state.stats || {}).sort();

  selects.forEach((selId, index) => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">-- Seleziona --</option>';

    allNames.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = `${name} (${state.stats[name].ruolo || 'Indifferente'})`;
      sel.appendChild(opt);
    });

    if (currentVal && allNames.includes(currentVal)) {
      sel.value = currentVal;
    } else if (allNames[index]) {
      sel.value = allNames[index];
    }
  });
}

function creaPartitaManuale() {
  const p1 = document.getElementById('manual-sq1-p1').value;
  const p2 = document.getElementById('manual-sq1-p2').value;
  const p3 = document.getElementById('manual-sq2-p1').value;
  const p4 = document.getElementById('manual-sq2-p2').value;

  if (!p1 || !p2 || !p3 || !p4) {
    showToast("Seleziona tutti e 4 i giocatori!", "error");
    return;
  }

  const players = [p1, p2, p3, p4];
  const uniquePlayers = new Set(players);
  if (uniquePlayers.size !== 4) {
    showToast("Ogni giocatore può essere scelto una sola volta!", "error");
    return;
  }

  const nuovoMatch = {
    id: 'm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    sq1: [p1, p2],
    sq2: [p3, p4],
    risolta: false,
    vincitrice: null,
    manuale: true,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  if (!state.storico_squadre_oggi) state.storico_squadre_oggi = [];
  state.storico_squadre_oggi.unshift(nuovoMatch);

  if (!state.partite_giocate_oggi) state.partite_giocate_oggi = {};
  players.forEach(g => {
    state.partite_giocate_oggi[g] = (state.partite_giocate_oggi[g] || 0) + 1;
  });

  if (!state.coppie_giocate_oggi) state.coppie_giocate_oggi = [];
  state.coppie_giocate_oggi.push(pairKey(p1, p2));
  state.coppie_giocate_oggi.push(pairKey(p3, p4));

  salvaStatoLocale();
  renderPartita();
  showToast("⚔️ Sfida personalizzata aggiunta!");
}

// --- GESTIONE MATCH & ELO UPDATE ---
function renderMatchesList() {
  const container = document.getElementById('matches-container');
  const countBadge = document.getElementById('session-matches-count');
  const matches = state.storico_squadre_oggi || [];

  countBadge.innerText = `${matches.length} partite`;

  if (matches.length === 0) {
    container.innerHTML = `
      <div class="bg-slate-800/40 border border-slate-700/40 rounded-xl p-6 text-center text-slate-400 text-sm">
        Nessuna partita generata in questa sessione.<br>Seleziona almeno 4 colleghi e premi il tasto verde!
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  matches.forEach((m, idx) => {
    const eloSq1 = Math.round(((state.stats[m.sq1[0]]?.elo || 1200) + (state.stats[m.sq1[1]]?.elo || 1200)) / 2);
    const eloSq2 = Math.round(((state.stats[m.sq2[0]]?.elo || 1200) + (state.stats[m.sq2[1]]?.elo || 1200)) / 2);

    const matchCard = document.createElement('div');
    matchCard.className = `rounded-2xl border p-4 shadow-md transition ${
      !m.risolta
        ? 'bg-slate-800 border-slate-700 ring-1 ring-emerald-500/20'
        : 'bg-slate-900/60 border-slate-800 opacity-80'
    }`;

    matchCard.innerHTML = `
      <div class="flex items-center justify-between text-xs text-slate-400 mb-3 border-b border-slate-700/50 pb-2">
        <div class="flex items-center space-x-1.5">
          <span class="font-bold text-white">#${matches.length - idx}</span>
          ${m.manuale ? '<span class="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 rounded font-medium">Manuale</span>' : ''}
          <span>• ${m.timestamp || ''}</span>
        </div>
        ${m.risolta 
          ? `<span class="text-emerald-400 font-semibold flex items-center space-x-1">
               <span>✓ Risolta (${m.vincitrice === 1 ? 'Squadra 1' : 'Squadra 2'})</span>
             </span>`
          : '<span class="text-amber-400 font-semibold animate-pulse">In corso</span>'}
      </div>

      <!-- Teams Display -->
      <div class="grid grid-cols-2 gap-3 text-center my-2">
        <!-- Squadra 1 (Blu) -->
        <div class="bg-blue-950/30 border border-blue-500/20 rounded-xl p-3 flex flex-col justify-between ${m.vincitrice === 1 ? 'ring-2 ring-emerald-400 bg-emerald-950/30' : ''}">
          <div>
            <div class="text-[11px] font-bold text-blue-400 uppercase tracking-wider mb-1 flex items-center justify-center space-x-1">
              <span>🔵</span> <span>Squadra 1</span>
            </div>
            <div class="font-bold text-sm text-white">${m.sq1[0]}</div>
            <div class="font-bold text-sm text-white">${m.sq1[1]}</div>
          </div>
          <div class="text-[11px] text-slate-400 mt-2 pt-1 border-t border-blue-500/20">
            Elo Medio: <b class="text-blue-300">${eloSq1}</b>
          </div>
        </div>

        <!-- Squadra 2 (Rossa) -->
        <div class="bg-rose-950/30 border border-rose-500/20 rounded-xl p-3 flex flex-col justify-between ${m.vincitrice === 2 ? 'ring-2 ring-emerald-400 bg-emerald-950/30' : ''}">
          <div>
            <div class="text-[11px] font-bold text-rose-400 uppercase tracking-wider mb-1 flex items-center justify-center space-x-1">
              <span>🔴</span> <span>Squadra 2</span>
            </div>
            <div class="font-bold text-sm text-white">${m.sq2[0]}</div>
            <div class="font-bold text-sm text-white">${m.sq2[1]}</div>
          </div>
          <div class="text-[11px] text-slate-400 mt-2 pt-1 border-t border-rose-500/20">
            Elo Medio: <b class="text-rose-300">${eloSq2}</b>
          </div>
        </div>
      </div>

      <!-- Actions / Winner Selector -->
      ${!m.risolta ? `
        <div class="grid grid-cols-2 gap-2 mt-3 pt-2">
          <button onclick="registraVittoria('${m.id}', 1)" class="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition shadow flex items-center justify-center space-x-1">
            <span>🏆</span> <span>Vince Squadra 1</span>
          </button>
          <button onclick="registraVittoria('${m.id}', 2)" class="bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition shadow flex items-center justify-center space-x-1">
            <span>🏆</span> <span>Vince Squadra 2</span>
          </button>
        </div>
        <div class="mt-2 pt-1 flex justify-center">
          <button onclick="scartaPartita('${m.id}')" class="text-xs text-slate-400 hover:text-rose-400 font-medium py-1 px-3 rounded-lg hover:bg-rose-500/10 active:scale-95 transition flex items-center space-x-1">
            <span>❌</span> <span>Scarta partita</span>
          </button>
        </div>
      ` : `
        <div class="mt-2 pt-2 flex justify-end">
          <button onclick="annullaRisultatoMatch('${m.id}')" class="text-xs text-slate-500 hover:text-slate-300 underline transition">
            Elimina questa partita
          </button>
        </div>
      `}
    `;

    container.appendChild(matchCard);
  });
}

function scartaPartita(matchId) {
  const matchIndex = (state.storico_squadre_oggi || []).findIndex(m => m.id === matchId);
  if (matchIndex < 0) return;

  const match = state.storico_squadre_oggi[matchIndex];

  // Ripristina il contatore delle partite giocate oggi per i 4 giocatori
  const giocatori = [...(match.sq1 || []), ...(match.sq2 || [])];
  if (state.partite_giocate_oggi) {
    giocatori.forEach(g => {
      if (state.partite_giocate_oggi[g] && state.partite_giocate_oggi[g] > 0) {
        state.partite_giocate_oggi[g] -= 1;
      }
    });
  }

  // Rimuovi le coppie dalla memoria delle coppie giocate oggi
  if (state.coppie_giocate_oggi && match.sq1 && match.sq2) {
    const pair1 = pairKey(match.sq1[0], match.sq1[1]);
    const pair2 = pairKey(match.sq2[0], match.sq2[1]);
    state.coppie_giocate_oggi = state.coppie_giocate_oggi.filter(k => k !== pair1 && k !== pair2);
  }

  // Rimuovi la partita dallo storico odierno
  state.storico_squadre_oggi.splice(matchIndex, 1);

  salvaStatoLocale();
  renderAll();
  showToast("❌ Partita scartata! Contatori ripristinati.");
}

function calcolaNuovoEloCoppie(squadraVincente, squadraPerdente, K = 40) {
  const eloA = (state.stats[squadraVincente[0]].elo + state.stats[squadraVincente[1]].elo) / 2;
  const eloB = (state.stats[squadraPerdente[0]].elo + state.stats[squadraPerdente[1]].elo) / 2;

  const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  const expectedB = 1 / (1 + Math.pow(10, (eloA - eloB) / 400));

  const deltaA = K * (1 - expectedA);
  const deltaB = K * (0 - expectedB);

  return { deltaA, deltaB };
}

function registraVittoria(matchId, vincitriceNum) {
  const match = (state.storico_squadre_oggi || []).find(m => m.id === matchId);
  if (!match || match.risolta) return;

  const sqVincente = vincitriceNum === 1 ? match.sq1 : match.sq2;
  const sqPerdente = vincitriceNum === 1 ? match.sq2 : match.sq1;

  const { deltaA, deltaB } = calcolaNuovoEloCoppie(sqVincente, sqPerdente, 40);

  sqVincente.forEach(name => {
    state.stats[name].vinte = (state.stats[name].vinte || 0) + 1;
    state.stats[name].elo = (state.stats[name].elo || 1200) + deltaA;
  });

  sqPerdente.forEach(name => {
    state.stats[name].perse = (state.stats[name].perse || 0) + 1;
    state.stats[name].elo = Math.max(100, (state.stats[name].elo || 1200) + deltaB);
  });

  match.risolta = true;
  match.vincitrice = vincitriceNum;
  match.deltaElo = Math.round(deltaA);

  if (!state.storico_partite) state.storico_partite = [];
  if (!state.storico_partite.some(p => p.id === match.id)) {
    state.storico_partite.unshift({
      id: match.id,
      timestamp: Date.now(),
      data: new Date().toLocaleDateString('it-IT'),
      ora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      sq1: [...match.sq1],
      sq2: [...match.sq2],
      vincitrice: vincitriceNum,
      deltaElo: Math.round(deltaA)
    });
  }

  salvaStatoLocale();
  renderAll();
  showToast(`🏆 Vittoria registrata! (+${Math.round(deltaA)} Elo per i vincitori)`);
}

function annullaRisultatoMatch(matchId) {
  const idx = (state.storico_squadre_oggi || []).findIndex(m => m.id === matchId);
  if (idx >= 0) {
    state.storico_squadre_oggi.splice(idx, 1);
  }
  if (state.storico_partite) {
    const pIdx = state.storico_partite.findIndex(p => p.id === matchId);
    if (pIdx >= 0) state.storico_partite.splice(pIdx, 1);
  }
  salvaStatoLocale();
  renderAll();
  showToast("Partita rimossa dallo storico");
}

function confermaAzzeraSessione() {
  if (confirm("Vuoi azzerare il contatore delle partite e la rotazione di oggi?")) {
    state.storico_squadre_oggi = [];
    state.partite_giocate_oggi = {};
    state.coppie_giocate_oggi = [];
    salvaStatoLocale();
    renderAll();
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
// SEZIONE 3: GESTIONE GIOCATORI & SICUREZZA PIN
// ==========================================
function renderGestione() {
  aggiornaHeaderGruppo();
  const container = document.getElementById('gestione-players-list');
  const countBadge = document.getElementById('total-registered-badge');
  const matchesBadge = document.getElementById('total-matches-badge');
  const allNames = Object.keys(state.stats || {}).sort();

  countBadge.innerText = `${allNames.length} colleghi`;
  if (matchesBadge) {
    matchesBadge.innerText = `${(state.storico_partite || []).length} partite archiviate`;
  }
  container.innerHTML = '';

  if (allNames.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-400 text-center py-4">Nessun collega presente in questo gruppo.</div>';
    return;
  }

  allNames.forEach(name => {
    const s = state.stats[name];
    const item = document.createElement('div');
    item.className = "flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-700/60";

    item.innerHTML = `
      <div class="flex items-center space-x-2">
        <span class="font-bold text-sm text-white">${name}</span>
        <span class="text-xs text-emerald-400 font-mono">(${Math.round(s.elo || 1200)} pt)</span>
      </div>
      <div class="flex items-center space-x-2">
        <select onchange="aggiornaRuoloGiocatore('${name}', this.value)" class="text-xs bg-slate-800 border border-slate-700 rounded-lg p-1 text-slate-300 focus:outline-none focus:border-emerald-500">
          <option value="Indifferente" ${s.ruolo === 'Indifferente' ? 'selected' : ''}>Indifferente</option>
          <option value="Attaccante" ${s.ruolo === 'Attaccante' ? 'selected' : ''}>Attaccante</option>
          <option value="Difesa" ${s.ruolo === 'Difesa' ? 'selected' : ''}>Difesa</option>
        </select>
        <button onclick="richiediEliminazioneGiocatore('${name}')" title="Elimina giocatore" class="p-1 rounded-lg text-rose-400 hover:text-white hover:bg-rose-500/20 active:scale-95 transition">
          🗑️
        </button>
      </div>
    `;

    container.appendChild(item);
  });
}

function handleAggiungiGiocatore(e) {
  e.preventDefault();
  const input = document.getElementById('input-new-name');
  const roleSelect = document.getElementById('select-new-role');
  const name = input.value.trim();
  const role = roleSelect.value;

  if (!name) return;

  if (state.stats && state.stats[name]) {
    showToast(`Il collega ${name} è già registrato!`, "error");
    return;
  }

  if (!state.stats) state.stats = {};
  state.stats[name] = {
    elo: 1200,
    vinte: 0,
    perse: 0,
    ruolo: role
  };

  input.value = '';
  salvaStatoLocale();
  renderAll();
  showToast(`✅ ${name} aggiunto con successo!`);
}

function aggiornaRuoloGiocatore(name, newRole) {
  if (state.stats && state.stats[name]) {
    state.stats[name].ruolo = newRole;
    salvaStatoLocale();
    renderAll();
    showToast(`Ruolo di ${name} aggiornato`);
  }
}

// --- MODAL PIN SICUREZZA ---
function richiediPin(titolo, desc, callback) {
  pendingPinAction = callback;
  document.getElementById('pin-modal-title').innerText = titolo || "PIN Amministratore";
  document.getElementById('pin-modal-desc').innerText = desc || "Inserisci il PIN per confermare l'operazione:";
  const input = document.getElementById('pin-modal-input');
  input.value = '';
  document.getElementById('pin-modal-error').classList.add('hidden');
  document.getElementById('pin-modal').classList.remove('hidden');
  setTimeout(() => input.focus(), 100);
}

function chiudiPinModal() {
  document.getElementById('pin-modal').classList.add('hidden');
  pendingPinAction = null;
}

function confermaPinModal() {
  const pinInserito = document.getElementById('pin-modal-input').value.trim();
  const pinCorretto = state.admin_pin || (CURRENT_GROUP_ID === 'global' ? "0000" : "1234");

  if (pinInserito === pinCorretto) {
    document.getElementById('pin-modal').classList.add('hidden');
    if (typeof pendingPinAction === 'function') {
      const action = pendingPinAction;
      pendingPinAction = null;
      action();
    }
  } else {
    document.getElementById('pin-modal-error').classList.remove('hidden');
  }
}

function richiediEliminazioneGiocatore(name) {
  richiediPin(
    "Elimina Giocatore",
    `Inserisci il PIN per eliminare definitivamente ${name}:`,
    () => {
      delete state.stats[name];
      state.presenti = (state.presenti || []).filter(g => g !== name);
      salvaStatoLocale();
      renderAll();
      showToast(`🗑️ ${name} eliminato`);
    }
  );
}

function confermaResetClassifica() {
  richiediPin(
    "Azzera Stagione",
    "Stai per azzerare tutti i punti Elo del gruppo a 1200. Inserisci il PIN:",
    () => {
      Object.keys(state.stats || {}).forEach(name => {
        state.stats[name].vinte = 0;
        state.stats[name].perse = 0;
        state.stats[name].elo = 1200;
      });
      state.storico_squadre_oggi = [];
      state.partite_giocate_oggi = {};
      state.coppie_giocate_oggi = [];

      salvaStatoLocale();
      renderAll();
      showToast("🏆 Classifica del gruppo azzerata a 1200 pt!");
    }
  );
}

function copiaLinkGruppo() {
  const fullUrl = window.location.href;
  navigator.clipboard.writeText(fullUrl).then(() => {
    showToast("📋 Link copiato! Condividilo con i colleghi del team.");
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
          if (!state.group_name) {
            state.group_name = CURRENT_GROUP_ID === 'global' ? "POLIMI PHD" : CURRENT_GROUP_ID.toUpperCase();
          }
          if (!state.admin_pin) {
            state.admin_pin = CURRENT_GROUP_ID === 'global' ? "0000" : "1234";
          }
          if (!state.storico_partite) state.storico_partite = [];
          if (state.storico_squadre_oggi && state.storico_squadre_oggi.length > 0) {
            let backfilled = false;
            state.storico_squadre_oggi.forEach(m => {
              if (m.risolta && !state.storico_partite.some(p => p.id === m.id)) {
                state.storico_partite.push({
                  id: m.id,
                  timestamp: Date.now(),
                  data: new Date().toLocaleDateString('it-IT'),
                  ora: m.timestamp || '13:00',
                  sq1: [...m.sq1],
                  sq2: [...m.sq2],
                  vincitrice: m.vincitrice,
                  deltaElo: m.deltaElo || 20
                });
                backfilled = true;
              }
            });
            if (backfilled) {
              pushToCloud();
            }
          }
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
        if (CURRENT_GROUP_ID === 'global') {
          await pushToCloud();
        } else {
          const headerEl = document.getElementById('header-group-name');
          if (headerEl) headerEl.innerText = "Team Non Trovato";
          showToast("⚠️ Questo gruppo non esiste! Chiedi all'amministratore di crearlo.", "error");
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

// ==========================================
// SEZIONE 5: ANALISI PARTITE & RIVALITÀ
// ==========================================
function analizzaStatisticheGiocatore(nome) {
  const partite = state.storico_partite || [];
  const compagni = {};
  const avversari = {};
  let totaliG = 0;
  let vinteG = 0;
  let perseG = 0;

  partite.forEach(p => {
    const inSq1 = (p.sq1 || []).includes(nome);
    const inSq2 = (p.sq2 || []).includes(nome);
    if (!inSq1 && !inSq2) return;

    totaliG++;
    const miaSq = inSq1 ? 1 : 2;
    const hoVinto = p.vincitrice === miaSq;
    if (hoVinto) vinteG++; else perseG++;

    const compagniMatch = (inSq1 ? p.sq1 : p.sq2).filter(g => g !== nome);
    const avversariMatch = inSq1 ? p.sq2 : p.sq1;

    compagniMatch.forEach(c => {
      if (!compagni[c]) compagni[c] = { giocate: 0, vinte: 0, perse: 0 };
      compagni[c].giocate++;
      if (hoVinto) compagni[c].vinte++; else compagni[c].perse++;
    });

    avversariMatch.forEach(a => {
      if (!avversari[a]) avversari[a] = { giocate: 0, vinte: 0, perse: 0 };
      avversari[a].giocate++;
      if (hoVinto) avversari[a].vinte++; else avversari[a].perse++;
    });
  });

  const listCompagni = Object.entries(compagni).map(([n, d]) => ({
    nome: n,
    ...d,
    winRate: (d.vinte / d.giocate) * 100
  })).sort((a, b) => b.winRate - a.winRate || b.vinte - a.vinte);

  const listAvversari = Object.entries(avversari).map(([n, d]) => ({
    nome: n,
    ...d,
    winRate: (d.vinte / d.giocate) * 100
  }));

  const bestiaNera = [...listAvversari].sort((a, b) => b.perse - a.perse || a.winRate - b.winRate)[0] || null;
  const vittimaPreferita = [...listAvversari].sort((a, b) => b.vinte - a.vinte || b.winRate - a.winRate)[0] || null;

  return {
    totali: totaliG,
    vinte: vinteG,
    perse: perseG,
    winRate: totaliG > 0 ? (vinteG / totaliG) * 100 : 0,
    migliorPartner: listCompagni.length > 0 ? listCompagni[0] : null,
    bestiaNera: (bestiaNera && bestiaNera.perse > 0) ? bestiaNera : null,
    vittimaPreferita: (vittimaPreferita && vittimaPreferita.vinte > 0) ? vittimaPreferita : null,
    tuttiCompagni: listCompagni,
    tuttiAvversari: listAvversari
  };
}

function apriDettaglioGiocatore(nome) {
  const p = state.stats && state.stats[nome];
  if (!p) return;

  const modal = document.getElementById('player-modal');
  if (!modal) return;

  const role = p.ruolo || 'Indifferente';
  let avatar = '⚽';
  if (role === 'Attaccante') avatar = '⚡';
  else if (role === 'Difesa') avatar = '🛡️';

  document.getElementById('pm-avatar').innerText = avatar;
  document.getElementById('pm-nome').innerText = nome;
  document.getElementById('pm-ruolo').innerText = role;
  document.getElementById('pm-elo').innerText = `${Math.round(p.elo || 1200)} pt`;

  const totali = (p.vinte || 0) + (p.perse || 0);
  const winRate = totali > 0 ? ((p.vinte || 0) / totali) * 100 : 0;
  document.getElementById('pm-giocate').innerText = totali;
  document.getElementById('pm-vp').innerText = `${p.vinte || 0} / ${p.perse || 0}`;
  document.getElementById('pm-winrate').innerText = `${winRate.toFixed(0)}%`;

  const stats = analizzaStatisticheGiocatore(nome);

  // Partner ideale
  if (stats.migliorPartner) {
    document.getElementById('pm-partner-nome').innerText = stats.migliorPartner.nome;
    document.getElementById('pm-partner-stats').innerText = `${stats.migliorPartner.winRate.toFixed(0)}% WR (${stats.migliorPartner.vinte}V / ${stats.migliorPartner.giocate}G)`;
  } else {
    document.getElementById('pm-partner-nome').innerText = "Nessuno ancora";
    document.getElementById('pm-partner-stats').innerText = "";
  }

  // Bestia Nera
  if (stats.bestiaNera) {
    document.getElementById('pm-nemesi-nome').innerText = stats.bestiaNera.nome;
    document.getElementById('pm-nemesi-stats').innerText = `${stats.bestiaNera.perse} sconfitte su ${stats.bestiaNera.giocate}`;
  } else {
    document.getElementById('pm-nemesi-nome').innerText = "Nessuna ancora";
    document.getElementById('pm-nemesi-stats').innerText = "";
  }

  // Vittima Preferita
  if (stats.vittimaPreferita) {
    document.getElementById('pm-vittima-nome').innerText = stats.vittimaPreferita.nome;
    document.getElementById('pm-vittima-stats').innerText = `${stats.vittimaPreferita.vinte} vittorie su ${stats.vittimaPreferita.giocate}`;
  } else {
    document.getElementById('pm-vittima-nome').innerText = "Nessuna ancora";
    document.getElementById('pm-vittima-stats').innerText = "";
  }

  // Breakdown compagni & avversari
  const breakdownContainer = document.getElementById('pm-breakdown-list');
  breakdownContainer.innerHTML = '';

  if (stats.tuttiCompagni.length === 0 && stats.tuttiAvversari.length === 0) {
    breakdownContainer.innerHTML = '<p class="text-slate-400 text-center py-2">Nessun match ancora archiviato per questo giocatore.</p>';
  } else {
    if (stats.tuttiCompagni.length > 0) {
      breakdownContainer.innerHTML += '<div class="font-bold text-emerald-400 mb-1">In Coppia Con:</div>';
      stats.tuttiCompagni.forEach(c => {
        breakdownContainer.innerHTML += `
          <div class="flex justify-between items-center py-1 border-b border-slate-800/80">
            <span class="text-white font-medium">${c.nome}</span>
            <span class="text-slate-400">${c.vinte}V - ${c.perse}P (${c.winRate.toFixed(0)}%)</span>
          </div>
        `;
      });
    }

    if (stats.tuttiAvversari.length > 0) {
      breakdownContainer.innerHTML += '<div class="font-bold text-rose-400 mt-2.5 mb-1">Da Avversario Contro:</div>';
      stats.tuttiAvversari.forEach(a => {
        breakdownContainer.innerHTML += `
          <div class="flex justify-between items-center py-1 border-b border-slate-800/80">
            <span class="text-white font-medium">${a.nome}</span>
            <span class="text-slate-400">${a.vinte}V - ${a.perse}P (${a.winRate.toFixed(0)}% mie vittorie)</span>
          </div>
        `;
      });
    }
  }

  modal.classList.remove('hidden');
}

function chiudiDettaglioGiocatore() {
  const modal = document.getElementById('player-modal');
  if (modal) modal.classList.add('hidden');
}

function esportaStoricoCSV() {
  const partite = state.storico_partite || [];
  if (partite.length === 0) {
    showToast("Nessuna partita archiviata da esportare!", "error");
    return;
  }

  let csv = "ID,Data,Ora,Squadra1_G1,Squadra1_G2,Squadra2_G1,Squadra2_G2,Squadra_Vincente,Delta_Elo\n";
  partite.forEach(p => {
    const s1g1 = (p.sq1 && p.sq1[0]) || "";
    const s1g2 = (p.sq1 && p.sq1[1]) || "";
    const s2g1 = (p.sq2 && p.sq2[0]) || "";
    const s2g2 = (p.sq2 && p.sq2[1]) || "";
    const vinc = p.vincitrice === 1 ? "Squadra 1" : "Squadra 2";
    csv += `"${p.id}","${p.data || ''}","${p.ora || ''}","${s1g1}","${s1g2}","${s2g1}","${s2g2}","${vinc}",${p.deltaElo || 0}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `calcetto_${CURRENT_GROUP_ID}_storico_partite.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("📥 Archivio CSV scaricato con successo!");
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
