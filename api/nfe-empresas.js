const { query } = require("./_db");
const { exigirUsuario, empresaParaSaida } = require("./_nfeHelpers");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }
  const usuarioId = await exigirUsuario(req, res);
  if (usuarioId == null) return;

  try {
    const r = await query(
      "SELECT * FROM nfe_empresas WHERE usuario_id = $1 ORDER BY criado_em DESC",
      [usuarioId]
    );
    res.status(200).json({ ok: true, empresas: r.rows.map(empresaParaSaida) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro ao listar empresas." });
  }
};
