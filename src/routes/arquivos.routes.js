const express = require("express");
const { query } = require("../db");
const { autenticar, exigirPapel } = require("../auth/middleware");
const { decidirAprovacao, decidirReprovacao } = require("../domain/aprovacao");
const { validarArquivo, decodificarDataURL } = require("../domain/upload");
const { textoObrigatorio } = require("../domain/validators");

const router = express.Router();

function arquivoPublico(row) {
  return {
    id: row.id,
    campanhaId: row.campanha_id,
    nome: row.nome,
    tipo: row.tipo,
    dados: row.dados,
    status: row.status,
    motivo: row.motivo,
    enviadoEm: row.enviado_em,
    avaliadoEm: row.avaliado_em,
  };
}

// POST /campanhas/:campanhaId/arquivos  { nome, dados }  — cliente dono da campanha
router.post(
  "/campanhas/:campanhaId/arquivos",
  autenticar,
  exigirPapel("cliente"),
  async (req, res, next) => {
    try {
      const { rows } = await query("select * from campanhas where id = $1", [req.params.campanhaId]);
      const campanha = rows[0];
      if (!campanha) return res.status(404).json({ erro: "Campanha não encontrada." });
      if (campanha.usuario_id !== req.usuario.sub) {
        return res.status(403).json({ erro: "Esta campanha não pertence à sua conta." });
      }

      const { nome, dados } = req.body || {};
      if (!textoObrigatorio(nome, 1)) return res.status(400).json({ erro: "Nome do arquivo ausente." });
      const decodificado = decodificarDataURL(dados);
      if (!decodificado) return res.status(400).json({ erro: "Arquivo inválido." });

      const { rows: pontoRows } = await query("select formatos from pontos where id = $1", [
        campanha.ponto_id,
      ]);
      const formatosAceitos = pontoRows[0] ? pontoRows[0].formatos : ["PNG"];

      const { valido, erros } = validarArquivo({
        tipoMime: decodificado.tipoMime,
        tamanhoBytes: decodificado.buffer.length,
        formatosAceitos,
      });
      if (!valido) return res.status(400).json({ erro: erros[0] });

      const { rows: novoArquivo } = await query(
        `insert into arquivos_midia (campanha_id, nome, tipo, dados, status)
         values ($1,$2,$3,$4,'analise') returning *`,
        [campanha.id, nome, decodificado.tipoMime, dados]
      );
      await query("update campanhas set status = 'analise' where id = $1", [campanha.id]);

      res.status(201).json({ arquivo: arquivoPublico(novoArquivo[0]) });
    } catch (e) {
      next(e);
    }
  }
);

// POST /arquivos/:id/aprovar  — admin
router.post("/arquivos/:id/aprovar", autenticar, exigirPapel("admin"), async (req, res, next) => {
  try {
    const { rows } = await query("select * from arquivos_midia where id = $1", [req.params.id]);
    const arquivo = rows[0];
    if (!arquivo) return res.status(404).json({ erro: "Arquivo não encontrado." });

    const decisao = decidirAprovacao(arquivo); // lança erro (409) se já avaliado

    const { rows: atualizado } = await query(
      `update arquivos_midia set status = $1, motivo = $2, avaliado_em = $3 where id = $4 returning *`,
      [decisao.arquivo.status, decisao.arquivo.motivo, decisao.arquivo.avaliado_em, arquivo.id]
    );
    await query("update campanhas set status = $1 where id = $2", [
      decisao.campanhaStatus,
      arquivo.campanha_id,
    ]);

    // o ponto some a "ocupado" só se não estiver em manutenção
    const { rows: campanhaRow } = await query("select ponto_id from campanhas where id = $1", [
      arquivo.campanha_id,
    ]);
    await query(
      "update pontos set status = 'ocupado' where id = $1 and status <> 'manutencao'",
      [campanhaRow[0].ponto_id]
    );

    res.json({ arquivo: arquivoPublico(atualizado[0]) });
  } catch (e) {
    next(e);
  }
});

// POST /arquivos/:id/reprovar  { motivo }  — admin
router.post("/arquivos/:id/reprovar", autenticar, exigirPapel("admin"), async (req, res, next) => {
  try {
    const { rows } = await query("select * from arquivos_midia where id = $1", [req.params.id]);
    const arquivo = rows[0];
    if (!arquivo) return res.status(404).json({ erro: "Arquivo não encontrado." });

    const decisao = decidirReprovacao(arquivo, (req.body || {}).motivo); // valida o motivo (400) e o estado (409)

    const { rows: atualizado } = await query(
      `update arquivos_midia set status = $1, motivo = $2, avaliado_em = $3 where id = $4 returning *`,
      [decisao.arquivo.status, decisao.arquivo.motivo, decisao.arquivo.avaliado_em, arquivo.id]
    );
    await query("update campanhas set status = $1 where id = $2", [
      decisao.campanhaStatus,
      arquivo.campanha_id,
    ]);

    res.json({ arquivo: arquivoPublico(atualizado[0]) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
