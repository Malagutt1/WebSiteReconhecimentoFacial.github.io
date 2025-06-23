const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const context = overlay.getContext('2d');
const badge = document.getElementById('recognitionBadge');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const nameInput = document.getElementById('nameInput');
const modelStatus = document.getElementById('modelStatus');
const loading = document.getElementById('loading');
const facesList = document.getElementById('facesList');
const cameraStatusText = document.getElementById('cameraStatusText');
const recognitionStatus = document.getElementById('recognitionStatus');
const databaseStatus = document.getElementById('databaseStatus');
const indicatorDot = document.querySelector('.indicator-dot');

let facesDatabase = JSON.parse(localStorage.getItem('facesDB')) || [];
let stream = null;
let isRunning = false;
let modelsLoaded = false;
let faceapi = null;
let recognizedUser = null;

function updateSystemStatus() {
  if (isRunning) {
    cameraStatusText.textContent = "Ativa";
    cameraStatusText.style.color = "#38b000";
    indicatorDot.style.background = "#38b000";
  } else {
    cameraStatusText.textContent = "Desligada";
    cameraStatusText.style.color = "#ff6b6b";
    indicatorDot.style.background = "#ff6b6b";
  }
  
  recognitionStatus.textContent = recognizedUser ? 
    `${recognizedUser.name} (${(100 - recognizedUser.distance * 100).toFixed(0)}% confiança)` : 
    "Nenhum rosto detectado";
  
  recognitionStatus.style.color = recognizedUser ? "#38b000" : "#ff6b6b";
  
  const faceCount = facesDatabase.length;
  databaseStatus.textContent = `${faceCount} rosto${faceCount !== 1 ? 's' : ''} cadastrado${faceCount !== 1 ? 's' : ''}`;
}

function setupMediaElements() {
  const container = document.querySelector('.camera-container');
  const containerWidth = container.clientWidth;
  
  video.width = containerWidth;
  video.height = 400;
  
  overlay.width = containerWidth;
  overlay.height = 400;
  
  video.style.display = 'block';
}

function renderFacesList() {
  facesList.innerHTML = '';
  
  if (facesDatabase.length === 0) {
    facesList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-user-plus"></i>
        <p>Nenhum rosto cadastrado ainda</p>
        <p>Adicione rostos usando o formulário ao lado</p>
      </div>
    `;
    return;
  }
  
  facesDatabase.forEach((face, index) => {
    const faceItem = document.createElement('div');
    faceItem.className = 'face-item';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'face-name';
    nameSpan.textContent = face.name;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-face';
    deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
    deleteBtn.onclick = () => deleteFace(index);
    
    faceItem.appendChild(nameSpan);
    faceItem.appendChild(deleteBtn);
    facesList.appendChild(faceItem);
  });
  
  updateSystemStatus();
}

function deleteFace(index) {
  if (index >= 0 && index < facesDatabase.length) {
    const faceName = facesDatabase[index].name;
    if (confirm(`Tem certeza que deseja excluir "${faceName}"?`)) {
      facesDatabase.splice(index, 1);
      localStorage.setItem('facesDB', JSON.stringify(facesDatabase));
      renderFacesList();
    }
  }
}

function loadFaceAPI() {
  return new Promise((resolve, reject) => {
    const cdnUrls = [
      'https://cdn.jsdelivr.net/npm/face-api.js/dist/face-api.min.js',
      'https://unpkg.com/face-api.js/dist/face-api.min.js'
    ];
    
    let currentTry = 0;
    
    function tryLoad() {
      if (currentTry >= cdnUrls.length) {
        reject(new Error('Não foi possível carregar a biblioteca de reconhecimento facial'));
        return;
      }
      
      const script = document.createElement('script');
      script.src = cdnUrls[currentTry];
      script.onload = () => {
        if (window.faceapi) {
          faceapi = window.faceapi;
          resolve();
        } else {
          currentTry++;
          setTimeout(tryLoad, 1000);
        }
      };
      script.onerror = () => {
        currentTry++;
        setTimeout(tryLoad, 1000);
      };
      document.head.appendChild(script);
    }
    
    tryLoad();
  });
}

async function loadModels() {
  if (!faceapi) {
    throw new Error('Biblioteca face-api.js não disponível');
  }
  
  try {
    modelStatus.textContent = "Carregando modelos de IA...";
    
    const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';
    
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    
    modelsLoaded = true;
    saveBtn.disabled = false;
    clearBtn.disabled = false;
    nameInput.disabled = false;
    startBtn.disabled = false;
    modelStatus.textContent = "Modelos carregados com sucesso!";
    
    renderFacesList();
    updateSystemStatus();
    
    setTimeout(() => {
      loading.style.opacity = '0';
      setTimeout(() => {
        loading.style.display = 'none';
      }, 500);
    }, 1000);
    
  } catch (error) {
    modelStatus.textContent = `Erro ao carregar modelos: ${error.message}`;
  }
}

async function startCamera() {
  if (!modelsLoaded) {
    modelStatus.textContent = "Aguarde o carregamento dos modelos!";
    return;
  }
  
  try {
    modelStatus.textContent = "Iniciando câmera...";
    
    setupMediaElements();
    
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        width: { ideal: video.width },
        height: { ideal: video.height },
        facingMode: 'user'
      } 
    });
    
    video.srcObject = stream;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    isRunning = true;
    modelStatus.textContent = "Câmera ativa - Detectando rostos...";
    
    recognizedUser = null;
    updateSystemStatus();
    
    video.addEventListener('play', onPlay);
    
  } catch (err) {
    modelStatus.textContent = `Não foi possível acessar a câmera: ${err.message}`;
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  startBtn.disabled = false;
  stopBtn.disabled = true;
  isRunning = false;
  badge.style.display = 'none';
  context.clearRect(0, 0, overlay.width, overlay.height);
  modelStatus.textContent = "Câmera desativada";
  
  recognizedUser = null;
  updateSystemStatus();
}

async function onPlay() {
  if (!isRunning || video.paused || video.readyState < 2) return;
  
  try {
    const detections = await faceapi.detectAllFaces(video, 
      new faceapi.TinyFaceDetectorOptions({ 
        inputSize: 224,
        scoreThreshold: 0.5
      }))
      .withFaceLandmarks()
      .withFaceDescriptors();

    context.clearRect(0, 0, overlay.width, overlay.height);
    faceapi.matchDimensions(overlay, {width: overlay.width, height: overlay.height});
    const resized = faceapi.resizeResults(detections, {width: overlay.width, height: overlay.height});

    resized.forEach(d => {
      const box = d.detection.box;
      context.strokeStyle = '#4cc9f0';
      context.lineWidth = 2;
      context.strokeRect(box.x, box.y, box.width, box.height);
    });

    if (detections.length > 0) {
      const match = findBestMatch(detections[0].descriptor);
      if (match) {
        const box = resized[0].detection.box;
        badge.style.left = `${box.x + 15}px`;
        badge.style.top = `${box.y - 30 + 60}px`;
        badge.textContent = `${match.name} (${(100 - match.distance * 100).toFixed(0)}%)`;
        badge.style.display = 'block';
        
        recognizedUser = match;
        updateSystemStatus();
      } else {
        badge.style.display = 'none';
        recognizedUser = null;
        updateSystemStatus();
      }
    } else {
      badge.style.display = 'none';
      recognizedUser = null;
      updateSystemStatus();
    }
  } catch (error) {
    console.error("Erro na detecção:", error);
  }

  requestAnimationFrame(onPlay);
}

function findBestMatch(descriptor) {
  if(facesDatabase.length === 0) return null;
  
  let best = null;
  let minDist = 0.55;
  facesDatabase.forEach(face => {
    const dist = faceapi.euclideanDistance(descriptor, new Float32Array(face.descriptor));
    if (dist < minDist) {
      minDist = dist;
      best = { name: face.name, distance: dist };
    }
  });
  return best;
}

saveBtn.addEventListener('click', async () => {
  if (!modelsLoaded) {
    modelStatus.textContent = "Modelos ainda não carregados!";
    return;
  }
  
  const name = nameInput.value.trim();
  if (!name) {
    modelStatus.textContent = "Digite o nome antes de salvar!";
    return;
  }
  
  try {
    modelStatus.textContent = "Detectando e salvando rosto...";
    
    const detection = await faceapi.detectSingleFace(video, 
      new faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.6
      }))
      .withFaceLandmarks()
      .withFaceDescriptor();
      
    if (!detection) {
      modelStatus.textContent = "Nenhum rosto detectado!";
      return;
    }
    
    if (facesDatabase.some(entry => entry.name.toLowerCase() === name.toLowerCase())) {
      if (!confirm(`"${name}" já existe! Substituir?`)) return;
      facesDatabase = facesDatabase.filter(entry => entry.name.toLowerCase() !== name.toLowerCase());
    }
    
    facesDatabase.push({ 
      name, 
      descriptor: Array.from(detection.descriptor),
      timestamp: new Date().toISOString()
    });
    
    localStorage.setItem('facesDB', JSON.stringify(facesDatabase));
    modelStatus.textContent = `"${name}" salvo com sucesso!`;
    nameInput.value = '';
    
    renderFacesList();
    
  } catch (error) {
    modelStatus.textContent = `Erro ao processar rosto: ${error.message}`;
  }
});

clearBtn.addEventListener('click', () => {
  if (facesDatabase.length === 0) {
    modelStatus.textContent = "O banco de dados já está vazio!";
    return;
  }
  
  if (confirm('Tem certeza que deseja limpar TODOS os rostos cadastrados?')) {
    facesDatabase = [];
    localStorage.removeItem('facesDB');
    modelStatus.textContent = "Banco de dados limpo!";
    renderFacesList();
  }
});

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);

(async function init() {
  try {
    setupMediaElements();
    
    modelStatus.textContent = "Carregando biblioteca...";
    await loadFaceAPI();
    
    await loadModels();
    
    modelStatus.textContent = "Sistema pronto! Clique em 'Ligar Câmera'";
    
  } catch (error) {
    modelStatus.textContent = `Erro crítico: ${error.message}`;
  }
})();

window.addEventListener('resize', () => {
  if (!isRunning) {
    setupMediaElements();
  }
});