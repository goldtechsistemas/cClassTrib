const { query } = require("./_db");
const { exigirUsuario } = require("./_nfeHelpers");
const { corpoJson } = require("./_lib");
const { sincronizarEmpresa } = require("./_nfeSync");

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

  const r = await query("SELECT * FROM nfe_empresas WHERE id = $1 AND usuario_id = $2", [empresaId, usuarioId]);
  const empresa = r.rows[0];
  if (!empresa) {
    res.status(404).json({ ok: false, erro: "Empresa não encontrada." });
    return;
  }

  // Clique manual do próprio usuário — ele pediu explicitamente que a
  // manifestação automática aconteça junto (ver conversa/decisão do produto).
  const resultado = await sincronizarEmpresa(empresa, { manifestarAutomaticamente: true });
  if (!resultado.ok) {
    res.status(resultado.aguardando ? 429 : 502).json({ ok: false, erro: resultado.erro });
    return;
  }

  res.status(200).json(resultado);
};
