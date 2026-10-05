/*
 * Menu "minha conta" (nome no cabeçalho → menu suspenso → modal com 2
 * abas: nome e senha — o e-mail é o login e só o administrador cria contas,
 * então o usuário não o altera). Diferente de js/tema.js/js/auth.js, não se
 * auto-inicia sozinho: Auth.protegerPagina() (js/auth.js) chama
 * Conta.iniciar(sessao) explicitamente depois de confirmar a sessão no
 * servidor e injetar o botão do usuário no header — antes disso o botão
 * #btn-usuario-menu nem existe no DOM.
 */
(function () {
  "use strict";

  const TAMANHO_MINIMO_SENHA = 8;
  let sessaoAtual = null;
  const MODAL_HTML = `
    <div class="modal-overlay" id="modal-conta-overlay">
      <div class="card modal-card">
        <button class="modal-fechar" id="btn-fechar-modal-conta" type="button" aria-label="Fechar">&times;</button>
        <h2 class="modal-titulo">Minha conta</h2>
        <div class="tabs modal-tabs">
          <button class="tab-btn active" data-modal-tab="nome" type="button">Nome</button>
          <button class="tab-btn" data-modal-tab="senha" type="button">Senha</button>
        </div>

        <div class="panel active" id="modal-panel-nome">
          <div id="erro-conta-nome" class="aviso-legal" style="display:none;"></div>
          <label for="input-conta-nome">Nome</label>
          <input type="text" id="input-conta-nome" name="conta-nome-exibicao" autocomplete="off" data-lpignore="true" data-1p-ignore data-form-type="other" />
          <div class="field-actions"><button class="btn" id="btn-salvar-nome" type="button">Salvar</button></div>
        </div>

        <div class="panel" id="modal-panel-senha">
          <div id="erro-conta-senha" class="aviso-legal" style="display:none;"></div>
          <label for="input-conta-senha-atual">Senha atual</label>
          <input type="text" class="campo-senha-oculta" id="input-conta-senha-atual" name="conta-chave-atual" autocomplete="off" data-lpignore="true" data-1p-ignore data-form-type="other" />
          <label for="input-conta-senha-nova" style="margin-top:14px;">Nova senha</label>
          <input type="text" class="campo-senha-oculta" id="input-conta-senha-nova" name="conta-chave-nova" placeholder="No mínimo 8 caracteres" autocomplete="off" data-lpignore="true" data-1p-ignore data-form-type="other" />
          <label for="input-conta-senha-confirmar" style="margin-top:14px;">Confirmar nova senha</label>
          <input type="text" class="campo-senha-oculta" id="input-conta-senha-confirmar" name="conta-chave-confirma" autocomplete="off" data-lpignore="true" data-1p-ignore data-form-type="other" />
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
    ["erro-conta-nome", "erro-conta-senha"].forEach((id) => {
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
    document.getElementById("link-conta-senha").addEventListener("click", (e) => { e.preventDefault(); dropdown.classList.remove("aberto"); abrirModal("senha"); });

    document.querySelectorAll(".modal-tabs .tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => trocarAba(btn.dataset.modalTab));
    });

    const overlay = document.getElementById("modal-conta-overlay");
    document.getElementById("btn-fechar-modal-conta").addEventListener("click", fecharModal);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fecharModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });

    document.getElementById("btn-salvar-nome").addEventListener("click", salvarNome);
    document.getElementById("btn-salvar-senha").addEventListener("click", salvarSenha);
  }

  window.Conta = { iniciar };
})();
