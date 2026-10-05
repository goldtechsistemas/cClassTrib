// Regras do controle de assinaturas/cobranças do painel admin (datas, validações
// e a "baixa" de pagamento). Tudo em datas puras AAAA-MM-DD (sem hora/fuso), como
// as colunas DATE do banco — "hoje" de Brasília vem do próprio SQL.

const PERIODICIDADES_VALIDAS = [1, 2, 3, 6, 12];

function dataValida(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && a >= 2000 && a <= 2100;
}

function dia(iso) {
  return Number(iso.slice(8, 10));
}

// Soma "n" meses mantendo o dia de cobrança original: um vencimento no dia 31
// cai em 28/fev, mas volta para 31 em março (e não "escorrega" para 28).
function somarMeses(iso, n, diaBase) {
  const [a, m, d] = iso.split("-").map(Number);
  const total = m - 1 + n;
  const ano = a + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const diaFinal = Math.min(diaBase || d, ultimoDia);
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(diaFinal).padStart(2, "0")}`;
}

// Aceita número ou texto ("1.234,56" / "89,9" / "89.90"); devolve número com 2
// casas, ou null se for vazio, ou NaN se for inválido.
function lerValor(v) {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  let t = String(v).trim().replace(/[R$\s]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 9999999.99) return NaN;
  return Math.round(n * 100) / 100;
}

function linhaCobranca(r) {
  return {
    assinaturaInicio: r.assinatura_inicio || null,
    valorCobranca: r.valor_cobranca == null ? null : Number(r.valor_cobranca),
    periodicidadeMeses: Number(r.periodicidade_meses) || 1,
    proximoVencimento: r.proximo_vencimento || null,
    diasParaVencer: r.dias_para_vencer == null ? null : Number(r.dias_para_vencer),
    ultimoPagamento: r.ultimo_pagamento || null,
  };
}

// Colunas de cobrança do usuário já formatadas (datas como texto AAAA-MM-DD) e
// a diferença de dias até o vencimento calculada com a data de HOJE em Brasília.
const SQL_COBRANCA = `u.assinatura_inicio::text AS assinatura_inicio,
       u.valor_cobranca,
       u.periodicidade_meses,
       u.proximo_vencimento::text AS proximo_vencimento,
       (u.proximo_vencimento - (now() AT TIME ZONE 'America/Sao_Paulo')::date)::int AS dias_para_vencer,
       (SELECT max(p.pago_em)::text FROM pagamentos_assinatura p WHERE p.usuario_id = u.id) AS ultimo_pagamento`;

module.exports = { PERIODICIDADES_VALIDAS, dataValida, dia, somarMeses, lerValor, linhaCobranca, SQL_COBRANCA };
