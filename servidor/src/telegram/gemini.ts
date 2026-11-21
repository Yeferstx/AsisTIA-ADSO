import { leerHorario } from './asistencia';

// si el primero falla se prueba con el siguiente
const MODELOS = ['gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

export interface Analisis {
  resumen: string;
  sugerencia: string;
  razon: string;
  motivo?: string; // el motivo del permiso bien redactado
}

export async function analizarExcusa(nombre: string, texto: string) {
  const instruccion =
    'Eres el asistente de un instructor del SENA. Un aprendiz falto a clase y mando esta excusa.\n' +
    'Haz un resumen corto (maximo 20 palabras) y sugiere si la excusa es VALIDA o NO VALIDA.\n' +
    'Son validas: salud, citas medicas, calamidad familiar, problemas graves de transporte o tramites obligatorios.\n' +
    'No son validas: quedarse dormido, pereza, planes personales o excusas sin explicacion.\n' +
    'Responde solo con este JSON: {"resumen": "...", "sugerencia": "VALIDA" o "NO VALIDA", "razon": "..."}\n\n' +
    `Aprendiz: ${nombre}\nExcusa: ${texto}`;
  return preguntarGemini(instruccion);
}

export async function analizarPermiso(nombre: string, motivo: string, horaSalida: string) {
  const horario = leerHorario();
  const instruccion =
    `Eres el asistente de un instructor del SENA. La clase es de ${horario.inicio} a ${horario.salida}.\n` +
    'Un aprendiz pide permiso para salir antes de que termine la clase.\n' +
    'Haz un resumen corto (maximo 20 palabras) y sugiere si el instructor deberia ACEPTAR o RECHAZAR el permiso.\n' +
    'Se aceptan: citas medicas, salud, calamidad familiar, tramites obligatorios o trabajo con soporte.\n' +
    'Se rechazan: planes personales, cansancio, motivos sin explicacion o si sale demasiado temprano sin una razon fuerte.\n' +
    'Ademas redacta el motivo de forma clara, formal y completa (2 o 3 oraciones, en tercera persona), ' +
    'corrigiendo la ortografia. No inventes datos que el aprendiz no dijo.\n' +
    'Responde solo con este JSON: {"resumen": "...", "sugerencia": "ACEPTAR" o "RECHAZAR", "razon": "...", "motivo": "..."}\n\n' +
    `Aprendiz: ${nombre}\nHora de salida: ${horaSalida}\nMotivo: ${motivo}`;
  return preguntarGemini(instruccion);
}

// el instructor pregunta desde la pagina, se le pasan los datos de asistencia
export async function responderPregunta(pregunta: string, datos: string) {
  const instruccion =
    'Eres AsistIA, el asistente de un instructor del SENA. Responde en espanol, corto y claro, ' +
    'usando solo los datos de asistencia que te doy. Si la respuesta no esta en los datos, dilo.\n' +
    'Responde solo con este JSON: {"respuesta": "..."}\n\n' +
    `Datos:\n${datos}\n\nPregunta del instructor: ${pregunta}`;
  const resultado: any = await preguntarGemini(instruccion);
  return resultado.respuesta || 'No pude responder en este momento, intenta de nuevo.';
}

async function preguntarGemini(instruccion: string) {
  for (const modelo of MODELOS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY || '',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: instruccion }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(20000),
      });
      const datos = await respuesta.json();
      if (respuesta.ok) {
        const textoGemini = datos.candidates[0].content.parts[0].text;
        const analisis: Analisis = JSON.parse(textoGemini);
        return analisis;
      }
      if (datos.error) {
        console.log(`Error de Gemini (${modelo}):`, datos.error.message);
      } else {
        console.log(`Error de Gemini (${modelo}):`, respuesta.status);
      }
    } catch (error) {
      console.log(`No se pudo usar Gemini con ${modelo}:`, error.message);
    }
  }
  return sinAnalisis();
}

function sinAnalisis(): Analisis {
  return { resumen: 'No se pudo generar el resumen', sugerencia: 'SIN_SUGERENCIA', razon: '' };
}
