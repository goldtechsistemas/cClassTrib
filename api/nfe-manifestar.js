const { query } = require("./_db");
const { exigirUsuario } = require("./_nfeHelpers");
const { corpoJson } = require("./_lib");
const { decryptSecret } = require("./_crypto");
const { extrairParaMtls } = require("./_certUtils");
const { enviarManifestacaoCiencia, ErroSefaz } = require("./_sefazClient");

// Rota chamada pelo botao "Dar ciencia" de uma nota especifica na tela.
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, erro: "Metodo nao permitido." });
    return;
  }
  const usuarioId = await exigirUsuario(req, res);
  if (usuarioId == null) return;

  const corpo = corpoJson(req);
  const empresaId = corpo.empresaId;
  const chNFe = String(corpo.chNFe || "").trim();
  if (!empresaId || !chNFe || chNFe.length !== 44) {
    res.status(400).json({ ok: false, erro: "Informe a empresa e a chave de acesso da nota (44 digitos)." });
    return;
  }

  const rEmpresa = await query("SELECT * FROM nfe_empresas WHERE id = $1 AND usuario_id = $2", [empresaId, usuarioId]);
  const empresa = rEmpresa.rows[0];
  if (!empresa) {
    res.status(404).json({ ok: false, erro: "Empresa nao encontrada." });
    return;
  }

  const rDoc = await query("SELECT * FROM nfe_documentos WHERE empresa_id = $1 AND ch_nfe = $2", [empresaId, chNFe]);
  const documento = rDoc.rows[0];
  if (!documento) {
    res.status(404).json({ ok: false, erro: "Nota nao encontrada para esta empresa." });
    return;
  }
  if (documento.manifestacao === "ciencia") {
    res.status(409).json({ ok: false, erro: "Esta nota ja teve Ciencia da Operacao registrada." });
    return;
  }

  let certPem, keyPem;
  try {
    const pfxBuffer = decryptSecret(empresa.cert_encrypted);
    const senha = decryptSecret(empresa.cert_password_encrypted).toString("utf8");
    ({ certPem, keyPem } = extrairParaMtls(pfxBuffer, senha));
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Nao foi possivel carregar o certificado salvo." });
    return;
  }

  let resultado;
  try {
    resultado = await enviarManifestacaoCiencia({
      ambiente: empresa.ambiente,
      uf: empresa.uf,
      cnpj: empresa.cnpj,
      chNFe,
      certPem,
      keyPem,
    });
  } catch (e) {
    const mensagem = e instanceof ErroSefaz ? e.message : "Erro inesperado ao enviar a manifestacao.";
    if (!(e instanceof ErroSefaz)) console.error(e);
    res.status(502).json({ ok: false, erro: mensagem });
    return;
  }

  if (!resultado.sucesso) {
    res.status(422).json({ ok: false, erro: `SEFAZ rejeitou o evento (cStat ${resultado.cStat}): ${resultado.xMotivo}` });
    return;
  }

  await query("UPDATE nfe_documentos SET manifestacao = 'ciencia' WHERE id = $1", [documento.id]);
  await query(
    "INSERT INTO nfe_eventos (empresa_id, ch_nfe, tp_evento, n_seq_evento, xml, dh_evento) VALUES ($1,$2,$3,$4,$5,now())",
    [empresaId, chNFe, "210210", 1, resultado.eventoAssinadoXml]
  );

  res.status(200).json({
    ok: true,
    cStat: resultado.cStat,
    xMotivo: resultado.xMotivo,
    mensagem: "Ciencia da Operacao registrada. O XML completo costuma ficar disponivel numa proxima sincronizacao.",
  });
};
