// Regras de negócio da aprovação/reprovação de arte.
// Ficam isoladas do Express e do banco de propósito: são funções puras
// (recebem dados, devolvem dados) e por isso dá para testar sem subir
// servidor nem banco — veja tests/domain.test.js.

function decidirAprovacao(arquivo) {
  if (!["analise", "pendente"].includes(arquivo.status)) {
    const err = new Error("Este arquivo já foi avaliado anteriormente.");
    err.status = 409;
    throw err;
  }
  return {
    arquivo: { status: "aprovada", motivo: null, avaliado_em: new Date() },
    campanhaStatus: "exibicao",
    // o ponto só muda para "ocupado" se não estiver em manutenção —
    // essa checagem final é feita na rota, que tem acesso à linha do ponto.
  };
}

function decidirReprovacao(arquivo, motivo) {
  if (!["analise", "pendente"].includes(arquivo.status)) {
    const err = new Error("Este arquivo já foi avaliado anteriormente.");
    err.status = 409;
    throw err;
  }
  const limpo = (motivo || "").trim();
  if (limpo.length < 10) {
    const err = new Error(
      "O motivo da reprovação precisa ter pelo menos 10 caracteres — o cliente precisa saber o que corrigir."
    );
    err.status = 400;
    throw err;
  }
  return {
    arquivo: { status: "reprovada", motivo: limpo, avaliado_em: new Date() },
    campanhaStatus: "preparacao",
  };
}

module.exports = { decidirAprovacao, decidirReprovacao };
