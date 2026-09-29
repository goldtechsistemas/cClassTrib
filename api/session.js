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
      "SELECT nome, bloqueado, precisa_trocar_senha FROM usuarios WHERE email = $1",
      [sessao.email]
    );
    const registro = resultado.rows[0];
    // precisa_trocar_senha: o admin redefiniu a senha desta conta — a sessão
    // antiga cai e só um novo login (com a senha provisória) volta a valer.
    if (!registro || registro.bloqueado || registro.precisa_trocar_senha) {
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
