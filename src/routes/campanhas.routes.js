const express = require("express");
const { query } = require("../db");
const { autenticar } = require("../auth/middleware");

const router = express.Router();

function arquivoPublico(row) {
  return {
    id: row.id,
    nome: row.nome,
    tipo: row.tipo,
    dados: row.dados,
    status: row.status,
    motivo: row.motivo,
    enviadoEm: row.enviado_em,
    avaliadoEm: row.avaliado_em,
  };
}
function campanhaPublica(row, arquivos) {
  return {
    id: row.id,
    pedidoId: row.pedido_id,
    userId: row.usuario_id,
    pontoId: row.ponto_id,
    nome: row.nome,
    inicio: row.inicio,
    fim: row.fim,
    status: row.status,
    arquivos: (arquivos || []).map(arquivoPublico),
    criadoEm: row.criado_em,
  };
}

async function anexarArquivos(campanhas) {
  if (!campanhas.length) return [];
  const ids = campanhas.map((c) => c.id);
  const { rows: arquivos } = await query(
    "select * from arquivos_midia where campanha_id = any($1) order by enviado_em asc",
    [ids]
  );
  const porCampanha = {};
  for (const a of arquivos) (porCampanha[a.campanha_id] ||= []).push(a);
  return campanhas.map((c) => campanhaPublica(c, porCampanha[c.id]));
}

// GET /campanhas — visibilidade de acordo com o papel + filtros para o admin
router.get("/", autenticar, async (req, res, next) => {
  try {
    let rows;
    if (req.usuario.papel === "cliente") {
      ({ rows } = await query(
        "select * from campanhas where usuario_id = $1 order by criado_em desc",
        [req.usuario.sub]
      ));
    } else if (req.usuario.papel === "empresa") {
      ({ rows } = await query(
        `select c.* from campanhas c
         join pontos p on p.id = c.ponto_id
         where p.empresa_id = $1 order by c.criado_em desc`,
        [req.usuario.empresaId]
      ));
    } else {
      const { cliente, empresa, cidade, status } = req.query;
      const condicoes = [];
      const valores = [];
      let i = 1;
      let base = "select c.* from campanhas c join pontos p on p.id = c.ponto_id";
      if (cliente) { condicoes.push(`c.usuario_id = $${i++}`); valores.push(cliente); }
      if (empresa) { condicoes.push(`p.empresa_id = $${i++}`); valores.push(empresa); }
      if (cidade) { condicoes.push(`p.cidade = $${i++}`); valores.push(cidade); }
      if (status) { condicoes.push(`c.status = $${i++}`); valores.push(status); }
      const where = condicoes.length ? ` where ${condicoes.join(" and ")}` : "";
      ({ rows } = await query(`${base}${where} order by c.criado_em desc`, valores));
    }
    res.json({ campanhas: await anexarArquivos(rows) });
  } catch (e) {
    next(e);
  }
});

// GET /campanhas/:id
router.get("/:id", autenticar, async (req, res, next) => {
  try {
    const { rows } = await query("select * from campanhas where id = $1", [req.params.id]);
    const campanha = rows[0];
    if (!campanha) return res.status(404).json({ erro: "Campanha não encontrada." });

    if (req.usuario.papel === "cliente" && campanha.usuario_id !== req.usuario.sub) {
      return res.status(403).json({ erro: "Sem permissão." });
    }
    if (req.usuario.papel === "empresa") {
      const { rows: p } = await query("select empresa_id from pontos where id = $1", [campanha.ponto_id]);
      if (!p[0] || p[0].empresa_id !== req.usuario.empresaId) {
        return res.status(403).json({ erro: "Sem permissão." });
      }
    }
    const [completa] = await anexarArquivos([campanha]);
    res.json({ campanha: completa });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
