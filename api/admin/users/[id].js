const { query } = require("../../_db");
const { corpoJson, lerSessaoAdmin } = require("../../_lib");

module.exports = async (req, res) => {
  if (!lerSessaoAdmin(req)) {
    res.status(401).json({ ok: false, erro: "Não autorizado." });
    return;
  }

  const id = Number(req.query.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ ok: false, erro: "Id inválido." });
    return;
  }

  if (req.method === "PATCH") {
    const corpo = corpoJson(req);
    const bloqueado = !!corpo.bloqueado;
    try {
      const resultado = await query(
        "UPDATE usuarios SET bloqueado = $1 WHERE id = $2 RETURNING id, email, nome, bloqueado, criado_em",
        [bloqueado, id]
      );
      if (!resultado.rows.length) {
        res.status(404).json({ ok: false, erro: "Usuário não encontrado." });
        return;
      }
      res.status(200).json({ ok: true, usuario: resultado.rows[0] });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, erro: "Erro interno." });
    }
    return;
  }

  if (req.method === "DELETE") {
    // Confirmação dupla: além do modal no front, exige que o e-mail exato
    // da conta seja enviado no corpo — trava contra excluir a linha errada
    // por um clique duplo ou requisição repetida sem querer.
    const corpo = corpoJson(req);
    const emailConfirmacao = String(corpo.emailConfirmacao || "").trim().toLowerCase();
    try {
      const atual = await query("SELECT email FROM usuarios WHERE id = $1", [id]);
      if (!atual.rows.length) {
        res.status(404).json({ ok: false, erro: "Usuário não encontrado." });
        return;
      }
      if (atual.rows[0].email !== emailConfirmacao) {
        res.status(400).json({ ok: false, erro: "E-mail de confirmação não confere." });
        return;
      }
      await query("DELETE FROM usuarios WHERE id = $1", [id]);
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, erro: "Erro interno." });
    }
    return;
  }

  res.status(405).json({ ok: false, erro: "Método não permitido." });
};
