(function () {
  "use strict";
  const { renderHeader, renderFooter, esc } = window.Components;

  document.getElementById("header").innerHTML = renderHeader("notas");
  document.getElementById("footer").innerHTML = renderFooter();

  const avisoEl = document.getElementById("aviso-nfe");
  const inputArquivo = document.getElementById("input-cert-arquivo");
  const inputSenha = document.getElementById("input-cert-senha");
  const btnEnviar = document.getElementById("btn-enviar-cert");
  const wrapVazio = document.getElementById("empresas-vazio");
  const wrapTabela = document.getElementById("empresas-wrap");
  const corpoTabela = document.getElementById("empresas-body");

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
  const inputDataInicio = document.getElementById("input-data-inicio");
  const inputDataFim = document.getElementById("input-data-fim");
  const btnFiltrarPeriodo = document.getElementById("btn-filtrar-periodo");
  const btnLimparPeriodo = document.getElementById("btn-limpar-periodo");
  const checkboxSelecionarTodas = document.getElementById("checkbox-selecionar-todas");

  let empresaSelecionadaId = null;
  let empresaSelecionadaNome = "";
  let notasSelecionadas = new Set();

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

    const empresas = dados.empresas || [];
    if (!empresas.length) {
      wrapVazio.style.display = "";
      wrapTabela.style.display = "none";
      return;
    }
    wrapVazio.style.display = "none";
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

        const aguardando = emp.proximaConsultaPermitidaEm && new Date(emp.proximaConsultaPermitidaEm) > new Date();
        const botaoSincronizar = aguardando
          ? (() => {
              const espera = new Date(emp.proximaConsultaPermitidaEm);
              const horaCurta = espera.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
              const mesmoDia = espera.toDateString() === new Date().toDateString();
              const rotulo = mesmoDia ? `Libera às ${horaCurta}` : `Libera em ${espera.toLocaleString("pt-BR")}`;
              return `<button class="btn secondary btn-sm" disabled title="SEFAZ pede para aguardar até ${espera.toLocaleString("pt-BR")} antes de consultar de novo">${esc(rotulo)}</button>`;
            })()
          : `<button class="btn secondary btn-sm btn-sincronizar" data-id="${esc(emp.id)}" data-nome="${esc(emp.razaoSocial || emp.cnpj)}" type="button">Sincronizar agora</button>`;

        return `
          <tr>
            <td class="mono">${esc(formatarCnpj(emp.cnpj))}</td>
            <td>${esc(emp.razaoSocial || "—")}</td>
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
      const msg =
        dados.docsNovos > 0
          ? `${dados.docsNovos} nota(s) nova(s) encontrada(s) para ${nomeEmpresa}.`
          : `Sincronizado — nenhuma nota nova (SEFAZ: "${dados.xMotivo}").`;
      mostrarAviso(msg + (dados.temMais ? " Há mais notas disponíveis — sincronize de novo para continuar." : ""), "ok");
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
    return params;
  }

  function atualizarLinksExportacao(empresaId) {
    const params = montarQueryFiltro();
    params.set("empresaId", empresaId);

    if (notasSelecionadas.size > 0) {
      params.set("chaves", Array.from(notasSelecionadas).join(","));
      notasSelecaoInfo.textContent = `${notasSelecionadas.size} nota(s) selecionada(s) — os downloads abaixo usam só a seleção.`;
    } else {
      notasSelecaoInfo.textContent = "Nenhuma nota selecionada — os downloads abaixo usam todas as notas visíveis (respeitando o filtro de período).";
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

    let dados;
    try {
      const resposta = await fetch(`/api/nfe-documentos?${params.toString()}`, { credentials: "same-origin" });
      dados = await resposta.json();
    } catch (e) {
      mostrarAviso("Não foi possível carregar as notas.", "erro");
      return;
    }
    if (!dados.ok) {
      mostrarAviso(dados.erro || "Erro ao carregar notas.", "erro");
      return;
    }

    const notas = dados.documentos || [];
    if (!notas.length) {
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
        const acaoManifestacao =
          n.manifestacao === "ciencia"
            ? "Ciência dada"
            : `<button class="btn secondary btn-sm btn-manifestar" data-ch-nfe="${esc(n.chNFe)}" type="button">Dar ciência</button>`;
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
    if (arquivo.size > 16 * 1024) {
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
      mostrarAviso(`Certificado validado! Empresa CNPJ ${formatarCnpj(dados.empresa.cnpj)} cadastrada.`, "ok");
      inputArquivo.value = "";
      inputSenha.value = "";
      carregarEmpresas();
    } catch (e) {
      mostrarAviso("Não foi possível enviar o certificado. Tente novamente.", "erro");
    } finally {
      btnEnviar.disabled = false;
      btnEnviar.textContent = "Validar e cadastrar";
    }
  }

  btnEnviar.addEventListener("click", enviarCertificado);

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
    inputDataInicio.value = "";
    inputDataFim.value = "";
    if (empresaSelecionadaId != null) carregarNotas(empresaSelecionadaId, empresaSelecionadaNome);
  });

  carregarEmpresas();
})();
