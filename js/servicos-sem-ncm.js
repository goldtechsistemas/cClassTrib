/*
 * Termos que descrevem um SERVIÇO de alimentação (cardápio de bar,
 * restaurante ou lanchonete), não uma MERCADORIA — por isso genuinamente
 * NÃO TÊM um NCM: a Nomenclatura Comum do Mercosul classifica bens físicos,
 * não serviços. "Descobrir o NCM de uma refeição" é um erro de categoria,
 * não uma busca difícil — a tabela oficial de ~15 mil itens não tem (e não
 * deveria ter) uma resposta para "marmitex", porque o item de cardápio pode
 * misturar dezenas de NCMs de ingredientes diferentes numa única operação.
 *
 * Em vez de silenciosamente devolver "nenhum candidato encontrado" (que
 * parece um problema de busca, quando na verdade é a pergunta errada), o
 * site reconhece esses termos e aponta direto para o regime tributário
 * real que se aplica: o regime específico de bares/restaurantes/
 * lanchonetes (art. 273 a 276 da LC 214/2025, cClassTrib 200047 — ver
 * js/data.js, operação "bares_restaurantes"). Isso é dado oficial de
 * verdade, já carregado no site, só que nunca conectado à busca de NCM.
 *
 * Comparação por palavra inteira (mesmo mecanismo de js/marcas-conhecidas.js
 * e js/ncm-busca.js) — não por substring solta.
 */
// Lista deliberadamente curta e conservadora: só termos que praticamente só
// aparecem descrevendo item de cardápio de bar/restaurante. Palavras mais
// genéricas (ex.: "lanche", "combo", "quilo", "sanduíche") ficaram de fora
// de propósito — podem legitimamente descrever produtos EMBALADOS com NCM
// de verdade (ex.: "sanduíche natural congelado"), e incluí-las arriscaria
// dizer a alguém com um produto real que ele "não tem NCM".
window.TERMOS_SERVICO_ALIMENTACAO = {
  operacaoId: "bares_restaurantes",
  termos: [
    "refeição", "refeições", "marmita", "marmitex", "marmitas",
    "porção", "porções", "prato feito", "self service", "self-service",
    "rodízio", "buffet", "prato do dia"
  ]
};
