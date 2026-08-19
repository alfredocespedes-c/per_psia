# PsiA — MVP visual v0.1.0

Maqueta funcional inicial de un sistema de acompañamiento psicológico longitudinal.

## Arquitectura
- Frontend: React + Vite
- Backend: Node.js + Express
- Datos en esta maqueta: mock/in-memory
- Evolución prevista: PostgreSQL para perfiles longitudinales, evidencias y trazabilidad; almacenamiento de audio separado; servicios desacoplados para transcripción, análisis acústico y motor de evidencia.

## Pantallas incluidas
1. Resumen de estado longitudinal
2. Registro de audio / nota
3. Historial de evidencia
4. Vista profesional

## Principio de producto
PsiA muestra señales, tendencias, evidencia y nivel de confianza. No presenta hipótesis automáticas como diagnósticos clínicos.

## Ejecutar frontend
```bash
cd frontend
npm install
npm run dev
```

## Ejecutar backend
```bash
cd backend
npm install
npm run dev
```

Backend por defecto: http://localhost:3001

## Próxima arquitectura sugerida

Audio / Nota
  -> Ingesta
  -> Transcripción
  -> Extracción acústica / NLP
  -> Motor de evidencia
  -> Perfil longitudinal
  -> Reglas de escalamiento
  -> UI persona / UI profesional

La maqueta no realiza todavía inferencias clínicas reales: los datos son demostrativos para validar UX, estructura y lógica de producto antes de integrar modelos.
