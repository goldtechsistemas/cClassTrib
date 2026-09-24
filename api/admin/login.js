const bcrypt = require("bcryptjs");
const { query } = require("../_db");
const { corpoJson, iniciarSessaoAdmin } = require("../_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }

  const corpo = corpoJson(req);
  const email = String(corpo.email || "").trim().toLowerCase();
  const senha = String(corpo.senha || "");

  try {
    const resultado = await query("SELECT senha_hash FROM admins WHERE email = $1", [email]);
    const registro = resultado.rows[0];
    const erroGenerico = { ok: false, erro: "E-mail ou senha incorretos." };
    if (!registro) {
      res.status(401).json(erroGenerico);
      return;
    }
    const senhaCorreta = await bcrypt.compare(senha, registro.senha_hash);
    if (!senhaCorreta) {
      res.status(401).json(erroGenerico);
      return;
    }

    iniciarSessaoAdmin(res, { email });
    res.status(200).json({ ok: true, email });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro interno ao entrar." });
  }
};
