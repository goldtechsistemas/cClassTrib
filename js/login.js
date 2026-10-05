(function () {
  "use strict";
  window.Auth.redirecionarSeLogado();

  const TAMANHO_MINIMO_SENHA = 8;

  const inputEmail = document.getElementById("input-email");
  const inputSenha = document.getElementById("input-senha");
  const inputLembrar = document.getElementById("input-lembrar");
  const erroEl = document.getElementById("erro-login");
  const btnEntrar = document.getElementById("btn-entrar");

  const etapaEntrar = document.getElementById("etapa-entrar");
  const etapaNovaSenha = document.getElementById("etapa-nova-senha");
  const subtitulo = document.getElementById("subtitulo-login");
  const inputNovaSenha = document.getElementById("input-nova-senha");
  const inputNovaSenhaConfirmar = document.getElementById("input-nova-senha-confirmar");
  const btnSalvarNovaSenha = document.getElementById("btn-salvar-nova-senha");

  function mostrarErro(msg) {
    erroEl.textContent = msg;
    erroEl.style.display = "block";
  }

  // sobre.html ("IBS, CBS e FAQ") é a tela inicial — mesmo padrão do app
  // desktop, que sempre abre nela em vez de ir direto pra consulta.
  function irParaInicio() {
    location.href = "sobre.html";
  }

  // Primeiro acesso (conta criada pelo administrador): o servidor aceitou a
  // senha provisória mas ainda não abriu a sessão — falta o usuário criar a
  // senha dele.
  function mostrarEtapaNovaSenha() {
    etapaEntrar.style.display = "none";
    etapaNovaSenha.style.display = "";
    subtitulo.textContent = "Crie a sua senha";
    inputSenha.value = "";
    inputNovaSenha.focus();
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
      if (resultado.trocarSenha) {
        mostrarEtapaNovaSenha();
        return;
      }
      irParaInicio();
    } catch (e) {
      mostrarErro("Não foi possível entrar. Tente novamente.");
    } finally {
      btnEntrar.disabled = false;
      btnEntrar.textContent = "Entrar";
    }
  }

  async function salvarNovaSenha() {
    erroEl.style.display = "none";
    const nova = inputNovaSenha.value;
    const confirmar = inputNovaSenhaConfirmar.value;
    if (nova.length < TAMANHO_MINIMO_SENHA) {
      mostrarErro(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
      return;
    }
    if (nova !== confirmar) {
      mostrarErro("As senhas não são iguais.");
      return;
    }
    btnSalvarNovaSenha.disabled = true;
    btnSalvarNovaSenha.textContent = "Salvando...";
    try {
      const resultado = await window.Auth.definirSenhaInicial(nova);
      if (!resultado.ok) {
        mostrarErro(resultado.erro);
        return;
      }
      irParaInicio();
    } catch (e) {
      mostrarErro("Não foi possível salvar a senha. Tente novamente.");
    } finally {
      btnSalvarNovaSenha.disabled = false;
      btnSalvarNovaSenha.textContent = "Salvar e entrar";
    }
  }

  btnEntrar.addEventListener("click", tentarEntrar);
  [inputEmail, inputSenha].forEach((el) => {
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") tentarEntrar(); });
  });
  btnSalvarNovaSenha.addEventListener("click", salvarNovaSenha);
  [inputNovaSenha, inputNovaSenhaConfirmar].forEach((el) => {
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") salvarNovaSenha(); });
  });
  inputEmail.focus();
})();
