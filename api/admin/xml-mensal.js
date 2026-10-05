// Relatório do painel admin: quantos XMLs completos cada LOGIN (somando todas
// as suas empresas/certificados) baixou da SEFAZ em um mês (por padrão o mês atual, fuso de Brasília). Cada XML conta
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

    // Total por LOGIN: soma de todos os certificados (empresas) de cada usuário.
    // Entram todos os usuários, inclusive os que ainda não cadastraram empresa.
    const todos = await query("SELECT id, email, nome, bloqueado FROM usuarios");
    const porUsuario = new Map(
      todos.rows.map((u) => [
        u.id,
        { usuarioId: u.id, usuarioEmail: u.email, usuarioNome: u.nome, bloqueado: u.bloqueado, qtdEmpresas: 0, xmlsNoMes: 0, xmlsTotal: 0, ultimaSincronizacao: null, empresas: [] },
      ])
    );
    for (const e of lista) {
      const u = porUsuario.get(e.usuarioId);
      if (!u) continue;
      u.qtdEmpresas += 1;
      u.xmlsNoMes += e.xmlsNoMes;
      u.xmlsTotal += e.xmlsTotal;
      if (e.ultimaSincronizacao && (!u.ultimaSincronizacao || new Date(e.ultimaSincronizacao) > new Date(u.ultimaSincronizacao))) {
        u.ultimaSincronizacao = e.ultimaSincronizacao;
      }
      u.empresas.push(e);
    }
    const usuarios = Array.from(porUsuario.values()).sort(
      (a, b) => b.xmlsNoMes - a.xmlsNoMes || String(a.usuarioEmail).toLowerCase().localeCompare(String(b.usuarioEmail).toLowerCase())
    );

    res.status(200).json({
      ok: true,
      mes,
      mesesDisponiveis: meses.rows,
      usuarios,
      totais: {
        xmlsNoMes: usuarios.reduce((s, u) => s + u.xmlsNoMes, 0),
        xmlsAcumulado: usuarios.reduce((s, u) => s + u.xmlsTotal, 0),
        logins: usuarios.length,
        loginsComXmlNoMes: usuarios.filter((u) => u.xmlsNoMes > 0).length,
        empresas: lista.length,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro ao montar o relatório." });
  }
};
