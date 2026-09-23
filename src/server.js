require("dotenv").config();

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const pontosRoutes = require("./routes/pontos.routes");
const empresasRoutes = require("./routes/empresas.routes");
const usuariosRoutes = require("./routes/usuarios.routes");
const pedidosRoutes = require("./routes/pedidos.routes");
const campanhasRoutes = require("./routes/campanhas.routes");
const arquivosRoutes = require("./routes/arquivos.routes");
const relatoriosRoutes = require("./routes/relatorios.routes");

const app = express();

// as fotos e vídeos chegam como texto base64 dentro do JSON — precisa de um
// limite maior que o padrão do Express (100kb). 30mb cobre o limite de 20MB
// de arquivo decodificado definido em src/domain/upload.js, com folga.
app.use(cors());
app.use(express.json({ limit: "30mb" }));

app.get("/", (req, res) => {
  res.json({ ok: true, servico: "OutdoorHub API", hora: new Date().toISOString() });
});
app.get("/saude", (req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/pontos", pontosRoutes);
app.use("/empresas", empresasRoutes);
app.use("/usuarios", usuariosRoutes);
app.use("/pedidos", pedidosRoutes);
app.use("/campanhas", campanhasRoutes);
app.use("/", arquivosRoutes); // define rotas completas: /campanhas/:id/arquivos e /arquivos/:id/(aprovar|reprovar)
app.use("/relatorios", relatoriosRoutes);

// rota inexistente
app.use((req, res) => {
  res.status(404).json({ erro: "Rota não encontrada." });
});

// tratamento de erros central — qualquer next(erro) das rotas cai aqui.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  const publico = status < 500 ? err.message : "Erro interno do servidor.";
  res.status(status).json({ erro: publico });
});

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`OutdoorHub API rodando na porta ${PORT}`);
});

module.exports = app;
