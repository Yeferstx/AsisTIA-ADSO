// el login usa el mismo tema que se eligio en el panel
let tema = null;
try {
  tema = localStorage.getItem('tema');
} catch (error) {
  console.log('No se pudo leer el tema');
}
if (tema == 'oscuro' || (!tema && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.body.classList.add('oscuro');
}

function cambiarTema() {
  const oscuro = document.body.classList.toggle('oscuro');
  let elegido = 'claro';
  if (oscuro) {
    elegido = 'oscuro';
  }
  try {
    localStorage.setItem('tema', elegido);
  } catch (error) {
    console.log('No se pudo guardar el tema');
  }
}

function verClave() {
  const campo = document.getElementById('clave');
  const icono = document.getElementById('iconoVerClave');
  if (campo.type == 'password') {
    campo.type = 'text';
    icono.className = 'ph-duotone ph-eye-slash';
  } else {
    campo.type = 'password';
    icono.className = 'ph-duotone ph-eye';
  }
}

async function iniciarSesion(evento) {
  evento.preventDefault();
  const boton = document.getElementById('botonEntrar');
  const error = document.getElementById('errorLogin');
  const caja = document.getElementById('formLogin');

  boton.disabled = true;
  boton.classList.add('cargando-boton');
  error.textContent = '';

  try {
    const respuesta = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario: document.getElementById('usuario').value.trim(),
        clave: document.getElementById('clave').value,
      }),
    });
    const datos = await respuesta.json();
    if (respuesta.ok) {
      caja.classList.add('login-exito');
      setTimeout(() => {
        window.location.href = '/';
      }, 450);
      return;
    }
    error.textContent = datos.mensaje;
  } catch (e) {
    error.textContent = 'No me pude conectar con el servidor';
  }

  // si algo sale mal la caja se sacude
  caja.classList.add('sacudir');
  setTimeout(() => caja.classList.remove('sacudir'), 450);
  boton.disabled = false;
  boton.classList.remove('cargando-boton');
  document.getElementById('clave').select();
}
