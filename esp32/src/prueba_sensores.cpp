// programa aparte para probar los sensores y calibrar los tornillos (sin wifi ni mqtt)
// se sube con: pio run -e prueba -t upload
#include <Arduino.h>
#include <LiquidCrystal_I2C.h>

#define PIN_PIR 19
#define PIN_TRIG 25
#define PIN_ECHO 14
#define PIN_TACTIL 4
#define PIN_LED_VERDE 26
#define PIN_LED_ROJO 27
#define DISTANCIA_PERSONA 40  // cm, igual que en el programa principal

LiquidCrystal_I2C lcd(0x27, 16, 2);

long medirDistancia() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long duracion = pulseIn(PIN_ECHO, HIGH, 30000);
  if (duracion == 0) {
    return -1;  // no hubo eco
  }
  return duracion * 0.034 / 2;
}

// escribe una linea completa de la lcd sin borrar toda la pantalla (para que no parpadee)
void escribirLinea(int fila, String texto) {
  while (texto.length() < 16) {
    texto += " ";
  }
  lcd.setCursor(0, fila);
  lcd.print(texto.substring(0, 16));
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_PIR, INPUT_PULLDOWN);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT_PULLDOWN);
  pinMode(PIN_TACTIL, INPUT_PULLDOWN);
  pinMode(PIN_LED_VERDE, OUTPUT);
  pinMode(PIN_LED_ROJO, OUTPUT);

  lcd.init();
  lcd.backlight();
  escribirLinea(0, "PRUEBA SENSORES");
  escribirLinea(1, "Ajusta tornillos");
  Serial.println("Prueba de sensores. El PIR necesita 1 minuto para calibrarse.");
  delay(2000);
}

void loop() {
  int pir = digitalRead(PIN_PIR);
  int tactil = digitalRead(PIN_TACTIL);
  long distancia = medirDistancia();

  String lineaPir = "PIR:";
  if (pir == HIGH) {
    lineaPir += "SI ";
  } else {
    lineaPir += "NO ";
  }
  lineaPir += " Tact:" + String(tactil);

  String lineaDistancia = "Dist:";
  if (distancia == -1) {
    lineaDistancia += " sin eco";
  } else {
    lineaDistancia += String(distancia) + "cm";
    if (distancia < DISTANCIA_PERSONA) {
      lineaDistancia += " CERCA";
    }
  }

  escribirLinea(0, lineaPir);
  escribirLinea(1, lineaDistancia);

  // verde = el PIR detecta, rojo = algo cerca del ultrasonico
  digitalWrite(PIN_LED_VERDE, pir);
  digitalWrite(PIN_LED_ROJO, distancia != -1 && distancia < DISTANCIA_PERSONA);

  Serial.println(lineaPir + " | " + lineaDistancia);
  delay(200);
}
