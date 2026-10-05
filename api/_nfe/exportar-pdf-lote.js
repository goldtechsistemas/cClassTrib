const { query } = require("../_db");
const { exigirUsuario, exigirEmpresaDoUsuario } = require("../_nfeHelpers");
const { montarFiltroDocumentos } = require("../_nfeFiltros");
const { gerarPdfParaDocumento } = require("../_pdfResumo");
const { completarXmlPorChave, certificadoDaEmpresa, esperar } = require("../_nfeSync");
const JSZip = require("jszip");

const CONCORRENCIA = 5; // gera até 5 PDFs em paralelo (CPU-bound: barcode + layout) em vez de um por um
// Cada busca por chave é uma chamada à SEFAZ e consome a cota de 20 consultas
// por hora por CNPJ — limitado pra não esgotar a cota num só download; as que
// sobrarem saem como resumo e chegam pela sincronização (feed por NSU).
const LIMITE_BUSCAS_POR_CHAVE = 5;
const PAUSA_ENTRE_BUSCAS_MS = 1000;
// Teto de tempo total gasto buscando XML por chave num lote — se a SEFAZ
// estiver lenta, para de tentar e entrega o ZIP com o que já tiver, em vez de
// deixar o usuário esperando (ou estourar o tempo máximo da função).
const ORCAMENTO_BUSCAS_MS = 20000;

// Parte dos 60s da função fica reservada pra buscar XML por chave (acima),
// montar o ZIP e responder.
const ORCAMENTO_GERACAO_PDF_MS = 42000;

module.exports = async (req, res) => {
  const inicioChamada = Date.now();
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
    res.status(404).json({ ok: false, erro: "Nenhuma nota encontrada para gerar PDF." });
    return;
  }

  const pendentesDeXml = r.rows
    .map((doc, i) => ({ doc, i }))
    .filter(({ doc }) => !doc.xml_completo && ["ciencia", "confirmacao"].includes(doc.manifestacao))
    .slice(0, LIMITE_BUSCAS_POR_CHAVE);
  if (pendentesDeXml.length) {
    let cert = null;
    try {
      cert = certificadoDaEmpresa(empresa);
    } catch (e) {
      console.error("Nao foi possivel carregar o certificado para buscar XML por chave:", e.message || e);
    }
    if (cert) {
      const prazoFinal = Date.now() + ORCAMENTO_BUSCAS_MS;
      for (const [n, { doc, i }] of pendentesDeXml.entries()) {
        if (Date.now() >= prazoFinal) break;
        if (n > 0) await esperar(PAUSA_ENTRE_BUSCAS_MS);
        r.rows[i] = await completarXmlPorChave(empresa, doc, cert);
        // Primeira busca falhou (normalmente timeout = serviço de distribuição
        // lento) — as demais quase certamente também falhariam; não insiste.
        if (n === 0 && !r.rows[i].xml_completo) break;
      }
    }
  }

  // A função morre aos 60s: com centenas de notas não dá pra gerar todos os
  // PDFs numa chamada só. Para antes do limite e entrega o ZIP com o que deu
  // tempo, listando as notas que ficaram de fora (o usuário baixa o resto
  // filtrando por período ou selecionando as notas).
  const zip = new JSZip();
  const prazoGeracao = inicioChamada + ORCAMENTO_GERACAO_PDF_MS;
  let geradas = 0;
  for (let i = 0; i < r.rows.length; i += CONCORRENCIA) {
    if (Date.now() >= prazoGeracao) break;
    const lote = r.rows.slice(i, i + CONCORRENCIA);
    const buffers = await Promise.all(lote.map((doc) => gerarPdfParaDocumento(doc)));
    lote.forEach((doc, j) => zip.file(`${doc.ch_nfe}.pdf`, buffers[j]));
    geradas += lote.length;
  }
  if (geradas < r.rows.length) {
    const faltantes = r.rows.slice(geradas);
    zip.file(
      "NOTAS-NAO-GERADAS.txt",
      [
        `${geradas} de ${r.rows.length} PDF(s) gerado(s). O tempo máximo da geração acabou antes de terminar.`,
        "Baixe as demais filtrando por um período menor ou selecionando só essas notas:",
        "",
        ...faltantes.map(
          (doc) =>
            `- Nº ${doc.numero || "?"} | ${doc.emit_nome || "emitente desconhecido"} | chave ${doc.ch_nfe}`
        ),
      ].join("\r\n")
    );
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="pdf-notas-${empresa.cnpj}.zip"`);
  res.status(200).end(buffer);
};
