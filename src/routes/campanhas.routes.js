const express = require("express");
const { query } = require("../db");
const { autenticar, exigirPapel } = require("../auth/middleware");

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
    usuarioNome: row.usuario_nome || null,
    usuarioEmpresa: row.usuario_empresa_nome || null,
    valor: row.item_valor !== undefined && row.item_valor !== null ? Number(row.item_valor) : null,
    arquivos: (arquivos || []).map(arquivoPublico),
    criadoEm: row.criado_em,
  };
}

const SELECT_CAMPANHA_ENRIQUECIDA = `
  select c.*, u.nome as usuario_nome, u.empresa_nome as usuario_empresa_nome, pp.valor as item_valor
  from campanhas c
  join usuarios u on u.id = c.usuario_id
  left join pedido_pontos pp on pp.pedido_id = c.pedido_id and pp.ponto_id = c.ponto_id
`;

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

router.get("/", autenticar, async (req, res, next) => {
  try {
    let rows;
    if
