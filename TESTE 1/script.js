// script.js
const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('outputCanvas');
const canvasCtx = canvasElement.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const captureBtn = document.getElementById('captureBtn');
const usernameInput = document.getElementById('username');
const statusText = document.getElementById('statusText');
const userList = document.getElementById('userList');
const captureIndicator = document.getElementById('captureIndicator');
const overlayText = document.getElementById('overlayText');

let faceMesh = null;
let stream = null;
let isCameraActive = false;
let recognitionActive = true;
let capturing = false;
let captureCount = 0;
let embeddingsArray = [];
let facesDB = [];
let lastFaceDetected = false;

const CAPTURE_LIMIT = 30;
const RECOGNITION_THRESHOLD = 0.6;
const NORMALIZATION_REFERENCE_POINTS = [4, 152, 280];

// 1) Carrega e inicializa o FaceMesh de forma assíncrona
function initFaceMesh() {
    return new Promise((resolve, reject) => {
        // Verifica se o FaceMesh já está disponível
        if (window.FaceMesh && window.FaceMesh.FaceMesh) {
            createFaceMeshInstance(resolve, reject);
        } else {
            // Carrega o script dinamicamente se necessário
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
            script.onload = () => {
                if (window.FaceMesh && window.FaceMesh.FaceMesh) {
                    createFaceMeshInstance(resolve, reject);
                } else {
                    reject(new Error('Biblioteca FaceMesh não carregada corretamente'));
                }
            };
            script.onerror = () => {
                reject(new Error('Falha ao carregar o script FaceMesh'));
            };
            document.head.appendChild(script);
        }
    });
}

function createFaceMeshInstance(resolve, reject) {
    try {
        faceMesh = new window.FaceMesh.FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });
        
        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        faceMesh.onResults(onResults);
        console.log("FaceMesh inicializado com sucesso!");
        resolve();
    } catch (error) {
        console.error("Erro ao criar instância do FaceMesh:", error);
        reject(error);
    }
}

// 2) Loop de processamento
async function processFrame() {
    if (!isCameraActive || !faceMesh) return;
    
    try {
        if (videoElement.readyState >= 2) {
            await faceMesh.send({ image: videoElement });
        }
    } catch (e) {
        console.error("Erro no processFrame:", e);
    }
    
    requestAnimationFrame(processFrame);
}

// 3) Processa resultados do FaceMesh
function onResults(results) {
    if (!results) return;
    
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Desenha o frame do vídeo
    if (results.image) {
        canvasCtx.save();
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
        canvasCtx.restore();
    }

    const lm = results.multiFaceLandmarks?.[0];
    const faceDetected = !!lm;

    if (faceDetected !== lastFaceDetected) {
        lastFaceDetected = faceDetected;
        if (!faceDetected) {
            statusText.textContent = 'Nenhum rosto detectado';
            overlayText.textContent = 'Nenhum rosto';
        }
    }

    if (!lm) return;

    // Desenha a malha facial
    if (window.drawConnectors) {
        window.drawConnectors(canvasCtx, lm, window.FACEMESH_TESSELATION, { 
            color: '#80C0FF', 
            lineWidth: 1 
        });
    }
    
    // Processamento de captura ou reconhecimento
    if (capturing) {
        processCapture(lm);
    } else if (recognitionActive) {
        processRecognition(lm);
    }
}

// Processa o frame para captura
function processCapture(lm) {
    const normalizedLandmarks = normalizeLandmarks(lm);
    const embed = createEmbedding(normalizedLandmarks);
    
    embeddingsArray.push(embed);
    captureCount++;
    
    // Feedback visual
    captureIndicator.style.opacity = 1;
    setTimeout(() => { captureIndicator.style.opacity = 0; }, 200);
    
    statusText.textContent = `Capturando... ${captureCount}/${CAPTURE_LIMIT}`;
    overlayText.textContent = `Capturando: ${captureCount}/${CAPTURE_LIMIT}`;
    
    if (captureCount >= CAPTURE_LIMIT) {
        completeCapture();
    }
}

// Processa o frame para reconhecimento
function processRecognition(lm) {
    const normalizedLandmarks = normalizeLandmarks(lm);
    const embed = createEmbedding(normalizedLandmarks);
    recognize(embed);
}

// Normaliza os landmarks
function normalizeLandmarks(landmarks) {
    const refPoints = NORMALIZATION_REFERENCE_POINTS.map(idx => landmarks[idx]);
    const centerX = refPoints.reduce((sum, p) => sum + p.x, 0) / refPoints.length;
    const centerY = refPoints.reduce((sum, p) => sum + p.y, 0) / refPoints.length;
    
    return landmarks.map(p => ({
        x: p.x - centerX,
        y: p.y - centerY,
        z: p.z || 0
    }));
}

// Cria o embedding facial
function createEmbedding(normalizedLandmarks) {
    const embed = [];
    const keyDistances = [
        [10, 152], [234, 454], [159, 145],
        [386, 374], [33, 263], [362, 133]
    ];
    
    keyDistances.forEach(([i, j]) => {
        const dx = normalizedLandmarks[i].x - normalizedLandmarks[j].x;
        const dy = normalizedLandmarks[i].y - normalizedLandmarks[j].y;
        const dz = normalizedLandmarks[i].z - normalizedLandmarks[j].z;
        embed.push(Math.sqrt(dx*dx + dy*dy + dz*dz));
    });
    
    return embed;
}

// 4) Liga a câmera
startBtn.addEventListener('click', async () => {
    if (isCameraActive) return;
    
    try {
        statusText.textContent = 'Inicializando...';
        
        // Inicializa FaceMesh se necessário
        if (!faceMesh) {
            await initFaceMesh();
        }
        
        // Obtém acesso à câmera
        stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                width: { ideal: 640 }, 
                height: { ideal: 480 },
                facingMode: "user"
            } 
        });
        
        videoElement.srcObject = stream;
        
        // Espera o vídeo estar pronto
        await new Promise((resolve) => {
            const onReady = () => {
                videoElement.removeEventListener('loadedmetadata', onReady);
                resolve();
            };
            
            if (videoElement.readyState >= 2) {
                resolve();
            } else {
                videoElement.addEventListener('loadedmetadata', onReady);
            }
        });
        
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
        
        isCameraActive = true;
        recognitionActive = true;
        captureBtn.disabled = false;
        statusText.textContent = 'Câmera ativa - Aguardando rosto';
        overlayText.textContent = 'Câmera ativa';
        
        // Inicia o loop de processamento
        processFrame();
    } catch (e) {
        console.error("Erro ao acessar câmera:", e);
        statusText.textContent = 'Erro: ' + e.message;
        overlayText.textContent = 'Erro câmera';
    }
});

// 5) Desliga a câmera
stopBtn.addEventListener('click', () => {
    if (!isCameraActive) return;
    
    stream.getTracks().forEach(track => track.stop());
    isCameraActive = false;
    recognitionActive = false;
    capturing = false;
    captureBtn.disabled = true;
    
    statusText.textContent = 'Câmera desligada';
    overlayText.textContent = 'Câmera desligada';
});

// 6) Inicia captura
captureBtn.addEventListener('click', () => {
    if (!isCameraActive) {
        alert('Ligue a câmera primeiro!');
        return;
    }
    
    if (!usernameInput.value.trim()) {
        alert('Digite seu nome!');
        return;
    }
    
    startCapture();
});

function startCapture() {
    capturing = true;
    recognitionActive = false;
    captureCount = 0;
    embeddingsArray = [];
    
    statusText.textContent = 'Preparando... Posicione seu rosto';
    overlayText.textContent = 'Preparando...';
    
    setTimeout(() => {
        statusText.textContent = `Capturando... 0/${CAPTURE_LIMIT}`;
        overlayText.textContent = `0/${CAPTURE_LIMIT}`;
    }, 1000);
}

function completeCapture() {
    capturing = false;
    saveEmbeddings();
}

// 7) Envia embeddings ao servidor
function saveEmbeddings() {
    const name = usernameInput.value.trim();
    if (!name || embeddingsArray.length === 0) return;
    
    fetch('/faces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, embeddings: embeddingsArray })
    })
    .then(response => {
        if (!response.ok) throw new Error('Erro no servidor');
        return response.json();
    })
    .then(() => {
        alert(`Rosto de ${name} cadastrado com sucesso!`);
        statusText.textContent = 'Pronto para reconhecer';
        overlayText.textContent = 'Cadastro OK';
        recognitionActive = true;
        loadUsers();
    })
    .catch(error => {
        console.error('Erro no cadastro:', error);
        alert('Erro no cadastro: ' + error.message);
        statusText.textContent = 'Erro no cadastro';
        overlayText.textContent = 'Erro cadastro';
        recognitionActive = true;
    });
}

// 8) Carrega lista de usuários
function loadUsers() {
    fetch('/faces')
        .then(response => response.json())
        .then(data => {
            facesDB = data.users || [];
            renderUserList();
        })
        .catch(error => {
            console.error('Erro ao carregar usuários:', error);
            userList.innerHTML = '<li class="list-group-item text-danger">Erro ao carregar usuários</li>';
        });
}

function renderUserList() {
    userList.innerHTML = '';
    
    if (facesDB.length === 0) {
        userList.innerHTML = '<li class="list-group-item text-muted">Nenhum usuário cadastrado</li>';
        return;
    }
    
    facesDB.forEach(user => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        
        const userInfo = document.createElement('div');
        userInfo.innerHTML = `<strong>${user.name}</strong>`;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-danger';
        deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
        deleteBtn.onclick = () => {
            if (confirm(`Excluir "${user.name}" permanentemente?`)) {
                deleteUser(user.name);
            }
        };
        
        li.appendChild(userInfo);
        li.appendChild(deleteBtn);
        userList.appendChild(li);
    });
}

function deleteUser(name) {
    fetch('/faces', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    })
    .then(response => response.json())
    .then(() => {
        loadUsers();
        statusText.textContent = `Usuário "${name}" excluído`;
        overlayText.textContent = 'Usuário excluído';
    })
    .catch(error => {
        console.error('Erro ao excluir:', error);
        alert('Erro ao excluir: ' + error.message);
    });
}

// 9) Reconhece faces
function recognize(embed) {
    if (facesDB.length === 0) {
        statusText.textContent = 'Nenhum usuário cadastrado para reconhecer';
        overlayText.textContent = 'Sem usuários';
        return;
    }

    let bestMatch = { similarity: -1, user: null };
    
    facesDB.forEach(user => {
        user.embeddings.forEach(savedEmbed => {
            let dotProduct = 0;
            let magA = 0;
            let magB = 0;
            
            for (let i = 0; i < embed.length; i++) {
                dotProduct += embed[i] * savedEmbed[i];
                magA += embed[i] * embed[i];
                magB += savedEmbed[i] * savedEmbed[i];
            }
            
            magA = Math.sqrt(magA);
            magB = Math.sqrt(magB);
            
            if (magA > 0 && magB > 0) {
                const similarity = dotProduct / (magA * magB);
                if (similarity > bestMatch.similarity) {
                    bestMatch = { similarity, user };
                }
            }
        });
    });
    
    if (bestMatch.similarity > RECOGNITION_THRESHOLD) {
        statusText.textContent = `Reconhecido: ${bestMatch.user.name} (${Math.round(bestMatch.similarity * 100)}%)`;
        overlayText.textContent = `Reconhecido: ${bestMatch.user.name}`;
        highlightUser(bestMatch.user.name);
    } else {
        statusText.textContent = 'Rosto não reconhecido';
        overlayText.textContent = 'Não reconhecido';
    }
}

function highlightUser(username) {
    const items = userList.querySelectorAll('.list-group-item');
    
    items.forEach(item => {
        item.classList.remove('active');
        const nameElement = item.querySelector('strong');
        if (nameElement && nameElement.textContent === username) {
            item.classList.add('active');
            setTimeout(() => item.classList.remove('active'), 2000);
        }
    });
}

// Inicialização segura
window.addEventListener('load', async () => {
    try {
        statusText.textContent = 'Carregando bibliotecas...';
        await initFaceMesh();
        loadUsers();
        statusText.textContent = 'Pronto para iniciar';
    } catch (error) {
        console.error("Erro na inicialização:", error);
        statusText.textContent = 'Erro: ' + error.message;
        overlayText.textContent = 'Erro inicialização';
    }
});