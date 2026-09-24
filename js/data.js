/*
 * Camada de dados — cClassTrib / IBS / CBS (LC 214/2025)
 *
 * FONTE PRIMÁRIA (Anexos/artigos/percentuais): texto oficial da Lei
 * Complementar nº 214, de 16 de janeiro de 2025, obtido em
 * https://www.planalto.gov.br/ccivil_03/leis/lcp/Lcp214.htm (domínio
 * público), extraído verbatim em 2026-09-12. Alterações posteriores
 * identificadas: Lei Complementar nº 227, de 2026 (revogou o Anexo XIV e
 * alterou os arts. 3º e 172, entre outros).
 *
 * FONTE PRIMÁRIA (código cClassTrib de 6 dígitos e CST): arquivo oficial
 * "cClassTrib 2026-06-22.xlsx" do Portal Nacional da NF-e (Informe Técnico
 * 2025.002), importado em js/cclasstrib-oficial.js. A ligação entre um item
 * de Anexo e seu código cClassTrib é feita em js/rules.js, cruzando o número
 * do Anexo e o percentual de redução com a tabela oficial.
 *
 * NOTA DE CORREÇÃO (2026-09-12): a primeira versão deste arquivo estimava os
 * artigos dos Anexos III, IV, V, VI, IX, X, XI, XII e XIII por dedução
 * sequencial (sem confirmação direta no texto da lei) — dois deles (XII e
 * XIII) usavam números fictícios ("146-A"/"146-B") que não existem na LC
 * 214/2025. Após obter o arquivo oficial de cClassTrib, todos os artigos
 * abaixo foram corrigidos para os valores reais confirmados na tabela.
 * Vários Anexos (IV, V, VI, IX) têm DOIS tratamentos possíveis conforme o
 * adquirente — o percentual "geral" está no campo principal, e a variante de
 * alíquota zero para compras públicas/entidades CEBAS está em
 * `tratamentoAlternativo`.
 */

window.CCLASSTRIB_DATA = {
  meta: {
    fonte: "Lei Complementar nº 214, de 16 de janeiro de 2025",
    fonteUrl: "https://www.planalto.gov.br/ccivil_03/leis/lcp/Lcp214.htm",
    dataExtracao: "2026-09-12",
    alteracoesConhecidas: [
      "Lei Complementar nº 227, de 2026 — revogou o Anexo XIV (medicamentos) e alterou o art. 172 (combustíveis monofásicos), entre outros dispositivos."
    ],
    avisoRegulamentacao:
      "A Reforma Tributária (LC 214/2025) está em fase de regulamentação. Novas leis complementares, resoluções do Comitê Gestor do IBS e atos da Receita Federal podem alterar Anexos, alíquotas e a própria tabela cClassTrib a qualquer momento. Consulte sempre as fontes oficiais antes de tomar decisões fiscais.",
    aliquotaReferenciaObs:
      "A LC 214/2025 não fixa um percentual único de alíquota padrão do IBS+CBS — ela será definida por resolução do Senado Federal, nos termos da EC 132/2023. Para fins ilustrativos de estimativa neste site, usamos um valor de referência configurável (ver aliquotaReferenciaEstimada), que NÃO é um valor legal e pode divergir do que vier a ser fixado.",
    aliquotaReferenciaEstimada: 26.5
  },

  // Tratamentos possíveis e sua exibição (cor semântica)
  tratamentos: {
    zero: { label: "Alíquota zero", cor: "verde" },
    reduzida: { label: "Alíquota reduzida", cor: "amarelo" },
    integral: { label: "Tributação integral", cor: "vermelho" },
    imune: { label: "Imunidade (não incidência)", cor: "verde" },
    suspensa: { label: "Suspensão condicionada", cor: "amarelo" },
    seletivo: { label: "Imposto Seletivo (adicional)", cor: "vermelho" },
    pendente: { label: "Sujeito a regulamentação específica", cor: "amarelo" }
  },

  anexos: [
    {
      id: "I",
      titulo: "Produtos destinados à alimentação humana submetidos à redução a zero das alíquotas do IBS e da CBS (Cesta Básica Nacional)",
      artigo: "125",
      percentualReducao: 100,
      tratamento: "zero",
      observacao: "Exclusive produtos hortícolas, frutas e ovos, relacionados no Anexo XV.",
      vigente: true,
      itens: [
        { item: "1", descricao: "Arroz das subposições 1006.20 e 1006.30 e do código 1006.40.00 da NCM/SH", ncm: ["1006.20", "1006.30", "1006.40.00"] },
        { item: "2", descricao: "Leite, em conformidade com os requisitos da legislação específica relativos ao consumo direto pela população, classificado nos códigos 0401.10.10, 0401.10.90, 0401.20.10, 0401.20.90, 0401.40.10 e 0401.50.10 da NCM/SH", ncm: ["0401.10.10", "0401.10.90", "0401.20.10", "0401.20.90", "0401.40.10", "0401.50.10"] },
        { item: "3", descricao: "Leite em pó, em conformidade com os requisitos da legislação específica, classificado nos códigos 0402.10.10, 0402.10.90, 0402.21.10, 0402.21.20, 0402.29.10 e 0402.29.20 da NCM/SH", ncm: ["0402.10.10", "0402.10.90", "0402.21.10", "0402.21.20", "0402.29.10", "0402.29.20"] },
        { item: "4", descricao: "Fórmulas infantis, em conformidade com os requisitos da legislação específica, classificadas nos códigos 1901.10.10, 1901.10.90 e 2106.90.90 da NCM/SH", ncm: ["1901.10.10", "1901.10.90", "2106.90.90"] },
        { item: "5", descricao: "Manteiga do código 0405.10.00 da NCM/SH", ncm: ["0405.10.00"] },
        { item: "6", descricao: "Margarina do código 1517.10.00 da NCM/SH", ncm: ["1517.10.00"] },
        { item: "7", descricao: "Feijões dos códigos 0713.33.19, 0713.33.29, 0713.33.99 e 0713.35.90 da NCM/SH", ncm: ["0713.33.19", "0713.33.29", "0713.33.99", "0713.35.90"] },
        { item: "8", descricao: "Café da posição 09.01 e da subposição 2101.1, ambos da NCM/SH", ncm: ["09.01", "2101.1"] },
        { item: "9", descricao: "Óleo de babaçu do código 1513.21.20 da NCM/SH, em conformidade com os requisitos da legislação específica relativos ao consumo como alimento", ncm: ["1513.21.20"] },
        { item: "10", descricao: "Farinha de mandioca classificada no código 1106.20.00 da NCM/SH e tapioca e seus sucedâneos do código 1903.00.00 da NCM/SH", ncm: ["1106.20.00", "1903.00.00"] },
        { item: "11", descricao: "Farinha, grumos e sêmolas, de milho, dos códigos 1102.20.00 e 1103.13.00 da NCM", ncm: ["1102.20.00", "1103.13.00"] },
        { item: "12", descricao: "Grãos de milho classificados no código 1104.19.00 e do código 1104.23.00 da NCM/SH", ncm: ["1104.19.00", "1104.23.00"] },
        { item: "13", descricao: "Farinha de trigo do código 1101.00.10 da NCM/SH", ncm: ["1101.00.10"] },
        { item: "14", descricao: "Açúcar classificado nos códigos 1701.14.00 e 1701.99.00 da NCM/SH", ncm: ["1701.14.00", "1701.99.00"] },
        { item: "15", descricao: "Massas alimentícias da subposição 1902.1 da NCM/SH", ncm: ["1902.1"] },
        { item: "16", descricao: "Pão comumente denominado pão francês, classificado no código 1905.90.90 da NCM/SH, e a pré-mistura ou massa para sua preparação, dos códigos 1901.20.10 e 1901.20.90 da NCM/SH", ncm: ["1905.90.90", "1901.20.10", "1901.20.90"] },
        { item: "17", descricao: "Grãos de aveia dos códigos 1104.12.00 e 1104.22.00 da NCM/SH", ncm: ["1104.12.00", "1104.22.00"] },
        { item: "18", descricao: "Farinha de aveia classificada no código 1102.90.00 da NCM/SH", ncm: ["1102.90.00"] },
        { item: "19", descricao: "Carnes bovina, suína, ovina, caprina e de aves e produtos de origem animal (exceto foies gras), conforme códigos, subposições e posições específicas: 02.01, 02.02, 0206.10.00, 0206.2, 0210.20.00, 02.03, 0206.30.00, 0206.4, 0209.10, 0210.1, 02.04, 0210.99.20, 0210.99.90, 0206.80.00, 0206.90.00, 02.07, 0209.90.00, 0210.99.1 (exceto 0207.43.00 e 0207.53.00)", ncm: ["02.01", "02.02", "0206.10.00", "0206.2", "0210.20.00", "02.03", "0206.30.00", "0206.4", "0209.10", "0210.1", "02.04", "0210.99.20", "0210.99.90", "0206.80.00", "0206.90.00", "02.07", "0209.90.00", "0210.99.1"] },
        { item: "20", descricao: "Peixes e carnes de peixes (exceto salmonídeos, atuns, bacalhaus, hadoque, saithe e ovas e outros subprodutos), posições 03.02, 03.03 e 03.04 da NCM/SH com exceções específicas", ncm: ["03.02", "03.03", "03.04"] },
        { item: "21", descricao: "Queijos tipo mozarela, minas, prato, queijo de coalho, ricota, requeijão, queijo provolone, queijo parmesão, queijo fresco não maturado e queijo do reino classificados nos códigos 0406.10.10, 0406.10.90, 0406.20.00, 0406.90.10, 0406.90.20 e 0406.90.30 da NCM/SH", ncm: ["0406.10.10", "0406.10.90", "0406.20.00", "0406.90.10", "0406.90.20", "0406.90.30"] },
        { item: "22", descricao: "Sal em conformidade com os requisitos da legislação específica relativos ao teor de iodo, classificado nos códigos 2501.00.20 e 2501.00.90 da NCM/SH", ncm: ["2501.00.20", "2501.00.90"] },
        { item: "23", descricao: "Mate da posição 09.03 da NCM/SH", ncm: ["09.03"] },
        { item: "24", descricao: "Farinha com baixo teor de proteína para pessoas com aminoacidopatias, acidemias e defeitos do ciclo da uréia da NCM 1901.90.90", ncm: ["1901.90.90"] },
        { item: "25", descricao: "Massas com baixo teor de proteína para pessoas com aminoacidopatias, acidemias e defeitos do ciclo da uréia da NCM 1902.19.00", ncm: ["1902.19.00"] },
        { item: "26", descricao: "Fórmulas Dietoterápicas para Erros Inatos do Metabolismo da NCM 2106.90.90", ncm: ["2106.90.90"] }
      ]
    },

    {
      id: "II",
      titulo: "Serviços de Educação submetidos à redução de 60% das alíquotas do IBS e da CBS",
      artigo: "129",
      percentualReducao: 60,
      tratamento: "reduzida",
      vigente: true,
      itens: [
        { item: "1", descricao: "Ensino Infantil, inclusive creche e pré-escola", nbs: ["1.2201.1"] },
        { item: "2", descricao: "Ensino Fundamental", nbs: ["1.2201.20.00"] },
        { item: "3", descricao: "Ensino Médio", nbs: ["1.2201.30.00"] },
        { item: "4", descricao: "Ensino Técnico de Nível Médio", nbs: ["1.2202.00.00"] },
        { item: "5", descricao: "Ensino para jovens e adultos destinado àqueles que não tiveram acesso ou continuidade de estudos no ensino fundamental e médio na idade própria", nbs: ["1.2203"] },
        { item: "6", descricao: "Ensino Superior, compreendidos os cursos e programas de graduação, pós-graduação, de extensão e cursos sequenciais", nbs: ["1.2204"] },
        { item: "7", descricao: "Ensino de sistemas linguísticos de natureza visomotora e de escrita tátil", nbs: ["1.2205.13.00"] },
        { item: "8", descricao: "Ensino de línguas nativas de povos originários", nbs: ["1.2205.13.00"] },
        { item: "9", descricao: "Educação especial destinada a pessoas com deficiência, transtornos globais do desenvolvimento e altas habilidades ou superdotação, de modo isolado ou agregado a qualquer das etapas de educação tratadas neste Anexo", nbs: [] }
      ]
    },

    {
      id: "III",
      titulo: "Serviços de Saúde submetidos à redução de 60% das alíquotas do IBS e da CBS",
      artigo: "130",
      percentualReducao: 60,
      tratamento: "reduzida",
      vigente: true,
      itens: [
        { item: "1", descricao: "Serviços cirúrgicos", nbs: ["1.2301.11.00"] },
        { item: "2", descricao: "Serviços ginecológicos e obstétricos", nbs: ["1.2301.12.00"] },
        { item: "3", descricao: "Serviços psiquiátricos", nbs: ["1.2301.13.00"] },
        { item: "4", descricao: "Serviços prestados em Unidades de Terapia Intensiva", nbs: ["1.2301.14.00"] },
        { item: "5", descricao: "Serviços de atendimento de urgência", nbs: ["1.2301.15.00"] },
        { item: "6", descricao: "Serviços hospitalares não classificados em subposições anteriores", nbs: ["1.2301.19.00"] },
        { item: "7", descricao: "Serviços de clínica médica", nbs: ["1.2301.21.00"] },
        { item: "8", descricao: "Serviços médicos especializados", nbs: ["1.2301.22.00"] },
        { item: "9", descricao: "Serviços odontológicos", nbs: ["1.2301.23.00"] },
        { item: "10", descricao: "Serviços de enfermagem", nbs: ["1.2301.91.00"] },
        { item: "11", descricao: "Serviços de fisioterapia", nbs: ["1.2301.92.00"] },
        { item: "12", descricao: "Serviços laboratoriais", nbs: ["1.2301.93.00"] },
        { item: "13", descricao: "Serviços de diagnóstico por imagem", nbs: ["1.2301.94.00"] },
        { item: "14", descricao: "Serviços de bancos de material biológico humano", nbs: ["1.2301.95.00"] },
        { item: "15", descricao: "Serviços de ambulância", nbs: ["1.2301.96.00"] },
        { item: "16", descricao: "Serviços de assistência ao parto e pós-parto", nbs: ["1.2301.97.00"] },
        { item: "17", descricao: "Serviços de psicologia", nbs: ["1.2301.98.00"] },
        { item: "18", descricao: "Serviços de vigilância sanitária", nbs: ["1.2301.99.00"] },
        { item: "19", descricao: "Serviços de epidemiologia", nbs: ["1.2301.99.00"] },
        { item: "20", descricao: "Serviços de vacinação", nbs: ["1.2301.99.00"] },
        { item: "21", descricao: "Serviços de fonoaudiologia", nbs: ["1.2301.99.00"] },
        { item: "22", descricao: "Serviços de nutrição", nbs: ["1.2301.99.00"] },
        { item: "23", descricao: "Serviços de optometria", nbs: ["1.2301.99.00"] },
        { item: "24", descricao: "Serviços de instrumentação cirúrgica", nbs: ["1.2301.99.00"] },
        { item: "25", descricao: "Serviços de biomedicina", nbs: ["1.2301.99.00"] },
        { item: "26", descricao: "Serviços farmacêuticos", nbs: ["1.2301.99.00"] },
        { item: "27", descricao: "Serviços de cuidado e assistência a idosos e pessoas com deficiência em unidades de acolhimento", nbs: ["1.2302"] },
        { item: "28", descricao: "Serviços domiciliares de apoio a pessoas adultas, idosas, crianças, adolescentes, pessoas com transtornos mentais e com deficiências", nbs: ["1.2301.99.00"] },
        { item: "29", descricao: "Serviços de esterilização", nbs: ["1.2301.99.00"] },
        { item: "30", descricao: "Serviços funerários, de cremação e de embalsamamento", nbs: ["1.2603.00.00"] }
      ]
    },

    {
      id: "IV",
      titulo: "Dispositivos Médicos submetidos à redução de 60% das alíquotas do IBS e da CBS",
      artigo: "131",
      percentualReducao: 60,
      tratamento: "reduzida",
      vigente: true,
      tratamentoAlternativo: {
        percentualReducao: 100,
        tratamento: "zero",
        artigo: "144, II",
        condicao: "quando adquiridos por órgãos da administração pública direta, autarquias, fundações públicas, ou entidades de saúde imunes ao IBS/CBS com CEBAS"
      },
      itens: [
        { item: "1", descricao: "Bolsa para drenagem", ncm: ["3926.90.30"] },
        { item: "2", descricao: "Sistema para drenagem com conjunto intermediário para medição contínua da diurese", ncm: ["9018.90.99"] },
        { item: "3", descricao: "Chapas e filmes para raios-X, sensibilizados em uma face", ncm: ["3701.10.10"] },
        { item: "4", descricao: "Cimentos para reconstituição óssea", ncm: ["3006.40.20"] },
        { item: "5", descricao: "Substitutos de enxerto ósseo", ncm: ["3004.90.99"] },
        { item: "6", descricao: "Coletor para unidade de drenagem externa", ncm: ["3926.90.40"] },
        { item: "7", descricao: "Conector completo com tampa", ncm: ["3917.40"] },
        { item: "8", descricao: "Conector em Y", ncm: ["3917.40"] },
        { item: "9", descricao: "Conjuntos de troca e concentrados polieletrolíticos para diálise", ncm: ["3004.90.99"] },
        { item: "10", descricao: "Conjunto para autotransfusão", ncm: ["9018.90.10"] },
        { item: "11", descricao: "Conjunto para hidrocefalia de baixo perfil", ncm: ["9021.90.19"] },
        { item: "12", descricao: "Conjunto para hidrocefalia standard", ncm: ["9021.90.19", "9021.90.80"] },
        { item: "13", descricao: "Eletrodo endocárdico definitivo", ncm: ["9021.90.91"] },
        { item: "14", descricao: "Eletrodo epicárdico definitivo", ncm: ["9021.90.91"] },
        { item: "15", descricao: "Eletrodo para marcapasso temporário endocárdico", ncm: ["9021.90.91"] },
        { item: "16", descricao: "Eletrodo para marcapasso temporário epicárdico", ncm: ["9021.90.91"] },
        { item: "17", descricao: "Espaçador de tendão", ncm: ["9021.90.19"] },
        { item: "18", descricao: "Filmes especiais para raios-X sensibilizados em ambas as faces", ncm: ["3702.10.20"] },
        { item: "19", descricao: "Filmes especiais para raios-X sensibilizados em uma face", ncm: ["3702.10.10"] },
        { item: "20", descricao: "Filtro de linha arterial e venoso", ncm: ["8421.29.90"] },
        { item: "21", descricao: "Filtro de sangue arterial e venoso para recirculação", ncm: ["8421.29.90"] },
        { item: "22", descricao: "Filtro para cardioplegia", ncm: ["8421.29.90"] },
        { item: "23", descricao: "Categutes esterilizados, materiais esterilizados semelhantes para suturas cirúrgicas, adesivos esterilizados para tecidos orgânicos, laminárias esterilizadas, hemostáticos absorvíveis esterilizados e barreiras antiaderentes esterilizadas", ncm: ["3006.10"] },
        { item: "24", descricao: "Hemoconcentrador para circulação extracorpórea", ncm: ["9018.90.40"] },
        { item: "25", descricao: "Hemodialisador capilar", ncm: ["8421.29.11"] },
        { item: "26", descricao: "Marcapasso cardíaco câmara dupla", ncm: ["9021.50.00"] },
        { item: "27", descricao: "Marcapasso cardíaco multiprogramável com telemetria", ncm: ["9021.50.00"] },
        { item: "28", descricao: "Outras chapas e filmes para raios-X", ncm: ["3701.10.29"] },
        { item: "29", descricao: "Oxigenador de bolha com tubos para circulação extracorpórea", ncm: ["9018.90.99"] },
        { item: "30", descricao: "Oxigenador de membrana com tubos para circulação extracorpórea", ncm: ["9018.90.99"] },
        { item: "31", descricao: "Reservatório de cardiotomia", ncm: ["9018.90.99"] },
        { item: "32", descricao: "Reservatório para cardioplegia com tubo sem filtro", ncm: ["9018.90.99"] },
        { item: "33", descricao: "Rins artificiais", ncm: ["9018.90.40"] },
        { item: "34", descricao: "Shunt lombo-peritonal", ncm: ["9021.90.19"] },
        { item: "35", descricao: "Substituto temporário de pele (biológica/sintética) (por cm2)", ncm: ["3005.90.90"] },
        { item: "36", descricao: "Tela inorgânica", ncm: ["3006.10.90"] },
        { item: "37", descricao: "Válvula para hidrocefalia", ncm: ["9021.90.19", "9021.90.89"] },
        { item: "38", descricao: "Válvula para tratamento de ascite", ncm: ["9021.90.19"] },
        { item: "39", descricao: "Fonte de irídio 192", ncm: ["2844.43.90"] },
        { item: "40", descricao: "Stent vascular", ncm: ["9021.90.12"] },
        { item: "41", descricao: "Reprocessador de filtros utilizados em hemodiálise", ncm: ["8479.89.99"] },
        { item: "42", descricao: "Implantes osseointegráveis (parafuso) e componentes destinados a sustentar próteses dentárias", ncm: ["9021.29.00", "9021.10.10", "9021.10.20"] },
        { item: "43", descricao: "Cardiodesfibrilador implantável", ncm: ["9021.90.11"] },
        { item: "44", descricao: "Espiral para embolização", ncm: ["9021.90.12"] },
        { item: "45", descricao: "Imunoglobulina anti-Rh", ncm: ["3002.12.21"] },
        { item: "46", descricao: "Outras imunoglobulinas séricas", ncm: ["3002.12.22"] },
        { item: "47", descricao: "Concentrado de fator VIII", ncm: ["3002.12.23"] },
        { item: "48", descricao: "Outras frações do sangue, exceto medicamentos, imunoglobulinas, fator VIII e soroalbumina em gel para reagentes de diagnóstico", ncm: ["3002.12.21", "3002.12.29"] },
        { item: "49", descricao: "Reagentes de diagnóstico ou de laboratório em qualquer suporte, exceto os da posição 30.06; materiais de referência certificados", ncm: ["3822.1"] },
        { item: "50", descricao: "Reagentes de diagnóstico à base de somatoliberina para administração ao paciente", ncm: ["3006.30.21"] },
        { item: "51", descricao: "Produtos para obturação dentária, exceto cimentos", ncm: ["3006.40.12"] },
        { item: "52", descricao: "Preparações em gel para uso como lubrificante em intervenções cirúrgicas/exames médicos ou agente de ligação com instrumentos médicos", ncm: ["3006.70.00"] },
        { item: "53", descricao: "Bolsas para uso em colostomia, ileostomia e urostomia", ncm: ["3006.91.10"] },
        { item: "54", descricao: "Equipamentos identificáveis para ostomia, exceto bolsas de colostomia/ileostomia/urostomia", ncm: ["3006.91.90"] },
        { item: "55", descricao: "Bolsas para uso em medicina (hemodiálise e usos semelhantes)", ncm: ["3926.90.30"] },
        { item: "56", descricao: "Artigos exclusivamente de laboratório de análises clínicas", ncm: ["3926.90.40"] },
        { item: "57", descricao: "Acessórios de plástico do tipo utilizado em linhas de sangue para hemodiálise (obturadores, clamps, clipes e similares)", ncm: ["3926.90.50"] },
        { item: "58", descricao: "Luvas cirúrgicas e luvas de procedimento", ncm: ["4015.1"] },
        { item: "59", descricao: "Seringas, mesmo com agulhas", ncm: ["9018.31"] },
        { item: "60", descricao: "Agulhas tubulares de metal e agulhas para suturas", ncm: ["9018.32"] },
        { item: "61", descricao: "Agulhas, exceto as de metal e as para suturas", ncm: ["9018.39.10"] },
        { item: "62", descricao: "Sondas, cateteres e cânulas, individualmente ou em conjunto", ncm: ["9018.39.2"] },
        { item: "63", descricao: "Lancetas para vacinação e cautérios", ncm: ["9018.39.30"] },
        { item: "64", descricao: "Instrumentos semelhantes a seringas, a agulhas, a cateteres e a cânulas", ncm: ["9018.39.9"] },
        { item: "65", descricao: "Brocas para odontologia", ncm: ["9018.49.1"] },
        { item: "66", descricao: "Limas", ncm: ["9018.49.20"] },
        { item: "67", descricao: "Grampos e clipes, seus aplicadores e extratores", ncm: ["9018.90.95"] },
        { item: "68", descricao: "Outros instrumentos e aparelhos para medicina, cirurgia e odontologia, excluídas seringas e agulhas", ncm: ["9018.39.99", "9018.90.99"] },
        { item: "69", descricao: "Mesas de operação e para exames, camas hospitalares e de uso clínico", ncm: ["9402.90"] },
        { item: "70", descricao: "Fotocoagulador a laser", ncm: ["9018.20.10"] },
        { item: "71", descricao: "Bisturi elétrico", ncm: ["9018.90.21"] },
        { item: "72", descricao: "Aparelho de anestesia com monitor multiparâmetros", ncm: ["9018.90.99"] },
        { item: "73", descricao: "Autoclave", ncm: ["8419.81.10"] },
        { item: "74", descricao: "Retinógrafo", ncm: ["9018.50.90"] },
        { item: "75", descricao: "Meios de cultura", ncm: ["3821.00.00"] },
        { item: "76", descricao: "Termocicladores utilizados em diagnóstico e na pesquisa científica", ncm: ["8419.89.99"] },
        { item: "77", descricao: "Partes e peças de termocicladores", ncm: ["8419.90.40"] },
        { item: "78", descricao: "Pipetadores laboratoriais para diagnóstico e pesquisa científica", ncm: ["8479.89.12"] },
        { item: "79", descricao: "Cromatógrafo de fase líquida", ncm: ["9027.20.12"] },
        { item: "80", descricao: "Sequenciadores automáticos de ADN mediante eletroforese capilar", ncm: ["9027.20.21"] },
        { item: "81", descricao: "Aparelhos de eletroforese para diagnóstico e pesquisa científica", ncm: ["9027.20.29"] },
        { item: "82", descricao: "Analisadores por espectrofotometria para diagnóstico e pesquisa científica", ncm: ["9027.30"] },
        { item: "83", descricao: "Analisadores por fotometria para diagnóstico e pesquisa científica", ncm: ["9027.50.20"] },
        { item: "84", descricao: "Citômetro de fluxo", ncm: ["9027.50.50"] },
        { item: "85", descricao: "Analisadores por radiações ópticas para diagnóstico e pesquisa científica", ncm: ["9027.50.90"] },
        { item: "86", descricao: "Outros analisadores para diagnóstico e pesquisa científica", ncm: ["9027.89.99"] },
        { item: "87", descricao: "Espectrômetro de massa", ncm: ["9027.81.00"] },
        { item: "88", descricao: "Outros analisadores para diagnóstico", ncm: ["9027.89.99"] },
        { item: "89", descricao: "Micrótomo", ncm: ["9027.90.10"] },
        { item: "90", descricao: "Partes e peças de equipamentos analisadores laboratoriais", ncm: ["9027.90.9"] },
        { item: "91", descricao: "Preservativo", ncm: ["4014.10.00"] },
        { item: "92", descricao: "Dispositivo intrauterino (DIU)", ncm: ["9018.90.99"] },
        { item: "93", descricao: "Substância para conservação de órgãos e tecidos", ncm: ["3824.99.89"] },
        { item: "94", descricao: "Introdutor de punção para implante de eletrodo endocárdico", ncm: ["9021.90.91"] },
        { item: "95", descricao: "Enxerto tubular de politetrafluoretileno - PTFE (por cm2)", ncm: ["9021.90.99"] },
        { item: "96", descricao: "Enxerto arterial e venoso tubular inorgânico", ncm: ["9021.90.99"] },
        { item: "97", descricao: "Botão para crânio", ncm: ["9021.90.99"] },
        { item: "98", descricao: "Guia metálico para introdução de cateter duplo lumen", ncm: ["9018.39.29"] },
        { item: "99", descricao: "Dilatador para implante de cateter duplo lumen", ncm: ["9018.39.29"] },
        { item: "100", descricao: "Guia de troca para angioplastia", ncm: ["9018.39.29"] },
        { item: "101", descricao: "Introdutor para cateter com e sem válvula", ncm: ["9018.39.29"] },
        { item: "102", descricao: "Kit cânula", ncm: ["9018.39.99", "9018.39.91"] },
        { item: "103", descricao: "Dreno para sucção", ncm: ["9018.39.29"] },
        { item: "104", descricao: "Sistema de drenagem mediastinal", ncm: ["9018.39.29"] },
        { item: "105", descricao: "Conjunto descartável de balão intra-aórtico", ncm: ["9018.90.99"] }
      ]
    },

    {
      id: "V",
      titulo: "Dispositivos de Acessibilidade próprios para pessoas com deficiência submetidos à redução de 60% das alíquotas do IBS e da CBS",
      artigo: "132",
      percentualReducao: 60,
      tratamento: "reduzida",
      vigente: true,
      tratamentoAlternativo: {
        percentualReducao: 100,
        tratamento: "zero",
        artigo: "145, II",
        condicao: "quando adquiridos por órgãos da administração pública direta, autarquias, fundações públicas, ou entidades de saúde imunes ao IBS/CBS com CEBAS"
      },
      itens: [
        { item: "1.1", descricao: "Comando de embreagem manual, suas partes e acessórios (para veículos de PcD)", ncm: ["8708.99.10"] },
        { item: "1.2", descricao: "Comando de freio manual, suas partes e acessórios", ncm: ["8708.99.10"] },
        { item: "1.3", descricao: "Comando de acelerador manual, suas partes e acessórios", ncm: ["8708.99.10"] },
        { item: "1.4", descricao: "Inversão do pedal do acelerador, suas partes e acessórios", ncm: ["8708.99.10"] },
        { item: "1.5", descricao: "Prolongamento de pedais, suas partes e acessórios", ncm: ["8708.99.10"] },
        { item: "1.6", descricao: "Empunhadura, suas partes e acessórios", ncm: ["8708.29.99"] },
        { item: "1.7", descricao: "Servo acionadores de volante, suas partes e acessórios", ncm: ["8708.99.10"] },
        { item: "1.8", descricao: "Deslocamento de comandos do painel, suas partes e acessórios", ncm: ["8708.29.99"] },
        { item: "1.9", descricao: "Plataforma giratória para deslocamento giratório do assento de veículo, suas partes e acessórios", ncm: ["8708.29.99"] },
        { item: "1.10", descricao: "Trilho elétrico para deslocamento do assento dianteiro, suas partes e acessórios", ncm: ["8708.29.99"] },
        { item: "1.11", descricao: "Plataforma de elevação para cadeira de rodas, manual, eletro-hidráulica ou eletromecânica", ncm: ["8428.90.90"] },
        { item: "1.12", descricao: "Rampa para cadeira de rodas, suas partes e acessórios", ncm: ["8708.29.99"] },
        { item: "1.13", descricao: "Guincho para transportar cadeira de rodas", ncm: ["8425.31.10"] },
        { item: "2.1", descricao: "Bengala inteiriça, dobrável ou telescópica, com ponteira de náilon", ncm: ["6602.00.00"] },
        { item: "2.2", descricao: "Relógio em braille, com sintetizador de voz e mostrador ampliado", ncm: ["9102.11.10", "9102.11.90", "9102.91.00"] },
        { item: "2.3", descricao: "Termômetro digital com sistema de voz", ncm: ["9025.19.90"] },
        { item: "2.4", descricao: "Calculadora digital com sistema de voz", ncm: ["8470.10.00", "8470.29.00"] },
        { item: "2.5", descricao: "Agenda eletrônica com teclado em braille, com ou sem sintetizador de voz", ncm: ["8543.70.99"] },
        { item: "2.6", descricao: "Reglete para escrita em braille", ncm: ["9017.20.00"] },
        { item: "2.7", descricao: "Display braille e teclado em braille para uso em microcomputador", ncm: ["8471.60.90"] },
        { item: "2.8", descricao: "Máquina de escrever para escrita em braille, manual ou elétrica", ncm: ["8472.90.99"] },
        { item: "2.9", descricao: "Impressora de caracteres em braille para uso com microcomputadores", ncm: ["8443.32.22"] },
        { item: "2.10", descricao: "Equipamento sintetizador para reprodução em voz de sinais gerados por microcomputadores (leitores de tela)", ncm: ["8471.80.00"] },
        { item: "3.1", descricao: "Aparelho telefônico com teclado alfanumérico e visor luminoso (TDD/TTY)", ncm: ["8517.1"] },
        { item: "3.2", descricao: "Relógio despertador vibratório e/ou luminoso", ncm: ["9103.10.00", "9105.11.00"] },
        { item: "3.3", descricao: "Unidades de entrada de dados tipo mouse controláveis pelo movimento dos olhos para deficientes", ncm: ["8471.60.53"] }
      ]
    },

    {
      id: "VI",
      titulo: "Composições para Nutrição Enteral ou Parenteral e composições especiais e fórmulas nutricionais para pessoas com erros inatos do metabolismo, submetidas à redução de 60% das alíquotas do IBS e da CBS",
      artigo: "133, § 1º",
      percentualReducao: 60,
      tratamento: "reduzida",
      vigente: true,
      tratamentoAlternativo: {
        percentualReducao: 100,
        tratamento: "zero",
        artigo: "146, § 2º",
        condicao: "quando adquiridas por órgãos da administração pública direta, autarquias ou fundações públicas"
      },
      observacao: "Lista de 81 insumos/matérias-primas farmacêuticas usadas em composições de nutrição enteral/parenteral. Consulte o texto oficial do Anexo VI para a lista completa item a item; abaixo os principais grupos.",
      itens: [
        { item: "8", descricao: "Ácido ascórbico", ncm: ["2936.27.10"] },
        { item: "15", descricao: "Água para injeção", ncm: ["2002.10.00"] },
        { item: "18", descricao: "Albumina humana", ncm: ["3002.12.36"] },
        { item: "19", descricao: "Arginina", ncm: ["2925.29.19"] },
        { item: "30", descricao: "Cloreto de sódio", ncm: ["2501.00.90"] },
        { item: "39", descricao: "Fórmula para dieta isenta de fenilalanina", ncm: ["2106.90.90"] },
        { item: "54", descricao: "Frutose", ncm: ["1702.50.00"] },
        { item: "58", descricao: "Glicose", ncm: ["1702.30.11"] },
        { item: "66", descricao: "Lisina", ncm: ["2922.41.10"] },
        { item: "81", descricao: "Triglicerídeos de cadeia média", ncm: ["1513.19.00", "1513.29.11"] }
      ]
    },

    {
      id: "VII",
      titulo: "Alimentos destinados ao consumo humano submetidos à redução de 60% das alíquotas do IBS e da CBS",
      artigo: "135",
      percentualReducao: 60,
      tratamento: "reduzida",
      vigente: true,
      itens: [
        { item: "1", descricao: "Crustáceos (exceto lagostas e lagostim) e moluscos, códigos e subposições 0306.1, 0306.3 (com exceções) e 0307.31.00, 0307.32.00, 0307.42.00, 0307.43, 0307.51.00, 0307.52.00, 0307.91.00, 0307.92.00", ncm: ["0306.1", "0306.3", "0307.31.00", "0307.32.00", "0307.42.00", "0307.43", "0307.51.00", "0307.52.00", "0307.91.00", "0307.92.00"] },
        { item: "2", descricao: "Leite fermentado, bebidas e compostos lácteos, códigos 0403.20.00, 0403.90.00 e 2202.99.00 da NCM/SH", ncm: ["0403.20.00", "0403.90.00", "2202.99.00"] },
        { item: "3", descricao: "Mel natural do código 0409.00.00 da NCM/SH", ncm: ["0409.00.00"] },
        { item: "4", descricao: "Farinha das posições 1101.00, 11.02, 11.05, 11.06 e 12.08 da NCM/SH; ressalvados os produtos relacionados no Anexo I", ncm: ["1101.00", "11.02", "11.05", "11.06", "12.08"] },
        { item: "5", descricao: "Grumos e sêmolas de cereais dos códigos 1103.11.00 e 1103.19.00 da NCM/SH; ressalvados os produtos relacionados no Anexo I", ncm: ["1103.11.00", "1103.19.00"] },
        { item: "6", descricao: "Grãos de cereais das subposições 1104.1 e 1104.2 da NCM/SH; ressalvados os produtos relacionados no Anexo I", ncm: ["1104.1", "1104.2"] },
        { item: "7", descricao: "Amido de milho do código 1108.12.00 da NCM/SH", ncm: ["1108.12.00"] },
        { item: "8", descricao: "Óleos de soja, de milho, canola e demais óleos vegetais, subposição 1507.90 e posições 15.08, 15.11, 15.12, 15.13, 15.14 e 15.15 da NCM/SH", ncm: ["1507.90", "15.08", "15.11", "15.12", "15.13", "15.14", "15.15"] },
        { item: "9", descricao: "Massas alimentícias dos códigos 1902.20.00 e 1902.30.00 da NCM/SH", ncm: ["1902.20.00", "1902.30.00"] },
        { item: "10", descricao: "Sucos naturais de fruta ou de produtos hortícolas sem adição de açúcar, sem conservantes, posição 20.09 da NCM/SH", ncm: ["20.09"] },
        { item: "11", descricao: "Polpas de frutas ou de produtos hortícolas sem adição de açúcar, sem conservantes, posição 20.08 da NCM/SH", ncm: ["20.08"] },
        { item: "12", descricao: "Pão de Forma do código 1905.90.10 da NCM/SH", ncm: ["1905.90.10"] },
        { item: "13", descricao: "Extrato de tomate classificado no código 2002.90.00 da NCM/SH", ncm: ["2002.90.00"] },
        { item: "14", descricao: "Frutas, produtos hortícolas e demais produtos vegetais, sem adição de açúcar, capítulos 7 e 8 da NCM/SH, ressalvadas frutas de casca rija não regionais e produtos dos Anexos I e XV, exceto posições 07.11, 08.12 e 0814.00.00", ncm: ["capítulo 7", "capítulo 8"] },
        { item: "15", descricao: "Cereais do capítulo 10 e sementes e frutos oleaginosos do capítulo 12 da NCM/SH; ressalvados os produtos relacionados no Anexo I", ncm: ["capítulo 10", "capítulo 12"] },
        { item: "16", descricao: "Produtos hortícolas pré-cozidos ou cozidos em água ou vapor, sem adição de sal, posições 20.04, 20.05 e código 2002.10.00 da NCM/SH", ncm: ["20.04", "20.05", "2002.10.00"] },
        { item: "17", descricao: "Fruta de casca rija regional, amendoins e outras sementes, apenas torrados ou cozidos, sem adição de sal, subposição 2008.1 da NCM/SH", ncm: ["2008.1"] }
      ]
    },

    {
      id: "VIII",
      titulo: "Produtos de Higiene Pessoal e Limpeza majoritariamente consumidos por famílias de baixa renda submetidos à redução de 60% das alíquotas do IBS e da CBS",
      artigo: "136",
      percentualReducao: 60,
      tratamento: "reduzida",
      vigente: true,
      itens: [
        { item: "1", descricao: "Sabões de toucador classificados no código 3401.11.90 da NCM/SH", ncm: ["3401.11.90"] },
        { item: "2", descricao: "Dentifrícios do código 3306.10.00 da NCM/SH", ncm: ["3306.10.00"] },
        { item: "3", descricao: "Escovas de dentes do código 9603.21.00 da NCM/SH", ncm: ["9603.21.00"] },
        { item: "4", descricao: "Papel higiênico do código 4818.10.00 da NCM/SH", ncm: ["4818.10.00"] },
        { item: "5", descricao: "Água sanitária classificada no código 3808.94.19 da NCM/SH", ncm: ["3808.94.19"] },
        { item: "6", descricao: "Sabões em barra classificados no código 3401.19.00 da NCM/SH", ncm: ["3401.19.00"] },
        { item: "7", descricao: "Fraldas e artigos higiênicos semelhantes, de qualquer matéria, classificadas no código 9619.00.00 da NCM/SH", ncm: ["9619.00.00"] }
      ]
    },

    {
      id: "IX",
      titulo: "Insumos Agropecuários e Aquícolas submetidos à redução de 60% das alíquotas do IBS e da CBS",
      artigo: "138",
      percentualReducao: 60,
      tratamento: "reduzida",
      vigente: true,
      observacao: "Há também uma modalidade de diferimento (CST 515, cClassTrib 515001, art. 138, § 2º) para operações com estes mesmos insumos.",
      itens: [
        { item: "1", descricao: "Biofertilizantes, em conformidade com as definições e demais requisitos da legislação específica", ncm: ["3101.00.00"] },
        { item: "2", descricao: "Fertilizantes (adubos), em conformidade com as definições e demais requisitos da legislação específica", ncm: ["capítulo 31", "3824.99.77", "3824.99.79", "3824.99.89"] },
        { item: "3", descricao: "Corretivos de solo, remineralizadores e substratos para plantas", ncm: ["capítulo 25"] },
        { item: "4", descricao: "Inoculantes, meios de cultura e outros microorganismos para uso agrícola", ncm: ["3002.49", "3002.90.00", "3821.00.00"] },
        { item: "5", descricao: "Bioestimulantes e bioinsumos para controle fitossanitário", ncm: ["38.24", "3807.00.00", "12.11", "38.08"] },
        { item: "6", descricao: "Inseticidas, fungicidas, formicidas, herbicidas e demais defensivos agropecuários", ncm: ["38.08", "3824.99.89"] },
        { item: "7", descricao: "Calcário, casca de coco triturada, turfa e demais insumos para fabricação de fertilizantes/corretivos/bioestimulantes", ncm: ["05.06", "1201.10.00", "1213.00.00", "23.02", "23.03", "23.06"] },
        { item: "8", descricao: "Ácidos e insumos químicos destinados diretamente à fabricação de fertilizantes", ncm: ["2503.00.10", "2503.00.90", "2802.00.00"] },
        { item: "9", descricao: "Enzimas preparadas para decomposição de matéria orgânica animal e vegetal", ncm: ["3507.90.4"] },
        { item: "10", descricao: "Sementes (genética, básica, nativa, certificada, cultivar local/tradicional/crioula)", ncm: ["capítulos 7, 10 e 12"] },
        { item: "11", descricao: "Mudas de plantas e demais materiais propagativos de plantas e fungos", ncm: ["06.01", "06.02"] },
        { item: "12", descricao: "Vacinas, soros e medicamentos de uso veterinário, exceto de animais domésticos", ncm: ["3002.12", "3002.15", "3002.42", "3002.90.00", "30.04"] },
        { item: "13", descricao: "Aves de um dia, exceto as ornamentais", ncm: ["0105.1"] },
        { item: "14", descricao: "Embriões e sêmen, congelado ou resfriado", ncm: ["0511.10.00", "0511.9"] },
        { item: "15", descricao: "Reprodutores de raça pura, inclusive matrizes de animais puros de origem com registro genealógico", ncm: ["01.02", "01.03", "01.04"] },
        { item: "16", descricao: "Ovos fertilizados", ncm: ["0407.1"] },
        { item: "17", descricao: "Girinos e alevinos", ncm: ["0106.90.00"] },
        { item: "18", descricao: "Rações para animais, concentrados, suplementos, aditivos, premix ou núcleo, exceto para animais domésticos", ncm: ["2309.90"] },
        { item: "19", descricao: "Sementes e cereais destinados diretamente à fabricação de ração animal ou alimentação animal (exceto domésticos)", ncm: ["capítulos 10, 11 e 12"] },
        { item: "20", descricao: "Farelos e tortas de produtos vegetais e resíduos das indústrias alimentares destinados à ração animal (exceto domésticos)", ncm: ["23.01", "23.02", "23.03", "23.06"] },
        { item: "21", descricao: "Alho em pó, sal mineralizado, farinhas animais e demais insumos destinados diretamente à ração animal (exceto domésticos)", ncm: ["02.10", "03.09", "0712.90.10", "capítulo 15"] },
        { item: "22", descricao: "Serviços agronômicos", nbs: ["1.1410.90.00"] },
        { item: "23", descricao: "Serviços de técnico agrícola, agropecuário ou em agroecologia", nbs: ["1.1410.90.00"] },
        { item: "24", descricao: "Serviços veterinários para produção animal", nbs: ["1.1405.21.00", "1.1405.22.00", "1.1405.90.00"] },
        { item: "25", descricao: "Serviços de zootecnistas", nbs: ["1.1410.90.00"] },
        { item: "26", descricao: "Serviços de inseminação e fertilização de animais de criação", nbs: ["1.1405.22.00"] },
        { item: "27", descricao: "Serviços de engenharia florestal", nbs: ["1.1403.10.00"] },
        { item: "28", descricao: "Serviços de pulverização e controle de pragas", nbs: ["1.1901.10.00"] },
        { item: "29", descricao: "Serviços de semeadura, adubação, reparação de solo, plantio e colheita", nbs: ["1.1901.10.00"] },
        { item: "30", descricao: "Serviços de projetos para irrigação e fertirrigação", nbs: ["1.1403.29.00"] },
        { item: "31", descricao: "Serviços de análise laboratorial de solos, sementes e outros materiais propagativos, fitossanitários, água, bromatologia e sanidade animal", nbs: ["1.1404.41.00"] },
        { item: "32", descricao: "Licenciamento de direitos sobre cultivares", nbs: ["1.1105.10.00"] },
        { item: "33", descricao: "Cessão definitiva de direitos sobre cultivares", nbs: ["1.1109.10.00"] },
        { item: "34", descricao: "Melhoramento genético de animais e plantas e biotecnologia, inclusive seus royalties", nbs: [] },
        { item: "35", descricao: "Vinhaça", ncm: ["2303.30.00", "2303.20.00"] }
      ]
    },

    {
      id: "X",
      titulo: "Produções nacionais artísticas, culturais, de eventos, jornalísticas e audiovisuais submetidas à redução de 60% das alíquotas do IBS e da CBS",
      artigo: "139",
      percentualReducao: 60,
      tratamento: "reduzida",
      vigente: true,
      itens: [
        { item: "1", descricao: "Licenciamento de direitos de autor e de direitos conexos", nbs: ["1.1103"] },
        { item: "2", descricao: "Licenciamento de direitos de obras literárias", nbs: ["1.1103.10.00"] },
        { item: "3", descricao: "Licenciamento de direitos de autor de obras cinematográficas", nbs: ["1.1103.31.00"] },
        { item: "4", descricao: "Licenciamento de direitos de autor de obras jornalísticas", nbs: ["1.1103.32.00"] },
        { item: "5", descricao: "Licenciamento de direitos conexos de artistas intérpretes ou executantes em obras audiovisuais", nbs: ["1.1103.34.00"] },
        { item: "6", descricao: "Licenciamento de direitos conexos de produtores de obras audiovisuais", nbs: ["1.1103.35.00"] },
        { item: "7", descricao: "Licenciamento de direitos de obras audiovisuais destinadas à televisão", nbs: ["1.1103.36"] },
        { item: "8", descricao: "Licenciamento de direitos de obras musicais e fonogramas", nbs: ["1.1103.4"] },
        { item: "9", descricao: "Cessão temporária de direitos de obras literárias", nbs: ["1.1106.10.00"] },
        { item: "20", descricao: "Serviços de agências de notícias para jornais e periódicos", nbs: ["1.1704.10.00"] },
        { item: "21", descricao: "Serviços de agências de notícias para mídia audiovisual", nbs: ["1.1704.20.00"] },
        { item: "22", descricao: "Serviços de assistência e organização de convenções, feiras de negócios, exposições e outros eventos", nbs: ["1.1806.6"] },
        { item: "25", descricao: "Serviços de produção de programas de televisão, videoteipes e filmes", nbs: ["1.2501.21.00"] },
        { item: "36", descricao: "Serviços de organização e promoção de atuações artísticas ao vivo", nbs: ["1.2502.10.00"] },
        { item: "37", descricao: "Serviços de produção e apresentação de atuações artísticas ao vivo, inclusive ingressos relativos a estes serviços", nbs: ["1.2502.20.00"] },
        { item: "40", descricao: "Serviços de museus, inclusive serviços relativos a mostras e coleções de arte", nbs: ["1.2504.11.00"] },
        { item: "42", descricao: "Fotografias artísticas originais", ncm: ["4911.91.00"] },
        { item: "43", descricao: "Quadros, pinturas e desenhos, artísticos originais", ncm: ["9701.91.00"] },
        { item: "44", descricao: "Gravuras, estampas e litografias, artísticas originais", ncm: ["9702.90.00"] },
        { item: "45", descricao: "Produções originais de arte estatutária ou de escultura", ncm: ["9703.90.00"] }
      ],
      observacao: "Lista completa tem 57 itens (licenciamento/cessão de direitos autorais, serviços audiovisuais, museus, artes visuais originais). Acima, seleção representativa; consulte o texto oficial para a relação integral."
    },

    {
      id: "XI",
      titulo: "Bens e serviços relacionados à soberania e à segurança nacional, à segurança da informação e à segurança cibernética submetidos à redução de 60% das alíquotas do IBS e da CBS",
      artigo: "142, I e II",
      percentualReducao: 60,
      tratamento: "reduzida",
      vigente: true,
      itens: [
        { item: "1.1", descricao: "Segurança em Tecnologia da Informação (TI)", nbs: ["1.1501.20.00"] },
        { item: "1.13", descricao: "Serviços de manutenção e reparação de veículos militares para uso pela segurança nacional", nbs: ["1.2001.35.00"] },
        { item: "2.1", descricao: "Viatura operacional militar e também suas partes e peças", ncm: ["8709"] },
        { item: "2.2", descricao: "Carro blindado e carro de combate, terrestre ou anfíbio, com ou sem armamento", ncm: ["8710.00.00"] },
        { item: "2.6", descricao: "Radares para uso militar", ncm: ["8526.10.00"] },
        { item: "2.7", descricao: "Foguetes para uso militar", ncm: ["9301.20.00"] },
        { item: "2.14", descricao: "Aeronaves, inclusive Veículo Aéreo Não Tripulado (VANT), para uso pela segurança nacional", ncm: ["8802", "8806"] },
        { item: "2.22", descricao: "Dispositivos destinados a prover a segurança da informação do tipo Prevenção de Intrusão (IPS)", ncm: ["8517.62.59"] },
        { item: "2.23", descricao: "Dispositivos destinados a prover a segurança da informação do tipo Detecção de Intrusão (IDS)", ncm: ["8517.62.59"] },
        { item: "2.24", descricao: "Dispositivos de Autenticação (tokens, leitores biométricos) que garantam a segurança da informação/cibernética", ncm: ["8523.52", "8471.90.14"] },
        { item: "2.25", descricao: "Equipamentos para criptografia para a segurança da informação/cibernética", ncm: ["8471.50.90"] },
        { item: "2.26", descricao: "Firewalls para a segurança da informação/cibernética", ncm: ["8517.62.59", "8471.49.00"] },
        { item: "2.27", descricao: "Switches e roteadores seguros para a segurança da informação/cibernética", ncm: ["8517.62.34", "8517.62.4"] },
        { item: "2.30", descricao: "Servidores de armazenamento seguro para a segurança da informação/cibernética", ncm: ["8523.51"] }
      ],
      observacao: "Lista completa tem 30 itens (1.1 a 1.14 serviços; 2.1 a 2.30 bens). Vários subitens foram VETADOS na sanção presidencial (1.4, 1.5, 1.8, 1.9) e alguns aguardam classificação NCM/NBS ('pendente de classificação'). Acima, seleção representativa."
    },

    {
      id: "XII",
      titulo: "Dispositivos Médicos submetidos à redução a zero das alíquotas do IBS e da CBS",
      artigo: "144, I",
      percentualReducao: 100,
      tratamento: "zero",
      vigente: true,
      itens: [
        { item: "1.1", descricao: "Eletrocardiógrafos", ncm: ["9018.11.00"] },
        { item: "1.2", descricao: "Eletroencefalógrafos", ncm: ["9018.19.80"] },
        { item: "2", descricao: "Aparelhos de raios ultravioleta ou infravermelhos", ncm: ["9018.20"] },
        { item: "3", descricao: "Artigos e aparelhos ortopédicos", ncm: ["9021.10.10"] },
        { item: "4", descricao: "Artigos e aparelhos para fraturas", ncm: ["9021.10.20"] },
        { item: "5", descricao: "Artigos e aparelhos de prótese, exceto os dentários", ncm: ["9021.3"] },
        { item: "6", descricao: "Tomógrafo computadorizado", ncm: ["9022.12.00"] },
        { item: "7", descricao: "Aparelhos de raio X, móveis", ncm: ["9022.13", "9022.14", "9022.19"] },
        { item: "8", descricao: "Aparelho de radiocobalto (bomba de cobalto)", ncm: ["9022.21.10"] },
        { item: "9", descricao: "Aparelho de crioterapia", ncm: ["9018.90.99"] },
        { item: "10", descricao: "Aparelho de gamaterapia", ncm: ["9022.21.20"] },
        { item: "11", descricao: "Aparelhos que utilizem radiações alfa, beta, gama ou outras radiações ionizantes, para usos médicos/cirúrgicos/odontológicos/veterinários", ncm: ["9022.21.90"] },
        { item: "12", descricao: "Densímetros, areômetros, termômetros, pirômetros, barômetros, higrômetros e psicômetros", ncm: ["90.25"] },
        { item: "13", descricao: "Respirador", ncm: ["9019.20.40"] },
        { item: "14", descricao: "Monitor multiparâmetros", ncm: ["9018.19.80"] },
        { item: "15", descricao: "Bomba de infusão", ncm: ["9018.90.10"] },
        { item: "16", descricao: "Aparelhos de diagnóstico por visualização de ressonância magnética", ncm: ["9018.13.00"] },
        { item: "17", descricao: "Aparelhos de ultrassom", ncm: ["9018.12"] }
      ]
    },

    {
      id: "XIII",
      titulo: "Dispositivos de Acessibilidade próprios para pessoas com deficiência submetidos à redução a zero das alíquotas do IBS e da CBS",
      artigo: "145, I",
      percentualReducao: 100,
      tratamento: "zero",
      vigente: true,
      itens: [
        { item: "1", descricao: "Barra de apoio para pessoa com deficiência física", ncm: ["8302.41.00"] },
        { item: "2.1", descricao: "Cadeira de rodas e outros veículos para deficientes, sem mecanismo de propulsão", ncm: ["8713.10.00"] },
        { item: "2.2", descricao: "Cadeiras de rodas com motor ou outro mecanismo de propulsão e outros veículos para pessoas com incapacidade", ncm: ["8713.90.00"] },
        { item: "3", descricao: "Partes e acessórios destinados exclusivamente a aplicação em cadeiras de rodas ou em outros veículos para deficientes", ncm: ["8714.20.00"] },
        { item: "4", descricao: "Aparelhos para facilitar a audição dos surdos, exceto partes e acessórios", ncm: ["9021.40.00"] },
        { item: "5", descricao: "Partes e acessórios de aparelhos para facilitar a audição dos surdos", ncm: ["9021.90.92"] },
        { item: "6", descricao: "Implantes cocleares", ncm: ["9021.90.19"] }
      ]
    },

    {
      id: "XIV",
      titulo: "Medicamentos submetidos à redução a zero das alíquotas do IBS e da CBS",
      artigo: "146",
      percentualReducao: 100,
      tratamento: "zero",
      vigente: false,
      revogadoPor: "Lei Complementar nº 227, de 2026",
      observacao:
        "ANEXO REVOGADO. A lista fixa de medicamentos deixou de valer. Atualmente (conforme art. 146, §1º) a redução a zero passa a alcançar medicamentos registrados na Anvisa quando adquiridos por: (I) órgãos da administração pública direta, autarquias e fundações públicas; ou (II) entidades de saúde imunes ao IBS/CBS que possuam CEBAS. Este é um tema em plena regulamentação — consulte a Receita Federal/CGIBS antes de aplicar qualquer classificação de medicamentos.",
      itens: []
    },

    {
      id: "XV",
      titulo: "Produtos Hortícolas, Frutas e Ovos submetidos à redução de 100% das alíquotas do IBS e da CBS",
      artigo: "148",
      percentualReducao: 100,
      tratamento: "zero",
      vigente: true,
      itens: [
        { item: "1", descricao: "Ovos da subposição 0407.2 da NCM/SH", ncm: ["0407.2"] },
        { item: "2", descricao: "Produtos hortícolas das posições 07.01, 07.02.00.00, 07.03, 07.04, 07.05, 07.06, 0707.00.00, 07.08, 07.09 e 07.10 (exceto cogumelos e trufas)", ncm: ["07.01", "07.02.00.00", "07.03", "07.04", "07.05", "07.06", "0707.00.00", "07.08", "07.09", "07.10"] },
        { item: "3", descricao: "Frutas frescas ou refrigeradas e frutas congeladas sem adição de açúcar, posições 08.03 a 08.11 da NCM/SH", ncm: ["08.03", "08.04", "08.05", "08.06", "08.07", "08.08", "08.09", "08.10", "08.11"] },
        { item: "4", descricao: "Plantas e produtos de floricultura relativos à horticultura, cultivados para fins alimentares, ornamentais ou medicinais, capítulo 6 da NCM/SH", ncm: ["capítulo 6"] },
        { item: "5", descricao: "Raízes e tubérculos da posição 07.14 da NCM/SH", ncm: ["07.14"] },
        { item: "6", descricao: "Cocos da subposição 0801.1 da NCM/SH", ncm: ["0801.1"] }
      ]
    },

    {
      id: "XVI",
      titulo: "Limite inferior para fixação da alíquota própria em proporção da alíquota de referência",
      artigo: "371, § 1º",
      percentualReducao: null,
      tratamento: "pendente",
      vigente: true,
      naoEProdutos: true,
      observacao: "Este Anexo não lista produtos/NCMs — define um cronograma (2029 a 2077) de piso percentual que cada ente federativo deve respeitar ao fixar sua própria alíquota de IBS em relação à alíquota de referência nacional. Não é usado para classificação de produtos.",
      tabela: [
        { ano: 2029, limiteInferior: "81,0%" }, { ano: 2030, limiteInferior: "81,0%" },
        { ano: 2031, limiteInferior: "81,0%" }, { ano: 2032, limiteInferior: "81,0%" },
        { ano: 2033, limiteInferior: "90,5%" }, { ano: 2034, limiteInferior: "88,6%" },
        { ano: 2035, limiteInferior: "86,7%" }, { ano: 2036, limiteInferior: "84,8%" },
        { ano: 2037, limiteInferior: "82,9%" }, { ano: 2038, limiteInferior: "81,0%" },
        { ano: 2039, limiteInferior: "79,1%" }, { ano: 2040, limiteInferior: "77,2%" }
      ]
    },

    {
      id: "XVII",
      titulo: "Bens e Serviços sujeitos ao Imposto Seletivo (IS)",
      artigo: "409, § 1º",
      percentualReducao: null,
      tratamento: "seletivo",
      vigente: true,
      observacao: "O Imposto Seletivo é um tributo ADICIONAL (não uma redução) sobre bens/serviços prejudiciais à saúde ou ao meio ambiente. Incide junto com o IBS/CBS, não em substituição.",
      itens: [
        { item: "Veículos", descricao: "87.03; 8704.21, 8704.31, 8704.41.00, 8704.51.00, 8704.60.00, 8704.90.00 (exceto caminhões); ressalvados veículos das Forças Armadas/Segurança Pública", ncm: ["87.03", "8704.21", "8704.31", "8704.41.00", "8704.51.00", "8704.60.00", "8704.90.00"] },
        { item: "Aeronaves e Embarcações", descricao: "8802 (exceto 8802.60.00); embarcações com motor da posição 8903; ressalvadas as de uso das Forças Armadas/Segurança Pública", ncm: ["8802", "8903"] },
        { item: "Produtos fumígenos", descricao: "2401; 2402; 2403; 2404", ncm: ["2401", "2402", "2403", "2404"] },
        { item: "Bebidas alcoólicas", descricao: "2203; 2204; 2205; 2206; 2208", ncm: ["2203", "2204", "2205", "2206", "2208"] },
        { item: "Bebidas açucaradas", descricao: "2202.10.00", ncm: ["2202.10.00"] },
        { item: "Bens minerais", descricao: "2601; 2709.00.10; 2711.11.00; 2711.21.00", ncm: ["2601", "2709.00.10", "2711.11.00", "2711.21.00"] },
        { item: "Concursos de prognósticos e Fantasy sport", descricao: "Loterias, apostas e fantasy sport (base de cálculo específica, sem NCM associado)", ncm: [] }
      ]
    }
  ],

  // Regras gerais por tipo de operação (arts. citados textualmente da LC 214/2025)
  // A partir daqui, cClassTrib e cst vêm confirmados diretamente da tabela
  // oficial (js/cclasstrib-oficial.js) — não são estimativas.
  operacoes: [
    {
      id: "venda",
      label: "Venda / fornecimento (regra geral)",
      tratamento: "integral",
      descricao: "Regra padrão: incidência integral do IBS e da CBS, salvo se o produto constar de algum dos Anexos de redução/zero (consulte por NCM) ou se a operação se enquadrar em uma das hipóteses abaixo.",
      artigo: "4º",
      cst: "000",
      cClassTrib: "000001"
    },
    {
      id: "exportacao",
      label: "Exportação de bens ou serviços",
      tratamento: "imune",
      descricao: "As exportações de bens e de serviços são imunes ao IBS e à CBS (não incidência constitucional).",
      artigo: "8º",
      cst: "410",
      cClassTrib: "410004"
    },
    {
      id: "exportacao_suspensao",
      label: "Venda a empresa comercial exportadora (fim específico de exportação)",
      tratamento: "suspensa",
      descricao: "Pode ser suspenso o pagamento do IBS/CBS no fornecimento de bens materiais com fim específico de exportação.",
      artigo: "82",
      cst: "550",
      cClassTrib: "550001"
    },
    {
      id: "industrializacao_exportacao",
      label: "Industrialização destinada a exportação",
      tratamento: "suspensa",
      descricao: "Regime de suspensão específico para operações de industrialização cujo produto final se destina à exportação.",
      artigo: "82, § 11",
      cst: "550",
      cClassTrib: "550021"
    },
    {
      id: "zfm",
      label: "Venda para Zona Franca de Manaus",
      tratamento: "zero",
      descricao: "Operação originada fora da ZFM que destine bem material industrializado de origem nacional a contribuinte habilitado estabelecido na ZFM tem alíquota de IBS/CBS reduzida a zero.",
      artigo: "445",
      cst: "200",
      cClassTrib: "200022"
    },
    {
      id: "bares_restaurantes",
      label: "Fornecimento de alimentação por bares, restaurantes e lanchonetes",
      tratamento: "reduzida",
      percentualReducao: 40,
      descricao: "Regime específico para o fornecimento de alimentação PREPARADA NO PRÓPRIO ESTABELECIMENTO por bares, restaurantes e lanchonetes (ex.: refeição, marmitex, porção, prato feito): redução de 40% nas alíquotas de IBS e CBS sobre o valor da operação, excluídas a gorjeta (até 15% do total) e eventual comissão de intermediação por aplicativo. NÃO se aplica a bebidas alcoólicas, a alimentos/bebidas revendidos sem preparo no estabelecimento, nem a fornecimento para pessoa jurídica sob contrato (catering/eventos) — essas hipóteses seguem a regra geral. Importante: isso é uma prestação de SERVIÇO, não uma mercadoria — não existe um código NCM para 'refeição'/'marmitex'/'porção', porque NCM classifica bens, não serviços.",
      artigo: "273 a 276",
      cst: "200",
      cClassTrib: "200047"
    },
    {
      id: "combustiveis_monofasico",
      label: "Combustíveis (regime monofásico)",
      tratamento: "pendente",
      descricao: "IBS e CBS incidem uma única vez (monofasia) sobre gasolina e suas correntes, etanol anidro combustível, óleo diesel e suas correntes e demais combustíveis listados, com alíquotas específicas fixadas por ato do Executivo/Comitê Gestor. Alterado pela LC 227/2026.",
      artigo: "172",
      cst: "620",
      cClassTrib: "620001"
    },
    {
      id: "doacao",
      label: "Doação sem contraprestação em benefício do doador",
      tratamento: "imune",
      descricao: "Doações sem contraprestação em benefício do próprio doador não sofrem incidência de IBS/CBS.",
      artigo: "6º, VIII",
      cst: "410",
      cClassTrib: "410003"
    },
    {
      id: "transferencia_mesmo_titular",
      label: "Transferência entre estabelecimentos do mesmo contribuinte",
      tratamento: "imune",
      descricao: "Transferências de mercadoria entre estabelecimentos pertencentes ao mesmo contribuinte não sofrem incidência de IBS/CBS.",
      artigo: "6º, II",
      cst: "410",
      cClassTrib: "410002"
    },
    {
      id: "bonificacao",
      label: "Bonificação (sem evento posterior)",
      tratamento: "imune",
      descricao: "Fornecimento de bonificações, quando constem no documento fiscal e não dependam de evento posterior, não sofre incidência de IBS/CBS.",
      artigo: "5º, § 1º, I",
      cst: "410",
      cClassTrib: "410001"
    }
  ]
};
