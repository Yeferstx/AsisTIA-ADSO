#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ESP32Servo.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include <time.h>
#include "secretos.h"
#include "certificado.h"

#define PIN_PIR 19
#define PIN_TRIG 25
#define PIN_ECHO 14
#define PIN_TACTIL 4
#define PIN_SERVO 18
#define PIN_RELE 13
#define PIN_LED_VERDE 27
#define PIN_LED_ROJO 26
#define PIN_OLED_SDA 33
#define PIN_OLED_SCL 32

#define SERVO_CERRADO 0
#define SERVO_ABIERTO 90
#define DISTANCIA_PERSONA 40  // cm

const char* TOPIC_PRESENCIA = "sena/asistencia/presencia";
const char* TOPIC_REGISTRO = "sena/asistencia/registro";
const char* TOPIC_CONTEO = "sena/asistencia/conteo";
const char* TOPIC_CONTROL = "sena/asistencia/control";
const char* TOPIC_LED = "sena/asistencia/led";
const char* TOPIC_LED_ESTADO = "sena/asistencia/led/estado";

WiFiClientSecure clienteWifi;
PubSubClient clienteMqtt(clienteWifi);
Servo talanquera;
LiquidCrystal_I2C lcd(0x27, 16, 2);
// la OLED va en su propio bus I2C: SDA en G33 y SCL en G32
TwoWire busOled = TwoWire(1);
Adafruit_SSD1306 pantalla(128, 64, &busOled, -1);

bool asistenciaAbierta = true;
int contadorPersonas = 0;
bool personaCerca = false;
int pirAnterior = LOW;
int tactilAnterior = LOW;
int tactilReposo = LOW;  // como lee el tactil cuando nadie lo toca
unsigned long ultimaMedicion = 0;
unsigned long ultimoAvisoCamara = 0;
unsigned long ultimoToque = 0;
int lecturasLejos = 0;
bool ledVerde = false;
bool ledRojo = false;
unsigned long ultimaHora = 0;
bool dosPuntos = true;
bool hayPantalla = false;

void mostrar(String linea1, String linea2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(linea1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(linea2.substring(0, 16));
}

void mostrarEspera() {
  if (asistenciaAbierta) {
    mostrar("AsistIA SENA", "Asist. ABIERTA");
  } else {
    mostrar("AsistIA SENA", "Asist. CERRADA");
  }
}

void conectarWifi() {
  mostrar("Conectando WiFi", WIFI_NOMBRE);
  WiFi.mode(WIFI_STA);
  // menos potencia para que el USB alcance a alimentar todo
  WiFi.setTxPower(WIFI_POWER_11dBm);
  WiFi.begin(WIFI_NOMBRE, WIFI_CLAVE);
  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    intentos++;
    // cada 30 seg vuelve a intentar
    if (intentos % 60 == 0) {
      // 1 no encuentra red, 4 clave mala, 6 desconectado
      Serial.println("\nReintentando WiFi... estado: " + String(WiFi.status()));
      WiFi.disconnect();
      WiFi.begin(WIFI_NOMBRE, WIFI_CLAVE);
    }
  }
  Serial.println("\nWiFi conectado: " + WiFi.localIP().toString());
}

// el certificado necesita la hora
void sincronizarHora() {
  mostrar("Sincronizando", "hora NTP...");
  configTime(-5 * 3600, 0, "pool.ntp.org", "time.google.com");  // hora colombia
  struct tm hora;
  while (!getLocalTime(&hora)) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(&hora, "\nHora: %d/%m/%Y %H:%M:%S");
}

// el rele se prende con HIGH y se apaga con LOW
void prenderRele() {
  pinMode(PIN_RELE, OUTPUT);
  digitalWrite(PIN_RELE, HIGH);
}

void apagarRele() {
  pinMode(PIN_RELE, OUTPUT);
  digitalWrite(PIN_RELE, LOW);
}

// le avisa a la pagina como estan los led
void publicarLeds() {
  JsonDocument estado;
  estado["verde"] = ledVerde;
  estado["rojo"] = ledRojo;
  String texto;
  serializeJson(estado, texto);
  clienteMqtt.publish(TOPIC_LED_ESTADO, texto.c_str(), true);
}

void cambiarLeds(bool verde, bool rojo) {
  ledVerde = verde;
  ledRojo = rojo;
  digitalWrite(PIN_LED_VERDE, ledVerde);
  digitalWrite(PIN_LED_ROJO, ledRojo);
  publicarLeds();
}

void abrirTalanquera(String nombre, String estado) {
  prenderRele();
  talanquera.write(SERVO_ABIERTO);
  mostrar("Bienvenido", nombre);
  delay(1500);
  mostrar(nombre, estado);
  delay(1500);
  talanquera.write(SERVO_CERRADO);
  mostrarEspera();
}

void alRecibirMensaje(char* topic, byte* datos, unsigned int largo) {
  String mensaje = "";
  for (unsigned int i = 0; i < largo; i++) {
    mensaje += (char)datos[i];
  }
  String tema = String(topic);
  Serial.println(tema + " -> " + mensaje);

  if (tema == TOPIC_CONTROL) {
    if (mensaje == "ABRIR") {
      asistenciaAbierta = true;
      contadorPersonas = 0;
    } else if (mensaje == "CERRAR") {
      asistenciaAbierta = false;
      apagarRele();
    } else if (mensaje == "APAGAR_LUZ") {
      // hora de salida, ya se fueron todos
      apagarRele();
    }
    mostrarEspera();
    return;
  }

  // la pagina prende y apaga los led a mano
  if (tema == TOPIC_LED) {
    if (mensaje == "ENCENDER_VERDE") cambiarLeds(true, ledRojo);
    if (mensaje == "APAGAR_VERDE") cambiarLeds(false, ledRojo);
    if (mensaje == "ENCENDER_ROJO") cambiarLeds(ledVerde, true);
    if (mensaje == "APAGAR_ROJO") cambiarLeds(ledVerde, false);
    return;
  }

  if (tema == TOPIC_REGISTRO) {
    if (!asistenciaAbierta) {
      return;
    }
    JsonDocument registro;
    if (deserializeJson(registro, mensaje)) {
      Serial.println("JSON invalido");
      return;
    }
    String nombre = registro["nombre"].as<String>();
    String estado = registro["estado"].as<String>();

    if (estado == "A_TIEMPO") {
      cambiarLeds(true, false);
      abrirTalanquera(nombre, "A TIEMPO");
    } else if (estado == "TARDE") {
      cambiarLeds(false, true);
      abrirTalanquera(nombre, "TARDE");
    } else {
      cambiarLeds(false, true);
      mostrar("NO REGISTRADO", "Acceso negado");
      delay(2000);
      mostrarEspera();
    }
    cambiarLeds(false, false);
  }
}

void conectarMqtt() {
  while (!clienteMqtt.connected()) {
    mostrar("Conectando", "MQTT...");
    String id = "esp32-puerta-" + String(random(0xffff), HEX);
    if (clienteMqtt.connect(id.c_str(), MQTT_USUARIO, MQTT_CLAVE)) {
      Serial.println("Conectado a MQTT");
      clienteMqtt.subscribe(TOPIC_REGISTRO);
      clienteMqtt.subscribe(TOPIC_CONTROL);
      clienteMqtt.subscribe(TOPIC_LED);
      publicarLeds();
      mostrarEspera();
    } else {
      Serial.print("Fallo MQTT, codigo: ");
      Serial.println(clienteMqtt.state());
      delay(3000);
    }
  }
}

long medirDistancia() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long duracion = pulseIn(PIN_ECHO, HIGH, 30000);
  long distancia = duracion * 0.034 / 2;
  // el sensor no mide menos de 2 cm, si sale eso es un error
  if (duracion == 0 || distancia < 2) {
    return 999;
  }
  return distancia;
}

void revisarPir() {
  int pir = digitalRead(PIN_PIR);
  // el PIR solo saluda, la camara la prende el ultrasonico
  if (pir == HIGH && pirAnterior == LOW && asistenciaAbierta) {
    Serial.println("PIR: presencia detectada");
    mostrar("Hola!", "Acerquese");
  }
  if (pir == LOW && pirAnterior == HIGH) {
    mostrarEspera();
  }
  pirAnterior = pir;
}

void revisarTactil() {
  int tactil = digitalRead(PIN_TACTIL);
  if (tactil != tactilAnterior) {
    Serial.println("Tactil cambio a: " + String(tactil));
  }
  // el tactil publica en control y el esp32 tambien lo escucha
  // cuenta como toque cuando pasa de reposo a tocado, y no cuenta otro en 1 segundo (rebote)
  if (tactil != tactilReposo && tactilAnterior == tactilReposo && millis() - ultimoToque > 1000) {
    ultimoToque = millis();
    if (asistenciaAbierta) {
      clienteMqtt.publish(TOPIC_CONTROL, "CERRAR");
    } else {
      clienteMqtt.publish(TOPIC_CONTROL, "ABRIR");
    }
  }
  tactilAnterior = tactil;
}

void revisarUltrasonico() {
  if (millis() - ultimaMedicion < 100 || !asistenciaAbierta) {
    return;
  }
  ultimaMedicion = millis();
  long distancia = medirDistancia();

  if (distancia < DISTANCIA_PERSONA) {
    lecturasLejos = 0;
    // mientras haya alguien cerca se le avisa a la camara cada 3 segundos
    if (millis() - ultimoAvisoCamara > 3000) {
      ultimoAvisoCamara = millis();
      clienteMqtt.publish(TOPIC_PRESENCIA, "DETECTADO");
    }
    // se cuenta una sola vez cuando pasa de lejos a cerca
    if (!personaCerca) {
      personaCerca = true;
      contadorPersonas++;
      Serial.println("Ultrasonico: persona a " + String(distancia) + " cm, contadas: " + String(contadorPersonas));
      clienteMqtt.publish(TOPIC_CONTEO, String(contadorPersonas).c_str());
      mostrar("Hola!", "Mire la camara");
    }
  } else if (distancia > DISTANCIA_PERSONA + 10) {
    // tiene que salir lejos 5 veces seguidas, asi una lectura mala no cuenta otra vez a la misma persona
    lecturasLejos++;
    if (lecturasLejos >= 5) {
      personaCerca = false;
    }
  }
}

// muestra la hora grande en la pantalla OLED, los dos puntos titilan cada segundo
void mostrarHora() {
  if (!hayPantalla || millis() - ultimaHora < 1000) {
    return;
  }
  ultimaHora = millis();

  struct tm hora;
  if (!getLocalTime(&hora, 10)) {
    return;
  }
  // formato de 12 horas: las 17:30 se ven 5:30
  int horas = hora.tm_hour % 12;
  if (horas == 0) {
    horas = 12;
  }
  String manana = "a. m.";
  if (hora.tm_hour >= 12) {
    manana = "p. m.";
  }

  dosPuntos = !dosPuntos;
  String separador = " ";
  if (dosPuntos) {
    separador = ":";
  }
  String minutos = String(hora.tm_min);
  if (hora.tm_min < 10) {
    minutos = "0" + minutos;
  }
  String texto = String(horas) + separador + minutos;

  pantalla.clearDisplay();
  pantalla.setTextColor(SSD1306_WHITE);
  pantalla.setTextSize(1);
  pantalla.setCursor(28, 0);
  pantalla.print("AsistIA SENA");

  // cada letra de tamano 4 mide 24 pixeles, asi se centra
  pantalla.setTextSize(4);
  pantalla.setCursor((128 - texto.length() * 24) / 2, 18);
  pantalla.print(texto);

  pantalla.setTextSize(1);
  pantalla.setCursor(50, 56);
  pantalla.print(manana);
  pantalla.display();
}

// busca la OLED probando los cables en los dos ordenes y las dos direcciones
bool buscarOled() {
  int pinesSda[2] = {PIN_OLED_SDA, PIN_OLED_SCL};
  int pinesScl[2] = {PIN_OLED_SCL, PIN_OLED_SDA};
  byte direcciones[2] = {0x3C, 0x3D};

  for (int i = 0; i < 2; i++) {
    busOled.end();
    busOled.begin(pinesSda[i], pinesScl[i]);
    for (int j = 0; j < 2; j++) {
      busOled.beginTransmission(direcciones[j]);
      if (busOled.endTransmission() == 0) {
        Serial.printf("OLED encontrada: SDA G%d, SCL G%d, direccion 0x%02X\n", pinesSda[i], pinesScl[i], direcciones[j]);
        // false para que la libreria no vuelva a iniciar el bus con otros pines
        return pantalla.begin(SSD1306_SWITCHCAPVCC, direcciones[j], true, false);
      }
    }
  }
  Serial.println("No se encontro la pantalla OLED, revisar cables y VCC");
  return false;
}

void setup() {
  Serial.begin(115200);
  // pulldown para que no de falsas alarmas
  pinMode(PIN_PIR, INPUT_PULLDOWN);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT_PULLDOWN);
  pinMode(PIN_TACTIL, INPUT_PULLDOWN);
  // algunos tactiles vienen al reves, por eso se lee como estan al arrancar
  delay(100);
  tactilReposo = digitalRead(PIN_TACTIL);
  tactilAnterior = tactilReposo;
  Serial.println("Tactil en reposo: " + String(tactilReposo));
  apagarRele();
  pinMode(PIN_LED_VERDE, OUTPUT);
  pinMode(PIN_LED_ROJO, OUTPUT);

  lcd.init();
  lcd.backlight();

  if (buscarOled()) {
    hayPantalla = true;
    pantalla.clearDisplay();
    pantalla.setTextColor(SSD1306_WHITE);
    pantalla.setTextSize(1);
    pantalla.setCursor(10, 28);
    pantalla.print("Conectando WiFi...");
    pantalla.display();
  }

  conectarWifi();
  sincronizarHora();

  // el servo se prende despues del wifi para que no pidan corriente al mismo tiempo
  talanquera.setPeriodHertz(50);
  talanquera.attach(PIN_SERVO, 500, 2400);
  talanquera.write(SERVO_CERRADO);

  clienteWifi.setCACert(CERTIFICADO_CA);
  clienteMqtt.setServer(MQTT_HOST, MQTT_PUERTO);
  clienteMqtt.setCallback(alRecibirMensaje);
  conectarMqtt();
}

void loop() {
  if (!clienteMqtt.connected()) {
    conectarMqtt();
  }
  clienteMqtt.loop();

  revisarPir();
  revisarTactil();
  revisarUltrasonico();
  mostrarHora();
}
