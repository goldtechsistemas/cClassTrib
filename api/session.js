const { query } = require("./_db");
const { lerSessaoUsuario, encerrarSessaoUsuario } = require("./_lib");

module.exports = async (req, res) => {
  const sessao = lerSessaoUsuario(req);
  if (!sessao) {
    res.status(200).json({ logado: false });
    return;
  }

  try {
    // Confere bloqueado a cada checagem (não só no login) — se um admin
    // bloquear alguém que já está com sessão aberta, o acesso cai na
    // próxima navegação, não só no próximo login.
    const resultado = await query(
      "SELECT nome, bloqueado FROM usuarios WHERE email = $1",
      [sessao.email]
    );
    const registro = resultado.rows[0];
    if (!registro || registro.bloqueado) {
      encerrarSessaoUsuario(res);
      res.status(200).json({ logado: false });
      return;
    }

    res.status(200).json({ logado: true, email: sessao.email, nome: registro.nome });
  } catch (e) {
    console.error(e);
    res.status(200).json({ logado: false });
  }
};
