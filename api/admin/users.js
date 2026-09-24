const { query } = require("../_db");
const { lerSessaoAdmin } = require("../_lib");

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
    const resultado = await query(
      "SELECT id, email, nome, bloqueado, criado_em FROM usuarios ORDER BY criado_em DESC"
    );
    res.status(200).json({ ok: true, usuarios: resultado.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro interno." });
  }
};
