import face_recognition
import cv2
import numpy as np

# Inicializando a captura de vídeo
video_capture = cv2.VideoCapture(0)

# Carregar imagens de pessoas e aprender a reconhecê-las
obama_image = face_recognition.load_image_file("obama.jpg")
obama_face_encoding = face_recognition.face_encodings(obama_image)[0]

biden_image = face_recognition.load_image_file("biden.jpg")
biden_face_encoding = face_recognition.face_encodings(biden_image)[0]

# Criar arrays com os encodings faciais e seus nomes
known_face_encodings = [
    obama_face_encoding,
    biden_face_encoding
]
known_face_names = [
    "Barack Obama",
    "Joe Biden"
]

# Inicializar variáveis
face_locations = []
face_encodings = []
face_names = []
process_this_frame = True

while True:
    # Captura um único frame de vídeo
    ret, frame = video_capture.read()

    # Processa cada outro frame para melhorar a performance
    if process_this_frame:
        # Reduz a resolução do frame para 1/4 do tamanho para processar mais rápido
        small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)

        # Converte a imagem de BGR (OpenCV) para RGB (necessário para face_recognition)
        rgb_small_frame = small_frame[:, :, ::-1]
        
        # Detecta as faces e seus encodings no frame atual
        face_locations = face_recognition.face_locations(rgb_small_frame)
        face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

        face_names = []
        for face_encoding in face_encodings:
            # Verifica se a face detectada é uma correspondência com as faces conhecidas
            matches = face_recognition.compare_faces(known_face_encodings, face_encoding)
            name = "Unknown"

            # Se um match foi encontrado, usa o nome da pessoa correspondente
            if True in matches:
                first_match_index = matches.index(True)
                name = known_face_names[first_match_index]

            face_names.append(name)

    process_this_frame = not process_this_frame

    # Exibe os resultados no vídeo
    for (top, right, bottom, left), name in zip(face_locations, face_names):
        # Redimensiona as posições das faces, já que a imagem foi reduzida a 1/4
        top *= 4
        right *= 4
        bottom *= 4
        left *= 4

        # Desenha uma caixa em volta da face
        cv2.rectangle(frame, (left, top), (right, bottom), (0, 0, 255), 2)

        # Coloca o nome abaixo da face
        cv2.rectangle(frame, (left, bottom - 35), (right, bottom), (0, 0, 255), cv2.FILLED)
        font = cv2.FONT_HERSHEY_DUPLEX
        cv2.putText(frame, name, (left + 6, bottom - 6), font, 1.0, (255, 255, 255), 1)

    # Exibe o frame resultante
    cv2.imshow('Video', frame)

    # Aperte 'q' para sair do loop
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Libera a câmera e fecha a janela
video_capture.release()
cv2.destroyAllWindows()

