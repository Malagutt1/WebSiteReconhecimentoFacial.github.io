// Obtém referências aos elementos HTML
const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('outputCanvas');
const canvasCtx = canvasElement.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const captureBtn = document.getElementById('captureBtn');
const usernameInput = document.getElementById('username');
const statusText = document.getElementById('statusText');
const statusSpinner = document.getElementById('statusSpinner');
const userList = document.getElementById('userList');
const captureIndicator = document.getElementById('captureIndicator');
const deleteModal = new bootstrap.Modal('#deleteModal');
const userToDelete = document.getElementById('userToDelete');
const confirmDelete = document.getElementById('confirmDelete');

let faceMesh;
let camera;
let capturing = false;
let captureCount = 0;
let embeddingsArray = [];
let facesDB = [];
let deleteUserName = '';

// Configurações
const CAPTURE_LIMIT = 20;
const RECOGNITION_THRESHOLD = 0.15;

// Atualiza o status
function updateStatus(text, showSpinner = false) {
  statusText.textContent = text;
  statusSpinner.classList.toggle('d-none', !showSpinner);
}

// Inicializa o FaceMesh
faceMesh = new FaceMesh({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
  }
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);

// Função que roda a cada resultado de detecção
async function onResults(results) {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  
  if (results.image) {
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
  }
  
  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    // Desenha os pontos faciais
    for (const landmarks of results.multiFaceLandmarks) {
      drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, {
        color: '#80C0FF70',
        lineWidth: 1
      });
    }

    // Gera vetor de embedding
    const landmarks = results.multiFaceLandmarks[0];
    const embedding = [];
    
    for (let i = 0; i < landmarks.length; i++) {
      embedding.push(landmarks[i].x);
      embedding.push(landmarks[i].y);
      embedding.push(landmarks[i].z || 0);
    }

    if (capturing) {
      handleCaptureProcess(embedding);
    } else {
      recognizeFace(embedding);
    }
  } else {
    updateStatus("Nenhum rosto detectado");
  }
  
  canvasCtx.restore();
}

// Manipula o processo de captura
function handleCaptureProcess(embedding) {
  if (captureCount < CAPTURE_LIMIT) {
    // Efeito visual de captura
    captureIndicator.style.opacity = '1';
    setTimeout(() => {
      captureIndicator.style.opacity = '0';
    }, 200);
    
    embeddingsArray.push(embedding);
    captureCount++;
    updateStatus(`Capturando... ${captureCount}/${CAPTURE_LIMIT}`);
  } else {
    saveUserEmbeddings();
  }
}

// Inicia a câmera
startBtn.addEventListener('click', () => {
  if (camera && camera.isActive()) return;
  
  const constraints = {
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: 'user'
    }
  };

  navigator.mediaDevices.getUserMedia(constraints)
    .then((stream) => {
      videoElement.srcObject = stream;
      
      // Cria o objeto Camera do MediaPipe
      camera = new Camera(videoElement, {
        onFrame: async () => {
          await faceMesh.send({ image: videoElement });
        },
        width: 640,
        height: 480
      });
      
      camera.start();
      captureBtn.disabled = false;
      updateStatus("Câmera ativa - Posicione seu rosto");
      
      // Ajusta o canvas ao tamanho do vídeo
      videoElement.onloadedmetadata = () => {
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
      };
      
      loadUsers();
    })
    .catch((err) => {
      console.error("Erro ao acessar câmera:", err);
      updateStatus("Erro ao acessar a câmera");
    });
});

// Para a câmera
stopBtn.addEventListener('click', () => {
  if (camera) {
    camera.stop();
    updateStatus("Câmera desativada");
    captureBtn.disabled = true;
  }
});

// Captura o rosto para um novo usuário
captureBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  
  if (!name) {
    showAlert("Por favor, digite um nome antes de capturar.", "warning");
    return;
  }
  
  if (!capturing) {
    capturing = true;
    captureCount = 0;
    embeddingsArray = [];
    updateStatus("Preparando para capturar...");
    setTimeout(() => {
      updateStatus("Capturando em 3...");
      setTimeout(() => {
        updateStatus("Capturando em 2...");
        setTimeout(() => {
          updateStatus("Capturando em 1...");
          setTimeout(() => {
            updateStatus("Capturando...");
          }, 1000);
        }, 1000);
      }, 1000);
    }, 500);
  }
});

// Salva embeddings no servidor
function saveUserEmbeddings() {
  const name = usernameInput.value.trim();
  updateStatus("Salvando dados...", true);
  
  fetch('/faces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, embeddings: embeddingsArray })
  })
  .then(response => {
    if (!response.ok) throw new Error('Erro no servidor');
    return response.json();
  })
  .then(data => {
    showAlert(`Usuário ${name} cadastrado com sucesso!`, "success");
    usernameInput.value = "";
    capturing = false;
    updateStatus("Captura concluída!");
    loadUsers();
  })
  .catch(err => {
    console.error("Erro ao salvar usuário:", err);
    showAlert("Erro ao cadastrar usuário", "danger");
    updateStatus("Erro no cadastro");
  });
}

// Carrega lista de usuários
function loadUsers() {
  updateStatus("Carregando usuários...", true);
  
  fetch('/faces')
    .then(res => {
      if (!res.ok) throw new Error('Erro ao carregar usuários');
      return res.json();
    })
    .then(data => {
      facesDB = data.users || [];
      renderUserList();
      updateStatus("Usuários carregados");
    })
    .catch(err => {
      console.error("Erro ao carregar usuários:", err);
      updateStatus("Erro ao carregar usuários");
    });
}

// Renderiza a lista de usuários
function renderUserList() {
  userList.innerHTML = '';
  
  if (facesDB.length === 0) {
    userList.innerHTML = `
      <li class="list-group-item text-center text-muted">
        Nenhum usuário cadastrado
      </li>
    `;
    return;
  }
  
  facesDB.forEach(user => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `
      <div>
        <span class="fw-bold">${user.name}</span>
        <span class="badge bg-info rounded-pill ms-2">${user.embeddings.length} amostras</span>
      </div>
      <button class="btn btn-sm btn-outline-danger delete-btn" data-user="${user.name}">
        <i class="bi bi-trash"></i>
      </button>
    `;
    userList.appendChild(li);
  });
  
  // Adiciona event listeners aos botões de exclusão
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      deleteUserName = e.currentTarget.dataset.user;
      userToDelete.textContent = deleteUserName;
      deleteModal.show();
    });
  });
}

// Confirma exclusão de usuário
confirmDelete.addEventListener('click', () => {
  deleteUser(deleteUserName);
  deleteModal.hide();
});

// Exclui um usuário
function deleteUser(name) {
  updateStatus(`Excluindo ${name}...`, true);
  
  fetch('/faces', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  .then(response => {
    if (!response.ok) throw new Error('Erro ao excluir usuário');
    return response.json();
  })
  .then(() => {
    showAlert(`Usuário ${name} excluído com sucesso`, "success");
    loadUsers();
  })
  .catch(err => {
    console.error("Erro ao excluir usuário:", err);
    showAlert(`Erro ao excluir ${name}`, "danger");
    updateStatus("Erro na exclusão");
  });
}

// Reconhece o rosto
function recognizeFace(currentEmbedding) {
  if (facesDB.length === 0) {
    updateStatus("Nenhum usuário cadastrado");
    return;
  }

  let minDistance = Infinity;
  let recognizedName = null;

  for (const user of facesDB) {
    for (const emb of user.embeddings) {
      let distance = 0;
      
      // Calcula a distância euclidiana
      for (let i = 0; i < Math.min(emb.length, currentEmbedding.length); i++) {
        const diff = emb[i] - currentEmbedding[i];
        distance += diff * diff;
      }
      
      distance = Math.sqrt(distance);
      
      if (distance < RECOGNITION_THRESHOLD && distance < minDistance) {
        minDistance = distance;
        recognizedName = user.name;
      }
    }
  }

  if (recognizedName) {
    updateStatus(`Reconhecido: ${recognizedName}`);
    
    // Destaca o usuário reconhecido na lista
    const listItems = userList.querySelectorAll('.list-group-item');
    listItems.forEach(item => {
      if (item.textContent.includes(recognizedName)) {
        item.classList.add('recognized');
        setTimeout(() => item.classList.remove('recognized'), 2000);
      }
    });
  } else {
    updateStatus("Rosto não reconhecido");
  }
}

// Mostra alerta estilizado
function showAlert(message, type) {
  // Remove alertas existentes
  const existingAlert = document.querySelector('.alert');
  if (existingAlert) existingAlert.remove();
  
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
  alert.style.zIndex = '1050';
  alert.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  
  document.body.appendChild(alert);
  
  // Remove automaticamente após 3 segundos
  setTimeout(() => {
    alert.classList.remove('show');
    setTimeout(() => alert.remove(), 150);
  }, 3000);
}

// Inicializa a aplicação
updateStatus("Pronto para iniciar");
loadUsers();