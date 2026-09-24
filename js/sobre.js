(function () {
  "use strict";
  const { renderHeader, renderFooter, renderAvisoLegal, esc } = window.Components;
  const data = window.CCLASSTRIB_DATA;

  document.getElementById("header").innerHTML = renderHeader("sobre");
  document.getElementById("footer").innerHTML = renderFooter();
  document.getElementById("aviso").innerHTML = renderAvisoLegal(data);
  document.getElementById("explicacao-tributos").innerHTML = window.Components.renderExplicacaoTributos();

  const tbody = document.getElementById("tabela-anexos");
  tbody.innerHTML = data.anexos.map((a) => {
    const trat = data.tratamentos[a.tratamento] || data.tratamentos.pendente;
    const situacao = a.vigente === false ? `${trat.label} (REVOGADO)` : trat.label;
    const oficial = window.Rules.buscarCClassTribOficial(a.id, a.percentualReducao);
    const codigo = oficial ? oficial.codigo : "—";
    return `<tr>
      <td>${esc(a.id)}</td>
      <td>${esc(a.titulo)}</td>
      <td><span class="badge cor-${trat.cor}">${esc(situacao)}</span></td>
      <td>${esc(a.artigo)}</td>
      <td><code class="mono">${esc(codigo)}</code></td>
    </tr>`;
  }).join("");

  const faqEl = document.getElementById("faq");
  faqEl.innerHTML = window.Components.renderFaqAccordion(window.Components.FAQ_ITEMS);
  window.Components.ativarAccordion(faqEl);
})();
