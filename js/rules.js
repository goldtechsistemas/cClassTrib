/*
 * Camada de regras — aplica a lógica dos Anexos da LC 214/2025 sobre os dados
 * de window.CCLASSTRIB_DATA. Não depende de DOM; pode ser testada isoladamente
 * (ver tests/tests.html).
 */
(function (global) {
  "use strict";

  function onlyDigits(str) {
    return String(str || "").replace(/\D/g, "");
  }

  function extractChapterNumbers(str) {
    const s = str.toLowerCase();
    if (!s.includes("cap") ) return null;
    const nums = s.match(/\d{1,2}/g);
    if (!nums) return null;
    return nums.map((n) => n.padStart(2, "0"));
  }

  // Retorna true se o NCM informado pelo usuário (inputDigits) está contido
  // na hipótese descrita por 'code' (uma posição/subposição/item da NCM, ou
  // uma referência a capítulo(s), tal como aparece no texto do Anexo).
  function ncmCodeMatches(code, inputDigits) {
    if (!code) return false;
    const chapters = extractChapterNumbers(code);
    if (chapters) {
      return chapters.includes(inputDigits.substring(0, 2));
    }
    const codeDigits = onlyDigits(code);
    if (!codeDigits) return false;
    // Hierarquia NCM: um código de posição/subposição/item do Anexo (2 a 8
    // dígitos) "cobre" o NCM pesquisado somente quando o NCM pesquisado é
    // igual ou mais específico (começa com aqueles dígitos). Um NCM digitado
    // mais curto/genérico que o código do Anexo NÃO é considerado casamento
    // aqui — isso evitaria sugerir uma classificação para um universo maior
    // de produtos do que a lei efetivamente cobre. (Para busca exploratória
    // por prefixo curto, use a busca por descrição.)
    if (inputDigits.length < codeDigits.length) return false;
    return inputDigits.startsWith(codeDigits);
  }

  function romanoParaInteiro(romano) {
    const map = { I: 1, V: 5, X: 10, L: 50, C: 100 };
    let total = 0;
    for (let i = 0; i < romano.length; i++) {
      const atual = map[romano[i]];
      const prox = map[romano[i + 1]];
      total += prox && atual < prox ? -atual : atual;
    }
    return total;
  }

  // Busca o código cClassTrib oficial (js/cclasstrib-oficial.js) associado a
  // um Anexo. Alguns Anexos (IV, V, VI, IX) têm mais de uma hipótese oficial
  // (ex.: uma redução geral de 60% e uma variante de alíquota zero quando o
  // comprador é órgão público/entidade CEBAS) — nesse caso, desempata pelo
  // percentual de redução para achar a hipótese "principal" pedida.
  function buscarCClassTribOficial(anexoId, percentualReducao) {
    const oficial = global.CCLASSTRIB_OFICIAL;
    if (!oficial) return null;
    const numero = romanoParaInteiro(anexoId);
    const candidatos = oficial.codigos.filter((c) => c.anexo === numero);
    if (candidatos.length === 0) return null;
    if (candidatos.length === 1) return candidatos[0];
    return candidatos.find((c) => c.pRedIBS === percentualReducao) || candidatos[0];
  }

  function todosOsItens(data) {
    const out = [];
    data.anexos.forEach((anexo) => {
      (anexo.itens || []).forEach((item) => {
        out.push({ anexo, item });
      });
    });
    return out;
  }

  // Avalia todos os códigos de um item e retorna a correspondência mais
  // específica encontrada (para permitir ordenar resultados específicos
  // antes de referências amplas a capítulo inteiro, e para avisar o usuário
  // quando o único motivo do casamento foi uma referência genérica).
  function melhorCorrespondencia(codes, inputDigits) {
    let melhor = null;
    codes.forEach((c) => {
      if (!ncmCodeMatches(c, inputDigits)) return;
      const isCapitulo = !!extractChapterNumbers(c);
      const especificidade = isCapitulo ? 0 : onlyDigits(c).length;
      if (!melhor || especificidade > melhor.especificidade) {
        melhor = { tipo: isCapitulo ? "capitulo" : "especifico", especificidade, codigo: c };
      }
    });
    return melhor;
  }

  function buildResultado(anexo, item, data, matchInfo) {
    const trat = data.tratamentos[anexo.tratamento] || data.tratamentos.pendente;
    const percentual = anexo.percentualReducao;
    const referencia = data.meta.aliquotaReferenciaEstimada;
    let aliquotaEstimada = null;
    if (typeof percentual === "number") {
      aliquotaEstimada = +(referencia * (1 - percentual / 100)).toFixed(2);
    }

    const oficial = buscarCClassTribOficial(anexo.id, percentual);
    let cClassTrib;
    let cst = null;
    if (oficial) {
      cClassTrib = oficial.codigo;
      cst = oficial.cst;
    } else if (anexo.tratamento === "seletivo") {
      cClassTrib = "não se aplica — o Imposto Seletivo tem sistemática própria de classificação, fora da tabela cClassTrib do IBS/CBS";
    } else if (anexo.naoEProdutos) {
      cClassTrib = "não se aplica a este Anexo (não é uma lista de produtos)";
    } else if (anexo.vigente === false) {
      cClassTrib = "não se aplica — Anexo revogado";
    } else {
      cClassTrib = "não encontrado na tabela oficial cClassTrib para este Anexo (verifique se a tabela foi atualizada)";
    }

    let alternativa = null;
    if (anexo.tratamentoAlternativo) {
      const alt = anexo.tratamentoAlternativo;
      const oficialAlt = buscarCClassTribOficial(anexo.id, alt.percentualReducao);
      const tratAlt = data.tratamentos[alt.tratamento] || data.tratamentos.pendente;
      alternativa = {
        percentualReducao: alt.percentualReducao,
        tratamentoLabel: tratAlt.label,
        cor: tratAlt.cor,
        artigo: alt.artigo,
        condicao: alt.condicao,
        cClassTrib: oficialAlt ? oficialAlt.codigo : null
      };
    }

    return {
      anexoId: anexo.id,
      anexoTitulo: anexo.titulo,
      artigo: anexo.artigo,
      vigente: anexo.vigente !== false,
      revogadoPor: anexo.revogadoPor || null,
      tratamento: anexo.tratamento,
      tratamentoLabel: trat.label,
      cor: trat.cor,
      percentualReducao: percentual,
      aliquotaReferencia: referencia,
      aliquotaEstimada: aliquotaEstimada,
      item: item ? item.item : null,
      itemDescricao: item ? item.descricao : null,
      cClassTrib: cClassTrib,
      cst: cst,
      alternativa: alternativa,
      observacaoAnexo: anexo.observacao || null,
      fonteUrl: data.meta.fonteUrl,
      matchTipo: matchInfo ? matchInfo.tipo : null,
      matchEspecificidade: matchInfo ? matchInfo.especificidade : 0,
      matchCodigo: matchInfo ? matchInfo.codigo : null
    };
  }

  // Quando um NCM não bate com NENHUM Anexo de redução/zero/imunidade, isso
  // NÃO significa "não sabemos" — na grande maioria dos casos significa que
  // o produto simplesmente segue a regra padrão do IBS/CBS: tributação
  // integral (CST 000, cClassTrib 000001), porque só uma minoria de produtos
  // tem tratamento especial previsto em algum Anexo. Antes desta função,
  // qualquer busca por um produto comum (ex.: um NCM de eletrônico, roupa
  // etc.) retornava "não encontrado", dando a falsa impressão de que a busca
  // não funcionava. O mesmo cartão serve para o caso do Imposto Seletivo
  // (Anexo XVII), que é um tributo ADICIONAL — o produto também se sujeita à
  // tributação normal do IBS/CBS ao mesmo tempo.
  function buildRegraGeralIntegral(data, motivo) {
    const trat = data.tratamentos.integral;
    const referencia = data.meta.aliquotaReferenciaEstimada;
    const textos = {
      semAnexo: {
        titulo: "Nenhum Anexo de redução encontrado — regra geral do IBS/CBS",
        observacao:
          "Este NCM não consta em nenhum dos Anexos de redução/zero/imunidade mapeados neste site. Pela regra geral do IBS/CBS, isso significa tributação integral — mas a cobertura dos Anexos aqui não é garantidamente 100% exaustiva (alguns Anexos maiores têm apenas uma seleção representativa; veja a seção de FAQ). Confirme o NCM digitado e, em caso de dúvida, consulte a Receita Federal ou um profissional."
      },
      seletivo: {
        titulo: "Regra geral do IBS/CBS (tributação integral)",
        observacao:
          "Regra padrão do IBS/CBS quando nenhum Anexo prevê redução, zero ou imunidade para este NCM. Aplica-se cumulativamente ao Imposto Seletivo, quando houver — o IS não substitui o IBS/CBS."
      }
    };
    const t = textos[motivo] || textos.semAnexo;
    return {
      anexoId: null,
      anexoTitulo: t.titulo,
      artigo: "4º",
      vigente: true,
      revogadoPor: null,
      tratamento: "integral",
      tratamentoLabel: trat.label,
      cor: trat.cor,
      percentualReducao: 0,
      aliquotaReferencia: referencia,
      aliquotaEstimada: referencia,
      item: null,
      itemDescricao: null,
      cClassTrib: "000001",
      cst: "000",
      alternativa: null,
      observacaoAnexo: t.observacao,
      fonteUrl: data.meta.fonteUrl,
      matchTipo: null,
      matchEspecificidade: -1,
      matchCodigo: null,
      sintetico: true
    };
  }

  // Vários itens de Anexos citam uma faixa ampla (ex.: "capítulo 10") mas o
  // próprio texto da lei ressalva expressamente que os produtos já listados
  // em outro Anexo (normalmente o Anexo I) ficam de fora daquela regra mais
  // genérica (ex.: Anexo VII, item 15: "...ressalvados os produtos
  // relacionados no Anexo I"). Sem tratar isso, uma consulta por um NCM que
  // está no Anexo I também apareceria (incorretamente) sob a regra mais
  // ampla do Anexo VII. Detectamos esse padrão textual e removemos o
  // resultado mais genérico quando o Anexo citado na ressalva também bateu.
  function extrairAnexosRessalvados(descricao) {
    if (!descricao || !/ressalv/i.test(descricao)) return [];
    const matches = descricao.match(/Anexos?\s+[IVXLC]+(\s+e\s+[IVXLC]+)*/gi) || [];
    const ids = [];
    matches.forEach((trecho) => {
      (trecho.match(/[IVXLC]+/g) || []).forEach((romano) => ids.push(romano.toUpperCase()));
    });
    return ids;
  }

  /**
   * Classifica por NCM. Retorna lista de resultados (pode haver mais de um
   * Anexo aplicável a um mesmo NCM, embora seja raro — nesse caso, resultados
   * cuja própria descrição legal ressalva/exclui um Anexo que também bateu
   * são removidos, pois a lei já resolveu esse conflito explicitamente).
   */
  function classificarPorNcm(ncmInput, data) {
    data = data || global.CCLASSTRIB_DATA;
    const inputDigits = onlyDigits(ncmInput);
    if (!inputDigits) return [];
    let resultados = [];
    todosOsItens(data).forEach(({ anexo, item }) => {
      const codes = (item.ncm || []).concat(item.nbs || []);
      const matchInfo = melhorCorrespondencia(codes, inputDigits);
      if (matchInfo) {
        resultados.push(buildResultado(anexo, item, data, matchInfo));
      }
    });

    const anexosPresentes = new Set(resultados.map((r) => r.anexoId));
    resultados = resultados.filter((r) => {
      const ressalvados = extrairAnexosRessalvados(r.itemDescricao);
      if (ressalvados.length === 0) return true;
      const deveExcluir = ressalvados.some((id) => id !== r.anexoId && anexosPresentes.has(id));
      return !deveExcluir;
    });

    if (resultados.length === 0) {
      // Nenhum Anexo bateu: pela regra geral do IBS/CBS, isso é tributação
      // integral (000001) — não "não encontrado". Ver buildRegraGeralIntegral.
      return [buildRegraGeralIntegral(data, "semAnexo")];
    }

    // Se o(s) único(s) resultado(s) forem do Imposto Seletivo, acrescenta a
    // regra geral de tributação integral do IBS/CBS (ver buildRegraGeralIntegral),
    // já que o IS incide ADICIONALMENTE, não em substituição.
    if (resultados.every((r) => r.tratamento === "seletivo")) {
      resultados.push(buildRegraGeralIntegral(data, "seletivo"));
    }

    // Correspondências específicas (código exato de posição/subposição/item)
    // vêm antes de referências amplas a capítulo inteiro, que são menos
    // confiáveis e por isso sinalizadas separadamente na interface.
    resultados.sort((a, b) => b.matchEspecificidade - a.matchEspecificidade);

    return resultados;
  }

  function normalizeTexto(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  /**
   * Busca por descrição (substring + sobreposição de palavras, sem
   * dependências externas). Retorna resultados ordenados por relevância.
   */
  function classificarPorDescricao(texto, data) {
    data = data || global.CCLASSTRIB_DATA;
    const termo = normalizeTexto(texto).trim();
    if (!termo) return [];
    const palavras = termo.split(/\s+/).filter(Boolean);
    const candidatos = [];

    todosOsItens(data).forEach(({ anexo, item }) => {
      const alvo = normalizeTexto(item.descricao);
      let score = 0;
      if (alvo.includes(termo)) score += 10;
      palavras.forEach((p) => {
        if (p.length >= 3 && alvo.includes(p)) score += 1;
      });
      if (score > 0) {
        candidatos.push({ score, resultado: buildResultado(anexo, item, data) });
      }
    });

    candidatos.sort((a, b) => b.score - a.score);
    return candidatos.slice(0, 30).map((c) => c.resultado);
  }

  function classificarPorOperacao(operacaoId, data) {
    data = data || global.CCLASSTRIB_DATA;
    const op = data.operacoes.find((o) => o.id === operacaoId);
    if (!op) return null;
    const trat = data.tratamentos[op.tratamento] || data.tratamentos.pendente;
    return {
      operacaoId: op.id,
      operacaoLabel: op.label,
      descricao: op.descricao,
      artigo: op.artigo,
      tratamento: op.tratamento,
      tratamentoLabel: trat.label,
      cor: trat.cor,
      cst: op.cst || null,
      cClassTrib: op.cClassTrib || "não encontrado na tabela oficial cClassTrib para esta operação",
      percentualReducao: op.percentualReducao != null ? op.percentualReducao : null,
      fonteUrl: data.meta.fonteUrl
    };
  }

  function listarOperacoes(data) {
    data = data || global.CCLASSTRIB_DATA;
    return data.operacoes.slice();
  }

  function naoEncontrado(ncmOuTexto) {
    return {
      naoEncontrado: true,
      mensagem:
        "Nenhuma palavra dessa descrição bateu com os títulos/itens de Anexo mapeados neste site. Isso é esperado para a maioria dos produtos comuns: só uma minoria de bens e serviços tem redução de alíquota prevista em algum Anexo da LC 214/2025 — a maioria segue a regra padrão (tributação integral, cClassTrib 000001). Se você tem o código NCM do produto, tente a busca por NCM na aba ao lado: ela sempre indica ao menos a regra geral aplicável. Esta busca por descrição não é exaustiva nem substitui consulta à Receita Federal, ao Comitê Gestor do IBS ou a um profissional contábil.",
      consulta: ncmOuTexto
    };
  }

  global.Rules = {
    classificarPorNcm,
    classificarPorDescricao,
    classificarPorOperacao,
    listarOperacoes,
    naoEncontrado,
    onlyDigits,
    ncmCodeMatches,
    romanoParaInteiro,
    buscarCClassTribOficial,
    normalizeTexto
  };
})(window);
