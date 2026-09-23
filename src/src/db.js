// Conexão com o Postgres (Supabase) usando um "pool" de conexões —
// o pacote "pg" reaproveita conexões abertas em vez de abrir uma nova
// a cada consulta, o que é bem mais rápido em produção.

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error(
    "ERRO: variável de ambiente DATABASE_URL não configurada. " +
      "Copie .env.example para .env e preencha com a connection string do Supabase."
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // o Supabase exige SSL; em desenvolvimento local com Postgres sem SSL,
  // configure DATABASE_SSL=false no .env para desligar isso.
  ssl:
    process.env.DATABASE_SSL === "false"
      ? false
      : { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  // erro em uma conexão ociosa do pool — não derruba o processo, só loga.
  console.error("Erro inesperado no pool do Postgres:", err);
});

/** Executa uma consulta parametrizada. Ex: query('select * from pontos where id = $1', [id]) */
function query(text, params) {
  return pool.query(text, params);
}

/** Para transações: pega uma conexão dedicada do pool. Lembre de client.release() no final. */
function getClient() {
  return pool.connect();
}

module.exports = { pool, query, getClient };
