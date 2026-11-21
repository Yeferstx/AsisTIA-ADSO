import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import * as mqtt from 'mqtt';
import * as cron from 'node-cron';
import * as fs from 'fs';
import * as path from 'path';
import * as tls from 'tls';
import { leerJson, guardarJson, leerNombres } from './archivos';
import { analizarExcusa, analizarPermiso, responderPregunta } from './gemini';
import { enviarCorreo } from './correo';
import {
  HORA_RECORDATORIO_ASEO, DIAS_CLASE, Registro, Asignado, Horario, leerHorario,
  fechaHoy, formatoFecha, inicioSemana, fechaEnTexto, siguienteDiaClase, sortearAseo, crearExcel, crearExcelPermiso, Permiso,
} from './asistencia';

const TOPIC_REGISTRO = 'sena/asistencia/registro';
const TOPIC_CONTROL = 'sena/asistencia/control';

interface Aprendiz {
  nombre: string;
  chatId: number;
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  bot: TelegramBot;
  clienteMqtt: mqtt.MqttClient;
  chatInstructor = Number(process.env.TELEGRAM_CHAT_INSTRUCTOR);
  chatGrupo = Number(process.env.TELEGRAM_GRUPO);
  // aprendices que estan pidiendo permiso, se guarda en que pregunta van
  pidiendoPermiso: any = {};

  onModuleInit() {
    this.bot = new TelegramBot(process.env.TELEGRAM_TOKEN || '', { polling: true });

    this.bot.on('message', (mensaje) => {
      console.log(`Mensaje de ${mensaje.chat.id}: ${mensaje.text}`);
      // si no es un comando puede ser la respuesta del permiso o una excusa
      if (mensaje.chat.type === 'private' && mensaje.text && !mensaje.text.startsWith('/')) {
        if (this.pidiendoPermiso[mensaje.chat.id]) {
          this.recibirPermiso(mensaje.chat.id, mensaje.text);
        } else {
          this.recibirExcusa(mensaje.chat.id, mensaje.text);
        }
      }
    });

    this.bot.onText(/^\/start/, (mensaje) => this.iniciar(mensaje.chat.id));
    this.bot.onText(/^\/ayuda/, (mensaje) => this.ayuda(mensaje.chat.id));
    this.bot.on('callback_query', (boton) => {
      if (boton.data && boton.data.startsWith('excusa:')) {
        this.botonExcusa(boton);
      } else if (boton.data && boton.data.startsWith('permiso:')) {
        this.botonPermiso(boton);
      } else {
        this.elegirNombre(boton);
      }
    });
    this.bot.onText(/^\/cerrar/, (mensaje) => this.comandoCerrar(mensaje.chat.id));
    this.bot.onText(/^\/fallas/, (mensaje) => this.comandoFallas(mensaje.chat.id));
    this.bot.onText(/^\/aseo/, (mensaje) => this.comandoAseo(mensaje.chat.id));
    this.bot.onText(/^\/hoy/, (mensaje) => this.comandoHoy(mensaje.chat.id));
    this.bot.onText(/^\/excel/, (mensaje) => this.comandoExcel(mensaje.chat.id));
    this.bot.onText(/^\/permiso/, (mensaje) => this.comandoPermiso(mensaje.chat.id));

    // cada minuto se revisa el horario, asi si el instructor lo cambia en la pagina se usa de una vez
    cron.schedule(`* * * * ${DIAS_CLASE.join(',')}`, () => this.revisarHorario());

    this.conectarMqtt();
    console.log('Bot de Telegram iniciado');
  }

  revisarHorario() {
    const horario = leerHorario();
    const ahora = new Date().toTimeString().slice(0, 5);
    if (ahora == horario.apertura) {
      this.clienteMqtt.publish(TOPIC_CONTROL, 'ABRIR', { qos: 1 });
      console.log('Asistencia abierta');
    }
    // a la hora de salida se apaga la luz del salon (rele)
    if (ahora == horario.salida) {
      this.clienteMqtt.publish(TOPIC_CONTROL, 'APAGAR_LUZ', { qos: 1 });
      console.log('Luz del salon apagada');
    }
    if (ahora == horario.cierre) {
      this.cierreAutomatico();
    }
    if (ahora == HORA_RECORDATORIO_ASEO) {
      this.recordarAseo();
    }
  }

  onModuleDestroy() {
    this.bot.stopPolling();
    this.clienteMqtt.end();
  }

  conectarMqtt() {
    this.clienteMqtt = mqtt.connect({
      host: process.env.MQTT_HOST,
      port: Number(process.env.MQTT_PUERTO),
      protocol: 'mqtts',
      username: process.env.MQTT_USUARIO,
      password: process.env.MQTT_CLAVE,
      // certificados de confianza de Windows (asi funciona aunque el antivirus revise la conexion)
      ca: tls.getCACertificates('system'),
    });

    this.clienteMqtt.on('connect', () => {
      console.log('Bot conectado al broker MQTT');
      this.clienteMqtt.subscribe([TOPIC_REGISTRO, TOPIC_CONTROL]);
    });

    this.clienteMqtt.on('message', (topic, datos) => {
      const mensaje = datos.toString();
      if (topic === TOPIC_REGISTRO) {
        try {
          this.guardarLlegada(JSON.parse(mensaje));
        } catch (error) {
          console.log(`Registro invalido: ${mensaje}`);
        }
      }
      // si cierran desde el tactil tambien se cierra aca
      if (topic === TOPIC_CONTROL && mensaje === 'CERRAR') {
        this.cierreAutomatico();
      }
    });
  }

  // con try para que no se caiga el servidor
  async enviar(chatId: number, texto: string) {
    try {
      await this.bot.sendMessage(chatId, texto);
    } catch (error) {
      console.log(`No se pudo enviar mensaje a ${chatId}: ${error.message}`);
    }
  }

  leerDia(asistencia: any, fecha: string) {
    if (!asistencia[fecha]) {
      asistencia[fecha] = { cerrada: false, registros: [] };
    }
    return asistencia[fecha];
  }

  guardarLlegada(registro: Registro) {
    if (registro.nombre === 'DESCONOCIDO') {
      return;
    }
    const asistencia = leerJson('asistencia.json', {});
    const dia = this.leerDia(asistencia, fechaHoy());
    const yaLlego = dia.registros.some((r: Registro) => r.nombre === registro.nombre);
    if (dia.cerrada || yaLlego) {
      return;
    }
    dia.registros.push({ nombre: registro.nombre, hora: registro.hora, estado: registro.estado });
    guardarJson('asistencia.json', asistencia);
    console.log(`Llegada guardada: ${registro.nombre} ${registro.estado}`);
  }

  // si no llego nadie es porque no hubo clase (festivo)
  cierreAutomatico() {
    const asistencia = leerJson('asistencia.json', {});
    const dia = this.leerDia(asistencia, fechaHoy());
    if (dia.registros.length === 0) {
      console.log('Hoy no llego nadie, no se cierra la asistencia (posible festivo)');
      return;
    }
    this.cerrarAsistencia();
  }

  async cerrarAsistencia() {
    const seCerro = await this.enviarTelegrams();
    await this.hacerSorteo();
    return seCerro;
  }

  resumenDia(dia: any) {
    const registros: Registro[] = dia.registros;
    const aTiempo = registros.filter((r) => r.estado == 'A_TIEMPO').map((r) => r.nombre);
    const tardes = registros.filter((r) => r.estado == 'TARDE').map((r) => r.nombre);
    const llegaron = aTiempo.concat(tardes);
    const ausentes = leerNombres().filter((nombre) => !llegaron.includes(nombre));
    return { aTiempo, tardes, ausentes };
  }

  // mensajes a los ausentes y al instructor, devuelve false si ya se habian enviado
  async enviarTelegrams() {
    const hoy = fechaHoy();
    const asistencia = leerJson('asistencia.json', {});
    const dia = this.leerDia(asistencia, hoy);
    if (dia.cerrada) {
      return false;
    }

    const resumen = this.resumenDia(dia);
    const aTiempo = resumen.aTiempo;
    const tardes = resumen.tardes;
    const ausentes = resumen.ausentes;
    for (const nombre of ausentes) {
      dia.registros.push({ nombre, hora: '', estado: 'AUSENTE' });
    }
    dia.cerrada = true;
    guardarJson('asistencia.json', asistencia);
    this.clienteMqtt.publish(TOPIC_CONTROL, 'CERRAR', { qos: 1 });

    // mensaje a los ausentes
    const aprendices: Aprendiz[] = leerJson('aprendices.json', []);
    const excusas = leerJson('excusas.json', []);
    for (const nombre of ausentes) {
      const aprendiz = aprendices.find((a) => a.nombre === nombre);
      if (aprendiz) {
        excusas.push({ nombre, chatId: aprendiz.chatId, fecha: hoy, texto: '', estado: 'SIN_RESPUESTA' });
        guardarJson('excusas.json', excusas);
        await this.enviar(
          aprendiz.chatId,
          `Hola ${nombre}, hoy no asististe a clase (${leerHorario().inicio}). Que paso? Responde este mensaje con tu excusa.`,
        );
      }
    }

    // resumen al instructor
    if (this.chatInstructor) {
      await this.enviar(
        this.chatInstructor,
        `Resumen de asistencia ${hoy}

` +
          `A tiempo (${aTiempo.length}): ${this.listar(aTiempo)}
` +
          `Tarde (${tardes.length}): ${this.listar(tardes)}
` +
          `Ausentes (${ausentes.length}): ${this.listar(ausentes)}`,
      );
      await this.enviarExcel(this.chatInstructor, hoy, dia.registros);
    }

    await this.revisarAlertas(asistencia, ausentes, tardes);
    console.log(`Asistencia del ${hoy} cerrada`);
    return true;
  }

  // solo se hace un sorteo por dia
  async hacerSorteo() {
    const hoy = fechaHoy();
    const aseo = leerJson('aseo.json', []);
    const yaSorteado = aseo.find((a) => a.sorteadoEl == hoy);
    if (yaSorteado) {
      return yaSorteado;
    }

    const asistencia = leerJson('asistencia.json', {});
    const dia = this.leerDia(asistencia, hoy);
    const resumen = this.resumenDia(dia);
    // los que llegaron tarde ordenados del ultimo en llegar al primero
    const tardesDelUltimo = dia.registros
      .filter((r: Registro) => r.estado == 'TARDE')
      .sort((a: Registro, b: Registro) => b.hora.localeCompare(a.hora))
      .map((r: Registro) => r.nombre);
    const diaAseo = siguienteDiaClase();
    const sorteo = { fecha: formatoFecha(diaAseo), sorteadoEl: hoy, asignados: sortearAseo(tardesDelUltimo, resumen.ausentes) };
    aseo.push(sorteo);
    guardarJson('aseo.json', aseo);

    if (this.chatGrupo) {
      let texto = `Aseo para el ${fechaEnTexto(diaAseo)}:
`;
      if (sorteo.asignados.length == 0) {
        texto += 'Todos llegaron a tiempo, hoy no hay sorteo.';
      }
      for (const asignado of sorteo.asignados) {
        texto += `- ${asignado.nombre} -> ${asignado.tarea}
`;
      }
      await this.enviar(this.chatGrupo, texto);
    }
    return sorteo;
  }

  // los que llegaron mas los que faltan, aunque no se haya cerrado
  registrosParaExcel(dia: any) {
    const llegaron = dia.registros.filter((r: Registro) => r.estado != 'AUSENTE');
    const resumen = this.resumenDia(dia);
    for (const nombre of resumen.ausentes) {
      llegaron.push({ nombre, hora: '', estado: 'AUSENTE' });
    }
    return llegaron;
  }

  async crearExcelDelDia(fecha: string) {
    const asistencia = leerJson('asistencia.json', {});
    const dia = this.leerDia(asistencia, fecha);
    return crearExcel(fecha, this.agregarExcusas(fecha, this.registrosParaExcel(dia)));
  }

  cambiarHorario(datos: Horario) {
    const formato = /^[0-2][0-9]:[0-5][0-9]$/;
    const campos = ['apertura', 'inicio', 'salida', 'cierre'];
    for (const campo of campos) {
      if (!formato.test(datos[campo] || '')) {
        return `La hora de ${campo} no es valida`;
      }
    }
    if (!(datos.apertura <= datos.inicio && datos.inicio < datos.salida && datos.salida <= datos.cierre)) {
      return 'Revisa el orden: apertura, hora limite, salida y cierre';
    }
    guardarJson('horario.json', { apertura: datos.apertura, inicio: datos.inicio, salida: datos.salida, cierre: datos.cierre });
    console.log(`Horario cambiado: ${datos.apertura} ${datos.inicio} ${datos.salida} ${datos.cierre}`);
    return 'Horario guardado';
  }

  // lista de dias con cuantos llegaron a tiempo, tarde y cuantos faltaron
  historial() {
    const asistencia = leerJson('asistencia.json', {});
    const fechas = Object.keys(asistencia).sort().reverse();
    return fechas.map((fecha) => {
      const resumen = this.resumenDia(asistencia[fecha]);
      return {
        fecha,
        cerrada: asistencia[fecha].cerrada,
        aTiempo: resumen.aTiempo.length,
        tardes: resumen.tardes.length,
        ausentes: resumen.ausentes.length,
      };
    });
  }

  detalleDia(fecha: string) {
    const asistencia = leerJson('asistencia.json', {});
    const dia = this.leerDia(asistencia, fecha);
    return { fecha, cerrada: dia.cerrada, registros: this.agregarExcusas(fecha, this.registrosParaExcel(dia)) };
  }

  // solo se cuentan los dias que ya se cerraron
  resumenAprendices() {
    const asistencia = leerJson('asistencia.json', {});
    const fechas = Object.keys(asistencia).filter((f) => asistencia[f].cerrada).sort();
    const aprendices: Aprendiz[] = leerJson('aprendices.json', []);
    const excusas = leerJson('excusas.json', []);

    const lista = leerNombres().map((nombre) => {
      let asistencias = 0;
      let tardes = 0;
      let fallas = 0;
      let fallasSeguidas = 0;
      for (const fecha of fechas) {
        const registro = asistencia[fecha].registros.find((r: Registro) => r.nombre === nombre);
        if (!registro) {
          continue;
        }
        if (registro.estado == 'AUSENTE') {
          fallas++;
          fallasSeguidas++;
        } else {
          asistencias++;
          fallasSeguidas = 0;
        }
        if (registro.estado == 'TARDE') {
          tardes++;
        }
      }
      return {
        nombre,
        asistencias,
        tardes,
        fallas,
        fallasSeguidas,
        excusasAceptadas: excusas.filter((e) => e.nombre === nombre && e.estado == 'ACEPTADA').length,
        telegram: aprendices.some((a) => a.nombre === nombre),
      };
    });
    return { diasDeClase: fechas.length, aprendices: lista };
  }

  // del mas nuevo al mas viejo, y si una fecha quedo repetida se deja el ultimo sorteo
  listaAseo() {
    const aseo = leerJson('aseo.json', []);
    const lista: any[] = [];
    for (const dia of aseo) {
      const repetido = lista.findIndex((d) => d.fecha == dia.fecha);
      if (repetido != -1) {
        lista.splice(repetido, 1);
      }
      lista.push(dia);
    }
    return lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  // a gemini se le pasa un resumen de la asistencia para que responda
  async preguntarIa(pregunta: string) {
    const asistencia = leerJson('asistencia.json', {});
    const resumen = this.resumenAprendices();
    let datos = `Hoy es ${fechaEnTexto(new Date())} (${fechaHoy()}). Dias de clase cerrados: ${resumen.diasDeClase}.\n\n`;
    datos += 'Totales por aprendiz:\n';
    for (const a of resumen.aprendices) {
      datos += `- ${a.nombre}: asistio ${a.asistencias} (tarde ${a.tardes}), fallas ${a.fallas}, ` +
        `fallas seguidas ${a.fallasSeguidas}, excusas aceptadas ${a.excusasAceptadas}\n`;
    }
    datos += '\nDetalle por dia:\n';
    for (const fecha of Object.keys(asistencia).sort()) {
      const dia = this.resumenDia(asistencia[fecha]);
      let nota = '';
      if (!asistencia[fecha].cerrada) {
        nota = ' (asistencia aun abierta)';
      }
      datos += `${fecha}${nota}: a tiempo: ${this.listar(dia.aTiempo)}; tarde: ${this.listar(dia.tardes)}; ` +
        `ausentes: ${this.listar(dia.ausentes)}\n`;
    }
    return responderPregunta(pregunta, datos);
  }

  estadoDeHoy() {
    const hoy = fechaHoy();
    const asistencia = leerJson('asistencia.json', {});
    const dia = this.leerDia(asistencia, hoy);
    const resumen = this.resumenDia(dia);
    const aseo = leerJson('aseo.json', []);
    return {
      fecha: hoy,
      cerrada: dia.cerrada,
      llegadas: dia.registros.filter((r: Registro) => r.estado != 'AUSENTE'),
      aTiempo: resumen.aTiempo.length,
      tardes: resumen.tardes.length,
      ausentes: resumen.ausentes,
      horario: leerHorario(),
      sorteo: aseo.find((a) => a.sorteadoEl == hoy) || null,
      excusas: leerJson('excusas.json', []).filter((e) => e.estado == 'PENDIENTE'),
      permisos: leerJson('permisos.json', []).filter((p) => p.estado == 'PENDIENTE'),
    };
  }

  async recordarAseo() {
    const aseo = leerJson('aseo.json', []);
    const hoy = aseo.find((dia) => dia.fecha === fechaHoy());
    if (!hoy || !this.chatGrupo || hoy.asignados.length == 0) {
      return;
    }
    let nombres = '';
    for (let i = 0; i < hoy.asignados.length; i++) {
      const asignado: Asignado = hoy.asignados[i];
      if (i > 0 && i == hoy.asignados.length - 1) {
        nombres += ' y ';
      } else if (i > 0) {
        nombres += ', ';
      }
      nombres += `${asignado.nombre} (${asignado.tarea})`;
    }
    await this.enviar(this.chatGrupo, `Hoy les toca aseo a ${nombres}. No se vayan sin hacerlo!`);
  }

  async revisarAlertas(asistencia: any, ausentes: string[], tardes: string[]) {
    const fechas = Object.keys(asistencia).filter((f) => asistencia[f].cerrada).sort();

    // fallas seguidas, se cuenta desde el ultimo dia para atras
    for (const nombre of ausentes) {
      let seguidas = 0;
      for (let i = fechas.length - 1; i >= 0; i--) {
        const registro = asistencia[fechas[i]].registros.find((r: Registro) => r.nombre === nombre);
        if (registro && registro.estado == 'AUSENTE') {
          seguidas++;
        } else {
          break;
        }
      }
      if (seguidas === 3 && this.chatInstructor) {
        await this.enviar(this.chatInstructor, `Atencion: ${nombre} lleva 3 fallas seguidas, posible riesgo de desercion.`);
      }
    }

    // llegadas tarde de esta semana
    const aprendices: Aprendiz[] = leerJson('aprendices.json', []);
    for (const nombre of tardes) {
      let tardesSemana = 0;
      for (const fecha of fechas) {
        const registro = asistencia[fecha].registros.find((r: Registro) => r.nombre === nombre);
        if (fecha >= inicioSemana() && registro && registro.estado == 'TARDE') {
          tardesSemana++;
        }
      }
      const aprendiz = aprendices.find((a) => a.nombre === nombre);
      if (tardesSemana === 2 && aprendiz) {
        await this.enviar(
          aprendiz.chatId,
          `Hola ${nombre}, esta semana llevas 2 llegadas tarde. Sabemos que a veces se complica, pero tu puedes! ` +
            `Intenta salir un poco antes, te esperamos a las ${leerHorario().inicio}.`,
        );
      }
    }
  }

  comandoPermiso(chatId: number) {
    const aprendiz = this.buscarAprendiz(chatId);
    if (!aprendiz) {
      this.enviar(chatId, 'Primero registrate con /start.');
      return;
    }
    this.pidiendoPermiso[chatId] = { paso: 'MOTIVO', motivo: '' };
    this.enviar(chatId, 'Por que necesitas salir? Escribe el motivo.');
  }

  async recibirPermiso(chatId: number, texto: string) {
    const permisoEnCurso = this.pidiendoPermiso[chatId];

    if (permisoEnCurso.paso == 'MOTIVO') {
      permisoEnCurso.motivo = texto;
      permisoEnCurso.paso = 'HORA';
      this.enviar(chatId, 'A que hora vas a salir? Escribela asi: 15:30');
      return;
    }

    // la hora tiene que ser como 15:30
    const horaSalida = texto.trim();
    if (!/^[0-2]?[0-9]:[0-5][0-9]$/.test(horaSalida)) {
      this.enviar(chatId, 'No entendi la hora. Escribela asi: 15:30');
      return;
    }
    delete this.pidiendoPermiso[chatId];

    const aprendiz = this.buscarAprendiz(chatId);
    if (!aprendiz) {
      return;
    }
    const permiso: Permiso = {
      id: Date.now(),
      chatId: chatId,
      nombre: aprendiz.nombre,
      fecha: fechaHoy(),
      horaSolicitud: new Date().toTimeString().slice(0, 5),
      horaSalida: horaSalida,
      motivo: permisoEnCurso.motivo,
      estado: 'PENDIENTE',
    };
    this.enviar(chatId, `Listo, tu permiso para salir a las ${horaSalida} fue enviado al instructor. Te aviso cuando responda.`);

    // gemini le aconseja al instructor, pero el que decide es el instructor
    const analisis = await analizarPermiso(permiso.nombre, permiso.motivo, permiso.horaSalida);
    permiso.resumen = analisis.resumen;
    permiso.sugerencia = analisis.sugerencia;
    permiso.razon = analisis.razon;
    permiso.motivoCompleto = analisis.motivo || permiso.motivo;

    // al instructor le llega con los botones para decidir
    if (this.chatInstructor) {
      try {
        const mensaje = await this.bot.sendMessage(this.chatInstructor, this.textoPermiso(permiso), {
          reply_markup: {
            inline_keyboard: [[
              { text: 'Aceptar', callback_data: `permiso:ACEPTADO:${permiso.id}` },
              { text: 'Rechazar', callback_data: `permiso:RECHAZADO:${permiso.id}` },
            ]],
          },
        });
        permiso.mensajeId = mensaje.message_id;
      } catch (error) {
        console.log(`No se pudo enviar el permiso al instructor: ${error.message}`);
      }
    }
    const permisos = leerJson('permisos.json', []);
    permisos.push(permiso);
    guardarJson('permisos.json', permisos);
  }

  // el excel se manda al correo cuando el instructor ya decidio
  async enviarPermisoPorCorreo(permiso: Permiso) {
    const ruta = await crearExcelPermiso(permiso);
    try {
      await enviarCorreo(
        `Permiso de salida ${permiso.estado} - ${permiso.nombre}`,
        `${permiso.nombre} pidio permiso para salir hoy ${permiso.fecha} a las ${permiso.horaSalida}.\n\n` +
          `Motivo: ${permiso.motivoCompleto}\n\nDecision del instructor: ${permiso.estado}`,
        ruta,
      );
      console.log(`Correo del permiso de ${permiso.nombre} enviado`);
    } catch (error) {
      console.log(`No se pudo enviar el correo: ${error.message}`);
    }
  }

  textoPermiso(permiso: Permiso) {
    let texto = `Permiso de salida de ${permiso.nombre} (${permiso.fecha})\n\n`;
    texto += `Sale a las: ${permiso.horaSalida}\n`;
    texto += `Motivo: ${permiso.motivo}\n\n`;
    texto += `Resumen AsistIA: ${permiso.resumen}\n`;
    texto += `AsistIA aconseja: ${permiso.sugerencia}`;
    if (permiso.razon) {
      texto += ` - ${permiso.razon}`;
    }
    return texto;
  }

  async botonPermiso(boton: TelegramBot.CallbackQuery) {
    const partes = (boton.data || '').split(':');
    let respuesta = 'Solo el instructor puede decidir';
    if (this.esInstructor(boton.from.id)) {
      respuesta = await this.decidirPermiso(Number(partes[2]), partes[1]);
    }
    this.bot.answerCallbackQuery(boton.id, { text: respuesta });
  }

  async decidirPermiso(id: number, decision: string) {
    const permisos = leerJson('permisos.json', []);
    const permiso = permisos.find((p) => p.id == id);
    if (!permiso || permiso.estado != 'PENDIENTE') {
      return 'Ese permiso ya fue revisado';
    }
    permiso.estado = decision;
    guardarJson('permisos.json', permisos);

    // sin await para que el boton responda rapido, el correo se demora
    this.enviarPermisoPorCorreo(permiso);

    let palabra = 'rechazado';
    if (decision == 'ACEPTADO') {
      palabra = 'aceptado';
    }
    await this.enviar(permiso.chatId, `Hola ${permiso.nombre}, tu permiso para salir a las ${permiso.horaSalida} fue ${palabra} por el instructor.`);

    // se quitan los botones del mensaje del instructor
    if (permiso.mensajeId) {
      try {
        await this.bot.editMessageText(`${this.textoPermiso(permiso)}\n\nDecision: ${decision}`, {
          chat_id: this.chatInstructor,
          message_id: permiso.mensajeId,
        });
      } catch (error) {
        console.log(`No se pudo editar el mensaje: ${error.message}`);
      }
    }
    return `Permiso de ${permiso.nombre} ${palabra}`;
  }

  async recibirExcusa(chatId: number, texto: string) {
    const excusas = leerJson('excusas.json', []);
    const excusa = excusas.find((e) => e.chatId === chatId && e.estado === 'SIN_RESPUESTA');
    if (!excusa) {
      this.enviar(chatId, 'No entendi. Escribe /ayuda para ver los comandos.');
      return;
    }

    if (!excusa.id) {
      excusa.id = Date.now();
    }
    excusa.texto = texto;
    excusa.estado = 'PENDIENTE';
    guardarJson('excusas.json', excusas);
    this.enviar(chatId, 'Gracias, tu excusa fue enviada al instructor.');

    // gemini hace el resumen y sugiere, pero el que decide es el instructor
    const analisis = await analizarExcusa(excusa.nombre, texto);

    // se vuelve a leer por si llego otra excusa mientras gemini respondia
    const excusasActuales = leerJson('excusas.json', []);
    const actual = excusasActuales.find((e) => e.id == excusa.id);
    actual.resumen = analisis.resumen;
    actual.sugerencia = analisis.sugerencia;
    actual.razon = analisis.razon;

    if (this.chatInstructor) {
      try {
        const mensaje = await this.bot.sendMessage(this.chatInstructor, this.textoExcusa(actual), {
          reply_markup: {
            inline_keyboard: [[
              { text: 'Aceptar', callback_data: `excusa:ACEPTADA:${actual.id}` },
              { text: 'Rechazar', callback_data: `excusa:RECHAZADA:${actual.id}` },
            ]],
          },
        });
        actual.mensajeId = mensaje.message_id;
      } catch (error) {
        console.log(`No se pudo enviar la excusa al instructor: ${error.message}`);
      }
    }
    guardarJson('excusas.json', excusasActuales);
  }

  textoExcusa(excusa: any) {
    let texto = `Excusa de ${excusa.nombre} (${excusa.fecha})

`;
    texto += `"${excusa.texto}"

`;
    texto += `Resumen AsistIA: ${excusa.resumen}
`;
    texto += `AsistIA aconseja: ${excusa.sugerencia}`;
    if (excusa.razon) {
      texto += ` - ${excusa.razon}`;
    }
    return texto;
  }

  async botonExcusa(boton: TelegramBot.CallbackQuery) {
    const partes = (boton.data || '').split(':');
    let respuesta = 'Solo el instructor puede decidir';
    if (this.esInstructor(boton.from.id)) {
      respuesta = await this.decidirExcusa(Number(partes[2]), partes[1]);
    }
    this.bot.answerCallbackQuery(boton.id, { text: respuesta });
  }

  // se usa desde telegram y desde la pagina
  async decidirExcusa(id: number, decision: string) {
    const excusas = leerJson('excusas.json', []);
    const excusa = excusas.find((e) => e.id == id);
    if (!excusa || excusa.estado != 'PENDIENTE') {
      return 'Esa excusa ya fue revisada';
    }
    excusa.estado = decision;
    guardarJson('excusas.json', excusas);

    let palabra = 'rechazada';
    if (decision == 'ACEPTADA') {
      palabra = 'aceptada';
    }
    await this.enviar(excusa.chatId, `Hola ${excusa.nombre}, tu excusa del ${excusa.fecha} fue ${palabra} por el instructor.`);

    // se quitan los botones del mensaje del instructor
    if (excusa.mensajeId) {
      try {
        await this.bot.editMessageText(`${this.textoExcusa(excusa)}

Decision: ${decision}`, {
          chat_id: this.chatInstructor,
          message_id: excusa.mensajeId,
        });
      } catch (error) {
        console.log(`No se pudo editar el mensaje: ${error.message}`);
      }
    }
    return `Excusa de ${excusa.nombre} ${palabra}`;
  }

  listar(nombres: string[]) {
    if (nombres.length == 0) {
      return 'ninguno';
    }
    return nombres.join(', ');
  }

  // a los ausentes se les pone si mandaron excusa y que dijo el instructor
  agregarExcusas(fecha: string, registros: Registro[]) {
    const excusas = leerJson('excusas.json', []);
    for (const registro of registros) {
      if (registro.estado != 'AUSENTE') {
        continue;
      }
      const excusa = excusas.find((e) => e.nombre == registro.nombre && e.fecha == fecha);
      registro.excusa = 'Sin excusa';
      registro.motivo = '';
      if (excusa && excusa.estado == 'SIN_RESPUESTA') registro.excusa = 'No ha respondido';
      if (excusa && excusa.estado == 'PENDIENTE') registro.excusa = 'Por revisar';
      if (excusa && excusa.estado == 'ACEPTADA') registro.excusa = 'Aceptada';
      if (excusa && excusa.estado == 'RECHAZADA') registro.excusa = 'Rechazada';
      if (excusa && excusa.texto) registro.motivo = excusa.texto;
    }
    return registros;
  }

  async enviarExcel(chatId: number, fecha: string, registros: Registro[]) {
    const ruta = await crearExcel(fecha, this.agregarExcusas(fecha, registros));
    try {
      await this.bot.sendDocument(chatId, ruta, {}, {
        filename: path.basename(ruta),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    } catch (error) {
      console.log(`No se pudo enviar el Excel: ${error.message}`);
    }
  }

  soloInstructor(chatId: number) {
    if (!this.esInstructor(chatId)) {
      this.enviar(chatId, 'Ese comando es solo para el instructor.');
      return false;
    }
    return true;
  }

  comandoFallas(chatId: number) {
    const aprendiz = this.buscarAprendiz(chatId);
    if (!aprendiz) {
      this.enviar(chatId, 'Primero registrate con /start.');
      return;
    }

    const asistencia = leerJson('asistencia.json', {});
    let fallas = 0;
    let tardes = 0;
    for (const fecha in asistencia) {
      const registro = asistencia[fecha].registros.find((r: Registro) => r.nombre === aprendiz.nombre);
      if (registro && registro.estado == 'AUSENTE') {
        fallas++;
      }
      if (registro && registro.estado == 'TARDE') {
        tardes++;
      }
    }
    this.enviar(chatId, `${aprendiz.nombre}, llevas ${fallas} fallas y ${tardes} llegadas tarde.`);
  }

  comandoAseo(chatId: number) {
    const aprendiz = this.buscarAprendiz(chatId);
    if (!aprendiz) {
      this.enviar(chatId, 'Primero registrate con /start.');
      return;
    }

    const aseo = leerJson('aseo.json', []);
    for (const dia of aseo) {
      const asignado = dia.asignados.find((a) => a.nombre === aprendiz.nombre);
      if (dia.fecha >= fechaHoy() && asignado) {
        const fecha = fechaEnTexto(new Date(`${dia.fecha}T00:00:00`));
        this.enviar(chatId, `Te toca aseo el ${fecha}. Tu tarea: ${asignado.tarea}.`);
        return;
      }
    }
    this.enviar(chatId, 'No te toca aseo por ahora.');
  }

  comandoHoy(chatId: number) {
    if (!this.soloInstructor(chatId)) {
      return;
    }
    const asistencia = leerJson('asistencia.json', {});
    const dia = this.leerDia(asistencia, fechaHoy());
    const llegaron = dia.registros.filter((r: Registro) => r.estado !== 'AUSENTE');
    if (llegaron.length === 0) {
      this.enviar(chatId, 'Hoy no ha llegado nadie todavia.');
      return;
    }

    let texto = `Llegadas de hoy (${llegaron.length}):\n`;
    for (const registro of llegaron) {
      texto += `- ${registro.nombre} - ${registro.hora} (${registro.estado})\n`;
    }
    if (dia.cerrada) {
      texto += '\nLa asistencia ya esta cerrada.';
    }
    this.enviar(chatId, texto);
  }

  async comandoExcel(chatId: number) {
    if (!this.soloInstructor(chatId)) {
      return;
    }
    const asistencia = leerJson('asistencia.json', {});
    const dia = this.leerDia(asistencia, fechaHoy());
    if (dia.registros.length === 0) {
      this.enviar(chatId, 'Hoy no hay registros todavia.');
      return;
    }
    await this.enviarExcel(chatId, fechaHoy(), this.registrosParaExcel(dia));
  }

  async comandoCerrar(chatId: number) {
    if (!this.soloInstructor(chatId)) {
      return;
    }
    const seCerro = await this.cerrarAsistencia();
    if (seCerro) {
      this.enviar(chatId, 'Asistencia cerrada. Se aviso a los ausentes y al grupo.');
    } else {
      this.enviar(chatId, 'La asistencia de hoy ya estaba cerrada.');
    }
  }

  esInstructor(chatId: number) {
    return chatId === this.chatInstructor;
  }

  buscarAprendiz(chatId: number): Aprendiz | undefined {
    const aprendices: Aprendiz[] = leerJson('aprendices.json', []);
    return aprendices.find((aprendiz) => aprendiz.chatId === chatId);
  }

  iniciar(chatId: number) {
    if (this.esInstructor(chatId)) {
      this.bot.sendMessage(chatId, 'Hola instructor, bienvenido a AsistIA SENA. Escribe /ayuda para ver tus comandos.');
      return;
    }

    const aprendiz = this.buscarAprendiz(chatId);
    if (aprendiz) {
      this.bot.sendMessage(chatId, `Hola ${aprendiz.nombre}, ya estas registrado en AsistIA.`);
      return;
    }

    const aprendices: Aprendiz[] = leerJson('aprendices.json', []);
    const registrados = aprendices.map((a) => a.nombre);
    const libres = leerNombres().filter((nombre) => !registrados.includes(nombre));

    if (libres.length === 0) {
      this.bot.sendMessage(chatId, 'Todos los aprendices ya estan registrados. Habla con el instructor.');
      return;
    }

    // un boton por cada nombre
    const botones = libres.map((nombre) => [{ text: nombre, callback_data: nombre }]);
    this.bot.sendMessage(chatId, 'Hola, bienvenido a AsistIA SENA. Cual es tu nombre?', {
      reply_markup: { inline_keyboard: botones },
    });
  }

  elegirNombre(boton: TelegramBot.CallbackQuery) {
    if (!boton.message) {
      return;
    }
    const chatId = boton.message.chat.id;
    const nombre = boton.data || '';
    const aprendices: Aprendiz[] = leerJson('aprendices.json', []);

    this.bot.answerCallbackQuery(boton.id);

    if (this.buscarAprendiz(chatId)) {
      this.bot.sendMessage(chatId, 'Ya estas registrado en AsistIA.');
      return;
    }
    if (aprendices.some((a) => a.nombre === nombre)) {
      this.bot.sendMessage(chatId, `${nombre} ya fue registrado por otra persona. Escribe /start de nuevo.`);
      return;
    }

    aprendices.push({ nombre, chatId });
    guardarJson('aprendices.json', aprendices);

    this.bot.editMessageText(`Listo ${nombre}, ya quedaste registrado en AsistIA.`, {
      chat_id: chatId,
      message_id: boton.message.message_id,
    });
  }

  ayuda(chatId: number) {
    if (this.esInstructor(chatId)) {
      this.bot.sendMessage(
        chatId,
        'Comandos del instructor:\n' +
          '/hoy - Quien ha llegado hoy y a que hora\n' +
          '/excel - Excel de la asistencia del dia\n' +
          '/cerrar - Cerrar la asistencia ya\n' +
          '/ayuda - Ver esta lista',
      );
      return;
    }

    this.bot.sendMessage(
      chatId,
      'Comandos del aprendiz:\n' +
        '/start - Registrarte en AsistIA\n' +
        '/fallas - Cuantas fallas y llegadas tarde llevas\n' +
        '/aseo - Si te toca aseo, que dia y que tarea\n' +
        '/permiso - Pedir permiso para salir temprano\n' +
        '/ayuda - Ver esta lista',
    );
  }
}
