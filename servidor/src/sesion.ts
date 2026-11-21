import * as crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

// aca se guardan los codigos de las sesiones abiertas
const sesiones: string[] = [];

// saca el valor de la cookie "sesion"
function leerCookie(req: Request) {
  const cookies = (req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const partes = cookie.trim().split('=');
    if (partes[0] == 'sesion') {
      return partes[1];
    }
  }
  return '';
}

export function haySesion(req: Request) {
  return sesiones.includes(leerCookie(req));
}

// revisa el usuario y la clave del .env, devuelve el error o '' si entro bien
export function entrar(usuario: string, clave: string, res: Response) {
  if (usuario != process.env.INSTRUCTOR_USUARIO || clave != process.env.INSTRUCTOR_CLAVE) {
    return 'Usuario o clave incorrectos';
  }
  const codigo = crypto.randomUUID();
  sesiones.push(codigo);
  res.cookie('sesion', codigo, { httpOnly: true });
  return '';
}

export function salir(req: Request, res: Response) {
  const posicion = sesiones.indexOf(leerCookie(req));
  if (posicion != -1) {
    sesiones.splice(posicion, 1);
  }
  res.clearCookie('sesion');
}

// se revisa en cada pedido: sin sesion no se ve el panel ni los datos
export function revisarSesion(req: Request, res: Response, next: NextFunction) {
  const ruta = req.path;

  // el login y lo que necesita para verse se pueden abrir sin sesion
  const libres = ['/login.html', '/login.js', '/estilos.css', '/img/asistia.png', '/api/login'];
  // reconocer.py lee el horario sin sesion
  const leerHorario = ruta == '/api/horario' && req.method == 'GET';

  if (libres.includes(ruta) || leerHorario || haySesion(req)) {
    return next();
  }
  if (ruta.startsWith('/api/')) {
    return res.status(401).json({ mensaje: 'Primero inicia sesion' });
  }
  return res.redirect('/login.html');
}
