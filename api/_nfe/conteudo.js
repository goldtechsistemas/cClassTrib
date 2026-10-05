// Entrega os scripts de dados e de regras do site (api/_conteudo/*.js) só para
// quem tem sessão válida. Eles NÃO ficam mais na pasta pública js/ — o
// vercel.json reescreve /js/<arquivo> para esta rota, então as páginas
// continuam com <script src="js/data.js"> e nada mais mudou nelas.
//
// Proteção, em camadas:
//  1. sem login (ou conta bloqueada) o script não é entregue;
//  2. cada cópia recebe um aviso de direitos autorais e um rótulo do usuário;
//  3. além do rótulo (fácil de apagar), uma impressão digital em caracteres
//     invisíveis é costurada num texto de tela de cada arquivo — se o conteúdo
//     vazar, scripts/rastrear-marca.js diz de qual conta ele saiu.
// Isto não impede uma pessoa logada de salvar o que vê (nada impede, o
// navegador precisa do código para rodar), mas tira o conteúdo do alcance de
// quem não tem conta e deixa rastro de quem copiar.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { exigirUsuario } = require("../_nfeHelpers");
const { lerSessaoUsuario } = require("../_lib");

const PASTA = path.join(__dirname, "..", "_conteudo");

// Tabela NCM oficial (6 MB): dado público do Siscomex — entregue só para
// logados, mas sem a impressão digital (que exigiria recomprimir 6 MB por
// usuário). É servida já comprimida (a resposta de uma função tem limite de
// ~4,5 MB; comprimida fica em ~330 KB).
const ARQUIVOS_SEM_MARCA = new Set(["ncm-tabela.js"]);

// Trecho de texto de TELA de cada arquivo, onde a impressão digital é
// encaixada. NUNCA use texto que seja comparado, gravado em exportações (CSV,
// Excel, PDF) ou usado como chave — a marca invisível iria junto (foi o caso do
// csv.js, por isso ele ficou sem âncora).
const ANCORAS = {
  "data.js": "A Reforma Tributária (LC 214/2025) está em fase",
  "components.js": "É o Código de Classificação Tributária do IBS",
  "rules.js": "Regra padrão do IBS/CBS quando nenhum Anexo",
  "cclasstrib-oficial.js": "Portal Nacional da NF-e / Receita Federal / Comitê",
  "app.js": "Tabela NCM completa não carregada",
  "lote.js": "Nenhum NCM válido encontrado no arquivo",
  "sobre.js": "Nenhum Anexo encontrado com esse filtro",
  "notas-fiscais.js": "Não foi possível carregar as notas.",
  "xlsx.js": "O arquivo não parece ser uma planilha .xlsx válida.",
};

const cache = new Map(); // nome -> { texto, gzip, etag }

function arquivoEmCache(nome) {
  if (cache.has(nome)) return cache.get(nome);
  const texto = fs.readFileSync(path.join(PASTA, nome), "utf8");
  const item = {
    texto,
    gzip: ARQUIVOS_SEM_MARCA.has(nome) ? zlib.gzipSync(Buffer.from(texto), { level: 7 }) : null,
    etag: crypto.createHash("sha1").update(texto).digest("hex").slice(0, 16),
  };
  cache.set(nome, item);
  return item;
}

function nomesPermitidos() {
  return new Set(fs.readdirSync(PASTA).filter((f) => /^[a-z0-9.-]+\.js$/i.test(f)));
}

// 40 bits derivados do e-mail e do segredo do servidor — ninguém consegue
// calcular a impressão digital de uma conta sem o SESSION_SECRET.
function impressaoDigital(email) {
  const hmac = crypto.createHmac("sha256", process.env.SESSION_SECRET || "sem-segredo").update(String(email || "").toLowerCase()).digest();
  return hmac.subarray(0, 5); // 5 bytes = 40 bits
}

const ZERO = "​"; // espaço de largura zero = bit 0
const UM = "‌"; // não-junção de largura zero = bit 1
const BORDA = "⁠"; // word joiner delimita o início e o fim

function codificarInvisivel(bytes) {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  return BORDA + bits.replace(/0/g, ZERO).replace(/1/g, UM) + BORDA;
}

function marcarTexto(nome, texto, email) {
  const marca = impressaoDigital(email);
  const rotulo = marca.toString("hex");
  const aviso =
    `/* © FiscalClass — conteúdo protegido por direitos autorais, licenciado a usuário autorizado (ref. ${rotulo}). ` +
    `Cópia, redistribuição ou uso fora do site é proibido e rastreável. */\n`;
  let corpo = texto;
  const ancora = ANCORAS[nome];
  if (ancora) {
    const i = corpo.indexOf(ancora);
    if (i !== -1) {
      const corte = i + Math.min(6, ancora.length);
      corpo = corpo.slice(0, corte) + codificarInvisivel(marca) + corpo.slice(corte);
    }
  }
  return aviso + corpo;
}

// Núcleo (sem autenticação) — usado pelo handler, pelo servidor de
// desenvolvimento e pelos testes.
function servirConteudo(req, res, nome, email) {
  if (!nomesPermitidos().has(nome)) {
    res.status(404).setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Não encontrado.");
    return;
  }
  const item = arquivoEmCache(nome);
  const aceitaGzip = /\bgzip\b/.test(String((req.headers && req.headers["accept-encoding"]) || ""));

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-cache");
  res.setHeader("Vary", "Cookie, Accept-Encoding");

  if (ARQUIVOS_SEM_MARCA.has(nome)) {
    const etag = `"${item.etag}"`;
    res.setHeader("ETag", etag);
    if (req.headers && req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    if (aceitaGzip) {
      res.setHeader("Content-Encoding", "gzip");
      res.status(200).end(item.gzip);
    } else {
      res.status(200).end(item.texto);
    }
    return;
  }

  const marcado = marcarTexto(nome, item.texto, email);
  const etag = `"${crypto.createHash("sha1").update(marcado).digest("hex").slice(0, 16)}"`;
  res.setHeader("ETag", etag);
  if (req.headers && req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }
  if (aceitaGzip) {
    res.setHeader("Content-Encoding", "gzip");
    res.status(200).end(zlib.gzipSync(Buffer.from(marcado), { level: 6 }));
  } else {
    res.status(200).end(marcado);
  }
}

async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).end();
    return;
  }
  const usuarioId = await exigirUsuario(req, res);
  if (usuarioId == null) return;
  const sessao = lerSessaoUsuario(req);
  servirConteudo(req, res, String((req.query && req.query.arquivo) || ""), sessao && sessao.email);
}

module.exports = handler;
module.exports.servirConteudo = servirConteudo;
module.exports.impressaoDigital = impressaoDigital;
module.exports.codificarInvisivel = codificarInvisivel;
module.exports.ANCORAS = ANCORAS;
module.exports.BORDA = BORDA;
module.exports.ZERO = ZERO;
module.exports.UM = UM;
