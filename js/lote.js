(function () {
  "use strict";
  const { renderHeader, renderFooter, renderAvisoLegal, esc } = window.Components;
  const data = window.CCLASSTRIB_DATA;

  // Limite de produtos por envio. Existe por desempenho no navegador (tudo
  // roda em JS puro, sem worker/servidor — a aba "Descobrir NCM" compara
  // cada produto contra ~15 mil itens da tabela oficial, um a um) e para dar
  // uma expectativa clara antes do envio, não depois de travar a tela. É só
  // uma constante local: ajuste esse número livremente conforme sua
  // infraestrutura e capacidade de atendimento.
  const LIMITE_PRODUTOS_POR_LOTE = 2000;

  // Processa um array grande em blocos pequenos, cedendo o event loop entre
  // blocos (setTimeout 0) para a interface não travar/soluçar durante lotes
  // de até LIMITE_PRODUTOS_POR_LOTE itens. Sem isso, um .map() síncrono sobre
  // centenas/milhares de produtos — cada um comparado contra a tabela NCM
  // completa (~15 mil itens) na aba "Descobrir NCM" — prende a aba inteira
  // até terminar, em vez de deixar o navegador respirar e a barra de
  // progresso atualizar entre um bloco e outro.
  const TAMANHO_BLOCO = 25;
  function cederEventLoop() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  async function processarEmLotes(itens, processarItem, aoProgresso) {
    const resultados = new Array(itens.length);
    for (let i = 0; i < itens.length; i++) {
      resultados[i] = processarItem(itens[i], i);
      if ((i + 1) % TAMANHO_BLOCO === 0) {
        if (aoProgresso) aoProgresso(i + 1, itens.length);
        await cederEventLoop();
      }
    }
    if (aoProgresso) aoProgresso(itens.length, itens.length);
    return resultados;
  }

  document.getElementById("header").innerHTML = renderHeader("lote");
  document.getElementById("footer").innerHTML = renderFooter();
  document.getElementById("aviso").innerHTML = renderAvisoLegal(data);

  const limiteFormatado = LIMITE_PRODUTOS_POR_LOTE.toLocaleString("pt-BR");
  document.querySelectorAll(".limite-lote").forEach((el) => {
    el.textContent = `Limite de ${limiteFormatado} produtos por envio — arquivos maiores são processados só até esse limite.`;
  });

  // --- Abas ---
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + btn.dataset.tab));
    });
  });

  // Arquivos exportados de sistemas de PDV/ERP/planilhas brasileiras muitas
  // vezes vêm em Windows-1252 (Latin-1), não UTF-8 — e isso bagunça acentos
  // ("Descrição" -> "Descri��o"). Decodificamos como UTF-8 primeiro; se
  // aparecer o caractere de substituição (sinal de bytes inválidos em
  // UTF-8), refazemos como Windows-1252, que cobre a esmagadora maioria
  // desses arquivos. Compartilhado pelas duas abas.
  function decodificarTexto(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const comoUtf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (comoUtf8.indexOf("�") === -1) return comoUtf8;
    try {
      return new TextDecoder("windows-1252").decode(bytes);
    } catch (e) {
      return comoUtf8;
    }
  }

  function configurarUpload(dropArea, fileInput, aoCarregar) {
    dropArea.addEventListener("click", () => fileInput.click());
    dropArea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });
    dropArea.addEventListener("dragover", (e) => { e.preventDefault(); dropArea.classList.add("dragover"); });
    dropArea.addEventListener("dragleave", () => dropArea.classList.remove("dragover"));
    dropArea.addEventListener("drop", (e) => {
      e.preventDefault();
      dropArea.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) lerArquivo(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener("change", () => {
      if (fileInput.files && fileInput.files[0]) {
        lerArquivo(fileInput.files[0]);
        fileInput.value = ""; // permite escolher o mesmo arquivo de novo depois de editá-lo
      }
    });
    function lerArquivo(file) {
      const nome = (file.name || "").toLowerCase();
      if (/\.xls[xm]$/.test(nome)) {
        file
          .arrayBuffer()
          .then((buffer) => window.XlsxUtil.lerPlanilha(buffer))
          .then((texto) => aoCarregar(texto, null, { delimitador: window.XlsxUtil.DELIMITADOR, nomeArquivo: file.name }))
          .catch((e) => aoCarregar(null, (e && e.message) || "Não foi possível ler a planilha do Excel."));
        return;
      }
      if (/\.xls$/.test(nome)) {
        aoCarregar(null, 'Arquivos .xls (Excel antigo) não são suportados. No Excel, use "Salvar como" e escolha "Pasta de Trabalho do Excel (*.xlsx)" ou CSV.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => aoCarregar(decodificarTexto(e.target.result), null, { nomeArquivo: file.name });
      reader.onerror = () => aoCarregar(null, "Erro ao ler o arquivo.");
      reader.readAsArrayBuffer(file);
    }
  }

  // Barra de progresso e "arquivo enviado" — o texto de andamento continua
  // existindo (progress-line), a barra só deixa isso visível de relance.
  function mostrarArquivoEnviado(el, nome) {
    el.style.display = "";
    el.innerHTML = `<span aria-hidden="true">📄</span><strong>${esc(nome)}</strong>`;
  }
  function atualizarBarra(barraEl, feito, total) {
    barraEl.style.display = "";
    barraEl.firstElementChild.style.width = total ? `${Math.round((feito / total) * 100)}%` : "0%";
    barraEl.classList.toggle("completa", feito >= total);
  }

  // Planilha modelo: o usuário baixa, preenche e envia de volta.
  document.getElementById("btn-modelo-classificar").addEventListener("click", () => {
    window.CSVUtil.downloadCSV(
      "modelo_classificar_cclasstrib.csv",
      ["Descrição;NCM", "ORIGINAL 473ML;22030000", "BRAHMA;22030000", "HEINEKEN 473ML;22030000", "AMSTEL 473ML;22030000"].join("\r\n")
    );
  });
  document.getElementById("btn-modelo-descobrir").addEventListener("click", () => {
    window.CSVUtil.downloadCSV(
      "modelo_descobrir_ncm.csv",
      ["Descrição", "ORIGINAL 473ML", "BRAHMA", "HEINEKEN 473ML", "AMSTEL 473ML"].join("\r\n")
    );
  });

  // ==========================================================================
  // Aba 1: "Classificar cClasstrib" — usuário já tem o código NCM, quer o cClassTrib.
  // ==========================================================================
  (function classificarNcms() {
    const dropArea = document.getElementById("drop-area");
    const fileInput = document.getElementById("file-input");
    const progressLine = document.getElementById("progress-line");
    const btnExportar = document.getElementById("btn-exportar");
    const btnExemplo = document.getElementById("btn-exemplo");
    const resumoEl = document.getElementById("resumo");
    const tabelaWrap = document.getElementById("tabela-wrap");
    const tabelaBody = document.getElementById("tabela-body");
    const arquivoEl = document.getElementById("arquivo-classificar");
    const barraEl = document.getElementById("barra-classificar");

    let ultimoResultado = [];

    configurarUpload(dropArea, fileInput, (texto, erro, opcoes) => {
      if (erro) { progressLine.textContent = erro; return; }
      processarTexto(texto, opcoes);
    });

    btnExemplo.addEventListener("click", () => {
      processarTexto(["ncm", "1006.20.00", "0401.10.10", "8713.10.00", "2203.00.00", "9999.99.99"].join("\n"));
    });

    async function processarTexto(texto, opcoes) {
      const todasLinhas = window.CSVUtil.parseCSV(texto, opcoes && opcoes.delimitador);
      if (todasLinhas.length === 0) {
        progressLine.textContent = "Nenhum NCM válido encontrado no arquivo. Confira se há uma coluna de NCM preenchida.";
        return;
      }
      const excedente = todasLinhas.length - LIMITE_PRODUTOS_POR_LOTE;
      const linhas = excedente > 0 ? todasLinhas.slice(0, LIMITE_PRODUTOS_POR_LOTE) : todasLinhas;
      btnExportar.disabled = true;
      mostrarArquivoEnviado(arquivoEl, (opcoes && opcoes.nomeArquivo) || "Exemplo de demonstração");
      atualizarBarra(barraEl, 0, linhas.length);

      const resultados = await processarEmLotes(linhas, ({ ncm, descricao }) => {
        let encontrados = window.Rules.classificarPorNcm(ncm, data);
        if (descricao && encontrados.length > 1) {
          const termo = descricao.toLowerCase();
          const filtrados = encontrados.filter((r) => (r.itemDescricao || "").toLowerCase().includes(termo));
          if (filtrados.length > 0) encontrados = filtrados;
        }
        if (encontrados.length === 0) {
          return Object.assign(window.Rules.naoEncontrado(ncm), { consultaOriginal: ncm, descricaoOriginal: descricao });
        }
        // Quando o NCM está só no Imposto Seletivo, classificarPorNcm também
        // devolve um segundo resultado sintético com a tributação normal do
        // IBS/CBS (000001) que incide em paralelo — anexamos essa informação
        // extra em vez de descartá-la.
        const principal = encontrados.find((r) => !r.sintetico) || encontrados[0];
        const extra = encontrados.find((r) => r !== principal && r.sintetico);
        return Object.assign({}, principal, {
          consultaOriginal: ncm,
          descricaoOriginal: descricao,
          cstAdicional: extra ? extra.cst : null,
          cClassTribAdicional: extra ? extra.cClassTrib : null
        });
      }, (feito, total) => {
        progressLine.textContent = `Processando ${feito}/${total} código(s)...`;
        atualizarBarra(barraEl, feito, total);
      });

      ultimoResultado = resultados;
      renderTabela(resultados);
      renderResumo(resumoEl, resultados, tabelaBody);
      progressLine.textContent = `Concluído: ${linhas.length} linha(s) do arquivo processada(s).` +
        (excedente > 0
          ? ` O arquivo tinha ${todasLinhas.length} linhas; as últimas ${excedente} NÃO foram processadas (limite de ${LIMITE_PRODUTOS_POR_LOTE} por envio) — envie o restante em um novo arquivo.`
          : "");
      btnExportar.disabled = false;
      resumoEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function renderTabela(resultados) {
      tabelaWrap.style.display = "block";
      tabelaBody.innerHTML = resultados.map((r) => {
        if (r.naoEncontrado) {
          return `<tr data-grupo="nao" data-busca="${esc(buscaDaLinha(r.descricaoOriginal, r.consulta))}">
            <td>${esc(r.descricaoOriginal || "")}</td>
            <td>${esc(r.consulta)}</td>
            <td>Não encontrado</td>
            <td colspan="6"><span class="clamp-2" title="${esc(r.mensagem)}">${esc(r.mensagem)}</span></td>
          </tr>`;
        }
        const cclassCel = renderCelulaCclass(r);
        const descricaoTexto = r.itemDescricao || r.anexoTitulo || "";
        return `<tr data-grupo="${esc(r.cor)}" data-busca="${esc(buscaDaLinha(r.descricaoOriginal, r.consultaOriginal))}">
          <td>${esc(r.descricaoOriginal || "")}</td>
          <td>${esc(r.consultaOriginal)}</td>
          <td><span class="badge cor-${r.cor}">${esc(r.tratamentoLabel)}</span></td>
          <td class="nowrap">${r.anexoId ? esc(r.anexoId) + (r.vigente === false ? " (revogado)" : "") : "regra geral"}</td>
          <td class="nowrap">${esc(r.artigo)}</td>
          <td>${cclassCel}</td>
          <td>${r.percentualReducao != null ? r.percentualReducao + "%" : "—"}</td>
          <td>${r.aliquotaEstimada != null ? r.aliquotaEstimada + "%" : "—"}</td>
          <td><span class="clamp-2" title="${esc(descricaoTexto)}">${esc(descricaoTexto)}</span></td>
        </tr>`;
      }).join("");
    }

    btnExportar.addEventListener("click", () => {
      if (ultimoResultado.length === 0) return;
      window.CSVUtil.downloadCSV("classificacao_cclasstrib.csv", window.CSVUtil.toCSV(ultimoResultado));
    });
  })();

  // ==========================================================================
  // Aba 2: "Descobrir NCM por descrição" — usuário só tem o nome do produto;
  // descobre o NCM mais provável na tabela oficial completa e já classifica.
  // ==========================================================================
  (function descobrirNcm() {
    const dropArea = document.getElementById("drop-area-descobrir");
    const fileInput = document.getElementById("file-input-descobrir");
    const progressLine = document.getElementById("progress-line-descobrir");
    const btnExportar = document.getElementById("btn-exportar-descobrir");
    const btnExemplo = document.getElementById("btn-exemplo-descobrir");
    const resumoEl = document.getElementById("resumo-descobrir");
    const tabelaWrap = document.getElementById("tabela-wrap-descobrir");
    const tabelaBody = document.getElementById("tabela-body-descobrir");
    const arquivoEl = document.getElementById("arquivo-descobrir");
    const barraEl = document.getElementById("barra-descobrir");

    let ultimoResultado = [];

    configurarUpload(dropArea, fileInput, (texto, erro, opcoes) => {
      if (erro) { progressLine.textContent = erro; return; }
      processarTexto(texto, opcoes);
    });

    btnExemplo.addEventListener("click", () => {
      processarTexto(["produto", "água mineral", "cadeira de rodas", "parafuso sextavado", "notebook", "arroz tipo 1"].join("\n"));
    });

    async function processarTexto(texto, opcoes) {
      if (!window.NCM_TABELA || !window.NcmBusca) {
        progressLine.textContent = "Tabela NCM completa não carregada — verifique se js/ncm-tabela.js está incluído na página.";
        return;
      }
      const todosProdutos = window.CSVUtil.parseCSVDescricoes(texto, opcoes && opcoes.delimitador);
      if (todosProdutos.length === 0) {
        progressLine.textContent = "Nenhum produto encontrado no arquivo. Confira se há uma coluna de descrição preenchida.";
        return;
      }
      const excedente = todosProdutos.length - LIMITE_PRODUTOS_POR_LOTE;
      const produtos = excedente > 0 ? todosProdutos.slice(0, LIMITE_PRODUTOS_POR_LOTE) : todosProdutos;
      btnExportar.disabled = true;
      mostrarArquivoEnviado(arquivoEl, (opcoes && opcoes.nomeArquivo) || "Exemplo de demonstração");
      atualizarBarra(barraEl, 0, produtos.length);

      const resultados = await processarEmLotes(produtos, (produto) => {
        const achado = window.NcmBusca.buscarMelhorNcmCompleto(produto);

        // "Refeição", "marmitex", "porção"... são serviço de alimentação,
        // não mercadoria — não têm NCM de verdade. Em vez de cair no branch
        // de "não encontrado" (que soa como falha de busca), classifica
        // direto pelo regime específico de bares/restaurantes já carregado
        // no site (art. 273 a 276 da LC 214/2025).
        if (achado.semNcmServico) {
          const opResultado = window.Rules.classificarPorOperacao(achado.semNcmServico.operacaoId, data);
          return Object.assign({}, opResultado, {
            consultaOriginal: "—",
            descricaoOriginal: produto,
            ncmDescricaoOficial: "Serviço de alimentação (bares/restaurantes/lanchonetes) — não é mercadoria, não tem NCM",
            qtdCandidatos: 0,
            viaMarca: false,
            viaServico: true,
            detalheServico: achado.semNcmServico,
            cstAdicional: null,
            cClassTribAdicional: null
          });
        }

        if (!achado.melhor) {
          return Object.assign(window.Rules.naoEncontrado(produto), { descricaoOriginal: produto });
        }
        const codigo = achado.melhor.codigo;
        const encontrados = window.Rules.classificarPorNcm(codigo, data);
        const principal = encontrados.find((r) => !r.sintetico) || encontrados[0];
        const extra = encontrados.find((r) => r !== principal && r.sintetico);
        return Object.assign({}, principal, {
          consultaOriginal: codigo,
          descricaoOriginal: produto,
          ncmDescricaoOficial: achado.melhor.descricao,
          qtdCandidatos: achado.totalCandidatos,
          viaMarca: !!achado.viaMarca,
          detalheMarca: achado.detalheMarca || null,
          cstAdicional: extra ? extra.cst : null,
          cClassTribAdicional: extra ? extra.cClassTrib : null
        });
      }, (feito, total) => {
        progressLine.textContent = `Processando ${feito}/${total} produto(s)...`;
        atualizarBarra(barraEl, feito, total);
      });

      ultimoResultado = resultados;
      renderTabela(resultados);
      renderResumo(resumoEl, resultados, tabelaBody);
      const semCandidato = resultados.filter((r) => r.naoEncontrado).length;
      const viaMarcaQtd = resultados.filter((r) => r.viaMarca).length;
      const viaServicoQtd = resultados.filter((r) => r.viaServico).length;
      const detalhes = [];
      if (viaMarcaQtd > 0) detalhes.push(`${viaMarcaQtd} via marca reconhecida (heurística, confira)`);
      if (viaServicoQtd > 0) detalhes.push(`${viaServicoQtd} sem NCM (serviço de alimentação — regime específico aplicado)`);
      if (semCandidato > 0) detalhes.push(`${semCandidato} sem nenhum NCM candidato`);
      if (excedente > 0) detalhes.push(`arquivo tinha ${todosProdutos.length} produtos, as últimas ${excedente} linhas NÃO foram processadas (limite de ${LIMITE_PRODUTOS_POR_LOTE} por envio) — envie o restante em um novo arquivo`);
      progressLine.textContent = `Concluído: ${produtos.length} produto(s) processado(s)` +
        (detalhes.length > 0 ? ` — ${detalhes.join(" — ")}.` : ".");
      btnExportar.disabled = false;
      resumoEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function renderTabela(resultados) {
      tabelaWrap.style.display = "block";
      tabelaBody.innerHTML = resultados.map((r) => {
        if (r.naoEncontrado) {
          return `<tr data-grupo="nao" data-busca="${esc(buscaDaLinha(r.descricaoOriginal, ""))}">
            <td>${esc(r.descricaoOriginal || "")}</td>
            <td colspan="5">Nenhum NCM candidato encontrado na tabela oficial para este termo. Tente uma descrição mais simples ou verifique a grafia.</td>
          </tr>`;
        }
        const cclassCel = renderCelulaCclass(r);
        const avisoAmbiguo = r.qtdCandidatos > 1
          ? `<div class="hint">${r.qtdCandidatos} candidatos encontrados — mostrando o mais provável; confira antes de usar.</div>`
          : "";
        const avisoMarca = r.viaMarca
          ? `<div class="hint hint-marca" title="Marca &quot;${esc((r.detalheMarca && r.detalheMarca.termoEncontrado) || "")}&quot; reconhecida como ${esc((r.detalheMarca && r.detalheMarca.categoria) || "")}. Não é a tabela oficial — confira antes de usar.">NCM por marca reconhecida (heurística) — confira</div>`
          : "";
        const avisoServico = r.viaServico
          ? `<div class="hint hint-marca" title="&quot;${esc((r.detalheServico && r.detalheServico.termoEncontrado) || "")}&quot; é item de cardápio (serviço), não mercadoria — por isso não tem NCM. Classificado pelo regime específico de bares/restaurantes/lanchonetes (art. 273 a 276 da LC 214/2025).">Serviço de alimentação — sem NCM (ver regime específico)</div>`
          : "";
        return `<tr data-grupo="${esc(r.cor)}" data-busca="${esc(buscaDaLinha(r.descricaoOriginal, r.consultaOriginal, r.ncmDescricaoOficial))}">
          <td>${esc(r.descricaoOriginal || "")}</td>
          <td><code class="mono">${esc(r.consultaOriginal)}</code>${avisoAmbiguo}${avisoMarca}${avisoServico}</td>
          <td><span class="clamp-2" title="${esc(r.ncmDescricaoOficial || "")}">${esc(r.ncmDescricaoOficial || "")}</span></td>
          <td><span class="badge cor-${r.cor}">${esc(r.tratamentoLabel)}</span></td>
          <td>${cclassCel}</td>
          <td>${r.percentualReducao != null ? r.percentualReducao + "%" : "—"}</td>
        </tr>`;
      }).join("");
    }

    btnExportar.addEventListener("click", () => {
      if (ultimoResultado.length === 0) return;
      window.CSVUtil.downloadCSV("ncm_descoberto_cclasstrib.csv", window.CSVUtil.toCSV(ultimoResultado));
    });
  })();

  // --- Compartilhado pelas duas abas ---

  // Texto de busca de cada linha da tabela: produto + NCM (sem acento/caixa).
  function buscaDaLinha(...partes) {
    return partes
      .filter(Boolean)
      .join(" ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  // Resumo do lote: cartões com a contagem por grupo (clicar filtra a tabela),
  // uma barra proporcional e um campo para buscar por produto ou NCM.
  function renderResumo(resumoEl, resultados, tabelaBody) {
    const cont = { verde: 0, amarelo: 0, vermelho: 0, nao: 0 };
    resultados.forEach((r) => {
      if (r.naoEncontrado) cont.nao++;
      else cont[r.cor] = (cont[r.cor] || 0) + 1;
    });
    const total = resultados.length;
    const grupos = [
      { id: "todos", rotulo: "Todos os produtos", n: total, cor: "todos" },
      { id: "verde", rotulo: "Alíquota zero", n: cont.verde, cor: "verde" },
      { id: "amarelo", rotulo: "Reduzida / atenção", n: cont.amarelo, cor: "amarelo" },
      { id: "vermelho", rotulo: "Integral / seletivo", n: cont.vermelho, cor: "vermelho" },
      { id: "nao", rotulo: "Não encontrados", n: cont.nao, cor: "nao" },
    ];
    const pct = (n) => (total ? (n / total) * 100 : 0);
    resumoEl.innerHTML = `
      <h2 class="passo-titulo"><span class="passo-num">3</span> Confira o resultado</h2>
      <div class="resumo-cards">
        ${grupos
          .map(
            (g) => `<button type="button" class="resumo-card cor-${g.cor}${g.id === "todos" ? " ativo" : ""}" data-grupo="${g.id}" ${g.n === 0 && g.id !== "todos" ? "disabled" : ""}>
              <span class="resumo-num">${g.n}</span><span class="resumo-rotulo">${g.rotulo}</span></button>`
          )
          .join("")}
      </div>
      <div class="resumo-barra" aria-hidden="true">
        <span class="seg-verde" style="width:${pct(cont.verde)}%"></span>
        <span class="seg-amarelo" style="width:${pct(cont.amarelo)}%"></span>
        <span class="seg-vermelho" style="width:${pct(cont.vermelho)}%"></span>
        <span class="seg-nao" style="width:${pct(cont.nao)}%"></span>
      </div>
      <div class="resumo-filtro">
        <input type="search" name="filtro-resultado-lote" placeholder="Filtrar por produto ou NCM…" autocomplete="off" data-lpignore="true" data-1p-ignore data-form-type="other" />
        <span class="hint resumo-contagem"></span>
      </div>`;

    let grupoAtivo = "todos";
    let textoAtivo = "";
    const campo = resumoEl.querySelector("input[type=search]");
    const contagem = resumoEl.querySelector(".resumo-contagem");

    function aplicarFiltro() {
      let visiveis = 0;
      tabelaBody.querySelectorAll("tr").forEach((tr) => {
        const bateGrupo = grupoAtivo === "todos" || tr.dataset.grupo === grupoAtivo;
        const bateTexto = !textoAtivo || (tr.dataset.busca || "").includes(textoAtivo);
        const mostrar = bateGrupo && bateTexto;
        tr.style.display = mostrar ? "" : "none";
        if (mostrar) visiveis++;
      });
      contagem.textContent = visiveis === total ? `${total} linha(s)` : `Mostrando ${visiveis} de ${total} linha(s)`;
    }

    resumoEl.querySelectorAll(".resumo-card").forEach((botao) => {
      botao.addEventListener("click", () => {
        grupoAtivo = botao.dataset.grupo;
        resumoEl.querySelectorAll(".resumo-card").forEach((b) => b.classList.toggle("ativo", b === botao));
        aplicarFiltro();
      });
    });
    campo.addEventListener("input", () => {
      textoAtivo = buscaDaLinha(campo.value.trim());
      aplicarFiltro();
    });
    aplicarFiltro();
  }

  // Códigos cClassTrib de verdade são curtos (6 dígitos); quando o campo vem
  // como um texto explicativo (ex.: "não se aplica — o Imposto Seletivo..."),
  // mostra um rótulo curto na tabela e o texto completo fica disponível ao
  // passar o mouse (title), pra não esticar a altura da linha.
  function renderCelulaCclass(r) {
    const cclassCurto = /^\d{6}$/.test(r.cClassTrib);
    const cclassPrincipal = cclassCurto
      ? `<code class="mono">${esc(r.cst || "—")}</code> / <code class="mono">${esc(r.cClassTrib)}</code>`
      : `<span class="clamp-2" title="${esc(r.cClassTrib)}">${esc(r.cClassTrib)}</span>`;
    const cclassAdicional = r.cClassTribAdicional
      ? `<span class="hint">+ regra geral: <code class="mono">${esc(r.cstAdicional)}</code> / <code class="mono">${esc(r.cClassTribAdicional)}</code></span>`
      : "";
    return `<div class="cel-empilhada">${cclassPrincipal}${cclassAdicional}</div>`;
  }
})();
