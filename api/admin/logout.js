const { encerrarSessaoAdmin, encerrarEtapa2Admin } = require("../_lib");

module.exports = async (req, res) => {
  encerrarSessaoAdmin(res);
  encerrarEtapa2Admin(res);
  res.status(200).json({ ok: true });
};
