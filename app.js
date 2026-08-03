// ============================================================
// CONFIGURAÇÃO — troque pela URL do seu Apps Script implantado
// (a que termina em /exec, copiada depois de "Nova implantação")
// ============================================================
const CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwYHcuyL3Gz5sKM2JJXNloCqnluZqZQAweCsLTiTGmc6OKN3BAccQfleELu8_0NYm0/exec',
  NOME_USUARIO: 'Maria Clara' // por enquanto fixo; dá pra virar um campo de login simples depois
};

const CATEGORIAS_PADRAO = [
  'Limpeza', 'Higiene', 'Laticínios', 'Carnes', 'Padaria',
  'Mercearia', 'Doces/Snacks', 'Bebidas', 'Descartáveis',
  'Hortifruti/Ovos', 'Congelados'
];

// ---------- Registro do Service Worker (deixa o app instalável) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js');
  });
}

// ---------- Navegação entre telas (tudo local, nunca chama API) ----------
function irPara(idTela) {
  document.querySelectorAll('.tela').forEach(function (t) { t.classList.remove('ativa'); });
  document.getElementById(idTela).classList.add('ativa');
  document.querySelectorAll('.rodape button').forEach(function (b) {
    b.classList.toggle('ativo', b.dataset.irPara === idTela);
  });
  if (idTela === 'tela-falta') carregarFalta();
}

document.querySelectorAll('[data-ir-para]').forEach(function (el) {
  el.addEventListener('click', function () { irPara(el.dataset.irPara); });
});

// ---------- Status de conexão (só informativo — não dispara nada sozinho) ----------
function atualizarStatusConexao() {
  const el = document.getElementById('status-conexao');
  if (navigator.onLine) {
    el.textContent = 'Online';
    el.className = 'status online';
  } else {
    el.textContent = 'Offline — mostrando dados salvos';
    el.className = 'status offline';
  }
}
window.addEventListener('online', atualizarStatusConexao);
window.addEventListener('offline', atualizarStatusConexao);

// ---------- Cache local (localStorage) ----------
function salvarCache(chave, dados) {
  localStorage.setItem(chave, JSON.stringify({ dados: dados, atualizadoEm: new Date().toISOString() }));
}
function lerCache(chave) {
  const bruto = localStorage.getItem(chave);
  if (!bruto) return null;
  try { return JSON.parse(bruto); } catch (e) { return null; }
}

// ---------- Chamada ao Apps Script ----------
// GET: usado pra buscar dados (ex.: lista de falta, dashboards)
function chamarApiGet(action, params) {
  const url = new URL(CONFIG.APPS_SCRIPT_URL);
  url.searchParams.set('action', action);
  Object.keys(params || {}).forEach(function (k) { url.searchParams.set(k, params[k]); });
  return fetch(url.toString()).then(function (r) { return r.json(); });
}

// POST: usado pra gravar dados (nova compra, falta, resolver falta)
// Content-Type text/plain evita o preflight OPTIONS, que o Apps Script não responde.
function chamarApiPost(action, body) {
  return fetch(CONFIG.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action }, body))
  }).then(function (r) { return r.json(); });
}

// ---------- Categorias (dropdown) ----------
function preencherCategorias() {
  const select = document.getElementById('input-categoria-falta');
  const cacheCategorias = lerCache('categorias');
  const lista = (cacheCategorias && cacheCategorias.dados) || CATEGORIAS_PADRAO;
  select.innerHTML = lista.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');

  if (navigator.onLine) {
    chamarApiGet('getCategorias').then(function (dados) {
      if (Array.isArray(dados) && dados.length) {
        salvarCache('categorias', dados);
        select.innerHTML = dados.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
      }
    }).catch(function () { /* mantém o que já tinha */ });
  }
}

// ---------- Tela: Produtos em falta ----------
function renderizarFalta(itens) {
  const lista = document.getElementById('lista-falta');
  if (!itens || !itens.length) {
    lista.innerHTML = '<li>Nenhum produto em falta no momento.</li>';
    return;
  }
  lista.innerHTML = itens.map(function (item, i) {
    return '<li>' +
      '<span class="info"><span>' + item.tipoProduto + '</span>' +
      '<span class="categoria">' + item.categoria + '</span></span>' +
      '<button data-resolver="' + i + '">Já comprei</button>' +
      '</li>';
  }).join('');

  lista.querySelectorAll('[data-resolver]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const item = itens[Number(btn.dataset.resolver)];
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      chamarApiPost('resolveFalta', { tipoProduto: item.tipoProduto }).then(function (resp) {
        if (resp.sucesso) { carregarFalta(); }
        else { mostrarMensagemFalta(resp.erro || 'Não foi possível atualizar.', true); btn.disabled = false; btn.textContent = 'Já comprei'; }
      }).catch(function () {
        mostrarMensagemFalta('Sem conexão — tente novamente quando estiver online.', true);
        btn.disabled = false; btn.textContent = 'Já comprei';
      });
    });
  });
}

function carregarFalta() {
  const cache = lerCache('estoqueFalta');
  if (cache) renderizarFalta(cache.dados);

  if (!navigator.onLine) {
    if (!cache) mostrarMensagemFalta('Offline e sem dados salvos ainda.', true);
    return;
  }
  chamarApiGet('getEstoqueFalta').then(function (dados) {
    salvarCache('estoqueFalta', dados);
    renderizarFalta(dados);
  }).catch(function () {
    if (!cache) mostrarMensagemFalta('Não foi possível carregar. Verifique a URL do Apps Script.', true);
  });
}

function mostrarMensagemFalta(texto, erro) {
  const el = document.getElementById('mensagem-falta');
  el.textContent = texto;
  el.className = 'mensagem ' + (erro ? 'erro' : 'ok');
}

document.getElementById('form-nova-falta').addEventListener('submit', function (e) {
  e.preventDefault();
  const tipoProduto = document.getElementById('input-tipo-produto').value.trim();
  const categoria = document.getElementById('input-categoria-falta').value;
  if (!tipoProduto) return;

  if (!navigator.onLine) {
    mostrarMensagemFalta('Você está offline — conecte-se para sinalizar a falta.', true);
    return;
  }

  mostrarMensagemFalta('Enviando…', false);
  chamarApiPost('flagFalta', {
    tipoProduto: tipoProduto,
    categoria: categoria,
    sinalizadoPor: CONFIG.NOME_USUARIO
  }).then(function (resp) {
    if (resp.sucesso) {
      document.getElementById('input-tipo-produto').value = '';
      mostrarMensagemFalta('Sinalizado com sucesso.', false);
      carregarFalta();
    } else {
      mostrarMensagemFalta(resp.erro || 'Não foi possível sinalizar.', true);
    }
  }).catch(function () {
    mostrarMensagemFalta('Falha de conexão. Tente novamente.', true);
  });
});

// ---------- Inicialização ----------
atualizarStatusConexao();
preencherCategorias();
irPara('tela-inicio');
