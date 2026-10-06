// Login do admin em duas etapas, tudo nesta função (a Vercel Hobby limita o
// número de funções do projeto):
//   (sem etapa)     e-mail + senha → se estiverem certos NÃO abre a sessão: entrega
//                   uma permissão curta e diz qual é a próxima etapa;
//   etapa "segunda" confere a segunda senha de confirmação e abre a sessão;
//   etapa "criar"   primeiro acesso (admin ainda sem segunda senha): cria a
//                   segunda senha e abre a sessão;
//   etapa "alterar" já logado: troca a senha e/ou a segunda senha.
const bcrypt = require("bcryptjs");
const { query } = require("../_db");
const { corpoJson, iniciarSessaoAdmin, lerSessaoAdmin, iniciarEtapa2Admin, encerrarEtapa2Admin, lerEtapa2Admin } = require("../_lib");
const { minutosBloqueado, registrarFalha, limparFalhas, mensagemBloqueio } = require("../_limite");

const TAMANHO_MINIMO_SENHA = 8;
const HASH_FALSO = "$2a$12$dPQp9WPlrOWpdt5.DNN2qeu9IPW/wj2mdyM4dcN.lGlFgE8LWgcHG"; // iguala o tempo de resposta quando o e-mail não existe

const erroSenhas = { ok: false, erro: "E-mail ou senha incorretos." };
const erroExpirou = { ok: false, erro: "Sessão de login expirada. Informe e-mail e senha de novo.", voltar: true };

// Valida uma senha nova (tamanho e confirmação); devolve a mensagem de erro ou null.
function erroSenhaNova(nova, confirmar, nome) {
  if (String(nova || "").length < TAMANHO_MINIMO_SENHA) return `${nome} precisa ter no mínimo ${TAMANHO_MINIMO_SENHA} caracteres.`;
  if (nova !== confirmar) return `A confirmação (${nome.toLowerCase()}) não confere.`;
  return null;
}

async function etapaSenha(req, res, corpo) {
  const email = String(corpo.email || "").trim().toLowerCase();
  const senha = String(corpo.senha || "");

  const minutos = await minutosBloqueado(req, "admin", email);
  if (minutos) return res.status(429).json({ ok: false, erro: mensagemBloqueio(minutos) });

  const r = await query("SELECT senha_hash, segunda_senha_hash IS NOT NULL AS tem_segunda FROM admins WHERE email = $1", [email]);
  const registro = r.rows[0];
  if (!registro) {
    await bcrypt.compare(senha, HASH_FALSO);
    await registrarFalha(req, "admin", email);
    return res.status(401).json(erroSenhas);
  }
  if (!(await bcrypt.compare(senha, registro.senha_hash))) {
    await registrarFalha(req, "admin", email);
    return res.status(401).json(erroSenhas);
  }
  // 1ª senha certa: ainda não limpa as falhas (só no fim da 2ª etapa), para que
  // errar a segunda senha continue contando contra o limite.
  iniciarEtapa2Admin(res, { email, criar: !registro.tem_segunda });
  res.status(200).json({ ok: true, etapa: registro.tem_segunda ? "segunda" : "criar" });
}

async function etapaSegunda(req, res, corpo) {
  const permissao = lerEtapa2Admin(req);
  if (!permissao || permissao.criar) return res.status(401).json(erroExpirou);
  const email = permissao.email;
  const minutos = await minutosBloqueado(req, "admin", email);
  if (minutos) return res.status(429).json({ ok: false, erro: mensagemBloqueio(minutos) });

  const r = await query("SELECT segunda_senha_hash FROM admins WHERE email = $1", [email]);
  const hash = r.rows[0] && r.rows[0].segunda_senha_hash;
  if (!hash) return res.status(401).json(erroExpirou);
  if (!(await bcrypt.compare(String(corpo.segundaSenha || ""), hash))) {
    await registrarFalha(req, "admin", email);
    return res.status(401).json({ ok: false, erro: "Segunda senha incorreta." });
  }
  await limparFalhas(req, "admin", email);
  encerrarEtapa2Admin(res);
  iniciarSessaoAdmin(res, { email });
  res.status(200).json({ ok: true, email });
}

async function etapaCriar(req, res, corpo) {
  const permissao = lerEtapa2Admin(req);
  if (!permissao || !permissao.criar) return res.status(401).json(erroExpirou);
  const email = permissao.email;
  const nova = String(corpo.novaSegunda || "");
  const msg = erroSenhaNova(nova, String(corpo.confirmarSegunda || ""), "A segunda senha");
  if (msg) return res.status(400).json({ ok: false, erro: msg });

  const r = await query("SELECT senha_hash FROM admins WHERE email = $1", [email]);
  if (!r.rows[0]) return res.status(401).json(erroExpirou);
  if (await bcrypt.compare(nova, r.rows[0].senha_hash)) {
    return res.status(400).json({ ok: false, erro: "A segunda senha precisa ser diferente da primeira." });
  }
  // Só grava se ainda não existir (evita sobrescrever a de um acesso concorrente).
  const hash = await bcrypt.hash(nova, 12);
  const u = await query("UPDATE admins SET segunda_senha_hash = $2 WHERE email = $1 AND segunda_senha_hash IS NULL", [email, hash]);
  if (!u.rowCount) {
    return res.status(409).json({ ok: false, erro: "A segunda senha já foi criada. Entre com e-mail, senha e segunda senha.", voltar: true });
  }
  await limparFalhas(req, "admin", email);
  encerrarEtapa2Admin(res);
  iniciarSessaoAdmin(res, { email });
  res.status(200).json({ ok: true, email });
}

async function etapaAlterar(req, res, corpo) {
  const sessao = lerSessaoAdmin(req);
  if (!sessao) return res.status(401).json({ ok: false, erro: "Não autorizado." });
  const email = sessao.email;
  const minutos = await minutosBloqueado(req, "admin", email);
  if (minutos) return res.status(429).json({ ok: false, erro: mensagemBloqueio(minutos) });

  const r = await query("SELECT senha_hash, segunda_senha_hash FROM admins WHERE email = $1", [email]);
  const reg = r.rows[0];
  if (!reg) return res.status(401).json({ ok: false, erro: "Não autorizado." });

  const novaSenha = String(corpo.novaSenha || "");
  const novaSegunda = String(corpo.novaSegunda || "");
  if (!novaSenha && !novaSegunda) return res.status(400).json({ ok: false, erro: "Informe a nova senha e/ou a nova segunda senha." });
  if (novaSenha) {
    const m = erroSenhaNova(novaSenha, String(corpo.confirmarSenha || ""), "A nova senha");
    if (m) return res.status(400).json({ ok: false, erro: m });
  }
  if (novaSegunda) {
    const m = erroSenhaNova(novaSegunda, String(corpo.confirmarSegunda || ""), "A nova segunda senha");
    if (m) return res.status(400).json({ ok: false, erro: m });
  }
  if (novaSenha && novaSenha === novaSegunda) {
    return res.status(400).json({ ok: false, erro: "As duas senhas precisam ser diferentes entre si." });
  }

  // Confirma quem está pedindo: senha atual e, se já existir, a segunda senha atual.
  const certaSenha = await bcrypt.compare(String(corpo.senhaAtual || ""), reg.senha_hash);
  const certaSegunda = reg.segunda_senha_hash ? await bcrypt.compare(String(corpo.segundaAtual || ""), reg.segunda_senha_hash) : true;
  if (!certaSenha || !certaSegunda) {
    await registrarFalha(req, "admin", email);
    return res.status(401).json({ ok: false, erro: !certaSenha ? "A senha atual está incorreta." : "A segunda senha atual está incorreta." });
  }
  // A senha que continua valendo também não pode ficar igual à nova da outra.
  if (novaSenha && !novaSegunda && reg.segunda_senha_hash && (await bcrypt.compare(novaSenha, reg.segunda_senha_hash))) {
    return res.status(400).json({ ok: false, erro: "A nova senha não pode ser igual à segunda senha." });
  }
  if (novaSegunda && !novaSenha && (await bcrypt.compare(novaSegunda, reg.senha_hash))) {
    return res.status(400).json({ ok: false, erro: "A segunda senha precisa ser diferente da primeira." });
  }
  const hashSenha = novaSenha ? await bcrypt.hash(novaSenha, 12) : reg.senha_hash;
  const hashSegunda = novaSegunda ? await bcrypt.hash(novaSegunda, 12) : reg.segunda_senha_hash;
  await query("UPDATE admins SET senha_hash = $2, segunda_senha_hash = $3 WHERE email = $1", [email, hashSenha, hashSegunda]);
  await limparFalhas(req, "admin", email);
  res.status(200).json({ ok: true, temSegundaSenha: !!hashSegunda });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }
  const corpo = corpoJson(req);
  const etapas = { segunda: etapaSegunda, criar: etapaCriar, alterar: etapaAlterar };
  try {
    await (etapas[corpo.etapa] || etapaSenha)(req, res, corpo);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro interno ao entrar." });
  }
};
