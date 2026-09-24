/*
 * Busca de NCM por descrição na tabela oficial completa (js/ncm-tabela.js).
 * Camada de regras separada de js/rules.js porque opera sobre uma fonte de
 * dados diferente (tabela NCM inteira da Receita Federal/Siscomex, ~15 mil
 * itens) em vez dos Anexos da LC 214/2025 (~200 itens com tratamento
 * especial). Não depende de DOM; pode ser testada isoladamente.
 */
(function (global) {
  "use strict";

  function tokenizar(s) {
    return s.split(/[^a-z0-9]+/).filter(Boolean);
  }

  // Palavras genéricas demais para discriminar produto nessa tabela — "tipo"
  // e "outros/outras" aparecem como conector estrutural em milhares de
  // categorias totalmente diferentes ("tipo aerogel", "tipo doméstico",
  // "outros parafusos", "outras rodas"...), então contar ponto por elas
  // sozinhas inflava itens sem nenhuma relação com a busca. Preposições
  // curtas também não discriminam nada.
  const PALAVRAS_IGNORADAS = new Set([
    "de", "da", "do", "das", "dos", "e", "em", "para", "com", "sem",
    "tipo", "tipos", "outro", "outros", "outra", "outras"
  ]);

  // Compara uma palavra da busca com uma palavra da descrição considerando
  // plural/flexão em português. Plural regular acrescenta só "s" ou "es"
  // (água→águas, arroz→arrozes). Palavras terminadas em "-al" têm plural
  // IRREGULAR (mineral→minerais, animal→animais — troca o "l" final por
  // "is", não é só "+s"), coberto por uma regra específica.
  //
  // Regressão (2026-09-14): a versão anterior aceitava QUALQUER palavra que
  // começasse com o termo e tivesse até 2 letras a mais — não só um sufixo
  // de plural. Isso fazia "lata" (a busca) casar com "latão" (a tabela, item
  // de latão/bronze — nada a ver com lata de bebida), porque "latão" tem só
  // 1 letra a mais que "lata". Prefixo solto não é sinal confiável de
  // flexão; por isso agora só os sufixos de plural regular são aceitos.
  // Gera as variantes de flexão/plural que um token da tabela precisaria ter
  // para "bater" com a palavra de busca p (plural regular +s/+es, e o plural
  // irregular de palavras terminadas em "-al" → "-is", ex.: mineral→minerais).
  // Calculado uma vez por palavra de busca e checado com Set.has (O(1)) contra
  // os tokens já indexados de cada linha — ver garantirIndiceTokens abaixo.
  // Antes disso, a busca testava cada palavra contra TODOS os tokens de CADA
  // uma das ~15 mil linhas com .some(), o gargalo real da consulta em lote.
  function variantesDePalavra(p) {
    const variantes = [p, p + "s", p + "es"];
    if (p.length >= 4 && p.endsWith("al")) variantes.push(p.slice(0, -1) + "is");
    return variantes;
  }

  /**
   * Busca textual na tabela NCM completa. Retorna candidatos ordenados por
   * relevância, com os códigos completos (8 dígitos, "declaráveis" em nota
   * fiscal) priorizados sobre capítulos/posições/subposições — que aparecem
   * também, para dar contexto, mas com pontuação mais baixa.
   *
   * A pontuação por palavra compara PALAVRAS INTEIRAS da descrição (não
   * qualquer substring solta): um "match" de substring simples faz "água"
   * bater com nomes científicos como "Oncorhynchus aguabonita" (nome de
   * truta), o que colocava peixes acima de água mineral de verdade nos
   * resultados. Uma palavra da descrição só pontua se for idêntica ao termo
   * OU começar com o termo e ter no máximo 2 letras a mais (cobre plural/
   * flexão, ex. "água"→"águas", sem cobrir palavras bem mais longas que só
   * por acaso começam com as mesmas letras). Cada palavra da busca conta uma
   * única vez por item (não soma por repetição), para uma descrição técnica
   * que repete o termo várias vezes não furar na frente de um produto comum
   * que só usa o termo uma vez.
   *
   * IMPORTANTE sobre o texto de busca: a tabela oficial só descreve cada
   * nível hierárquico pela DIFERENÇA em relação ao pai — o item completo
   * "1006.10.10" diz só "Para semeadura", sem repetir "Arroz" (que só
   * aparece no capítulo/posição ancestral). Por isso js/ncm-tabela.js
   * pré-calcula um "textoBusca" com o contexto de todos os ancestrais somado
   * à descrição do próprio item. Só usar esse texto concatenado, porém, faz
   * qualquer item cujo capítulo cite uma palavra de passagem (ex.: um
   * preâmbulo de capítulo que menciona "água" en passant) pontuar igual a um
   * item cuja PRÓPRIA descrição é sobre aquilo — por isso um match na
   * descrição do PRÓPRIO item vale mais (6) que um match que só aparece via
   * herança do contexto ancestral (2).
   */
  // Tokenizar e normalizar as ~15 mil linhas da tabela é o mesmo trabalho
  // toda vez que essa função roda — e na consulta em lote ela roda uma vez
  // POR PRODUTO do arquivo (até 1000). Sem cache, isso é potencialmente
  // milhões de tokenizações repetidas travando a aba por vários segundos.
  // Construído uma única vez, sob demanda, na primeira busca (índice
  // paralelo à tabela — não altera nem copia os dados originais).
  let indiceTokens = null;
  function garantirIndiceTokens(tabela, normalize) {
    if (indiceTokens && indiceTokens.tabela === tabela) return indiceTokens.linhas;
    const linhas = new Array(tabela.length);
    for (let i = 0; i < tabela.length; i++) {
      const [, descricao, , textoBusca] = tabela[i];
      const proprioTokens = tokenizar(normalize(descricao));
      const contextoCompleto = textoBusca ? normalize(textoBusca) : null;
      const contextoTokens = contextoCompleto ? tokenizar(contextoCompleto) : proprioTokens;
      // Set para checagem O(1) por variante (ver variantesDePalavra) — o
      // gargalo real da busca em lote não era só a tokenização repetida, era
      // varrer esses arrays com .some() para CADA palavra da busca, em CADA
      // uma das ~15 mil linhas.
      linhas[i] = {
        descricaoNormalizada: normalize(descricao),
        proprioTokensSet: new Set(proprioTokens),
        contextoTokensSet: new Set(contextoTokens)
      };
    }
    indiceTokens = { tabela, linhas };
    return linhas;
  }

  function buscarNcmPorDescricao(texto, limite) {
    limite = limite || 50;
    const tabela = global.NCM_TABELA;
    const normalize = (global.Rules && global.Rules.normalizeTexto) || ((s) => String(s || "").toLowerCase());
    const termo = normalize(texto).trim();
    if (!termo || !tabela) return [];

    const palavras = termo.split(/\s+/).filter((p) => p.length >= 2 && !PALAVRAS_IGNORADAS.has(p));
    // Variantes calculadas uma vez por palavra da busca (não por linha da
    // tabela — são as mesmas ~15 mil vezes, por isso ficam fora do loop).
    const palavrasComVariantes = palavras.map((p) => ({ p, variantes: variantesDePalavra(p) }));
    const candidatos = [];
    const linhasIndexadas = garantirIndiceTokens(tabela, normalize);

    for (let i = 0; i < tabela.length; i++) {
      const [codigo, descricao, completo] = tabela[i];
      const { descricaoNormalizada, proprioTokensSet, contextoTokensSet } = linhasIndexadas[i];
      let score = 0;
      // Bônus de frase completa só conta para buscas de 2+ palavras, e só
      // quando a frase aparece no texto do PRÓPRIO item (não herdada).
      if (palavras.length > 1 && descricaoNormalizada.includes(termo)) score += 4;
      palavrasComVariantes.forEach(({ variantes }) => {
        if (variantes.some((v) => proprioTokensSet.has(v))) score += 6;
        else if (variantes.some((v) => contextoTokensSet.has(v))) score += 2;
      });
      if (score === 0) continue;
      if (completo) score += 5; // prioriza códigos completos sobre níveis hierárquicos amplos
      candidatos.push({ score, codigo, descricao, completo: !!completo });
    }

    // Em caso de empate na pontuação, descrições mais curtas tendem a ser o
    // produto "principal" (ex.: "Águas minerais e águas gaseificadas"),
    // enquanto descrições longas costumam citar o termo de passagem dentro
    // de um texto técnico mais amplo — por isso desempatam primeiro por
    // tamanho da descrição, e só depois por código.
    candidatos.sort((a, b) =>
      b.score - a.score ||
      a.descricao.length - b.descricao.length ||
      a.codigo.localeCompare(b.codigo)
    );
    return candidatos.slice(0, limite);
  }

  // Índice código→linha da tabela, construído sob demanda (só quando a
  // primeira busca por marca acontece) para não pagar o custo em quem nunca
  // usa a busca em lote.
  let indiceCodigo = null;
  function buscarLinhaPorCodigo(codigo) {
    const tabela = global.NCM_TABELA;
    if (!tabela) return null;
    if (!indiceCodigo) {
      indiceCodigo = new Map();
      for (let i = 0; i < tabela.length; i++) indiceCodigo.set(tabela[i][0], tabela[i]);
    }
    return indiceCodigo.get(codigo) || null;
  }

  /**
   * Fallback heurístico: reconhece marcas comerciais conhecidas (ex.:
   * "BRAHMA", "HEINEKEN") citadas em js/marcas-conhecidas.js e devolve
   * diretamente o NCM da categoria correspondente. NÃO É a tabela oficial —
   * marcas não existem na nomenclatura, que classifica por categoria de
   * produto. Comparação é por palavra(s) inteira(s) (via tokenizar), não por
   * substring solta, para "original" (marca de cerveja) não disparar dentro
   * de frases genéricas tipo um token isolado que só por acaso é prefixo de
   * outra palavra.
   *
   * Roda ANTES da busca textual na tabela oficial (não só como último
   * recurso) porque o problema motivador não era só "não encontrei nada": em
   * descrições reais como "ORIGINAL 473ML" e "CORONA LONG NECK 330ML", a
   * busca textual ENCONTRAVA um candidato — só que errado (homônimo: uma
   * copiadora "Original", uma máquina "Corona"). Reconhecer a marca primeiro
   * evita esse tipo de falso positivo para os itens já catalogados aqui.
   */
  function buscarViaMarcaConhecida(texto) {
    const lista = global.MARCAS_CONHECIDAS;
    if (!lista || !lista.length) return null;
    const normalize = (global.Rules && global.Rules.normalizeTexto) || ((s) => String(s || "").toLowerCase());
    const tokensTexto = tokenizar(normalize(texto));
    if (!tokensTexto.length) return null;
    const textoJuntado = " " + tokensTexto.join(" ") + " ";

    for (const grupo of lista) {
      for (const termo of grupo.termos) {
        const termoTokens = tokenizar(normalize(termo));
        if (!termoTokens.length) continue;
        const termoJuntado = " " + termoTokens.join(" ") + " ";
        if (textoJuntado.includes(termoJuntado)) {
          return { ncm: grupo.ncm, categoria: grupo.categoria, termoEncontrado: termo };
        }
      }
    }
    return null;
  }

  /**
   * Reconhece termos que descrevem um SERVIÇO de alimentação (item de
   * cardápio de bar/restaurante/lanchonete — ver js/servicos-sem-ncm.js),
   * não uma mercadoria. Diferente de buscarViaMarcaConhecida, isso não
   * devolve um NCM — devolve o motivo de genuinamente não haver um, e qual
   * o tratamento tributário real que se aplica em vez disso (regime
   * específico de bares/restaurantes, art. 273 a 276 da LC 214/2025).
   */
  function buscarServicoSemNcm(texto) {
    const dados = global.TERMOS_SERVICO_ALIMENTACAO;
    if (!dados || !dados.termos || !dados.termos.length) return null;
    const normalize = (global.Rules && global.Rules.normalizeTexto) || ((s) => String(s || "").toLowerCase());
    const tokensTexto = tokenizar(normalize(texto));
    if (!tokensTexto.length) return null;
    const textoJuntado = " " + tokensTexto.join(" ") + " ";

    for (const termo of dados.termos) {
      const termoTokens = tokenizar(normalize(termo));
      if (!termoTokens.length) continue;
      const termoJuntado = " " + termoTokens.join(" ") + " ";
      if (textoJuntado.includes(termoJuntado)) {
        return { operacaoId: dados.operacaoId, termoEncontrado: termo };
      }
    }
    return null;
  }

  /**
   * Retorna o melhor candidato de NCM COMPLETO (código de 8 dígitos, o único
   * nível "declarável") para uma descrição de produto — usado pela busca de
   * NCM em lote, onde cada linha do arquivo do usuário precisa virar um único
   * código para então ser classificado. Também informa quantos candidatos
   * completos existiam, para o chamador poder avisar quando o termo era
   * ambíguo (vários candidatos) em vez de silenciosamente escolher um.
   *
   * Quando o resultado vem do fallback de marcas conhecidas (ver
   * buscarViaMarcaConhecida acima), o retorno inclui viaMarca: true e
   * detalheMarca com a categoria/termo reconhecidos — o chamador deve usar
   * isso para rotular o resultado como heurística na interface, nunca como
   * se fosse a tabela oficial.
   *
   * Quando o termo descreve um serviço de alimentação sem NCM (ver
   * buscarServicoSemNcm acima), melhor vem null de propósito — não é uma
   * busca que falhou, é uma pergunta que não tem essa resposta — e
   * semNcmServico traz o que o chamador deve mostrar no lugar.
   */
  function buscarMelhorNcmCompleto(texto) {
    const servico = buscarServicoSemNcm(texto);
    if (servico) {
      return { melhor: null, totalCandidatos: 0, viaMarca: false, semNcmServico: servico };
    }
    const marca = buscarViaMarcaConhecida(texto);
    if (marca) {
      const linha = buscarLinhaPorCodigo(marca.ncm);
      return {
        melhor: {
          score: null,
          codigo: marca.ncm,
          descricao: linha ? linha[1] : marca.categoria,
          completo: true
        },
        totalCandidatos: 1,
        viaMarca: true,
        detalheMarca: marca
      };
    }
    const candidatos = buscarNcmPorDescricao(texto, 200).filter((c) => c.completo);
    return {
      melhor: candidatos[0] || null,
      totalCandidatos: candidatos.length,
      viaMarca: false
    };
  }

  /**
   * Para um NCM completo encontrado na tabela geral, verifica se ele também
   * tem tratamento tributário especial nos Anexos da LC 214/2025 (usando
   * js/rules.js). Retorna null quando não há Anexo específico (ou seja,
   * quando a única resposta seria a regra geral de tributação integral —
   * nesse caso não vale a pena destacar, pois é o caso mais comum).
   */
  function verificarTratamentoEspecial(codigo, data) {
    if (!global.Rules || !global.Rules.classificarPorNcm) return null;
    const resultados = global.Rules.classificarPorNcm(codigo, data);
    const especifico = resultados.find((r) => !r.sintetico && r.anexoId);
    return especifico || null;
  }

  global.NcmBusca = {
    buscarNcmPorDescricao,
    buscarMelhorNcmCompleto,
    buscarViaMarcaConhecida,
    buscarServicoSemNcm,
    verificarTratamentoEspecial
  };
})(window);
