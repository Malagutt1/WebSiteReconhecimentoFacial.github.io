// server.js
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Conectar ao MongoDB
mongoose.connect('mongodb://localhost:27017/facial-recognition', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Conectado ao MongoDB'))
  .catch((err) => console.error('Erro de conexão:', err));

// Definir o esquema de usuários
const userSchema = new mongoose.Schema({
  name: String,
  embeddings: [[Number]], // Armazenando os embeddings como arrays de números
});

const User = mongoose.model('User', userSchema);

// Rota para cadastrar um novo usuário (com embeddings)
app.post('/register', async (req, res) => {
  const { name, embeddings } = req.body;
  const user = new User({ name, embeddings });
  await user.save();
  res.status(201).send({ message: 'Usuário registrado com sucesso!' });
});

// Rota para listar todos os usuários cadastrados
app.get('/users', async (req, res) => {
  const users = await User.find();
  res.json(users);
});

// Rota para excluir um usuário
app.delete('/delete/:name', async (req, res) => {
  const { name } = req.params;
  await User.deleteOne({ name });
  res.send({ message: `Usuário ${name} excluído com sucesso!` });
});

// Iniciar o servidor na porta 3000
app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});
