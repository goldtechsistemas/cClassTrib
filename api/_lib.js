const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const NOME_COOKIE_USUARIO = "cclasstrib_sessao";
const NOME_COOKIE_ADMIN = "cclasstrib_admin_sessao";

function segredo() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET não configurado.");
  return s;
}

function lerCookies(req) {
  const cabecalho = req.headers.cookie;
  const cookies = {};
  if (!cabecalho) return cookies;
  cabecalho.split(";").forEach((parte) => {
    const idx = parte.indexOf("=");
    if (idx === -1) return;
    const chave = parte.slice(0, idx).trim();
    const valor = parte.slice(idx + 1).trim();
    cookies[chave] = decodeURIComponent(valor);
  });
  return cookies;
}

/**
 * Monta o cabeçalho Set-Cookie. Sem maxAgeSegundos = cookie "de sessão"
 * (some quando o navegador fecha, usado quando "Deseja salvar seu login?"
 * não foi marcado). Com maxAgeSegundos = cookie persistente.
 */
function montarSetCookie(nome, valor, maxAgeSegundos) {
  const partes = [
    `${nome}=${encodeURIComponent(valor)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ];
  if (maxAgeSegundos) partes.push(`Max-Age=${maxAgeSegundos}`);
  return partes.join("; ");
}

function montarClearCookie(nome) {
  return `${nome}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function adicionarSetCookie(res, valor) {
  const atual = res.getHeader("Set-Cookie");
  if (!atual) {
    res.setHeader("Set-Cookie", valor);
  } else if (Array.isArray(atual)) {
    res.setHeader("Set-Cookie", [...atual, valor]);
  } else {
    res.setHeader("Set-Cookie", [atual, valor]);
  }
}

const SEGUNDOS_LEMBRADO = 60 * 60 * 24 * 180; // 180 dias
const EXPIRACAO_JWT_LEMBRADO = "180d";
const EXPIRACAO_JWT_NORMAL = "1d"; // rede de segurança; o cookie de sessão já some ao fechar o navegador

function iniciarSessaoUsuario(res, dados, lembrar) {
  const token = jwt.sign({ tipo: "usuario", ...dados, lembrar: !!lembrar }, segredo(), {
    expiresIn: lembrar ? EXPIRACAO_JWT_LEMBRADO : EXPIRACAO_JWT_NORMAL,
  });
  adicionarSetCookie(
    res,
    montarSetCookie(NOME_COOKIE_USUARIO, token, lembrar ? SEGUNDOS_LEMBRADO : undefined)
  );
}

function encerrarSessaoUsuario(res) {
  adicionarSetCookie(res, montarClearCookie(NOME_COOKIE_USUARIO));
}

function lerSessaoUsuario(req) {
  const cookies = lerCookies(req);
  const token = cookies[NOME_COOKIE_USUARIO];
  if (!token) return null;
  try {
    const dados = jwt.verify(token, segredo());
    if (dados.tipo !== "usuario") return null;
    return dados;
  } catch (e) {
    return null;
  }
}

// Primeiro acesso de uma conta criada pelo administrador: depois de acertar a
// senha provisória o usuário NÃO recebe a sessão normal — só esta permissão
// curta, que vale apenas pra definir a senha nova (api/conta/senha-inicial).
// Tem tipo próprio ("troca-senha"), então lerSessaoUsuario() (que exige
// tipo "usuario") a ignora em todas as outras rotas.
const NOME_COOKIE_TROCA = "cclasstrib_troca_senha";
const SEGUNDOS_TROCA_SENHA = 60 * 15;

function iniciarTrocaSenha(res, dados) {
  const token = jwt.sign({ tipo: "troca-senha", ...dados }, segredo(), { expiresIn: SEGUNDOS_TROCA_SENHA });
  adicionarSetCookie(res, montarSetCookie(NOME_COOKIE_TROCA, token, SEGUNDOS_TROCA_SENHA));
}

function encerrarTrocaSenha(res) {
  adicionarSetCookie(res, montarClearCookie(NOME_COOKIE_TROCA));
}

function lerTrocaSenha(req) {
  const token = lerCookies(req)[NOME_COOKIE_TROCA];
  if (!token) return null;
  try {
    const dados = jwt.verify(token, segredo());
    return dados.tipo === "troca-senha" ? dados : null;
  } catch (e) {
    return null;
  }
}

function iniciarSessaoAdmin(res, dados) {
  const token = jwt.sign({ tipo: "admin", ...dados }, segredo(), { expiresIn: "12h" });
  adicionarSetCookie(res, montarSetCookie(NOME_COOKIE_ADMIN, token, 60 * 60 * 12));
}

function encerrarSessaoAdmin(res) {
  adicionarSetCookie(res, montarClearCookie(NOME_COOKIE_ADMIN));
}

function lerSessaoAdmin(req) {
  const cookies = lerCookies(req);
  const token = cookies[NOME_COOKIE_ADMIN];
  if (!token) return null;
  try {
    const dados = jwt.verify(token, segredo());
    if (dados.tipo !== "admin") return null;
    return dados;
  } catch (e) {
    return null;
  }
}

// Sem caracteres que se confundem ao ler/copiar (0/O, 1/l/I).
const ALFABETO_SENHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function gerarSenhaProvisoria(tamanho = 12) {
  let senha = "";
  for (let i = 0; i < tamanho; i++) senha += ALFABETO_SENHA[crypto.randomInt(ALFABETO_SENHA.length)];
  return senha;
}

function corpoJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length) {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }
  return {};
}

module.exports = {
  corpoJson,
  gerarSenhaProvisoria,
  iniciarSessaoUsuario,
  encerrarSessaoUsuario,
  lerSessaoUsuario,
  iniciarTrocaSenha,
  encerrarTrocaSenha,
  lerTrocaSenha,
  iniciarSessaoAdmin,
  encerrarSessaoAdmin,
  lerSessaoAdmin,
};
