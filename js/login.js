(function () {
  "use strict";
  window.Auth.redirecionarSeLogado();

  const inputEmail = document.getElementById("input-email");
  const inputSenha = document.getElementById("input-senha");
  const inputLembrar = document.getElementById("input-lembrar");
  const erroEl = document.getElementById("erro-login");
  const btnEntrar = document.getElementById("btn-entrar");

  function mostrarErro(msg) {
    erroEl.textContent = msg;
    erroEl.style.display = "block";
  }

  async function tentarEntrar() {
    erroEl.style.display = "none";
    const email = inputEmail.value.trim();
    const senha = inputSenha.value;
    if (!email || !senha) {
      mostrarErro("Preencha e-mail e senha.");
      return;
    }
    btnEntrar.disabled = true;
    btnEntrar.textContent = "Entrando...";
    try {
      const resultado = await window.Auth.login(email, senha, inputLembrar.checked);
      if (!resultado.ok) {
        mostrarErro(resultado.erro);
        return;
      }
      location.href = "index.html";
    } catch (e) {
      mostrarErro("Não foi possível entrar. Tente novamente.");
    } finally {
      btnEntrar.disabled = false;
      btnEntrar.textContent = "Entrar";
    }
  }

  btnEntrar.addEventListener("click", tentarEntrar);
  [inputEmail, inputSenha].forEach((el) => {
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") tentarEntrar(); });
  });
  inputEmail.focus();
})();
