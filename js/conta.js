/*
 * Menu "minha conta" (nome no cabeçalho → menu suspenso → modal com 3
 * abas: nome, e-mail, senha). Diferente de js/tema.js/js/auth.js, não se
 * auto-inicia sozinho: Auth.protegerPagina() (js/auth.js) chama
 * Conta.iniciar(sessao) explicitamente depois de confirmar a sessão no
 * servidor e injetar o botão do usuário no header — antes disso o botão
 * #btn-usuario-menu nem existe no DOM.
 */
(function () {
  "use strict";

  const TAMANHO_MINIMO_SENHA = 6;
  let sessaoAtual = null;
  const MODAL_HTML = `
    <div class="modal-overlay" id="modal-conta-overlay">
      <div class="card modal-card">
        <button class="modal-fechar" id="btn-fechar-modal-conta" type="button" aria-label="Fechar">&times;</button>
        <h2 class="modal-titulo">Minha conta</h2>
        <div class="tabs modal-tabs">
          <button class="tab-btn active" data-modal-tab="nome" type="button">Nome</button>
          <button class="tab-btn" data-modal-tab="email" type="button">E-mail</button>
          <button class="tab-btn" data-modal-tab="senha" type="button">Senha</button>
        </div>

        <div class="panel active" id="modal-panel-nome">
          <div id="erro-conta-nome" class="aviso-legal" style="display:none;"></div>
          <label for="input-conta-nome">Nome</label>
          <input type="text" id="input-conta-nome" />
          <div class="field-actions"><button class="btn" id="btn-salvar-nome" type="button">Salvar</button></div>
        </div>

        <div class="panel" id="modal-panel-email">
          <div id="erro-conta-email" class="aviso-legal" style="display:none;"></div>
          <p class="hint">E-mail atual: <strong id="texto-email-atual"></strong></p>
          <label for="input-conta-email">Novo e-mail</label>
          <input type="email" id="input-conta-email" placeholder="voce@exemplo.com" />
          <label for="input-conta-email-senha" style="margin-top:14px;">Senha atual (para confirmar)</label>
          <input type="password" id="input-conta-email-senha" autocomplete="current-password" />
          <div class="field-actions"><button class="btn" id="btn-salvar-email" type="button">Salvar</button></div>
        </div>

        <div class="panel" id="modal-panel-senha">
          <div id="erro-conta-senha" class="aviso-legal" style="display:none;"></div>
          <label for="input-conta-senha-atual">Senha atual</label>
          <input type="password" id="input-conta-senha-atual" autocomplete="current-password" />
          <label for="input-conta-senha-nova" style="margin-top:14px;">Nova senha</label>
          <input type="password" id="input-conta-senha-nova" placeholder="No mínimo 6 caracteres" autocomplete="new-password" />
          <label for="input-conta-senha-confirmar" style="margin-top:14px;">Confirmar nova senha</label>
          <input type="password" id="input-conta-senha-confirmar" autocomplete="new-password" />
          <div class="field-actions"><button class="btn" id="btn-salvar-senha" type="button">Salvar</button></div>
        </div>
      </div>
    </div>`;

  function mostrarErro(elId, msg) {
    const el = document.getElementById(elId);
    el.textContent = msg;
    el.style.display = "block";
  }

  function limparErros() {
    ["erro-conta-nome", "erro-conta-email", "erro-conta-senha"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
  }

  function trocarAba(nomeAba) {
    document.querySelectorAll(".modal-tabs .tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.modalTab === nomeAba));
    document.querySelectorAll("#modal-conta-overlay .panel").forEach((p) => p.classList.toggle("active", p.id === "modal-panel-" + nomeAba));
  }

  function abrirModal(nomeAba) {
    if (!sessaoAtual) return;
    limparErros();
    document.getElementById("input-conta-nome").value = sessaoAtual.nome || "";
    document.getElementById("texto-email-atual").textContent = sessaoAtual.email || "";
    document.getElementById("input-conta-email").value = "";
    document.getElementById("input-conta-email-senha").value = "";
    document.getElementById("input-conta-senha-atual").value = "";
    document.getElementById("input-conta-senha-nova").value = "";
    document.getElementById("input-conta-senha-confirmar").value = "";
    trocarAba(nomeAba || "nome");
    document.getElementById("modal-conta-overlay").classList.add("aberto");
  }

  function fecharModal() {
    document.getElementById("modal-conta-overlay").classList.remove("aberto");
  }

  async function salvarNome() {
    limparErros();
    const novoNome = document.getElementById("input-conta-nome").value.trim();
    const resultado = await window.Auth.alterarNome(novoNome);
    if (!resultado.ok) { mostrarErro("erro-conta-nome", resultado.erro); return; }
    location.reload();
  }

  async function salvarEmail() {
    limparErros();
    const novoEmail = document.getElementById("input-conta-email").value.trim();
    const senha = document.getElementById("input-conta-email-senha").value;
    if (!novoEmail || !senha) { mostrarErro("erro-conta-email", "Preencha o novo e-mail e a senha atual."); return; }
    const resultado = await window.Auth.alterarEmail(novoEmail, senha);
    if (!resultado.ok) { mostrarErro("erro-conta-email", resultado.erro); return; }
    location.reload();
  }

  async function salvarSenha() {
    limparErros();
    const senhaAtual = document.getElementById("input-conta-senha-atual").value;
    const senhaNova = document.getElementById("input-conta-senha-nova").value;
    const senhaConfirmar = document.getElementById("input-conta-senha-confirmar").value;
    if (senhaNova.length < TAMANHO_MINIMO_SENHA) {
      mostrarErro("erro-conta-senha", `A nova senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
      return;
    }
    if (senhaNova !== senhaConfirmar) { mostrarErro("erro-conta-senha", "As senhas não são iguais."); return; }
    const resultado = await window.Auth.alterarSenha(senhaAtual, senhaNova);
    if (!resultado.ok) { mostrarErro("erro-conta-senha", resultado.erro); return; }
    location.reload();
  }

  function iniciar(sessao) {
    sessaoAtual = sessao;
    const btnMenu = document.getElementById("btn-usuario-menu");
    if (!btnMenu || btnMenu.dataset.contaLigado) return;
    btnMenu.dataset.contaLigado = "1";

    document.body.insertAdjacentHTML("beforeend", MODAL_HTML);
    const dropdown = document.getElementById("usuario-dropdown");

    btnMenu.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const aberto = dropdown.classList.toggle("aberto");
      btnMenu.setAttribute("aria-expanded", aberto ? "true" : "false");
    });
    document.addEventListener("click", () => {
      dropdown.classList.remove("aberto");
      btnMenu.setAttribute("aria-expanded", "false");
    });
    dropdown.addEventListener("click", (e) => e.stopPropagation());

    document.getElementById("link-conta-nome").addEventListener("click", (e) => { e.preventDefault(); dropdown.classList.remove("aberto"); abrirModal("nome"); });
    document.getElementById("link-conta-email").addEventListener("click", (e) => { e.preventDefault(); dropdown.classList.remove("aberto"); abrirModal("email"); });
    document.getElementById("link-conta-senha").addEventListener("click", (e) => { e.preventDefault(); dropdown.classList.remove("aberto"); abrirModal("senha"); });

    document.querySelectorAll(".modal-tabs .tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => trocarAba(btn.dataset.modalTab));
    });

    const overlay = document.getElementById("modal-conta-overlay");
    document.getElementById("btn-fechar-modal-conta").addEventListener("click", fecharModal);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fecharModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });

    document.getElementById("btn-salvar-nome").addEventListener("click", salvarNome);
    document.getElementById("btn-salvar-email").addEventListener("click", salvarEmail);
    document.getElementById("btn-salvar-senha").addEventListener("click", salvarSenha);
  }

  window.Conta = { iniciar };
})();
