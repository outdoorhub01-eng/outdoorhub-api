const express = require("express");
const { query } = require("../db");
const { autenticar, autenticarOpcional, exigirPapel } = require("../auth/middleware");
const { textoObrigatorio } = require("../domain/validators");

const router = express.Router();

function empresaPublica(row) {
  return {
    id: row.id,
    nome: row.nome,
    cnpj: row.cnpj,
    cidade: row.cidade,
    email: row.email,
    telefone: row.telefone,
    status: row.status,
    criadoEm: row.criado_em,
  };
}

// GET /empresas  — público vê só as ativas; admin autenticado vê todas
router.get("/", autenticarOpcional, async (req, res, next) => {
  try {
    const verTodas = req.usuario && req.usuario.papel === "admin";
    const { rows } = await query(
      verTodas
        ? "select * from empresas order by criado_em desc"
        : "select * from empresas where status = 'ativa' order by criado_em desc"
    );
    res.json({ empresas: rows.map(empresaPublica) });
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await query("select * from empresas where id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: "Empresa não encontrada." });
    res.json({ empresa: empresaPublica(rows[0]) });
  } catch (e) {
    next(e);
  }
});

// POST /empresas — cadastro público ("seja um parceiro"), entra como pendente
router.post("/", async (req, res, next) => {
  try {
    const { nome, cnpj, cidade, email, telefone } = req.body || {};
    if (!textoObrigatorio(nome, 2)) return res.status(400).json({ erro: "Informe a razão social." });
    if (!textoObrigatorio(cnpj, 8)) return res.status(400).json({ erro: "Informe o CNPJ." });
    const { rows } = await query(
      `insert into empresas (nome, cnpj, cidade, email, telefone, status)
       values ($1,$2,$3,$4,$5,'pendente') returning *`,
      [nome.trim(), cnpj.trim(), cidade || null, email || null, telefone || null]
    );
    res.status(201).json({ empresa: empresaPublica(rows[0]) });
  } catch (e) {
    next(e);
  }
});

// PUT /empresas/:id — admin, ou o próprio usuário "empresa" dono dela
router.put("/:id", autenticar, exigirPapel("empresa", "admin"), async (req, res, next) => {
  try {
    if (req.usuario.papel === "empresa" && req.usuario.empresaId !== req.params.id) {
      return res.status(403).json({ erro: "Você só pode editar a sua própria empresa." });
    }
    const b = req.body || {};
    const campos = [];
    const valores = [];
    let i = 1;
    const set = (col, val) => { campos.push(`${col} = $${i++}`); valores.push(val); };
    if (textoObrigatorio(b.nome, 2)) set("nome", b.nome.trim());
    if (textoObrigatorio(b.cnpj, 8)) set("cnpj", b.cnpj.trim());
    if (typeof b.cidade === "string") set("cidade", b.cidade);
    if (typeof b.email === "string") set("email", b.email);
    if (typeof b.telefone === "string") set("telefone", b.telefone);
    if (!campos.length) return res.status(400).json({ erro: "Nada para atualizar." });
    valores.push(req.params.id);
    const { rows } = await query(
      `update empresas set ${campos.join(", ")} where id = $${i} returning *`,
      valores
    );
    if (!rows[0]) return res.status(404).json({ erro: "Empresa não encontrada." });
    res.json({ empresa: empresaPublica(rows[0]) });
  } catch (e) {
    next(e);
  }
});

// POST /empresas/:id/aprovar — admin
router.post("/:id/aprovar", autenticar, exigirPapel("admin"), async (req, res, next) => {
  try {
    const { rows } = await query(
      "update empresas set status = 'ativa' where id = $1 returning *",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ erro: "Empresa não encontrada." });
    res.json({ empresa: empresaPublica(rows[0]) });
  } catch (e) {
    next(e);
  }
});

// DELETE /empresas/:id — admin (os pontos dela são removidos em cascata)
router.delete("/:id", autenticar, exigirPapel("admin"), async (req, res, next) => {
  try {
    const { rowCount } = await query("delete from empresas where id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ erro: "Empresa não encontrada." });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

module.exports = router;
