// lista de diapositivas y la que se esta mostrando
const diapositivas = document.querySelectorAll(".diapositiva");
let actual = 0;

// musica de entrada: suena al pasar de la pantalla de espera a la portada
const musica = document.getElementById("musica-intro");

// cambia el volumen poco a poco hasta llegar al volumen que se pide
function cambiarVolumen(destino, paso) {
  const intervalo = setInterval(function () {
    if (musica.volume < destino - paso) {
      musica.volume = musica.volume + paso;
    } else if (musica.volume > destino + paso) {
      musica.volume = musica.volume - paso;
    } else {
      musica.volume = destino;
      clearInterval(intervalo);
      if (destino === 0) {
        musica.pause();
      }
    }
  }, 50);
}

// apaga la musica multiplicando el volumen por 0.93 cada vez:
// al final baja cada vez mas despacito, y asi se pierde sin notarse
function apagarSuave() {
  const intervalo = setInterval(function () {
    if (musica.volume > 0.005) {
      musica.volume = musica.volume * 0.93;
    } else {
      musica.volume = 0;
      musica.pause();
      clearInterval(intervalo);
    }
  }, 50);
}

function empezarMusica() {
  musica.currentTime = 0;
  musica.volume = 0;
  // si el navegador no deja sonar el audio, la presentacion sigue normal
  musica.play().catch(function () {});
  // entra subiendo suave
  cambiarVolumen(1, 0.1);
  // a los 2.5 segundos se empieza a apagar suave, y en unos 3.5 segundos mas ya no suena
  setTimeout(apagarSuave, 2500);
}

function mostrar(numero) {
  if (numero < 0 || numero >= diapositivas.length) {
    return;
  }
  const anterior = actual;
  diapositivas[actual].classList.remove("activa");
  actual = numero;
  diapositivas[actual].classList.add("activa");

  // la musica entra junto con la portada: el primer golpe suena con el neon
  // y el segundo con el aviso de rostro detectado (3.4 s)
  if (anterior === 0 && actual === 1) {
    empezarMusica();
  }
}

// flechas, espacio y teclas del control para pasar; F para pantalla completa
document.addEventListener("keydown", function (evento) {
  const tecla = evento.key;

  if (tecla === "ArrowRight" || tecla === " " || tecla === "PageDown") {
    mostrar(actual + 1);
  }
  if (tecla === "ArrowLeft" || tecla === "PageUp") {
    mostrar(actual - 1);
  }
  if (tecla === "f" || tecla === "F") {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }
});

// con un clic tambien se pasa a la siguiente
document.addEventListener("click", function () {
  mostrar(actual + 1);
});
