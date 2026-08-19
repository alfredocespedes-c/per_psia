# PsiA MVP v0.3.1

## Corrección GitHub Pages / Failed to fetch

Esta versión usa un modo híbrido. Intenta `Node/Express -> Python/librosa` en `http://localhost:3001`. Si el backend local no está accesible (caso normal al abrir GitHub Pages sin servicios locales), el frontend cambia automáticamente a un analizador basado en Web Audio API. El JSON exportado incluye `processing.engine`, `python_used` y `fallback` para dejar trazabilidad del motor utilizado.

Para obtener el conjunto completo de métricas (MFCC, centroide espectral y cálculo de pitch/variabilidad con librosa), iniciar Node y Python localmente. El modo navegador es una demostración funcional y no reemplaza el motor Python.

---

# PsiA MVP v0.3.0

Prototipo funcional para analizar audio sin servicios LLM externos.

## Arquitectura
- Frontend: React + Vite. Desplegable en GitHub Pages.
- API: Node.js + Express. Recibe el audio y lo deriva al motor Python.
- Audio Engine: Python + FastAPI + librosa.
- Persistencia actual: localStorage del navegador.
- Exportación: JSON descargable desde el frontend.
- Base de datos: no incluida todavía.

## Ejecutar localmente
### 1. Python
```bash
cd python-audio-service
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
### 2. Node
```bash
cd backend
npm install
npm run dev
```
### 3. React
```bash
cd frontend
npm install
npm run dev
```
Abra la URL indicada por Vite. Pulse **Probar audio base**.

## Flujo
`audio -> Node/Express -> Python/librosa -> JSON -> localStorage -> Exportar JSON`

El audio temporal se elimina después del análisis tanto en Node como en Python. La transcripción aparece como `not_enabled`; se reserva para una versión posterior con un motor local tipo faster-whisper.

## Datos acústicos v1
Duración, sample rate, energía RMS, pitch estimado y su variabilidad, zero crossing rate, centroide espectral, silencio estimado, ratio de silencio y vector MFCC medio.

## Alcance clínico
Esta versión solo realiza medición acústica. No diagnostica ni infiere automáticamente estados psicológicos.
