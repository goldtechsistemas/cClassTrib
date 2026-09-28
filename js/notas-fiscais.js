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
        const validade = emp.certValidUntil
          ? `Válido até ${formatarData(emp.certValidUntil)}`
          : "Sem certificado";
        return `
          <tr>
            <td class="mono">${esc(formatarCnpj(emp.cnpj))}</td>
            <td>${esc(emp.razaoSocial || "—")}</td>
            <td>${esc(ambiente)}</td>
            <td>${esc(validade)}</td>
            <td>${esc(formatarData(emp.ultimaSincronizacao) === "—" ? "Nunca sincronizado" : formatarData(emp.ultimaSincronizacao))}</td>
            <td><button class="btn secondary btn-sm btn-excluir-empresa" data-id="${esc(emp.id)}" type="button">Excluir</button></td>
          </tr>`;
      })
      .join("");

    corpoTabela.querySelectorAll(".btn-excluir-empresa").forEach((btn) => {
      btn.addEventListener("click", () => excluirEmpresa(btn.dataset.id));
    });
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

  carregarEmpresas();
})();
