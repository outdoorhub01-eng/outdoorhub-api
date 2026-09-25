const express = require("express");
const { query } = require("../db");
const { autenticar, autenticarOpcional, exigirPapel } = require("../auth/middleware");
const { textoObrigatorio, numeroPositivo } = require("../domain/validators");

const router = express.Router();

const TIPOS_VALIDOS = ["outdoor", "dooh", "shopping", "frontlight", "mobiliario"];
const STATUS_VALIDOS = ["disponivel", "ocupado", "manutencao"];

function fotoPublica(row) {
  const temArea = [row.area_x, row.area_y, row.area_w, row.area_h].every(
    (v) => v !== null && v !== undefined
  );
  return {
    id: row.id,
    dados: row.dados,
    ordem: row.ordem,
    area: temArea
      ? { x: Number(row.area_x), y: Number(row.area_y), w: Number(row.area_w), h: Number(row.area_h) }
      : null,
  };
}

function pontoPublico(row, fotos) {
  return {
    id: row.id,
    empresaId: row.empresa_id,
    nome: row.nome,
    tipo: row.tipo,
    cidade: row.cidade,
    endereco: row.endereco,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    publico: row.publico_alvo,
    alcance: row.alcance_estimado,
    valor: Number(row.valor),
    status: row.status,
    formatos: row.formatos,
    fotoPrincipalId: row.foto_principal_id,
    fotos: (fotos || []).map(fotoPublica),
    criadoEm: row.criado_em,
  };
}

async function carregarPontoComFotos(id) {
  const { rows: pontoRows } = await query("select * from pontos where id = $1", [id]);
  if (!pontoRows[0]) return null;
  const { rows: fotoRows } = await query(
    "select * from fotos_pontos where ponto_id = $1 order by ordem asc, criado_em asc",
    [id]
  );
  return pontoPublico(pontoRows[0], fotoRows);
}

/** Garante que o usuário logado pode editar este ponto (dono da empresa, ou admin). */
async function podeEditar(req, pontoRow) {
  if (req.usuario.papel === "admin") return true;
  if (req.usuario.papel === "empresa" && req.usuario.empresaId === pontoRow.empresa_id) return true;
  return false;
}

// ---------- GET /pontos  (público — com filtros) ----------
router.get("/", autenticarOpcional, async (req, res, next) => {
  try {
    const { tipo, cidade, empresa, busca, disponivel } = req.query;
    const condicoes = [];
    const valores = [];
    let i = 1;
    if (tipo) { condicoes.push(`tipo = $${i++}`); valores.push(tipo); }
    if (cidade) { condicoes.push(`cidade = $${i++}`); valores.push(cidade); }
    if (empresa) { condicoes.push(`empresa_id = $${i++}`); valores.push(empresa); }
    if (disponivel === "true") { condicoes.push(`status = 'disponivel'`); }
    if (busca) {
      condicoes.push(`(nome ilike $${i} or endereco ilike $${i} or cidade ilike $${i})`);
      valores.push(`%${busca}%`);
      i++;
    }
    const where = condicoes.length ? `where ${condicoes.join(" and ")}` : "";
    const { rows: pontos } = await query(
      `select * from pontos ${where} order by criado_em desc`,
      valores
    );
    if (!pontos.length) return res.json({ pontos: [] });

    const ids = pontos.map((p) => p.id);
    const { rows: fotos } = await query(
      "select * from fotos_pontos where ponto_id = any($1) order by ordem asc, criado_em asc",
      [ids]
    );
    const fotosPorPonto = {};
    for (const f of fotos) (fotosPorPonto[f.ponto_id] ||= []).push(f);

    res.json({ pontos: pontos.map((p) => pontoPublico(p, fotosPorPonto[p.id])) });
  } catch (e) {
    next(e);
  }
});

// ---------- GET /pontos/:id  (público) ----------
router.get("/:id", async (req, res, next) => {
  try {
    const ponto = await carregarPontoComFotos(req.params.id);
    if (!ponto) return res.status(404).json({ erro: "Ponto não encontrado." });
    res.json({ ponto });
  } catch (e) {
    next(e);
  }
});

// ---------- POST /pontos  (empresa ou admin) ----------
router.post("/", autenticar, exigirPapel("empresa", "admin"), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!textoObrigatorio(b.nome, 2)) return res.status(400).json({ erro: "Informe o nome do ponto." });
    if (!TIPOS_VALIDOS.includes(b.tipo)) return res.status(400).json({ erro: "Tipo de ponto inválido." });
    if (!textoObrigatorio(b.endereco, 3)) return res.status(400).json({ erro: "Informe o endereço." });
    if (!textoObrigatorio(b.cidade, 2)) return res.status(400).json({ erro: "Informe a cidade." });
    if (typeof b.latitude !== "number" || typeof b.longitude !== "number") {
      return res.status(400).json({ erro: "Latitude e longitude precisam ser números." });
    }
    const empresaId = req.usuario.papel === "admin" ? b.empresaId || req.usuario.empresaId : req.usuario.empresaId;
    if (!empresaId) return res.status(400).json({ erro: "Informe a empresa proprietária do ponto." });

    const formatos = Array.isArray(b.formatos) && b.formatos.length ? b.formatos : ["PNG"];
    const status = STATUS_VALIDOS.includes(b.status) ? b.status : "disponivel";

    const { rows } = await query(
      `insert into pontos
        (empresa_id, nome, tipo, cidade, endereco, latitude, longitude,
         publico_alvo, alcance_estimado, valor, status, formatos)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [
        empresaId, b.nome.trim(), b.tipo, b.cidade.trim(), b.endereco.trim(),
        b.latitude, b.longitude, b.publico || null,
        numeroPositivo(b.alcance) ? b.alcance : 0,
        numeroPositivo(b.valor) ? b.valor : 0,
        status, formatos,
      ]
    );
    const ponto = await carregarPontoComFotos(rows[0].id);
    res.status(201).json({ ponto });
  } catch (e) {
    next(e);
  }
});

// ---------- PUT /pontos/:id  (dono ou admin) ----------
router.put("/:id", autenticar, exigirPapel("empresa", "admin"), async (req, res, next) => {
  try {
    const { rows } = await query("select * from pontos where id = $1", [req.params.id]);
    const pontoAtual = rows[0];
    if (!pontoAtual) return res.status(404).json({ erro: "Ponto não encontrado." });
    if (!(await podeEditar(req, pontoAtual))) {
      return res.status(403).json({ erro: "Você só pode editar pontos da sua própria empresa." });
    }
    const b = req.body || {};
    const campos = [];
    const valores = [];
    let i = 1;
    const set = (col, val) => { campos.push(`${col} = $${i++}`); valores.push(val); };

    if (textoObrigatorio(b.nome, 2)) set("nome", b.nome.trim());
    if (TIPOS_VALIDOS.includes(b.tipo)) set("tipo", b.tipo);
    if (textoObrigatorio(b.cidade, 2)) set("cidade", b.cidade.trim());
    if (textoObrigatorio(b.endereco, 3)) set("endereco", b.endereco.trim());
    if (typeof b.latitude === "number") set("latitude", b.latitude);
    if (typeof b.longitude === "number") set("longitude", b.longitude);
    if (typeof b.publico === "string") set("publico_alvo", b.publico);
    if (numeroPositivo(b.alcance)) set("alcance_estimado", b.alcance);
    if (numeroPositivo(b.valor)) set("valor", b.valor);
    if (STATUS_VALIDOS.includes(b.status)) set("status", b.status);
    if (Array.isArray(b.formatos) && b.formatos.length) set("formatos", b.formatos);

    if (!campos.length) return res.status(400).json({ erro: "Nada para atualizar." });
    valores.push(req.params.id);
    await query(`update pontos set ${campos.join(", ")} where id = $${i}`, valores);

    const ponto = await carregarPontoComFotos(req.params.id);
    res.json({ ponto });
  } catch (e) {
    next(e);
  }
});

// ---------- DELETE /pontos/:id  (dono ou admin) ----------
router.delete("/:id", autenticar, exigirPapel("empresa", "admin"), async (req, res, next) => {
  try {
    const { rows } = await query("select * from pontos where id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: "Ponto não encontrado." });
    if (!(await podeEditar(req, rows[0]))) {
      return res.status(403).json({ erro: "Você só pode excluir pontos da sua própria empresa." });
    }
    await query("delete from pontos where id = $1", [req.params.id]);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// ---------- GET /pontos/:id/disponibilidade  (público) ----------
// devolve os períodos já reservados (campanhas não finalizadas) para desenhar
// um calendário de ocupação — reaproveita a tabela campanhas, sem precisar
// de uma tabela nova. Não expõe quem é o cliente, só o período e o status.
router.get("/:id/disponibilidade", async (req, res, next) => {
  try {
    const { rows } = await query(
      `select inicio, fim, status from campanhas
       where ponto_id = $1 and status <> 'finalizada'
       order by inicio asc`,
      [req.params.id]
    );
    res.json({
      periodos: rows.map((r) => ({ inicio: r.inicio, fim: r.fim, status: r.status })),
    });
  } catch (e) {
    next(e);
  }
});

// ---------- fotos ----------

// POST /pontos/:id/fotos  { dados }  -> adiciona uma foto (data URL base64)
router.post("/:id/fotos", autenticar, exigirPapel("empresa", "admin"), async (req, res, next) => {
  try {
    const { rows } = await query("select * from pontos where id = $1", [req.params.id]);
    const ponto = rows[0];
    if (!ponto) return res.status(404).json({ erro: "Ponto não encontrado." });
    if (!(await podeEditar(req, ponto))) return res.status(403).json({ erro: "Sem permissão." });

    const { dados } = req.body || {};
    if (!textoObrigatorio(dados, 10) || !dados.startsWith("data:image/")) {
      return res.status(400).json({ erro: "Envie uma imagem válida (PNG ou JPG)." });
    }
    const { rows: max } = await query(
      "select coalesce(max(ordem), -1) as m from fotos_pontos where ponto_id = $1",
      [ponto.id]
    );
    const { rows: novaFoto } = await query(
      "insert into fotos_pontos (ponto_id, dados, ordem) values ($1,$2,$3) returning *",
      [ponto.id, dados, max[0].m + 1]
    );
    if (!ponto.foto_principal_id) {
      await query("update pontos set foto_principal_id = $1 where id = $2", [novaFoto[0].id, ponto.id]);
    }
    const pontoAtualizado = await carregarPontoComFotos(ponto.id);
    res.status(201).json({ ponto: pontoAtualizado });
  } catch (e) {
    next(e);
  }
});

// DELETE /pontos/:id/fotos/:fotoId
router.delete("/:id/fotos/:fotoId", autenticar, exigirPapel("empresa", "admin"), async (req, res, next) => {
  try {
    const { rows } = await query("select * from pontos where id = $1", [req.params.id]);
    const ponto = rows[0];
    if (!ponto) return res.status(404).json({ erro: "Ponto não encontrado." });
    if (!(await podeEditar(req, ponto))) return res.status(403).json({ erro: "Sem permissão." });

    await query("delete from fotos_pontos where id = $1 and ponto_id = $2", [req.params.fotoId, ponto.id]);

    if (ponto.foto_principal_id === req.params.fotoId) {
      const { rows: restante } = await query(
        "select id from fotos_pontos where ponto_id = $1 order by ordem asc limit 1",
        [ponto.id]
      );
      await query("update pontos set foto_principal_id = $1 where id = $2", [
        restante[0] ? restante[0].id : null,
        ponto.id,
      ]);
    }
    const pontoAtualizado = await carregarPontoComFotos(ponto.id);
    res.json({ ponto: pontoAtualizado });
  } catch (e) {
    next(e);
  }
});

// PUT /pontos/:id/foto-principal  { fotoId }
router.put("/:id/foto-principal", autenticar, exigirPapel("empresa", "admin"), async (req, res, next) => {
  try {
    const { rows } = await query("select * from pontos where id = $1", [req.params.id]);
    const ponto = rows[0];
    if (!ponto) return res.status(404).json({ erro: "Ponto não encontrado." });
    if (!(await podeEditar(req, ponto))) return res.status(403).json({ erro: "Sem permissão." });

    const { fotoId } = req.body || {};
    const { rows: foto } = await query(
      "select id from fotos_pontos where id = $1 and ponto_id = $2",
      [fotoId, ponto.id]
    );
    if (!foto[0]) return res.status(404).json({ erro: "Foto não encontrada neste ponto." });

    await query("update pontos set foto_principal_id = $1 where id = $2", [fotoId, ponto.id]);
    const pontoAtualizado = await carregarPontoComFotos(ponto.id);
    res.json({ ponto: pontoAtualizado });
  } catch (e) {
    next(e);
  }
});

// PUT /pontos/:id/fotos/ordem  { ordem: [fotoId1, fotoId2, ...] }
router.put("/:id/fotos/ordem", autenticar, exigirPapel("empresa", "admin"), async (req, res, next) => {
  try {
    const { rows } = await query("select * from pontos where id = $1", [req.params.id]);
    const ponto = rows[0];
    if (!ponto) return res.status(404).json({ erro: "Ponto não encontrado." });
    if (!(await podeEditar(req, ponto))) return res.status(403).json({ erro: "Sem permissão." });

    const { ordem } = req.body || {};
    if (!Array.isArray(ordem) || !ordem.length) {
      return res.status(400).json({ erro: "Envie a lista de IDs na nova ordem." });
    }
    for (let idx = 0; idx < ordem.length; idx++) {
      await query("update fotos_pontos set ordem = $1 where id = $2 and ponto_id = $3", [
        idx, ordem[idx], ponto.id,
      ]);
    }
    const pontoAtualizado = await carregarPontoComFotos(ponto.id);
    res.json({ ponto: pontoAtualizado });
  } catch (e) {
    next(e);
  }
});

// PUT /pontos/:id/fotos/:fotoId/area  { x, y, w, h }  (percentuais 0-100)
router.put("/:id/fotos/:fotoId/area", autenticar, exigirPapel("empresa", "admin"), async (req, res, next) => {
  try {
    const { rows } = await query("select * from pontos where id = $1", [req.params.id]);
    const ponto = rows[0];
    if (!ponto) return res.status(404).json({ erro: "Ponto não encontrado." });
    if (!(await podeEditar(req, ponto))) return res.status(403).json({ erro: "Sem permissão." });

    const { x, y, w, h } = req.body || {};
    const numeros = [x, y, w, h];
    if (numeros.some((v) => typeof v !== "number" || !isFinite(v) || v < 0 || v > 100)) {
      return res.status(400).json({ erro: "A área precisa ter x, y, largura e altura entre 0 e 100." });
    }
    const { rows: atualizado } = await query(
      `update fotos_pontos set area_x=$1, area_y=$2, area_w=$3, area_h=$4
       where id = $5 and ponto_id = $6 returning *`,
      [x, y, w, h, req.params.fotoId, ponto.id]
    );
    if (!atualizado[0]) return res.status(404).json({ erro: "Foto não encontrada neste ponto." });
    res.json({ foto: fotoPublica(atualizado[0]) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
