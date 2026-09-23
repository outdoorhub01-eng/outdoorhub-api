const express = require("express");
const { query, getClient } = require("../db");
const { autenticar, exigirPapel } = require("../auth/middleware");
const { calcularTotalCarrinho, textoObrigatorio } = require("../domain/validators");

const router = express.Router();

function pedidoPublico(row, itens) {
  return {
    id: row.id,
    usuarioId: row.usuario_id,
    total: Number(row.total),
    status: row.status,
    pagamento: { bandeira: row.pagamento_bandeira, final: row.pagamento_final },
    dados: {
      nome: row.dados_nome, empresa: row.dados_empresa, cnpj: row.dados_cnpj,
      telefone: row.dados_telefone, email: row.dados_email,
    },
    itens: (itens || []).map((i) => ({
      pontoId: i.ponto_id, valor: Number(i.valor), inicio: i.inicio, fim: i.fim,
    })),
    criadoEm: row.criado_em,
  };
}

// GET /pedidos — cliente vê os seus; admin vê todos
router.get("/", autenticar, async (req, res, next) => {
  try {
    const { rows: pedidos } =
      req.usuario.papel === "admin"
        ? await query("select * from pedidos order by criado_em desc")
        : await query("select * from pedidos where usuario_id = $1 order by criado_em desc", [
            req.usuario.sub,
          ]);
    if (!pedidos.length) return res.json({ pedidos: [] });

    const ids = pedidos.map((p) => p.id);
    const { rows: itens } = await query(
      "select * from pedido_pontos where pedido_id = any($1)",
      [ids]
    );
    const itensPorPedido = {};
    for (const it of itens) (itensPorPedido[it.pedido_id] ||= []).push(it);

    res.json({ pedidos: pedidos.map((p) => pedidoPublico(p, itensPorPedido[p.id])) });
  } catch (e) {
    next(e);
  }
});

// POST /pedidos  (checkout) — cliente
// body: { itens:[{pontoId, inicio:'AAAA-MM-DD', dias}], pagamento:{bandeira,final}, dados:{nome,empresa,cnpj,telefone,email} }
router.post("/", autenticar, exigirPapel("cliente"), async (req, res, next) => {
  const client = await getClient();
  try {
    const { itens, pagamento, dados } = req.body || {};
    if (!Array.isArray(itens) || !itens.length) {
      return res.status(400).json({ erro: "O carrinho está vazio." });
    }
    if (!dados || !textoObrigatorio(dados.nome, 2) || !textoObrigatorio(dados.empresa, 1) ||
        !textoObrigatorio(dados.cnpj, 8) || !textoObrigatorio(dados.email, 5)) {
      return res.status(400).json({ erro: "Preencha todos os dados do anunciante." });
    }

    // busca o preço e a situação de cada ponto direto no banco — nunca confiar
    // no valor que o cliente mandar, o preço de verdade é sempre o do servidor.
    const pontoIds = itens.map((i) => i.pontoId);
    const { rows: pontosRows } = await client.query("select * from pontos where id = any($1)", [
      pontoIds,
    ]);
    const pontosPorId = Object.fromEntries(pontosRows.map((p) => [p.id, p]));
    for (const id of pontoIds) {
      if (!pontosPorId[id]) return res.status(404).json({ erro: `Ponto ${id} não encontrado.` });
      if (pontosPorId[id].status === "manutencao") {
        return res.status(409).json({ erro: `O ponto "${pontosPorId[id].nome}" está em manutenção e não pode ser contratado.` });
      }
    }

    const itensResolvidos = itens.map((i) => {
      const ponto = pontosPorId[i.pontoId];
      const dias = Number(i.dias) || 14;
      const inicio = new Date(i.inicio || Date.now());
      const fim = new Date(inicio);
      fim.setDate(fim.getDate() + dias);
      return {
        pontoId: ponto.id,
        valor: Number(ponto.valor) * (dias / 14),
        inicio: inicio.toISOString().slice(0, 10),
        fim: fim.toISOString().slice(0, 10),
      };
    });
    const total = calcularTotalCarrinho(itensResolvidos.map((i) => ({ valor: i.valor, dias: 14 })));

    await client.query("BEGIN");

    const { rows: pedidoRows } = await client.query(
      `insert into pedidos
        (usuario_id, total, status, pagamento_bandeira, pagamento_final,
         dados_nome, dados_empresa, dados_cnpj, dados_telefone, dados_email)
       values ($1,$2,'pago',$3,$4,$5,$6,$7,$8,$9) returning *`,
      [
        req.usuario.sub, total,
        pagamento && pagamento.bandeira || null, pagamento && pagamento.final || null,
        dados.nome, dados.empresa, dados.cnpj, dados.telefone || null, dados.email,
      ]
    );
    const pedido = pedidoRows[0];

    for (const item of itensResolvidos) {
      await client.query(
        "insert into pedido_pontos (pedido_id, ponto_id, valor, inicio, fim) values ($1,$2,$3,$4,$5)",
        [pedido.id, item.pontoId, item.valor, item.inicio, item.fim]
      );
      const ponto = pontosPorId[item.pontoId];
      await client.query(
        `insert into campanhas (pedido_id, usuario_id, ponto_id, nome, inicio, fim, status)
         values ($1,$2,$3,$4,$5,$6,'preparacao')`,
        [pedido.id, req.usuario.sub, item.pontoId, `${dados.empresa} · ${ponto.nome}`, item.inicio, item.fim]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ pedido: pedidoPublico(pedido, itensResolvidos.map((i) => ({
      ponto_id: i.pontoId, valor: i.valor, inicio: i.inicio, fim: i.fim,
    }))) });
  } catch (e) {
    await client.query("ROLLBACK");
    next(e);
  } finally {
    client.release();
  }
});

module.exports = router;
