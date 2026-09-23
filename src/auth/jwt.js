// Implementação mínima de JWT (JSON Web Token), usando só o módulo nativo
// "crypto" do Node — sem depender do pacote "jsonwebtoken". É o mesmo formato
// padrão (header.payload.assinatura em base64url, assinado com HMAC-SHA256),
// só que escrito à mão para manter o projeto com o mínimo de dependências.

const crypto = require("crypto");

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function base64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64").toString("utf8");
}
function sign(header, secret) {
  return base64url(
    crypto.createHmac("sha256", secret).update(header).digest()
  );
}

/**
 * Gera um token assinado.
 * @param {object} payload dados a codificar (ex: {sub: userId, papel: 'admin'})
 * @param {string} secret segredo usado para assinar (variável de ambiente JWT_SECRET)
 * @param {number} expiresInSeconds validade do token, em segundos (padrão: 7 dias)
 */
function signToken(payload, secret, expiresInSeconds = 60 * 60 * 24 * 7) {
  if (!secret) throw new Error("JWT_SECRET não configurado.");
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(fullPayload));
  const data = `${headerB64}.${payloadB64}`;
  const signature = sign(data, secret);
  return `${data}.${signature}`;
}

/**
 * Verifica e decodifica um token. Retorna o payload se válido, ou null se
 * inválido/expirado/adulterado.
 */
function verifyToken(token, secret) {
  if (!secret) throw new Error("JWT_SECRET não configurado.");
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signature] = parts;
  const expected = sign(`${headerB64}.${payloadB64}`, secret);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  let payload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64));
  } catch {
    return null;
  }
  if (typeof payload.exp === "number" && Date.now() / 1000 > payload.exp) {
    return null; // expirado
  }
  return payload;
}

module.exports = { signToken, verifyToken };
