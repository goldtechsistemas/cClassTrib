const bcrypt = require("bcryptjs");
const { query } = require("../_db");
const { corpoJson, lerSessaoUsuario, iniciarSessaoUsuario } = require("../_lib");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const novoEmail = String(corpo.novoEmail || "").trim().toLowerCase();
  const senhaAtual = String(corpo.senhaAtual || "");

  if (!EMAIL_REGEX.test(novoEmail)) {
    res.status(400).json({ ok: false, erro: "Preencha um e-mail válido." });
    return;
  }
  if (novoEmail === sessao.email) {
    res.status(400).json({ ok: false, erro: "Esse já é o e-mail atual." });
    return;
  }

  try {
    const atual = await query("SELECT senha_hash FROM usuarios WHERE email = $1", [sessao.email]);
    if (!atual.rows.length || !(await bcrypt.compare(senhaAtual, atual.rows[0].senha_hash))) {
      res.status(401).json({ ok: false, erro: "Senha atual incorreta." });
      return;
    }

    const existente = await query("SELECT id FROM usuarios WHERE email = $1", [novoEmail]);
    if (existente.rows.length) {
      res.status(409).json({ ok: false, erro: "Já existe uma conta com este e-mail." });
      return;
    }

    await query("UPDATE usuarios SET email = $1 WHERE email = $2", [novoEmail, sessao.email]);
    iniciarSessaoUsuario(res, { email: novoEmail, nome: sessao.nome }, sessao.lembrar);
    res.status(200).json({ ok: true, email: novoEmail });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro interno." });
  }
};
