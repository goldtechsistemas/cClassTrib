/*
 * Painel administrativo (admin.html) — login próprio (conta separada dos
 * usuários comuns, tabela `admins` no Postgres) e gestão de usuários:
 * criar (com senha provisória — o usuário define a própria no primeiro
 * acesso), redefinir senha (nova provisória, mesmo fluxo), listar,
 * bloquear/desbloquear, controlar assinatura/cobrança (data da assinatura,
 * próximo vencimento e baixa de pagamentos), ver detalhes e excluir (com
 * confirmação dupla: modal + digitar o e-mail da conta).
 */
(function () {
  "use strict";

  const viewLogin = document.getElementById("view-login");
  const viewPainel = document.getElementById("view-painel");

  async function postJson(url, corpo) {
    let resposta;
    try {
      resposta = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(corpo || {}),
      });
    } catch (e) {
      return { ok: false, erro: "Não foi possível conectar ao servidor." };
    }
    let dados = {};
    try { dados = await resposta.json(); } catch (e) {}
    if (dados.ok === undefined) dados.ok = resposta.ok;
    return dados;
  }

  async function chamarApi(url, opcoes) {
    let resposta;
    try {
      resposta = await fetch(url, Object.assign({ credentials: "same-origin" }, opcoes));
    } catch (e) {
      return { ok: false, erro: "Não foi possível conectar ao servidor.", status: 0 };
    }
    let dados = {};
    try { dados = await resposta.json(); } catch (e) {}
    if (dados.ok === undefined) dados.ok = resposta.ok;
    dados.status = resposta.status;
    return dados;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function formatarData(iso) {
    try {
      return new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
      });
    } catch (e) {
      return iso;
    }
  }

  function mostrarAvisoPainel(msg, tipo) {
    const el = document.getElementById("aviso-admin");
    if (!msg) { el.innerHTML = ""; return; }
    el.innerHTML = `<div class="aviso-legal" style="border-color:${tipo === "erro" ? "var(--vermelho)" : "var(--verde)"}">${esc(msg)}</div>`;
  }

  // ---------- Login ----------

  function mostrarErroLogin(msg) {
    const el = document.getElementById("erro-admin-login");
    el.textContent = msg;
    el.style.display = "block";
  }

  async function tentarEntrar() {
    const erroEl = document.getElementById("erro-admin-login");
    erroEl.style.display = "none";
    const email = document.getElementById("input-admin-email").value.trim();
    const senha = document.getElementById("input-admin-senha").value;
    if (!email || !senha) { mostrarErroLogin("Preencha e-mail e senha."); return; }

    const btn = document.getElementById("btn-admin-entrar");
    btn.disabled = true;
    btn.textContent = "Entrando...";
    try {
      const resultado = await postJson("/api/admin/login", { email, senha });
      if (!resultado.ok) { mostrarErroLogin(resultado.erro || "E-mail ou senha incorretos."); return; }
      mostrarPainel(resultado.email);
    } finally {
      btn.disabled = false;
      btn.textContent = "Entrar";
    }
  }

  // ---------- Alterar a senha do admin ----------

  function erroSenhas(msg) {
    const el = document.getElementById("erro-senhas");
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
  }

  function abrirModalSenhas() {
    ["senhas-atual", "senhas-nova", "senhas-nova-conf"].forEach((id) => { document.getElementById(id).value = ""; });
    erroSenhas("");
    document.getElementById("modal-senhas-overlay").classList.add("aberto");
  }

  async function salvarSenhas() {
    const v = (id) => document.getElementById(id).value;
    const corpo = { etapa: "alterar", senhaAtual: v("senhas-atual"), novaSenha: v("senhas-nova"), confirmarSenha: v("senhas-nova-conf") };
    if (!corpo.senhaAtual) { erroSenhas("Informe a senha atual."); return; }
    if (corpo.novaSenha.length < 8) { erroSenhas("A nova senha precisa ter no mínimo 8 caracteres."); return; }
    if (corpo.novaSenha !== corpo.confirmarSenha) { erroSenhas("As duas digitações da nova senha não conferem."); return; }
    const btn = document.getElementById("btn-salvar-senhas");
    btn.disabled = true;
    try {
      const r = await chamarApi("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      if (r.status === 401 && /autorizado/i.test(r.erro || "")) { document.getElementById("modal-senhas-overlay").classList.remove("aberto"); voltarParaLogin(); return; }
      if (!r.ok) { erroSenhas(r.erro || "Não foi possível alterar a senha."); return; }
      document.getElementById("modal-senhas-overlay").classList.remove("aberto");
      mostrarAvisoPainel("Senha alterada.", "ok");
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Painel / lista de usuários ----------

  let usuarioParaExcluir = null; // {id, email}

  function mostrarPainel(emailAdmin) {
    viewLogin.style.display = "none";
    viewPainel.style.display = "";
    document.getElementById("texto-admin-logado").textContent = "Logado como " + emailAdmin;
    carregarUsuarios();
    carregarRelatorioXml();
  }

  // ---------- Relatório: XMLs baixados por empresa, por mês ----------
  const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  let relatorioXml = null;

  function rotuloMesXml(mes) {
    const m = String(mes || "").match(/^(\d{4})-(\d{2})$/);
    if (!m) return mes;
    const nome = MESES_LONGOS[Number(m[2]) - 1];
    return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${m[1]}`;
  }

  async function carregarRelatorioXml() {
    const select = document.getElementById("select-mes-xml");
    const corpo = document.getElementById("xml-body");
    corpo.innerHTML = `<tr><td colspan="5">Carregando...</td></tr>`;
    const mes = select.value || "";
    const resultado = await chamarApi(`/api/admin/xml-mensal${mes ? "?mes=" + encodeURIComponent(mes) : ""}`);
    if (resultado.status === 401) { voltarParaLogin(); return; }
    if (!resultado.ok) {
      corpo.innerHTML = `<tr><td colspan="5">${esc(resultado.erro || "Erro ao carregar o relatório.")}</td></tr>`;
      return;
    }
    relatorioXml = resultado;

    // Seletor: todos os meses com XML + o mês atual (mesmo que ainda zerado).
    const meses = new Map(resultado.mesesDisponiveis.map((x) => [x.mes, x.total]));
    if (!meses.has(resultado.mes)) meses.set(resultado.mes, 0);
    const ordenados = Array.from(meses.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    select.innerHTML = ordenados
      .map(([m, total]) => `<option value="${esc(m)}"${m === resultado.mes ? " selected" : ""}>${esc(rotuloMesXml(m))} — ${total} XML(s)</option>`)
      .join("");

    document.getElementById("xml-resumo").innerHTML = `
      <div class="xml-cartao destaque"><strong>${resultado.totais.xmlsNoMes}</strong><span>XMLs em ${esc(rotuloMesXml(resultado.mes))}</span></div>
      <div class="xml-cartao"><strong>${resultado.totais.loginsComXmlNoMes}</strong><span>login(s) com XML no mês</span></div>
      <div class="xml-cartao"><strong>${resultado.totais.logins}</strong><span>login(s) cadastrados · ${resultado.totais.empresas} empresa(s)</span></div>
      <div class="xml-cartao"><strong>${resultado.totais.xmlsAcumulado}</strong><span>XMLs no total, desde o início</span></div>`;

    if (!resultado.usuarios.length) {
      corpo.innerHTML = `<tr><td colspan="5">Nenhum usuário cadastrado ainda.</td></tr>`;
    } else {
      corpo.innerHTML = resultado.usuarios
        .map((u) => {
          const temEmpresas = u.empresas.length > 0;
          const detalhe = u.empresas
            .map(
              (e) => `<tr class="xml-emp" data-uid="${u.usuarioId}" hidden>
                <td colspan="2"><span class="xml-emp-nome">${esc(e.razaoSocial || "—")}</span> <span class="hint mono" style="margin:0;">${esc(formatarDocumento(e.cnpj))}</span></td>
                <td class="col-valor">${e.xmlsNoMes}</td>
                <td class="col-valor">${e.xmlsTotal}</td>
                <td>${e.ultimaSincronizacao ? esc(formatarData(e.ultimaSincronizacao)) : "Nunca"}</td>
              </tr>`
            )
            .join("");
          return `<tr class="xml-user${u.xmlsNoMes ? "" : " xml-zerado"}" data-uid="${u.usuarioId}"${temEmpresas ? ' tabindex="0" role="button" aria-expanded="false"' : ""}>
              <td>
                <span class="xml-seta" aria-hidden="true">${temEmpresas ? "▸" : ""}</span>
                <strong>${esc(u.usuarioNome || "—")}</strong>${u.bloqueado ? ' <span class="badge cor-vermelho">Bloqueado</span>' : ""}
                <div class="hint" style="margin:0 0 0 16px;">${esc(u.usuarioEmail)}</div>
              </td>
              <td class="col-valor">${u.qtdEmpresas}</td>
              <td class="col-valor"><strong>${u.xmlsNoMes}</strong></td>
              <td class="col-valor">${u.xmlsTotal}</td>
              <td>${u.ultimaSincronizacao ? esc(formatarData(u.ultimaSincronizacao)) : "Nunca"}</td>
            </tr>${detalhe}`;
        })
        .join("");
    }
    document.getElementById("xml-nota").textContent =
      "Conta cada XML completo uma única vez, no dia em que chegou da SEFAZ (fuso de Brasília). XMLs que já existiam antes desse registro passaram a valer pela data em que a nota entrou no sistema.";
  }

  // Clicar (ou Enter) no login abre/fecha a lista das empresas dele.
  function alternarEmpresasDoLogin(linha) {
    if (!linha || !linha.classList.contains("xml-user") || !linha.hasAttribute("role")) return;
    const abrir = linha.getAttribute("aria-expanded") !== "true";
    linha.setAttribute("aria-expanded", String(abrir));
    linha.classList.toggle("aberto", abrir);
    linha.querySelector(".xml-seta").textContent = abrir ? "▾" : "▸";
    document.querySelectorAll(`#xml-body tr.xml-emp[data-uid="${linha.dataset.uid}"]`).forEach((tr) => { tr.hidden = !abrir; });
  }
  document.getElementById("xml-body").addEventListener("click", (e) => alternarEmpresasDoLogin(e.target.closest("tr.xml-user")));
  document.getElementById("xml-body").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const linha = e.target.closest("tr.xml-user");
      if (linha) { e.preventDefault(); alternarEmpresasDoLogin(linha); }
    }
  });

  function baixarCsv(nome, linhas) {
    const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  // Uma linha por LOGIN (o total que importa para conferir/cobrar).
  function exportarRelatorioXml() {
    if (!relatorioXml) return;
    const linhas = [["Mês", "Login (nome)", "E-mail", "Empresas", "XMLs no mês", "Total acumulado"]];
    relatorioXml.usuarios.forEach((u) => linhas.push([relatorioXml.mes, u.usuarioNome || "", u.usuarioEmail, u.qtdEmpresas, u.xmlsNoMes, u.xmlsTotal]));
    baixarCsv(`xmls-por-login-${relatorioXml.mes}.csv`, linhas);
  }

  // Detalhado: uma linha por empresa (certificado).
  function exportarRelatorioXmlEmpresas() {
    if (!relatorioXml) return;
    const linhas = [["Mês", "Login (nome)", "E-mail", "Empresa", "CNPJ/CPF", "XMLs no mês", "Total acumulado"]];
    relatorioXml.usuarios.forEach((u) =>
      u.empresas.forEach((e) => linhas.push([relatorioXml.mes, u.usuarioNome || "", u.usuarioEmail, e.razaoSocial || "", e.cnpj, e.xmlsNoMes, e.xmlsTotal]))
    );
    baixarCsv(`xmls-por-empresa-${relatorioXml.mes}.csv`, linhas);
  }

  function textoStatus(u) {
    if (u.bloqueado) return "Bloqueado";
    return u.precisa_trocar_senha ? "Aguardando 1º acesso" : "Ativo";
  }

  // ---------- Assinaturas e cobranças ----------

  const MESES_PERIODO = { 1: "Mensal", 2: "Bimestral", 3: "Trimestral", 6: "Semestral", 12: "Anual" };

  // Datas da cobrança são AAAA-MM-DD puras: formata cortando o texto, sem Date
  // (evita o deslocamento de um dia por fuso horário).
  function dataBr(iso) {
    return /^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—";
  }

  function moeda(v) {
    return v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function hojeBrasilia() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  }

  // Mesma regra do servidor: soma meses mantendo o dia de cobrança (31 → 28/fev → 31/mar).
  function somarMesesIso(iso, n, diaBase) {
    const a = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)), d = Number(iso.slice(8, 10));
    const total = m - 1 + n;
    const ano = a + Math.floor(total / 12);
    const mes = ((total % 12) + 12) % 12;
    const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
    return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(Math.min(diaBase || d, ultimo)).padStart(2, "0")}`;
  }

  // Situação: semassinatura | atrasado | vencendo (hoje até 7 dias) | emdia
  function situacaoCobranca(c) {
    if (!c || !c.proximoVencimento) return { chave: "semassinatura", cor: "neutro-fraco", texto: "Sem assinatura" };
    const d = c.diasParaVencer;
    if (d < 0) return { chave: "atrasado", cor: "vermelho", texto: `Atrasado há ${-d} dia${d === -1 ? "" : "s"}` };
    if (d === 0) return { chave: "vencendo", cor: "amarelo", texto: "Vence hoje" };
    if (d <= 7) return { chave: "vencendo", cor: "amarelo", texto: `Vence em ${d} dia${d === 1 ? "" : "s"}` };
    return { chave: "emdia", cor: "verde", texto: "Em dia" };
  }

  function celulaAssinatura(u) {
    const c = u.cobranca;
    const sit = situacaoCobranca(c);
    if (sit.chave === "semassinatura") return `<span class="badge cor-neutro-fraco">${sit.texto}</span>`;
    return `<div class="cob-celula">
        <span class="badge cor-${sit.cor}">${esc(sit.texto)}</span>
        <span class="cob-data">Próx. vencimento: <strong>${dataBr(c.proximoVencimento)}</strong></span>
        <span class="cob-valor">${esc(MESES_PERIODO[c.periodicidadeMeses] || "")}${c.valorCobranca != null ? " · " + moeda(c.valorCobranca) : ""}</span>
      </div>`;
  }

  let resumoCobranca = null;
  let filtroCobranca = "todos";

  function renderizarResumoCobranca() {
    const nSit = { semassinatura: 0, atrasado: 0, vencendo: 0, emdia: 0 };
    usuariosCache.forEach((u) => { nSit[situacaoCobranca(u.cobranca).chave]++; });
    const r = resumoCobranca;
    const mesRotulo = r ? `${r.mes.slice(5, 7)}/${r.mes.slice(0, 4)}` : "";
    document.getElementById("cobranca-resumo").innerHTML = r ? `
      <div class="xml-cartao destaque"><strong>${esc(moeda(r.recebidoNoMes))}</strong><span>Recebido em ${mesRotulo} (${r.pagamentosNoMes} pagamento${r.pagamentosNoMes === 1 ? "" : "s"})</span></div>
      <div class="xml-cartao"><strong>${esc(moeda(r.previstoNoMes))}</strong><span>A receber até o fim do mês</span></div>
      <div class="xml-cartao"><strong style="${nSit.atrasado ? "color:var(--vermelho)" : ""}">${nSit.atrasado}</strong><span>Atrasado${nSit.atrasado ? " · " + esc(moeda(r.atrasadoValor)) : ""}</span></div>
      <div class="xml-cartao"><strong>${nSit.vencendo}</strong><span>Vencem nos próximos 7 dias</span></div>` : "";
    const filtros = [["todos", "Todos", usuariosCache.length], ["atrasado", "Atrasados", nSit.atrasado], ["vencendo", "Vencem em 7 dias", nSit.vencendo], ["emdia", "Em dia", nSit.emdia], ["semassinatura", "Sem assinatura", nSit.semassinatura]];
    document.getElementById("cobranca-filtros").innerHTML = `<span class="filtro-rotulo">Mostrar:</span>` +
      filtros.map(([k, t, n]) => `<button type="button" class="chip${filtroCobranca === k ? " ativo" : ""}" data-filtro-cob="${k}">${t} (${n})</button>`).join("");
  }

  function renderizarTabelaUsuarios() {
    const corpo = document.getElementById("tabela-usuarios-body");
    const lista = usuariosCache.filter((u) => filtroCobranca === "todos" || situacaoCobranca(u.cobranca).chave === filtroCobranca);
    // Quem precisa de atenção primeiro: atrasados e os que vencem antes.
    if (filtroCobranca !== "todos") lista.sort((a, b) => (a.cobranca.diasParaVencer ?? 1e9) - (b.cobranca.diasParaVencer ?? 1e9));
    corpo.innerHTML = lista.length ? lista.map(linhaUsuario).join("") : `<tr><td colspan="7">Nenhum login nesta situação.</td></tr>`;
  }

  function linhaUsuario(u) {
    const statusBadge = u.bloqueado
      ? `<span class="badge cor-vermelho">Bloqueado</span>`
      : u.precisa_trocar_senha
        ? `<span class="badge cor-amarelo" title="Ainda não entrou com a senha provisória e criou a própria senha">Aguardando 1º acesso</span>`
        : `<span class="badge cor-verde">Ativo</span>`;
    const botaoBloqueio = u.bloqueado
      ? `<button class="btn secondary btn-sm" data-acao="desbloquear" data-id="${u.id}">Desbloquear</button>`
      : `<button class="btn secondary btn-sm" data-acao="bloquear" data-id="${u.id}">Bloquear</button>`;
    return `
      <tr data-id="${u.id}">
        <td>${esc(u.email)}</td>
        <td>${esc(u.nome)}</td>
        <td>${esc(formatarData(u.criado_em))}</td>
        <td>${statusBadge}</td>
        <td>${celulaAssinatura(u)}</td>
        <td title="Certificados A1 importados no módulo Notas Fiscais">${Number(u.qtdCertificados) || 0}</td>
        <td>
          <div class="tabela-acoes">
            ${botaoBloqueio}
            <button class="btn btn-sm" data-acao="assinatura" data-id="${u.id}">Assinatura</button>
            <button class="btn btn-sm" data-acao="cobranca" data-id="${u.id}">Cobrança</button>
            <button class="btn secondary btn-sm" data-acao="redefinir" data-id="${u.id}">Redefinir senha</button>
            <button class="btn secondary btn-sm" data-acao="detalhes" data-id="${u.id}">Ver Detalhes</button>
            <button class="btn perigo btn-sm" data-acao="excluir" data-id="${u.id}">Excluir</button>
          </div>
        </td>
      </tr>`;
  }

  let usuariosCache = [];

  async function carregarUsuarios(silencioso) {
    const corpo = document.getElementById("tabela-usuarios-body");
    if (!silencioso) corpo.innerHTML = `<tr><td colspan="7">Carregando...</td></tr>`;
    const resultado = await chamarApi("/api/admin/users");
    if (resultado.status === 401) { voltarParaLogin(); return; }
    if (!resultado.ok) {
      corpo.innerHTML = `<tr><td colspan="7">Erro ao carregar usuários.</td></tr>`;
      return;
    }
    usuariosCache = resultado.usuarios || [];
    resumoCobranca = resultado.resumoCobranca || null;
    if (!usuariosCache.length) {
      corpo.innerHTML = `<tr><td colspan="7">Nenhum usuário cadastrado ainda.</td></tr>`;
      return;
    }
    renderizarResumoCobranca();
    renderizarTabelaUsuarios();
  }

  // ---------- Modal de cobrança ----------

  let cobrancaModal = null; // { id, email, modo: "assinatura" | "baixa", cobranca, pagamentos }

  function renderizarModalCobranca() {
    const { email, modo, cobranca: c, pagamentos } = cobrancaModal;
    const sit = situacaoCobranca(c);
    const temAssinatura = !!c.proximoVencimento;
    const valorTxt = c.valorCobranca != null ? Number(c.valorCobranca).toFixed(2).replace(".", ",") : "";
    const titulo = document.getElementById("titulo-cobranca");
    let corpo;

    if (modo === "assinatura") {
      titulo.textContent = temAssinatura ? "Assinatura" : "Registrar assinatura";
      const periodos = Object.keys(MESES_PERIODO).map((n) => `<option value="${n}"${Number(n) === c.periodicidadeMeses ? " selected" : ""}>${MESES_PERIODO[n]}</option>`).join("");
      corpo = `
        <div class="cob-bloco">
          <div class="cob-form">
            <div><label for="cob-inicio">Conta criada / assinatura em</label><input type="date" id="cob-inicio" value="${esc(c.assinaturaInicio || "")}" /></div>
            <div><label for="cob-valor">Valor da cobrança (R$)</label><input type="text" id="cob-valor" inputmode="decimal" value="${esc(valorTxt)}" placeholder="0,00" autocomplete="off" /></div>
            <div><label for="cob-periodo">Periodicidade</label><select id="cob-periodo">${periodos}</select></div>
            <div><label for="cob-proximo">Próximo vencimento</label><input type="date" id="cob-proximo" value="${esc(c.proximoVencimento || "")}" /></div>
          </div>
          <p class="hint" style="margin:0;">Deixe o próximo vencimento em branco para calcular automaticamente (assinatura + 1 período). Esta é a única tela onde valor e datas podem ser alterados; a baixa usa exatamente o que estiver aqui.</p>
          <div class="field-actions">
            <button class="btn" type="button" data-cob="assinatura">Salvar assinatura</button>
            ${temAssinatura ? `<button class="btn perigo btn-sm" type="button" data-cob="remover" title="Apaga a data e o vencimento (o histórico de pagamentos é mantido)">Remover assinatura</button>` : ""}
          </div>
        </div>`;
    } else {
      titulo.textContent = "Cobrança";
      const proxima = temAssinatura ? somarMesesIso(c.proximoVencimento, c.periodicidadeMeses, Number(c.proximoVencimento.slice(8, 10))) : "";
      const podeBaixar = temAssinatura && c.valorCobranca != null;
      const blocoBaixa = !temAssinatura
        ? `<div class="aviso-legal">Este login ainda não tem assinatura. Clique em <strong>Assinatura</strong> na lista para registrar a data, o valor e o vencimento.</div>`
        : `<div class="cob-bloco destaque">
            <div class="cob-resumo-baixa">
              <div><p class="hint" style="margin:0;">Vencimento</p><div class="cob-proximo"><strong>${dataBr(c.proximoVencimento)}</strong><span class="badge cor-${sit.cor}">${esc(sit.texto)}</span></div></div>
              <div><p class="hint" style="margin:0;">Valor</p><div class="cob-proximo"><strong>${c.valorCobranca != null ? esc(moeda(c.valorCobranca)) : "—"}</strong></div></div>
            </div>
            ${podeBaixar
              ? `<p class="hint" style="margin:0;">Ao dar baixa, o vencimento de <strong>${dataBr(c.proximoVencimento)}</strong> é quitado e o próximo passa a ser <strong>${dataBr(proxima)}</strong>.</p>
                 <div class="field-actions"><button class="btn" type="button" data-cob="baixa" data-venc="${esc(c.proximoVencimento)}">Dar baixa</button></div>`
              : `<p class="hint" style="margin:0;">Falta o valor da cobrança. Informe-o em <strong>Assinatura</strong> para poder dar baixa.</p>`}
          </div>`;
      const linhasPag = (pagamentos || []).map((p) => `<tr><td>${dataBr(p.referenteA)}</td><td>${esc(moeda(p.valor))}</td><td>${dataBr(p.pagoEm)}</td></tr>`).join("");
      corpo = `${blocoBaixa}
        <div class="cob-bloco">
          <h3>Histórico de pagamentos</h3>
          ${linhasPag ? `<div class="table-wrap cob-historico"><table><thead><tr><th>Vencimento quitado</th><th>Valor</th><th>Baixa registrada em</th></tr></thead><tbody>${linhasPag}</tbody></table></div>
          <div class="field-actions"><button class="btn secondary btn-sm" type="button" data-cob="estornar" title="Desfaz o pagamento mais recente e volta o vencimento">Desfazer última baixa</button></div>` : `<p class="hint" style="margin:0;">Nenhuma baixa registrada ainda.</p>`}
        </div>`;
    }

    document.getElementById("corpo-cobranca").innerHTML = `
      <p class="hint" style="margin-top:0;">Login: <strong>${esc(email)}</strong></p>
      <div id="erro-cobranca" class="aviso-legal" style="display:none;"></div>
      ${corpo}`;
  }

  function erroCobranca(msg) {
    const el = document.getElementById("erro-cobranca");
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? "block" : "none";
    if (msg) el.scrollIntoView({ block: "nearest" });
  }

  async function abrirCobranca(id, modo) {
    const u = usuariosCache.find((x) => x.id === id);
    if (!u) return;
    cobrancaModal = { id, email: u.email, modo, cobranca: u.cobranca, pagamentos: [] };
    document.getElementById("corpo-cobranca").innerHTML = `<p class="hint">Carregando...</p>`;
    document.getElementById("modal-cobranca-overlay").classList.add("aberto");
    const r = await chamarApi(`/api/admin/users/${id}`);
    if (r.status === 401) { voltarParaLogin(); return; }
    if (!r.ok) { document.getElementById("corpo-cobranca").innerHTML = `<div class="aviso-legal">${esc(r.erro || "Erro ao carregar a cobrança.")}</div>`; return; }
    cobrancaModal.cobranca = r.cobranca;
    cobrancaModal.pagamentos = r.pagamentos;
    renderizarModalCobranca();
  }

  async function enviarAcaoCobranca(corpo, mensagemOk) {
    if (!cobrancaModal) return;
    const r = await chamarApi(`/api/admin/users/${cobrancaModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    if (r.status === 401) { voltarParaLogin(); return; }
    if (!r.ok) { erroCobranca(r.erro || "Não foi possível salvar."); return; }
    cobrancaModal.cobranca = r.cobranca;
    cobrancaModal.pagamentos = r.pagamentos;
    const u = usuariosCache.find((x) => x.id === cobrancaModal.id);
    if (u) u.cobranca = r.cobranca;
    renderizarModalCobranca();
    mostrarAvisoPainel(mensagemOk(r.cobranca), "ok");
    carregarUsuarios(true); // atualiza tabela, cartões e totais
  }

  function cliqueCobranca(e) {
    const btn = e.target.closest("button[data-cob]");
    if (!btn) return;
    const v = (id) => document.getElementById(id).value.trim();
    const acao = btn.dataset.cob;
    erroCobranca("");
    if (acao === "assinatura") {
      enviarAcaoCobranca({ acao: "assinatura", assinaturaInicio: v("cob-inicio"), valorCobranca: v("cob-valor"), periodicidadeMeses: Number(v("cob-periodo")), proximoVencimento: v("cob-proximo") },
        (c) => `Assinatura salva. Próximo vencimento: ${dataBr(c.proximoVencimento)}.`);
    } else if (acao === "baixa") {
      btn.disabled = true; // evita baixa em duplicidade por clique duplo
      enviarAcaoCobranca({ acao: "baixa", vencimento: btn.dataset.venc },
        (c) => `Baixa registrada. Próximo vencimento: ${dataBr(c.proximoVencimento)}.`).then(() => { btn.disabled = false; });
    } else if (acao === "estornar") {
      if (!window.confirm("Desfazer o último pagamento registrado? O vencimento volta para a data anterior.")) return;
      enviarAcaoCobranca({ acao: "estornar" }, (c) => `Baixa desfeita. Próximo vencimento: ${dataBr(c.proximoVencimento)}.`);
    } else if (acao === "remover") {
      if (!window.confirm("Remover a assinatura deste login? O histórico de pagamentos é mantido.")) return;
      enviarAcaoCobranca({ acao: "remover-assinatura" }, () => "Assinatura removida.");
    }
  }

  async function alternarBloqueio(id, bloquear) {
    mostrarAvisoPainel("");
    const resultado = await chamarApi(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bloqueado: bloquear }),
    });
    if (resultado.status === 401) { voltarParaLogin(); return; }
    if (!resultado.ok) { mostrarAvisoPainel(resultado.erro || "Erro ao atualizar usuário.", "erro"); return; }
    mostrarAvisoPainel(bloquear ? "Usuário bloqueado." : "Usuário desbloqueado.", "ok");
    carregarUsuarios();
  }

  function formatarDocumento(d) {
    const n = String(d || "").replace(/\D/g, "");
    if (n.length === 14) return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    if (n.length === 11) return n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    return d || "—";
  }

  function formatarDataCurta(iso) {
    try {
      return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    } catch (e) {
      return iso;
    }
  }

  const DIAS_ALERTA_CERTIFICADO = 30;
  let certificadosDoDetalhe = [];

  function normalizarBusca(t) {
    return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  // Situação de cada certificado, calculada uma vez ao abrir o painel.
  function prepararCertificados(lista) {
    const agora = Date.now();
    return lista.map((c) => {
      const venc = c.certValidUntil ? new Date(c.certValidUntil).getTime() : null;
      const dias = venc == null ? null : Math.floor((venc - agora) / 86400000);
      let situacao = "desconhecida";
      if (dias != null) situacao = dias < 0 ? "vencido" : dias <= DIAS_ALERTA_CERTIFICADO ? "vencendo" : "valido";
      return { ...c, _venc: venc, _dias: dias, _situacao: situacao, _busca: normalizarBusca(c.razaoSocial) + " " + String(c.cnpj || "").replace(/\D/g, "") };
    });
  }

  function htmlSituacaoCertificado(c) {
    if (c._situacao === "vencido") return `<span class="badge cor-vermelho">Vencido</span>`;
    if (c._situacao === "vencendo") return `<span class="badge cor-amarelo">Vence em ${c._dias} dia(s)</span>`;
    if (c._situacao === "valido") return `<span class="badge cor-verde">Válido</span>`;
    return `<span class="badge cor-neutro-fraco">Sem validade</span>`;
  }

  function htmlCertificados(u) {
    const lista = u.certificados || [];
    if (!lista.length) return `<p>Nenhum certificado importado.</p>`;
    certificadosDoDetalhe = prepararCertificados(lista);
    const n = (sit) => certificadosDoDetalhe.filter((c) => c._situacao === sit).length;
    const resumo = [
      `<span>${n("valido")} válido(s)</span>`,
      `<span class="cert-resumo-amarelo">${n("vencendo")} vencendo em ${DIAS_ALERTA_CERTIFICADO} dias</span>`,
      `<span class="cert-resumo-vermelho">${n("vencido")} vencido(s)</span>`,
    ].join("");
    return `
      <div class="cert-resumo">${resumo}</div>
      <div class="cert-ferramentas">
        <input type="search" id="input-busca-cert" name="filtro-certificados" placeholder="Buscar por empresa ou CNPJ" autocomplete="off" data-lpignore="true" data-1p-ignore data-form-type="other" />
        <select id="select-filtro-cert" aria-label="Filtrar situação">
          <option value="">Todas as situações</option>
          <option value="valido">Válidos</option>
          <option value="vencendo">Vencendo em ${DIAS_ALERTA_CERTIFICADO} dias</option>
          <option value="vencido">Vencidos</option>
        </select>
        <select id="select-ordem-cert" aria-label="Ordenar">
          <option value="nome">Ordem alfabética</option>
          <option value="vencimento">Vencimento mais próximo</option>
          <option value="sync">Sincronizado mais recentemente</option>
        </select>
      </div>
      <div class="cert-lista" id="cert-lista"></div>
      <div class="hint" id="cert-contagem"></div>`;
  }

  function renderizarListaCertificados() {
    const termo = normalizarBusca(document.getElementById("input-busca-cert").value.trim());
    const digitos = termo.replace(/\D/g, "");
    const filtro = document.getElementById("select-filtro-cert").value;
    const ordem = document.getElementById("select-ordem-cert").value;

    const lista = certificadosDoDetalhe.filter((c) => {
      if (filtro && c._situacao !== filtro) return false;
      if (!termo) return true;
      if (c._busca.includes(termo)) return true;
      return !!digitos && /^[\d.\-\/\s]+$/.test(termo) && c._busca.includes(digitos);
    });
    const dataSync = (c) => (c.ultimaSincronizacao ? new Date(c.ultimaSincronizacao).getTime() : 0);
    lista.sort((a, b) => {
      if (ordem === "vencimento") return (a._venc ?? Infinity) - (b._venc ?? Infinity);
      if (ordem === "sync") return dataSync(b) - dataSync(a);
      return String(a.razaoSocial || "").localeCompare(String(b.razaoSocial || ""), "pt-BR");
    });

    const alvo = document.getElementById("cert-lista");
    if (!lista.length) {
      alvo.innerHTML = `<div class="cert-vazio">Nenhum certificado encontrado com esses filtros.</div>`;
    } else {
      const linhas = lista.map((c) => `
        <tr>
          <td>${esc(c.razaoSocial || "—")}</td>
          <td class="mono">${esc(formatarDocumento(c.cnpj))}</td>
          <td>${htmlSituacaoCertificado(c)}<div class="hint">${c.certValidUntil ? "até " + esc(formatarDataCurta(c.certValidUntil)) : ""}</div></td>
          <td>${c.ultimaSincronizacao ? esc(formatarDataCurta(c.ultimaSincronizacao)) : "Nunca"}</td>
        </tr>`).join("");
      alvo.innerHTML = `<table>
        <thead><tr><th>Empresa</th><th>CNPJ/CPF</th><th>Validade</th><th>Última sync.</th></tr></thead>
        <tbody>${linhas}</tbody></table>`;
    }
    document.getElementById("cert-contagem").textContent =
      lista.length === certificadosDoDetalhe.length
        ? `${lista.length} certificado(s)`
        : `Mostrando ${lista.length} de ${certificadosDoDetalhe.length} certificado(s)`;
  }

  function abrirDetalhes(id) {
    const u = usuariosCache.find((x) => x.id === id);
    if (!u) return;
    document.getElementById("corpo-detalhes").innerHTML = `
      <div class="detalhes-grade">
        <div><p class="hint">ID</p><p>${esc(u.id)}</p></div>
        <div><p class="hint">Status</p><p>${textoStatus(u)}</p></div>
        <div><p class="hint">E-mail</p><p>${esc(u.email)}</p></div>
        <div><p class="hint">Nome</p><p>${esc(u.nome)}</p></div>
        <div><p class="hint">Cadastrado em</p><p>${esc(formatarData(u.criado_em))}</p></div>
      </div>
      <h3 class="detalhes-subtitulo">Certificados importados (${Number(u.qtdCertificados) || 0})</h3>${htmlCertificados(u)}
    `;
    if (u.certificados && u.certificados.length) {
      ["input-busca-cert", "select-filtro-cert", "select-ordem-cert"].forEach((idCampo) => {
        document.getElementById(idCampo).addEventListener(idCampo === "input-busca-cert" ? "input" : "change", renderizarListaCertificados);
      });
      renderizarListaCertificados();
    }
    document.getElementById("modal-detalhes-overlay").classList.add("aberto");
  }

  function abrirExclusao(id) {
    const u = usuariosCache.find((x) => x.id === id);
    if (!u) return;
    usuarioParaExcluir = u;
    document.getElementById("erro-excluir").style.display = "none";
    document.getElementById("texto-excluir-email").textContent = u.email;
    document.getElementById("input-confirmar-exclusao").value = "";
    document.getElementById("modal-excluir-overlay").classList.add("aberto");
  }

  async function confirmarExclusao() {
    if (!usuarioParaExcluir) return;
    const erroEl = document.getElementById("erro-excluir");
    erroEl.style.display = "none";
    const digitado = document.getElementById("input-confirmar-exclusao").value.trim().toLowerCase();
    if (digitado !== usuarioParaExcluir.email) {
      erroEl.textContent = "O e-mail digitado não confere com o da conta.";
      erroEl.style.display = "block";
      return;
    }
    const btn = document.getElementById("btn-confirmar-exclusao");
    btn.disabled = true;
    try {
      const resultado = await chamarApi(`/api/admin/users/${usuarioParaExcluir.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailConfirmacao: digitado }),
      });
      if (resultado.status === 401) { voltarParaLogin(); return; }
      if (!resultado.ok) {
        erroEl.textContent = resultado.erro || "Erro ao excluir.";
        erroEl.style.display = "block";
        return;
      }
      document.getElementById("modal-excluir-overlay").classList.remove("aberto");
      mostrarAvisoPainel("Usuário excluído.", "ok");
      carregarUsuarios();
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Novo usuário ----------

  let dadosParaCopiar = "";

  function mostrarErroNovoUsuario(msg) {
    const el = document.getElementById("erro-novo-usuario");
    el.textContent = msg;
    el.style.display = msg ? "block" : "none";
  }

  // Caixa com e-mail + senha provisória, usada ao criar um usuário e ao
  // redefinir a senha de um existente.
  function mostrarCredenciais(titulo, email, senhaProvisoria) {
    const link = location.origin + "/login.html";
    document.getElementById("resultado-titulo").textContent = titulo;
    document.getElementById("resultado-email").textContent = email;
    document.getElementById("resultado-senha").textContent = senhaProvisoria;
    document.getElementById("resultado-link").textContent = link;
    dadosParaCopiar = `Acesso ao FiscalClass\nEndereço: ${link}\nE-mail: ${email}\nSenha provisória: ${senhaProvisoria}\n(no primeiro acesso você vai criar a sua própria senha)`;
    const caixa = document.getElementById("resultado-novo-usuario");
    caixa.style.display = "block";
    caixa.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function redefinirSenha(id) {
    const u = usuariosCache.find((x) => x.id === id);
    if (!u) return;
    if (!confirm(`Redefinir a senha de ${u.email}?\n\nA senha atual deixa de funcionar, quem estiver logado é deslogado, e o usuário precisará criar uma nova senha no próximo acesso, usando a senha provisória que será gerada.`)) return;
    mostrarAvisoPainel("");
    document.getElementById("resultado-novo-usuario").style.display = "none";
    const resultado = await chamarApi(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redefinirSenha: true }),
    });
    if (resultado.status === 401) { voltarParaLogin(); return; }
    if (!resultado.ok) { mostrarAvisoPainel(resultado.erro || "Não foi possível redefinir a senha.", "erro"); return; }
    mostrarCredenciais("Senha redefinida.", resultado.usuario.email, resultado.senhaProvisoria);
    carregarUsuarios();
  }

  async function criarUsuario() {
    mostrarErroNovoUsuario("");
    document.getElementById("resultado-novo-usuario").style.display = "none";
    const email = document.getElementById("input-novo-email").value.trim();
    const nome = document.getElementById("input-novo-nome").value.trim();
    const senhaProvisoria = document.getElementById("input-novo-senha").value;
    if (!email || !nome) { mostrarErroNovoUsuario("Preencha o e-mail e o nome."); return; }

    const btn = document.getElementById("btn-criar-usuario");
    btn.disabled = true;
    btn.textContent = "Criando...";
    try {
      const resultado = await chamarApi("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, nome, senhaProvisoria }),
      });
      if (resultado.status === 401) { voltarParaLogin(); return; }
      if (!resultado.ok) { mostrarErroNovoUsuario(resultado.erro || "Não foi possível criar o usuário."); return; }

      mostrarCredenciais("Usuário criado.", resultado.usuario.email, resultado.senhaProvisoria);
      ["input-novo-email", "input-novo-nome", "input-novo-senha"].forEach((id) => { document.getElementById(id).value = ""; });
      carregarUsuarios();
    } finally {
      btn.disabled = false;
      btn.textContent = "Criar usuário";
    }
  }

  async function copiarDados() {
    const btn = document.getElementById("btn-copiar-dados");
    try {
      await navigator.clipboard.writeText(dadosParaCopiar);
      btn.textContent = "Copiado!";
    } catch (e) {
      btn.textContent = "Selecione e copie manualmente";
    }
    setTimeout(() => { btn.textContent = "Copiar dados"; }, 2500);
  }

  function voltarParaLogin() {
    viewPainel.style.display = "none";
    viewLogin.style.display = "";
    document.getElementById("input-admin-senha").value = "";
  }

  // ---------- Ligações ----------

  document.getElementById("btn-admin-entrar").addEventListener("click", tentarEntrar);
  document.getElementById("btn-admin-senhas").addEventListener("click", abrirModalSenhas);
  document.getElementById("btn-salvar-senhas").addEventListener("click", salvarSenhas);
  const overlaySenhas = document.getElementById("modal-senhas-overlay");
  document.getElementById("btn-fechar-modal-senhas").addEventListener("click", () => overlaySenhas.classList.remove("aberto"));
  overlaySenhas.addEventListener("click", (e) => { if (e.target === overlaySenhas) overlaySenhas.classList.remove("aberto"); });
  ["input-admin-email", "input-admin-senha"].forEach((id) => {
    document.getElementById(id).addEventListener("keydown", (e) => { if (e.key === "Enter") tentarEntrar(); });
  });

  document.getElementById("btn-admin-atualizar").addEventListener("click", () => { carregarUsuarios(); carregarRelatorioXml(); });
  document.getElementById("select-mes-xml").addEventListener("change", carregarRelatorioXml);
  document.getElementById("btn-xml-atualizar").addEventListener("click", carregarRelatorioXml);
  document.getElementById("btn-xml-csv").addEventListener("click", exportarRelatorioXml);
  document.getElementById("btn-xml-csv-empresas").addEventListener("click", exportarRelatorioXmlEmpresas);
  document.getElementById("btn-criar-usuario").addEventListener("click", criarUsuario);
  document.getElementById("btn-copiar-dados").addEventListener("click", copiarDados);
  ["input-novo-email", "input-novo-nome", "input-novo-senha"].forEach((id) => {
    document.getElementById(id).addEventListener("keydown", (e) => { if (e.key === "Enter") criarUsuario(); });
  });

  document.getElementById("btn-admin-sair").addEventListener("click", async (e) => {
    e.preventDefault();
    await postJson("/api/admin/logout", {});
    voltarParaLogin();
  });

  document.getElementById("tabela-usuarios-body").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-acao]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const acao = btn.dataset.acao;
    if (acao === "bloquear") alternarBloqueio(id, true);
    else if (acao === "desbloquear") alternarBloqueio(id, false);
    else if (acao === "redefinir") redefinirSenha(id);
    else if (acao === "detalhes") abrirDetalhes(id);
    else if (acao === "assinatura") abrirCobranca(id, "assinatura");
    else if (acao === "cobranca") abrirCobranca(id, "baixa");
    else if (acao === "excluir") abrirExclusao(id);
  });

  const overlayDetalhes = document.getElementById("modal-detalhes-overlay");
  document.getElementById("btn-fechar-modal-detalhes").addEventListener("click", () => overlayDetalhes.classList.remove("aberto"));
  overlayDetalhes.addEventListener("click", (e) => { if (e.target === overlayDetalhes) overlayDetalhes.classList.remove("aberto"); });

  const overlayCobranca = document.getElementById("modal-cobranca-overlay");
  document.getElementById("btn-fechar-modal-cobranca").addEventListener("click", () => overlayCobranca.classList.remove("aberto"));
  overlayCobranca.addEventListener("click", (e) => { if (e.target === overlayCobranca) overlayCobranca.classList.remove("aberto"); });
  document.getElementById("corpo-cobranca").addEventListener("click", cliqueCobranca);
  document.getElementById("cobranca-filtros").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-filtro-cob]");
    if (!b) return;
    filtroCobranca = b.dataset.filtroCob;
    renderizarResumoCobranca();
    renderizarTabelaUsuarios();
  });

  const overlayExcluir = document.getElementById("modal-excluir-overlay");
  document.getElementById("btn-fechar-modal-excluir").addEventListener("click", () => overlayExcluir.classList.remove("aberto"));
  overlayExcluir.addEventListener("click", (e) => { if (e.target === overlayExcluir) overlayExcluir.classList.remove("aberto"); });
  document.getElementById("btn-confirmar-exclusao").addEventListener("click", confirmarExclusao);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    overlayDetalhes.classList.remove("aberto");
    overlayCobranca.classList.remove("aberto");
    overlaySenhas.classList.remove("aberto");
    overlayExcluir.classList.remove("aberto");
  });

  // ---------- Checagem inicial de sessão ----------

  (async function iniciar() {
    const resultado = await chamarApi("/api/admin/session");
    if (resultado.logado) {
      mostrarPainel(resultado.email);
    }
    document.documentElement.classList.add("sessao-pronta");
  })();
})();
