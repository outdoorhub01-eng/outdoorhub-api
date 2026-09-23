const express = require("express");
const { query } = require("../db");
const { autenticar, exigirPapel } = require("../auth/middleware");

const router = express.Router();

// GET /relatorios/resumo — números do painel administrativo ("Precisa da sua atenção" + "Visão geral")
router.get("/resumo", autenticar, exigirPapel("admin"), async (req, res, next) => {
  try {
    const [clientes, empresas, pontos, campanhasAtivas, receita, pendentesAprovacao, empresasPendentes, vencendo] =
      await Promise.all([
        query("select count(*)::int as n from usuarios where papel = 'cliente'"),
        query("select count(*)::int as n from empresas"),
        query("select count(*)::int as n from pontos"),
        query("select count(*)::int as n from campanhas where status = 'exibicao'"),
        query("select coalesce(sum(total),0)::float as total from pedidos where status = 'pago'"),
        query("select count(*)::int as n from arquivos_midia where status in ('analise','pendente')"),
        query("select count(*)::int as n from empresas where status = 'pendente'"),
        query(
          `select count(*)::int as n from campanhas
           where status = 'exibicao' and fim between now() and now() + interval '5 days'`
        ),
      ]);

    res.json({
      clientes: clientes.rows[0].n,
      empresas: empresas.rows[0].n,
      pontos: pontos.rows[0].n,
      campanhasAtivas: campanhasAtivas.rows[0].n,
      receitaTotal: receita.rows[0].total,
      pendentesAprovacao: pendentesAprovacao.rows[0].n,
      empresasPendentes: empresasPendentes.rows[0].n,
      campanhasVencendo: vencendo.rows[0].n,
    });
  } catch (e) {
    next(e);
  }
});

// GET /relatorios/receita-mensal — últimos 6 meses, para o gráfico de barras
router.get("/receita-mensal", autenticar, exigirPapel("admin"), async (req, res, next) => {
  try {
    const { rows } = await query(`
      select to_char(mes, 'Mon') as label, coalesce(soma.total, 0)::float as total
      from generate_series(
        date_trunc('month', now()) - interval '5 months',
        date_trunc('month', now()),
        interval '1 month'
      ) as mes
      left join (
        select date_trunc('month', criado_em) as mes, sum(total) as total
        from pedidos where status = 'pago'
        group by 1
      ) as soma using (mes)
      order by mes asc
    `);
    res.json({ meses: rows });
  } catch (e) {
    next(e);
  }
});

// GET /relatorios/pontos-mais-locados — top 5 pontos com mais campanhas, para o gráfico de barras horizontal
router.get("/pontos-mais-locados", autenticar, exigirPapel("admin"), async (req, res, next) => {
  try {
    const { rows } = await query(`
      select p.nome, count(c.id)::int as campanhas
      from pontos p
      left join campanhas c on c.ponto_id = p.id
      group by p.id, p.nome
      order by campanhas desc, p.nome asc
      limit 5
    `);
    res.json({ pontos: rows });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
