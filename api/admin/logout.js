const { encerrarSessaoAdmin } = require("../_lib");

module.exports = async (req, res) => {
  encerrarSessaoAdmin(res);
  res.status(200).json({ ok: true });
};
