// Elementos DOM
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
const errorDisplay = document.getElementById('errorDisplay');
const loading = document.getElementById('loading');

// Variáveis globais
let facesDatabase = JSON.parse(localStorage.getItem('facesDB')) || [];
let stream = null;
let isRunning = false;
let modelsLoaded = false;
let faceapi = null;

// Configurar dimensões do canvas e vídeo
function setupMediaElements() {
  const container = document.querySelector('.camera-container');
  const containerWidth = container.clientWidth - 30; // 15px de padding em cada lado
  const aspectRatio = 9 / 16; // Proporção 16:9, mas invertida para altura/largura
  
  // Definir dimensões do vídeo e canvas
  video.width = containerWidth;
  video.height = containerWidth * aspectRatio;
  
  overlay.width = containerWidth;
  overlay.height = containerWidth * aspectRatio;
  
  // Garantir que o vídeo seja exibido
  video.style.display = 'block';
}

// Carregar a biblioteca face-api.js
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

// Carregar modelos
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
    
    setTimeout(() => {
      loading.style.opacity = '0';
      setTimeout(() => {
        loading.style.display = 'none';
      }, 500);
      modelStatus.textContent = "Sistema pronto! Clique em 'Ligar Câmera' para começar";
    }, 1000);
    
  } catch (error) {
    console.error("Erro ao carregar modelos:", error);
    showError(`
      Erro ao carregar modelos de IA:<br>
      ${error.message}<br><br>
      Possíveis soluções:<br>
      1. Recarregue a página (Ctrl + F5)<br>
      2. Verifique sua conexão com a internet<br>
      3. Tente mais tarde
    `);
  }
}

// Função para mostrar erros
function showError(message) {
  errorDisplay.innerHTML = message;
  loading.style.opacity = '0';
  setTimeout(() => {
    loading.style.display = 'none';
  }, 500);
}

// Iniciar câmera
async function startCamera() {
  if (!modelsLoaded) {
    showError("Por favor, aguarde o carregamento completo dos modelos!");
    return;
  }
  
  try {
    modelStatus.textContent = "Iniciando câmera...";
    
    // Configurar elementos de mídia antes de acessar a câmera
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
    
    // Adicionar evento para processamento de vídeo
    video.addEventListener('play', onPlay);
    
  } catch (err) {
    console.error("Erro na câmera:", err);
    showError(`
      Não foi possível acessar a câmera:<br>
      ${err.name}: ${err.message}<br><br>
      Certifique-se de:<br>
      1. Permitir acesso à câmera<br>
      2. Conectar uma câmera funcional<br>
      3. Recarregar a página e tentar novamente
    `);
  }
}

// Parar câmera
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
}

// Loop de detecção
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
        badge.style.top = `${box.y - 30 + 15}px`;
        badge.textContent = `${match.name} (${(100 - match.distance * 100).toFixed(0)}%)`;
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }
    } else {
      badge.style.display = 'none';
    }
  } catch (error) {
    console.error("Erro na detecção:", error);
  }

  requestAnimationFrame(onPlay);
}

// Encontrar melhor correspondência
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

// Salvar rosto
saveBtn.addEventListener('click', async () => {
  if (!modelsLoaded) {
    showError("Modelos ainda não carregados!");
    return;
  }
  
  const name = nameInput.value.trim();
  if (!name) {
    showError("Digite o nome antes de salvar!");
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
      showError("Posicione seu rosto na câmera e tente novamente");
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
    errorDisplay.textContent = "";
    
  } catch (error) {
    console.error("Erro ao salvar rosto:", error);
    showError(`Erro ao processar rosto: ${error.message}`);
  }
});

// Limpar banco de dados
clearBtn.addEventListener('click', () => {
  if (facesDatabase.length === 0) {
    showError("O banco de dados já está vazio!");
    return;
  }
  
  if (confirm('Tem certeza que deseja limpar TODOS os rostos cadastrados?')) {
    facesDatabase = [];
    localStorage.removeItem('facesDB');
    modelStatus.textContent = "Banco de dados limpo!";
    showError("Todos os rostos foram removidos!");
  }
});

// Event listeners
startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);

// Inicialização do sistema
(async function init() {
  try {
    // Configurar elementos de mídia
    setupMediaElements();
    
    // Carregar biblioteca
    modelStatus.textContent = "Carregando biblioteca de reconhecimento...";
    await loadFaceAPI();
    
    // Carregar modelos
    await loadModels();
    
    modelStatus.textContent = "Sistema pronto! Clique em 'Ligar Câmera' para começar";
    
  } catch (error) {
    console.error("Erro na inicialização:", error);
    showError(`
      <strong>Erro crítico:</strong> Não foi possível carregar o sistema<br><br>
      ${error.message}<br><br>
      Por favor:<br>
      1. Verifique sua conexão com a internet<br>
      2. Recarregue a página (Ctrl + F5)<br>
      3. Tente usar outro navegador (Chrome, Firefox)<br>
      4. Se o problema persistir, tente mais tarde
    `);
  }
})();

// Redimensionar ao mudar o tamanho da janela
window.addEventListener('resize', () => {
  if (!isRunning) {
    setupMediaElements();
  }
});