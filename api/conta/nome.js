const { query } = require("../_db");
const { corpoJson, lerSessaoUsuario, iniciarSessaoUsuario } = require("../_lib");

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

  const novoNome = String(corpoJson(req).nome || "").trim();
  if (!novoNome) {
    res.status(400).json({ ok: false, erro: "Preencha o nome." });
    return;
  }

  try {
    await query("UPDATE usuarios SET nome = $1 WHERE email = $2", [novoNome, sessao.email]);
    iniciarSessaoUsuario(res, { email: sessao.email, nome: novoNome }, sessao.lembrar);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro interno." });
  }
};
