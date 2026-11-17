import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { CARPETA_DATOS } from './archivos';

export const HORA_APERTURA = '12:00';
export const HORA_INICIO = '12:30';
export const HORA_CIERRE = '18:00';
export const HORA_RECORDATORIO_ASEO = '17:00';
export const HORA_SALIDA = '17:30';
export const DIAS_CLASE = [1, 2, 3, 4, 5]; // lunes a viernes

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const TAREAS = ['Trapero', 'Escoba', 'Trapito'];

export interface Registro {
  nombre: string;
  hora: string;
  estado: string; // A_TIEMPO, TARDE, AUSENTE
  excusa?: string;
  motivo?: string;
}

export interface Asignado {
  nombre: string;
  tarea: string;
}

function dosDigitos(numero: number) {
  return String(numero).padStart(2, '0');
}

// queda asi 2026-11-10
export function formatoFecha(fecha: Date) {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

export function fechaHoy() {
  return formatoFecha(new Date());
}

// queda asi miercoles 11 de noviembre
export function fechaEnTexto(fecha: Date) {
  return `${DIAS[fecha.getDay()]} ${fecha.getDate()} de ${MESES[fecha.getMonth()]}`;
}

export function siguienteDiaClase() {
  const fecha = new Date();
  do {
    fecha.setDate(fecha.getDate() + 1);
  } while (!DIAS_CLASE.includes(fecha.getDay()));
  return fecha;
}

// fecha del lunes de esta semana
export function inicioSemana() {
  const fecha = new Date();
  let dias = fecha.getDay() - 1;
  if (dias < 0) {
    dias = 6; // domingo
  }
  fecha.setDate(fecha.getDate() - dias);
  return formatoFecha(fecha);
}

function revolver(lista: string[]) {
  return lista.slice().sort(() => Math.random() - 0.5);
}

// 3 al azar de los que llegaron tarde, si no alcanza se completa con los ausentes
export function sortearAseo(tardes: string[], ausentes: string[]) {
  const lista = revolver(tardes).concat(revolver(ausentes));
  const tareas = revolver(TAREAS);
  const asignados: Asignado[] = [];
  for (let i = 0; i < lista.length && i < 3; i++) {
    asignados.push({ nombre: lista[i], tarea: tareas[i] });
  }
  return asignados;
}

const VERDE_SENA = 'FF39A900';
const LETRA = 'Arial';

// "yeferson najar" queda "Yeferson Najar"
function ponerMayusculas(texto: string) {
  return texto
    .split(' ')
    .map((palabra) => palabra.charAt(0).toUpperCase() + palabra.slice(1))
    .join(' ');
}

function ponerBordes(celda: any) {
  const linea = { style: 'thin', color: { argb: 'FFBFBFBF' } };
  celda.border = { top: linea, left: linea, bottom: linea, right: linea };
}

// titulo grande arriba y la ficha debajo
function ponerTitulo(libro: any, hoja: any, titulo: string, ultimaColumna: string) {
  hoja.mergeCells(`A1:${ultimaColumna}1`);
  const celdaTitulo = hoja.getCell('A1');
  celdaTitulo.value = titulo;
  celdaTitulo.font = { name: LETRA, size: 18, bold: true, color: { argb: VERDE_SENA } };
  celdaTitulo.alignment = { horizontal: 'center', vertical: 'middle' };
  hoja.getRow(1).height = 40;

  hoja.mergeCells(`A2:${ultimaColumna}2`);
  const celdaFicha = hoja.getCell('A2');
  celdaFicha.value = 'Ficha 3237831 - Equipo XchanGo';
  celdaFicha.font = { name: LETRA, size: 12, color: { argb: 'FF7F7F7F' } };
  celdaFicha.alignment = { horizontal: 'center', vertical: 'top' };
  hoja.getRow(2).height = 26;

  // logo del sena arriba a la izquierda
  const rutaLogo = path.join(process.cwd(), 'assets', 'logo-sena.png');
  if (fs.existsSync(rutaLogo)) {
    const logo = libro.addImage({ filename: rutaLogo, extension: 'png' });
    hoja.addImage(logo, { tl: { col: 0.15, row: 0.15 }, ext: { width: 80, height: 78 } });
  }
}

// la fila crece si el texto es largo
function altoSegunTexto(texto: string, letrasPorLinea: number) {
  const lineas = Math.ceil(texto.length / letrasPorLinea);
  return Math.max(26, lineas * 18);
}

function estiloEncabezado(celda: any) {
  celda.font = { name: LETRA, size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_SENA } };
  celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ponerBordes(celda);
}

function estiloDato(celda: any) {
  celda.font = { name: LETRA, size: 12 };
  celda.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
  ponerBordes(celda);
}

export async function crearExcel(fecha: string, registros: Registro[]) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Asistencia');
  ponerTitulo(libro, hoja, `AsistIA SENA - Asistencia del ${fecha}`, 'E');

  hoja.getColumn(1).width = 32;
  hoja.getColumn(2).width = 14;
  hoja.getColumn(3).width = 14;
  hoja.getColumn(4).width = 20;
  hoja.getColumn(5).width = 50;

  const encabezado = hoja.getRow(4);
  encabezado.values = ['Nombre', 'Hora', 'Estado', 'Excusa', 'Motivo'];
  encabezado.height = 26;
  encabezado.eachCell((celda) => estiloEncabezado(celda));

  for (const registro of registros) {
    let estado = 'Ausente';
    let colorFondo = 'FFEDEDED';
    let colorLetra = 'FF595959';
    if (registro.estado == 'A_TIEMPO') {
      estado = 'A tiempo';
      colorFondo = 'FFE2F0D9';
      colorLetra = 'FF2E7D00';
    } else if (registro.estado == 'TARDE') {
      estado = 'Tarde';
      colorFondo = 'FFFCE4E4';
      colorLetra = 'FFC00000';
    }

    const fila = hoja.addRow([
      ponerMayusculas(registro.nombre),
      registro.hora,
      estado,
      registro.excusa || '',
      registro.motivo || '',
    ]);
    fila.height = 24;
    for (let columna = 1; columna <= 5; columna++) {
      estiloDato(fila.getCell(columna));
    }
    fila.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

    const celdaEstado = fila.getCell(3);
    celdaEstado.font = { name: LETRA, size: 12, bold: true, color: { argb: colorLetra } };
    celdaEstado.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorFondo } };
    celdaEstado.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  const carpeta = path.join(CARPETA_DATOS, 'excel');
  fs.mkdirSync(carpeta, { recursive: true });
  const ruta = path.join(carpeta, `asistencia-${fecha}.xlsx`);
  await libro.xlsx.writeFile(ruta);
  return ruta;
}

export interface Permiso {
  id: number;
  chatId: number;
  nombre: string;
  fecha: string;
  horaSolicitud: string;
  horaSalida: string;
  motivo: string;
  estado: string; // PENDIENTE, ACEPTADO o RECHAZADO
  motivoCompleto?: string; // el motivo redactado por AsistIA
  resumen?: string;
  sugerencia?: string; // lo que aconseja gemini: ACEPTAR o RECHAZAR
  razon?: string;
  mensajeId?: number;
}

export async function crearExcelPermiso(permiso: Permiso) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Permiso de salida');
  ponerTitulo(libro, hoja, 'AsistIA SENA - Permiso de salida', 'B');

  hoja.getColumn(1).width = 28;
  hoja.getColumn(2).width = 70;

  // se muestra como una ficha: el dato a la izquierda y el valor a la derecha
  const datos = [
    ['Aprendiz', ponerMayusculas(permiso.nombre)],
    ['Fecha', permiso.fecha],
    ['Hora de la solicitud', permiso.horaSolicitud],
    ['Hora de salida', permiso.horaSalida],
    ['Motivo', permiso.motivoCompleto || permiso.motivo],
    ['Lo que escribio el aprendiz', permiso.motivo],
    ['AsistIA aconseja', permiso.sugerencia || 'Sin sugerencia'],
    ['Razon', permiso.razon || ''],
    ['Decision del instructor', permiso.estado],
  ];

  let numeroFila = 4;
  for (const dato of datos) {
    const fila = hoja.getRow(numeroFila);
    fila.values = dato;
    fila.height = altoSegunTexto(dato[1], 65);
    estiloEncabezado(fila.getCell(1));
    fila.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
    estiloDato(fila.getCell(2));
    numeroFila++;
  }

  // la hora de salida se resalta
  hoja.getCell('B7').font = { name: LETRA, size: 14, bold: true, color: { argb: VERDE_SENA } };

  // lo que escribio el aprendiz va en cursiva y gris
  hoja.getCell('B9').font = { name: LETRA, size: 11, italic: true, color: { argb: 'FF7F7F7F' } };

  // lo que aconseja AsistIA en verde o en rojo
  let colorConsejo = 'FF595959';
  if (permiso.sugerencia == 'ACEPTAR') {
    colorConsejo = 'FF2E7D00';
  } else if (permiso.sugerencia == 'RECHAZAR') {
    colorConsejo = 'FFC00000';
  }
  hoja.getCell('B10').font = { name: LETRA, size: 12, bold: true, color: { argb: colorConsejo } };

  // la decision del instructor es lo mas importante, va grande y con color
  let colorDecision = 'FF595959';
  let fondoDecision = 'FFEDEDED';
  if (permiso.estado == 'ACEPTADO') {
    colorDecision = 'FF2E7D00';
    fondoDecision = 'FFE2F0D9';
  } else if (permiso.estado == 'RECHAZADO') {
    colorDecision = 'FFC00000';
    fondoDecision = 'FFFCE4E4';
  }
  const celdaDecision = hoja.getCell('B12');
  celdaDecision.font = { name: LETRA, size: 14, bold: true, color: { argb: colorDecision } };
  celdaDecision.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fondoDecision } };
  hoja.getRow(12).height = 30;

  const carpeta = path.join(CARPETA_DATOS, 'excel');
  fs.mkdirSync(carpeta, { recursive: true });
  const nombreArchivo = `permiso-${permiso.fecha}-${permiso.nombre.replace(/ /g, '-')}-${permiso.horaSalida.replace(':', '')}.xlsx`;
  const ruta = path.join(carpeta, nombreArchivo);
  await libro.xlsx.writeFile(ruta);
  return ruta;
}
