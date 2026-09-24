/*
 * Autenticação — login/criação de conta.
 *
 * Reescrito para falar com o backend real (api/*.js, Vercel Functions +
 * Postgres) em vez de guardar contas no localStorage. Motivo: o painel
 * admin (js/admin.js, admin.html) precisa ver TODAS as contas cadastradas
 * e bloquear/excluir de verdade — algo impossível quando cada conta vive
 * isolada no navegador de quem se cadastrou. A sessão agora é um cookie
 * HttpOnly assinado (JWT) que o servidor confere a cada chamada; o
 * JavaScript do cliente nunca vê nem guarda a senha ou o token.
 *
 * Aviso: o app desktop (cClassTrib-Desktop) serve esses mesmos arquivos
 * através de um servidor HTTP local em Python, que NÃO tem as rotas
 * api/*.js (essas só existem no deploy da Vercel) — login/cadastro deixam
 * de funcionar no .exe até esse ponto ser resolvido separadamente (ex.:
 * apontar os fetches para a URL pública em vez de localhost).
 */
(function (global) {
  "use strict";

  function emailValido(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

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
      return { ok: false, erro: "Não foi possível conectar ao servidor. Tente novamente." };
    }
    let dados = {};
    try {
      dados = await resposta.json();
    } catch (e) {
      // resposta sem corpo JSON (ex.: erro 500 genérico do runtime)
    }
    if (dados.ok === undefined) dados.ok = resposta.ok;
    return dados;
  }

  function criarConta(email, senha, nome) {
    return postJson("/api/register", { email, senha, nome });
  }

  function login(email, senha, lembrar) {
    return postJson("/api/login", { email, senha, lembrar });
  }

  async function logout() {
    await postJson("/api/logout", {});
  }

  async function sessaoAtual() {
    try {
      const resposta = await fetch("/api/session", { credentials: "same-origin" });
      const dados = await resposta.json();
      return dados.logado ? { email: dados.email, nome: dados.nome } : null;
    } catch (e) {
      return null;
    }
  }

  function alterarNome(novoNome) {
    return postJson("/api/conta/nome", { nome: novoNome });
  }

  function alterarEmail(novoEmail, senhaAtual) {
    return postJson("/api/conta/email", { novoEmail, senhaAtual });
  }

  function alterarSenha(senhaAtual, novaSenha) {
    return postJson("/api/conta/senha", { senhaAtual, novaSenha });
  }

  function montarMenuUsuario(sessao) {
    const nav = document.querySelector("#header .links");
    if (!nav || document.getElementById("btn-usuario-menu")) return;
    const esc = (global.Components && global.Components.esc) || ((s) => String(s == null ? "" : s));
    nav.insertAdjacentHTML(
      "beforeend",
      `<div class="usuario-menu">
         <button class="usuario-logado" id="btn-usuario-menu" type="button">${esc(sessao.nome || sessao.email)}</button>
         <div class="usuario-dropdown" id="usuario-dropdown">
           <a href="#" id="link-conta-nome">Alterar nome de usuário</a>
           <a href="#" id="link-conta-email">Alterar e-mail</a>
           <a href="#" id="link-conta-senha">Alterar senha</a>
         </div>
       </div>
       <a href="#" id="btn-sair">Sair</a>`
    );
    iniciarBotaoSair();
  }

  function iniciarBotaoSair() {
    const btn = document.getElementById("btn-sair");
    if (!btn || btn.dataset.sairLigado) return;
    btn.dataset.sairLigado = "1";
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      await logout();
      location.href = "login.html";
    });
  }

  /**
   * Chamada no fim de toda página protegida (index.html, lote.html,
   * sobre.html): confere a sessão no servidor, redireciona pra login.html
   * se não houver uma válida, injeta o menu do usuário no header (já
   * desenhado por Components.renderHeader) e só então revela a página —
   * ver a regra `html.sessao-pronta body` em css/styles.css.
   */
  async function protegerPagina() {
    const sessao = await sessaoAtual();
    if (!sessao) {
      location.replace("login.html");
      return;
    }
    montarMenuUsuario(sessao);
    document.documentElement.classList.add("sessao-pronta");
    if (global.Conta) global.Conta.iniciar(sessao);
  }

  /**
   * Chamada em login.html/registro.html: se já existir sessão válida, não
   * faz sentido mostrar o formulário de novo — manda pra sobre.html
   * ("IBS, CBS e FAQ"), a mesma tela inicial usada logo após login/cadastro.
   */
  async function redirecionarSeLogado() {
    const sessao = await sessaoAtual();
    if (sessao) {
      location.replace("sobre.html");
      return;
    }
    document.documentElement.classList.add("sessao-pronta");
  }

  global.Auth = {
    emailValido,
    criarConta,
    login,
    logout,
    sessaoAtual,
    alterarNome,
    alterarEmail,
    alterarSenha,
    protegerPagina,
    redirecionarSeLogado,
  };
})(window);
