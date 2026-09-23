const express = require("express");
const { query } = require("../db");
const { hashPassword, verifyPassword } = require("../auth/password");
const { signToken } = require("../auth/jwt");
const { autenticar } = require("../auth/middleware");
const { emailValido, textoObrigatorio } = require("../domain/validators");

const router = express.Router();

function usuarioPublico(row) {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    papel: row.papel,
    empresaId: row.empresa_id,
    empresa: row.empresa_nome,
    cnpj: row.cnpj,
    telefone: row.telefone,
    status: row.status,
    criadoEm: row.criado_em,
  };
}

function gerarToken(row) {
  return signToken(
    { sub: row.id, papel: row.papel, empresaId: row.empresa_id || null },
    process.env.JWT_SECRET
  );
}

// POST /auth/login  { email, senha }
router.post("/login", async (req, res, next) => {
  try {
    const { email, senha } = req.body || {};
    if (!emailValido(email) || !textoObrigatorio(senha, 1)) {
      return res.status(400).json({ erro: "Informe e-mail e senha." });
    }
    const { rows } = await query("select * from usuarios where email = $1", [
      email.trim().toLowerCase(),
    ]);
    const usuario = rows[0];
    if (!usuario || !verifyPassword(senha, usuario.senha_hash)) {
      return res.status(401).json({ erro: "E-mail ou senha incorretos." });
    }
    if (usuario.status === "bloqueado") {
      return res.status(403).json({ erro: "Esta conta está bloqueada. Fale com o administrador." });
    }
    res.json({ token: gerarToken(usuario), usuario: usuarioPublico(usuario) });
  } catch (e) {
    next(e);
  }
});

// POST /auth/registro  { nome, email, senha, empresa?, cnpj? }  -> sempre cria papel "cliente"
router.post("/registro", async (req, res, next) => {
  try {
    const { nome, email, senha, empresa, cnpj } = req.body || {};
    if (!textoObrigatorio(nome, 3)) {
      return res.status(400).json({ erro: "Informe seu nome completo." });
    }
    if (!emailValido(email)) {
      return res.status(400).json({ erro: "Informe um e-mail válido." });
    }
    if (!textoObrigatorio(senha, 6)) {
      return res.status(400).json({ erro: "A senha precisa ter pelo menos 6 caracteres." });
    }
    const emailNorm = email.trim().toLowerCase();
    const existe = await query("select id from usuarios where email = $1", [emailNorm]);
    if (existe.rows.length) {
      return res.status(409).json({ erro: "Já existe uma conta com este e-mail." });
    }
    const senhaHash = hashPassword(senha);
    const { rows } = await query(
      `insert into usuarios (nome, email, senha_hash, papel, empresa_nome, cnpj, status)
       values ($1,$2,$3,'cliente',$4,$5,'ativo') returning *`,
      [nome.trim(), emailNorm, senhaHash, empresa || null, cnpj || null]
    );
    const usuario = rows[0];
    res.status(201).json({ token: gerarToken(usuario), usuario: usuarioPublico(usuario) });
  } catch (e) {
    next(e);
  }
});

// GET /auth/me  -> dados do usuário logado (a partir do token)
router.get("/me", autenticar, async (req, res, next) => {
  try {
    const { rows } = await query("select * from usuarios where id = $1", [req.usuario.sub]);
    if (!rows[0]) return res.status(404).json({ erro: "Usuário não encontrado." });
    res.json({ usuario: usuarioPublico(rows[0]) });
  } catch (e) {
    next(e);
  }
});

// PUT /auth/me  -> editar os próprios dados (nome, telefone, empresa, cnpj, nova senha opcional)
router.put("/me", autenticar, async (req, res, next) => {
  try {
    const { nome, telefone, empresa, cnpj, novaSenha } = req.body || {};
    const campos = [];
    const valores = [];
    let i = 1;
    if (textoObrigatorio(nome, 1)) { campos.push(`nome = $${i++}`); valores.push(nome.trim()); }
    if (typeof telefone === "string") { campos.push(`telefone = $${i++}`); valores.push(telefone.trim()); }
    if (typeof empresa === "string") { campos.push(`empresa_nome = $${i++}`); valores.push(empresa.trim()); }
    if (typeof cnpj === "string") { campos.push(`cnpj = $${i++}`); valores.push(cnpj.trim()); }
    if (novaSenha) {
      if (!textoObrigatorio(novaSenha, 6)) {
        return res.status(400).json({ erro: "A nova senha precisa ter pelo menos 6 caracteres." });
      }
      campos.push(`senha_hash = $${i++}`);
      valores.push(hashPassword(novaSenha));
    }
    if (!campos.length) return res.status(400).json({ erro: "Nada para atualizar." });
    valores.push(req.usuario.sub);
    const { rows } = await query(
      `update usuarios set ${campos.join(", ")} where id = $${i} returning *`,
      valores
    );
    res.json({ usuario: usuarioPublico(rows[0]) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
