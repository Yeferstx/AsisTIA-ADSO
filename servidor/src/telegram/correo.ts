import * as nodemailer from 'nodemailer';

// manda un correo al instructor con un archivo adjunto, usando brevo
export async function enviarCorreo(asunto: string, texto: string, rutaArchivo: string) {
  const transporte = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    auth: {
      user: process.env.CORREO_USUARIO,
      pass: process.env.CORREO_CLAVE,
    },
  });

  await transporte.sendMail({
    from: `AsistIA SENA <${process.env.CORREO_REMITENTE}>`,
    to: process.env.CORREO_INSTRUCTOR,
    subject: asunto,
    text: texto,
    attachments: [{ path: rutaArchivo }],
  });
}
