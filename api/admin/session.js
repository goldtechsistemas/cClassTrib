const { lerSessaoAdmin } = require("../_lib");
const { query } = require("../_db");

module.exports = async (req, res) => {
  const sessao = lerSessaoAdmin(req);
  if (!sessao) {
    res.status(200).json({ logado: false });
    return;
  }
  let temSegundaSenha = true;
  try {
    const r = await query("SELECT segunda_senha_hash IS NOT NULL AS tem FROM admins WHERE email = $1", [sessao.email]);
    temSegundaSenha = r.rows[0] ? r.rows[0].tem : true;
  } catch (e) {
    // coluna ausente ou banco indisponível: não atrapalha a sessão
  }
  res.status(200).json({ logado: true, email: sessao.email, temSegundaSenha });
};
