import * as dotenv from 'dotenv';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { revisarSesion } from './sesion';

dotenv.config({ path: '../.env' });

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // va antes de la pagina y de la api para que sin login no se pueda ver nada
  app.use(revisarSesion);
  app.useStaticAssets(path.join(process.cwd(), 'public'));
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
