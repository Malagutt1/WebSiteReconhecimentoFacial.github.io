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
let deleteModal;
let userToDelete, confirmDelete;

let faceMesh;
let camera;
let capturing = false;
let captureCount = 0;
let embeddingsArray = [];
let facesDB = [];
let deleteUserName = '';
let recognitionActive = false; // Controle adicional para reconhecimento

// Configurações
const CAPTURE_LIMIT = 30;
const RECOGNITION_THRESHOLD = 0.12;
let recognitionTimeout = null;

// Inicializa o modal do Bootstrap após o DOM estar carregado
document.addEventListener('DOMContentLoaded', () => {
  deleteModal = new bootstrap.Modal('#deleteModal');
  userToDelete = document.getElementById('userToDelete');
  confirmDelete = document.getElementById('confirmDelete');
  
  confirmDelete.addEventListener('click', () => {
    deleteUser(deleteUserName);
    deleteModal.hide();
  });
});

// Atualiza o status
function updateStatus(text, showSpinner = false) {
  statusText.textContent = text;
  if (statusSpinner) {
    statusSpinner.classList.toggle('d-none', !showSpinner);
  }
}

// Mostra alerta estilizado
function showAlert(message, type) {
  const existingAlert = document.querySelector('.alert');
  if (existingAlert) existingAlert.remove();
  
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} alert-dismissible fade show alert-position`;
  alert.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  
  document.body.appendChild(alert);
  
  setTimeout(() => {
    alert.classList.remove('show');
    setTimeout(() => alert.remove(), 150);
  }, 3000);
}

// Inicializa o FaceMesh
function initFaceMesh() {
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
}

// Função que roda a cada resultado de detecção
async function onResults(results) {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  
  canvasCtx.scale(-1, 1);
  canvasCtx.translate(-canvasElement.width, 0);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.restore();
  
  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    for (const landmarks of results.multiFaceLandmarks) {
      drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, {
        color: '#80C0FF',
        lineWidth: 1,
        opacity: 0.8
      });
      drawLandmarks(canvasCtx, landmarks, {
        color: '#FF0000',
        lineWidth: 0.5,
        radius: 1,
        opacity: 0.8
      });
    }

    const landmarks = results.multiFaceLandmarks[0];
    const embedding = [];
    
    for (let i = 0; i < landmarks.length; i++) {
      embedding.push(landmarks[i].x);
      embedding.push(landmarks[i].y);
      embedding.push(landmarks[i].z || 0);
    }

    if (capturing) {
      handleCaptureProcess(embedding);
    } else if (recognitionActive) { // Só reconhece se estiver ativo
      recognizeFace(embedding);
    }
  } else {
    updateStatus("Nenhum rosto detectado");
  }
}

// Manipula o processo de captura
function handleCaptureProcess(embedding) {
  if (captureCount < CAPTURE_LIMIT) {
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
startBtn.addEventListener('click', async () => {
  try {
    if (camera && camera.isActive()) {
      showAlert("A câmera já está ativa", "info");
      return;
    }
    
    const constraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = stream;
    
    // Espera o vídeo carregar os metadados
    await new Promise((resolve) => {
      videoElement.onloadedmetadata = resolve;
    });
    
    // Inicia a câmera do MediaPipe
    camera = new Camera(videoElement, {
      onFrame: async () => {
        if (camera && camera.isActive()) {
          await faceMesh.send({ image: videoElement });
        }
      },
      width: videoElement.videoWidth,
      height: videoElement.videoHeight
    });
    
    await camera.start();
    captureBtn.disabled = false;
    recognitionActive = true; // Ativa reconhecimento
    updateStatus("Câmera ativa - Posicione seu rosto");
    
    // Ajusta o canvas ao tamanho do vídeo
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    
    loadUsers();
  } catch (err) {
    console.error("Erro ao acessar câmera:", err);
    showAlert("Erro ao acessar a câmera: " + err.message, "danger");
    updateStatus("Erro ao acessar câmera");
  }
});

// Para a câmera
stopBtn.addEventListener('click', () => {
  if (camera) {
    camera.stop();
    recognitionActive = false; // Desativa reconhecimento
    if (videoElement.srcObject) {
      videoElement.srcObject.getTracks().forEach(track => track.stop());
    }
    updateStatus("Câmera desativada");
    captureBtn.disabled = true;
    capturing = false;
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
    recognitionActive = false; // Desativa reconhecimento durante captura
    captureCount = 0;
    embeddingsArray = [];
    updateStatus("Preparando para capturar...");
    
    let count = 3;
    const countdown = setInterval(() => {
      if (count > 0) {
        updateStatus(`Capturando em ${count}...`);
        count--;
      } else {
        clearInterval(countdown);
        updateStatus("Capturando...");
      }
    }, 1000);
  }
});

// Salva embeddings no servidor
function saveUserEmbeddings() {
  const name = usernameInput.value.trim();
  updateStatus("Salvando dados...", true);
  
  fetch('/faces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, embeddings: embeddingsArray })
  })
  .then(response => {
    if (!response.ok) throw new Error('Erro no servidor');
    return response.json();
  })
  .then(data => {
    showAlert(`Usuário ${name} cadastrado com sucesso!`, "success");
    usernameInput.value = "";
    capturing = false;
    recognitionActive = true; // Reativa reconhecimento após captura
    updateStatus("Captura concluída!");
    loadUsers();
  })
  .catch(err => {
    console.error("Erro ao salvar usuário:", err);
    showAlert("Erro ao cadastrar usuário", "danger");
    updateStatus("Erro no cadastro");
  });
}

// Restante do código permanece igual...
// (Carregar usuários, renderizar lista, excluir usuário, reconhecer face)