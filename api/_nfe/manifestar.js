const { query } = require("../_db");
const { exigirUsuario } = require("../_nfeHelpers");
const { corpoJson } = require("../_lib");
const { decryptSecret } = require("../_crypto");
const { extrairParaMtls } = require("../_certUtils");
const { enviarManifestacaoDestinatario, ErroSefaz, TP_EVENTO_CIENCIA, TP_EVENTO_CONFIRMACAO } = require("../_sefazClient");
const { completarXmlPorChave, esperar } = require("../_nfeSync");

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
  if (documento.manifestacao !== "nenhuma") {
    let erro = "Esta nota ja esta sendo manifestada (provavelmente por uma sincronizacao automatica em andamento).";
    if (documento.manifestacao === "ciencia") erro = "Esta nota ja teve Ciencia da Operacao registrada.";
    else if (documento.manifestacao === "confirmacao") erro = "Esta nota ja teve Confirmacao da Operacao registrada.";
    res.status(409).json({ ok: false, erro });
    return;
  }

  // Reivindica a nota atomicamente antes de chamar a SEFAZ — evita manifestar
  // a mesma nota duas vezes se a sincronizacao automatica estiver rodando ao
  // mesmo tempo (mesmo padrao usado em _nfeSync.js).
  const reivindicada = await query(
    "UPDATE nfe_documentos SET manifestacao = 'enviando' WHERE id = $1 AND manifestacao = 'nenhuma' RETURNING id",
    [documento.id]
  );
  if (!reivindicada.rows.length) {
    res.status(409).json({ ok: false, erro: "Esta nota ja esta sendo manifestada (provavelmente por uma sincronizacao automatica em andamento)." });
    return;
  }

  let certPem, keyPem;
  try {
    const pfxBuffer = decryptSecret(empresa.cert_encrypted);
    const senha = decryptSecret(empresa.cert_password_encrypted).toString("utf8");
    ({ certPem, keyPem } = extrairParaMtls(pfxBuffer, senha));
  } catch (e) {
    console.error(e);
    await query("UPDATE nfe_documentos SET manifestacao = 'nenhuma' WHERE id = $1", [documento.id]).catch(() => {});
    res.status(500).json({ ok: false, erro: "Nao foi possivel carregar o certificado salvo." });
    return;
  }

  let resultado;
  try {
    resultado = await enviarManifestacaoDestinatario({
      ambiente: empresa.ambiente,
      cnpj: empresa.cnpj,
      chNFe,
      certPem,
      keyPem,
      tpEvento: TP_EVENTO_CIENCIA,
    });
    // Ciencia da Operacao so vale ate 10 dias apos a autorizacao da NF-e
    // (cStat 596 depois disso). Confirmacao da Operacao cobre o mesmo
    // proposito (libera o XML completo) com prazo bem maior — so tentada
    // como fallback explicito quando a Ciencia e rejeitada por prazo, nunca
    // como primeira tentativa (e uma afirmacao fiscal mais forte: "essa
    // operacao realmente aconteceu").
    if (resultado.prazoExpirado) {
      resultado = await enviarManifestacaoDestinatario({
        ambiente: empresa.ambiente,
        cnpj: empresa.cnpj,
        chNFe,
        certPem,
        keyPem,
        tpEvento: TP_EVENTO_CONFIRMACAO,
      });
    }
  } catch (e) {
    const mensagem = e instanceof ErroSefaz ? e.message : "Erro inesperado ao enviar a manifestacao.";
    if (!(e instanceof ErroSefaz)) console.error(e);
    await query("UPDATE nfe_documentos SET manifestacao = 'nenhuma' WHERE id = $1", [documento.id]).catch(() => {});
    res.status(502).json({ ok: false, erro: mensagem });
    return;
  }

  const statusManifestacao = resultado.tpEvento === TP_EVENTO_CONFIRMACAO ? "confirmacao" : "ciencia";
  const nomeEvento = resultado.tpEvento === TP_EVENTO_CONFIRMACAO ? "Confirmacao da Operacao" : "Ciencia da Operacao";

  if (resultado.jaManifestada) {
    // cStat 573 (Duplicidade de Evento): a manifestacao ja existe na SEFAZ
    // (dada antes por outra ferramenta ou manualmente no site da Receita) —
    // nao e uma rejeicao de verdade, so nao temos o XML do evento original
    // pra guardar em nfe_eventos.
    await query("UPDATE nfe_documentos SET manifestacao = $2 WHERE id = $1", [documento.id, statusManifestacao]);
    const xmlObtido = await tentarTrazerXmlCompleto(empresa, documento.id, { certPem, keyPem });
    res.status(200).json({
      ok: true,
      cStat: resultado.cStat,
      xMotivo: resultado.xMotivo,
      xmlCompleto: xmlObtido,
      mensagem: xmlObtido
        ? `Esta nota ja tinha ${nomeEvento} registrada na SEFAZ. XML completo baixado.`
        : `Esta nota ja tinha ${nomeEvento} registrada na SEFAZ. O XML completo sera buscado ao baixar o PDF.`,
    });
    return;
  }

  if (!resultado.sucesso) {
    await query("UPDATE nfe_documentos SET manifestacao = 'nenhuma' WHERE id = $1", [documento.id]).catch(() => {});
    res.status(422).json({ ok: false, erro: `SEFAZ rejeitou o evento (cStat ${resultado.cStat}): ${resultado.xMotivo}` });
    return;
  }

  await query("UPDATE nfe_documentos SET manifestacao = $2 WHERE id = $1", [documento.id, statusManifestacao]);
  await query(
    "INSERT INTO nfe_eventos (empresa_id, ch_nfe, tp_evento, n_seq_evento, xml, dh_evento) VALUES ($1,$2,$3,$4,$5,now())",
    [empresaId, chNFe, String(resultado.tpEvento), 1, resultado.eventoAssinadoXml]
  );

  const xmlObtido = await tentarTrazerXmlCompleto(empresa, documento.id, { certPem, keyPem });
  const prefixo =
    resultado.tpEvento === TP_EVENTO_CONFIRMACAO
      ? "Ciencia da Operacao estava fora do prazo (10 dias) — Confirmacao da Operacao foi registrada em vez dela."
      : "Ciencia da Operacao registrada.";
  res.status(200).json({
    ok: true,
    cStat: resultado.cStat,
    xMotivo: resultado.xMotivo,
    tpEvento: resultado.tpEvento,
    xmlCompleto: xmlObtido,
    mensagem: xmlObtido
      ? `${prefixo} XML completo baixado — o PDF ja sai como DANFE.`
      : `${prefixo} Nao foi possivel trazer o XML completo agora (a SEFAZ ainda esta liberando ou o servico de distribuicao esta lento); ele sera buscado de novo automaticamente ao baixar o PDF.`,
  });
};

// A SEFAZ costuma levar alguns segundos entre registrar o evento (cStat 135)
// e liberar o XML completo na consulta por chave — uma espera curta antes da
// unica tentativa aqui; se ainda nao vier, o download do PDF tenta de novo.
const ESPERA_ANTES_DE_BUSCAR_XML_MS = 1500;

async function tentarTrazerXmlCompleto(empresa, documentoId, cert) {
  await esperar(ESPERA_ANTES_DE_BUSCAR_XML_MS);
  const r = await query("SELECT * FROM nfe_documentos WHERE id = $1", [documentoId]);
  if (!r.rows.length) return false;
  const atualizado = await completarXmlPorChave(empresa, r.rows[0], cert);
  return !!atualizado.xml_completo;
}
