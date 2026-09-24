/*
 * Utilitários de CSV para a consulta em lote — sem dependências externas.
 */
(function (global) {
  "use strict";

  // Detecta o delimitador mais provável olhando a primeira linha (cabeçalho
  // ou primeira linha de dados) — arquivos exportados de sistemas de PDV/ERP
  // brasileiros costumam usar ";" (já que "," é o separador decimal aqui),
  // mas aceitamos "," e tab também.
  function detectarDelimitador(linha) {
    const candidatos = [";", ",", "\t"];
    let melhor = ",";
    let melhorContagem = -1;
    candidatos.forEach((c) => {
      const contagem = linha.split(c).length - 1;
      if (contagem > melhorContagem) {
        melhorContagem = contagem;
        melhor = c;
      }
    });
    return melhor;
  }

  function splitLinha(linha, delimitador) {
    return linha.split(delimitador).map((c) => c.replace(/^"|"$/g, "").trim());
  }

  /**
   * Faz o parse de um CSV com colunas em QUALQUER ordem (não assume que o
   * NCM está na primeira coluna). Se a primeira linha tiver um cabeçalho com
   * uma célula contendo "ncm" (ex.: "NCM", "Código NCM"), usa essa coluna —
   * e opcionalmente também localiza uma coluna de descrição/produto para
   * exibir junto e ajudar a desambiguar. Sem cabeçalho reconhecível, cai de
   * volta para "primeira coluna = NCM" (formato simples de uma coluna só).
   * Retorna um array de { ncm, descricao } — nunca strings soltas.
   */
  function parseCSV(texto) {
    const linhasBrutas = String(texto)
      .split(/\r\n|\n|\r/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (linhasBrutas.length === 0) return [];

    const delimitador = detectarDelimitador(linhasBrutas[0]);
    const cabecalho = splitLinha(linhasBrutas[0], delimitador);

    let ncmIdx = cabecalho.findIndex((c) => /ncm/i.test(c));
    let descIdx = cabecalho.findIndex((c) => /descri|produto|^item$/i.test(c));
    let linhasDeDados = linhasBrutas;

    if (ncmIdx !== -1) {
      // Cabeçalho reconhecido explicitamente (tem uma coluna "NCM") — a
      // primeira linha é cabeçalho e é sempre descartada.
      linhasDeDados = linhasBrutas.slice(1);
    } else {
      // Sem cabeçalho reconhecível. Se a primeira linha inteira não tem
      // nenhum dígito (ex.: "ncm" sozinho, ou nomes de colunas em texto),
      // trata como cabeçalho genérico e descarta; senão assume que já é a
      // primeira linha de dados. Em ambos os casos, NCM = primeira coluna.
      ncmIdx = 0;
      if (linhasBrutas.length > 1 && !/\d/.test(cabecalho.join(""))) {
        linhasDeDados = linhasBrutas.slice(1);
      }
    }

    return linhasDeDados
      .map((linha) => {
        const celulas = splitLinha(linha, delimitador);
        return {
          ncm: celulas[ncmIdx] || "",
          descricao: descIdx !== -1 ? celulas[descIdx] || "" : ""
        };
      })
      .filter((r) => r.ncm.length > 0);
  }

  /**
   * Faz o parse de um CSV de UMA lista de descrições de produto (não pares
   * NCM+descrição como parseCSV) — usado pela busca de NCM em lote, onde o
   * usuário só tem o nome do produto, não o código. Se a primeira linha tiver
   * uma célula reconhecida como cabeçalho (ex.: "Produto", "Descrição",
   * "Item", "Mercadoria"), essa linha é descartada; caso contrário, TODAS as
   * linhas são tratadas como dados — ao contrário de parseCSV, aqui não dá
   * para usar "a linha não tem dígito" como sinal de cabeçalho, porque
   * descrições de produto raramente têm dígito mesmo sendo dados de verdade.
   */
  function parseCSVDescricoes(texto) {
    const linhasBrutas = String(texto)
      .split(/\r\n|\n|\r/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (linhasBrutas.length === 0) return [];

    const delimitador = detectarDelimitador(linhasBrutas[0]);
    const cabecalho = splitLinha(linhasBrutas[0], delimitador);
    let colIdx = cabecalho.findIndex((c) => /descri|produto|mercadoria|^item$|^nome$/i.test(c));
    let linhasDeDados = linhasBrutas;

    if (colIdx !== -1) {
      linhasDeDados = linhasBrutas.slice(1);
    } else {
      colIdx = 0;
    }

    return linhasDeDados
      .map((linha) => splitLinha(linha, delimitador)[colIdx] || "")
      .filter((d) => d.length > 0);
  }

  // Um código cClassTrib de verdade tem 6 dígitos; quando o campo vem como
  // texto explicativo (caso do Imposto Seletivo, que não tem código próprio
  // na tabela do IBS/CBS), mostramos isso de forma curta em vez do parágrafo
  // inteiro, para a planilha ficar limpa. Quando há também uma "regra geral"
  // cumulativa (ex.: Imposto Seletivo + tributação integral do IBS/CBS), as
  // duas informações aparecem juntas nessa mesma célula, separadas por " + ".
  function formatarCstCclasstrib(l) {
    const ehCodigoCurto = /^\d{6}$/.test(l.cClassTrib || "");
    let texto = ehCodigoCurto
      ? `${l.cst || ""}/${l.cClassTrib}`
      : "Imposto Seletivo (sem código cClassTrib próprio)";
    if (l.cClassTribAdicional) {
      texto += ` + ${l.cstAdicional}/${l.cClassTribAdicional}`;
    }
    return texto;
  }

  function formatarReducao(l) {
    if (l.percentualReducao == null) return "não aplicável";
    return l.percentualReducao + "%";
  }

  // Exportação usa ";" como separador (não ","), porque é o que o Excel em
  // português espera como delimitador de lista — com "," ele não separa as
  // colunas automaticamente e joga tudo numa célula só.
  const DELIMITADOR_EXPORT = ";";

  function toCSV(linhas) {
    const header = ["Produto", "NCM", "Situação", "CST/cClassTrib", "Redução"];
    const rows = [header.join(DELIMITADOR_EXPORT)];

    linhas.forEach((l) => {
      if (l.naoEncontrado) {
        rows.push(
          [l.descricaoOriginal || "", l.consulta, "Não encontrado", "—", "—"]
            .map(csvEscape)
            .join(DELIMITADOR_EXPORT)
        );
      } else {
        rows.push(
          [
            l.descricaoOriginal || "",
            l.consultaOriginal,
            l.tratamentoLabel + (l.vigente === false ? " (ANEXO REVOGADO)" : ""),
            formatarCstCclasstrib(l),
            formatarReducao(l)
          ]
            .map(csvEscape)
            .join(DELIMITADOR_EXPORT)
        );
      }
    });

    return rows.join("\r\n");
  }

  function csvEscape(v) {
    const s = String(v == null ? "" : v);
    if (s.indexOf(DELIMITADOR_EXPORT) !== -1 || /["\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function downloadCSV(filename, csvString) {
    const blob = new Blob(["﻿" + csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  global.CSVUtil = { parseCSV, parseCSVDescricoes, toCSV, downloadCSV };
})(window);
