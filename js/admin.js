/*
 * Painel administrativo (admin.html) — login próprio (conta separada dos
 * usuários comuns, tabela `admins` no Postgres) e gestão de usuários:
 * listar, bloquear/desbloquear, ver detalhes e excluir (com confirmação
 * dupla: modal + digitar o e-mail da conta).
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

  // ---------- Painel / lista de usuários ----------

  let usuarioParaExcluir = null; // {id, email}

  function mostrarPainel(emailAdmin) {
    viewLogin.style.display = "none";
    viewPainel.style.display = "";
    document.getElementById("texto-admin-logado").textContent = "Logado como " + emailAdmin;
    carregarUsuarios();
  }

  function linhaUsuario(u) {
    const statusBadge = u.bloqueado
      ? `<span class="badge cor-vermelho">Bloqueado</span>`
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
        <td>
          <div class="tabela-acoes">
            ${botaoBloqueio}
            <button class="btn secondary btn-sm" data-acao="detalhes" data-id="${u.id}">Ver Detalhes</button>
            <button class="btn perigo btn-sm" data-acao="excluir" data-id="${u.id}">Excluir</button>
          </div>
        </td>
      </tr>`;
  }

  let usuariosCache = [];

  async function carregarUsuarios() {
    const corpo = document.getElementById("tabela-usuarios-body");
    corpo.innerHTML = `<tr><td colspan="5">Carregando...</td></tr>`;
    const resultado = await chamarApi("/api/admin/users");
    if (resultado.status === 401) { voltarParaLogin(); return; }
    if (!resultado.ok) {
      corpo.innerHTML = `<tr><td colspan="5">Erro ao carregar usuários.</td></tr>`;
      return;
    }
    usuariosCache = resultado.usuarios || [];
    if (!usuariosCache.length) {
      corpo.innerHTML = `<tr><td colspan="5">Nenhum usuário cadastrado ainda.</td></tr>`;
      return;
    }
    corpo.innerHTML = usuariosCache.map(linhaUsuario).join("");
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

  function abrirDetalhes(id) {
    const u = usuariosCache.find((x) => x.id === id);
    if (!u) return;
    document.getElementById("corpo-detalhes").innerHTML = `
      <p class="hint">ID</p><p>${esc(u.id)}</p>
      <p class="hint">E-mail</p><p>${esc(u.email)}</p>
      <p class="hint">Nome</p><p>${esc(u.nome)}</p>
      <p class="hint">Cadastrado em</p><p>${esc(formatarData(u.criado_em))}</p>
      <p class="hint">Status</p><p>${u.bloqueado ? "Bloqueado" : "Ativo"}</p>
    `;
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

  function voltarParaLogin() {
    viewPainel.style.display = "none";
    viewLogin.style.display = "";
    document.getElementById("input-admin-senha").value = "";
  }

  // ---------- Ligações ----------

  document.getElementById("btn-admin-entrar").addEventListener("click", tentarEntrar);
  ["input-admin-email", "input-admin-senha"].forEach((id) => {
    document.getElementById(id).addEventListener("keydown", (e) => { if (e.key === "Enter") tentarEntrar(); });
  });

  document.getElementById("btn-admin-atualizar").addEventListener("click", carregarUsuarios);

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
    else if (acao === "detalhes") abrirDetalhes(id);
    else if (acao === "excluir") abrirExclusao(id);
  });

  const overlayDetalhes = document.getElementById("modal-detalhes-overlay");
  document.getElementById("btn-fechar-modal-detalhes").addEventListener("click", () => overlayDetalhes.classList.remove("aberto"));
  overlayDetalhes.addEventListener("click", (e) => { if (e.target === overlayDetalhes) overlayDetalhes.classList.remove("aberto"); });

  const overlayExcluir = document.getElementById("modal-excluir-overlay");
  document.getElementById("btn-fechar-modal-excluir").addEventListener("click", () => overlayExcluir.classList.remove("aberto"));
  overlayExcluir.addEventListener("click", (e) => { if (e.target === overlayExcluir) overlayExcluir.classList.remove("aberto"); });
  document.getElementById("btn-confirmar-exclusao").addEventListener("click", confirmarExclusao);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    overlayDetalhes.classList.remove("aberto");
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
