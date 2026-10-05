(function () {
  "use strict";
  const { renderHeader, renderFooter, renderAvisoLegal, esc } = window.Components;
  const data = window.CCLASSTRIB_DATA;
  const oficial = window.CCLASSTRIB_OFICIAL;

  document.getElementById("header").innerHTML = renderHeader("sobre");
  document.getElementById("footer").innerHTML = renderFooter();
  document.getElementById("aviso").innerHTML = renderAvisoLegal(data);

  function normalizar(t) {
    return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function dataBr(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
  }

  // ---------- Faixa de números: de onde vêm os dados e quando foram atualizados ----------
  (function fatos() {
    const meta = oficial && oficial.meta ? oficial.meta : {};
    const itens = [
      { num: String(data.anexos.length), rotulo: "Anexos da LC 214/2025" },
      { num: String(oficial ? oficial.codigos.length : "—"), rotulo: "códigos cClassTrib oficiais" },
      { num: dataBr(meta.dataVersaoArquivo), rotulo: "versão da tabela cClassTrib" },
      { num: dataBr(meta.dataImportacao), rotulo: "dados atualizados neste site" },
    ];
    document.getElementById("sb-fatos").innerHTML = itens
      .map((i) => `<div class="sb-fato"><strong>${esc(i.num)}</strong><span>${esc(i.rotulo)}</span></div>`)
      .join("");
  })();

  // ---------- Linha do tempo: marca em que fase estamos ----------
  (function linhaDoTempo() {
    const ano = new Date().getFullYear();
    document.querySelectorAll("#sb-linha li").forEach((li) => {
      const ini = Number(li.dataset.anoIni);
      const fim = Number(li.dataset.anoFim);
      if (ano >= ini && ano <= fim) {
        li.classList.add("atual");
        li.insertAdjacentHTML("afterbegin", `<span class="sb-linha-aqui">Estamos aqui</span>`);
      } else if (ano > fim) {
        li.classList.add("passou");
      }
    });
  })();

  // ---------- Anexos: cartões filtráveis ----------
  (function anexos() {
    const lista = document.getElementById("sb-anexos");
    const campo = document.getElementById("sb-busca-anexo");
    const filtros = document.getElementById("sb-filtros-anexo");
    const contagem = document.getElementById("sb-anexos-contagem");

    const grupoDe = (a) => (a.vigente === false ? "revogado" : a.tratamento);
    const ROTULOS = {
      todos: "Todos",
      zero: "Alíquota zero",
      reduzida: "Redução de alíquota",
      seletivo: "Imposto Seletivo",
      pendente: "A regulamentar",
      revogado: "Revogado",
    };

    const cartoes = data.anexos.map((a) => {
      const trat = data.tratamentos[a.tratamento] || data.tratamentos.pendente;
      const revogado = a.vigente === false;
      const oficialAnexo = window.Rules.buscarCClassTribOficial(a.id, a.percentualReducao);
      const redutor = typeof a.percentualReducao === "number" ? ` · ${a.percentualReducao}%` : "";
      const grupo = grupoDe(a);
      return {
        grupo,
        busca: normalizar(`${a.id} ${a.titulo} ${trat.label}`),
        html: `
          <article class="sb-anexo${revogado ? " revogado" : ""}">
            <div class="sb-anexo-topo">
              <span class="sb-anexo-num">${esc(a.id)}</span>
              <span class="badge cor-${revogado ? "vermelho" : trat.cor}">${esc(revogado ? "Revogado" : trat.label)}${esc(revogado ? "" : redutor)}</span>
            </div>
            <p class="sb-anexo-titulo" title="${esc(a.titulo)}">${esc(a.titulo)}</p>
            <div class="sb-anexo-rodape">
              <span>Art. ${esc(a.artigo)}</span>
              ${a.itens && a.itens.length ? `<span>${a.itens.length} item(ns)</span>` : ""}
              ${oficialAnexo ? `<span>cClassTrib <code class="mono">${esc(oficialAnexo.codigo)}</code></span>` : ""}
            </div>
          </article>`,
      };
    });

    const contagemPorGrupo = {};
    cartoes.forEach((c) => (contagemPorGrupo[c.grupo] = (contagemPorGrupo[c.grupo] || 0) + 1));
    const ordem = ["todos", "zero", "reduzida", "seletivo", "pendente", "revogado"].filter(
      (g) => g === "todos" || contagemPorGrupo[g]
    );
    filtros.innerHTML = ordem
      .map(
        (g) =>
          `<button type="button" class="chip${g === "todos" ? " ativo" : ""}" data-grupo="${g}">${esc(ROTULOS[g])} <span class="sb-chip-n">${
            g === "todos" ? cartoes.length : contagemPorGrupo[g]
          }</span></button>`
      )
      .join("");

    let grupoAtivo = "todos";
    function aplicar() {
      const termo = normalizar(campo.value.trim());
      const visiveis = cartoes.filter((c) => (grupoAtivo === "todos" || c.grupo === grupoAtivo) && (!termo || c.busca.includes(termo)));
      lista.innerHTML = visiveis.length
        ? visiveis.map((c) => c.html).join("")
        : `<div class="sb-vazio">Nenhum Anexo encontrado com esse filtro.</div>`;
      contagem.textContent = `Mostrando ${visiveis.length} de ${cartoes.length} Anexos. A lista completa de produtos de cada um está na consulta por NCM.`;
    }
    filtros.addEventListener("click", (e) => {
      const b = e.target.closest("[data-grupo]");
      if (!b) return;
      grupoAtivo = b.dataset.grupo;
      filtros.querySelectorAll(".chip").forEach((c) => c.classList.toggle("ativo", c === b));
      aplicar();
    });
    campo.addEventListener("input", aplicar);
    aplicar();
  })();

  // ---------- FAQ: busca, assuntos e "expandir tudo" ----------
  (function faq() {
    const itens = window.Components.FAQ_ITEMS;
    const alvo = document.getElementById("faq");
    const campo = document.getElementById("sb-busca-faq");
    const filtros = document.getElementById("sb-filtros-faq");
    const vazio = document.getElementById("sb-faq-vazio");
    const alternar = document.getElementById("sb-faq-alternar");
    const ASSUNTOS = { todos: "Todas", conceitos: "Conceitos", dados: "Dados do site", vigencia: "Vigência e alíquotas", uso: "Como usar" };

    alvo.innerHTML = itens
      .map(
        (f, i) => `
        <div class="sb-faq-item" data-assunto="${esc(f.categoria || "conceitos")}" data-busca="${esc(normalizar(f.pergunta + " " + f.resposta))}">
          <button type="button" class="sb-faq-pergunta" aria-expanded="false" aria-controls="sb-faq-resp-${i}">
            <span>${esc(f.pergunta)}</span>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="sb-faq-resposta" id="sb-faq-resp-${i}" role="region"><p>${esc(f.resposta)}</p></div>
        </div>`
      )
      .join("");

    const todos = Array.from(alvo.querySelectorAll(".sb-faq-item"));
    const contagem = {};
    todos.forEach((el) => (contagem[el.dataset.assunto] = (contagem[el.dataset.assunto] || 0) + 1));
    const assuntos = Object.keys(ASSUNTOS).filter((a) => a === "todos" || contagem[a]);
    filtros.innerHTML = assuntos
      .map((a) => `<button type="button" class="chip${a === "todos" ? " ativo" : ""}" data-assunto="${a}">${esc(ASSUNTOS[a])} <span class="sb-chip-n">${a === "todos" ? todos.length : contagem[a]}</span></button>`)
      .join("");

    function abrir(el, abrirIt) {
      el.classList.toggle("aberto", abrirIt);
      el.querySelector(".sb-faq-pergunta").setAttribute("aria-expanded", String(abrirIt));
      const resp = el.querySelector(".sb-faq-resposta");
      resp.style.maxHeight = abrirIt ? resp.scrollHeight + "px" : null;
    }

    alvo.addEventListener("click", (e) => {
      const p = e.target.closest(".sb-faq-pergunta");
      if (!p) return;
      const item = p.closest(".sb-faq-item");
      abrir(item, !item.classList.contains("aberto"));
      atualizarBotao();
    });

    let assuntoAtivo = "todos";
    function aplicar() {
      const termo = normalizar(campo.value.trim());
      let visiveis = 0;
      todos.forEach((el) => {
        const mostrar = (assuntoAtivo === "todos" || el.dataset.assunto === assuntoAtivo) && (!termo || el.dataset.busca.includes(termo));
        el.style.display = mostrar ? "" : "none";
        if (mostrar) visiveis++;
      });
      vazio.style.display = visiveis ? "none" : "";
      atualizarBotao();
    }
    function atualizarBotao() {
      const visiveis = todos.filter((el) => el.style.display !== "none");
      const todasAbertas = visiveis.length > 0 && visiveis.every((el) => el.classList.contains("aberto"));
      alternar.textContent = todasAbertas ? "Recolher tudo" : "Expandir tudo";
      alternar.disabled = visiveis.length === 0;
    }
    alternar.addEventListener("click", () => {
      const visiveis = todos.filter((el) => el.style.display !== "none");
      const abrirTodas = !visiveis.every((el) => el.classList.contains("aberto"));
      visiveis.forEach((el) => abrir(el, abrirTodas));
      atualizarBotao();
    });
    filtros.addEventListener("click", (e) => {
      const b = e.target.closest("[data-assunto]");
      if (!b) return;
      assuntoAtivo = b.dataset.assunto;
      filtros.querySelectorAll(".chip").forEach((c) => c.classList.toggle("ativo", c === b));
      aplicar();
    });
    campo.addEventListener("input", aplicar);
    aplicar();
  })();
})();
