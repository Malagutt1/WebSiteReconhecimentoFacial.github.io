// Obtém referências aos elementos HTML
const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('outputCanvas');
const canvasCtx = canvasElement.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const captureBtn = document.getElementById('captureBtn');
const usernameInput = document.getElementById('username');
const statusDiv = document.getElementById('status');
const userList = document.getElementById('userList');

let faceMesh;
let camera;
let capturing = false;
let captureCount = 0;
let embeddingsArray = []; // Armazena embeddings capturados para o novo usuário
let facesDB = []; // Vai conter os dados de faceData.json

// Inicializa o FaceMesh
faceMesh = new FaceMesh({
  locateFile: (file) => {
    // Define de onde carregar os arquivos do FaceMesh
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
  }
});
faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});
faceMesh.onResults(onResults);

// Função que roda a cada resultado de detecção
async function onResults(results) {
  // Desenha o vídeo e os pontos faciais no canvas
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    // Desenha os pontos faciais
    for (const landmarks of results.multiFaceLandmarks) {
      drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION,
                     { color: '#C0C0C070', lineWidth: 1 });
      drawLandmarks(canvasCtx, landmarks, {color: 'red', lineWidth: 1});
    }
    statusDiv.textContent = "Rosto detectado";

    // Gera vetor de embedding a partir dos pontos (flatten x, y, z)
    const landmarks = results.multiFaceLandmarks[0];
    const embedding = [];
    for (let i = 0; i < landmarks.length; i++) {
      embedding.push(landmarks[i].x);
      embedding.push(landmarks[i].y);
      embedding.push(landmarks[i].z);
    }

    // Se estivermos no modo de captura (apertou botão de capturar)
    if (capturing) {
      if (captureCount < 20) {
        embeddingsArray.push(embedding);
        captureCount++;
        statusDiv.textContent = `Capturas: ${captureCount} de 20`;
      }
      // Se atingiu 20 capturas, envia ao servidor
      if (captureCount === 20) {
        saveUserEmbeddings();
      }
    } else {
      // Se não estamos capturando um novo usuário, faz reconhecimento
      recognizeFace(embedding);
    }
  } else {
    statusDiv.textContent = "Nenhum rosto detectado";
  }
  canvasCtx.restore();
}

// Inicia a câmera usando MediaPipe Camera
startBtn.addEventListener('click', () => {
  const constraints = { video: { width: 640, height: 480 } };
  navigator.mediaDevices.getUserMedia(constraints)
    .then((stream) => {
      videoElement.srcObject = stream;
      videoElement.play();
      // Cria o objeto Camera do MediaPipe
      camera = new Camera(videoElement, {
        onFrame: async () => {
          await faceMesh.send({image: videoElement});
        },
        width: 640,
        height: 480
      });
      camera.start();
      captureBtn.disabled = false;
      statusDiv.textContent = "Câmera ligada";
      loadUsers(); // Carrega lista de usuários ao ligar a câmera
    })
    .catch((err) => {
      console.error("Erro ao acessar câmera:", err);
    });
});

// Para a câmera
stopBtn.addEventListener('click', () => {
  if (camera) {
    camera.stop();
    statusDiv.textContent = "Câmera desligada";
  }
});

// Captura o rosto para um novo usuário
captureBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if (!name) {
    alert("Por favor, digite um nome antes de capturar.");
    return;
  }
  // Inicia captura se ainda não começou
  if (!capturing) {
    capturing = true;
    captureCount = 0;
    embeddingsArray = [];
    statusDiv.textContent = "Iniciando captura...";
  }
});

// Função para salvar no servidor as embeddings do novo usuário
function saveUserEmbeddings() {
  const name = usernameInput.value.trim();
  fetch('/faces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, embeddings: embeddingsArray })
  })
  .then(response => response.json())
  .then(data => {
    statusDiv.textContent = `Usuário ${name} cadastrado.`;
    usernameInput.value = "";
    capturing = false;
    captureBtn.disabled = true;
    loadUsers(); // Atualiza a lista
  })
  .catch(err => {
    console.error("Erro ao salvar usuário:", err);
    statusDiv.textContent = "Erro no cadastro.";
  });
}

// Carrega lista de usuários cadastrados do servidor
function loadUsers() {
  fetch('/faces')
    .then(res => res.json())
    .then(data => {
      facesDB = data.users;
      userList.innerHTML = '';
      for (const user of data.users) {
        const li = document.createElement('li');
        li.textContent = `${user.name} (${user.embeddings.length} amostras)`;
        // Botão de excluir
        const btn = document.createElement('button');
        btn.textContent = 'Excluir';
        btn.onclick = () => deleteUser(user.name);
        li.appendChild(btn);
        userList.appendChild(li);
      }
    });
}

// Exclui um usuário pelo nome
function deleteUser(name) {
  fetch('/faces', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name })
  })
  .then(() => {
    statusDiv.textContent = `Usuário ${name} excluído.`;
    loadUsers();
  })
  .catch(err => {
    console.error("Erro ao excluir usuário:", err);
  });
}

// Reconhece o rosto atual comparando com o banco de dados
function recognizeFace(currentEmbedding) {
  let recognizedName = null;
  const threshold = 0.1; // Limiar de distância (ajustável)

  // Compara contra cada usuário e cada embedding
  for (const user of facesDB) {
    for (const emb of user.embeddings) {
      // Calcula distância Euclidiana
      let sum = 0;
      for (let i = 0; i < emb.length; i++) {
        const diff = emb[i] - currentEmbedding[i];
        sum += diff * diff;
      }
      const dist = Math.sqrt(sum);
      if (dist < threshold) {
        recognizedName = user.name;
        break;
      }
    }
    if (recognizedName) break;
  }

  if (recognizedName) {
    statusDiv.textContent = `Rosto reconhecido: ${recognizedName}`;
  } else {
    statusDiv.textContent = "Desconhecido";
  }
}
