const express = require("express");
const { query } = require("../db");
const { autenticar, exigirPapel } = require("../auth/middleware");
const { decodificarDataURL } = require("../domain/upload");

const router = express.Router();

const FOTO_MAX_BYTES = 8 * 1024 * 1024; // 8 MB já decodificado

function avaliacaoPublica(row) {
  return {
    id: row.id,
    pontoId: row.ponto_id,
    usuarioId: row.usuario_id,
    autor: row.empresa_nome || row.nome || "Cliente OutdoorHub",
    nota: row.nota,
    comentario: row.comentario,
    foto: row.foto_dados ? { tipo: row.foto_tipo, dados: row.foto_dados } : null,
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

    const { nota, comentario, foto } = req.body || {};
    const notaNum = Number(nota);
    if (!Number.isInteger(notaNum) || notaNum < 1 || notaNum > 5) {
      return res.status(400).json({ erro: "A nota precisa ser um número inteiro de 1 a 5." });
    }
    const comentarioTexto = typeof comentario === "string" && comentario.trim() ? comentario.trim() : null;

    let fotoTipo = null;
    let fotoDados = null;
    if (typeof foto === "string" && foto) {
      const decodificado = decodificarDataURL(foto);
      if (!decodificado) return res.status(400).json({ erro: "Foto inválida." });
      if (!decodificado.tipoMime.startsWith("image/")) {
        return res.status(400).json({ erro: "A foto precisa ser uma imagem." });
      }
      if (decodificado.buffer.length > FOTO_MAX_BYTES) {
        return res.status(400).json({ erro: "Foto maior que 8 MB. Comprima antes de enviar." });
      }
      fotoTipo = decodificado.tipoMime;
      fotoDados = foto;
    }

    const { rows } = await query(
      `insert into avaliacoes (ponto_id, usuario_id, nota, comentario, foto_tipo, foto_dados)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (ponto_id, usuario_id)
       do update set nota = excluded.nota, comentario = excluded.comentario,
         foto_tipo = excluded.foto_tipo, foto_dados = excluded.foto_dados, atualizado_em = now()
       returning *`,
      [req.params.id, req.usuario.sub, notaNum, comentarioTexto, fotoTipo, fotoDados]
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
