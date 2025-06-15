// Adicione isto no início do arquivo para desativar logs de cada requisição
process.env.DEBUG = '';

const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const DATA_FILE = path.join(__dirname, 'faceData.json');

// Desativa o log padrão do Express
app.disable('x-powered-by');

// ... restante do código permanece igual ...
app.use(express.json());
app.use(express.static(__dirname));

// Garante que o arquivo faceData.json exista
function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [] }, null, 2));
  }
}

// Carrega dados do arquivo
function loadData() {
  ensureDataFile();
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Erro ao ler arquivo de dados:', err);
    return { users: [] };
  }
}

// Salva dados no arquivo
function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Erro ao salvar dados:', err);
  }
}

// GET /faces - retorna todos os usuários
app.get('/faces', (req, res) => {
  try {
    const data = loadData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /faces - adiciona um novo usuário
app.post('/faces', (req, res) => {
  try {
    const { name, embeddings } = req.body;
    
    if (!name || !embeddings || !Array.isArray(embeddings) || embeddings.length === 0) {
      return res.status(400).json({ error: 'Nome ou embeddings inválidos.' });
    }
    
    const data = loadData();
    
    // Verifica se usuário já existe
    const userIndex = data.users.findIndex(u => u.name === name);
    
    if (userIndex !== -1) {
      // Atualiza usuário existente
      data.users[userIndex].embeddings = [
        ...data.users[userIndex].embeddings,
        ...embeddings
      ];
    } else {
      // Adiciona novo usuário
      data.users.push({ name, embeddings });
    }
    
    saveData(data);
    res.json({ message: 'Usuário salvo com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// DELETE /faces - exclui usuário pelo nome
app.delete('/faces', (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Nome inválido.' });
    }
    
    const data = loadData();
    const initialLength = data.users.length;
    data.users = data.users.filter(u => u.name !== name);
    
    if (data.users.length === initialLength) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    
    saveData(data);
    res.json({ message: 'Usuário excluído com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});