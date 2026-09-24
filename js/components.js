/*
 * Camada de apresentação — helpers de renderização reutilizados pelas páginas.
 */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function renderHeader(active) {
    const link = (href, label, id) =>
      `<a href="${href}" class="${active === id ? "active" : ""}">${label}</a>`;
    const sessao = (global.Auth && global.Auth.sessaoAtual()) || null;
    const usuarioHtml = sessao
      ? `<div class="usuario-menu">
           <button class="usuario-logado" id="btn-usuario-menu" type="button">${esc(sessao.nome || sessao.email)}</button>
           <div class="usuario-dropdown" id="usuario-dropdown">
             <a href="#" id="link-conta-nome">Alterar nome de usuário</a>
             <a href="#" id="link-conta-email">Alterar e-mail</a>
             <a href="#" id="link-conta-senha">Alterar senha</a>
           </div>
         </div>
         <a href="#" id="btn-sair">Sair</a>`
      : "";
    return `
      <header class="site">
        <div class="nav-inner">
          <div class="brand">
            <span class="mark">cClassTrib</span><small>Reforma Tributária · LC 214/2025</small>
          </div>
          <nav class="links">
            ${link("sobre.html", "IBS, CBS e FAQ", "sobre")}
            ${link("index.html", "Consultar", "consultar")}
            ${link("lote.html", "Consulta em lote", "lote")}
            <button class="theme-toggle" id="btn-tema" type="button"></button>
            ${usuarioHtml}
          </nav>
        </div>
      </header>`;
  }

  // Conteúdo educativo compartilhado entre sobre.html (versão completa) e
  // index.html (prévia na tela inicial) — mantido em um único lugar para não
  // duplicar o texto em dois arquivos e correr o risco de divergirem.
  function renderExplicacaoTributos() {
    return `
      <div class="grid-3">
        <div class="explainer-card">
          <h3>IBS — Imposto sobre Bens e Serviços</h3>
          <p>Tributo subnacional (estados e municípios), de natureza não cumulativa, que substitui gradualmente o ICMS e o ISS. É administrado por um órgão colegiado, o Comitê Gestor do IBS (CGIBS), criado pela Emenda Constitucional nº 132/2023.</p>
        </div>
        <div class="explainer-card">
          <h3>CBS — Contribuição sobre Bens e Serviços</h3>
          <p>Tributo federal que substitui o PIS e a COFINS, administrado pela Receita Federal. Incide, em regra, sobre a mesma base e com as mesmas hipóteses de não incidência, redução e isenção do IBS — os dois seguem uma legislação unificada (LC 214/2025).</p>
        </div>
        <div class="explainer-card">
          <h3>Imposto Seletivo (IS)</h3>
          <p>Tributo federal <strong>adicional</strong> (não substitui outro imposto) sobre bens e serviços prejudiciais à saúde ou ao meio ambiente — cigarros, bebidas alcoólicas, veículos, embarcações, aeronaves, bens minerais, entre outros listados no Anexo XVII da LC 214/2025.</p>
        </div>
      </div>`;
  }

  const FAQ_ITEMS = [
    {
      pergunta: "O que é o cClassTrib?",
      resposta: "É o Código de Classificação Tributária do IBS e da CBS: um campo obrigatório nos documentos fiscais eletrônicos (NF-e/NFC-e) que identifica qual regra específica da LC 214/2025 (Anexo/artigo) se aplica àquele item, em conjunto com o CST (Código de Situação Tributária) do IBS/CBS. A tabela oficial de 6 dígitos é publicada pelo Portal Nacional da NF-e (Informe Técnico 2025.002)."
    },
    {
      pergunta: "De onde vem o código cClassTrib de 6 dígitos mostrado nos resultados?",
      resposta: "Do arquivo oficial \"cClassTrib 2026-06-22.xlsx\", publicado pelo Portal Nacional da NF-e em conjunto com a Receita Federal e o Comitê Gestor do IBS (Informe Técnico 2025.002). O arquivo foi importado integralmente (164 códigos) em js/cclasstrib-oficial.js. Quando um Anexo não tem código correspondente nessa tabela (caso do Imposto Seletivo, que usa sistemática própria, ou de Anexos sem lista de produtos), isso é indicado explicitamente em vez de inventado."
    },
    {
      pergunta: "Os dados deste site são oficiais?",
      resposta: "Sim, nas duas frentes: os Anexos, artigos e percentuais de redução vêm do texto oficial da Lei Complementar 214/2025 (Diário Oficial da União / Planalto, domínio público); os códigos cClassTrib e CST vêm do arquivo oficial do Portal Nacional da NF-e citado acima. Ainda assim, este site é uma ferramenta independente de apoio, sem qualquer vínculo com a Receita Federal, o Comitê Gestor do IBS ou qualquer SEFAZ, e pode conter erros de transcrição — sempre confira contra a fonte oficial antes de decisões fiscais."
    },
    {
      pergunta: "A Reforma Tributária já está totalmente em vigor?",
      resposta: "Não. A LC 214/2025 está em fase de regulamentação e transição (o período de transição do sistema tributário vai até 2033, com o modelo antigo sendo extinto de forma gradual). Além disso, leis complementares supervenientes já alteraram a LC 214/2025 — por exemplo, a Lei Complementar nº 227/2026 revogou o Anexo XIV (medicamentos) e alterou regras de combustíveis. Sempre confirme a vigência antes de aplicar qualquer classificação."
    },
    {
      pergunta: "Por que um NCM que eu sei que existe aparece como 'não encontrado'?",
      resposta: "Este site cobre os Anexos I a XVII da LC 214/2025 com uma extração cuidadosa, mas não exaustiva a 100% em todos os Anexos mais longos (ex.: Anexo VI tem 81 insumos farmacêuticos, Anexo X tem 57 itens culturais — mostramos uma seleção representativa desses dois). 'Não encontrado' significa apenas que o item não consta na nossa base atual — não significa necessariamente tributação integral. Consulte o texto oficial da lei ou um profissional para confirmação."
    },
    {
      pergunta: "Como é calculada a 'alíquota estimada'?",
      resposta: "A LC 214/2025 não fixa um percentual único de alíquota-padrão do IBS+CBS combinados — isso será definido por resolução do Senado Federal. Usamos um valor de referência ilustrativo (ajustável no código-fonte) e aplicamos o percentual de redução do Anexo correspondente. É uma estimativa educativa, não um valor oficial."
    },
    {
      pergunta: "Posso confiar neste site para fechar minha nota fiscal?",
      resposta: "Não. Use este site como ponto de partida para entender o enquadramento legal, mas a emissão de documentos fiscais deve sempre ser validada com seu sistema de ERP/emissor de NF-e homologado, seu contador e, quando necessário, a Receita Federal ou o Comitê Gestor do IBS."
    }
  ];

  function renderFaqAccordion(items) {
    return items.map((f, i) => `
      <div class="accordion-item" data-idx="${i}">
        <div class="accordion-header">
          <span>${esc(f.pergunta)}</span>
          <span class="chevron">▾</span>
        </div>
        <div class="accordion-body"><p>${esc(f.resposta)}</p></div>
      </div>
    `).join("");
  }

  // Liga o comportamento de abrir/fechar (um item por vez) num container já
  // preenchido por renderFaqAccordion. Compartilhado para não duplicar a
  // lógica de clique entre sobre.js e app.js.
  function ativarAccordion(container) {
    container.querySelectorAll(".accordion-item").forEach((item) => {
      const header = item.querySelector(".accordion-header");
      const body = item.querySelector(".accordion-body");
      header.addEventListener("click", () => {
        const isOpen = item.classList.contains("open");
        container.querySelectorAll(".accordion-item.open").forEach((other) => {
          other.classList.remove("open");
          other.querySelector(".accordion-body").style.maxHeight = null;
        });
        if (!isOpen) {
          item.classList.add("open");
          body.style.maxHeight = body.scrollHeight + "px";
        }
      });
    });
  }

  function renderFooter() {
    return `
      <footer class="site">
        <div class="container">
          Dados extraídos do texto oficial da Lei Complementar nº 214/2025 (Planalto, domínio público).
          Este site é uma ferramenta de apoio e <strong>não substitui</strong> a consulta a órgãos oficiais
          (Receita Federal, Comitê Gestor do IBS, SEFAZ) ou a um profissional de contabilidade/tributação.
        </div>
      </footer>`;
  }

  function renderAvisoLegal(data) {
    data = data || global.CCLASSTRIB_DATA;
    return `
      <div class="aviso-legal">
        <strong>⚠ Aviso legal:</strong> ${esc(data.meta.avisoRegulamentacao)}
        A alíquota de referência usada nas estimativas (${data.meta.aliquotaReferenciaEstimada}%) é apenas
        ilustrativa — ${esc(data.meta.aliquotaReferenciaObs)}
      </div>`;
  }

  function renderResultado(r) {
    if (r.naoEncontrado) {
      return `
        <div class="nao-encontrado">
          <strong>Não encontrado na base atual.</strong>
          <p>${esc(r.mensagem)}</p>
        </div>`;
    }
    const revogado = r.vigente === false
      ? `<div class="revogado-flag">ANEXO REVOGADO por ${esc(r.revogadoPor || "lei posterior")} — regra abaixo não está mais em vigor</div>`
      : "";
    const aliquota = r.aliquotaEstimada != null
      ? `${r.aliquotaEstimada}% <span class="hint">(estimado a partir de referência de ${r.aliquotaReferencia}%)</span>`
      : "não aplicável / depende de regulamentação específica";

    const avisoCapitulo = r.matchTipo === "capitulo"
      ? `<div class="revogado-flag" style="background:var(--amarelo-bg);color:var(--amarelo)">
           Correspondência por capítulo inteiro da NCM (código "${esc(r.matchCodigo)}") — a lei cita uma faixa ampla.
           Confira se a descrição do item realmente corresponde ao seu produto antes de aplicar esta classificação.
         </div>`
      : "";

    const alternativa = r.alternativa
      ? `<div class="meta" style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)">
           <strong>Tratamento alternativo:</strong> ${r.alternativa.percentualReducao}% de redução
           (${esc(r.alternativa.tratamentoLabel)}) com base no art. ${esc(r.alternativa.artigo)},
           ${esc(r.alternativa.condicao)}.
           ${r.alternativa.cClassTrib ? `Código cClassTrib: <code class="mono">${esc(r.alternativa.cClassTrib)}</code>.` : ""}
         </div>`
      : "";

    const titulo = r.anexoId ? `Anexo ${esc(r.anexoId)} — ${esc(r.anexoTitulo)}` : esc(r.anexoTitulo);

    return `
      <div class="resultado cor-${r.cor}">
        <span class="badge cor-${r.cor}">${esc(r.tratamentoLabel)}</span>
        <h3>${titulo}</h3>
        ${r.itemDescricao ? `<div class="desc">${esc(r.itemDescricao)}</div>` : ""}
        <div class="meta">Base legal: art. ${esc(r.artigo)} da LC 214/2025${r.item ? " · item " + esc(r.item) + " do Anexo " + esc(r.anexoId) : ""}</div>
        <div class="meta">Redução de alíquota: ${r.percentualReducao != null ? r.percentualReducao + "%" : "não aplicável (ver observação)"}</div>
        <div class="meta">Alíquota estimada resultante: ${aliquota}</div>
        <div class="meta">CST-IBS/CBS: <code class="mono">${esc(r.cst || "—")}</code> · Código cClassTrib: <code class="mono">${esc(r.cClassTrib)}</code></div>
        ${r.observacaoAnexo ? `<div class="meta">Observação: ${esc(r.observacaoAnexo)}</div>` : ""}
        ${alternativa}
        ${revogado}
        ${avisoCapitulo}
        <div class="fonte-link"><a href="${esc(r.fonteUrl)}" target="_blank" rel="noopener">Ver texto oficial da LC 214/2025 →</a></div>
      </div>`;
  }

  function renderOperacaoResultado(r) {
    if (!r) return `<div class="nao-encontrado"><strong>Tipo de operação não encontrado.</strong></div>`;
    const reducaoHtml = r.percentualReducao != null
      ? `<div class="meta">Redução de alíquota: <strong>${esc(r.percentualReducao)}%</strong></div>`
      : "";
    return `
      <div class="resultado cor-${r.cor}">
        <span class="badge cor-${r.cor}">${esc(r.tratamentoLabel)}</span>
        <h3>${esc(r.operacaoLabel)}</h3>
        <div class="desc">${esc(r.descricao)}</div>
        <div class="meta">Base legal: art. ${esc(r.artigo)} da LC 214/2025</div>
        ${reducaoHtml}
        <div class="meta">CST-IBS/CBS: <code class="mono">${esc(r.cst || "—")}</code> · Código cClassTrib: <code class="mono">${esc(r.cClassTrib)}</code></div>
        <div class="fonte-link"><a href="${esc(r.fonteUrl)}" target="_blank" rel="noopener">Ver texto oficial da LC 214/2025 →</a></div>
      </div>`;
  }

  // Card de resultado da busca na tabela NCM completa (js/ncm-tabela.js) —
  // visualmente distinto dos cards de classificação tributária (não usa as
  // cores semânticas verde/amarelo/vermelho, porque aqui não estamos dizendo
  // qual é o tratamento fiscal, só qual é o código NCM do produto).
  function renderNcmBuscaResultado(r) {
    const badgeNivel = r.viaMarca
      ? `<span class="badge cor-amarelo">Marca reconhecida (heurística — não é a tabela oficial)</span>`
      : r.completo
      ? `<span class="badge cor-neutro">Código NCM completo</span>`
      : `<span class="badge cor-neutro-fraco">Posição/capítulo (nível hierárquico mais amplo)</span>`;

    const avisoMarca = r.viaMarca
      ? `<div class="meta ncm-especial">
          "${esc(r.marcaTermo || "")}" foi reconhecida como <strong>${esc(r.marcaCategoria || "")}</strong> por uma lista própria de marcas conhecidas — este NCM não veio da busca textual na tabela oficial. Confira antes de usar.
        </div>`
      : "";

    let infoTributaria;
    if (r.especial) {
      infoTributaria = `
        <div class="meta ncm-especial">
          <span class="badge cor-${r.especial.cor}">${esc(r.especial.tratamentoLabel)}</span>
          tem tratamento tributário especial no Anexo ${esc(r.especial.anexoId)} da LC 214/2025 (art. ${esc(r.especial.artigo)}).
          <button class="btn secondary btn-sm btn-ver-classificacao" data-ncm="${esc(r.codigo)}" type="button">Ver classificação tributária →</button>
        </div>`;
    } else if (r.completo) {
      infoTributaria = `
        <div class="meta">
          Não consta em nenhum Anexo de redução/zero mapeado neste site — pela regra geral do IBS/CBS, provavelmente tributação integral.
          <button class="btn secondary btn-sm btn-ver-classificacao" data-ncm="${esc(r.codigo)}" type="button">Conferir na aba "Consultar cClassTrib" →</button>
        </div>`;
    } else {
      infoTributaria = "";
    }

    return `
      <div class="resultado cor-neutro">
        ${badgeNivel}
        <h3><code class="mono ncm-codigo-grande">${esc(r.codigo)}</code></h3>
        <div class="desc">${esc(r.descricao)}</div>
        ${avisoMarca}
        ${infoTributaria}
      </div>`;
  }

  global.Components = {
    esc,
    renderHeader,
    renderFooter,
    renderAvisoLegal,
    renderResultado,
    renderOperacaoResultado,
    renderNcmBuscaResultado,
    renderExplicacaoTributos,
    FAQ_ITEMS,
    renderFaqAccordion,
    ativarAccordion
  };
})(window);
