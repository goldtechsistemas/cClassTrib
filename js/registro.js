(function () {
  "use strict";
  window.Auth.redirecionarSeLogado();

  const inputNome = document.getElementById("input-nome");
  const inputEmail = document.getElementById("input-email");
  const inputSenha = document.getElementById("input-senha");
  const inputConfirmar = document.getElementById("input-confirmar-senha");
  const erroEl = document.getElementById("erro-registro");
  const btnCriar = document.getElementById("btn-criar-conta");

  const TAMANHO_MINIMO_SENHA = 6;

  function mostrarErro(msg) {
    erroEl.textContent = msg;
    erroEl.style.display = "block";
  }

  async function tentarCriarConta() {
    erroEl.style.display = "none";
    const nome = inputNome.value.trim();
    const email = inputEmail.value.trim();
    const senha = inputSenha.value;
    const confirmar = inputConfirmar.value;

    if (!nome) { mostrarErro("Preencha seu nome."); return; }
    if (!email || !window.Auth.emailValido(email)) { mostrarErro("Preencha um e-mail válido."); return; }
    if (senha.length < TAMANHO_MINIMO_SENHA) {
      mostrarErro(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
      return;
    }
    if (senha !== confirmar) { mostrarErro("As senhas não são iguais."); return; }

    btnCriar.disabled = true;
    btnCriar.textContent = "Criando conta...";
    try {
      const resultado = await window.Auth.criarConta(email, senha, nome);
      if (!resultado.ok) {
        mostrarErro(resultado.erro);
        return;
      }
      // O servidor já deixa a sessão "lembrada" (api/register.js) — a caixa
      // "Deseja salvar seu login?" é escolha explícita só na tela de login
      // (ver js/login.js), não faz sentido pedir de novo aqui.
      location.href = "index.html";
    } catch (e) {
      mostrarErro("Não foi possível criar a conta. Tente novamente.");
    } finally {
      btnCriar.disabled = false;
      btnCriar.textContent = "Criar conta";
    }
  }

  btnCriar.addEventListener("click", tentarCriarConta);
  [inputNome, inputEmail, inputSenha, inputConfirmar].forEach((el) => {
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") tentarCriarConta(); });
  });
  inputNome.focus();
})();
