// Relatório do painel admin: quantos XMLs completos cada empresa baixou da
// SEFAZ em um mês (por padrão o mês atual, fuso de Brasília). Cada XML conta
// uma vez só, no dia em que chegou (nfe_documentos.xml_baixado_em).
const { query } = require("../_db");
const { lerSessaoAdmin } = require("../_lib");

const FUSO = "America/Sao_Paulo";

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }
  if (!lerSessaoAdmin(req)) {
    res.status(401).json({ ok: false, erro: "Não autorizado." });
    return;
  }

  try {
    let mes = String((req.query && req.query.mes) || "").trim();
    if (mes && !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      res.status(400).json({ ok: false, erro: "Mês inválido (use AAAA-MM)." });
      return;
    }
    if (!mes) {
      const agora = await query(`SELECT to_char(now() AT TIME ZONE '${FUSO}', 'YYYY-MM') AS mes`);
      mes = agora.rows[0].mes;
    }

    // Início do mês escolhido e do seguinte, à meia-noite de Brasília.
    const empresas = await query(
      `SELECT e.id AS empresa_id, e.razao_social, e.cnpj, e.ultima_sincronizacao,
              u.id AS usuario_id, u.email AS usuario_email, u.nome AS usuario_nome,
              count(d.id) FILTER (
                WHERE d.xml_baixado_em >= (($1 || '-01')::date)::timestamp AT TIME ZONE '${FUSO}'
                  AND d.xml_baixado_em <  ((($1 || '-01')::date + interval '1 month'))::timestamp AT TIME ZONE '${FUSO}'
              )::int AS xmls_mes,
              count(d.id) FILTER (WHERE d.xml_baixado_em IS NOT NULL)::int AS xmls_total
         FROM nfe_empresas e
         JOIN usuarios u ON u.id = e.usuario_id
         LEFT JOIN nfe_documentos d ON d.empresa_id = e.id
        GROUP BY e.id, u.id
        ORDER BY xmls_mes DESC, lower(u.email), lower(e.razao_social)`,
      [mes]
    );

    const meses = await query(
      `SELECT to_char(xml_baixado_em AT TIME ZONE '${FUSO}', 'YYYY-MM') AS mes, count(*)::int AS total
         FROM nfe_documentos
        WHERE xml_baixado_em IS NOT NULL
        GROUP BY 1
        ORDER BY 1 DESC`
    );

    const lista = empresas.rows.map((r) => ({
      empresaId: r.empresa_id,
      razaoSocial: r.razao_social,
      cnpj: r.cnpj,
      ultimaSincronizacao: r.ultima_sincronizacao,
      usuarioId: r.usuario_id,
      usuarioEmail: r.usuario_email,
      usuarioNome: r.usuario_nome,
      xmlsNoMes: r.xmls_mes,
      xmlsTotal: r.xmls_total,
    }));

    res.status(200).json({
      ok: true,
      mes,
      mesesDisponiveis: meses.rows,
      empresas: lista,
      totais: {
        xmlsNoMes: lista.reduce((s, e) => s + e.xmlsNoMes, 0),
        xmlsAcumulado: lista.reduce((s, e) => s + e.xmlsTotal, 0),
        empresas: lista.length,
        empresasComXmlNoMes: lista.filter((e) => e.xmlsNoMes > 0).length,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro ao montar o relatório." });
  }
};
