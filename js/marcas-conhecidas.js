/*
 * Dicionário de marcas conhecidas → NCM — camada de FALLBACK, usada só quando
 * a busca direta na tabela NCM oficial (js/ncm-tabela.js) não encontra
 * nenhum candidato completo. Ao contrário de TODO o resto deste site, este
 * arquivo NÃO vem de uma fonte governamental — é uma lista curada
 * manualmente (conhecimento geral sobre marcas brasileiras/internacionais
 * comuns), porque marcas comerciais (ex.: "BRAHMA", "HEINEKEN") não aparecem
 * na nomenclatura oficial, que classifica por CATEGORIA de produto, não por
 * marca. Por isso todo resultado que passa por aqui é marcado explicitamente
 * como "correspondência por marca reconhecida (heurística)" na interface —
 * nunca apresentado como se viesse da tabela oficial.
 *
 * Cada NCM usado aqui foi conferido manualmente contra a tabela oficial
 * (js/ncm-tabela.js) antes de entrar nesta lista — ver README, seção sobre
 * esta funcionalidade, para o raciocínio de cada categoria. Cobre só
 * bebidas por enquanto (o caso de uso real que motivou a funcionalidade);
 * para expandir a outras categorias, adicione novos grupos aqui.
 */
window.MARCAS_CONHECIDAS = [
  {
    categoria: "Cerveja de malte",
    ncm: "2203.00.00",
    // Heading 22.03 tem um único código completo (2203.00.00) para TODA
    // cerveja de malte, qualquer marca/embalagem — mapeamento de baixo risco.
    termos: [
      "brahma", "skol", "antarctica", "antártica", "itaipava", "kaiser",
      "bohemia", "original", "nova schin", "petra", "serramalte",
      "serra malte", "bavaria", "colorado", "spaten", "budweiser", "corona",
      "stella artois", "heineken", "amstel", "eisenbahn", "imperio",
      "império", "baden baden", "devassa", "cristal", "xingu", "puro malte",
      "caracu", "becks", "leffe", "hoegaarden", "franziskaner", "erdinger",
      "paulaner", "weihenstephaner", "estrella", "sol cerveja"
    ]
  },
  {
    categoria: "Água/refrigerante adicionado de açúcar ou aromatizante (art. 22.02)",
    ncm: "2202.10.00",
    termos: [
      "coca cola", "coca-cola", "pepsi", "guarana antarctica",
      "guaraná antarctica", "guarana jesus", "guaraná jesus", "fanta",
      "sprite", "dolly", "sukita", "tubaina", "del valle", "guarapan",
      "kuat", "soda limonada", "h2oh"
    ]
  },
  {
    categoria: "Outras bebidas não alcoólicas — energético/isotônico (art. 22.02, subposição 2202.9)",
    ncm: "2202.99.00",
    termos: [
      "red bull", "monster energy", "monster", "tnt energy", "fusion energy",
      "gatorade", "powerade", "hidrolife", "dopam", "hysotonic", "marathon"
    ]
  },
  {
    categoria: "Água mineral/gaseificada (posição 22.01)",
    ncm: "2201.10.00",
    termos: [
      "crystal agua", "bonafont", "minalba", "sao lourenco", "são lourenço",
      "lindoya", "petropolis agua", "petrópolis água", "indaia", "indaiá",
      "schin agua", "prata agua"
    ]
  },
  {
    categoria: "Cachaça / aguardente de cana",
    ncm: "2208.40.00",
    termos: ["cachaca", "cachaça", "pinga"]
  },
  {
    categoria: "Uísque (garrafa até 2 litros)",
    ncm: "2208.30.20",
    termos: ["whisky", "whiskey", "uisque", "uísque"]
  },
  {
    categoria: "Vodca",
    ncm: "2208.60.00",
    termos: ["vodka", "vodca"]
  },
  {
    categoria: "Gim / genebra",
    ncm: "2208.50.00",
    // Sem espaço à direita: a comparação em js/ncm-busca.js já é por
    // palavra inteira (tokenizada), então "gin"/"gim" não batem com
    // substrings de outras palavras (ex.: "engine").
    termos: ["gin", "gim"]
  },
  {
    categoria: "Licor",
    ncm: "2208.70.00",
    termos: ["licor"]
  },
  {
    categoria: "Vinho",
    ncm: "2204.29.10",
    termos: ["vinho"]
  },
  {
    categoria: "Goma de mascar sem açúcar",
    ncm: "2106.90.50",
    // Trident é comercializada no Brasil como "sem açúcar" — código
    // específico (2106.90.50), diferente da goma de mascar tradicional
    // (1704.10.00, posição 17.04) usada abaixo para as demais marcas.
    termos: ["trident"]
  },
  {
    categoria: "Goma de mascar (pastilha elástica)",
    ncm: "1704.10.00",
    termos: ["chiclets", "bubbaloo"]
  },
  {
    categoria: "Caramelo/confeito/drope/pastilha",
    ncm: "1704.90.20",
    // Busca literal por "bala" falha (homônimo: "bala" de arma de fogo tem
    // muito mais itens na tabela oficial do que bala doce), por isso essas
    // marcas de bala/pastilha precisam do fallback mesmo já sendo bem
    // conhecidas.
    termos: ["halls", "mentos", "trebor", "ricola"]
  },
  {
    categoria: "Chocolate branco",
    ncm: "1704.90.10",
    termos: ["laka"]
  },
  {
    categoria: "Chocolate em tablete/barra (não recheado)",
    ncm: "1806.32.10",
    termos: ["diamante negro", "diamant"]
  }
];
