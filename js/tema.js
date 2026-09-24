/*
 * Alternância de tema claro/escuro (paleta idêntica à do Validador Sintegra —
 * ver css/styles.css). O tema é aplicado via atributo data-theme no <html>;
 * um script inline no <head> de cada página já aplica a preferência salva
 * ANTES do CSS pintar a tela (evita flash do tema errado). Este arquivo só
 * liga o botão do cabeçalho depois que Components.renderHeader() o insere.
 */
(function (global) {
  "use strict";

  const CHAVE = "cclasstrib-tema";

  function temaAtual() {
    const atributo = document.documentElement.getAttribute("data-theme");
    if (atributo === "light" || atributo === "dark") return atributo;
    return global.matchMedia && global.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  function aplicarTema(tema) {
    document.documentElement.setAttribute("data-theme", tema);
    try { localStorage.setItem(CHAVE, tema); } catch (e) { /* modo privado etc. — ignora */ }
    atualizarBotao();
  }

  function atualizarBotao() {
    const btn = document.getElementById("btn-tema");
    if (!btn) return;
    const claro = temaAtual() === "light";
    btn.textContent = claro ? "🌙 Escuro" : "☀️ Claro";
    btn.setAttribute("aria-label", claro ? "Mudar para tema escuro" : "Mudar para tema claro");
    btn.title = btn.getAttribute("aria-label");
  }

  function iniciar() {
    const btn = document.getElementById("btn-tema");
    if (!btn || btn.dataset.temaLigado) return;
    btn.dataset.temaLigado = "1";
    atualizarBotao();
    btn.addEventListener("click", () => {
      aplicarTema(temaAtual() === "light" ? "dark" : "light");
    });
  }

  global.Tema = { aplicarTema, temaAtual, iniciar };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})(window);
