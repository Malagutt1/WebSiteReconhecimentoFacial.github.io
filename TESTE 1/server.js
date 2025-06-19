// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'faceData.json');

// Garante que o arquivo de dados exista
function ensureDataFile() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [] }, null, 2));
    }
}

// Carrega dados
function loadData() {
    ensureDataFile();
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        console.error("Erro ao carregar dados:", e);
        return { users: [] };
    }
}

// Salva dados
function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Erro ao salvar dados:", e);
    }
}

// Calcula embedding médio
function calculateAverageEmbedding(embeddings) {
    if (!embeddings.length) return [];
    
    const length = embeddings[0].length;
    const avgEmbedding = new Array(length).fill(0);
    
    embeddings.forEach(embed => {
        for (let i = 0; i < length; i++) {
            avgEmbedding[i] += embed[i];
        }
    });
    
    return avgEmbedding.map(val => val / embeddings.length);
}

// Rotas
app.get('/faces', (req, res) => {
    res.json(loadData());
});

app.post('/faces', (req, res) => {
    const { name, embeddings } = req.body;
    
    if (!name || !Array.isArray(embeddings) || embeddings.length === 0) {
        return res.status(400).json({ error: 'Dados inválidos' });
    }
    
    const data = loadData();
    const avgEmbedding = calculateAverageEmbedding(embeddings);
    
    // Remove espaços extras e normaliza o nome
    const normalizedName = name.trim();
    
    // Verifica se o usuário já existe
    const existingUserIndex = data.users.findIndex(u => u.name === normalizedName);
    
    if (existingUserIndex !== -1) {
        // Atualiza usuário existente
        data.users[existingUserIndex].embeddings.push(avgEmbedding);
    } else {
        // Cria novo usuário
        data.users.push({
            name: normalizedName,
            embeddings: [avgEmbedding],
            createdAt: new Date().toISOString()
        });
    }
    
    saveData(data);
    res.json(loadData());
});

app.delete('/faces', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome inválido' });
    
    const data = loadData();
    const initialLength = data.users.length;
    
    // Filtra usuários mantendo apenas os diferentes do nome especificado
    data.users = data.users.filter(u => u.name !== name.trim());
    
    if (data.users.length === initialLength) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    saveData(data);
    res.json(loadData());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));