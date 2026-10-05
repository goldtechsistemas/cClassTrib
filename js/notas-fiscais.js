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

  function mostrarAviso(mensagem, tipo) {
    if (!mensagem) {
      avisoEl.innerHTML = "";
      return;
    }
    const cor = tipo === "erro" ? "var(--vermelho, #c0392b)" : "var(--verde, #1e824c)";
    avisoEl.innerHTML = `<div class="aviso-legal" style="border-color:${cor};color:${cor}">${esc(mensagem)}</div>`;
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
      return;
    }
    wrapVazio.style.display = "none";
    wrapBuscaEmpresas.style.display = "";

    const empresas = empresasCache.filter((emp) => empresaCombinaComBusca(emp, termo));
    if (!empresas.length) {
      wrapTabela.style.display = "none";
      empresasSemResultado.textContent = `Nenhuma empresa encontrada para "${termo}".`;
      empresasSemResultado.style.display = "";
      return;
    }
    empresasSemResultado.style.display = "none";
    wrapTabela.style.display = "";

    corpoTabela.innerHTML = empresas
      .map((emp) => {
        const ambiente = emp.ambiente === 1 ? "Produção" : "Homologação";
        let validade = emp.certValidUntil ? `Válido até ${formatarData(emp.certValidUntil)}` : "Sem certificado";
        if (emp.certVencido) {
          validade = `<span style="color:var(--vermelho)">⚠ Vencido em ${formatarData(emp.certValidUntil)}</span>`;
        } else if (emp.certPrestesAVencer) {
          validade = `<span style="color:var(--amarelo, #c98a1c)">⚠ Vence em ${emp.certDiasRestantes} dia(s) (${formatarData(emp.certValidUntil)})</span>`;
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
          avisoEspera = `<br><span style="font-size:0.85em;opacity:0.75" title="A SEFAZ pede para aguardar antes de buscar notas novas">Notas novas liberam ${esc(quando)}</span>`;
        }
        const botaoSincronizar = `<button class="btn secondary btn-sm btn-sincronizar" data-id="${esc(emp.id)}" data-nome="${esc(emp.razaoSocial || emp.cnpj)}" type="button">Sincronizar agora</button>${avisoEspera}`;

        const avisoUf = emp.uf
          ? ""
          : `<br><span style="color:var(--amarelo, #c98a1c)" title="Não foi possível identificar a UF no certificado; a consulta à SEFAZ pode falhar até isso ser corrigido.">⚠ UF não detectada</span>`;

        return `
          <tr>
            <td class="mono">${esc(formatarDocumentoEmpresa(emp.cnpj))}</td>
            <td>${esc(emp.razaoSocial || "—")}${avisoUf}</td>
            <td>${esc(ambiente)}</td>
            <td>${validade}</td>
            <td>${esc(formatarData(emp.ultimaSincronizacao) === "—" ? "Nunca sincronizado" : formatarData(emp.ultimaSincronizacao))}</td>
            <td>
              ${botaoSincronizar}
              <button class="btn secondary btn-sm btn-ver-notas" data-id="${esc(emp.id)}" data-nome="${esc(emp.razaoSocial || emp.cnpj)}" type="button">Ver notas</button>
              <button class="btn secondary btn-sm btn-excluir-empresa" data-id="${esc(emp.id)}" type="button">Excluir</button>
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

  function montarQueryFiltro() {
    const params = new URLSearchParams();
    if (inputDataInicio.value) params.set("dataInicio", inputDataInicio.value);
    if (inputDataFim.value) params.set("dataFim", inputDataFim.value);
    const busca = inputBuscaNotas.value.trim();
    if (busca) params.set("busca", busca);
    return params;
  }

  function filtroNotasAtivo() {
    return !!(inputBuscaNotas.value.trim() || inputDataInicio.value || inputDataFim.value);
  }

  function atualizarLinksExportacao(empresaId) {
    const params = montarQueryFiltro();
    params.set("empresaId", empresaId);

    if (notasSelecionadas.size > 0) {
      params.set("chaves", Array.from(notasSelecionadas).join(","));
      notasSelecaoInfo.textContent = `${notasSelecionadas.size} nota(s) selecionada(s) — os downloads abaixo usam só a seleção.`;
    } else {
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

    const notas = dados.documentos || [];
    const filtrando = filtroNotasAtivo();
    if (notas.length >= LIMITE_NOTAS_LISTA) {
      notasResumo.textContent = `Mostrando as ${LIMITE_NOTAS_LISTA} notas mais recentes — refine o filtro para ver as demais.`;
    } else if (notas.length) {
      notasResumo.textContent = `${notas.length} nota(s) ${filtrando ? "encontrada(s)" : "sincronizada(s)"}`;
    } else {
      notasResumo.textContent = "";
    }
    if (!notas.length) {
      notasVazio.textContent = filtrando
        ? "Nenhuma nota encontrada com esses filtros."
        : 'Nenhuma nota encontrada ainda para esta empresa. Clique em "Sincronizar agora".';
      notasVazio.style.display = "";
      notasWrap.style.display = "none";
      notasAcoesLote.style.display = "none";
      return;
    }
    notasVazio.style.display = "none";
    notasWrap.style.display = "";
    notasAcoesLote.style.display = "";
    atualizarLinksExportacao(empresaId);

    notasBody.innerHTML = notas
      .map((n) => {
        // Denegada/cancelada nunca chegam a ter XML completo — Ciência da
        // Operação não se aplica a elas (a SEFAZ rejeita) — e se já tem
        // "XML completo" não há nada a manifestar, então nesses casos nem
        // oferecemos o botão (evita um clique que só ia dar erro à toa).
        let acaoManifestacao;
        if (n.manifestacao === "confirmacao") {
          acaoManifestacao = "Confirmação dada";
        } else if (n.manifestacao === "ciencia" || n.tipo === "completa") {
          acaoManifestacao = "Ciência dada";
        } else if (n.situacao === "denegada" || n.situacao === "cancelada") {
          acaoManifestacao = "Não se aplica";
        } else {
          acaoManifestacao = `<button class="btn secondary btn-sm btn-manifestar" data-ch-nfe="${esc(n.chNFe)}" type="button">Dar ciência</button>`;
        }
        const linkPdf = `/api/nfe-exportar-pdf?empresaId=${encodeURIComponent(empresaId)}&chNFe=${encodeURIComponent(n.chNFe)}`;
        return `
          <tr>
            <td><input type="checkbox" class="checkbox-nota" data-ch-nfe="${esc(n.chNFe)}" /></td>
            <td class="mono">${esc(n.numero || "—")}${n.serie ? ` (série ${esc(n.serie)})` : ""}</td>
            <td>${esc(n.emitNome || "—")}</td>
            <td class="mono">${esc(n.emitCnpj ? formatarCnpj(n.emitCnpj) : "—")}</td>
            <td>${esc(n.emitUf || "—")}</td>
            <td>${esc(formatarData(n.dhEmi))}</td>
            <td>${esc(formatarValor(n.vNf))}</td>
            <td>${esc(n.situacao || "—")}</td>
            <td>${esc(n.tipo === "completa" ? "XML completo" : "Resumo")}</td>
            <td>${acaoManifestacao}</td>
            <td><a class="btn secondary btn-sm" href="${linkPdf}" target="_blank" rel="noopener">Baixar PDF</a></td>
          </tr>`;
      })
      .join("");

    notasBody.querySelectorAll(".btn-manifestar").forEach((btn) => {
      btn.addEventListener("click", () => manifestarNota(btn.dataset.chNfe, btn));
    });
    notasBody.querySelectorAll(".checkbox-nota").forEach((chk) => {
      chk.addEventListener("change", () => {
        if (chk.checked) notasSelecionadas.add(chk.dataset.chNfe);
        else notasSelecionadas.delete(chk.dataset.chNfe);
        checkboxSelecionarTodas.checked =
          notasSelecionadas.size > 0 && notasSelecionadas.size === notasBody.querySelectorAll(".checkbox-nota").length;
        atualizarLinksExportacao(empresaId);
      });
    });
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
