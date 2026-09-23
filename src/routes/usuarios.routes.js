const express = require("express");
const { query } = require("../db");
const { autenticar, exigirPapel } = require("../auth/middleware");
const { textoObrigatorio } = require("../domain/validators");

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

// GET /usuarios?papel=cliente  — admin
router.get("/", autenticar, exigirPapel("admin"), async (req, res, next) => {
  try {
    const { papel } = req.query;
    const { rows } = await query(
      papel
        ? "select * from usuarios where papel = $1 order by criado_em desc"
        : "select * from usuarios order by criado_em desc",
      papel ? [papel] : []
    );
    res.json({ usuarios: rows.map(usuarioPublico) });
  } catch (e) {
    next(e);
  }
});

// PUT /usuarios/:id  — admin edita dados de um cliente
router.put("/:id", autenticar, exigirPapel("admin"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const campos = [];
    const valores = [];
    let i = 1;
    const set = (col, val) => { campos.push(`${col} = $${i++}`); valores.push(val); };
    if (textoObrigatorio(b.nome, 2)) set("nome", b.nome.trim());
    if (typeof b.email === "string") set("email", b.email.trim().toLowerCase());
    if (typeof b.empresa === "string") set("empresa_nome", b.empresa);
    if (typeof b.cnpj === "string") set("cnpj", b.cnpj);
    if (typeof b.telefone === "string") set("telefone", b.telefone);
    if (!campos.length) return res.status(400).json({ erro: "Nada para atualizar." });
    valores.push(req.params.id);
    const { rows } = await query(
      `update usuarios set ${campos.join(", ")} where id = $${i} returning *`,
      valores
    );
    if (!rows[0]) return res.status(404).json({ erro: "Usuário não encontrado." });
    res.json({ usuario: usuarioPublico(rows[0]) });
  } catch (e) {
    next(e);
  }
});

// PUT /usuarios/:id/bloquear  — alterna ativo/bloqueado
router.put("/:id/bloquear", autenticar, exigirPapel("admin"), async (req, res, next) => {
  try {
    const { rows } = await query("select status from usuarios where id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: "Usuário não encontrado." });
    const novoStatus = rows[0].status === "ativo" ? "bloqueado" : "ativo";
    const { rows: atualizado } = await query(
      "update usuarios set status = $1 where id = $2 returning *",
      [novoStatus, req.params.id]
    );
    res.json({ usuario: usuarioPublico(atualizado[0]) });
  } catch (e) {
    next(e);
  }
});

// DELETE /usuarios/:id — admin
router.delete("/:id", autenticar, exigirPapel("admin"), async (req, res, next) => {
  try {
    const { rowCount } = await query("delete from usuarios where id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ erro: "Usuário não encontrado." });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

module.exports = router;
