const bcrypt = require("bcryptjs");
const { query } = require("../_db");
const { corpoJson, lerSessaoUsuario } = require("../_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }
  const sessao = lerSessaoUsuario(req);
  if (!sessao) {
    res.status(401).json({ ok: false, erro: "Sessão expirada. Entre novamente." });
    return;
  }

  const corpo = corpoJson(req);
  const senhaAtual = String(corpo.senhaAtual || "");
  const novaSenha = String(corpo.novaSenha || "");

  if (novaSenha.length < 6) {
    res.status(400).json({ ok: false, erro: "A nova senha precisa ter no mínimo 6 caracteres." });
    return;
  }

  try {
    const atual = await query("SELECT senha_hash FROM usuarios WHERE email = $1", [sessao.email]);
    if (!atual.rows.length || !(await bcrypt.compare(senhaAtual, atual.rows[0].senha_hash))) {
      res.status(401).json({ ok: false, erro: "Senha atual incorreta." });
      return;
    }

    const novoHash = await bcrypt.hash(novaSenha, 12);
    await query("UPDATE usuarios SET senha_hash = $1 WHERE email = $2", [novoHash, sessao.email]);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro interno." });
  }
};
