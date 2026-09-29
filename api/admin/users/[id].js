const bcrypt = require("bcryptjs");
const { query } = require("../../_db");
const { corpoJson, lerSessaoAdmin, gerarSenhaProvisoria } = require("../../_lib");

const TAMANHO_MINIMO_SENHA = 6;

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

  if (req.method === "PATCH" && corpoJson(req).redefinirSenha) {
    // Esqueceu a senha (não há recuperação por e-mail): o admin gera uma nova
    // senha provisória e a conta volta ao estado de "primeiro acesso" — o
    // usuário é obrigado a criar a própria senha no próximo login. Também
    // derruba as sessões abertas (api/session.js e exigirUsuario tratam
    // "precisa trocar a senha" como deslogado), senão a sessão antiga
    // continuaria valendo por até 180 dias.
    const digitada = String(corpoJson(req).senhaProvisoria || "");
    if (digitada && digitada.length < TAMANHO_MINIMO_SENHA) {
      res.status(400).json({ ok: false, erro: `A senha provisória precisa ter no mínimo ${TAMANHO_MINIMO_SENHA} caracteres.` });
      return;
    }
    try {
      const senhaProvisoria = digitada || gerarSenhaProvisoria();
      const hash = await bcrypt.hash(senhaProvisoria, 12);
      const resultado = await query(
        `UPDATE usuarios SET senha_hash = $1, precisa_trocar_senha = true WHERE id = $2
         RETURNING id, email, nome, bloqueado, precisa_trocar_senha, criado_em`,
        [hash, id]
      );
      if (!resultado.rows.length) {
        res.status(404).json({ ok: false, erro: "Usuário não encontrado." });
        return;
      }
      res.status(200).json({ ok: true, usuario: resultado.rows[0], senhaProvisoria });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, erro: "Erro interno." });
    }
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
