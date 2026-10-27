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
// GERENCIAMENTO BLINDADO DA SESSÃO (1 POR DIA)
// ==========================================

function saveSession() {
  localStorage.setItem('tmfleet_session', JSON.stringify({
    role: state.role,
    driverId: state.driverId,
    dataLogin: new Date().toLocaleDateString('pt-BR') // Salva o dia exato (ex: "20/10/2026")
  }));
}

function loadSession() {
  try {
    const sess = JSON.parse(localStorage.getItem('tmfleet_session'));
    const hoje = new Date().toLocaleDateString('pt-BR');
    
    // Mantém logado APENAS se a data salva for igual ao dia de hoje
    if (sess && sess.dataLogin === hoje) {
      state.role = sess.role;
      state.driverId = sess.driverId;
      state.screen = 'main';
      state.view = sess.role === 'gestor' ? 'dashboard' : 'home';
    }
  } catch (e) {}
}

// Executa a carga da sessão imediatamente na leitura do script
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
  if (typeof API_URL === 'undefined' || !API_URL || !API_URL.startsWith('http')) {
    console.warn("⚠️ ATENÇÃO: A variável API_URL não está configurada ou é inválida no seu trmfleet.js!");
    return;
  }
  
  try {
    console.log("🔄 Tentando buscar dados na API do Google Sheets...");
    const res = await fetch(API_URL + '?action=getAll');
    const remote = await res.json();
    
    console.log("📥 Dados brutos recebidos do Google Sheets:", remote);
    
    if (!remote || remote.error) {
      console.error("❌ A API respondeu com erro:", remote ? remote.error : "Resposta vazia");
      return;
    }

    if (typeof data === 'undefined') window.data = {};

    if (remote.vehicles && remote.vehicles.length > 0) {
      data.vehicles = remote.vehicles.map(v => ({
        id: String(v.id_veiculo || (typeof uid === 'function' ? uid() : 'v_' + Math.random())), 
        ident: v.prefixo, 
        placa: v.placa, 
        modelo: v.modelo,
        ano: String(v.ano), 
        tipo: v.tipo, 
        km: Number(v.km_atual), 
        status: v.status_veiculo,
        ativo: String(v.ativo).toLowerCase() === 'true',
        motoristaId: null, 
        tipoDiesel: v.tipo_diesel, 
        utilizaArla: String(v.utiliza_arla).toLowerCase() !== 'false',
        capacidadeTanqueDiesel: Number(v.cap_diesel), 
        capacidadeTanqueArla: Number(v.cap_arla),
        tipoTacografo: v.tipo_tacografo
      }));
      if (typeof vehicles !== 'undefined') vehicles = data.vehicles;
    }
    
    if (remote.drivers && remote.drivers.length > 0) {
      data.drivers = remote.drivers.map(d => ({
        id: String(d.id_motorista || (typeof uid === 'function' ? uid() : 'd_' + Math.random())), 
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
      if (typeof drivers !== 'undefined') drivers = data.drivers;
    }

    if (data.vehicles && data.drivers) {
      data.drivers.forEach(d => {
        if (d.veiculoId) {
          const v = data.vehicles.find(x => String(x.id) === String(d.veiculoId));
          if (v) v.motoristaId = d.id;
        }
      });
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
        id: String(f.id_abastecimento || (typeof uid === 'function' ? uid() : 'f_' + Math.random())), 
        protocolo: f.protocolo, 
        veiculoId: String(f.id_veiculo),
        motoristaId: String(f.id_motorista || ''), 
        date: f.data, 
        hora: f.hora, 
        km: Number(f.km_atual),
        tipoDiesel: f.tipo_diesel, 
        litrosDiesel: Number(f.litros_diesel), 
        valorDiesel: Number(f.valor_diesel),
        litrosArla: Number(f.litros_arla || 0), 
        valorArla: Number(f.valor_arla || 0)
      }));
      data.abastecimentos = data.fuels;
      console.log(`✅ Abastecimentos carregados com sucesso: ${data.fuels.length} registros.`);
    } else {
      console.warn("⚠️ O objeto 'fuels' veio vazio ou não existe na resposta do Apps Script.");
    }

    if (typeof KEY !== 'undefined') {
      localStorage.setItem(KEY, JSON.stringify(data));
    }
    
    if (typeof render === 'function') {
      render();
    }

    if (typeof renderFuelCharts === 'function') {
      setTimeout(renderFuelCharts, 150);
    }

  } catch (err) {
    console.error('❌ Erro crítico ao conectar com o Google Sheets:', err);
    if (typeof render === 'function') render();
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
  
  // 🎯 MUDANÇA: Aba "Avaliação" removida do array do Motorista
  const nav = gestor
    ? ['dashboard', 'fleet', 'drivers', 'issues', 'checks', 'fuels', 'ratings']
    : ['home', 'new', 'fuel', 'history', 'profile', 'operation'];
    
  const labels = gestor
    ? ['📊 Dashboard', '🚛 Veículos', '👤 Motoristas', '🚨 Pendências', '📋 Checklists', '⛽ Abastecimentos', '🚛 Avaliações']
    : ['🏠 Início', '📋 Checklist', '⛽ Abastecimento', '📚 Histórico', '👤 Perfil', '🚚 Operação'];

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

  // 🎯 MUDANÇA: Topbar atualizada
  // Gestor vê o selo normal. Motorista vê o Nome + Pontuação com o Caminhãozinho
  let userBadge = '';
  if (gestor) {
    userBadge = `<span class="pill" style="background:#282c2f;color:#fff">GESTOR</span>`;
  } else {
    const d = driver();
    const primeiroNome = d ? d.nome.split(' ')[0] : 'Motorista';
    // Na Fase 3 implementaremos a busca real dos pontos. Por enquanto, mockamos os 100 pontos.
    userBadge = `
      <div class="pill" style="background:#282c2f; color:#fff; border:none;">
        👤 ${primeiroNome} <span style="color:#00D2FF; margin-left:8px; font-weight:900;">100 🚛</span>
      </div>
    `;
  }

  return `
    <header class="topbar">
      <div>
        <div class="brand">TRANSMARINA FLEET</div>
        <div class="tag">Gestão inteligente da frota · v1.5</div>
      </div>
      <div class="top-actions">
        ${userBadge}
        <button class="iconbtn" onclick="logout()" title="Sair">↪</button>
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
  const rowsHtml = drivers.map(d => {
    const v = veh(d.veiculoId);
    // Mostra a placa, e se não tiver placa cadastrada, mostra o prefixo
    const placaCaminhao = v ? (v.placa || v.ident) : 'Sem veículo';
    
    return `
    <div class="card listrow">
      <div class="main">
        <strong>${d.nome}</strong>
        <span>${d.matricula} · ${placaCaminhao} · Login: ${d.user || '—'}</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <span class="pill ${d.status === 'Ativo' ? 'ok' : 'bad'}">${d.status}</span>
        <button class="secondary" style="padding:8px 12px;font-size:12px" onclick="driverForm('${d.id}')">EDITAR</button>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="hero">
      <div><div class="eyebrow">👤 MOTORISTAS</div><h1>Motoristas</h1></div>
      <button class="primary" onclick="driverForm()">+ NOVO MOTORISTA</button>
    </div>
    <div class="list">${rowsHtml}</div>`;
}

function driverForm(id) {
  const d = id ? driverBy(id) : { id: '', nome: '', matricula: '', cpf: '', telefone: '', veiculoId: '', user: '', senha: '123456', status: 'Ativo' };
  
  // MUDANÇA: Agora o `<option>` do select exibe a PLACA do caminhão ao invés do prefixo
  const vOpts = vehicles.map(v => `<option value="${v.id}" ${String(v.id) === String(d.veiculoId) ? 'selected' : ''}>${v.placa || v.ident}</option>`).join('');
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
        <div class="field"><label>Veículo vinculado (Placa)</label><select id="df-veh"><option value="">Sem veículo</option>${vOpts}</select></div>
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

// ==========================================
// PAINEL DE ABASTECIMENTOS AVANÇADO (GRÁFICOS)
// ==========================================

let chartInstances = {}; // Guarda a memória dos gráficos para atualizar ao filtrar


// ==========================================
// PAINEL DE ABASTECIMENTOS AVANÇADO 
// (Mantém F1, Mesclado, Filtros, Brilho e Projeção Inteligente)
// ==========================================

let mainFuelChart = null;

function loadChartJs(callback) {
  if (window.Chart) return callback();
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
  script.onload = callback;
  document.head.appendChild(script);
}


// ==========================================
// PLUGIN DE GLOW INTELIGENTE APRIMORADO
// ==========================================
const glowPlugin = {
  id: 'glowOnHover',
  beforeDatasetDraw: (chart, args) => {
    const active = chart.getActiveElements();
    if (!active || active.length === 0) return;

    const activeDsIndex = active[0].datasetIndex;
    const meta = chart.getDatasetMeta(args.index);
    const ctx = chart.ctx;

    ctx.save();

    if (args.index !== activeDsIndex) {
      // Apaga os datasets que não estão em foco
      ctx.globalAlpha = 0.2;
    } else {
      if (meta.type === 'bar') {
        // Se for barra, apaga o grupo inicial (acenderemos uma a uma depois)
        ctx.globalAlpha = 0.2;
      } else {
        // Se for linha, acende a linha inteira com a cor correta
        const ds = chart.data.datasets[args.index];
        let color = ds.borderColor || ds.backgroundColor || '#00D2FF';
        if (Array.isArray(color)) color = color[active[0].index] || color[0] || '#00D2FF';
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
      }
    }
  },
  afterDatasetDraw: (chart, args) => {
    chart.ctx.restore();

    const active = chart.getActiveElements();
    if (!active || active.length === 0) return;

    const activeDsIndex = active[0].datasetIndex;
    const meta = chart.getDatasetMeta(args.index);

    // Redesenha as barras focadas com opacidade 100% e Neon
    if (meta.type === 'bar' && args.index === activeDsIndex) {
      const ctx = chart.ctx;
      const ds = chart.data.datasets[args.index];
      
      active.forEach(act => {
        if (act.datasetIndex === activeDsIndex) {
          const activeEl = meta.data[act.index];
          const val = ds.data[act.index]; // Pega o valor real do dia
          
          // 🎯 O SEGREDO: Só aplica neon se a barra tiver um valor maior que zero!
          if (activeEl && val > 0) {
            ctx.save();
            let color = ds.borderColor || ds.backgroundColor || '#00D2FF';
            if (Array.isArray(color)) color = color[act.index] || color[0] || '#00D2FF';
            
            ctx.shadowColor = color;
            ctx.shadowBlur = 15;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.globalAlpha = 1.0;

            activeEl.draw(ctx);
            ctx.restore();
          }
        }
      });
    }
  }
};


// ==========================================
// FASE 2: MOTOR DE DATAS, FLATPICKR E EIXO X CORRIGIDO
// ==========================================

// Injeta o calendário interativo (Flatpickr) dinamicamente
function loadFlatpickr(callback) {
  if (window.flatpickr) return callback();
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
  document.head.appendChild(css);
  
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/flatpickr';
  script.onload = () => {
    const ptScript = document.createElement('script');
    ptScript.src = 'https://npmcdn.com/flatpickr/dist/l10n/pt.js';
    ptScript.onload = callback;
    document.head.appendChild(ptScript);
  };
  document.head.appendChild(script);
}

// Aplica atalhos rápidos de data no filtro
function applyPresetDate() {
  const val = document.getElementById('fuel-preset-dates').value;
  if (!val) return;
  
  const end = new Date();
  let start = new Date();
  
  if (val === '30') {
    start.setDate(end.getDate() - 30);
  } else if (val === '90') {
    start.setDate(end.getDate() - 90);
  } else if (val === 'thisMonth') {
    start.setDate(1);
  }
  
  state.fuelStart = start.toISOString().split('T')[0];
  state.fuelEnd = end.toISOString().split('T')[0];
  
  const fp = document.getElementById('fuel-date-range')._flatpickr;
  if (fp) fp.setDate([state.fuelStart, state.fuelEnd]);
  
  renderFuelCharts();
}

function fuelAdmin() { 
  // Garante datas padrão na memória do sistema (Últimos 30 dias)
  if (!state.fuelStart || !state.fuelEnd) {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    state.fuelStart = d.toISOString().split('T')[0];
    state.fuelEnd = new Date().toISOString().split('T')[0];
  }

  // Carrega o calendário novo e o Chart.js
  setTimeout(() => {
    loadFlatpickr(() => {
      flatpickr("#fuel-date-range", {
        mode: "range",
        dateFormat: "Y-m-d",
        locale: "pt",
        defaultDate: [state.fuelStart, state.fuelEnd],
        onClose: function(selectedDates) {
          if (selectedDates.length === 2) {
            state.fuelStart = selectedDates[0].toISOString().split('T')[0];
            state.fuelEnd = selectedDates[1].toISOString().split('T')[0];
          }
        }
      });
    });
    if (typeof loadChartJs === 'function') loadChartJs(renderFuelCharts);
    else renderFuelCharts();
  }, 150);

  return `
    <div class="hero">
      <div><div class="eyebrow">⛽ ABASTECIMENTOS</div><h1>Análise e Projeção de Gastos</h1></div>
    </div>
    
    <div class="card" style="margin-bottom: 16px;">
      <div class="form-grid" style="grid-template-columns: 1fr 1.5fr 1fr auto; gap: 12px; margin: 0; align-items: end;">
        <div class="field" style="margin: 0;">
          <label>Visualização:</label>
          <select id="fuel-chart-type" onchange="renderFuelCharts()">
            <option value="line">F1 + Projeção (60 Dias)</option>
            <option value="bar">Gasto Real (Barras)</option>
            <option value="mixed">Ambos (Mesclado)</option>
          </select>
        </div>
        
        <div class="field" style="margin: 0;">
          <label>Período (Início até Fim):</label>
          <!-- 🎯 CORRIGIDO: Removido o SVG inline problemático que estava vazando texto -->
          <input type="text" id="fuel-date-range" placeholder="Selecione as datas..." style="background:#fff; cursor:pointer;" readonly>
        </div>

        <div class="field" style="margin: 0;">
          <label>Datas fixas:</label>
          <select id="fuel-preset-dates" onchange="applyPresetDate()">
            <option value="">Personalizado</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 3 meses</option>
            <option value="thisMonth">Este mês</option>
          </select>
        </div>
        
        <button class="primary" style="padding: 13px 20px;" onclick="renderFuelCharts()">FILTRAR</button>
      </div>
    </div>

    <div class="card" style="background-color: #1e1e24; border: 1px solid #333; margin-bottom: 16px;">
      <div class="section-title"><h2 id="chart-title" style="color: #fff; margin-bottom: 15px;">Progresso de Gastos</h2></div>
      <div style="position: relative; height: 400px; width: 100%;">
        <canvas id="mainChart"></canvas>
      </div>
    </div>

    <div class="card table-wrap">
      <table class="table">
        <thead><tr><th>Data/Hora</th><th>Placa</th><th>Motorista</th><th>Diesel</th><th>Litros</th><th>Valor</th><th>KM</th></tr></thead>
        <tbody id="fuel-table-body"></tbody>
      </table>
    </div>`; 
}

function renderFuelCharts() {
  try {
    const ctx = document.getElementById('mainChart');
    if (!ctx) return; 

    // Lê direto da memória do estado ao invés do input solto
    const startTs = state.fuelStart ? new Date(state.fuelStart + 'T00:00:00').getTime() : 0;
    const endTs = state.fuelEnd ? new Date(state.fuelEnd + 'T23:59:59').getTime() : 9999999999999;
    
    const viewTypeEl = document.getElementById('fuel-chart-type');
    const viewType = viewTypeEl ? viewTypeEl.value : 'line';

    const titleEl = document.getElementById('chart-title');
    if (titleEl) {
      if (viewType === 'bar') titleEl.innerText = 'Gasto Real (Total por Caminhão)';
      else if (viewType === 'line') titleEl.innerText = 'Histórico Real + Projeção Inteligente';
      else titleEl.innerText = 'Gasto Diário vs Projeção Acumulada';
    }

    // 🛡️ TRADUTOR DE DATAS BLINDADO (Fim definitivo do "Tue O" e do bug de fuso horário)
    function parseSafeDate(val) {
      if (!val) return { ts: 0, text: '—', short: '—' };
      let s = String(val).trim();
      let ts = 0, text = s, short = s.substring(0, 5);
      
      const matchIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (matchIso) {
        ts = new Date(`${matchIso[1]}-${matchIso[2]}-${matchIso[3]}T12:00:00`).getTime();
        text = `${matchIso[3]}/${matchIso[2]}/${matchIso[1]}`;
        short = `${matchIso[3]}/${matchIso[2]}`;
        return { ts, text, short };
      }
      
      const matchBr = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (matchBr) {
        ts = new Date(`${matchBr[3]}-${matchBr[2]}-${matchBr[1]}T12:00:00`).getTime();
        text = `${matchBr[1]}/${matchBr[2]}/${matchBr[3]}`;
        short = `${matchBr[1]}/${matchBr[2]}`;
        return { ts, text, short };
      }
      
      let d = new Date(val);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        ts = new Date(`${year}-${month}-${day}T12:00:00`).getTime();
        text = `${day}/${month}/${year}`;
        short = `${day}/${month}`;
      }
      return { ts: ts || 0, text, short };
    }

    let allFuelsRaw = [];
    if (typeof window.data !== 'undefined' && Array.isArray(window.data.fuels)) {
      allFuelsRaw = window.data.fuels;
    } else if (typeof data !== 'undefined' && Array.isArray(data.fuels)) {
      allFuelsRaw = data.fuels;
    }

    const allMappedFuels = allFuelsRaw.map(f => {
      const pd = parseSafeDate(f.date || f.data);
      return { ...f, _ts: pd.ts, _textDate: pd.text, _shortDate: pd.short };
    }).sort((a, b) => a._ts - b._ts);

    const filteredFuels = allMappedFuels.filter(f => {
      if (f._ts === 0) return true; 
      return f._ts >= startTs && f._ts <= endTs;
    });

    const tableBody = document.getElementById('fuel-table-body');
    if (tableBody) {
      tableBody.innerHTML = filteredFuels.map(f => {
        const vId = f.veiculoId || f.id_veiculo;
        const v = typeof veh === 'function' ? veh(vId) : null;
        const placa = v ? (v.placa || v.ident) : (vId || '—');
        const motId = f.motoristaId || f.id_motorista;
        const motNome = (typeof driverBy === 'function' && driverBy(motId)) ? driverBy(motId).nome : 'Robô / Posto';
        
        return `
          <tr>
            <td>${f._textDate} ${f.hora || ''}</td>
            <td><strong>${placa}</strong></td>
            <td>${motNome}</td>
            <td>${f.tipoDiesel || f.tipo_diesel || 'Diesel S10'}</td>
            <td>${f.litrosDiesel || f.litros_diesel || 0} L</td>
            <td>R$ ${Number(f.valorDiesel || f.valor_diesel || 0).toFixed(2)}</td>
            <td>${typeof km === 'function' ? km(f.km || f.km_atual) : (f.km || 0)}</td>
          </tr>`;
      }).join('') || '<tr><td colspan="7" style="text-align:center; padding: 20px;">Nenhum abastecimento encontrado nesse período.</td></tr>';
    }

    const learningBaseline = {};
    const ms60Dias = 60 * 24 * 60 * 60 * 1000;
    const agoraTs = Date.now();

    allMappedFuels.forEach(f => {
      const vId = f.veiculoId || f.id_veiculo;
      if (!vId) return;
      const v = typeof veh === 'function' ? veh(vId) : null;
      const placa = v ? (v.placa || v.ident) : ('Veículo ' + String(vId).substring(0, 5));

      if (f._ts >= (agoraTs - ms60Dias)) {
        if (!learningBaseline[placa]) {
          learningBaseline[placa] = { totalGasto: 0, kmMin: 0, kmMax: 0, tsMin: f._ts, tsMax: f._ts, qtd: 0 };
        }
        const val = Number(f.valorDiesel || f.valor_diesel) || 0;
        const kmAtual = Number(f.km || f.km_atual) || 0;

        learningBaseline[placa].totalGasto += val;
        learningBaseline[placa].qtd++;
        if (f._ts < learningBaseline[placa].tsMin) learningBaseline[placa].tsMin = f._ts;
        if (f._ts > learningBaseline[placa].tsMax) learningBaseline[placa].tsMax = f._ts;

        if (kmAtual > 0) {
          if (learningBaseline[placa].kmMin === 0 || kmAtual < learningBaseline[placa].kmMin) learningBaseline[placa].kmMin = kmAtual;
          if (kmAtual > learningBaseline[placa].kmMax) learningBaseline[placa].kmMax = kmAtual;
        }
      }
    });

    const colors = ['#FF4C4C', '#00D2FF', '#FFD700', '#00FF7F', '#BA55D3', '#FF8C00', '#C0C0C0', '#1E90FF'];
    const trucksData = {};
    let colorIdx = 0;

    filteredFuels.forEach(f => {
      const vId = f.veiculoId || f.id_veiculo;
      if (!vId) return;
      const v = typeof veh === 'function' ? veh(vId) : null;
      const placa = v ? (v.placa || v.ident) : ('Veículo ' + String(vId).substring(0, 5));
      const dataCurta = f._shortDate;
      
      const kmAtual = Number(f.km || f.km_atual) || 0;

      if (!trucksData[placa]) {
        trucksData[placa] = { 
          totalGasto: 0, 
          kml: (v && typeof allVehicleMetric === 'function') ? allVehicleMetric(v.id).avg : 0, 
          color: colors[colorIdx++ % colors.length], 
          diario: {},
          tsPrimeiroAbast: f._ts,
          tsUltimoAbast: f._ts,
          kmMin: kmAtual,
          kmMax: kmAtual,
          qtdAbastMes: 0
        };
      }
      
      const val = Number(f.valorDiesel || f.valor_diesel) || 0;
      trucksData[placa].totalGasto += val;
      trucksData[placa].qtdAbastMes++;

      if (f._ts < trucksData[placa].tsPrimeiroAbast) trucksData[placa].tsPrimeiroAbast = f._ts;
      if (f._ts > trucksData[placa].tsUltimoAbast) trucksData[placa].tsUltimoAbast = f._ts;

      if (kmAtual > 0) {
        if (trucksData[placa].kmMin === 0 || kmAtual < trucksData[placa].kmMin) trucksData[placa].kmMin = kmAtual;
        if (kmAtual > trucksData[placa].kmMax) trucksData[placa].kmMax = kmAtual;
      }

      if (!trucksData[placa].diario[dataCurta]) trucksData[placa].diario[dataCurta] = 0;
      trucksData[placa].diario[dataCurta] += val;
    });

    // 🎯 MUDANÇA: TIMELINE ESTRITA E PRECISA! 
    // Gera a linha do tempo EXATAMENTE dentro do limite do filtro selecionado, nem um dia a mais nem a menos.
    let timeline = [];
    const baseStart = startTs > 0 ? startTs : (Date.now() - (30 * 24 * 60 * 60 * 1000));
    const baseEnd = endTs < 9999999999999 ? endTs : Date.now();
    
    let iterDate = new Date(baseStart);
    iterDate.setHours(12, 0, 0, 0); // Trava o relógio no meio-dia pra evitar bug de meia-noite
    const limitDate = new Date(baseEnd);
    limitDate.setHours(12, 0, 0, 0);
    
    while (iterDate <= limitDate) {
      const dd = String(iterDate.getDate()).padStart(2, '0');
      const mm = String(iterDate.getMonth() + 1).padStart(2, '0');
      timeline.push(`${dd}/${mm}`);
      iterDate.setDate(iterDate.getDate() + 1);
    }

    const labelsPlacas = Object.keys(trucksData);
    const datasets = [];

    if (viewType === 'bar') {
      datasets.push({
        type: 'bar',
        label: 'Gasto Total',
        data: labelsPlacas.map(p => trucksData[p].totalGasto),
        backgroundColor: labelsPlacas.map(p => trucksData[p].color),
        borderRadius: 4,
        hoverBorderWidth: 2,
        hoverBorderColor: '#fff',
        barPercentage: 0.9, 
        categoryPercentage: 0.95 
      });
    } else {
      labelsPlacas.forEach(placa => {
        const truck = trucksData[placa];
        let acumulado = 0;
        let idxUltimoDiaReal = 0;

        const msHoje = Date.now();
        const diasSemAbastecer = (msHoje - truck.tsUltimoAbast) / (1000 * 60 * 60 * 24);
        
        let mediaDiariaProjetada = 0;

        if (diasSemAbastecer <= 5) { 
          const kmTotalMes = Math.max(0, truck.kmMax - truck.kmMin);
          const diasNoMes = Math.max(1, Math.ceil((truck.tsUltimoAbast - truck.tsPrimeiroAbast) / (1000 * 60 * 60 * 24)));
          let mediaDiariaMesAtual = 0;
          
          if (kmTotalMes > 0) {
            mediaDiariaMesAtual = (kmTotalMes / diasNoMes) * (truck.totalGasto / kmTotalMes);
          } else {
            mediaDiariaMesAtual = truck.totalGasto / diasNoMes;
          }

          const baseH = learningBaseline[placa];
          let mediaDiariaHistorica = mediaDiariaMesAtual;
          if (baseH && baseH.qtd > 1) {
            const diasH = Math.max(1, Math.ceil((baseH.tsMax - baseH.tsMin) / (1000 * 60 * 60 * 24)));
            const kmH = (baseH.kmMax > baseH.kmMin) ? (baseH.kmMax - baseH.kmMin) : 0;
            if (kmH > 0) {
              mediaDiariaHistorica = (kmH / diasH) * (baseH.totalGasto / kmH);
            } else {
              mediaDiariaHistorica = baseH.totalGasto / diasH;
            }
          }

          if (truck.qtdAbastMes <= 2) {
            mediaDiariaProjetada = (mediaDiariaHistorica * 0.8) + (mediaDiariaMesAtual * 0.2);
          } else {
            mediaDiariaProjetada = (mediaDiariaMesAtual * 0.6) + (mediaDiariaHistorica * 0.4);
          }
        }

        timeline.forEach((d, idx) => {
          if (truck.diario[d] !== undefined) {
            idxUltimoDiaReal = idx;
          }
        });

        let ultimoAcumuladoReal = 0;
        const dadosContinuos = timeline.map((d, idx) => {
          if (idx <= idxUltimoDiaReal) {
            if (truck.diario[d] !== undefined) {
              acumulado += truck.diario[d];
            }
            ultimoAcumuladoReal = acumulado;
            return acumulado;
          } else {
            const diasFuturos = idx - idxUltimoDiaReal;
            const valorProjetado = ultimoAcumuladoReal + (mediaDiariaProjetada * diasFuturos);
            return Math.round(valorProjetado * 100) / 100;
          }
        });

        if (viewType === 'mixed') {
          const dataDiaria = timeline.map(d => truck.diario[d] || 0);
          datasets.push({
            type: 'bar',
            label: placa + ' (Dia)',
            data: dataDiaria,
            backgroundColor: truck.color,
            borderRadius: 3,
            placaRef: placa,
            barPercentage: 1.0,
            categoryPercentage: 1.0
          });
        }

        datasets.push({
          type: 'line',
          label: placa,
          data: dadosContinuos,
          borderColor: truck.color,
          backgroundColor: truck.color,
          borderWidth: 2,
          tension: 0.1,
          pointRadius: ctx => (ctx.dataIndex !== undefined && ctx.dataIndex <= idxUltimoDiaReal ? 3 : 1),
          pointHoverRadius: 7,
          placaRef: placa,
          idxUltimoReal: idxUltimoDiaReal,
          segment: {
            borderDash: ctx => (ctx.p0DataIndex !== undefined && ctx.p0DataIndex >= idxUltimoDiaReal ? [6, 6] : undefined)
          }
        });
      });
    }

    if (mainFuelChart) {
      mainFuelChart.destroy();
      mainFuelChart = null;
    }

    if (window.Chart && typeof glowPlugin !== 'undefined') {
      try { Chart.register(glowPlugin); } catch(e) {}
    }

    const customTooltip = {
      backgroundColor: 'rgba(20, 20, 25, 0.95)',
      titleColor: '#fff',
      bodyColor: '#ddd',
      borderColor: '#444',
      borderWidth: 1,
      callbacks: {
        label: function(context) {
          const valor = context.raw.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

          // 1. Se for o Gráfico APENAS de Barras (Gasto Total)
          if (viewType === 'bar') {
            const placa = context.label;
            const kml = (trucksData[placa] && trucksData[placa].kml) ? trucksData[placa].kml.toFixed(2) + ' km/L' : 'Sem dados';
            return ` Gasto Total: ${valor}  |  Média: ${kml}`;
          }

          const placa = context.dataset.placaRef || context.dataset.label;

          // 2. Se for uma BARRA dentro do Gráfico Misto (Gasto do Dia)
          if (context.dataset.type === 'bar') {
            return ` ${placa} (Gasto no Dia): ${valor}`;
          }

          // 3. Se for uma LINHA (Acumulado ou Projeção)
          const isFuturo = context.dataIndex > (context.dataset.idxUltimoReal || 0);
          const tipoLabel = isFuturo ? '🔮 Projeção Aprendida' : 'Real Acumulado';
          
          return ` ${placa} (${tipoLabel}): ${valor}`;
        }
      }
    };

    mainFuelChart = new Chart(ctx.getContext('2d'), {
      data: {
        labels: viewType === 'bar' ? labelsPlacas : timeline,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'nearest',
          // 🎯 CORRIGIDO: Agora exige que o mouse ENCOSTE fisicamente no ponto/linha (true)
          intersect: true
        },
        plugins: {
          legend: {
            display: viewType !== 'bar',
            position: 'left',
            labels: { color: '#ccc', usePointStyle: true, boxWidth: 8 },
            onHover: (e, legendItem, legend) => {
              const chart = legend.chart;
              if (chart) {
                const dsIndex = legendItem.datasetIndex;
                const ds = chart.data.datasets[dsIndex];
                
                // 🎯 A CORREÇÃO: Em vez de acender só o 'index: 0', 
                // mapeia e acende TODOS os dias que esse caminhão tem no gráfico de uma vez!
                const elementsToActive = ds.data.map((_, i) => ({ datasetIndex: dsIndex, index: i }));
                
                chart.setActiveElements(elementsToActive);
                chart.update();
              }
            },
            onLeave: (e, legendItem, legend) => {
              const chart = legend.chart;
              if (chart) {
                chart.setActiveElements([]);
                chart.update();
              }
            }
          },
          tooltip: customTooltip
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.1)', borderDash: [5, 5] },
            ticks: { color: '#aaa', callback: (val) => 'R$ ' + val }
          },
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#aaa' }
          }
        }
      }
    });
  } catch (err) {
    console.error("Erro ao renderizar gráficos de abastecimento:", err);
  }
}

// Iniciação
loadFromSheets();
