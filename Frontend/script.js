    import * as vision from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs';

    const video = document.getElementById('videoFeed');
    const btnStart = document.getElementById('btnStart');
    const btnCapture = document.getElementById('btnCapture');
    const btnStop = document.getElementById('btnStop');
    const userName = document.getElementById('userName');
    const status = document.getElementById('status');
    const results = document.getElementById('results');
    const userList = document.getElementById('userList');
    const btnDelete = document.getElementById('btnDelete');
    const progressBar = document.getElementById('progressBar');

    let faceLandmarker, cameraStream;
    let isCapturing = false, captureCount = 0;
    const TOTAL = 20, DELAY = 250;
    let lastCapture = 0;
    let animationId;

    // Carregar banco de dados de faces
    let faceDB = JSON.parse(localStorage.getItem('faceDB') || '{"users":[]}');

    // Função para calcular similaridade de cosseno
    function cosineSimilarity(a, b) {
      let dot = 0, magA = 0, magB = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
      }
      magA = Math.sqrt(magA);
      magB = Math.sqrt(magB);
      return dot / (magA * magB);
    }

    // Função para reconhecer um rosto com base em embeddings
    function recognize(emb) {
      let bestMatch = { name: 'Desconhecido', similarity: 0 };
      
      faceDB.users.forEach(user => {
        user.embeddings.forEach(userEmb => {
          const similarity = cosineSimilarity(emb, userEmb);
          if (similarity > bestMatch.similarity) {
            bestMatch = { name: user.name, similarity };
          }
        });
      });

      // Limiar de confiança (ajustável)
      const confidenceThreshold = 0.65;
      
      if (bestMatch.similarity > confidenceThreshold) {
        const confidencePercent = Math.round(bestMatch.similarity * 100);
        results.textContent = `👋 Bem-vindo, ${bestMatch.name}! (${confidencePercent}% de confiança)`;
        results.style.color = '#4caf50';
      } else {
        results.textContent = '🤷‍♂️ Pessoa não reconhecida';
        results.style.color = '#f44336';
      }
    }

    // Salvar embedding facial no banco de dados
    function saveEmbedding(emb) {
      const name = userName.value.trim();
      if (!name) return;

      let user = faceDB.users.find(u => u.name === name);
      if (!user) {
        user = { name, embeddings: [] };
        faceDB.users.push(user);
      }
      
      user.embeddings.push(emb);
      localStorage.setItem('faceDB', JSON.stringify(faceDB));
    }

    // Inicializar o modelo de detecção facial
    async function initFaceLandmarker() {
      try {
        const fileset = await vision.FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
        );
        
        faceLandmarker = await vision.FaceLandmarker.createFromOptions(
          fileset,
          {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
              delegate: 'GPU'
            },
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: false,
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceEmbeddings: true // Ativar embeddings faciais
          }
        );
        
        status.textContent = '🟢 Sistema pronto para detecção facial';
        status.className = 'ready';
      } catch (error) {
        status.textContent = '🔴 Erro ao inicializar IA: ' + error.message;
        console.error('Erro na inicialização:', error);
      }
    }

    // Loop principal de detecção facial
    async function detectFaces() {
      if (!faceLandmarker || !cameraStream) return;
      
      const now = performance.now();
      const faceLandmarkerResult = await faceLandmarker.detectForVideo(video, now);
      
      // Processar resultados
      if (faceLandmarkerResult.faceLandmarks && faceLandmarkerResult.faceLandmarks.length > 0) {
        // Limpar pontos faciais anteriores
        document.querySelectorAll('.facial-point').forEach(el => el.remove());
        
        // Desenhar pontos faciais
        const videoRect = video.getBoundingClientRect();
        faceLandmarkerResult.faceLandmarks[0].forEach(landmark => {
          const point = document.createElement('div');
          point.className = 'facial-point';
          point.style.left = `${landmark.x * videoRect.width}px`;
          point.style.top = `${landmark.y * videoRect.height}px`;
          video.parentNode.appendChild(point);
        });
        
        // Processar embeddings para reconhecimento
        if (faceLandmarkerResult.faceEmbeddings && faceLandmarkerResult.faceEmbeddings.length > 0) {
          const embedding = faceLandmarkerResult.faceEmbeddings[0].embedding;
          
          if (isCapturing && now - lastCapture > DELAY) {
            lastCapture = now;
            captureCount++;
            
            // Atualizar barra de progresso
            const progressPercent = (captureCount / TOTAL) * 100;
            progressBar.style.width = `${progressPercent}%`;
            
            status.textContent = `📸 Capturando ${captureCount}/${TOTAL}`;
            status.className = 'capturing';
            
            saveEmbedding(embedding);
            
            if (captureCount >= TOTAL) {
              stopCapture();
            }
          } else if (!isCapturing) {
            recognize(embedding);
          }
        }
      } else {
        results.textContent = '👀 Nenhum rosto detectado';
        results.style.color = '#ff9800';
      }
      
      animationId = requestAnimationFrame(detectFaces);
    }

    // Iniciar captura de rostos
    function startCapture() {
      const name = userName.value.trim();
      if (!name) {
        alert('Por favor, digite seu nome completo antes de capturar.');
        return;
      }
      
      isCapturing = true;
      captureCount = 0;
      lastCapture = 0;
      progressBar.style.width = '0%';
      btnCapture.disabled = true;
      userName.disabled = true;
      
      status.textContent = '⏳ Preparando captura...';
      setTimeout(() => (status.textContent = '📸 Capturando fotos...'), 500);
    }

    // Parar captura de rostos
    function stopCapture() {
      isCapturing = false;
      btnCapture.disabled = false;
      userName.disabled = false;
      
      status.textContent = `✅ ${userName.value.trim()} cadastrado com sucesso!`;
      status.className = 'ready';
      userName.value = '';
      
      updateUserList();
    }

    // Atualizar lista de usuários
    function updateUserList() {
      userList.innerHTML = '';
      faceDB.users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.name;
        option.textContent = `${user.name} (${user.embeddings.length} embeddings)`;
        userList.appendChild(option);
      });
    }

    // Event Listeners
    btnStart.addEventListener('click', async () => {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user' } 
        });
        video.srcObject = cameraStream;
        
        await initFaceLandmarker();
        detectFaces();
        
        btnStart.disabled = true;
        btnStop.disabled = false;
        btnCapture.disabled = false;
        
        status.textContent = '🟢 Câmera ativa - Sistema operacional';
        status.className = 'ready';
      } catch (error) {
        status.textContent = '🔴 Erro ao acessar a câmera: ' + error.message;
        console.error('Erro na câmera:', error);
      }
    });

    btnCapture.addEventListener('click', startCapture);

    btnStop.addEventListener('click', () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
      }
      
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      
      btnStart.disabled = false;
      btnStop.disabled = true;
      btnCapture.disabled = true;
      
      status.textContent = '⏹️ Câmera desligada';
      results.textContent = '👤 Sistema inativo';
      results.style.color = '#9e9e9e';
    });

    btnDelete.addEventListener('click', () => {
      const selectedUser = userList.value;
      if (!selectedUser) {
        alert('Por favor, selecione um usuário para excluir.');
        return;
      }
      
      faceDB.users = faceDB.users.filter(user => user.name !== selectedUser);
      localStorage.setItem('faceDB', JSON.stringify(faceDB));
      
      updateUserList();
      status.textContent = `🗑️ ${selectedUser} foi removido do sistema`;
    });

    // Inicializar lista de usuários
    updateUserList();
