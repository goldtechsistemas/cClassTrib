const { encerrarSessaoUsuario } = require("./_lib");

module.exports = async (req, res) => {
  encerrarSessaoUsuario(res);
  res.status(200).json({ ok: true });
};
