import cv2
import os
import json
import time
import urllib.request
from datetime import datetime
from dotenv import load_dotenv
import paho.mqtt.client as mqtt

HORA_INICIO = "12:00"
HORA_CORTE = "12:30"
UMBRAL = 52  # entre mas bajo mas se parece
VECES_PARA_CONFIRMAR = 12  # veces seguidas para confirmar
TAMANO_MINIMO = 200  # caras mas pequenas no se tienen en cuenta (estan lejos y salen DESCONOCIDO)
TOPIC_REGISTRO = "sena/asistencia/registro"
TOPIC_PRESENCIA = "sena/asistencia/presencia"
SEGUNDOS_CAMARA = 20  # si no ve a nadie en este tiempo se apaga la camara
# 0 = camara del portatil, o la direccion de DroidCam para usar la del celular
CAMARA = "http://192.168.101.3:4747/video"
GIRAR_IMAGEN = True  # True si el celular esta vertical y la imagen llega acostada
URL_HORARIO = "http://localhost:3000/api/horario"  # el instructor lo cambia en la pagina

load_dotenv("../.env")


def al_conectar(cliente, datos, banderas, codigo, propiedades):
    if codigo == 0:
        print("Conectado al broker MQTT")
        cliente.subscribe(TOPIC_PRESENCIA)
    else:
        print(f"No se pudo conectar al broker: {codigo}")


# cuando el ultrasonico del esp32 detecta a alguien se guarda la hora
def al_recibir(cliente, datos, mensaje):
    global ultima_presencia
    if mensaje.payload.decode() == "DETECTADO":
        ultima_presencia = time.time()


ultima_presencia = 0


cliente = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
cliente.username_pw_set(os.getenv("MQTT_USUARIO"), os.getenv("MQTT_CLAVE"))
# usa los certificados de confianza de Windows (asi funciona aunque el antivirus revise la conexion)
cliente.tls_set()
cliente.on_connect = al_conectar
cliente.on_message = al_recibir
cliente.connect(os.getenv("MQTT_HOST"), int(os.getenv("MQTT_PUERTO")))
cliente.loop_start()


def publicar_registro(nombre, hora, estado):
    mensaje = json.dumps({"nombre": nombre, "hora": hora, "estado": estado})
    cliente.publish(TOPIC_REGISTRO, mensaje, qos=1)
    print(f"Publicado: {mensaje}")


if not os.path.exists("modelo.yml"):
    print("No existe modelo.yml. Primero ejecuta: python entrenar.py")
    exit()

reconocedor = cv2.face.LBPHFaceRecognizer_create()
reconocedor.read("modelo.yml")

with open("nombres.txt", encoding="utf-8") as archivo:
    nombres = archivo.read().splitlines()

detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
camara = None
registrados = {}
ultimo_desconocido = 0
ultimo_reconocido = 0
candidato = ""
veces_seguidas = 0


ultima_consulta_horario = 0


# cada minuto se pregunta el horario al servidor, si no responde se deja el que habia
def actualizar_horario():
    global HORA_INICIO, HORA_CORTE, ultima_consulta_horario
    if time.time() - ultima_consulta_horario < 60:
        return
    ultima_consulta_horario = time.time()
    try:
        with urllib.request.urlopen(URL_HORARIO, timeout=2) as respuesta:
            horario = json.loads(respuesta.read())
        HORA_INICIO = horario["apertura"]
        HORA_CORTE = horario["inicio"]
    except Exception:
        print(f"No se pudo leer el horario del servidor, se usa {HORA_CORTE}")


def calcular_estado():
    actualizar_horario()
    ahora = datetime.now().strftime("%H:%M")
    if ahora <= HORA_CORTE:
        return "A_TIEMPO"
    return "TARDE"


actualizar_horario()
print(f"Clase: inicio {HORA_INICIO} - corte {HORA_CORTE}. ESC o Ctrl + C para salir.")
print("Esperando al sensor ultrasonico...")

while True:
    # la camara solo se prende cuando el ultrasonico detecta a alguien
    if time.time() - ultima_presencia > SEGUNDOS_CAMARA:
        if camara is not None:
            camara.release()
            cv2.destroyAllWindows()
            camara = None
            print("Camara apagada. Esperando al sensor ultrasonico...")
        time.sleep(0.2)
        continue

    if camara is None:
        print("Persona detectada, prendiendo la camara")
        camara = cv2.VideoCapture(CAMARA)

    ok, imagen = camara.read()
    if not ok:
        print("No se pudo leer la camara")
        break
    if GIRAR_IMAGEN:
        imagen = cv2.rotate(imagen, cv2.ROTATE_90_CLOCKWISE)

    gris = cv2.cvtColor(imagen, cv2.COLOR_BGR2GRAY)
    caras = detector.detectMultiScale(gris, 1.3, 5, minSize=(TAMANO_MINIMO, TAMANO_MINIMO))
    if len(caras) > 0:
        ultima_presencia = time.time()
        # solo la cara mas grande, que es la de quien esta mas cerca
        caras = [max(caras, key=lambda cara: cara[2])]

    for (x, y, w, h) in caras:
        rostro = cv2.resize(gris[y:y + h, x:x + w], (200, 200))
        etiqueta, distancia = reconocedor.predict(rostro)

        if distancia < UMBRAL:
            nombre = nombres[etiqueta]
        else:
            nombre = "DESCONOCIDO"

        # tiene que salir la misma cara varias veces
        if nombre == candidato:
            veces_seguidas += 1
        else:
            candidato = nombre
            veces_seguidas = 1
        confirmado = veces_seguidas >= VECES_PARA_CONFIRMAR

        if not confirmado:
            texto = f"Verificando... {veces_seguidas}/{VECES_PARA_CONFIRMAR}"
            color = (255, 255, 0)
        elif nombre != "DESCONOCIDO":
            # solo se registra la primera vez
            if nombre not in registrados:
                hora = datetime.now().strftime("%H:%M:%S")
                registrados[nombre] = {"hora": hora, "estado": calcular_estado()}
                print(f"{nombre} llego a las {hora} -> {registrados[nombre]['estado']}")
                publicar_registro(nombre, hora, registrados[nombre]["estado"])

            ultimo_reconocido = time.time()
            estado = registrados[nombre]["estado"]
            texto = f"{nombre} - {estado}"
            color = (0, 255, 0) if estado == "A_TIEMPO" else (0, 165, 255)
        else:
            texto = "NO REGISTRADO"
            color = (0, 0, 255)
            # el desconocido cada 10 segundos para no llenar el broker, y no justo despues
            # de reconocer a alguien (cuando voltea a mirar la maqueta su cara sale de lado)
            if time.time() - ultimo_desconocido > 10 and time.time() - ultimo_reconocido > 15:
                ultimo_desconocido = time.time()
                publicar_registro("DESCONOCIDO", datetime.now().strftime("%H:%M:%S"), "DESCONOCIDO")

        cv2.rectangle(imagen, (x, y), (x + w, y + h), color, 2)
        cv2.putText(imagen, texto, (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
        cv2.putText(imagen, f"distancia: {int(distancia)}", (x, y + h + 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

    # en pantalla se muestra mas pequena para que quepa
    alto = 720
    ancho = int(imagen.shape[1] * alto / imagen.shape[0])
    cv2.imshow("AsistIA SENA", cv2.resize(imagen, (ancho, alto)))
    if cv2.waitKey(1) == 27:
        break

cliente.loop_stop()
cliente.disconnect()
if camara is not None:
    camara.release()
cv2.destroyAllWindows()
