/*
 * Autenticação — login/criação de conta.
 *
 * Este site é 100% estático (sem backend/servidor de aplicação), então as
 * contas ficam salvas no localStorage do navegador/instalação, não num
 * banco de dados compartilhado — cada máquina/navegador tem sua própria
 * lista de contas. A senha NUNCA é salva em texto puro: só um hash PBKDF2
 * (via SubtleCrypto, window.crypto.subtle) com um salt aleatório por
 * usuário. PBKDF2/SubtleCrypto só funciona em "contexto seguro"
 * (https:// ou http://localhost) — é por isso que o app desktop serve o
 * site via servidor HTTP local em vez de abrir os arquivos direto
 * (file://, que não conta como contexto seguro).
 *
 * "Deseja salvar seu login?" (login.html): controla ONDE a sessão fica —
 * localStorage (sobrevive fechar/abrir de novo) se marcada, sessionStorage
 * (some ao fechar) se não. Ver iniciarSessao() mais abaixo.
 */
(function (global) {
  "use strict";

  const CHAVE_USUARIOS = "cclasstrib-usuarios";
  const CHAVE_SESSAO = "cclasstrib-sessao";
  const ITERACOES_PBKDF2 = 100000;

  function lerUsuarios() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_USUARIOS) || "{}");
    } catch (e) {
      return {};
    }
  }

  function salvarUsuarios(usuarios) {
    localStorage.setItem(CHAVE_USUARIOS, JSON.stringify(usuarios));
  }

  function normalizarEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function emailValido(email) {
    // Checagem simples de formato (não confirma que o e-mail existe de
    // verdade — não há como confirmar isso sem servidor/envio de e-mail).
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function bufferParaHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function hexParaBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
  }

  async function derivarHash(senha, saltBytes) {
    const enc = new TextEncoder();
    const chaveBase = await crypto.subtle.importKey("raw", enc.encode(senha), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: saltBytes, iterations: ITERACOES_PBKDF2, hash: "SHA-256" },
      chaveBase,
      256
    );
    return bufferParaHex(bits);
  }

  /**
   * Cria uma conta nova. Devolve {ok:true} ou {ok:false, erro}.
   * Validações de formato (e-mail, tamanho de senha) ficam por conta de
   * quem chama (ver js/registro.js) — esta função só garante que o
   * e-mail ainda não está cadastrado antes de gravar.
   */
  async function criarConta(email, senha, nome) {
    email = normalizarEmail(email);
    const usuarios = lerUsuarios();
    if (usuarios[email]) {
      return { ok: false, erro: "Já existe uma conta com este e-mail." };
    }
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derivarHash(senha, saltBytes);
    usuarios[email] = {
      nome: String(nome || "").trim(),
      salt: bufferParaHex(saltBytes),
      hash,
      criadoEm: new Date().toISOString()
    };
    salvarUsuarios(usuarios);
    return { ok: true };
  }

  /**
   * Confere e-mail/senha. Devolve {ok:true, email, nome} ou
   * {ok:false, erro}. Propositalmente usa a mesma mensagem de erro pra
   * "e-mail não existe" e "senha errada" — não vale a pena revelar pra
   * quem está tentando entrar qual dos dois estava errado.
   */
  async function autenticar(email, senha) {
    email = normalizarEmail(email);
    const usuarios = lerUsuarios();
    const registro = usuarios[email];
    if (!registro) return { ok: false, erro: "E-mail ou senha incorretos." };
    const hash = await derivarHash(senha, hexParaBytes(registro.salt));
    if (hash !== registro.hash) return { ok: false, erro: "E-mail ou senha incorretos." };
    return { ok: true, email, nome: registro.nome };
  }

  /**
   * Troca só o nome de exibição — não exige senha (não é um dado sensível
   * como e-mail/senha, é só o que aparece no cabeçalho). Atualiza a sessão
   * ativa também, se for a conta logada no momento.
   */
  async function alterarNome(email, novoNome) {
    email = normalizarEmail(email);
    novoNome = String(novoNome || "").trim();
    if (!novoNome) return { ok: false, erro: "Preencha o nome." };
    const usuarios = lerUsuarios();
    const registro = usuarios[email];
    if (!registro) return { ok: false, erro: "Conta não encontrada." };
    registro.nome = novoNome;
    salvarUsuarios(usuarios);
    const sessao = sessaoAtual();
    if (sessao && normalizarEmail(sessao.email) === email) iniciarSessao(email, novoNome, sessaoEstaLembrada());
    return { ok: true };
  }

  /**
   * Troca o e-mail — exige a senha atual pra confirmar (e-mail é a "chave"
   * da conta no localStorage, então trocar sem confirmar a identidade de
   * quem está pedindo seria arriscado demais). Move o registro pra uma
   * nova chave no dicionário de usuários; o e-mail antigo deixa de existir.
   */
  async function alterarEmail(emailAtual, novoEmail, senhaAtual) {
    emailAtual = normalizarEmail(emailAtual);
    novoEmail = normalizarEmail(novoEmail);
    if (!emailValido(novoEmail)) return { ok: false, erro: "Preencha um e-mail válido." };
    if (novoEmail === emailAtual) return { ok: false, erro: "Esse já é o e-mail atual." };
    const confirmacao = await autenticar(emailAtual, senhaAtual);
    if (!confirmacao.ok) return { ok: false, erro: "Senha atual incorreta." };
    const usuarios = lerUsuarios();
    if (usuarios[novoEmail]) return { ok: false, erro: "Já existe uma conta com este e-mail." };
    const registro = usuarios[emailAtual];
    delete usuarios[emailAtual];
    usuarios[novoEmail] = registro;
    salvarUsuarios(usuarios);
    const sessao = sessaoAtual();
    if (sessao && normalizarEmail(sessao.email) === emailAtual) iniciarSessao(novoEmail, registro.nome, sessaoEstaLembrada());
    return { ok: true };
  }

  /**
   * Troca a senha — exige a senha atual pra confirmar. Gera um salt novo
   * (não reaproveita o antigo) e recalcula o hash com a senha nova.
   */
  async function alterarSenha(email, senhaAtual, novaSenha) {
    email = normalizarEmail(email);
    const confirmacao = await autenticar(email, senhaAtual);
    if (!confirmacao.ok) return { ok: false, erro: "Senha atual incorreta." };
    const usuarios = lerUsuarios();
    const registro = usuarios[email];
    if (!registro) return { ok: false, erro: "Conta não encontrada." };
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    registro.hash = await derivarHash(novaSenha, saltBytes);
    registro.salt = bufferParaHex(saltBytes);
    salvarUsuarios(usuarios);
    return { ok: true };
  }

  function removerConta(email) {
    email = normalizarEmail(email);
    const usuarios = lerUsuarios();
    delete usuarios[email];
    salvarUsuarios(usuarios);
  }

  /**
   * "Lembrar login" (caixa "Deseja salvar seu login?" em login.html): sem
   * marcar, a sessão fica em sessionStorage — some sozinha ao fechar a
   * aba/o app, exigindo login de novo na próxima vez. Marcando, a sessão
   * vai pro localStorage, que sobrevive a fechar e reabrir. As duas
   * chaves nunca ficam preenchidas ao mesmo tempo (guardar sempre limpa a
   * outra) pra sessaoAtual() nunca ler um estado antigo por engano.
   */
  function iniciarSessao(email, nome, lembrar) {
    const dados = JSON.stringify({ email, nome });
    if (lembrar) {
      localStorage.setItem(CHAVE_SESSAO, dados);
      sessionStorage.removeItem(CHAVE_SESSAO);
    } else {
      sessionStorage.setItem(CHAVE_SESSAO, dados);
      localStorage.removeItem(CHAVE_SESSAO);
    }
  }

  function encerrarSessao() {
    localStorage.removeItem(CHAVE_SESSAO);
    sessionStorage.removeItem(CHAVE_SESSAO);
  }

  function sessaoAtual() {
    try {
      const doLocal = localStorage.getItem(CHAVE_SESSAO);
      if (doLocal) return JSON.parse(doLocal);
      const daAba = sessionStorage.getItem(CHAVE_SESSAO);
      if (daAba) return JSON.parse(daAba);
      return null;
    } catch (e) {
      return null;
    }
  }

  // Pra alterarNome/alterarEmail reabrirem a sessão no MESMO lugar de
  // onde ela já estava (não forçar "lembrado" nem "não lembrado" — só
  // manter a preferência que a pessoa já tinha escolhido no login).
  function sessaoEstaLembrada() {
    try {
      return !!localStorage.getItem(CHAVE_SESSAO);
    } catch (e) {
      return false;
    }
  }

  // Liga o botão "Sair" injetado por Components.renderHeader() quando há
  // sessão ativa — mesmo padrão de auto-inicialização de js/tema.js.
  function iniciarBotaoSair() {
    const btn = document.getElementById("btn-sair");
    if (!btn || btn.dataset.sairLigado) return;
    btn.dataset.sairLigado = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      encerrarSessao();
      location.href = "login.html";
    });
  }

  global.Auth = {
    emailValido,
    criarConta,
    autenticar,
    alterarNome,
    alterarEmail,
    alterarSenha,
    removerConta,
    iniciarSessao,
    encerrarSessao,
    sessaoAtual,
    sessaoEstaLembrada,
    iniciarBotaoSair
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarBotaoSair);
  } else {
    iniciarBotaoSair();
  }
})(window);
