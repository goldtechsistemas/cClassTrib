const { query } = require("../_db");
const { exigirUsuario, exigirEmpresaDoUsuario } = require("../_nfeHelpers");
const { montarFiltroDocumentos } = require("../_nfeFiltros");
const { completarXmlPorChave, certificadoDaEmpresa, esperar, consultaPorChaveBloqueada } = require("../_nfeSync");
const JSZip = require("jszip");

// Mesma lógica do PDF em lote: poucas buscas por chave por download (a SEFAZ
// limita a 20 por hora por CNPJ), com teto de tempo.
const LIMITE_BUSCAS_POR_CHAVE = 5;
const PAUSA_ENTRE_BUSCAS_MS = 1000;
const ORCAMENTO_BUSCAS_MS = 20000;

function motivoSemXml(doc, cotaEsgotada) {
  if (doc.situacao === "denegada" || doc.situacao === "cancelada") {
    return `nota ${doc.situacao} — a SEFAZ não disponibiliza o XML completo`;
  }
  if (doc.manifestacao === "ciencia" || doc.manifestacao === "confirmacao") {
    return cotaEsgotada
      ? "já manifestada; a SEFAZ limitou as buscas desta hora — o XML chega na próxima sincronização"
      : "já manifestada; a SEFAZ ainda não liberou o XML — ele chega na próxima sincronização";
  }
  return 'ainda não manifestada — clique em "Dar ciência" (ou "Sincronizar agora") para liberar o XML completo';
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }
  const usuarioId = await exigirUsuario(req, res);
  if (usuarioId == null) return;

  const empresaId = req.query && req.query.empresaId;
  const empresa = await exigirEmpresaDoUsuario(req, res, usuarioId, empresaId);
  if (!empresa) return;

  const params = [empresaId];
  const filtro = montarFiltroDocumentos(req.query || {}, params);
  const r = await query(
    `SELECT * FROM nfe_documentos WHERE empresa_id = $1${filtro} ORDER BY dh_emi DESC NULLS LAST`,
    params
  );
  if (!r.rows.length) {
    res.status(404).json({ ok: false, erro: "Nenhuma nota encontrada para exportar." });
    return;
  }

  const pendentesDeXml = r.rows
    .map((doc, i) => ({ doc, i }))
    .filter(({ doc }) => !doc.xml_completo && ["ciencia", "confirmacao"].includes(doc.manifestacao))
    .slice(0, LIMITE_BUSCAS_POR_CHAVE);
  if (pendentesDeXml.length && !consultaPorChaveBloqueada(empresa)) {
    let cert = null;
    try {
      cert = certificadoDaEmpresa(empresa);
    } catch (e) {
      console.error("Nao foi possivel carregar o certificado para buscar XML por chave:", e.message || e);
    }
    if (cert) {
      const prazoFinal = Date.now() + ORCAMENTO_BUSCAS_MS;
      for (const [n, { doc, i }] of pendentesDeXml.entries()) {
        if (Date.now() >= prazoFinal || consultaPorChaveBloqueada(empresa)) break;
        if (n > 0) await esperar(PAUSA_ENTRE_BUSCAS_MS);
        r.rows[i] = await completarXmlPorChave(empresa, doc, cert);
        if (n === 0 && !r.rows[i].xml_completo) break;
      }
    }
  }

  const comXml = r.rows.filter((doc) => doc.xml_completo);
  const semXml = r.rows.filter((doc) => !doc.xml_completo);
  if (!comXml.length) {
    res.status(404).json({
      ok: false,
      erro: 'Nenhuma das notas filtradas tem o XML completo disponível ainda. Clique em "Sincronizar agora" para manifestar as pendentes e buscar o XML.',
    });
    return;
  }

  const zip = new JSZip();
  for (const doc of comXml) {
    zip.file(`${doc.ch_nfe}.xml`, doc.xml_completo);
  }
  if (semXml.length) {
    const cotaEsgotada = consultaPorChaveBloqueada(empresa);
    const linhas = [
      `${comXml.length} de ${r.rows.length} nota(s) exportada(s). As ${semXml.length} abaixo ficaram de fora porque ainda não têm o XML completo:`,
      "",
      ...semXml.map(
        (doc) =>
          `- Nº ${doc.numero || "?"} | ${doc.emit_nome || "emitente desconhecido"} | ${
            doc.dh_emi ? new Date(doc.dh_emi).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "sem data"
          } | chave ${doc.ch_nfe} | ${motivoSemXml(doc, cotaEsgotada)}`
      ),
    ];
    zip.file("NOTAS-SEM-XML.txt", linhas.join("\r\n"));
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="xml-notas-${empresa.cnpj}.zip"`);
  res.status(200).end(buffer);
};
