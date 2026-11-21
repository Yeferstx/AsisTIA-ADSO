// programa aparte para probar el rele (se sube con: pio run -e rele -t upload)
// prueba dos formas de manejarlo, 10 segundos cada una, para ver con cual suena
#include <Arduino.h>
#include <LiquidCrystal_I2C.h>

#define PIN_RELE 13

LiquidCrystal_I2C lcd(0x27, 16, 2);

void escribir(String linea1, String linea2) {
  while (linea1.length() < 16) linea1 += " ";
  while (linea2.length() < 16) linea2 += " ";
  lcd.setCursor(0, 0);
  lcd.print(linea1);
  lcd.setCursor(0, 1);
  lcd.print(linea2);
  Serial.println(linea1 + " | " + linea2);
}

void setup() {
  Serial.begin(115200);
  lcd.init();
  lcd.backlight();
  escribir("PRUEBA DEL RELE", "en G13");
  delay(1500);
}

void loop() {
  // modo 1: HIGH prende y LOW apaga (rele normal)
  for (int i = 0; i < 5; i++) {
    pinMode(PIN_RELE, OUTPUT);
    digitalWrite(PIN_RELE, HIGH);
    escribir("MODO 1", "HIGH = prendido");
    delay(1000);
    digitalWrite(PIN_RELE, LOW);
    escribir("MODO 1", "LOW = apagado");
    delay(1000);
  }

  // modo 2: LOW prende y se suelta el pin para apagar (rele que funciona al reves)
  for (int i = 0; i < 5; i++) {
    pinMode(PIN_RELE, OUTPUT);
    digitalWrite(PIN_RELE, LOW);
    escribir("MODO 2", "LOW = prendido");
    delay(1000);
    pinMode(PIN_RELE, INPUT);
    escribir("MODO 2", "suelto = apagado");
    delay(1000);
  }
}
