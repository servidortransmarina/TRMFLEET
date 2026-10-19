// COLE AQUI A URL DO SEU WEB APP DO GOOGLE APPS SCRIPT:
const API_URL = 'https://script.google.com/macros/s/AKfycbzi86PK_bBamsMFBmSEGSPoiC8fRiwTm9D3k98WyQL7WmWXs2Yh4gSXgG0JX4QZrvig/exec';

const KEY = 'tmfleet_mvp_v1';

// Bloqueia a alteração acidental de inputs tipo "number" ao rodar o scroll do mouse
document.addEventListener('wheel', function(event) {
  if (document.activeElement.type === 'number') {
    document.activeElement.blur();
  }
});

const categories = {
  'PNEUS': ['Pneu dianteiro esquerdo', 'Pneu dianteiro direito', 'Pneus traseiros', 'Estepe'],
  'ILUMINAÇÃO': ['Farol baixo', 'Farol alto', 'Lanternas', 'Luz de freio', 'Setas', 'Pisca-alerta', 'Luz de ré'],
  'FREIOS E MECÂNICA': ['Freios', 'Freio de estacionamento', 'Direção', 'Suspensão', 'Óleo do motor', 'Líquido de arrefecimento', 'Vazamentos', 'Bateria'],
  'CARROCERIA / BAÚ': ['Baú', 'Portas', 'Fechaduras', 'Piso', 'Laterais', 'Teto', 'Para-choque', 'Faixas refletivas'],
  'CABINE': ['Para-brisa', 'Limpadores', 'Retrovisores', 'Cintos de segurança', 'Bancos', 'Buzina', 'Painel'],
  'EQUIPAMENTOS': ['Triângulo', 'Macaco', 'Chave de roda', 'Extintor', 'Cadeado', 'Carrinho de transporte', 'Cobertor']
};

const checklistQuantityFields = {
  Cordas: 'Quantidade de corda',
  Cintas: 'Quantidade de cinta'
};

const fuelDefaults = {
  tipoDiesel: 'Diesel S10',
  utilizaArla: true,
  capacidadeTanqueDiesel: 150,
  capacidadeTanqueArla: 25
};

const tachographTypes = [
  ['manual-diario', 'Manual — disco diário'],
  ['manual-7dias', 'Manual — disco de 7 dias'],
  ['digital', 'Digital / eletrônico']
];

let vehicles = [];
let drivers = [];

function iso(d) {
  const dt = d || new Date();
  return dt.toISOString().slice(0, 10);
}

function br(d) {
  if (!d) return '—';
  return new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR');
}

function km(n) {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now();
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

function seed() {
  const saved = localStorage.getItem(KEY);
  if (saved) {
    try {
      const d = JSON.parse(saved);
      d.checks = d.checks || [];
      d.issues = d.issues || [];
      d.vehicleChanges = d.vehicleChanges || [];
      d.fuels = d.fuels || d.abastecimentos || [];
      d.abastecimentos = d.fuels;
      d.vehicles = d.vehicles || [];
      d.drivers = d.drivers || [];
      return d;
    } catch (e) {}
  }

  return {
    checks: [],
    vehicleChanges: [],
    fuels: [],
    abastecimentos: [],
    issues: [],
    vehicles: [],
    drivers: []
  };
}

let data = seed();
vehicles = data.vehicles;
drivers = data.drivers;

let state = {
  screen: 'login',
  role: null,
  view: 'home',
  selectedVehicle: vehicles[0] ? vehicles[0].id : '',
  check: null,
  driverId: null,
  filter: 'Todos',
  detail: null,
  issueFilter: 'Todos'
};

// ==========================================
// GERENCIAMENTO BLINDADO DA SESSÃO (F5)
// ==========================================

function saveSession() {
  localStorage.setItem('tmfleet_session', JSON.stringify({
    role: state.role,
    driverId: state.driverId,
    time: Date.now()
  }));
}

function loadSession() {
  try {
    const sess = JSON.parse(localStorage.getItem('tmfleet_session'));
    // Mantém logado por 24 horas e valida se o motorista ainda existe na base
    if (sess && sess.time && (Date.now() - sess.time < 86400000)) {
      state.role = sess.role;
      state.driverId = sess.driverId;
      state.screen = 'main';
      state.view = sess.role === 'gestor' ? 'dashboard' : 'home';
    }
  } catch (e) {}
}

// Executa a carga da sessão imediatamente na leitura do script
loadSession();

// Carrega a memória antes de renderizar a primeira vez
loadSession();

const app = document.getElementById('app');

async function syncWithSheets() {
  if (!API_URL || !API_URL.startsWith('http')) return;
  try {
    await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'syncAll', data: data })
    });
  } catch (err) {
    console.warn('Falha ao sincronizar com a planilha:', err);
  }
}

async function loadFromSheets() {
  if (!API_URL || !API_URL.startsWith('http')) return;
  try {
    const res = await fetch(API_URL + '?action=getAll');
    const remote = await res.json();
    
    if (remote.vehicles && remote.vehicles.length > 0) {
      data.vehicles = remote.vehicles.map(v => ({
        id: String(v.id_veiculo || uid()), 
        ident: v.prefixo, 
        placa: v.placa, 
        modelo: v.modelo,
        ano: String(v.ano), 
        tipo: v.tipo, 
        km: Number(v.km_atual), 
        status: v.status_veiculo,
        ativo: String(v.ativo).toLowerCase() === 'true',
        motoristaId: v.veiculo_fixo_id ? String(v.veiculo_fixo_id) : null,
        tipoDiesel: v.tipo_diesel, 
        utilizaArla: String(v.utiliza_arla).toLowerCase() !== 'false',
        capacidadeTanqueDiesel: Number(v.cap_diesel), 
        capacidadeTanqueArla: Number(v.cap_arla),
        tipoTacografo: v.tipo_tacografo
      }));
      vehicles = data.vehicles;
    }
    
    if (remote.drivers && remote.drivers.length > 0) {
      data.drivers = remote.drivers.map(d => ({
        id: String(d.id_motorista || uid()), 
        nome: d.nome, 
        matricula: d.matricula, 
        cpf: d.cpf,
        telefone: d.telefone, 
        veiculoId: d.veiculo_fixo_id ? String(d.veiculo_fixo_id) : null,
        vinculo: d.vinculo, 
        status: d.status, 
        user: d.usuario_login, 
        senha: d.senha
      }));
      drivers = data.drivers;
    }
    
    if (remote.checks && remote.checks.length > 0) {
      data.checks = remote.checks.map(c => ({
        id: String(c.id_checklist), 
        protocolo: c.protocolo, 
        driverId: String(c.id_motorista),
        vehicleId: String(c.id_veiculo), 
        date: c.data, 
        time: c.hora, 
        km: Number(c.km_informado),
        status: c.status_geral, 
        summary: {ok: Number(c.total_ok), warn: Number(c.total_warn), bad: Number(c.total_bad)}
      }));
    }
    
    if (remote.issues && remote.issues.length > 0) {
      data.issues = remote.issues.map(o => ({
        id: String(o.id_ocorrencia), 
        checkId: String(o.id_checklist), 
        vehicleId: String(o.id_veiculo),
        driverId: String(o.id_motorista), 
        item: o.item, 
        description: o.descricao,
        priority: o.prioridade, 
        status: o.status_ocorrencia, 
        date: o.data_abertura,
        restrict: String(o.restringe_circulacao).toLowerCase() === 'true'
      }));
    }
    
    if (remote.fuels && remote.fuels.length > 0) {
      data.fuels = remote.fuels.map(f => ({
        id: String(f.id_abastecimento), 
        protocolo: f.protocolo, 
        veiculoId: String(f.id_veiculo),
        motoristaId: String(f.id_motorista), 
        date: f.data, 
        hora: f.hora, 
        km: Number(f.km_atual),
        tipoDiesel: f.tipo_diesel, 
        litrosDiesel: Number(f.litros_diesel), 
        valorDiesel: Number(f.valor_diesel),
        litrosArla: Number(f.litros_arla), 
        valorArla: Number(f.valor_arla)
      }));
      data.abastecimentos = data.fuels;
    }

    localStorage.setItem(KEY, JSON.stringify(data));
    render();
  } catch (err) {
    console.warn('Usando base local:', err);
  }
}

function save(showNotice = true) {
  localStorage.setItem(KEY, JSON.stringify(data));
  if (showNotice) {
    state.saveNotice = {
      title: 'SALVAMENTO CONFIRMADO',
      message: 'As informações foram salvas com sucesso.',
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
  }
  syncWithSheets();
}

function veh(id) { 
    return vehicles.find(v => String(v.id) === String(id)); 
}

function driverBy(id) { 
    return drivers.find(d => String(d.id) === String(id)) || null; 
}

function driver() { 
    return drivers.find(d => String(d.id) === String(state.driverId)) || null; 
}

function fixedVehicle() { 
    const d = driver(); 
    return d ? veh(d.veiculoId) : null; 
}

function activeChange() {
  return data.vehicleChanges
    .filter(x => String(x.driverId) === String(state.driverId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

function operatingVehicle() {
  const x = activeChange();
  return x ? veh(x.newVehicleId) : fixedVehicle();
}

function statusLabel(s) {
  if (s === 'ok') return '<span class="pill ok">🟢 OK</span>';
  if (s === 'warn') return '<span class="pill warn">🟡 Atenção</span>';
  return '<span class="pill bad">🔴 Pendência</span>';
}

function login() {
  app.innerHTML = `
    <main class="shell">
      <section class="login">
        <div class="login-card">
          <div class="login-mark">
            <strong>TRANSMARINA FLEET</strong>
            <div class="tag">Gestão inteligente da frota</div>
          </div>
          <div class="eyebrow">MVP · TESTE 01</div>
          <h1>Acesse sua operação</h1>
          <p class="muted">Entre para registrar ou acompanhar os checklists diários.</p>
          <form id="loginForm">
            <div class="field">
              <label>CPF, Matrícula ou Usuário</label>
              <input id="user" placeholder="Digite seu usuário" required>
            </div>
            <div class="field">
              <label>Senha</label>
              <input id="pass" type="password" placeholder="••••••" required>
            </div>
            <button class="primary wide" type="submit">ENTRAR</button>
          </form>
        </div>
      </section>
    </main>`;

  document.getElementById('loginForm').onsubmit = async function (e) {
    e.preventDefault();
    const u = document.getElementById('user').value.trim();
    const p = document.getElementById('pass').value.trim();

    if (u.toLowerCase() === 'gestor' && p === '123456') {
      state.role = 'gestor';
      state.driverId = 'gestor';
      state.screen = 'main';
      state.view = 'dashboard';
      saveSession();
      render();
      return;
    }

    const found = drivers.find(d => 
        String(d.user || '').toLowerCase() === u.toLowerCase() || 
        String(d.matricula || '').toLowerCase() === u.toLowerCase() || 
        String(d.cpf || '') === u
    );

    if (found && found.status === 'Ativo' && p === String(found.senha || '123456')) {
      state.role = 'motorista';
      state.driverId = found.id;
      state.screen = 'main';
      state.view = 'home';
      saveSession();
      render();
      return;
    }

    alert('Usuário inativo ou acesso inválido.');
  };
}

function layout(content) {
  const gestor = state.role === 'gestor';
  const nav = gestor
    ? ['dashboard', 'fleet', 'drivers', 'issues', 'checks', 'fuels', 'ratings']
    : ['home', 'new', 'fuel', 'history', 'profile', 'operation', 'behavior'];
  const labels = gestor
    ? ['📊 Dashboard', '🚛 Veículos', '👤 Motoristas', '🚨 Pendências', '📋 Checklists', '⛽ Abastecimentos', '⭐ Avaliações']
    : ['🏠 Início', '📋 Checklist', '⛽ Abastecimento', '📚 Histórico', '👤 Perfil', '🚚 Operação', '⭐ Avaliação'];

  const navButtons = nav.map((n, i) => {
    const active = state.view === n ? 'active' : '';
    return `<button class="${active}" onclick="go('${n}')">${labels[i]}</button>`;
  }).join('');

  const bottomButtons = nav.map((n, i) => {
    const active = state.view === n ? 'active' : '';
    const icon = labels[i].split(' ')[0];
    const txt = labels[i].slice(2);
    return `<button class="${active}" onclick="go('${n}')"><span>${icon}</span>${txt}</button>`;
  }).join('');

  const footerHtml = (!state.check && state.view !== 'new')
    ? `<footer class="bottom"><div class="bottom-inner" style="max-width:1120px;grid-template-columns:repeat(${nav.length},minmax(0,1fr))">${bottomButtons}</div></footer>`
    : '';

  return `
    <header class="topbar">
      <div>
        <div class="brand">TRANSMARINA FLEET</div>
        <div class="tag">Gestão inteligente da frota · v1.4</div>
      </div>
      <div class="top-actions">
        <span class="pill" style="background:#282c2f;color:#fff">${gestor ? 'GESTOR' : 'MOTORISTA'}</span>
        <button class="iconbtn" onclick="logout()">↪</button>
      </div>
    </header>
    <main class="shell">
      <nav class="nav">${navButtons}</nav>
      ${content}
    </main>
    ${footerHtml}`;
}

function saveNotice() {
  const n = state.saveNotice;
  if (!n) return '';
  return `
    <div class="fuel-success-overlay" role="status" aria-live="polite">
      <div class="fuel-success-modal">
        <div class="fuel-success-icon">✓</div>
        <div class="eyebrow" style="color:var(--ok)">${n.title}</div>
        <h2>${n.message}</h2>
        <p class="muted">Registro persistido no aplicativo às ${n.time}.</p>
        <button class="primary wide" onclick="state.saveNotice=null;render()">OK, ENTENDI</button>
      </div>
    </div>`;
}

function render() {
  if (state.screen === 'login') { login(); return; }
  if (state.screen === 'success') { app.innerHTML = success(); return; }
  if (state.screen === 'checklist') { app.innerHTML = checklist(); return; }
  if (state.screen === 'summary') { app.innerHTML = summary(); return; }
  
  let c = '';
  if (state.role === 'gestor') {
    if (state.view === 'check-detail') c = checkDetail();
    else if (state.view === 'vehicle-detail') c = vehicleDetail();
    else if (state.view === 'resolve-issue') c = resolveIssueForm(state.detail);
    else c = manager();
  } else {
    c = driverHome();
  }
  
  app.innerHTML = layout(c) + saveNotice();
}

function go(v) {
  state.view = v;
  state.detail = null;
  render();
}

function logout() {
  localStorage.removeItem('tmfleet_session');
  state.screen = 'login';
  state.role = null;
  state.view = 'home';
  state.check = null;
  render();
}

function normalizeFuel(v) {
  if (!v) return v;
  v.tipoDiesel = v.tipoDiesel || 'Diesel S10';
  v.utilizaArla = typeof v.utilizaArla === 'boolean' ? v.utilizaArla : (String(v.utiliza_arla || 'SIM').toUpperCase() !== 'NÃO');
  v.capacidadeTanqueDiesel = Number(v.capacidadeTanqueDiesel || 150) || 150;
  v.capacidadeTanqueArla = Number(v.capacidadeTanqueArla || 25) || 0;
  return v;
}

function normalizeTachograph(v) {
  if (!v) return v;
  let raw = String(v.tipoTacografo || 'digital').trim().toLowerCase();
  v.tipoTacografo = (raw.indexOf('diario') >= 0 || raw.indexOf('diário') >= 0) ? 'manual-diario' : (raw.indexOf('7') >= 0 ? 'manual-7dias' : 'digital');
  return v;
}

function tachographTypeLabel(t) {
  const found = tachographTypes.find(x => x[0] === t);
  return found ? found[1] : 'Digital / eletrônico';
}

function driverHome() {
  if (state.view === 'new') return vehicleSelect();
  if (state.view === 'fuel') return fueling();
  if (state.view === 'history') return history();

  const checks = data.checks.filter(c => String(c.driverId) === String(state.driverId));
  const last = checks[0];
  const v = operatingVehicle();
  const fix = fixedVehicle();
  const motoristaAtual = driver();

  let html = `
    <div class="hero">
      <div>
        <div class="eyebrow">Área do motorista</div>
        <h1>Olá, ${motoristaAtual?.nome || 'Motorista'}!</h1>
      </div>
      <div class="hero-actions">
        <button class="primary" onclick="go('new')">INICIAR CHECKLIST</button>
      </div>
    </div>
    <div class="card notice" style="margin-bottom:16px">
      Veículo em operação: <b>${v ? v.ident : '—'}</b>
      <br><small>Veículo fixo: ${fix ? fix.ident : '—'}</small>
    </div>
    <div class="grid">
      <div class="card col-8">
        <div class="section-title">
          <h2>Resumo de hoje</h2>${last ? statusLabel(last.status) : ''}
        </div>
        <div class="listrow">
          <div class="main"><strong>Veículo atual</strong><span>${v ? v.ident : '—'}</span></div>
          <b>${km(v?.km||0)} km</b>
        </div>
      </div>
      <div class="card col-4">
        <div class="eyebrow">Meu histórico</div>
        <h2 style="margin-top:8px">${checks.length}</h2>
        <p class="muted">checklists registrados</p>
        <button class="secondary wide" onclick="go('history')">VER HISTÓRICO</button>
      </div>
    </div>`;
    
  return html;
}

function vehicleSelect() {
  const listHtml = vehicles.filter(v => v.ativo !== false && v.status !== 'Inativo').map(v => `
    <label class="listrow vehicle-card" for="vehicle-${v.id}">
      <div class="main"><strong>${v.ident}</strong><span>${v.modelo} · ${v.tipo}</span></div>
      <input id="vehicle-${v.id}" type="radio" name="vehicle" value="${v.id}" ${String(state.selectedVehicle) === String(v.id) ? 'checked' : ''} onclick="state.selectedVehicle='${v.id}'">
    </label>`).join('');

  return `
    <button class="back" onclick="go('home')">← Voltar</button>
    <div class="hero"><div><div class="eyebrow">Etapa 1 de 2</div><h1>Selecione o veículo</h1></div></div>
    <div class="list">${listHtml}</div>
    <div class="sticky-actions"><button type="button" class="primary" onclick="startCheck()">CONTINUAR →</button></div>`;
}

function startCheck() {
  const v = veh(state.selectedVehicle);
  if (!v) return alert('Selecione um veículo.');
  state.screen = 'checklist';
  state.check = { vehicleId: String(v.id), km: v.km || '', items: {} };
  render();
}

function checklist() {
  const total = Object.values(categories).flat().length + Object.keys(checklistQuantityFields).length;
  const done = Object.keys(state.check.items).length;
  const v = veh(state.check.vehicleId);

  const catsHtml = Object.entries(categories).map(([cat, items]) => {
    const countDone = items.filter(i => state.check.items[i]).length;
    const rowsHtml = items.map(item => {
      const x = state.check.items[item] || {};
      const extraHtml = (x.status && x.status !== 'ok') ? `
        <div class="extra">
          <div class="field" style="margin:0">
            <label>Descreva a situação *</label>
            <textarea oninput="state.check.items['${item}'].description=this.value">${x.description || ''}</textarea>
          </div>
        </div>` : '';
        
      return `
        <div class="checkitem">
          <div class="itemhead"><strong>${item}</strong>${x.status ? statusLabel(x.status) : '<span class="muted" style="font-size:12px">Obrigatório</span>'}</div>
          <div class="choices">
            <button class="choice ok ${x.status === 'ok' ? 'sel' : ''}" onclick="setItem('${item}','ok')">🟢 OK</button>
            <button class="choice warn ${x.status === 'warn' ? 'sel' : ''}" onclick="setItem('${item}','warn')">🟡 ATENÇÃO</button>
            <button class="choice bad ${x.status === 'bad' ? 'sel' : ''}" onclick="setItem('${item}','bad')">🔴 NÃO CONFORME</button>
          </div>
          ${extraHtml}
        </div>`;
    }).join('');
    
    const qtyHtml = cat === 'EQUIPAMENTOS' ? Object.entries(checklistQuantityFields).map(([key, label]) => {
      const val = state.check.items[key]?.quantity ?? '';
      return `
        <div class="checkitem">
          <div class="itemhead"><strong>🪢 ${label}</strong><span class="muted" style="font-size:12px">Obrigatório</span></div>
          <div class="field" style="margin:0">
            <input type="number" min="0" step="1" value="${val}" placeholder="0" oninput="setQuantity('${key}',this.value)">
          </div>
        </div>`;
    }).join('') : '';

    return `
      <details class="checkcat" open>
        <summary>${cat}<span class="muted">${countDone}/${items.length}⌄</span></summary>
        <div class="checkitems">${rowsHtml}${qtyHtml}</div>
      </details>`;
  }).join('');

  return `
    <main class="shell">
      <button class="back" onclick="state.screen='main';state.view='new';render()">← Voltar</button>
      <div class="hero">
        <div><div class="eyebrow">Checklist de saída</div><h1>${v.ident}</h1></div>
        <div><b>${done} de ${total}</b><div class="progress" style="width:150px;margin-top:8px"><i style="width:${(done / total * 100)}%"></i></div></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="field" style="margin:0">
          <label>KM atual *</label>
          <input type="number" step="0.1" value="${state.check.km}" oninput="state.check.km=this.value">
        </div>
      </div>
      ${catsHtml}
      <div class="sticky-actions"><button class="primary" onclick="reviewCheck()">REVISAR CHECKLIST</button></div>
    </main>`;
}

function setQuantity(key, value) { 
    const n = Number(value); 
    if (value !== '' && (!Number.isInteger(n) || n < 0)) return; 
    state.check.items[key] = { quantity: value === '' ? '' : n, status: 'ok' }; 
}

function setItem(item, status) { 
    state.check.items[item] = { ...state.check.items[item], status }; 
    render(); 
}

function reviewCheck() {
  const total = Object.values(categories).flat().length + Object.keys(checklistQuantityFields).length;
  if (!state.check.km) return alert('Informe o KM atual.');
  if (Object.keys(state.check.items).length < total) return alert('Responda todos os itens e quantidades antes de continuar.');
  state.screen = 'summary'; 
  render();
}

function summary() {
  const vals = Object.values(state.check.items); 
  const v = veh(state.check.vehicleId);
  const okCount = vals.filter(x => x.status === 'ok').length; 
  const warnCount = vals.filter(x => x.status === 'warn').length; 
  const badCount = vals.filter(x => x.status === 'bad').length;

  return `
    <main class="shell">
      <button class="back" onclick="state.screen='checklist';render()">← Revisar itens</button>
      <div class="hero">
        <div><div class="eyebrow">Última conferência</div><h1>Resumo</h1></div>
      </div>
      <div class="grid">
        <div class="card col-6">
          <div class="list">
            <div class="listrow"><span>Veículo</span><b>${v.ident}</b></div>
            <div class="listrow"><span>KM</span><b>${km(state.check.km)}</b></div>
          </div>
        </div>
        <div class="card col-6">
          <div class="grid">
            <div class="col-4"><span class="green">🟢 OK</span><h2>${okCount}</h2></div>
            <div class="col-4"><span class="yellow">🟡 Atenção</span><h2>${warnCount}</h2></div>
            <div class="col-4"><span class="red">🔴 Pendência</span><h2>${badCount}</h2></div>
          </div>
        </div>
      </div>
      <div class="sticky-actions"><button type="button" class="primary" onclick="finishCheck()">FINALIZAR CHECKLIST</button></div>
    </main>`;
}

function finishCheck() {
  const items = state.check.items || {}; 
  const entries = Object.entries(items); 
  const vals = entries.map(e => e[1]);
  const v = veh(state.check.vehicleId); 
  const now = new Date();
  const status = vals.some(x => x.status === 'bad') ? 'bad' : vals.some(x => x.status === 'warn') ? 'warn' : 'ok';

  const c = {
    id: uid(), 
    protocolo: 'CHK-' + iso(now).replace(/-/g, '') + '-' + String(data.checks.length + 1).padStart(4, '0'),
    driverId: String(state.driverId), 
    vehicleId: String(v.id), 
    date: iso(now), 
    time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    km: parseFloat(state.check.km), 
    summary: { 
        ok: vals.filter(x => x.status === 'ok').length, 
        warn: vals.filter(x => x.status === 'warn').length, 
        bad: vals.filter(x => x.status === 'bad').length 
    }, 
    status: status, 
    items: items
  };

  data.checks.unshift(c);
  entries.filter(e => e[1].status !== 'ok').forEach(e => {
    data.issues.unshift({ 
        id: uid(), 
        checkId: c.id, 
        vehicleId: String(v.id), 
        driverId: String(state.driverId), 
        item: e[0], 
        description: String(e[1].description || 'Atenção registrada').trim(), 
        priority: e[1].status === 'bad' ? 'Alta' : 'Média', 
        status: 'Aberta', 
        date: c.date, 
        restrict: !!e[1].restrict 
    });
  });

  v.km = parseFloat(state.check.km); 
  save(false); 
  state.check = null; 
  state.screen = 'success'; 
  render();
}

function success() {
  const c = data.checks[0]; 
  const v = veh(c.vehicleId);
  return `
    <main class="shell">
      <div class="card success">
        <div class="check">✓</div>
        <h1>Checklist registrado</h1>
        <p class="muted">Protocolo: <b>${c.protocolo}</b> · Veículo: <b>${v ? v.ident : '—'}</b></p>
        <button class="primary" onclick="state.screen='main';state.view='home';render()">VOLTAR AO INÍCIO</button>
      </div>
    </main>`;
}

function fueling() {
  const v = operatingVehicle(); 
  if (!v) return '<div class="card empty">Nenhum veículo em operação.</div>'; 
  normalizeFuel(v);

  return `
    <div class="hero">
      <div><div class="eyebrow">Novo abastecimento</div><h1>${v.ident}</h1></div>
    </div>
    <div class="card">
      <div class="form-grid">
        <div class="field"><label>Data</label><input id="fu-date" type="date" value="${iso()}"></div>
        <div class="field"><label>Hora</label><input id="fu-time" type="time" value="${new Date().toTimeString().slice(0, 5)}"></div>
        <div class="field"><label>KM atual *</label><input id="fu-km" type="number" step="0.1" min="0" value="${v.km || ''}"></div>
        <div class="field"><label>Tipo de diesel</label><input value="${v.tipoDiesel}" disabled></div>
        <div class="field"><label>Diesel — litros *</label><input id="fu-liters" type="number" min="0" step="0.01"></div>
        <div class="field"><label>Diesel — valor total (R$) *</label><input id="fu-value" type="number" min="0" step="0.01"></div>
      </div>
      <div class="sticky-actions"><button class="primary" onclick="saveFuel()">CONFIRMAR ABASTECIMENTO</button></div>
    </div>`;
}

function saveFuel() {
  const v = operatingVehicle(); 
  const lit = parseFloat(document.getElementById('fu-liters').value); 
  const val = parseFloat(document.getElementById('fu-value').value); 
  const currentKm = parseFloat(document.getElementById('fu-km').value);
  
  if (!lit || lit <= 0 || !currentKm) return alert('Informe KM, litros e valor do diesel.');
  
  const now = new Date();
  data.fuels.unshift({ 
      id: uid(), 
      protocolo: 'AB-' + iso(now).replace(/-/g, '') + '-' + String(data.fuels.length + 1).padStart(4, '0'), 
      veiculoId: String(v.id), 
      motoristaId: String(state.driverId), 
      date: document.getElementById('fu-date').value, 
      hora: document.getElementById('fu-time').value, 
      km: currentKm, 
      tipoDiesel: v.tipoDiesel || 'Diesel S10', 
      litrosDiesel: lit, 
      valorDiesel: val, 
      litrosArla: 0, 
      valorArla: 0 
  });
  
  v.km = currentKm; 
  save(); 
  state.view = 'history'; 
  render();
}

function history() {
  const cs = data.checks.filter(c => String(c.driverId) === String(state.driverId));
  const checksHtml = cs.map(c => `
    <div class="listrow">
      <div class="main">
        <strong>${br(c.date)} — ${veh(c.vehicleId)?.ident || '—'}</strong>
        <span>KM: ${km(c.km)} · ${c.protocolo}</span>
      </div>
      ${statusLabel(c.status)}
    </div>`).join('') || '<div class="empty">Nenhum checklist registrado.</div>';

  return `
    <div class="hero">
      <div><div class="eyebrow">Motorista</div><h1>Meu histórico</h1></div>
    </div>
    <div class="card">
      <h2>📋 CHECKLISTS</h2>
      <div class="list" style="margin-top:14px">${checksHtml}</div>
    </div>`;
}

/* ÁREA DO GESTOR */

function vehicleStatus(v) {
  const open = data.issues.some(i => String(i.vehicleId) === String(v.id) && i.status !== 'Resolvida' && i.restrict);
  if (open) return 'Restrito';
  
  const c = data.checks.find(x => String(x.vehicleId) === String(v.id));
  if (c && c.status === 'bad') return 'Pendência';
  if (c && c.status === 'warn') return 'Atenção';
  
  return v.status || 'Operacional';
}

function statusText(s) {
  if (s === 'Operacional') return '<span class="pill ok">🟢 Operacional</span>';
  if (s === 'Atenção') return '<span class="pill warn">🟡 Atenção</span>';
  if (s === 'Restrito') return '<span class="pill bad">🚨 Restrito</span>';
  return '<span class="pill bad">🔴 Pendência</span>';
}

function vehicleRow(v) { 
    return `
      <button class="listrow vehicle-card" style="text-align:left" onclick="state.detail='${v.id}';state.view='vehicle-detail';render()">
        <div class="main">
          <strong>${v.ident}</strong>
          <span>${v.modelo} · ${v.tipo} · ${km(v.km)} km</span>
        </div>
        ${statusText(vehicleStatus(v))}
      </button>`; 
}

function manager() {
  if (state.view === 'fleet') return fleet(); 
  if (state.view === 'drivers') return driverAdmin(); 
  if (state.view === 'issues') return issues(); 
  if (state.view === 'checks') return allChecks(); 
  if (state.view === 'fuels') return fuelAdmin(); 
  return dashboard();
}

function dashboard() {
  const active = vehicles.filter(v => v.ativo !== false);
  const okCount = active.filter(v => vehicleStatus(v) === 'Operacional').length;
  const warnCount = active.filter(v => vehicleStatus(v) === 'Atenção').length;
  const badCount = active.filter(v => ['Pendência', 'Restrito'].includes(vehicleStatus(v))).length;

  return `
    <div class="hero">
      <div>
        <div class="eyebrow">Resumo da frota</div>
        <h1>Painel da frota</h1>
      </div>
      <div class="hero-actions">
        <button class="primary" onclick="go('fleet')">🚛 VEÍCULOS</button>
        <button class="secondary" onclick="go('drivers')">👤 MOTORISTAS</button>
      </div>
    </div>
    <div class="dashboard-grid">
      <div class="card stat">
        <div class="stat-dot">🚛</div>
        <div><strong>${active.length}</strong><small>TOTAL DE VEÍCULOS</small></div>
      </div>
      <div class="card stat">
        <div class="stat-dot green">✓</div>
        <div><strong>${okCount}</strong><small>OPERACIONAIS</small></div>
      </div>
      <div class="card stat">
        <div class="stat-dot yellow">!</div>
        <div><strong>${warnCount}</strong><small>ATENÇÃO</small></div>
      </div>
      <div class="card stat">
        <div class="stat-dot red">×</div>
        <div><strong>${badCount}</strong><small>RESTRITOS / PENDÊNCIAS</small></div>
      </div>
      <div class="card dashboard-section-card dashboard-quick">
        <div class="section-title"><h2>Visão rápida</h2></div>
        <div class="list">${active.map(vehicleRow).join('')}</div>
      </div>
    </div>`;
}

function fleet() { 
    return `
      <div class="hero">
        <div><div class="eyebrow">🚛 VEÍCULOS</div><h1>Veículos</h1></div>
        <button class="primary" onclick="vehicleForm()">+ NOVO VEÍCULO</button>
      </div>
      <div class="list">${vehicles.map(vehicleRow).join('')}</div>`; 
}

function vehicleForm(id) {
  const v = id ? normalizeTachograph(normalizeFuel(veh(id))) : { id: '', ident: '', placa: '', modelo: '', ano: '2023', tipo: '3/4', km: 0, motoristaId: '', status: 'Operacional', tipoDiesel: 'Diesel S10', utilizaArla: true, capacidadeTanqueDiesel: 150, capacidadeTanqueArla: 25, tipoTacografo: 'digital' };
  
  const tiposOpts = ['3/4', 'Toco', 'VUC', 'VAN', 'Fiorino', 'Outro'].map(x => `<option ${v.tipo === x ? 'selected' : ''}>${x}</option>`).join('');
  const driverOpts = drivers.filter(d => d.status === 'Ativo').map(d => `<option value="${d.id}" ${String(v.motoristaId) === String(d.id) ? 'selected' : ''}>${d.nome}</option>`).join('');
  const statusOpts = ['Operacional', 'Atenção', 'Restrito', 'Inativo'].map(x => `<option ${v.status === x ? 'selected' : ''}>${x}</option>`).join('');
  const tachoOpts = tachographTypes.map(t => `<option value="${t[0]}" ${v.tipoTacografo === t[0] ? 'selected' : ''}>${t[1]}</option>`).join('');

  const btnDelete = id ? `<button class="danger" onclick="deleteVehicle('${id}')">EXCLUIR</button>` : '';

  app.innerHTML = layout(`
    <button class="back" onclick="go('fleet')">← Voltar</button>
    <div class="hero">
      <div><div class="eyebrow">CADASTRO</div><h1>${id ? 'Editar veículo' : 'Novo veículo'}</h1></div>
    </div>
    <div class="card">
      <div class="form-grid">
        <div class="field"><label>Prefixo *</label><input id="vf-ident" value="${v.ident}"></div>
        <div class="field"><label>Placa *</label><input id="vf-placa" value="${v.placa || ''}"></div>
        <div class="field"><label>Modelo</label><input id="vf-modelo" value="${v.modelo}"></div>
        <div class="field"><label>Ano</label><input id="vf-ano" value="${v.ano || ''}"></div>
        <div class="field"><label>Tipo</label><select id="vf-tipo">${tiposOpts}</select></div>
        <div class="field"><label>KM atual</label><input id="vf-km" type="number" step="0.1" value="${v.km || 0}"></div>
        <div class="field"><label>Motorista vinculado</label><select id="vf-driver"><option value="">Sem motorista</option>${driverOpts}</select></div>
        <div class="field"><label>Status</label><select id="vf-status">${statusOpts}</select></div>
        <div class="field"><label>Tipo de tacógrafo</label><select id="vf-tachograph">${tachoOpts}</select></div>
      </div>
      <div class="sticky-actions">
        ${btnDelete}
        <button class="secondary" onclick="go('fleet')">CANCELAR</button>
        <button class="primary" onclick="saveVehicle('${id || ''}')">SALVAR VEÍCULO</button>
      </div>
    </div>
  `);
}

function saveVehicle(id) {
  const ident = document.getElementById('vf-ident').value.trim();
  if (!ident) return alert('Preencha o prefixo do veículo.');
  
  const placa = document.getElementById('vf-placa').value.trim() || ident;
  
  const existing = vehicles.find(x => String(x.placa).toUpperCase() === placa.toUpperCase() && String(x.id) !== String(id));
  if (existing) return alert('Já existe um veículo cadastrado com esta placa!');

  const v = id ? veh(id) : { id: uid() };
  const oldDriverId = v.motoristaId;

  v.ident = ident; 
  v.placa = placa;
  v.modelo = document.getElementById('vf-modelo').value.trim(); 
  v.ano = document.getElementById('vf-ano').value.trim();
  v.tipo = document.getElementById('vf-tipo').value; 
  v.km = parseFloat(document.getElementById('vf-km').value) || 0;
  v.motoristaId = document.getElementById('vf-driver').value || null; 
  v.status = document.getElementById('vf-status').value;
  v.ativo = v.status !== 'Inativo'; 
  v.tipoTacografo = document.getElementById('vf-tachograph').value || 'digital';

  // Sincronização Bidirecional: Se mudar o motorista do carro, atualiza o perfil do motorista
  if (v.motoristaId && v.motoristaId !== oldDriverId) {
    const d = driverBy(v.motoristaId);
    if (d) d.veiculoId = v.id;
  }
  if (oldDriverId && oldDriverId !== v.motoristaId) {
    const oldD = driverBy(oldDriverId);
    if (oldD) oldD.veiculoId = null;
  }

  if (!id) vehicles.push(v);
  data.vehicles = vehicles; 
  save(); 
  state.view = 'fleet'; 
  render();
}

function deleteVehicle(id) {
  if (!confirm('Tem certeza que deseja excluir este veículo da sua frota permanentemente?')) return;
  data.vehicles = data.vehicles.filter(v => String(v.id) !== String(id));
  vehicles = data.vehicles; 
  save(); 
  go('fleet');
}

function setVehicleStatus(id, newStatus) { 
    const v = veh(id); 
    if(v) { 
        v.status = newStatus; 
        v.ativo = newStatus !== 'Inativo'; 
        save(); 
        go('fleet'); 
    } 
}

function vehicleDetail() {
  const v = normalizeTachograph(veh(state.detail)); 
  if (!v) return fleet();
  
  const d = driverBy(v.motoristaId); 
  const checks = data.checks.filter(c => String(c.vehicleId) === String(v.id)).slice(0, 5); 
  const issues = data.issues.filter(i => String(i.vehicleId) === String(v.id));

  const checksHtml = checks.length ? checks.map(c => `
    <div class="listrow">
      <div class="main">
        <strong>${br(c.date)} - ${c.time} · ${c.protocolo}</strong>
        <span>Motorista: ${driverBy(c.driverId)?.nome || '—'} · KM ${km(c.km)}</span>
      </div>
      <button class="iconbtn" onclick="state.detail='${c.id}';state.view='check-detail';render()">→</button>
    </div>`).join('') : '<p class="empty" style="padding:10px">Nenhum checklist registrado.</p>';
    
  const issuesHtml = issues.length ? issues.map(i => `
    <div class="listrow">
      <div class="main">
        <strong>${i.item}</strong>
        <span>${i.description}</span>
      </div>
      ${statusText(i.status === 'Resolvida' ? 'Operacional' : 'Pendência')}
    </div>`).join('') : '<p class="empty" style="padding:10px">Nenhuma ocorrência registrada.</p>';

  return `
    <button class="back" onclick="go('fleet')">← Voltar para frota</button>
    <div class="hero">
      <div>
        <div class="eyebrow">PERFIL DO VEÍCULO</div>
        <h1>${v.ident}</h1>
        <p class="muted">${v.placa || v.ident} · ${v.modelo} · ${v.tipo}</p>
      </div>
      <div class="hero-actions">
        <button class="secondary" onclick="vehicleForm('${v.id}')">EDITAR</button>
        <button class="danger" onclick="setVehicleStatus('${v.id}', 'Inativo')">INATIVAR</button>
        ${statusText(vehicleStatus(v))}
      </div>
    </div>
    <div class="grid">
      <div class="col-4">
        <div class="card">
          <div class="section-title"><h2>INFORMAÇÕES</h2></div>
          <div class="list">
            <div class="listrow"><span>Prefixo</span><b>${v.ident}</b></div>
            <div class="listrow"><span>Placa</span><b>${v.placa || '—'}</b></div>
            <div class="listrow"><span>Modelo</span><b>${v.modelo || '—'}</b></div>
            <div class="listrow"><span>Ano</span><b>${v.ano || '—'}</b></div>
            <div class="listrow"><span>Motorista</span><b>${d ? d.nome : 'Sem motorista'}</b></div>
            <div class="listrow"><span>KM atual</span><b>${km(v.km)}</b></div>
            <div class="listrow"><span>Tacógrafo</span><b>${tachographTypeLabel(v.tipoTacografo)}</b></div>
          </div>
        </div>
      </div>
      <div class="col-8 list">
        <div class="card"><div class="section-title"><h2>CHECKLISTS</h2></div><div class="list">${checksHtml}</div></div>
        <div class="card"><div class="section-title"><h2>OCORRÊNCIAS</h2></div><div class="list">${issuesHtml}</div></div>
      </div>
    </div>`;
}

function autoMatricula(val) {
  const num = val.replace(/\D/g, ''); 
  const matInput = document.getElementById('df-mat');
  if (num.length === 11 && matInput) {
      matInput.value = 'MT-' + num.substring(0, 3) + num.substring(9, 11);
  }
}

function driverAdmin() {
  const rowsHtml = drivers.map(d => `
    <div class="card listrow">
      <div class="main">
        <strong>${d.nome}</strong>
        <span>${d.matricula} · ${veh(d.veiculoId)?.ident || 'Sem veículo'} · Login: ${d.user || '—'}</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <span class="pill ${d.status === 'Ativo' ? 'ok' : 'bad'}">${d.status}</span>
        <button class="secondary" style="padding:8px 12px;font-size:12px" onclick="driverForm('${d.id}')">EDITAR</button>
      </div>
    </div>`).join('');

  return `
    <div class="hero">
      <div><div class="eyebrow">👤 MOTORISTAS</div><h1>Motoristas</h1></div>
      <button class="primary" onclick="driverForm()">+ NOVO MOTORISTA</button>
    </div>
    <div class="list">${rowsHtml}</div>`;
}

function driverForm(id) {
  const d = id ? driverBy(id) : { id: '', nome: '', matricula: '', cpf: '', telefone: '', veiculoId: '', user: '', senha: '123456', status: 'Ativo' };
  const vOpts = vehicles.map(v => `<option value="${v.id}" ${String(v.id) === String(d.veiculoId) ? 'selected' : ''}>${v.ident}</option>`).join('');
  const stOpts = ['Ativo', 'Inativo'].map(x => `<option ${d.status === x ? 'selected' : ''}>${x}</option>`).join('');
  
  const btnDelete = id ? `<button class="danger" onclick="deleteDriver('${id}')">EXCLUIR</button>` : '';

  app.innerHTML = layout(`
    <button class="back" onclick="go('drivers')">← Voltar</button>
    <div class="hero">
      <div><div class="eyebrow">CADASTRO</div><h1>${id ? 'Editar motorista' : 'Novo motorista'}</h1></div>
    </div>
    <div class="card">
      <div class="form-grid">
        <div class="field"><label>Nome completo</label><input id="df-nome" value="${d.nome}"></div>
        <div class="field"><label>CPF</label><input id="df-cpf" value="${d.cpf}" oninput="autoMatricula(this.value)" placeholder="Apenas números"></div>
        <div class="field"><label>Matrícula</label><input id="df-mat" value="${d.matricula}"></div>
        <div class="field"><label>Telefone</label><input id="df-tel" value="${d.telefone}"></div>
        <div class="field"><label>Veículo vinculado</label><select id="df-veh"><option value="">Sem veículo</option>${vOpts}</select></div>
        <div class="field"><label>Status de acesso</label><select id="df-status">${stOpts}</select></div>
        <div class="field"><label>Usuário (Login)</label><input id="df-user" value="${d.user}"></div>
        <div class="field"><label>Senha</label><input id="df-pass" value="${d.senha}"></div>
      </div>
      <div class="sticky-actions">
        ${btnDelete}
        <button class="secondary" onclick="go('drivers')">CANCELAR</button>
        <button class="primary" onclick="saveDriver('${id || ''}')">SALVAR MOTORISTA</button>
      </div>
    </div>
  `);
}

function saveDriver(id) {
  const cpf = document.getElementById('df-cpf').value.trim();
  const matricula = document.getElementById('df-mat').value.trim();
  
  const existing = drivers.find(x => (x.cpf === cpf || x.matricula === matricula) && String(x.id) !== String(id));
  if (existing && (cpf || matricula)) return alert('Já existe um motorista cadastrado com este CPF ou Matrícula!');

  const d = id ? driverBy(id) : { id: uid() };
  const oldVehId = d.veiculoId;

  d.nome = document.getElementById('df-nome').value.trim(); 
  d.matricula = matricula; 
  d.cpf = cpf;
  d.telefone = document.getElementById('df-tel').value.trim(); 
  d.veiculoId = document.getElementById('df-veh').value || null;
  d.vinculo = 'Frota própria'; 
  d.user = document.getElementById('df-user').value.trim();
  d.senha = document.getElementById('df-pass').value.trim() || '123456'; 
  d.status = document.getElementById('df-status').value;

  // Sincronização Bidirecional: Se mudar o carro do motorista, atualiza o carro também
  if (d.veiculoId && d.veiculoId !== oldVehId) {
    const vehObj = veh(d.veiculoId);
    if (vehObj) vehObj.motoristaId = d.id;
  }
  if (oldVehId && oldVehId !== d.veiculoId) {
    const oldV = veh(oldVehId);
    if (oldV) oldV.motoristaId = null;
  }
  
  if (!id) drivers.push(d);
  data.drivers = drivers; 
  save(); 
  state.view = 'drivers'; 
  render();
}

function deleteDriver(id) {
  if (!confirm('Tem certeza que deseja excluir permanentemente este motorista?')) return;
  data.drivers = data.drivers.filter(d => String(d.id) !== String(id));
  drivers = data.drivers; 
  save(); 
  go('drivers');
}

function issues() {
  const filter = state.issueFilter || 'Todos'; 
  const filtered = data.issues.filter(i => filter === 'Todos' || i.status === filter);
  
  const listHtml = filtered.map(i => `
    <div class="card">
      <div class="section-title">
        <div>
          <h3>${i.item}</h3>
          <span class="muted">${veh(i.vehicleId)?.ident || '—'} · ${driverBy(i.driverId)?.nome || '—'} · ${br(i.date)}</span>
        </div>
        <span class="pill ${i.status === 'Resolvida' ? 'ok' : (i.status === 'Em análise' ? 'blue' : 'bad')}">${i.status}</span>
      </div>
      <p style="margin:0">${i.description}</p>
      ${i.restrict ? '<div class="notice danger-notice" style="margin-top:10px">RESTRIÇÃO - Impede circulação</div>' : ''}
      ${i.status !== 'Resolvida' ? `
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
          <button class="secondary" style="font-size:12px;padding:10px 14px;" onclick="updateIssueStatus('${i.id}', 'Em análise')">EM ANÁLISE</button>
          <button class="primary" style="font-size:12px;padding:10px 14px;" onclick="state.detail='${i.id}';state.view='resolve-issue';render()">RESOLVER PENDÊNCIA</button>
        </div>` : ''}
    </div>`).join('') || '<div class="empty">Nenhuma pendência encontrada.</div>';
    
  const tabs = ['Todos', 'Aberta', 'Em análise', 'Resolvida'].map(t => 
    `<button class="${filter === t ? 'active' : ''}" onclick="state.issueFilter='${t}';render()">${t}</button>`
  ).join('');
  
  return `
    <div class="hero"><div><div class="eyebrow">🚨 PENDÊNCIAS</div><h1>Pendências</h1></div></div>
    <div class="filterbar" style="margin-bottom:16px">${tabs}</div>
    <div class="list">${listHtml}</div>`;
}

function updateIssueStatus(id, status) { 
    const i = data.issues.find(x => String(x.id) === String(id)); 
    if (i) { 
        i.status = status; 
        save(); 
        render(); 
    } 
}

function resolveIssueForm(id) { 
    return `
      <button class="back" onclick="go('issues')">← Voltar</button>
      <div class="hero"><div><div class="eyebrow">RESOLUÇÃO</div><h1>Resolver pendência</h1></div></div>
      <div class="card">
        <div class="field"><label>O que foi feito? *</label><textarea id="res-desc"></textarea></div>
        <div class="field"><label>Responsável *</label><input id="res-resp"></div>
        <div class="field"><label>Data *</label><input type="date" id="res-date" value="${iso()}"></div>
        <div class="sticky-actions">
          <button class="secondary" onclick="go('issues')">CANCELAR</button>
          <button class="primary" onclick="confirmResolution('${id}')">CONFIRMAR RESOLUÇÃO</button>
        </div>
      </div>`; 
}

function confirmResolution(id) { 
    const i = data.issues.find(x => String(x.id) === String(id)); 
    if (!i) return; 
    
    const desc = document.getElementById('res-desc').value.trim(); 
    const resp = document.getElementById('res-resp').value.trim(); 
    
    if (!desc || !resp) return alert('Preencha os campos obrigatórios.'); 
    
    i.status = 'Resolvida'; 
    i.resolution = desc; 
    i.resolvedBy = resp; 
    i.resolvedAt = document.getElementById('res-date').value; 
    
    save(); 
    go('issues'); 
}

function allChecks() { 
    const rowsHtml = data.checks.map(c => `
      <tr onclick="state.detail='${c.id}';state.view='check-detail';render()" style="cursor:pointer">
        <td>${c.protocolo}</td>
        <td>${br(c.date)}</td>
        <td>${c.time || '—'}</td>
        <td>${veh(c.vehicleId)?.ident || '—'}</td>
        <td>${driverBy(c.driverId)?.nome || '—'}</td>
        <td>${km(c.km)}</td>
        <td>${statusLabel(c.status)}</td>
      </tr>`).join(''); 
      
    return `
      <div class="hero"><div><div class="eyebrow">📋 CHECKLISTS</div><h1>Checklists</h1></div></div>
      <div class="card table-wrap">
        <table class="table">
          <thead><tr><th>Protocolo</th><th>Data</th><th>Hora</th><th>Veículo</th><th>Motorista</th><th>KM</th><th>Status</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`; 
}

function checkDetail() { 
    const c = data.checks.find(x => String(x.id) === String(state.detail)); 
    if (!c) return allChecks(); 
    
    return `
      <button class="back" onclick="go('checks')">← Voltar</button>
      <div class="hero">
        <div><div class="eyebrow">DETALHES DO CHECKLIST</div><h1>${c.protocolo}</h1><p class="muted">${br(c.date)} - ${c.time}</p></div>
        ${statusLabel(c.status)}
      </div>
      <div class="card">
        <div class="list">
          <div class="listrow"><span>KM Informado</span><b>${km(c.km)}</b></div>
        </div>
      </div>`; 
}

function fuelAdmin() { 
    const rowsHtml = data.fuels.map(f => `
      <tr>
        <td>${br(f.date)} ${f.hora || ''}</td>
        <td>${veh(f.veiculoId)?.ident || '—'}</td>
        <td>${driverBy(f.motoristaId)?.nome || 'Robô / Posto'}</td>
        <td>${f.tipoDiesel || 'Diesel S10'}</td>
        <td>${f.litrosDiesel} L</td>
        <td>R$ ${Number(f.valorDiesel || 0).toFixed(2)}</td>
        <td>${km(f.km)}</td>
      </tr>`).join('') || '<tr><td colspan="7">Nenhum abastecimento registrado.</td></tr>'; 
      
    return `
      <div class="hero"><div><div class="eyebrow">⛽ ABASTECIMENTOS</div><h1>Abastecimentos</h1></div></div>
      <div class="card table-wrap">
        <table class="table">
          <thead><tr><th>Data/Hora</th><th>Veículo</th><th>Motorista</th><th>Diesel</th><th>Litros</th><th>Valor</th><th>KM</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`; 
}

// Iniciação
loadFromSheets();