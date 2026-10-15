const { query } = require("../_db");
const { exigirUsuario, empresaParaSaida } = require("../_nfeHelpers");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }
  const usuarioId = await exigirUsuario(req, res);
  if (usuarioId == null) return;

  try {
    // "Saúde" da busca de notas, calculada pelo histórico de consultas: a última
    // que a SEFAZ atendeu (137/138) e quantas rejeições 656 vieram depois dela.
    const r = await query(
      `SELECT e.*, s.ultima_consulta_ok, s.rejeicoes_656, s.rejeicoes_656_ultnsu
         FROM nfe_empresas e
         LEFT JOIN LATERAL (
           SELECT ok.ultima_consulta_ok,
                  count(*) FILTER (WHERE l.c_stat = '656')::int AS rejeicoes_656,
                  count(*) FILTER (WHERE l.c_stat = '656' AND l.x_motivo ILIKE '%ultNSU%')::int AS rejeicoes_656_ultnsu
             FROM (SELECT max(iniciado_em) AS ultima_consulta_ok FROM nfe_sync_logs
                    WHERE empresa_id = e.id AND c_stat IN ('137', '138')) ok
             LEFT JOIN nfe_sync_logs l
               ON l.empresa_id = e.id AND l.iniciado_em > COALESCE(ok.ultima_consulta_ok, '-infinity'::timestamptz)
            GROUP BY ok.ultima_consulta_ok
         ) s ON true
        WHERE e.usuario_id = $1
        ORDER BY e.criado_em DESC`,
      [usuarioId]
    );
    res.status(200).json({ ok: true, empresas: r.rows.map(empresaParaSaida) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro ao listar empresas." });
  }
};
