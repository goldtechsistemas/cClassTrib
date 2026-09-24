(function () {
  "use strict";
  const { renderHeader, renderFooter, renderAvisoLegal, renderResultado, renderOperacaoResultado } = window.Components;
  const data = window.CCLASSTRIB_DATA;

  document.getElementById("header").innerHTML = renderHeader("consultar");
  document.getElementById("footer").innerHTML = renderFooter();
  document.getElementById("aviso").innerHTML = renderAvisoLegal(data);

  // Tabs
  function ativarAba(tabId) {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + tabId));
  }
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => ativarAba(btn.dataset.tab));
  });

  function exibirResultados(container, resultados, consultaOriginal) {
    if (!resultados || resultados.length === 0) {
      container.innerHTML = renderResultado(window.Rules.naoEncontrado(consultaOriginal));
      return;
    }
    container.innerHTML = resultados.map(renderResultado).join("");
  }

  // --- Consultar cClassTrib: só por NCM (busca exata dentro dos Anexos).
  const inputNcm = document.getElementById("input-ncm");
  const resultadoNcm = document.getElementById("resultado-ncm");

  function buscarCclasstrib() {
    const ncm = inputNcm.value.trim();
    if (!ncm) {
      resultadoNcm.innerHTML = "";
      return;
    }
    const resultados = window.Rules.classificarPorNcm(ncm, data);
    exibirResultados(resultadoNcm, resultados, ncm);
  }

  document.getElementById("btn-buscar-ncm").addEventListener("click", buscarCclasstrib);
  inputNcm.addEventListener("keydown", (e) => { if (e.key === "Enter") buscarCclasstrib(); });

  // Usado pela aba "Descobrir NCM" para levar um código encontrado direto
  // para a classificação tributária, sem o usuário ter que copiar/colar.
  function irParaClassificacaoNcm(ncm) {
    ativarAba("ncm");
    inputNcm.value = ncm;
    buscarCclasstrib();
    resultadoNcm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // --- Descobrir NCM (tabela oficial completa) ---
  const inputDescobrirNcm = document.getElementById("input-descobrir-ncm");
  const resultadoDescobrirNcm = document.getElementById("resultado-descobrir-ncm");
  const ncmTabelaInfoEl = document.getElementById("ncm-tabela-info");

  if (window.NCM_TABELA_META && ncmTabelaInfoEl) {
    const meta = window.NCM_TABELA_META;
    ncmTabelaInfoEl.textContent = `${meta.vigenciaTexto}, ${meta.totalItens.toLocaleString("pt-BR")} itens`;
  }

  function buscarDescobrirNcm() {
    const termo = inputDescobrirNcm.value.trim();
    if (!termo) {
      resultadoDescobrirNcm.innerHTML = "";
      return;
    }
    if (!window.NCM_TABELA || !window.NcmBusca) {
      resultadoDescobrirNcm.innerHTML = `<div class="nao-encontrado"><strong>Tabela NCM completa não carregada.</strong><p>Verifique se js/ncm-tabela.js está incluído na página.</p></div>`;
      return;
    }

    // "Refeição", "marmitex", "porção"... descrevem um SERVIÇO de
    // alimentação, não uma mercadoria — genuinamente não têm NCM. Em vez de
    // devolver "nenhum candidato" (parece busca ruim; na verdade é a
    // pergunta errada), aponta direto pro regime tributário real que se
    // aplica, com o código cClassTrib oficial já carregado no site.
    const servico = window.NcmBusca.buscarServicoSemNcm(termo);
    if (servico) {
      const opResultado = window.Rules.classificarPorOperacao(servico.operacaoId, data);
      resultadoDescobrirNcm.innerHTML = `
        <div class="nao-encontrado">
          <strong>"${window.Components.esc(servico.termoEncontrado)}" não tem um NCM.</strong>
          <p>NCM classifica mercadorias, não serviços — e um item de cardápio de bar/restaurante/lanchonete é uma prestação de
          serviço com regime tributário próprio, não uma mercadoria com código NCM. O tratamento real que se aplica é este:</p>
        </div>
        ${renderOperacaoResultado(opResultado)}`;
      return;
    }

    const resultados = window.NcmBusca.buscarNcmPorDescricao(termo).map((r) => {
      if (r.completo) {
        r.especial = window.NcmBusca.verificarTratamentoEspecial(r.codigo, data);
      }
      return r;
    });

    // Se o termo citar uma marca conhecida (ex.: "Brahma", "Heineken"), o
    // card de marca aparece primeiro — a busca textual na tabela oficial
    // pode achar um homônimo errado (ex.: "Original" bate com uma
    // copiadora) ou nada, e a marca costuma ser mais confiável nesses casos.
    const marca = window.NcmBusca.buscarViaMarcaConhecida(termo);
    if (marca) {
      const melhor = window.NcmBusca.buscarMelhorNcmCompleto(termo);
      const cardMarca = {
        codigo: marca.ncm,
        descricao: melhor.melhor ? melhor.melhor.descricao : marca.categoria,
        completo: true,
        viaMarca: true,
        marcaTermo: marca.termoEncontrado,
        marcaCategoria: marca.categoria,
        especial: window.NcmBusca.verificarTratamentoEspecial(marca.ncm, data)
      };
      resultados.unshift(cardMarca);
    }

    if (resultados.length === 0) {
      resultadoDescobrirNcm.innerHTML = `
        <div class="nao-encontrado">
          <strong>Nenhum NCM encontrado para "${window.Components.esc(termo)}".</strong>
          <p>Tente um termo mais simples ou em português (ex.: "água" em vez de "water"), ou confira a grafia.</p>
        </div>`;
      return;
    }
    resultadoDescobrirNcm.innerHTML = resultados.map(window.Components.renderNcmBuscaResultado).join("");
  }

  document.getElementById("btn-descobrir-ncm").addEventListener("click", buscarDescobrirNcm);
  inputDescobrirNcm.addEventListener("keydown", (e) => { if (e.key === "Enter") buscarDescobrirNcm(); });

  // Delegação de evento para os botões "Ver classificação tributária →"
  // injetados dinamicamente nos cards de resultado.
  resultadoDescobrirNcm.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-ver-classificacao");
    if (btn) irParaClassificacaoNcm(btn.dataset.ncm);
  });

  // --- Busca por operação ---
  const selectOperacao = document.getElementById("select-operacao");
  const resultadoOperacao = document.getElementById("resultado-operacao");

  window.Rules.listarOperacoes(data).forEach((op) => {
    const opt = document.createElement("option");
    opt.value = op.id;
    opt.textContent = op.label;
    selectOperacao.appendChild(opt);
  });

  function buscarPorOperacao() {
    const r = window.Rules.classificarPorOperacao(selectOperacao.value, data);
    resultadoOperacao.innerHTML = renderOperacaoResultado(r);
  }

  document.getElementById("btn-buscar-operacao").addEventListener("click", buscarPorOperacao);
  buscarPorOperacao(); // mostra a primeira por padrão
})();
