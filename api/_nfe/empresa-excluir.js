const { query } = require("../_db");
const { exigirUsuario } = require("../_nfeHelpers");
const { corpoJson } = require("../_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }
  const usuarioId = await exigirUsuario(req, res);
  if (usuarioId == null) return;

  const corpo = corpoJson(req);
  const empresaId = corpo.empresaId;
  if (!empresaId) {
    res.status(400).json({ ok: false, erro: "Informe a empresa." });
    return;
  }

  try {
    const r = await query("DELETE FROM nfe_empresas WHERE id = $1 AND usuario_id = $2", [empresaId, usuarioId]);
    if (!r.rowCount) {
      res.status(404).json({ ok: false, erro: "Empresa não encontrada." });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro ao excluir a empresa." });
  }
};
