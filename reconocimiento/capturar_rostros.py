import cv2
import os

TOTAL_FOTOS = 50
TAMANO_MINIMO = 120  # caras mas pequenas no se guardan (estan lejos o son errores)
# 0 = camara del portatil, o la direccion de DroidCam para usar la del celular
CAMARA = "http://192.168.101.3:4747/video"
GIRAR_IMAGEN = True  # True si el celular esta vertical y la imagen llega acostada

nombre = input("Nombre del aprendiz (sin tildes): ").strip()
carpeta = os.path.join("fotos", nombre)
os.makedirs(carpeta, exist_ok=True)

detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
camara = cv2.VideoCapture(CAMARA)
contador = 0

print("Mira a la camara y mueve un poco la cabeza. ESC para salir.")

while contador < TOTAL_FOTOS:
    ok, imagen = camara.read()
    if not ok:
        print("No se pudo leer la camara")
        break
    if GIRAR_IMAGEN:
        imagen = cv2.rotate(imagen, cv2.ROTATE_90_CLOCKWISE)

    gris = cv2.cvtColor(imagen, cv2.COLOR_BGR2GRAY)
    caras = detector.detectMultiScale(gris, 1.3, 5, minSize=(TAMANO_MINIMO, TAMANO_MINIMO))

    # solo la primera cara
    for (x, y, w, h) in caras[:1]:
        rostro = cv2.resize(gris[y:y + h, x:x + w], (200, 200))
        contador += 1
        cv2.imwrite(os.path.join(carpeta, f"{contador}.jpg"), rostro)
        cv2.rectangle(imagen, (x, y), (x + w, y + h), (0, 255, 0), 2)

    cv2.putText(imagen, f"Fotos: {contador}/{TOTAL_FOTOS}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
    # en pantalla se muestra mas pequena para que quepa
    alto = 720
    ancho = int(imagen.shape[1] * alto / imagen.shape[0])
    cv2.imshow("Captura de rostros", cv2.resize(imagen, (ancho, alto)))

    if cv2.waitKey(100) == 27:
        break

print(f"Se guardaron {contador} fotos en {carpeta}")
camara.release()
cv2.destroyAllWindows()
