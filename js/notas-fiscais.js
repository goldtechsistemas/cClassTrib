(function () {
  "use strict";
  const { renderHeader, renderFooter, esc } = window.Components;

  document.getElementById("header").innerHTML = renderHeader("notas");
  document.getElementById("footer").innerHTML = renderFooter();

  const avisoEl = document.getElementById("aviso-nfe");
  const inputArquivo = document.getElementById("input-cert-arquivo");
  const inputSenha = document.getElementById("input-cert-senha");
  const btnEnviar = document.getElementById("btn-enviar-cert");
  const certDrop = document.getElementById("cert-drop");
  const certArquivoBox = document.getElementById("cert-arquivo");
  const certArquivoNome = document.getElementById("cert-arquivo-nome");
  const certArquivoTamanho = document.getElementById("cert-arquivo-tamanho");
  const btnRemoverCert = document.getElementById("btn-remover-cert");
  const btnVerSenha = document.getElementById("btn-ver-senha");
  const certPassos = document.querySelectorAll("#cert-passos li");
  const wrapVazio = document.getElementById("empresas-vazio");
  const wrapTabela = document.getElementById("empresas-wrap");
  const corpoTabela = document.getElementById("empresas-body");
  const wrapBuscaEmpresas = document.getElementById("busca-empresas");
  const inputBuscaEmpresas = document.getElementById("input-busca-empresas");
  const empresasSemResultado = document.getElementById("empresas-sem-resultado");
  const empresasContador = document.getElementById("empresas-contador");
  const empresasDica = document.getElementById("empresas-dica");
  const empresasRodape = document.getElementById("empresas-rodape");
  const EMPRESAS_VISIVEIS_SEM_ROLAGEM = 10;
  const NOTAS_VISIVEIS_SEM_ROLAGEM = 20;
  const notasRodape = document.getElementById("notas-rodape");
  const painelPeriodo = document.getElementById("painel-periodo");
  const btnPainelPeriodo = document.getElementById("btn-painel-periodo");
  const painelSubtitulo = document.getElementById("painel-subtitulo");
  const painelMeses = document.getElementById("painel-meses");
  const painelGrade = document.getElementById("painel-grade");
  const painelNota = document.getElementById("painel-nota");
  let notasDoPainel = [];
  let painelMesSelecionado = "todos";

  const notasSecao = document.getElementById("notas-secao");
  const notasTitulo = document.getElementById("notas-titulo");
  const notasVazio = document.getElementById("notas-vazio");
  const notasWrap = document.getElementById("notas-wrap");
  const notasBody = document.getElementById("notas-body");
  const notasAcoesLote = document.getElementById("notas-acoes-lote");
  const linkExportarXml = document.getElementById("link-exportar-xml");
  const linkExportarExcel = document.getElementById("link-exportar-excel");
  const linkExportarPdfLote = document.getElementById("link-exportar-pdf-lote");
  const notasSelecaoInfo = document.getElementById("notas-selecao-info");
  const inputBuscaNotas = document.getElementById("input-busca-notas");
  const notasResumo = document.getElementById("notas-resumo");
  const inputDataInicio = document.getElementById("input-data-inicio");
  const inputDataFim = document.getElementById("input-data-fim");
  const btnFiltrarPeriodo = document.getElementById("btn-filtrar-periodo");
  const btnLimparPeriodo = document.getElementById("btn-limpar-periodo");
  const checkboxSelecionarTodas = document.getElementById("checkbox-selecionar-todas");

  let empresaSelecionadaId = null;
  let empresaSelecionadaNome = "";
  let notasSelecionadas = new Set();
  let empresasCache = [];
  let carregamentoNotasSeq = 0;
  const LIMITE_NOTAS_LISTA = 500;

  // Aviso parado logo acima de "Empresas cadastradas" (onde ficam os botões
  // de sincronizar); não acompanha a rolagem da página. Tem botão pra fechar.
  function mostrarAviso(mensagem, tipo) {
    if (!mensagem) {
      avisoEl.innerHTML = "";
      return;
    }
    avisoEl.innerHTML = `<div class="aviso-nfe-msg ${tipo === "erro" ? "erro" : "ok"}" role="status">
        <span>${esc(mensagem)}</span>
        <button type="button" class="aviso-nfe-fechar" aria-label="Fechar aviso">&times;</button>
      </div>`;
    avisoEl.querySelector(".aviso-nfe-fechar").addEventListener("click", () => {
      avisoEl.innerHTML = "";
    });
  }

  function formatarData(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("pt-BR");
  }

  function formatarCnpj(cnpj) {
    const s = String(cnpj || "").padStart(14, "0");
    return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12, 14)}`;
  }

  function formatarCpf(cpf) {
    const s = String(cpf || "").padStart(11, "0");
    return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9, 11)}`;
  }

  // A empresa cadastrada pode ser pessoa jurídica (certificado e-CNPJ, 14
  // dígitos) ou física (certificado e-CPF, 11 dígitos) — formata cada uma
  // com a máscara certa em vez de forçar tudo no formato de CNPJ.
  function formatarDocumentoEmpresa(documento) {
    const digitos = String(documento || "").replace(/\D/g, "");
    return digitos.length === 11 ? formatarCpf(digitos) : formatarCnpj(digitos);
  }

  async function carregarEmpresas() {
    let dados;
    try {
      const resposta = await fetch("/api/nfe-empresas", { credentials: "same-origin" });
      dados = await resposta.json();
    } catch (e) {
      mostrarAviso("Não foi possível carregar as empresas cadastradas.", "erro");
      return;
    }
    if (!dados.ok) {
      mostrarAviso(dados.erro || "Erro ao carregar empresas.", "erro");
      return;
    }

    empresasCache = dados.empresas || [];
    renderizarEmpresas();
  }

  // Sem acento e sem maiúsculas, pra "acai" achar "AÇAÍ".
  function normalizarTexto(texto) {
    return String(texto || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function empresaCombinaComBusca(emp, termo) {
    if (!termo) return true;
    if (normalizarTexto(emp.razaoSocial).includes(normalizarTexto(termo))) return true;
    // Só procura no documento se o termo parece um CNPJ/CPF (dígitos e
    // pontuação) — "2000" numa busca por nome não deve casar com o número.
    const digitos = termo.replace(/\D/g, "");
    return !!digitos && /^[\d.\-\/\s]+$/.test(termo) && String(emp.cnpj || "").replace(/\D/g, "").includes(digitos);
  }

  function renderizarEmpresas() {
    const termo = inputBuscaEmpresas.value.trim();
    if (!empresasCache.length) {
      wrapVazio.style.display = "";
      wrapTabela.style.display = "none";
      wrapBuscaEmpresas.style.display = "none";
      empresasSemResultado.style.display = "none";
      empresasContador.style.display = "none";
      empresasDica.style.display = "none";
      empresasRodape.style.display = "none";
      return;
    }
    wrapVazio.style.display = "none";
    wrapBuscaEmpresas.style.display = "";
    empresasDica.style.display = "";
    empresasContador.style.display = "";

    const empresas = empresasCache.filter((emp) => empresaCombinaComBusca(emp, termo));
    empresasContador.textContent = termo ? `${empresas.length} de ${empresasCache.length}` : String(empresasCache.length);
    if (!empresas.length) {
      wrapTabela.style.display = "none";
      empresasRodape.style.display = "none";
      empresasSemResultado.textContent = `Nenhuma empresa encontrada para "${termo}".`;
      empresasSemResultado.style.display = "";
      return;
    }
    empresasSemResultado.style.display = "none";
    wrapTabela.style.display = "";

    corpoTabela.innerHTML = empresas
      .map((emp) => {
        const nomeEmpresa = emp.razaoSocial || emp.cnpj;
        const ehProducao = emp.ambiente === 1;
        const ambiente = `<span class="badge ${ehProducao ? "cor-neutro-fraco" : "cor-amarelo"}">${ehProducao ? "Produção" : "Homologação"}</span>`;

        let validade = `<span class="badge cor-neutro-fraco">Sem certificado</span>`;
        if (emp.certValidUntil) {
          const dataValidade = esc(formatarData(emp.certValidUntil));
          if (emp.certVencido) {
            validade = `<span class="badge cor-vermelho">Vencido</span><div class="hint">em ${dataValidade}</div>`;
          } else if (emp.certPrestesAVencer) {
            validade = `<span class="badge cor-amarelo">Vence em ${esc(emp.certDiasRestantes)} dia(s)</span><div class="hint">até ${dataValidade}</div>`;
          } else {
            validade = `<span class="badge cor-verde">Válido</span><div class="hint">até ${dataValidade}</div>`;
          }
        }

        // A espera exigida pela SEFAZ só vale pra busca de notas NOVAS — a
        // sincronização ainda manifesta pendentes e baixa XML completo nesse
        // período, então o botão fica sempre ativo, só com o aviso do horário.
        const aguardando = emp.proximaConsultaPermitidaEm && new Date(emp.proximaConsultaPermitidaEm) > new Date();
        let avisoEspera = "";
        if (aguardando) {
          const espera = new Date(emp.proximaConsultaPermitidaEm);
          const horaCurta = espera.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          const mesmoDia = espera.toDateString() === new Date().toDateString();
          const quando = mesmoDia ? `às ${horaCurta}` : `em ${espera.toLocaleString("pt-BR")}`;
          avisoEspera = `<div class="hint empresa-espera" title="A SEFAZ pede para aguardar antes de buscar notas novas">Notas novas liberam ${esc(quando)}</div>`;
        }

        const avisoUf = emp.uf
          ? ""
          : `<div class="empresa-alerta" title="Este certificado não traz o estado no cadastro do emissor. A consulta à SEFAZ funciona normalmente; a UF é preenchida sozinha assim que chegar uma nota com o XML completo.">ⓘ UF não informada no certificado</div>`;

        const ehCpf = String(emp.cnpj || "").replace(/\D/g, "").length === 11;
        return `
          <tr data-empresa-id="${esc(emp.id)}">
            <td>
              <div class="empresa-cel">
                <span class="empresa-avatar" aria-hidden="true">${esc(iniciaisEmpresa(nomeEmpresa))}</span>
                <div class="empresa-dados">
                  <strong class="empresa-nome">${esc(emp.razaoSocial || "—")}</strong>
                  <span class="hint mono">${ehCpf ? "CPF" : "CNPJ"} ${esc(formatarDocumentoEmpresa(emp.cnpj))}</span>
                  ${avisoUf}
                </div>
              </div>
            </td>
            <td>${ambiente}</td>
            <td>${validade}</td>
            <td>${textoUltimaSincronizacao(emp.ultimaSincronizacao)}</td>
            <td>
              <div class="empresa-acoes">
                <button class="btn btn-sm btn-sincronizar" data-id="${esc(emp.id)}" data-nome="${esc(nomeEmpresa)}" type="button">Sincronizar agora</button>
                <button class="btn secondary btn-sm btn-ver-notas" data-id="${esc(emp.id)}" data-nome="${esc(nomeEmpresa)}" type="button">Ver notas</button>
                <button class="btn secondary btn-sm btn-excluir-empresa" data-id="${esc(emp.id)}" type="button">Excluir</button>
              </div>
              ${avisoEspera}
            </td>
          </tr>`;
      })
      .join("");

    corpoTabela.querySelectorAll(".btn-excluir-empresa").forEach((btn) => {
      btn.addEventListener("click", () => excluirEmpresa(btn.dataset.id));
    });
    corpoTabela.querySelectorAll(".btn-sincronizar").forEach((btn) => {
      btn.addEventListener("click", () => sincronizarEmpresa(btn.dataset.id, btn.dataset.nome, btn));
    });
    corpoTabela.querySelectorAll(".btn-ver-notas").forEach((btn) => {
      btn.addEventListener("click", () => mostrarNotas(btn.dataset.id, btn.dataset.nome));
    });
    marcarEmpresaSelecionada();
    ajustarAlturaListaEmpresas(empresas.length);
  }

  function iniciaisEmpresa(nome) {
    const palavras = String(nome || "?").replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
    return ((palavras[0] || "?")[0] + (palavras.length > 1 ? palavras[1][0] : "")).toUpperCase();
  }

  // "Hoje", "Ontem", "Há 3 dias" + a data — mais fácil de bater o olho do que
  // só a data.
  function textoUltimaSincronizacao(iso) {
    if (!iso) return `<span class="hint">Nunca sincronizado</span>`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return `<span class="hint">Nunca sincronizado</span>`;
    const inicioDia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const dias = Math.round((inicioDia(new Date()) - inicioDia(d)) / 86400000);
    const rotulo = dias <= 0 ? "Hoje" : dias === 1 ? "Ontem" : `Há ${dias} dias`;
    const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `<strong class="sync-rotulo">${esc(rotulo)}</strong><div class="hint">${esc(formatarData(iso))} às ${esc(hora)}</div>`;
  }

  // Destaca a empresa cujas notas estão abertas logo abaixo.
  function marcarEmpresaSelecionada() {
    corpoTabela.querySelectorAll("tr[data-empresa-id]").forEach((tr) => {
      tr.classList.toggle("empresa-selecionada", Number(tr.dataset.empresaId) === empresaSelecionadaId);
    });
  }

  // A lista mostra até 10 empresas sem rolar; a partir daí ganha barra de
  // rolagem própria (cabeçalho fixo) em vez de esticar a página. A altura é
  // medida nas linhas reais — algumas ficam mais altas por causa de avisos.
  function ajustarAlturaListaEmpresas(total) {
    wrapTabela.style.maxHeight = "";
    if (total <= EMPRESAS_VISIVEIS_SEM_ROLAGEM) {
      empresasRodape.style.display = "none";
      return;
    }
    const linhas = Array.from(corpoTabela.querySelectorAll("tr")).slice(0, EMPRESAS_VISIVEIS_SEM_ROLAGEM);
    const altura = wrapTabela.querySelector("thead").offsetHeight + linhas.reduce((soma, tr) => soma + tr.offsetHeight, 0);
    wrapTabela.style.maxHeight = `min(${altura + 2}px, 85vh)`;
    empresasRodape.textContent = `Mostrando ${total} empresas — role a lista para ver as demais.`;
    empresasRodape.style.display = "";
  }

  async function sincronizarEmpresa(empresaId, nomeEmpresa, botao) {
    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = "Sincronizando...";
    mostrarAviso("");
    try {
      const resposta = await fetch("/api/nfe-sincronizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ empresaId: Number(empresaId) }),
      });
      const dados = await resposta.json();
      if (!dados.ok) {
        mostrarAviso(dados.erro || "Erro ao sincronizar com a SEFAZ.", "erro");
        return;
      }
      const partes = [];
      if (dados.avisoDistribuicao) {
        partes.push(dados.avisoDistribuicao);
      } else {
        partes.push(
          dados.docsNovos > 0
            ? `${dados.docsNovos} nota(s)/evento(s) novo(s) para ${nomeEmpresa}.`
            : `Nenhuma nota nova (SEFAZ: "${dados.xMotivo}").`
        );
      }
      if (dados.manifestadas > 0) {
        partes.push(`Manifestação (Ciência ou Confirmação da Operação) registrada automaticamente em ${dados.manifestadas} nota(s).`);
      }
      if (dados.xmlsCompletados > 0) {
        partes.push(`XML completo baixado para ${dados.xmlsCompletados} nota(s) — o PDF delas já sai como DANFE.`);
      }
      if (dados.pendentesDeManifestacao > 0 || dados.atingiuLimiteCiclos) {
        partes.push("Ainda há notas pendentes — clique em sincronizar de novo para continuar de onde parou.");
      }
      if (dados.aguardandoXml > 0) {
        partes.push(
          `${dados.aguardandoXml} nota(s) já manifestada(s) ainda aguardam o XML completo da SEFAZ — ele chega nas próximas sincronizações (a SEFAZ limita quantas notas podem ser buscadas por hora).`
        );
      }
      mostrarAviso(partes.join(" "), "ok");
      carregarEmpresas();
      if (empresaSelecionadaId === Number(empresaId)) carregarNotas(empresaId, nomeEmpresa);
    } catch (e) {
      mostrarAviso("Não foi possível falar com a SEFAZ. Tente novamente.", "erro");
    } finally {
      botao.disabled = false;
      botao.textContent = textoOriginal;
    }
  }

  function formatarValor(v) {
    if (v == null) return "—";
    return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  // O mês escolhido nos botões do painel é um filtro só de tela (a lista
  // buscada no servidor continua trazendo todos os meses, pra os botões não
  // sumirem) — por isso ele só entra na query dos downloads (comMes), como
  // intervalo de datas somado ao que já está nos campos "de/até".
  function mesEstaFiltrando() {
    if (painelMesSelecionado === "todos") return false;
    return new Set(notasDoPainel.map((n) => chaveMes(n.dhEmi))).size > 1;
  }

  function montarQueryFiltro(opcoes) {
    const params = new URLSearchParams();
    let inicio = inputDataInicio.value;
    let fim = inputDataFim.value;
    if (opcoes && opcoes.comMes && mesEstaFiltrando() && painelMesSelecionado !== "sem-data") {
      const [ano, mes] = painelMesSelecionado.split("-");
      const ultimoDia = new Date(Date.UTC(Number(ano), Number(mes), 0)).getUTCDate();
      const primeiroDoMes = `${ano}-${mes}-01`;
      const ultimoDoMes = `${ano}-${mes}-${String(ultimoDia).padStart(2, "0")}`;
      if (!inicio || inicio < primeiroDoMes) inicio = primeiroDoMes;
      if (!fim || fim > ultimoDoMes) fim = ultimoDoMes;
    }
    if (inicio) params.set("dataInicio", inicio);
    if (fim) params.set("dataFim", fim);
    const busca = inputBuscaNotas.value.trim();
    if (busca) params.set("busca", busca);
    return params;
  }

  function filtroNotasAtivo() {
    return !!(inputBuscaNotas.value.trim() || inputDataInicio.value || inputDataFim.value || mesEstaFiltrando());
  }

  function notasDoMesEscolhido() {
    return mesEstaFiltrando() ? notasDoPainel.filter((n) => chaveMes(n.dhEmi) === painelMesSelecionado) : notasDoPainel;
  }

  function atualizarLinksExportacao(empresaId) {
    const params = montarQueryFiltro({ comMes: true });
    params.set("empresaId", empresaId);

    if (notasSelecionadas.size > 0) {
      params.set("chaves", Array.from(notasSelecionadas).join(","));
      notasSelecaoInfo.textContent = `${notasSelecionadas.size} nota(s) selecionada(s) — os downloads abaixo usam só a seleção.`;
    } else {
      if (mesEstaFiltrando() && painelMesSelecionado === "sem-data") {
        params.set("chaves", notasDoMesEscolhido().map((n) => n.chNFe).join(","));
      }
      notasSelecaoInfo.textContent = "Nenhuma nota selecionada — os downloads abaixo usam todas as notas visíveis (respeitando os filtros aplicados).";
    }

    linkExportarXml.href = `/api/nfe-exportar-xml?${params.toString()}`;
    linkExportarExcel.href = `/api/nfe-exportar-excel?${params.toString()}`;
    linkExportarPdfLote.href = `/api/nfe-exportar-pdf-lote?${params.toString()}`;
  }

  async function carregarNotas(empresaId, nomeEmpresa) {
    notasTitulo.textContent = `Notas fiscais — ${nomeEmpresa}`;
    notasSelecionadas = new Set();
    checkboxSelecionarTodas.checked = false;

    const params = montarQueryFiltro();
    params.set("empresaId", empresaId);

    // Se o usuário digita rápido, duas buscas ficam no ar — só a última vale.
    const minhaVez = ++carregamentoNotasSeq;
    let dados;
    try {
      const resposta = await fetch(`/api/nfe-documentos?${params.toString()}`, { credentials: "same-origin" });
      dados = await resposta.json();
    } catch (e) {
      if (minhaVez === carregamentoNotasSeq) mostrarAviso("Não foi possível carregar as notas.", "erro");
      return;
    }
    if (minhaVez !== carregamentoNotasSeq) return;
    if (!dados.ok) {
      mostrarAviso(dados.erro || "Erro ao carregar notas.", "erro");
      return;
    }

    notasDoPainel = dados.documentos || [];
    if (notasDoPainel.length) {
      renderizarPainelPeriodo();
    } else {
      painelPeriodo.style.display = "none";
      painelMesSelecionado = "todos";
    }
    renderizarListaNotas(empresaId);
  }

  // Desenha a tabela com as notas já carregadas, respeitando o mês escolhido
  // nos botões do painel (sem ir ao servidor de novo).
  function renderizarListaNotas(empresaId) {
    const notas = notasDoMesEscolhido();
    const filtrando = filtroNotasAtivo();
    if (notas.length >= LIMITE_NOTAS_LISTA) {
      notasResumo.textContent = `Mostrando as ${LIMITE_NOTAS_LISTA} notas mais recentes — refine o filtro para ver as demais.`;
    } else if (notas.length) {
      notasResumo.textContent = `${notas.length} nota(s) ${filtrando ? "encontrada(s)" : "sincronizada(s)"}`;
    } else {
      notasResumo.textContent = "";
    }
    if (notas.length) {
      const totalAutorizadas = notas
        .filter((n) => n.situacao === "autorizada")
        .reduce((soma, n) => soma + (Number(n.vNf) || 0), 0);
      notasResumo.textContent += ` · ${formatarValor(totalAutorizadas)} em notas autorizadas`;
    }
    if (!notas.length) {
      notasVazio.textContent = filtrando
        ? "Nenhuma nota encontrada com esses filtros."
        : 'Nenhuma nota encontrada ainda para esta empresa. Clique em "Sincronizar agora".';
      notasVazio.style.display = "";
      notasWrap.style.display = "none";
      notasAcoesLote.style.display = "none";
      notasRodape.style.display = "none";
      return;
    }
    notasVazio.style.display = "none";
    notasWrap.style.display = "";
    notasAcoesLote.style.display = "";
    atualizarLinksExportacao(empresaId);

    // Recarregar (ex.: depois de "Dar ciência") não deve jogar a lista de volta pro topo.
    const rolagemAnterior = notasWrap.scrollTop;
    notasBody.innerHTML = notas
      .map((n) => {
        // Denegada/cancelada nunca chegam a ter XML completo — Ciência da
        // Operação não se aplica a elas (a SEFAZ rejeita) — e se já tem
        // "XML completo" não há nada a manifestar, então nesses casos nem
        // oferecemos o botão (evita um clique que só ia dar erro à toa).
        let acaoManifestacao;
        if (n.manifestacao === "confirmacao") {
          acaoManifestacao = `<span class="badge cor-verde">✓ Confirmação dada</span>`;
        } else if (n.manifestacao === "ciencia" || n.tipo === "completa") {
          acaoManifestacao = `<span class="badge cor-verde">✓ Ciência dada</span>`;
        } else if (n.situacao === "denegada" || n.situacao === "cancelada") {
          acaoManifestacao = `<span class="badge cor-neutro-fraco">Não se aplica</span>`;
        } else {
          acaoManifestacao = `<button class="btn btn-sm btn-manifestar" data-ch-nfe="${esc(n.chNFe)}" type="button">Dar ciência</button>`;
        }
        const corSituacao = { autorizada: "cor-verde", cancelada: "cor-vermelho", denegada: "cor-amarelo" }[n.situacao] || "cor-neutro-fraco";
        const textoSituacao = n.situacao ? n.situacao.charAt(0).toUpperCase() + n.situacao.slice(1) : "—";
        const badgeTipo =
          n.tipo === "completa"
            ? `<span class="badge cor-verde">XML completo</span>`
            : `<span class="badge cor-amarelo" title="Ainda sem o XML completo — dê ciência e sincronize de novo">Resumo</span>`;
        const linkPdf = `/api/nfe-exportar-pdf?empresaId=${encodeURIComponent(empresaId)}&chNFe=${encodeURIComponent(n.chNFe)}`;
        const complementoEmitente = [n.emitCnpj ? formatarCnpj(n.emitCnpj) : null, n.emitUf].filter(Boolean).join(" · ");
        return `
          <tr>
            <td class="col-check"><input type="checkbox" class="checkbox-nota" data-ch-nfe="${esc(n.chNFe)}" /></td>
            <td class="nowrap">
              <strong class="nf-numero mono">${esc(n.numero || "—")}</strong>
              ${n.serie ? `<div class="hint">série ${esc(n.serie)}</div>` : ""}
            </td>
            <td>
              <div class="nota-emitente">
                <strong class="empresa-nome" title="${esc(n.emitNome || "")}">${esc(n.emitNome || "—")}</strong>
                <span class="hint mono">${esc(complementoEmitente || "—")}</span>
              </div>
            </td>
            <td class="nowrap">${esc(formatarData(n.dhEmi))}</td>
            <td class="col-valor nowrap">${esc(formatarValor(n.vNf))}</td>
            <td><span class="badge ${corSituacao}">${esc(textoSituacao)}</span></td>
            <td>${badgeTipo}</td>
            <td>${acaoManifestacao}</td>
            <td><a class="btn secondary btn-sm nowrap" href="${linkPdf}" target="_blank" rel="noopener">PDF</a></td>
          </tr>`;
      })
      .join("");
    ajustarAlturaListaNotas(notas.length);
    notasWrap.scrollTop = rolagemAnterior;

    notasBody.querySelectorAll(".btn-manifestar").forEach((btn) => {
      btn.addEventListener("click", () => manifestarNota(btn.dataset.chNfe, btn));
    });
    notasBody.querySelectorAll(".checkbox-nota").forEach((chk) => {
      chk.addEventListener("change", () => {
        if (chk.checked) notasSelecionadas.add(chk.dataset.chNfe);
        else notasSelecionadas.delete(chk.dataset.chNfe);
        chk.closest("tr").classList.toggle("nota-selecionada", chk.checked);
        checkboxSelecionarTodas.checked =
          notasSelecionadas.size > 0 && notasSelecionadas.size === notasBody.querySelectorAll(".checkbox-nota").length;
        atualizarLinksExportacao(empresaId);
      });
    });
  }

  // ----- Painel "Informações do período": totais das notas que estão na tela,
  // por mês de emissão (dia do calendário de Brasília) ou do período todo.
  const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  function chaveMes(iso) {
    if (!iso) return "sem-data";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "sem-data";
    const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(d);
    const ano = partes.find((x) => x.type === "year").value;
    const mes = partes.find((x) => x.type === "month").value;
    return `${ano}-${mes}`;
  }

  function rotuloMes(chave, longo) {
    if (chave === "sem-data") return "Sem data";
    const [ano, mes] = chave.split("-");
    return longo ? `${MESES_LONGOS[Number(mes) - 1]} de ${ano}` : `${MESES_CURTOS[Number(mes) - 1]}/${ano}`;
  }

  function calcularPainel(notas) {
    const r = { total: notas.length, autorizadas: 0, outras: 0, valor: 0, semXml: 0, icms: 0, icmsSt: 0, ipi: 0, pis: 0, cofins: 0, totTrib: 0 };
    notas.forEach((n) => {
      // Cancelada/denegada não são compra de verdade: contam em "Total de
      // notas", mas ficam fora dos valores e dos impostos.
      if (n.situacao !== "autorizada") {
        r.outras += 1;
        return;
      }
      r.autorizadas += 1;
      r.valor += Number(n.vNf) || 0;
      if (!n.trib) {
        r.semXml += 1;
        return;
      }
      r.icms += n.trib.icms || 0;
      r.icmsSt += n.trib.icmsSt || 0;
      r.ipi += n.trib.ipi || 0;
      r.pis += n.trib.pis || 0;
      r.cofins += n.trib.cofins || 0;
      r.totTrib += n.trib.totTrib || 0;
    });
    return r;
  }

  function cartaoPainel(rotulo, valor, sub, destaque) {
    return `
      <div class="painel-cartao${destaque ? " destaque" : ""}">
        <span class="painel-rotulo">${esc(rotulo)}</span>
        <strong class="painel-valor">${esc(valor)}</strong>
        <span class="painel-sub">${esc(sub || " ")}</span>
      </div>`;
  }

  function renderizarPainelPeriodo() {
    const meses = Array.from(new Set(notasDoPainel.map((n) => chaveMes(n.dhEmi)))).sort().reverse();
    if (painelMesSelecionado !== "todos" && !meses.includes(painelMesSelecionado)) painelMesSelecionado = "todos";
    // Um mês só: não faz sentido oferecer escolha.
    if (meses.length === 1) painelMesSelecionado = meses[0];
    else if (meses.length > 1 && painelMesSelecionado !== "todos" && !meses.includes(painelMesSelecionado)) painelMesSelecionado = "todos";

    painelMeses.innerHTML =
      meses.length > 1
        ? [`<button type="button" class="chip${painelMesSelecionado === "todos" ? " ativo" : ""}" data-mes="todos">Todo o período</button>`]
            .concat(
              meses.map(
                (m) => `<button type="button" class="chip${painelMesSelecionado === m ? " ativo" : ""}" data-mes="${esc(m)}">${esc(rotuloMes(m, false))}</button>`
              )
            )
            .join("")
        : "";
    painelMeses.style.display = meses.length > 1 ? "" : "none";

    const visiveis = painelMesSelecionado === "todos" ? notasDoPainel : notasDoPainel.filter((n) => chaveMes(n.dhEmi) === painelMesSelecionado);
    const t = calcularPainel(visiveis);
    const mesUnico = painelMesSelecionado !== "todos";
    const pct = (v) => (t.valor > 0 ? `${((v / t.valor) * 100).toFixed(1).replace(".", ",")}% do valor total` : "");

    const mesLongo = mesUnico ? rotuloMes(painelMesSelecionado, true) : "";
    painelSubtitulo.textContent = mesUnico ? mesLongo.charAt(0).toUpperCase() + mesLongo.slice(1) : `${meses.length} meses nas notas exibidas`;
    const subNotas = t.outras ? `${t.autorizadas} autorizada(s) · ${t.outras} cancelada(s)/denegada(s)` : `${t.autorizadas} autorizada(s)`;
    painelGrade.innerHTML = [
      cartaoPainel("Total de notas", String(t.total), subNotas, true),
      cartaoPainel(mesUnico ? "Valor total do mês" : "Valor total do período", formatarValor(t.valor), "notas autorizadas", true),
      cartaoPainel("Valor total aprox. de tributos", formatarValor(t.totTrib), pct(t.totTrib)),
      cartaoPainel("Valor total de COFINS", formatarValor(t.cofins), pct(t.cofins)),
      cartaoPainel("Valor total de ICMS", formatarValor(t.icms), pct(t.icms)),
      cartaoPainel("Valor total de ICMS ST", formatarValor(t.icmsSt), pct(t.icmsSt)),
      cartaoPainel("Valor total de IPI", formatarValor(t.ipi), pct(t.ipi)),
      cartaoPainel("Valor total de PIS", formatarValor(t.pis), pct(t.pis)),
    ].join("");

    const avisos = [];
    if (t.semXml) avisos.push(`${t.semXml} nota(s) ainda em "Resumo" (sem XML completo) entram no valor, mas ficam fora dos impostos — dê ciência e sincronize de novo para completar.`);
    if (t.outras) avisos.push("Notas canceladas ou denegadas contam em \"Total de notas\", mas não entram nos valores.");
    if (notasDoPainel.length >= LIMITE_NOTAS_LISTA) avisos.push(`Cálculo sobre as ${LIMITE_NOTAS_LISTA} notas mais recentes — refine o filtro para ver o resto.`);
    avisos.push("Impostos conforme o total informado no XML de cada nota. O \"aprox. de tributos\" só aparece nas notas que o emitente preencheu.");
    if (meses.length > 1) avisos.unshift("Escolher um mês também filtra a lista de notas e os downloads logo abaixo.");
    painelNota.textContent = avisos.join(" ");
    painelPeriodo.style.display = "";
  }

  painelMeses.addEventListener("click", (e) => {
    const botao = e.target.closest("[data-mes]");
    if (!botao) return;
    painelMesSelecionado = botao.dataset.mes;
    // A seleção de notas era da lista anterior; recomeça do topo da nova.
    notasSelecionadas = new Set();
    checkboxSelecionarTodas.checked = false;
    notasWrap.scrollTop = 0;
    renderizarPainelPeriodo();
    if (empresaSelecionadaId != null) renderizarListaNotas(empresaSelecionadaId);
  });

  function aplicarPainelRecolhido(recolhido) {
    painelPeriodo.classList.toggle("recolhido", recolhido);
    btnPainelPeriodo.setAttribute("aria-expanded", String(!recolhido));
  }
  try {
    aplicarPainelRecolhido(localStorage.getItem("cclasstrib-painel-periodo") === "recolhido");
  } catch (e) {
    /* sem localStorage: painel começa aberto */
  }
  btnPainelPeriodo.addEventListener("click", () => {
    const recolher = !painelPeriodo.classList.contains("recolhido");
    aplicarPainelRecolhido(recolher);
    try {
      localStorage.setItem("cclasstrib-painel-periodo", recolher ? "recolhido" : "aberto");
    } catch (e) {
      /* só uma conveniência */
    }
  });

  // Até 20 notas a lista cresce normalmente; a partir daí ganha rolagem
  // própria (cabeçalho fixo) com a altura de 20 linhas, no máximo 85% da tela.
  function ajustarAlturaListaNotas(total) {
    notasWrap.style.maxHeight = "";
    if (total <= NOTAS_VISIVEIS_SEM_ROLAGEM) {
      notasRodape.style.display = "none";
      return;
    }
    const linhas = Array.from(notasBody.querySelectorAll("tr")).slice(0, NOTAS_VISIVEIS_SEM_ROLAGEM);
    const altura = notasWrap.querySelector("thead").offsetHeight + linhas.reduce((soma, tr) => soma + tr.offsetHeight, 0);
    notasWrap.style.maxHeight = `min(${altura + 2}px, 85vh)`;
    notasRodape.textContent = `Mostrando ${total} notas — role a lista para ver as demais.`;
    notasRodape.style.display = "";
  }

  async function manifestarNota(chNFe, botao) {
    if (
      !confirm(
        "Dar Ciência da Operação para esta nota? Isso registra um evento oficial junto à SEFAZ, vinculado ao seu CNPJ — não pode ser desfeito."
      )
    ) {
      return;
    }
    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = "Enviando...";
    mostrarAviso("");
    try {
      const resposta = await fetch("/api/nfe-manifestar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ empresaId: empresaSelecionadaId, chNFe }),
      });
      const dados = await resposta.json();
      if (!dados.ok) {
        mostrarAviso(dados.erro || "SEFAZ não aceitou a manifestação.", "erro");
        botao.disabled = false;
        botao.textContent = textoOriginal;
        return;
      }
      mostrarAviso(dados.mensagem || "Ciência da Operação registrada.", "ok");
      carregarNotas(empresaSelecionadaId, empresaSelecionadaNome);
    } catch (e) {
      mostrarAviso("Não foi possível falar com a SEFAZ. Tente novamente.", "erro");
      botao.disabled = false;
      botao.textContent = textoOriginal;
    }
  }

  function mostrarNotas(empresaId, nomeEmpresa) {
    empresaSelecionadaId = Number(empresaId);
    empresaSelecionadaNome = nomeEmpresa;
    marcarEmpresaSelecionada();
    notasSecao.style.display = "";
    notasSecao.scrollIntoView({ behavior: "smooth", block: "start" });
    carregarNotas(empresaId, nomeEmpresa);
  }

  async function excluirEmpresa(empresaId) {
    if (!confirm("Excluir esta empresa e o certificado cadastrado? Essa ação não pode ser desfeita.")) return;
    try {
      const resposta = await fetch("/api/nfe-empresa-excluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ empresaId: Number(empresaId) }),
      });
      const dados = await resposta.json();
      if (!dados.ok) {
        mostrarAviso(dados.erro || "Erro ao excluir.", "erro");
        return;
      }
      mostrarAviso("Empresa excluída.", "ok");
      carregarEmpresas();
    } catch (e) {
      mostrarAviso("Não foi possível excluir a empresa.", "erro");
    }
  }

  function arquivoParaBase64(arquivo) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => {
        const resultado = String(leitor.result || "");
        const virgula = resultado.indexOf(",");
        resolve(virgula === -1 ? resultado : resultado.slice(virgula + 1));
      };
      leitor.onerror = () => reject(leitor.error);
      leitor.readAsDataURL(arquivo);
    });
  }

  async function enviarCertificado() {
    const arquivo = inputArquivo.files && inputArquivo.files[0];
    const senha = inputSenha.value;

    if (!arquivo) {
      mostrarAviso("Selecione o arquivo do certificado (.pfx).", "erro");
      return;
    }
    if (!senha) {
      mostrarAviso("Informe a senha do certificado.", "erro");
      return;
    }
    if (arquivo.size > 64 * 1024) {
      mostrarAviso("Arquivo grande demais para ser um certificado A1 (.pfx) válido.", "erro");
      return;
    }

    btnEnviar.disabled = true;
    btnEnviar.textContent = "Validando...";
    mostrarAviso("");

    try {
      const arquivoBase64 = await arquivoParaBase64(arquivo);
      const resposta = await fetch("/api/nfe-certificado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ empresaId: "novo", senha, arquivoBase64 }),
      });
      const dados = await resposta.json();
      if (!dados.ok) {
        mostrarAviso(dados.erro || "Erro ao validar o certificado.", "erro");
        return;
      }
      const documento = dados.empresa.cnpj;
      const rotuloDocumento = String(documento || "").replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ";
      mostrarAviso(`Certificado validado! Empresa ${rotuloDocumento} ${formatarDocumentoEmpresa(documento)} cadastrada.`, "ok");
      inputArquivo.value = "";
      inputSenha.value = "";
      atualizarFormularioCertificado();
      carregarEmpresas();
    } catch (e) {
      mostrarAviso("Não foi possível enviar o certificado. Tente novamente.", "erro");
    } finally {
      btnEnviar.disabled = false;
      btnEnviar.textContent = "Validar e cadastrar";
    }
  }

  btnEnviar.addEventListener("click", enviarCertificado);

  // ----- Cartão "Cadastrar certificado": arrastar/soltar, nome do arquivo,
  // passos que vão sendo marcados e botão de mostrar/ocultar a senha.
  function tamanhoLegivel(bytes) {
    return bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  }

  function atualizarFormularioCertificado() {
    const arquivo = inputArquivo.files && inputArquivo.files[0];
    certDrop.style.display = arquivo ? "none" : "";
    certArquivoBox.style.display = arquivo ? "" : "none";
    if (arquivo) {
      certArquivoNome.textContent = arquivo.name;
      certArquivoTamanho.textContent = tamanhoLegivel(arquivo.size);
    }
    const temSenha = inputSenha.value.length > 0;
    const feitos = [!!arquivo, !!arquivo && temSenha, false];
    let atualMarcado = false;
    certPassos.forEach((li, i) => {
      li.classList.toggle("feito", feitos[i]);
      const atual = !feitos[i] && !atualMarcado;
      li.classList.toggle("atual", atual);
      if (atual) atualMarcado = true;
    });
  }

  function receberArquivoCertificado(arquivo) {
    if (!arquivo) return;
    if (!/\.(pfx|p12)$/i.test(arquivo.name)) {
      mostrarAviso("Escolha um arquivo de certificado A1 (.pfx ou .p12).", "erro");
      return;
    }
    mostrarAviso("");
    const dt = new DataTransfer();
    dt.items.add(arquivo);
    inputArquivo.files = dt.files;
    atualizarFormularioCertificado();
    inputSenha.focus();
  }

  certDrop.addEventListener("click", () => inputArquivo.click());
  certDrop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputArquivo.click();
    }
  });
  ["dragenter", "dragover"].forEach((nome) =>
    certDrop.addEventListener(nome, (e) => {
      e.preventDefault();
      certDrop.classList.add("arrastando");
    })
  );
  ["dragleave", "drop"].forEach((nome) =>
    certDrop.addEventListener(nome, (e) => {
      e.preventDefault();
      certDrop.classList.remove("arrastando");
    })
  );
  certDrop.addEventListener("drop", (e) => {
    receberArquivoCertificado(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });
  inputArquivo.addEventListener("change", () => {
    const arquivo = inputArquivo.files && inputArquivo.files[0];
    if (arquivo && !/\.(pfx|p12)$/i.test(arquivo.name)) {
      inputArquivo.value = "";
      mostrarAviso("Escolha um arquivo de certificado A1 (.pfx ou .p12).", "erro");
    }
    atualizarFormularioCertificado();
  });
  btnRemoverCert.addEventListener("click", () => {
    inputArquivo.value = "";
    atualizarFormularioCertificado();
  });
  inputSenha.addEventListener("input", atualizarFormularioCertificado);
  inputSenha.addEventListener("keydown", (e) => {
    if (e.key === "Enter") enviarCertificado();
  });
  btnVerSenha.addEventListener("click", () => {
    const mostrar = inputSenha.classList.toggle("campo-senha-oculta") === false;
    btnVerSenha.setAttribute("aria-pressed", String(mostrar));
    btnVerSenha.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
  });
  // Página inteira: soltar um arquivo fora da zona não deve abrir o .pfx no navegador.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
  atualizarFormularioCertificado();

  checkboxSelecionarTodas.addEventListener("change", () => {
    const caixas = notasBody.querySelectorAll(".checkbox-nota");
    caixas.forEach((chk) => {
      chk.checked = checkboxSelecionarTodas.checked;
      chk.closest("tr").classList.toggle("nota-selecionada", chk.checked);
      if (chk.checked) notasSelecionadas.add(chk.dataset.chNfe);
      else notasSelecionadas.delete(chk.dataset.chNfe);
    });
    atualizarLinksExportacao(empresaSelecionadaId);
  });

  btnFiltrarPeriodo.addEventListener("click", () => {
    if (empresaSelecionadaId != null) carregarNotas(empresaSelecionadaId, empresaSelecionadaNome);
  });
  btnLimparPeriodo.addEventListener("click", () => {
    inputBuscaNotas.value = "";
    inputDataInicio.value = "";
    inputDataFim.value = "";
    painelMesSelecionado = "todos";
    if (empresaSelecionadaId != null) carregarNotas(empresaSelecionadaId, empresaSelecionadaNome);
  });

  // Busca de empresas: filtra a lista já carregada, enquanto digita.
  inputBuscaEmpresas.addEventListener("input", renderizarEmpresas);

  // Busca de notas: espera o usuário parar de digitar (ou Enter) antes de
  // consultar o servidor.
  let esperaBuscaNotas = null;
  inputBuscaNotas.addEventListener("input", () => {
    clearTimeout(esperaBuscaNotas);
    esperaBuscaNotas = setTimeout(() => {
      if (empresaSelecionadaId != null) carregarNotas(empresaSelecionadaId, empresaSelecionadaNome);
    }, 400);
  });
  [inputBuscaNotas, inputDataInicio, inputDataFim].forEach((campo) => {
    campo.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      clearTimeout(esperaBuscaNotas);
      if (empresaSelecionadaId != null) carregarNotas(empresaSelecionadaId, empresaSelecionadaNome);
    });
  });

  function dataIso(d) {
    const dois = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
  }
  document.querySelectorAll(".chip[data-periodo]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const hoje = new Date();
      let inicio;
      let fim;
      if (chip.dataset.periodo === "mes-atual") {
        inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        fim = hoje;
      } else if (chip.dataset.periodo === "mes-anterior") {
        inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      } else {
        inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 29);
        fim = hoje;
      }
      inputDataInicio.value = dataIso(inicio);
      inputDataFim.value = dataIso(fim);
      if (empresaSelecionadaId != null) carregarNotas(empresaSelecionadaId, empresaSelecionadaNome);
    });
  });

  carregarEmpresas();
})();
