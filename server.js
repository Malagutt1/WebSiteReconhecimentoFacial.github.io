const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const DATA_FILE = path.join(__dirname, 'faceData.json');

app.use(express.json());
app.use(express.static(__dirname)); // Serve arquivos estáticos (index.html, script.js, etc.)

// Garante que o arquivo faceData.json exista
function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [] }, null, 2));
  }
}

// Carrega dados do arquivo
function loadData() {
  ensureDataFile();
  const data = fs.readFileSync(DATA_FILE);
  return JSON.parse(data);
}

// Salva dados no arquivo
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// GET /faces - retorna todos os usuários
app.get('/faces', (req, res) => {
  const data = loadData();
  res.json(data);
});

// POST /faces - adiciona um novo usuário
app.post('/faces', (req, res) => {
  const { name, embeddings } = req.body;
  if (!name || !embeddings || !Array.isArray(embeddings) || embeddings.length === 0) {
    return res.status(400).json({ error: 'Nome ou embeddings inválidos.' });
  }
  const data = loadData();
  // Verifica se usuário já existe
  const exists = data.users.some(u => u.name === name);
  if (exists) {
    return res.status(400).json({ error: 'Usuário já cadastrado.' });
  }
  data.users.push({ name: name, embeddings: embeddings });
  saveData(data);
  res.json({ message: 'Usuário salvo com sucesso.' });
});

// DELETE /faces - exclui usuário pelo nome
app.delete('/faces', (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Nome inválido.' });
  }
  const data = loadData();
  const filtered = data.users.filter(u => u.name !== name);
  if (filtered.length === data.users.length) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }
  data.users = filtered;
  saveData(data);
  res.json({ message: 'Usuário excluído.' });
});

// Inicia o servidor
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
