const { verifyToken } = require("./jwt");

/** Lê o token do header "Authorization: Bearer xxx", valida e anexa req.usuario. */
function autenticar(req, res, next) {
  const header = req.headers.authorization || "";
  const [tipo, token] = header.split(" ");
  if (tipo !== "Bearer" || !token) {
    return res.status(401).json({ erro: "Não autenticado. Faça login novamente." });
  }
  const payload = verifyToken(token, process.env.JWT_SECRET);
  if (!payload) {
    return res.status(401).json({ erro: "Sessão inválida ou expirada. Faça login novamente." });
  }
  req.usuario = payload; // { sub, papel, empresaId? }
  next();
}

/** Middleware opcional: não bloqueia se não houver token, mas anexa req.usuario se houver. */
function autenticarOpcional(req, res, next) {
  const header = req.headers.authorization || "";
  const [tipo, token] = header.split(" ");
  if (tipo === "Bearer" && token) {
    const payload = verifyToken(token, process.env.JWT_SECRET);
    if (payload) req.usuario = payload;
  }
  next();
}

/** Uso: exigirPapel('admin') ou exigirPapel('admin','empresa') */
function exigirPapel(...papeis) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ erro: "Não autenticado." });
    }
    if (!papeis.includes(req.usuario.papel)) {
      return res.status(403).json({ erro: "Sua conta não tem acesso a este recurso." });
    }
    next();
  };
}

module.exports = { autenticar, autenticarOpcional, exigirPapel };
