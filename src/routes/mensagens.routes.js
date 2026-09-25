const express = require("express");
const { query } = require("../db");
const { autenticar } = require("../auth/middleware");
const { textoObrigatorio } = require("../domain/validators");

const router = express.Router();

function mensagemPublica(row) {
  return {
    id: row.id,
    campanhaId: row.campanha_id,
    remetenteId: row.remetente_id,
    remetenteNome: row.remetente_nome,
    remetentePapel: row.remetente_papel,
    texto: row.texto,
    lida: row.lida,
    criadoEm: row.criado_em,
  };
}

/** Confere se o usuário logado participa da conversa desta campanha: o
 *  cliente que contratou, a empresa dona do ponto, ou o admin. */
async function podeVerConversa(req, campanhaId) {
  const { rows } = await query(
    `select c.usuario_id, p.empresa_id
     from campanhas c join pontos p on p.id = c.ponto_id
     where c.id = $1`,
    [campanhaId]
  );
  const campanha = rows[0];
  if (!campanha) return { ok: false };
  if (req.usuario.papel === "admin") return { ok: true, campanha };
  if (req.usuario.papel === "cliente" && req.usuario.sub === campanha.usuario_id) {
    return { ok: true, campanha };
  }
  if (req.usuario.papel === "empresa" && req.usuario.empresaId === campanha.empresa_id) {
    return { ok: true, campanha };
  }
  return { ok: false, campanha };
}

// ---------- GET /campanhas/:id/mensagens ----------
router.get("/campanhas/:id/mensagens", autenticar, async (req, res, next) => {
  try {
    const acesso = await podeVerConversa(req, req.params.id);
    if (!acesso.campanha) return res.status(404).json({ erro: "Campanha não encontrada." });
    if (!acesso.ok) return res.status(403).json({ erro: "Você não participa desta conversa." });

    const { rows } = await query(
      `select m.*, u.nome as remetente_nome, u.papel as remetente_papel
       from mensagens m join usuarios u on u.id = m.remetente_id
       where m.campanha_id = $1
       order by m.criado_em asc`,
      [req.params.id]
    );
    await query(
      `update mensagens set lida = true where campanha_id = $1 and remetente_id <> $2`,
      [req.params.id, req.usuario.sub]
    );
    res.json({ mensagens: rows.map(mensagemPublica) });
  } catch (e) {
    next(e);
  }
});

// ---------- POST /campanhas/:id/mensagens  { texto } ----------
router.post("/campanhas/:id/mensagens", autenticar, async (req, res, next) => {
  try {
    const acesso = await podeVerConversa(req, req.params.id);
    if (!acesso.campanha) return res.status(404).json({ erro: "Campanha não encontrada." });
    if (!acesso.ok) return res.status(403).json({ erro: "Você não participa desta conversa." });

    const { texto } = req.body || {};
    if (!textoObrigatorio(texto, 1)) return res.status(400).json({ erro: "Escreva uma mensagem." });
    if (texto.trim().length > 2000) {
      return res.status(400).json({ erro: "Mensagem muito longa (máximo 2000 caracteres)." });
    }

    const { rows } = await query(
      `insert into mensagens (campanha_id, remetente_id, texto) values ($1,$2,$3) returning *`,
      [req.params.id, req.usuario.sub, texto.trim()]
    );
    const { rows: userRow } = await query("select nome, papel from usuarios where id = $1", [
      req.usuario.sub,
    ]);
    res.status(201).json({
      mensagem: mensagemPublica({
        ...rows[0],
        remetente_nome: userRow[0] && userRow[0].nome,
        remetente_papel: userRow[0] && userRow[0].papel,
      }),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
