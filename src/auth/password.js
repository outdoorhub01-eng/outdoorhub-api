// Hash de senha usando scrypt, nativo do Node.js (módulo "crypto" embutido).
// Não depende de nenhum pacote externo (nada de bcrypt) — uma dependência a menos
// para instalar e uma superfície de ataque a menos para se preocupar.
//
// Formato salvo no banco: "salt_hex:hash_hex"

const crypto = require("crypto");

const KEY_LEN = 64;

function hashPassword(senhaTextoPuro) {
  if (typeof senhaTextoPuro !== "string" || senhaTextoPuro.length < 6) {
    throw new Error("Senha precisa ter pelo menos 6 caracteres.");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(senhaTextoPuro, salt, KEY_LEN).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(senhaTextoPuro, valorSalvo) {
  if (typeof valorSalvo !== "string" || !valorSalvo.includes(":")) return false;
  const [salt, hashSalvo] = valorSalvo.split(":");
  const hashTentativa = crypto.scryptSync(senhaTextoPuro, salt, KEY_LEN);
  const bufSalvo = Buffer.from(hashSalvo, "hex");
  // timingSafeEqual evita "timing attack" — comparação em tempo constante.
  if (bufSalvo.length !== hashTentativa.length) return false;
  return crypto.timingSafeEqual(bufSalvo, hashTentativa);
}

module.exports = { hashPassword, verifyPassword };
