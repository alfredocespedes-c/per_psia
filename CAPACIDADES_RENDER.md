# PsiA — Test de capacidades Render

Rama: `test-capacidades-render`

Objetivo: medir de forma incremental qué parte del pipeline PsiA soporta Render Free antes de optimizar audios o cambiar la arquitectura.

## Secuencia de pruebas

1. `GET /health` — FastAPI solamente. No carga Whisper.
2. `GET /diagnostics` — memoria del proceso y configuración del runtime.
3. `POST /test/acoustic-minimal` — decodifica a PCM mono 16 kHz y calcula duración, RMS y silencio. No usa Whisper.
4. `POST /test/acoustic-full` — ejecuta librosa con pitch, ZCR, centroide y MFCC. No usa Whisper.
5. `POST /test/whisper-load` — intenta cargar el modelo Whisper configurado, sin transcribir audio.
6. `POST /test/transcribe` — transcribe un audio y reporta tiempo y memoria.

## Matriz de prueba sugerida

Usar el mismo hablante y formato cuando sea posible:

- 10 segundos
- 30 segundos
- 60 segundos
- 180 segundos
- 300 segundos

Registrar para cada prueba:

- tamaño del archivo en bytes
- duración del audio
- tiempo de procesamiento
- memoria RSS aproximada del proceso
- éxito/error
- modelo Whisper utilizado

## Criterio de decisión

Si `acoustic-full` funciona de forma estable pero `whisper-load` falla por memoria o reinicia el servicio, Render se usará para análisis acústico y Whisper se separará del servicio.

Si Whisper carga pero la transcripción falla al aumentar duración, probaremos procesamiento por fragmentos.

Esta rama es experimental y no debe fusionarse a `main` ni `render` hasta finalizar las mediciones.
