const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

function emailValido(v) {
  return typeof v === "string" && RE_EMAIL.test(v.trim());
}
function textoObrigatorio(v, min = 1) {
  return typeof v === "string" && v.trim().length >= min;
}
function numeroPositivo(v) {
  return typeof v === "number" && isFinite(v) && v >= 0;
}

/** Soma o valor de uma lista de itens do carrinho: [{valor, dias}] (14 dias = 1 bissemana) */
function calcularTotalCarrinho(itens) {
  return itens.reduce((soma, item) => soma + item.valor * (item.dias / 14), 0);
}

module.exports = { emailValido, textoObrigatorio, numeroPositivo, calcularTotalCarrinho };
