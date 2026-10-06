const { lerSessaoAdmin } = require("../_lib");

module.exports = async (req, res) => {
  const sessao = lerSessaoAdmin(req);
  if (!sessao) {
    res.status(200).json({ logado: false });
    return;
  }
  res.status(200).json({ logado: true, email: sessao.email });
};
