const express = require("express");
const { query } = require("../db");
const { autenticar, exigirPapel } = require("../auth/middleware");

const router = express.Router();

function avaliacaoPublica(row) {
  return {
    id: row.id,
    pontoId: row.ponto_id,
    usuarioId: row.usuario_id,
    autor: row.empresa_nome || row.nome || "Cliente OutdoorHub",
    nota: row.nota,
    comentario: row.comentario,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

// ---------- GET /pontos/:id/avaliacoes  (público) ----------
router.get("/pontos/:id/avaliacoes", async (req, res, next) => {
  try {
    const { rows } = await query(
      `select a.*, u.nome, u.empresa_nome
       from avaliacoes a join usuarios u on u.id = a.usuario_id
       where a.ponto_id = $1
       order by a.criado_em desc`,
      [req.params.id]
    );
    const media = rows.length
      ? rows.reduce((soma, r) => soma + r.nota, 0) / rows.length
      : null;
    res.json({
      media: media !== null ? Number(media.toFixed(2)) : null,
      total: rows.length,
      avaliacoes: rows.map(avaliacaoPublica),
    });
  } catch (e) {
    next(e);
  }
});

// ---------- POST /pontos/:id/avaliacoes  { nota, comentario }  — cliente que já contratou o ponto ----------
router.post("/pontos/:id/avaliacoes", autenticar, exigirPapel("cliente"), async (req, res, next) => {
  try {
    const { rows: pontoRows } = await query("select id from pontos where id = $1", [req.params.id]);
    if (!pontoRows[0]) return res.status(404).json({ erro: "Ponto não encontrado." });

    const { rows: contratou } = await query(
      "select id from campanhas where ponto_id = $1 and usuario_id = $2 limit 1",
      [req.params.id, req.usuario.sub]
    );
    if (!contratou[0]) {
      return res.status(403).json({
        erro: "Só é possível avaliar um ponto depois de contratá-lo pelo menos uma vez.",
      });
    }

    const { nota, comentario } = req.body || {};
    const notaNum = Number(nota);
    if (!Number.isInteger(notaNum) || notaNum < 1 || notaNum > 5) {
      return res.status(400).json({ erro: "A nota precisa ser um número inteiro de 1 a 5." });
    }
    const comentarioTexto = typeof comentario === "string" && comentario.trim() ? comentario.trim() : null;

    const { rows } = await query(
      `insert into avaliacoes (ponto_id, usuario_id, nota, comentario)
       values ($1,$2,$3,$4)
       on conflict (ponto_id, usuario_id)
       do update set nota = excluded.nota, comentario = excluded.comentario, atualizado_em = now()
       returning *`,
      [req.params.id, req.usuario.sub, notaNum, comentarioTexto]
    );
    const { rows: userRow } = await query("select nome, empresa_nome from usuarios where id = $1", [
      req.usuario.sub,
    ]);
    res.status(201).json({
      avaliacao: avaliacaoPublica({ ...rows[0], ...(userRow[0] || {}) }),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
