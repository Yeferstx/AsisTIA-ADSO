import os
import json
import time
from dotenv import load_dotenv
import paho.mqtt.client as mqtt

# Hace de ESP32 para probar sin la maqueta: escucha lo que le llegaria
# a la placa y responde el estado de los LED igual que ella
load_dotenv("../.env")

leds = {"verde": False, "rojo": False}


def al_conectar(cliente, datos, banderas, codigo, propiedades):
    if codigo == 0:
        print("Simulador ESP32 conectado (Ctrl + C para salir)")
        cliente.subscribe("sena/asistencia/registro")
        cliente.subscribe("sena/asistencia/control")
        cliente.subscribe("sena/asistencia/led")
    else:
        print(f"No se pudo conectar al broker: {codigo}")


def cambiar_leds(cliente, verde, rojo):
    leds["verde"] = verde
    leds["rojo"] = rojo
    print(f"[LED] verde={verde} rojo={rojo}")
    cliente.publish("sena/asistencia/led/estado", json.dumps(leds), retain=True)


def al_recibir(cliente, datos, mensaje):
    texto = mensaje.payload.decode()
    tema = mensaje.topic

    if tema == "sena/asistencia/registro":
        registro = json.loads(texto)
        if registro["estado"] == "A_TIEMPO":
            cambiar_leds(cliente, True, False)
            print(f"[LCD] Bienvenido {registro['nombre']} / A TIEMPO  (talanquera abierta 3 s)")
        elif registro["estado"] == "TARDE":
            cambiar_leds(cliente, False, True)
            print(f"[LCD] Bienvenido {registro['nombre']} / TARDE  (talanquera abierta 3 s)")
        else:
            cambiar_leds(cliente, False, True)
            print("[LCD] NO REGISTRADO / Acceso negado  (talanquera cerrada)")
    elif tema == "sena/asistencia/control":
        print(f"[CONTROL] {texto}")
    elif tema == "sena/asistencia/led":
        if texto == "ENCENDER_VERDE":
            cambiar_leds(cliente, True, leds["rojo"])
        if texto == "APAGAR_VERDE":
            cambiar_leds(cliente, False, leds["rojo"])
        if texto == "ENCENDER_ROJO":
            cambiar_leds(cliente, leds["verde"], True)
        if texto == "APAGAR_ROJO":
            cambiar_leds(cliente, leds["verde"], False)


cliente = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
cliente.username_pw_set(os.getenv("MQTT_USUARIO"), os.getenv("MQTT_CLAVE"))
cliente.tls_set(ca_certs="../certificados/emqxsl-ca.crt")
cliente.on_connect = al_conectar
cliente.on_message = al_recibir
cliente.connect(os.getenv("MQTT_HOST"), int(os.getenv("MQTT_PUERTO")))

# Al arrancar avisa el estado de los LED, como hace la placa
cliente.loop_start()
time.sleep(2)
cliente.publish("sena/asistencia/led/estado", json.dumps(leds), retain=True)
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    cliente.loop_stop()
