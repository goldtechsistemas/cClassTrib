(async function () {
  "use strict";
  const results = [];
  let passed = 0;
  let failed = 0;

  function assert(desc, condition) {
    results.push({ desc, ok: !!condition });
    if (condition) passed++; else failed++;
  }

  function assertEqual(desc, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ desc: `${desc} (esperado: ${JSON.stringify(expected)}, obtido: ${JSON.stringify(actual)})`, ok });
    if (ok) passed++; else failed++;
  }

  const data = window.CCLASSTRIB_DATA;
  const R = window.Rules;

  // --- onlyDigits ---
  assertEqual("onlyDigits remove pontuação", R.onlyDigits("1006.20.00"), "10062000");
  assertEqual("onlyDigits com string vazia", R.onlyDigits(""), "");

  // --- ncmCodeMatches ---
  assert("ncmCodeMatches: código exato do Anexo cobre NCM completo", R.ncmCodeMatches("1006.20", "10062000"));
  assert("ncmCodeMatches: posição de 4 dígitos cobre NCM de 8 dígitos", R.ncmCodeMatches("02.01", "02011000"));
  assert("ncmCodeMatches: 'capítulo 6' cobre qualquer NCM do capítulo 06", R.ncmCodeMatches("capítulo 6", "06031100"));
  assert("ncmCodeMatches: não deve casar capítulos diferentes", !R.ncmCodeMatches("capítulo 6", "07031100"));
  assert("ncmCodeMatches: código mais específico não cobre um NCM mais genérico digitado", !R.ncmCodeMatches("1006.20.00", "1006"));

  // --- classificarPorNcm ---
  const arroz = R.classificarPorNcm("1006.20.00", data);
  assert("Arroz (1006.20.00) encontra pelo menos 1 resultado no Anexo I", arroz.length > 0);
  assert("Arroz é classificado no Anexo I", arroz.some((r) => r.anexoId === "I"));
  assert("Arroz tem tratamento zero", arroz.some((r) => r.tratamento === "zero"));

  const cadeiraRodas = R.classificarPorNcm("8713.10.00", data);
  assert("Cadeira de rodas sem motor encontrada no Anexo XIII (zero)", cadeiraRodas.some((r) => r.anexoId === "XIII"));

  assertEqual(
    "Arroz (Anexo I) não deve também aparecer sob a regra genérica de cereais do Anexo VII (que ressalva o Anexo I)",
    arroz.filter((r) => r.anexoId === "VII").length,
    0
  );
  assertEqual("Arroz: o resultado mais específico (Anexo I) vem primeiro na lista", arroz[0].anexoId, "I");
  assert("Arroz: a correspondência do Anexo I é do tipo 'especifico', não 'capitulo'", arroz[0].matchTipo === "especifico");
  const matchCapituloIX = arroz.find((r) => r.anexoId === "IX");
  if (matchCapituloIX) {
    assert("Arroz também casa com Anexo IX (sementes, capítulo 10) mas sinalizado como 'capitulo'", matchCapituloIX.matchTipo === "capitulo");
  }

  const naoExiste = R.classificarPorNcm("9999.99.99", data);
  assertEqual("NCM que não bate com nenhum Anexo retorna 1 resultado (regra geral), não lista vazia", naoExiste.length, 1);
  assertEqual("NCM sem Anexo aplica a regra geral de tributação integral (000001)", naoExiste[0].cClassTrib, "000001");
  assert("NCM sem Anexo é marcado como resultado sintético (não é um Anexo real)", naoExiste[0].sintetico === true);
  assertEqual("NCM sem Anexo não tem anexoId", naoExiste[0].anexoId, null);

  const vazio = R.classificarPorNcm("", data);
  assertEqual("NCM vazio retorna lista vazia (sem erro)", vazio.length, 0);

  // --- Anexo XIV revogado ---
  const anexoXIV = data.anexos.find((a) => a.id === "XIV");
  assert("Anexo XIV está marcado como não vigente (revogado)", anexoXIV.vigente === false);
  assert("Anexo XIV tem campo revogadoPor preenchido", !!anexoXIV.revogadoPor);

  const medicamento = R.classificarPorNcm("3004.90.69", data); // ex.: ABACAVIR, código do Anexo XIV revogado
  assert(
    "NCM de medicamento do Anexo XIV revogado nunca retorna o Anexo XIV (itens vazios) — " +
      "pode ainda casar com a referência genérica de heading 30.04 do Anexo IX (medicamentos veterinários); " +
      "por isso a descrição do item é sempre exibida para o usuário conferir a hipótese exata",
    !medicamento.some((r) => r.anexoId === "XIV")
  );

  // --- classificarPorDescricao ---
  const buscaCadeira = R.classificarPorDescricao("cadeira de rodas", data);
  assert("Busca textual 'cadeira de rodas' encontra resultado", buscaCadeira.length > 0);
  assert("Busca textual 'cadeira de rodas' aponta para Anexo XIII", buscaCadeira.some((r) => r.anexoId === "XIII"));

  const buscaVazia = R.classificarPorDescricao("", data);
  assertEqual("Busca textual vazia retorna lista vazia", buscaVazia.length, 0);

  // --- classificarPorOperacao ---
  const exportacao = R.classificarPorOperacao("exportacao", data);
  assertEqual("Exportação tem tratamento 'imune'", exportacao.tratamento, "imune");
  assertEqual("Exportação cita art. 8º", exportacao.artigo, "8º");

  const operacaoInexistente = R.classificarPorOperacao("nao-existe", data);
  assertEqual("Operação inexistente retorna null", operacaoInexistente, null);

  // --- cálculo de alíquota estimada ---
  const referencia = data.meta.aliquotaReferenciaEstimada;
  const resultadoZero = R.classificarPorNcm("1006.20.00", data)[0];
  assertEqual("Redução de 100% resulta em alíquota estimada 0%", resultadoZero.aliquotaEstimada, 0);

  const higiene = R.classificarPorNcm("3401.11.90", data)[0]; // Anexo VIII, -60%
  const esperado60 = +(referencia * 0.4).toFixed(2);
  assertEqual("Redução de 60% aplica o cálculo referencia * 0.4", higiene.aliquotaEstimada, esperado60);

  // --- tabela oficial cClassTrib (js/cclasstrib-oficial.js) ---
  assert("Tabela oficial cClassTrib foi carregada", !!window.CCLASSTRIB_OFICIAL && window.CCLASSTRIB_OFICIAL.codigos.length > 0);
  assertEqual("Tabela oficial tem 164 códigos cClassTrib", window.CCLASSTRIB_OFICIAL.codigos.length, 164);

  assertEqual("romanoParaInteiro converte corretamente", [R.romanoParaInteiro("I"), R.romanoParaInteiro("IV"), R.romanoParaInteiro("IX"), R.romanoParaInteiro("XIII"), R.romanoParaInteiro("XV")], [1, 4, 9, 13, 15]);

  assertEqual("Arroz (Anexo I) tem o código cClassTrib oficial 200003", resultadoZero.cClassTrib, "200003");
  assertEqual("Arroz (Anexo I) tem CST 200", resultadoZero.cst, "200");

  const dispMedico = R.classificarPorNcm("3926.90.30", data)[0]; // Anexo IV, item 1
  assertEqual("Dispositivo médico (Anexo IV, 60%) tem cClassTrib oficial 200030", dispMedico.cClassTrib, "200030");
  assert("Dispositivo médico (Anexo IV) tem tratamento alternativo (zero para compra pública)", !!dispMedico.alternativa);
  assertEqual("Alternativa do Anexo IV cita art. 144, II", dispMedico.alternativa.artigo, "144, II");
  assertEqual("Alternativa do Anexo IV tem cClassTrib oficial 200005", dispMedico.alternativa.cClassTrib, "200005");

  const resultadosBebida = R.classificarPorNcm("2203.00.00", data);
  const bebidaAlcoolica = resultadosBebida.find((r) => r.anexoId === "XVII");
  assert("Imposto Seletivo (Anexo XVII) indica que não há cClassTrib aplicável (sistemática própria)", /não se aplica/i.test(bebidaAlcoolica.cClassTrib));

  // --- regra geral do IBS/CBS somada ao Imposto Seletivo ---
  const regraGeralBebida = resultadosBebida.find((r) => r.sintetico);
  assert("NCM só sujeito a Imposto Seletivo também retorna a regra geral do IBS/CBS (cumulativa)", !!regraGeralBebida);
  assertEqual("Regra geral cumulativa tem cClassTrib 000001", regraGeralBebida.cClassTrib, "000001");
  assertEqual("Regra geral cumulativa tem CST 000", regraGeralBebida.cst, "000");
  assertEqual("Regra geral cumulativa não tem anexoId (não é um Anexo real)", regraGeralBebida.anexoId, null);

  const resultadosArroz2 = R.classificarPorNcm("1006.20.00", data);
  assert("Arroz (já coberto por Anexo I) NÃO recebe a regra geral sintética de tributação integral", !resultadosArroz2.some((r) => r.sintetico));

  assertEqual("Operação de exportação tem cClassTrib oficial 410004", exportacao.cClassTrib, "410004");
  assertEqual("Operação de exportação tem CST 410", exportacao.cst, "410");

  // --- guarda contra regressão: nenhum artigo fabricado/inventado ---
  const artigosInventadosRegex = /146-A|146-B/;
  const temArtigoInventado = data.anexos.some((a) => artigosInventadosRegex.test(a.artigo || ""));
  assert("Nenhum Anexo usa os artigos fictícios '146-A'/'146-B' (bug corrigido em 2026-09-12)", !temArtigoInventado);

  assertEqual("Anexo III (saúde) cita o artigo correto (130), confirmado pela tabela oficial", data.anexos.find((a) => a.id === "III").artigo, "130");
  assertEqual("Anexo XII (disp. médicos zero) cita o artigo correto (144, I)", data.anexos.find((a) => a.id === "XII").artigo, "144, I");
  assertEqual("Anexo XIII (acessibilidade zero) cita o artigo correto (145, I)", data.anexos.find((a) => a.id === "XIII").artigo, "145, I");

  // --- naoEncontrado ---
  const nf = R.naoEncontrado("1234.56.78");
  assert("naoEncontrado sinaliza naoEncontrado=true", nf.naoEncontrado === true);
  assert("naoEncontrado não inventa classificação (sem campo anexoId)", !("anexoId" in nf));

  // --- parseCSV (js/csv.js) ---
  // Regressão real: um usuário enviou um CSV real de bebidas com o NCM na
  // ÚLTIMA coluna ("Descrição;CST;CEST;NCM") e produtos sem nenhum dígito no
  // nome (ex.: "BRAHMA"). O parser antigo só lia a primeira coluna e
  // descartava linhas sem dígitos, perdendo 27 de 76 produtos.
  const csvComNcmNoFim = [
    "Descrição;CST;CEST;NCM",
    "ORIGINAL 473ML;60;302103;22030000",
    "BRAHMA;60;302100;22030000",
    "SKOL;60;302100;22030000"
  ].join("\n");
  const parsedComHeader = window.CSVUtil.parseCSV(csvComNcmNoFim);
  assertEqual("parseCSV com cabeçalho 'NCM' na última coluna: reconhece 3 linhas de dados (descarta só o cabeçalho)", parsedComHeader.length, 3);
  assertEqual("parseCSV pega o NCM da coluna certa mesmo não sendo a primeira", parsedComHeader[0].ncm, "22030000");
  assertEqual("parseCSV também captura a coluna de descrição", parsedComHeader[0].descricao, "ORIGINAL 473ML");
  assert("parseCSV NÃO descarta produto sem nenhum dígito no nome (ex.: 'BRAHMA')", parsedComHeader.some((r) => r.descricao === "BRAHMA"));
  assert("parseCSV NÃO descarta produto sem nenhum dígito no nome (ex.: 'SKOL')", parsedComHeader.some((r) => r.descricao === "SKOL"));

  const csvSimples = ["ncm", "1006.20.00", "0401.10.10"].join("\n");
  const parsedSimples = window.CSVUtil.parseCSV(csvSimples);
  assertEqual("parseCSV formato simples (uma coluna, com cabeçalho 'ncm'): descarta o cabeçalho e lê as 2 linhas de dados", parsedSimples.length, 2);
  assertEqual("parseCSV formato simples: primeira coluna é usada como NCM", parsedSimples[0].ncm, "1006.20.00");

  const csvSemCabecalho = ["1006.20.00", "0401.10.10"].join("\n");
  const parsedSemCabecalho = window.CSVUtil.parseCSV(csvSemCabecalho);
  assertEqual("parseCSV sem nenhum cabeçalho: as 2 linhas são tratadas como dados (nenhuma descartada)", parsedSemCabecalho.length, 2);

  // --- toCSV (exportação) ---
  // A exportação precisa usar ";" (não ",") porque é o separador de lista
  // que o Excel em português espera — com "," o Excel PT-BR não separa as
  // colunas automaticamente. E o pedido do usuário foi por exatamente 5
  // colunas simples: Produto, NCM, Situação, CST/cClassTrib, Redução.
  const arrozParaExport = Object.assign({}, R.classificarPorNcm("1006.20.00", data)[0], {
    consultaOriginal: "1006.20.00",
    descricaoOriginal: "Arroz Tipo 1"
  });
  const csvArroz = window.CSVUtil.toCSV([arrozParaExport]);
  const linhasCsvArroz = csvArroz.split("\r\n");
  assertEqual("toCSV: cabeçalho tem exatamente as 5 colunas pedidas, separadas por ';'", linhasCsvArroz[0], "Produto;NCM;Situação;CST/cClassTrib;Redução");
  assertEqual("toCSV: linha de dados usa ';' como separador e traz produto, NCM, situação, código e redução", linhasCsvArroz[1], "Arroz Tipo 1;1006.20.00;Alíquota zero;200/200003;100%");

  const bebidaParaExport = (() => {
    const resultados = R.classificarPorNcm("2203.00.00", data);
    const principal = resultados.find((r) => !r.sintetico);
    const extra = resultados.find((r) => r.sintetico);
    return Object.assign({}, principal, {
      consultaOriginal: "2203.00.00",
      descricaoOriginal: "Cerveja Original 473ml",
      cstAdicional: extra.cst,
      cClassTribAdicional: extra.cClassTrib
    });
  })();
  const linhaBebida = window.CSVUtil.toCSV([bebidaParaExport]).split("\r\n")[1];
  assert("toCSV: Imposto Seletivo mostra rótulo curto (não o parágrafo inteiro) na célula CST/cClassTrib", linhaBebida.indexOf("Imposto Seletivo (sem código cClassTrib próprio)") !== -1);
  assert("toCSV: quando há regra geral cumulativa, o código extra (000/000001) aparece na mesma célula", linhaBebida.indexOf("000/000001") !== -1);
  assert("toCSV: Redução mostra 'não aplicável' para o Imposto Seletivo (não tem percentual)", linhaBebida.indexOf("não aplicável") !== -1);

  // --- NcmBusca (js/ncm-busca.js) sobre a tabela NCM oficial completa ---
  assert("Tabela NCM completa (window.NCM_TABELA) foi carregada", Array.isArray(window.NCM_TABELA) && window.NCM_TABELA.length > 0);
  assert("Tabela NCM completa tem milhares de itens (não é só os Anexos)", window.NCM_TABELA.length > 10000);
  assert("Metadados da tabela NCM (NCM_TABELA_META) foram carregados", !!(window.NCM_TABELA_META && window.NCM_TABELA_META.totalItens));

  const buscaAgua = window.NcmBusca.buscarNcmPorDescricao("água");
  assert("Busca 'água' na tabela completa encontra resultados", buscaAgua.length > 0);
  assert("Busca 'água' encontra o código de água mineral (2201.10.00)", buscaAgua.some((r) => r.codigo === "2201.10.00"));
  assert("Busca 'água' prioriza códigos completos (8 dígitos) no topo da lista", buscaAgua[0].completo === true);

  // Regressão: matching por substring solta (sem respeitar palavra inteira)
  // fazia "água" bater com nomes científicos como "Oncorhynchus aguabonita"
  // (uma espécie de truta) e ranquear esse peixe ACIMA de água mineral de
  // verdade — porque "aguabonita" contém "agua" como substring.
  const idxAguaMineral = buscaAgua.findIndex((r) => r.codigo === "2201.10.00");
  const idxTruta = buscaAgua.findIndex((r) => r.codigo === "0302.11.00");
  assert(
    "Busca 'água': água mineral (produto de verdade) não fica atrás da truta 'aguabonita' (falso positivo por substring)",
    idxTruta === -1 || idxAguaMineral < idxTruta
  );

  // Regressão: "mineral" tem plural IRREGULAR em português ("minerais", não
  // "minerals"/"minerais" via "+s") — a regra genérica de plural (prefixo +
  // até 2 letras) não reconhecia "minerais" como flexão de "mineral", então
  // "água mineral" perdia pontos e ficava atrás de falsos positivos como
  // "A jato de água" (uma máquina) ou "Aguarrás mineral" (um solvente).
  const buscaAguaMineral = window.NcmBusca.buscarNcmPorDescricao("água mineral");
  const idxAguaMineralDuasPalavras = buscaAguaMineral.findIndex((r) => r.codigo === "2201.10.00");
  assert("Busca 'água mineral' encontra o código de água mineral de verdade (2201.10.00)", idxAguaMineralDuasPalavras !== -1);
  assertEqual("Busca 'água mineral' põe água mineral em 1º lugar (não atrás de falsos positivos tipo 'a jato de água')", idxAguaMineralDuasPalavras, 0);

  // Regressão: a tabela oficial só descreve cada nível hierárquico pela
  // DIFERENÇA em relação ao pai — o código completo "1006.10.10" (arroz para
  // semeadura) só diz "Para semeadura", sem repetir "Arroz" (que só aparece
  // no capítulo/posição ancestral, "10.06" / "1006.10"). Sem reconstruir
  // esse contexto hierárquico, buscar "arroz" não encontrava NENHUM código
  // completo de arroz de verdade.
  const buscaArroz = window.NcmBusca.buscarNcmPorDescricao("arroz");
  assert("Busca 'arroz' encontra pelo menos um código completo de arroz de verdade (posição 10.06)", buscaArroz.some((r) => r.completo && r.codigo.startsWith("1006")));

  // Regressão: "tipo" e "outros/outras" são conectores estruturais usados em
  // milhares de categorias sem relação nenhuma entre si ("tipo aerogel",
  // "tipo doméstico", "outros parafusos"...) — sem tratá-los como stopword,
  // "arroz tipo 1" ranqueava itens de sílica/válvulas acima do arroz de
  // verdade, só por causa da palavra "tipo".
  const buscaArrozTipo = window.NcmBusca.buscarNcmPorDescricao("arroz tipo 1");
  assert("Busca 'arroz tipo 1' põe um item de arroz de verdade no topo (não 'tipo aerogel'/'tipo anátase')", buscaArrozTipo.length > 0 && buscaArrozTipo[0].codigo.startsWith("1006"));

  const buscaNcmVazia = window.NcmBusca.buscarNcmPorDescricao("");
  assertEqual("Busca vazia na tabela completa retorna lista vazia (sem erro)", buscaNcmVazia.length, 0);

  // Nenhuma descrição deve carregar marcação HTML residual (ex.: <i>...</i>
  // de nomes científicos) — isso precisa ter sido limpo na conversão.
  const comTagHtml = window.NCM_TABELA.filter((item) => /[<>]/.test(item[1]));
  assertEqual("Nenhuma descrição da tabela NCM tem marcação HTML residual (<...>)", comTagHtml.length, 0);

  const especialArroz = window.NcmBusca.verificarTratamentoEspecial("1006.20.00", data);
  assert("verificarTratamentoEspecial encontra o Anexo I para o arroz (NCM já conhecido)", !!especialArroz && especialArroz.anexoId === "I");

  const especialCamiseta = window.NcmBusca.verificarTratamentoEspecial("6109.10.00", data);
  assertEqual("verificarTratamentoEspecial retorna null para NCM sem Anexo específico (regra geral)", especialCamiseta, null);

  // --- buscarMelhorNcmCompleto (usado pela busca de NCM em lote) ---
  const melhorCadeira = window.NcmBusca.buscarMelhorNcmCompleto("cadeira de rodas");
  assert("buscarMelhorNcmCompleto('cadeira de rodas') encontra um candidato", !!melhorCadeira.melhor);
  assert("buscarMelhorNcmCompleto só retorna candidatos completos (8 dígitos)", melhorCadeira.melhor.completo === true);
  assert("buscarMelhorNcmCompleto('cadeira de rodas') aponta um NCM da posição 87 (veículos)", melhorCadeira.melhor.codigo.startsWith("87"));

  const melhorInexistente = window.NcmBusca.buscarMelhorNcmCompleto("xyzxyzxyzinexistente123");
  assertEqual("buscarMelhorNcmCompleto retorna melhor=null quando não há nenhum candidato", melhorInexistente.melhor, null);

  // --- Fallback de marcas conhecidas (js/marcas-conhecidas.js) ---
  // Motivado por relato real do usuário: a busca textual pura errava para
  // descrições de PDV com marca + volume, seja por não achar nada (marcas
  // não aparecem na nomenclatura oficial, que classifica por categoria) seja
  // por achar um homônimo errado (ex.: "ORIGINAL" bate com uma copiadora,
  // "CORONA" com uma máquina, antes deste fallback existir).
  assert("buscarViaMarcaConhecida está exposta", typeof window.NcmBusca.buscarViaMarcaConhecida === "function");

  const marcaBrahma = window.NcmBusca.buscarViaMarcaConhecida("BRAHMA");
  assert("'BRAHMA' é reconhecida como cerveja", !!marcaBrahma && marcaBrahma.ncm === "2203.00.00");

  const marcaHeineken = window.NcmBusca.buscarViaMarcaConhecida("HEINEKEN 473ML");
  assert("'HEINEKEN 473ML' (com volume junto) é reconhecida como cerveja", !!marcaHeineken && marcaHeineken.ncm === "2203.00.00");

  const marcaAmstel = window.NcmBusca.buscarViaMarcaConhecida("AMSTEL 473ML LATA");
  assert("'AMSTEL 473ML LATA' é reconhecida como cerveja", !!marcaAmstel && marcaAmstel.ncm === "2203.00.00");

  const melhorBrahma = window.NcmBusca.buscarMelhorNcmCompleto("BRAHMA 350ML");
  assert("buscarMelhorNcmCompleto('BRAHMA 350ML') usa o fallback de marca", melhorBrahma.viaMarca === true);
  assertEqual("buscarMelhorNcmCompleto('BRAHMA 350ML') aponta para o NCM de cerveja", melhorBrahma.melhor.codigo, "2203.00.00");

  // Regressão: "ORIGINAL 473ML" e "CORONA LONG NECK 330ML" batiam com
  // homônimos errados (copiadora / máquina) na busca textual pura antes de
  // este fallback existir e rodar antes da busca textual.
  const melhorOriginal = window.NcmBusca.buscarMelhorNcmCompleto("ORIGINAL 473ML");
  assert("'ORIGINAL 473ML' resolve via marca (cerveja), não via homônimo de copiadora", melhorOriginal.viaMarca === true && melhorOriginal.melhor.codigo === "2203.00.00");

  const melhorCorona = window.NcmBusca.buscarMelhorNcmCompleto("CORONA LONG NECK 330ML");
  assert("'CORONA LONG NECK 330ML' resolve via marca (cerveja), não via homônimo de máquina", melhorCorona.viaMarca === true && melhorCorona.melhor.codigo === "2203.00.00");

  const marcaInexistente = window.NcmBusca.buscarViaMarcaConhecida("PARAFUSO SEXTAVADO");
  assertEqual("Produto sem marca reconhecida não aciona o fallback (retorna null)", marcaInexistente, null);

  const melhorAgua = window.NcmBusca.buscarMelhorNcmCompleto("água mineral");
  assertEqual("Busca sem marca conhecida continua usando a tabela oficial normalmente (viaMarca=false)", melhorAgua.viaMarca, false);

  // Regressão: comparação é por palavra inteira tokenizada, não substring —
  // "gin" (gim/genebra) não pode disparar dentro de outra palavra que só por
  // acaso contém essas letras em sequência (ex.: "engine" contém "gin").
  const marcaFalsoPositivoGin = window.NcmBusca.buscarViaMarcaConhecida("kit engine sobressalente");
  assertEqual("'gin' não dispara como substring dentro de 'engine' (comparação é por palavra inteira)", marcaFalsoPositivoGin, null);

  // Regressão (relato do usuário em 2026-09-14): marcas de guloseima que a
  // busca textual pura não achava (goma de mascar/bala/chocolate não usam
  // essas palavras na descrição oficial, ou "bala" bate com arma de fogo).
  const melhorTrident = window.NcmBusca.buscarMelhorNcmCompleto("TRIDENT SABORES");
  assert("'TRIDENT SABORES' resolve via marca (goma de mascar sem açúcar)", melhorTrident.viaMarca === true && melhorTrident.melhor.codigo === "2106.90.50");

  const melhorHalls = window.NcmBusca.buscarMelhorNcmCompleto("HALLS SABORES");
  assert("'HALLS SABORES' resolve via marca (pastilha), não via homônimo de bala de arma", melhorHalls.viaMarca === true && melhorHalls.melhor.codigo === "1704.90.20");

  const melhorLaka = window.NcmBusca.buscarMelhorNcmCompleto("LAKA 20G");
  assert("'LAKA 20G' resolve via marca (chocolate branco)", melhorLaka.viaMarca === true && melhorLaka.melhor.codigo === "1704.90.10");

  const melhorDiamante = window.NcmBusca.buscarMelhorNcmCompleto("DIAMANTE NEGRO 90G");
  assert("'DIAMANTE NEGRO 90G' resolve via marca (chocolate em tablete)", melhorDiamante.viaMarca === true && melhorDiamante.melhor.codigo === "1806.32.10");

  // Regressão: "lata" (busca) não pode mais bater com "latão" (a tabela tem
  // um item de latão/bronze que só por acaso começa com as mesmas 4 letras)
  // — plural só é reconhecido por sufixo exato "+s"/"+es", não qualquer
  // prefixo de até 2 letras a mais.
  const buscaLata = window.NcmBusca.buscarNcmPorDescricao("lata");
  assert("Busca 'lata' NÃO inclui o item de latão (9111.20.10, falso positivo corrigido em 2026-09-14)", !buscaLata.some((r) => r.codigo === "9111.20.10"));

  // --- Serviço de alimentação sem NCM (js/servicos-sem-ncm.js) ---
  // Relato do usuário em 2026-09-16: "Refeição", "Marmitex" e "Porção" não
  // achavam nenhum NCM na aba "Descobrir NCM" — porque genuinamente não têm
  // um (são serviço, não mercadoria). Em vez de "nenhum candidato", o site
  // deve reconhecer isso e apontar pro regime real de bares/restaurantes
  // (art. 273 a 276 da LC 214/2025, cClassTrib 200047 já na tabela oficial).
  assert("buscarServicoSemNcm está exposta", typeof window.NcmBusca.buscarServicoSemNcm === "function");

  const servicoRefeicao = window.NcmBusca.buscarServicoSemNcm("Refeição executiva");
  assert("'Refeição executiva' é reconhecida como serviço de alimentação", !!servicoRefeicao && servicoRefeicao.operacaoId === "bares_restaurantes");

  const servicoMarmitex = window.NcmBusca.buscarServicoSemNcm("MARMITEX P");
  assert("'MARMITEX P' é reconhecida como serviço de alimentação", !!servicoMarmitex);

  const servicoPorcao = window.NcmBusca.buscarServicoSemNcm("Porção de batata frita");
  assert("'Porção de batata frita' é reconhecida como serviço de alimentação", !!servicoPorcao);

  const servicoInexistente = window.NcmBusca.buscarServicoSemNcm("água mineral");
  assertEqual("Termo comum de mercadoria (água mineral) NÃO aciona o reconhecimento de serviço", servicoInexistente, null);

  const melhorMarmitex = window.NcmBusca.buscarMelhorNcmCompleto("MARMITEX P");
  assertEqual("buscarMelhorNcmCompleto('MARMITEX P') não retorna NCM (melhor=null é o correto aqui, não uma falha)", melhorMarmitex.melhor, null);
  assert("buscarMelhorNcmCompleto('MARMITEX P') traz o detalhe do serviço em vez de só 'não encontrado'", !!melhorMarmitex.semNcmServico);

  const classificacaoBaresRestaurantes = window.Rules.classificarPorOperacao("bares_restaurantes", data);
  assertEqual("Operação 'bares_restaurantes' usa o código cClassTrib oficial 200047", classificacaoBaresRestaurantes.cClassTrib, "200047");
  assertEqual("Operação 'bares_restaurantes' tem redução de 40% (art. 275)", classificacaoBaresRestaurantes.percentualReducao, 40);
  assertEqual("Operação 'bares_restaurantes' usa CST 200", classificacaoBaresRestaurantes.cst, "200");

  // --- parseCSVDescricoes (js/csv.js) — usado pela busca de NCM em lote ---
  const descComCabecalho = window.CSVUtil.parseCSVDescricoes(["Produto", "Água mineral", "Cadeira de rodas"].join("\n"));
  assertEqual("parseCSVDescricoes descarta cabeçalho reconhecido ('Produto') e lê as 2 linhas de dados", descComCabecalho.length, 2);
  assertEqual("parseCSVDescricoes preserva o texto da descrição", descComCabecalho[0], "Água mineral");

  // Regressão: ao contrário de parseCSV (que usa "linha sem dígito = cabeçalho"
  // como heurística), aqui isso NÃO pode descartar a primeira linha de dados —
  // descrições de produto raramente têm dígito mesmo sendo dados de verdade.
  const descSemCabecalho = window.CSVUtil.parseCSVDescricoes(["Água mineral", "Cadeira de rodas"].join("\n"));
  assertEqual("parseCSVDescricoes sem cabeçalho reconhecível NÃO descarta a primeira linha (não é 'sem dígito = cabeçalho')", descSemCabecalho.length, 2);

  const descVazio = window.CSVUtil.parseCSVDescricoes("");
  assertEqual("parseCSVDescricoes com texto vazio retorna lista vazia (sem erro)", descVazio.length, 0);

  // --- Verificador de atualização automática (js/atualizador.js) ---
  // O código embutido (VERSAO_ATUAL) e o arquivo versao.json na raiz do
  // site precisam bater nesse teste de comparação — mesma ideia do teste
  // automático do Validador Sintegra que trava se installer.iss e main.py
  // não baterem, só que aqui é uma checagem de sanidade da lógica de
  // comparação em si, não dos dois números batendo (isso é responsabilidade
  // de quem publica uma nova versão, documentado no README).
  const AT = window.Atualizador;
  assert("Atualizador está exposto com VERSAO_ATUAL definida", !!AT && typeof AT.VERSAO_ATUAL === "string");

  assert("compararVersoes: versão do servidor maior (1.0.1 > 1.0.0) é detectada", AT.compararVersoes("1.0.1", "1.0.0") > 0);
  assert("compararVersoes: mesma versão não sinaliza atualização (1.0.0 == 1.0.0)", AT.compararVersoes("1.0.0", "1.0.0") === 0);
  assert("compararVersoes: versão do servidor menor NÃO sinaliza atualização (nunca sugere downgrade)", AT.compararVersoes("1.0.0", "1.0.1") < 0);

  // Regressão: comparação tem que ser numérica por partes, não como string
  // — como string, "1.2.10" < "1.2.9" (porque o caractere "1" < "9"), o que
  // faria uma atualização de verdade (10 > 9) não ser detectada.
  assert("compararVersoes compara partes numericamente: 1.2.10 é MAIOR que 1.2.9 (não string)", AT.compararVersoes("1.2.10", "1.2.9") > 0);
  assert("compararVersoes lida com números diferentes de segmentos (1.0 vs 1.0.1)", AT.compararVersoes("1.0.1", "1.0") > 0);
  assertEqual("compararVersoes trata segmento ausente como 0 (1.0 == 1.0.0)", AT.compararVersoes("1.0", "1.0.0"), 0);

  // --- Auth (js/auth.js) ---
  // Roda no mesmo localStorage do app de verdade (mesma origem da página
  // de testes) — por isso usa um e-mail claramente de teste e se garante
  // de apagar essa conta no final, passe ou falhe, pra não deixar lixo
  // misturado com contas reais de quem usa o site.
  if (window.Auth) {
    const AU = window.Auth;
    const EMAIL_TESTE = "teste-automatizado-tests-js@example.invalid";
    AU.removerConta(EMAIL_TESTE); // limpa resíduo de uma execução anterior que tenha falhado no meio

    assert("emailValido aceita e-mail bem formado", AU.emailValido("a@b.com"));
    assert("emailValido rejeita string sem @", !AU.emailValido("abc"));
    assert("emailValido rejeita e-mail sem domínio", !AU.emailValido("a@b"));

    try {
      const criacao1 = await AU.criarConta(EMAIL_TESTE, "senhaDeTeste123", "Fulano de Teste");
      assert("criarConta: primeira criação com e-mail novo funciona", criacao1.ok === true);

      const criacao2 = await AU.criarConta(EMAIL_TESTE, "outraSenha", "Outro Nome");
      assert("criarConta: e-mail duplicado é rejeitado", criacao2.ok === false);

      const loginCerto = await AU.autenticar(EMAIL_TESTE, "senhaDeTeste123");
      assert("autenticar: senha certa entra", loginCerto.ok === true);
      assertEqual("autenticar: devolve o nome cadastrado", loginCerto.nome, "Fulano de Teste");

      const loginErrado = await AU.autenticar(EMAIL_TESTE, "senhaErrada");
      assert("autenticar: senha errada não entra", loginErrado.ok === false);

      const loginInexistente = await AU.autenticar("ninguem-cadastrado@example.invalid", "qualquer");
      assert("autenticar: e-mail não cadastrado não entra (sem erro/exceção)", loginInexistente.ok === false);

      // E-mail é tratado sem diferenciar maiúsculas/minúsculas nem espaços
      // nas pontas — mesma conta, digitada de formas diferentes.
      const loginComVariacao = await AU.autenticar(`  ${EMAIL_TESTE.toUpperCase()}  `, "senhaDeTeste123");
      assert("autenticar: e-mail não é sensível a maiúsculas/espaços nas pontas", loginComVariacao.ok === true);

      // --- alterarNome ---
      const nomeOk = await AU.alterarNome(EMAIL_TESTE, "Fulano Renomeado");
      assert("alterarNome: funciona sem pedir senha", nomeOk.ok === true);
      const loginAposRenomear = await AU.autenticar(EMAIL_TESTE, "senhaDeTeste123");
      assertEqual("alterarNome: o novo nome aparece num login seguinte", loginAposRenomear.nome, "Fulano Renomeado");

      // --- alterarSenha ---
      const senhaErradaNaoMuda = await AU.alterarSenha(EMAIL_TESTE, "senhaTotalmenteErrada", "senhaNovaQualquer");
      assert("alterarSenha: senha atual errada é rejeitada", senhaErradaNaoMuda.ok === false);
      const senhaOk = await AU.alterarSenha(EMAIL_TESTE, "senhaDeTeste123", "senhaDeTesteNova456");
      assert("alterarSenha: com a senha atual certa, funciona", senhaOk.ok === true);
      const loginComSenhaAntiga = await AU.autenticar(EMAIL_TESTE, "senhaDeTeste123");
      assert("alterarSenha: a senha antiga para de funcionar", loginComSenhaAntiga.ok === false);
      const loginComSenhaNova = await AU.autenticar(EMAIL_TESTE, "senhaDeTesteNova456");
      assert("alterarSenha: a senha nova passa a funcionar", loginComSenhaNova.ok === true);

      // --- alterarEmail ---
      const EMAIL_TESTE_NOVO = "teste-automatizado-tests-js-novo@example.invalid";
      AU.removerConta(EMAIL_TESTE_NOVO); // limpa resíduo de uma execução anterior
      try {
        const emailSenhaErrada = await AU.alterarEmail(EMAIL_TESTE, EMAIL_TESTE_NOVO, "senhaErrada");
        assert("alterarEmail: rejeita com a senha atual errada", emailSenhaErrada.ok === false);

        const emailOk = await AU.alterarEmail(EMAIL_TESTE, EMAIL_TESTE_NOVO, "senhaDeTesteNova456");
        assert("alterarEmail: com a senha certa, funciona", emailOk.ok === true);

        const loginEmailAntigo = await AU.autenticar(EMAIL_TESTE, "senhaDeTesteNova456");
        assert("alterarEmail: o e-mail antigo para de existir", loginEmailAntigo.ok === false);

        const loginEmailNovo = await AU.autenticar(EMAIL_TESTE_NOVO, "senhaDeTesteNova456");
        assert("alterarEmail: o e-mail novo passa a funcionar, com a mesma senha", loginEmailNovo.ok === true);
        assertEqual("alterarEmail: o nome cadastrado é preservado na troca", loginEmailNovo.nome, "Fulano Renomeado");

        // Recria EMAIL_TESTE pra o `finally` externo (que tenta remover
        // EMAIL_TESTE) não precisar saber que essa conta "mudou de nome" no
        // meio do teste — mantém a limpeza simples e sempre no mesmo lugar.
        await AU.criarConta(EMAIL_TESTE, "irrelevante", "irrelevante");
      } finally {
        AU.removerConta(EMAIL_TESTE_NOVO);
      }
    } finally {
      AU.removerConta(EMAIL_TESTE);
    }

    // Sessão — usada pelas páginas protegidas (ver script inline no <head>
    // de index/lote/sobre.html) pra decidir se redireciona pra login.html.
    // Fica em sessionStorage (some ao fechar) por padrão, ou localStorage
    // (sobrevive fechar/abrir) só quando "lembrar" é true — caixa "Deseja
    // salvar seu login?" em login.html.
    AU.encerrarSessao();
    assertEqual("sessaoAtual: sem sessão ativa devolve null", AU.sessaoAtual(), null);

    AU.iniciarSessao("sessao-teste@example.invalid", "Sessão Teste"); // sem 3º argumento = não lembrar
    assertEqual("sessaoAtual: depois de iniciarSessao, devolve email/nome salvos", AU.sessaoAtual(), { email: "sessao-teste@example.invalid", nome: "Sessão Teste" });
    assert("iniciarSessao sem 'lembrar': vai pro sessionStorage, não localStorage", sessionStorage.getItem("cclasstrib-sessao") !== null && localStorage.getItem("cclasstrib-sessao") === null);
    assert("sessaoEstaLembrada(): false quando a sessão está só no sessionStorage", AU.sessaoEstaLembrada() === false);
    AU.encerrarSessao();
    assertEqual("encerrarSessao: limpa a sessão (volta a null)", AU.sessaoAtual(), null);

    AU.iniciarSessao("sessao-teste@example.invalid", "Sessão Teste", true); // lembrar = true
    assert("iniciarSessao com 'lembrar' true: vai pro localStorage, não sessionStorage", localStorage.getItem("cclasstrib-sessao") !== null && sessionStorage.getItem("cclasstrib-sessao") === null);
    assert("sessaoEstaLembrada(): true quando a sessão está no localStorage", AU.sessaoEstaLembrada() === true);
    assertEqual("sessaoAtual: lê certo de qualquer um dos dois (localStorage neste caso)", AU.sessaoAtual(), { email: "sessao-teste@example.invalid", nome: "Sessão Teste" });
    AU.encerrarSessao();
    assert("encerrarSessao: limpa dos dois lugares (localStorage e sessionStorage)", localStorage.getItem("cclasstrib-sessao") === null && sessionStorage.getItem("cclasstrib-sessao") === null);
  } else {
    assert("js/auth.js está incluído na página de testes", false);
  }

  // --- Render ---
  const ul = document.getElementById("results");
  results.forEach((r) => {
    const li = document.createElement("li");
    li.className = r.ok ? "pass" : "fail";
    li.textContent = (r.ok ? "✔ " : "✘ ") + r.desc;
    ul.appendChild(li);
  });
  document.getElementById("summary").innerHTML =
    `<strong>${passed} passaram, ${failed} falharam</strong> de ${results.length} testes.`;
  document.title = (failed === 0 ? "✔ OK — " : "✘ FALHOU — ") + document.title;
})();
