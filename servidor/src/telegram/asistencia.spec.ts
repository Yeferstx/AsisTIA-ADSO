import { sortearAseo, formatoFecha, fechaEnTexto } from './asistencia';

describe('sorteo del aseo', () => {
  it('les toca a los 3 que llegaron mas tarde', () => {
    // vienen del ultimo en llegar al primero
    const tardes = ['pedro', 'sara', 'juan', 'luis', 'ana'];
    const nombres = sortearAseo(tardes, ['maria']).map((asignado) => asignado.nombre);
    expect(nombres).toEqual(['pedro', 'sara', 'juan']);
  });

  it('si llegan tarde menos de 3 se completa con ausentes', () => {
    const asignados = sortearAseo(['ana'], ['maria', 'carlos', 'lina']);
    expect(asignados.length).toBe(3);
    expect(asignados[0].nombre).toBe('ana');
  });

  it('reparte las tres tareas sin repetir', () => {
    const tareas = sortearAseo(['ana', 'luis', 'juan'], []).map((asignado) => asignado.tarea);
    expect(tareas.sort()).toEqual(['Escoba', 'Trapero', 'Trapito']);
  });

  it('si nadie llego tarde ni falto no hay aseo', () => {
    expect(sortearAseo([], [])).toEqual([]);
  });
});

describe('fechas', () => {
  it('formatoFecha queda como 2026-11-05', () => {
    expect(formatoFecha(new Date(2026, 10, 5))).toBe('2026-11-05');
  });

  it('fechaEnTexto queda como viernes 20 de noviembre', () => {
    expect(fechaEnTexto(new Date(2026, 10, 20))).toBe('viernes 20 de noviembre');
  });
});
