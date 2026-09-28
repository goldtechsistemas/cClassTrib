const { query } = require("./_db");
const { exigirUsuario, empresaParaSaida } = require("./_nfeHelpers");
const { carregarCertificado, CertificadoInvalido } = require("./_certUtils");
const { encryptSecret } = require("./_crypto");
const { corpoJson } = require("./_lib");

const TAMANHO_MAX_PFX = 16 * 1024; // certificados A1 sao pequenos; generoso
const TAMANHO_MAX_BASE64 = Math.ceil(TAMANHO_MAX_PFX / 3) * 4 + 100;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }
  const usuarioId = await exigirUsuario(req, res);
  if (usuarioId == null) return;

  const corpo = corpoJson(req);
  const senha = String(corpo.senha || "");
  const arquivoBase64 = String(corpo.arquivoBase64 || "");
  const empresaId = corpo.empresaId; // "novo" (cria) ou id numerico (atualiza certificado de uma empresa ja existente)

  if (!senha) {
    res.status(400).json({ ok: false, erro: "Informe a senha do certificado." });
    return;
  }
  if (!arquivoBase64 || arquivoBase64.length > TAMANHO_MAX_BASE64) {
    res.status(400).json({ ok: false, erro: "Arquivo ausente ou grande demais para ser um certificado A1 (.pfx) válido." });
    return;
  }

  let buffer;
  try {
    buffer = Buffer.from(arquivoBase64, "base64");
  } catch (e) {
    res.status(400).json({ ok: false, erro: "Arquivo inválido." });
    return;
  }

  let info;
  try {
    info = carregarCertificado(buffer, senha);
  } catch (e) {
    if (e instanceof CertificadoInvalido) {
      res.status(400).json({ ok: false, erro: e.message });
      return;
    }
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro ao processar o certificado." });
    return;
  }

  const certEncrypted = encryptSecret(buffer);
  const senhaEncrypted = encryptSecret(Buffer.from(senha, "utf8"));

  try {
    let row;
    if (empresaId && empresaId !== "novo") {
      const existente = await query("SELECT id FROM nfe_empresas WHERE id = $1 AND usuario_id = $2", [empresaId, usuarioId]);
      if (!existente.rows.length) {
        res.status(404).json({ ok: false, erro: "Empresa não encontrada." });
        return;
      }
      const r = await query(
        `UPDATE nfe_empresas
         SET cnpj = $1, cert_encrypted = $2, cert_password_encrypted = $3, cert_valid_until = $4, cert_subject = $5
         WHERE id = $6
         RETURNING *`,
        [info.cnpj, certEncrypted, senhaEncrypted, info.validUntil, info.subject, empresaId]
      );
      row = r.rows[0];
    } else {
      const r = await query(
        `INSERT INTO nfe_empresas (usuario_id, cnpj, razao_social, cert_encrypted, cert_password_encrypted, cert_valid_until, cert_subject)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [usuarioId, info.cnpj, info.subject.slice(0, 255), certEncrypted, senhaEncrypted, info.validUntil, info.subject]
      );
      row = r.rows[0];
    }
    res.status(200).json({ ok: true, empresa: empresaParaSaida(row) });
  } catch (e) {
    if (e.code === "23505") {
      res.status(409).json({ ok: false, erro: "Você já tem uma empresa cadastrada com este CNPJ." });
      return;
    }
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro ao salvar a empresa." });
  }
};
