let nombresAnteriores = [];
let primeraVez = true;
let horarioCargado = false;
let ultimoEstado = null;

function mostrarPestana(nombre) {
  for (const boton of document.querySelectorAll('.pestana')) {
    boton.classList.toggle('activa', boton.dataset.pestana == nombre);
  }
  for (const contenido of document.querySelectorAll('.contenido-pestana')) {
    contenido.classList.toggle('oculta', contenido.id != 'pestana-' + nombre);
  }
  if (nombre == 'historial') cargarHistorial();
  if (nombre == 'aprendices') cargarAprendices();
  if (nombre == 'aseo') cargarAseo();
}

// bloques grises que se ven mientras llegan los datos
function esqueletoLlegadas(cantidad) {
  let html = '';
  for (let i = 0; i < cantidad; i++) {
    html += `
      <div class="llegada llegada-esqueleto">
        <span class="esqueleto esqueleto-circulo"></span>
        <div class="datos">
          <span class="esqueleto esqueleto-nombre"></span>
          <span class="esqueleto esqueleto-corto"></span>
        </div>
      </div>`;
  }
  return html;
}

function esqueletoFilas(columnas, filas) {
  let html = '';
  for (let i = 0; i < filas; i++) {
    html += '<tr>';
    for (let j = 0; j < columnas; j++) {
      html += '<td><span class="esqueleto"></span></td>';
    }
    html += '</tr>';
  }
  return html;
}

function esqueletoTarjetas(cantidad) {
  let html = '';
  for (let i = 0; i < cantidad; i++) {
    html += `
      <div class="excusa tarjeta-esqueleto">
        <span class="esqueleto esqueleto-nombre"></span>
        <span class="esqueleto"></span>
        <span class="esqueleto esqueleto-corto"></span>
      </div>`;
  }
  return html;
}

function ponerEsqueletosIniciales() {
  document.getElementById('listaLlegadas').innerHTML = esqueletoLlegadas(3);
  document.getElementById('sorteo').innerHTML = esqueletoTarjetas(1);
  document.getElementById('listaPermisos').innerHTML = esqueletoTarjetas(2);
  document.getElementById('listaExcusas').innerHTML = esqueletoTarjetas(2);
}

// los elementos de la lista aparecen uno por uno
function animarEntrada(contenedor) {
  const hijos = contenedor.children;
  for (let i = 0; i < hijos.length; i++) {
    hijos[i].style.animationDelay = i * 60 + 'ms';
    hijos[i].classList.add('aparece');
  }
}

async function actualizar() {
  try {
    const respuesta = await fetch('/api/estado');
    // si se cerro la sesion se manda al login
    if (respuesta.status == 401) {
      window.location.href = '/login.html';
      return;
    }
    const datos = await respuesta.json();
    ultimoEstado = datos;
    mostrarDatos(datos);
    document.body.classList.remove('cargando');
    document.getElementById('enVivo').className = 'en-vivo conectado';
    document.getElementById('textoConexion').textContent = 'En vivo';
    mostrarEquipo('equipoCamara', datos.equipos.camara);
    mostrarEquipo('equipoMaqueta', datos.equipos.maqueta);
  } catch (error) {
    document.getElementById('enVivo').className = 'en-vivo sin-conexion';
    document.getElementById('textoConexion').textContent = 'Sin conexion';
  }
}

// punto verde si el equipo esta conectado y rojo si no
function mostrarEquipo(id, estado) {
  if (estado == 'CONECTADA') {
    document.getElementById(id).className = 'en-vivo conectado';
  } else {
    document.getElementById(id).className = 'en-vivo sin-conexion';
  }
}

function mostrarDatos(datos) {
  // en computador se ve "Hoy 2026-11-20" y en celular "Viernes 20 de noviembre"
  document.getElementById('fecha').innerHTML =
    `<span class="solo-pc">Hoy ${datos.fecha}</span><span class="solo-movil">${fechaLegible(datos.fecha)}</span>`;

  const etiqueta = document.getElementById('estadoAsistencia');
  const botonCerrar = document.getElementById('botonCerrar');
  if (datos.cerrada) {
    etiqueta.textContent = 'Asistencia cerrada';
    etiqueta.className = 'etiqueta cerrada';
    botonCerrar.disabled = true;
  } else {
    etiqueta.textContent = 'Asistencia abierta';
    etiqueta.className = 'etiqueta abierta';
    botonCerrar.disabled = false;
  }

  const horario = datos.horario;
  document.getElementById('textoHorario').innerHTML =
    `<span>Abre ${horaNormal(horario.apertura)}</span><span>Tarde despues de las ${horaNormal(horario.inicio)}</span>` +
    `<span>Salida ${horaNormal(horario.salida)}</span><span>Cierre ${horaNormal(horario.cierre)}</span>`;
  // se llenan una sola vez para no borrar lo que el instructor esta escribiendo
  if (!horarioCargado) {
    document.getElementById('horaApertura').value = horario.apertura;
    document.getElementById('horaInicio').value = horario.inicio;
    document.getElementById('horaSalida').value = horario.salida;
    document.getElementById('horaCierre').value = horario.cierre;
    horarioCargado = true;
  }

  animarNumero('totalATiempo', datos.aTiempo);
  animarNumero('totalTarde', datos.tardes);
  animarNumero('totalAusentes', datos.ausentes.length);

  mostrarLlegadas(datos.llegadas);

  if (datos.ausentes.length > 0) {
    let html = '';
    for (const nombre of datos.ausentes) {
      html += `<span class="pendiente">${limpiar(nombre)}</span>`;
    }
    document.getElementById('listaAusentes').innerHTML = html;
  } else {
    document.getElementById('listaAusentes').textContent = 'nadie';
  }

  mostrarSorteo(datos.sorteo);
  mostrarExcusas(datos.excusas);
  mostrarPermisos(datos.permisos);
}

// el numero va contando hasta el valor nuevo y da un saltito
function animarNumero(id, valorNuevo) {
  const elemento = document.getElementById(id);
  let valor = Number(elemento.textContent);
  if (valor == valorNuevo) {
    return;
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    elemento.textContent = valorNuevo;
    return;
  }

  const dato = elemento.closest('.dato');
  elemento.classList.add('saltito');
  dato.classList.add('cambio');
  setTimeout(() => {
    elemento.classList.remove('saltito');
    dato.classList.remove('cambio');
  }, 2000);

  clearInterval(elemento.contador);
  elemento.contador = setInterval(() => {
    if (valor < valorNuevo) {
      valor++;
    } else {
      valor--;
    }
    elemento.textContent = valor;
    if (valor == valorNuevo) {
      clearInterval(elemento.contador);
    }
  }, 60);
}

// "18:00" queda "6:00 p. m."
function horaNormal(hora) {
  if (!hora) {
    return '';
  }
  const partes = hora.split(':');
  let numero = Number(partes[0]);
  let sufijo = 'a. m.';
  if (numero >= 12) {
    sufijo = 'p. m.';
  }
  numero = numero % 12;
  if (numero == 0) {
    numero = 12;
  }
  return `${numero}:${partes[1]} ${sufijo}`;
}

// "2026-11-20" queda "Viernes 20 de noviembre"
function fechaLegible(fecha) {
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const dia = new Date(fecha + 'T00:00:00');
  return `${dias[dia.getDay()]} ${dia.getDate()} de ${meses[dia.getMonth()]}`;
}

// para que lo que escriba el aprendiz no se meta como html
function limpiar(texto) {
  return String(texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mostrarPermisos(permisos) {
  document.getElementById('totalPermisos').textContent = permisos.length;
  const lista = document.getElementById('listaPermisos');

  // si no cambio nada no se vuelve a dibujar
  const ids = permisos.map((permiso) => permiso.id).join(',');
  if (lista.dataset.ids == ids && ids != '') {
    return;
  }
  lista.dataset.ids = ids;

  if (permisos.length == 0) {
    lista.innerHTML = '<p class="vacio">No hay permisos por revisar</p>';
    return;
  }

  let html = '';
  for (const permiso of permisos) {
    let claseSugerencia = 'sugerencia';
    if (permiso.sugerencia == 'ACEPTAR') {
      claseSugerencia = 'sugerencia valida';
    } else if (permiso.sugerencia == 'RECHAZAR') {
      claseSugerencia = 'sugerencia no-valida';
    }

    html += `
      <div class="excusa">
        <div class="excusa-cabecera">
          <b>${limpiar(permiso.nombre)}</b>
          <span class="hora-salida">Sale a las ${limpiar(horaNormal(permiso.horaSalida))}</span>
        </div>
        <p class="texto-excusa">"${limpiar(permiso.motivo)}"</p>
        <div class="caja-ia">
          <p class="titulo-ia"><i class="ph-duotone ph-sparkle"></i> AsistIA aconseja</p>
          <p>${limpiar(permiso.motivoCompleto)}</p>
          <p><b>Aconseja:</b> <span class="${claseSugerencia}">${limpiar(permiso.sugerencia)}</span></p>
          <p>${limpiar(permiso.razon)}</p>
        </div>
        <div class="decision">
          <button class="boton-aceptar" onclick="decidirPermiso(${permiso.id}, 'ACEPTADO')">Aceptar</button>
          <button class="boton-rechazar" onclick="decidirPermiso(${permiso.id}, 'RECHAZADO')">Rechazar</button>
        </div>
      </div>`;
  }
  lista.innerHTML = html;
}

async function decidirPermiso(id, decision) {
  const respuesta = await enviarPost('/api/permiso', { id: id, decision: decision });
  mostrarMensaje(respuesta.mensaje);
  actualizar();
}

function mostrarExcusas(excusas) {
  document.getElementById('totalExcusas').textContent = excusas.length;
  const lista = document.getElementById('listaExcusas');

  // si no cambio nada no se vuelve a dibujar
  const ids = excusas.map((excusa) => excusa.id + (excusa.resumen || '')).join(',');
  if (lista.dataset.ids == ids && ids != '') {
    return;
  }
  lista.dataset.ids = ids;

  if (excusas.length == 0) {
    lista.innerHTML = '<p class="vacio">No hay excusas por revisar</p>';
    return;
  }

  let html = '';
  for (const excusa of excusas) {
    let claseSugerencia = 'sugerencia';
    if (excusa.sugerencia == 'VALIDA') {
      claseSugerencia = 'sugerencia valida';
    } else if (excusa.sugerencia == 'NO VALIDA') {
      claseSugerencia = 'sugerencia no-valida';
    }

    let cajaIa = '<p>Analizando con IA...</p>';
    if (excusa.resumen) {
      cajaIa = `
        <p><b>Resumen:</b> ${limpiar(excusa.resumen)}</p>
        <p><b>Aconseja:</b> <span class="${claseSugerencia}">${limpiar(excusa.sugerencia)}</span></p>
        <p>${limpiar(excusa.razon)}</p>`;
    }

    html += `
      <div class="excusa">
        <div class="excusa-cabecera">
          <b>${limpiar(excusa.nombre)}</b>
          <small>Falto el ${excusa.fecha}</small>
        </div>
        <p class="texto-excusa">"${limpiar(excusa.texto)}"</p>
        <div class="caja-ia">
          <p class="titulo-ia"><i class="ph-duotone ph-sparkle"></i> AsistIA aconseja</p>
          ${cajaIa}
        </div>
        <div class="decision">
          <button class="boton-aceptar" onclick="decidirExcusa(${excusa.id}, 'ACEPTADA')">Aceptar</button>
          <button class="boton-rechazar" onclick="decidirExcusa(${excusa.id}, 'RECHAZADA')">Rechazar</button>
        </div>
      </div>`;
  }
  lista.innerHTML = html;
}

async function decidirExcusa(id, decision) {
  const respuesta = await enviarPost('/api/excusa', { id: id, decision: decision });
  mostrarMensaje(respuesta.mensaje);
  actualizar();
}

function mostrarLlegadas(llegadas) {
  let html = '';
  for (const llegada of llegadas) {
    let clase = 'llegada llegada-a-tiempo';
    let texto = 'A tiempo';
    if (llegada.estado == 'TARDE') {
      clase = 'llegada llegada-tarde';
      texto = 'Tarde';
    }

    // si es alguien que acaba de llegar se anima y sale el aviso
    if (!nombresAnteriores.includes(llegada.nombre) && !primeraVez) {
      clase += ' nueva';
      mostrarMensaje('Llego ' + llegada.nombre + ' - ' + texto);
    }

    html += `
      <div class="${clase}">
        <div class="inicial">${limpiar(llegada.nombre[0])}</div>
        <div class="datos">
          <b>${limpiar(llegada.nombre)}</b>
          <small>Llego a las ${limpiar(horaNormal(llegada.hora))}</small>
        </div>
        <span class="insignia">${texto}</span>
      </div>`;
  }

  if (html == '') {
    html = '<p class="vacio sin-llegadas"><i class="ph-duotone ph-hourglass-medium"></i><span class="solo-pc">Todavia no ha llegado nadie</span>' +
      '<span class="solo-movil">Aun no se registran llegadas</span></p>';
  }
  document.getElementById('listaLlegadas').innerHTML = html;
  if (primeraVez) {
    animarEntrada(document.getElementById('listaLlegadas'));
  }

  nombresAnteriores = llegadas.map((llegada) => llegada.nombre);
  primeraVez = false;
}

function mostrarSorteo(sorteo) {
  const caja = document.getElementById('sorteo');
  if (!sorteo) {
    caja.className = 'sorteo-vacio';
    caja.textContent = 'El sorteo se hace al cerrar la asistencia.';
    return;
  }
  if (sorteo.asignados.length == 0) {
    caja.className = 'sorteo-vacio';
    caja.textContent = 'Todos llegaron a tiempo, no hay aseo.';
    return;
  }

  // para no repetir la animacion cada 2 segundos
  if (caja.dataset.sorteo == sorteo.fecha) {
    return;
  }
  caja.className = '';
  caja.dataset.sorteo = sorteo.fecha;
  let html = `<p class="dia-aseo">Aseo para el ${sorteo.fecha}</p>`;
  for (const asignado of sorteo.asignados) {
    html += `<div class="tarea"><b>${limpiar(asignado.nombre)}</b><span>${asignado.tarea}</span></div>`;
  }
  caja.innerHTML = html;
}

async function guardarHorario(evento) {
  evento.preventDefault();
  const respuesta = await enviarPost('/api/horario', {
    apertura: document.getElementById('horaApertura').value,
    inicio: document.getElementById('horaInicio').value,
    salida: document.getElementById('horaSalida').value,
    cierre: document.getElementById('horaCierre').value,
  });
  mostrarMensaje(respuesta.mensaje);
  actualizar();
}

// "miguel perez" queda "Miguel Perez"
function nombreBonito(nombre) {
  const palabras = nombre.split(' ');
  for (let i = 0; i < palabras.length; i++) {
    palabras[i] = palabras[i].charAt(0).toUpperCase() + palabras[i].slice(1);
  }
  return palabras.join(' ');
}

// ["ana", "luis", "juan"] queda "Ana, Luis y Juan"
function unirNombres(nombres) {
  let texto = '';
  for (let i = 0; i < nombres.length; i++) {
    if (i > 0 && i == nombres.length - 1) {
      texto += ' y ';
    } else if (i > 0) {
      texto += ', ';
    }
    texto += nombreBonito(nombres[i]);
  }
  return texto;
}

// lo que va a pasar al cerrar la asistencia, con los datos de hoy
async function puntosDelCierre() {
  const puntos = [];
  if (!ultimoEstado) {
    return puntos;
  }
  const ausentes = ultimoEstado.ausentes;
  const tardes = ultimoEstado.tardes;

  // el bot solo le puede escribir a los que le dieron /start
  let conTelegram = ausentes;
  try {
    const datos = await (await fetch('/api/aprendices')).json();
    const registrados = datos.aprendices.filter((a) => a.telegram).map((a) => a.nombre);
    conTelegram = ausentes.filter((nombre) => registrados.includes(nombre));
  } catch (error) {
    console.log('No se pudo revisar quien tiene Telegram');
  }
  const sinTelegram = ausentes.filter((nombre) => !conTelegram.includes(nombre));

  if (ausentes.length == 0) {
    puntos.push(['ph-check-circle', 'No hay ausentes, no se le escribe a nadie']);
  } else if (conTelegram.length == 1) {
    puntos.push(['ph-telegram-logo', `Se le escribe por Telegram a ${unirNombres(conTelegram)} para que mande su excusa`]);
  } else if (conTelegram.length > 1) {
    puntos.push(['ph-telegram-logo', `Se les escribe por Telegram a los ${conTelegram.length} ausentes: ${unirNombres(conTelegram)}`]);
  }
  if (sinTelegram.length == 1) {
    puntos.push(['ph-warning-circle', `${unirNombres(sinTelegram)} no ha dado /start al bot, no le llega el mensaje`]);
  } else if (sinTelegram.length > 1) {
    puntos.push(['ph-warning-circle', `${unirNombres(sinTelegram)} no han dado /start al bot, no les llega el mensaje`]);
  }

  puntos.push(['ph-microsoft-excel-logo', 'Te llega el resumen con el Excel']);

  // aseo: los 3 que llegaron mas tarde, si no alcanzan se completa con ausentes
  if (tardes + ausentes.length == 0) {
    puntos.push(['ph-broom', 'Todos llegaron a tiempo: se avisa en el grupo que no hay aseo']);
  } else if (tardes >= 3) {
    puntos.push(['ph-broom', 'Hacen aseo los 3 que llegaron mas tarde y se publica en el grupo']);
  } else {
    const completar = Math.min(3 - tardes, ausentes.length);
    let texto = 'Hacen aseo ';
    if (tardes == 0) {
      texto = 'Nadie llego tarde: hacen aseo ';
    } else if (tardes == 1) {
      texto += 'el que llego tarde';
    } else {
      texto += 'los ' + tardes + ' que llegaron tarde';
    }
    if (tardes > 0 && completar > 0) {
      texto += ' y ';
    }
    if (completar == 1) {
      texto += '1 ausente al azar';
    } else if (completar > 1) {
      texto += completar + ' ausentes al azar';
    }
    puntos.push(['ph-broom', texto]);
  }
  return puntos;
}

async function cerrarAsistencia() {
  const puntos = await puntosDelCierre();
  preguntar('Cerrar la asistencia de hoy?', 'Esto no se puede deshacer. Al cerrar:', puntos, 'Si, cerrar asistencia', confirmarCierre);
}

async function confirmarCierre() {
  mostrarMensaje('Cerrando la asistencia...');
  const respuesta = await enviarPost('/api/cerrar', {});
  mostrarMensaje(respuesta.mensaje);
  actualizar();
}

async function cargarHistorial() {
  document.getElementById('tablaHistorial').innerHTML = esqueletoFilas(5, 4);
  const dias = await (await fetch('/api/historial')).json();
  let html = '';
  for (const dia of dias) {
    let abierta = '';
    if (!dia.cerrada) {
      abierta = ' <small class="abierta-texto">(abierta)</small>';
    }
    html += `
      <tr>
        <td>${dia.fecha}${abierta}</td>
        <td class="numero verde">${dia.aTiempo}</td>
        <td class="numero rojo">${dia.tardes}</td>
        <td class="numero">${dia.ausentes}</td>
        <td class="botones-tabla">
          <button onclick="verDia('${dia.fecha}')"><i class="ph-duotone ph-eye"></i> Ver</button>
          <button onclick="descargarExcel('${dia.fecha}')"><i class="ph-duotone ph-microsoft-excel-logo"></i> Excel</button>
        </td>
      </tr>`;
  }
  if (html == '') {
    html = '<tr><td colspan="5" class="vacio">Todavia no hay dias registrados</td></tr>';
  }
  document.getElementById('tablaHistorial').innerHTML = html;
  animarEntrada(document.getElementById('tablaHistorial'));
}

async function verDia(fecha) {
  const caja = document.getElementById('detalleDia');
  caja.className = 'lista-llegadas';
  caja.innerHTML = esqueletoLlegadas(3);
  const dia = await (await fetch('/api/dia?fecha=' + fecha)).json();
  document.getElementById('tituloDia').textContent = 'Detalle del ' + fecha;
  let html = '';
  for (const registro of dia.registros) {
    let clase = 'llegada llegada-ausente';
    let texto = 'Ausente';
    let detalle = registro.excusa || '';
    if (registro.estado == 'A_TIEMPO') {
      clase = 'llegada llegada-a-tiempo';
      texto = 'A tiempo';
      detalle = 'Llego a las ' + horaNormal(registro.hora);
    } else if (registro.estado == 'TARDE') {
      clase = 'llegada llegada-tarde';
      texto = 'Tarde';
      detalle = 'Llego a las ' + horaNormal(registro.hora);
    }
    html += `
      <div class="${clase}">
        <div class="inicial">${limpiar(registro.nombre[0])}</div>
        <div class="datos">
          <b>${limpiar(registro.nombre)}</b>
          <small>${limpiar(detalle)}</small>
        </div>
        <span class="insignia">${texto}</span>
      </div>`;
  }
  if (html == '') {
    html = '<p class="vacio">No hay registros ese dia</p>';
  }
  caja.innerHTML = html;
  animarEntrada(caja);
}

async function cargarAprendices() {
  document.getElementById('tablaAprendices').innerHTML = esqueletoFilas(7, 3);
  const datos = await (await fetch('/api/aprendices')).json();
  document.getElementById('textoDiasClase').textContent =
    `Se cuentan los ${datos.diasDeClase} dias de clase que ya se cerraron.`;

  let html = '';
  for (const aprendiz of datos.aprendices) {
    let seguidas = aprendiz.fallasSeguidas;
    if (aprendiz.fallasSeguidas >= 3) {
      seguidas = `<span class="riesgo"><i class="ph-duotone ph-warning"></i> ${aprendiz.fallasSeguidas} - Riesgo</span>`;
    }
    let telegram = '<span class="si"><i class="ph-duotone ph-check-circle"></i> Si</span>';
    if (!aprendiz.telegram) {
      telegram = '<span class="no"><i class="ph-duotone ph-warning-circle"></i> No ha dado /start</span>';
    }
    html += `
      <tr>
        <td class="nombre-tabla">${limpiar(aprendiz.nombre)}</td>
        <td class="numero verde">${aprendiz.asistencias}</td>
        <td class="numero rojo">${aprendiz.tardes}</td>
        <td class="numero">${aprendiz.fallas}</td>
        <td class="numero">${seguidas}</td>
        <td class="numero">${aprendiz.excusasAceptadas}</td>
        <td>${telegram}</td>
      </tr>`;
  }
  document.getElementById('tablaAprendices').innerHTML = html;
  animarEntrada(document.getElementById('tablaAprendices'));
}

async function cargarAseo() {
  document.getElementById('calendarioAseo').innerHTML = esqueletoTarjetas(3);
  const dias = await (await fetch('/api/aseo')).json();
  let hoy = '';
  if (ultimoEstado) {
    hoy = ultimoEstado.fecha;
  }
  let html = '';
  for (const dia of dias) {
    let clase = 'dia-calendario';
    let etiqueta = '';
    if (dia.fecha == hoy) {
      clase += ' dia-hoy';
      etiqueta = '<span class="etiqueta abierta">Hoy</span>';
    } else if (dia.fecha > hoy) {
      clase += ' dia-proximo';
      etiqueta = '<span class="etiqueta proximo">Proximo</span>';
    }
    let tareas = '';
    for (const asignado of dia.asignados) {
      tareas += `<div class="tarea"><b>${limpiar(asignado.nombre)}</b><span>${asignado.tarea}</span></div>`;
    }
    if (tareas == '') {
      tareas = '<p class="vacio">Todos llegaron a tiempo, no hubo aseo</p>';
    }
    html += `
      <div class="${clase}">
        <div class="excusa-cabecera"><b>${dia.fecha}</b>${etiqueta}</div>
        ${tareas}
      </div>`;
  }
  if (html == '') {
    html = '<p class="vacio">Todavia no hay sorteos</p>';
  }
  document.getElementById('calendarioAseo').innerHTML = html;
  animarEntrada(document.getElementById('calendarioAseo'));
}

function esCelular() {
  return window.innerWidth <= 767;
}

function abrirChat() {
  const panel = document.getElementById('panelChat');
  panel.classList.toggle('oculta');
  const abierto = !panel.classList.contains('oculta');
  document.getElementById('botonChat').classList.toggle('abierto', abierto);

  // en el celular la pagina de atras no se mueve mientras el chat esta abierto
  if (esCelular()) {
    if (abierto) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    ajustarChatAlTeclado();
  }
  if (abierto) {
    document.getElementById('pregunta').focus();
  }
}

// en el celular el chat se achica para que el teclado no lo tape
// (visualViewport es la parte de la pantalla que se ve sin el teclado)
function ajustarChatAlTeclado() {
  const panel = document.getElementById('panelChat');
  if (!esCelular() || !window.visualViewport) {
    panel.style.top = '';
    panel.style.height = '';
    return;
  }
  panel.style.top = window.visualViewport.offsetTop + 12 + 'px';
  panel.style.height = window.visualViewport.height - 24 + 'px';
  const mensajes = document.getElementById('mensajesChat');
  mensajes.scrollTop = mensajes.scrollHeight;
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', ajustarChatAlTeclado);
  window.visualViewport.addEventListener('scroll', ajustarChatAlTeclado);
}

function agregarMensaje(texto, clase) {
  const caja = document.getElementById('mensajesChat');
  const mensaje = document.createElement('div');
  mensaje.className = 'mensaje ' + clase;
  mensaje.textContent = texto;
  caja.appendChild(mensaje);
  caja.scrollTop = caja.scrollHeight;
  return mensaje;
}

async function enviarPregunta(evento) {
  evento.preventDefault();
  const campo = document.getElementById('pregunta');
  const pregunta = campo.value.trim();
  if (pregunta == '') {
    return;
  }
  campo.value = '';
  agregarMensaje(pregunta, 'mensaje-instructor');
  const pensando = agregarMensaje('Pensando...', 'mensaje-ia');
  try {
    const respuesta = await enviarPost('/api/preguntar', { pregunta: pregunta });
    pensando.textContent = respuesta.respuesta;
  } catch (error) {
    pensando.textContent = 'No me pude conectar con el servidor.';
  }
}

function preguntarSugerencia(boton) {
  document.getElementById('pregunta').value = boton.textContent;
  document.querySelector('.caja-pregunta').requestSubmit();
}

async function enviarPost(url, datos) {
  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
  return respuesta.json();
}

function mostrarMensaje(texto) {
  const aviso = document.getElementById('aviso');
  aviso.textContent = texto;
  aviso.classList.add('mostrar');
  setTimeout(() => aviso.classList.remove('mostrar'), 3500);
}

// ventana para confirmar, si el instructor dice que si se ejecuta alAceptar
// puntos es una lista de [icono, texto] con lo que va a pasar
function preguntar(titulo, texto, puntos, textoBoton, alAceptar) {
  document.getElementById('modalTitulo').textContent = titulo;
  document.getElementById('modalTexto').textContent = texto;
  document.getElementById('modalAceptar').textContent = textoBoton;
  let lista = '';
  for (const punto of puntos) {
    lista += `<li><i class="ph-duotone ${punto[0]}"></i><span>${limpiar(punto[1])}</span></li>`;
  }
  document.getElementById('modalLista').innerHTML = lista;

  document.getElementById('modalAceptar').onclick = () => {
    cerrarVentana();
    alAceptar();
  };
  document.getElementById('modalCancelar').onclick = cerrarVentana;

  document.getElementById('modal').classList.remove('oculta');
  document.body.style.overflow = 'hidden';
  // el boton cancelar queda seleccionado por si oprime Enter sin querer
  document.getElementById('modalCancelar').focus();
}

function cerrarVentana() {
  const modal = document.getElementById('modal');
  modal.classList.add('saliendo');
  setTimeout(() => {
    modal.classList.add('oculta');
    modal.classList.remove('saliendo');
    document.body.style.overflow = '';
  }, 200);
}

// la ventana tambien se cierra tocando afuera o con Escape
document.getElementById('modal').addEventListener('click', (evento) => {
  if (evento.target.id == 'modal') {
    cerrarVentana();
  }
});
document.addEventListener('keydown', (evento) => {
  const abierta = !document.getElementById('modal').classList.contains('oculta');
  if (evento.key == 'Escape' && abierta) {
    cerrarVentana();
  }
});

function cerrarSesion() {
  preguntar('Cerrar sesion?', 'Para volver a entrar necesitas tu usuario y clave.', [], 'Si, salir', salirDelPanel);
}

async function salirDelPanel() {
  await enviarPost('/api/salir', {});
  window.location.href = '/login.html';
}

// si no se pasa fecha se descarga el de hoy
function descargarExcel(fecha) {
  window.location.href = '/api/excel?fecha=' + fecha;
  mostrarMensaje('Descargando el Excel...');
}

function mostrarReloj() {
  const ahora = new Date();
  document.getElementById('reloj').textContent = ahora.toLocaleTimeString('es-CO');
}

// el sol y la luna los cambia el CSS, aca solo se cambia el texto de ayuda
function ponerIconoTema() {
  const boton = document.getElementById('botonTema');
  if (document.body.classList.contains('oscuro')) {
    boton.title = 'Cambiar a modo claro';
  } else {
    boton.title = 'Cambiar a modo oscuro';
  }
}

function cambiarTema() {
  const oscuro = document.body.classList.toggle('oscuro');
  let tema = 'claro';
  if (oscuro) {
    tema = 'oscuro';
  }
  try {
    localStorage.setItem('tema', tema);
  } catch (error) {
    console.log('No se pudo guardar el tema');
  }
  ponerIconoTema();
}

// si nunca eligio un tema se usa el del computador
function cargarTema() {
  let tema = null;
  try {
    tema = localStorage.getItem('tema');
  } catch (error) {
    console.log('No se pudo leer el tema');
  }
  if (tema == 'oscuro' || (!tema && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add('oscuro');
  }
  ponerIconoTema();
}

cargarTema();
ponerEsqueletosIniciales();
mostrarReloj();
setInterval(mostrarReloj, 1000);
actualizar();
setInterval(actualizar, 2000);
