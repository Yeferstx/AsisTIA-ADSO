import { Controller, Get, Post, Body, Res, Req, Query } from '@nestjs/common';
import type { Request, Response } from 'express';
import { entrar, salir } from '../sesion';
import { TelegramService } from './telegram.service';
import { fechaHoy, leerHorario } from './asistencia';
import type { Horario } from './asistencia';

// la fecha va en el nombre del archivo, por eso se revisa que sea como 2026-11-20
function fechaValida(fecha: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha || '');
}

@Controller('api')
export class WebController {
  constructor(private servicio: TelegramService) {}

  @Post('login')
  login(@Body() datos: { usuario: string; clave: string }, @Res({ passthrough: true }) res: Response) {
    const error = entrar(String(datos.usuario || ''), String(datos.clave || ''), res);
    if (error) {
      res.status(401);
      return { mensaje: error };
    }
    return { mensaje: 'Bienvenido' };
  }

  @Post('salir')
  cerrarSesion(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    salir(req, res);
    return { mensaje: 'Sesion cerrada' };
  }

  @Get('estado')
  estado() {
    return this.servicio.estadoDeHoy();
  }

  @Get('horario')
  horario() {
    return leerHorario();
  }

  @Post('horario')
  guardarHorario(@Body() datos: Horario) {
    return { mensaje: this.servicio.cambiarHorario(datos) };
  }

  @Get('historial')
  historial() {
    return this.servicio.historial();
  }

  @Get('dia')
  dia(@Query('fecha') fecha: string) {
    if (!fechaValida(fecha)) {
      return { mensaje: 'Fecha invalida' };
    }
    return this.servicio.detalleDia(fecha);
  }

  @Get('excel')
  async excel(@Query('fecha') fecha: string, @Res() res: Response) {
    if (!fechaValida(fecha)) {
      fecha = fechaHoy();
    }
    const ruta = await this.servicio.crearExcelDelDia(fecha);
    res.download(ruta);
  }

  @Get('aprendices')
  aprendices() {
    return this.servicio.resumenAprendices();
  }

  @Get('aseo')
  aseo() {
    return this.servicio.listaAseo();
  }

  @Post('cerrar')
  async cerrar() {
    const seCerro = await this.servicio.cerrarAsistencia();
    if (seCerro) {
      return { mensaje: 'Asistencia cerrada. Se aviso a los ausentes, al instructor y al grupo' };
    }
    return { mensaje: 'La asistencia de hoy ya estaba cerrada' };
  }

  @Post('preguntar')
  async preguntar(@Body() datos: { pregunta: string }) {
    if (!datos.pregunta || datos.pregunta.trim() == '') {
      return { respuesta: 'Escribe una pregunta.' };
    }
    const respuesta = await this.servicio.preguntarIa(datos.pregunta.slice(0, 300));
    return { respuesta };
  }

  @Post('excusa')
  async excusa(@Body() datos: { id: number; decision: string }) {
    if (datos.decision != 'ACEPTADA' && datos.decision != 'RECHAZADA') {
      return { mensaje: 'Decision invalida' };
    }
    const mensaje = await this.servicio.decidirExcusa(datos.id, datos.decision);
    return { mensaje };
  }

  @Post('permiso')
  async permiso(@Body() datos: { id: number; decision: string }) {
    if (datos.decision != 'ACEPTADO' && datos.decision != 'RECHAZADO') {
      return { mensaje: 'Decision invalida' };
    }
    const mensaje = await this.servicio.decidirPermiso(datos.id, datos.decision);
    return { mensaje };
  }
}
