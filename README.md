# PsiA MVP v0.2.0

Maqueta conceptual de PsiA.

## Arquitectura

- Frontend: React + Vite
- Backend: Node.js + Express
- Publicación frontend: GitHub Pages
- CI/CD: GitHub Actions
- Datos actuales: simulados

## Módulos

- Estado actual
- Nuevo registro de audio/notas
- Historial de evidencias
- Vista profesional

## Desarrollo local

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
npm install
npm start
```

## GitHub Pages

`.github/workflows/deploy-pages.yml` publica el frontend automáticamente en cada push a `main`.

Consulta `GITHUB_PAGES.md` para la primera configuración.

## Nota clínica

Esta versión es una maqueta conceptual. No realiza diagnóstico ni inferencia psicológica clínica real. Las señales y valores son demostrativos.

## Versionado

- v0.1.0 — maqueta conceptual inicial React + Node/Express.
- v0.2.0 — GitHub Pages + GitHub Actions incorporados a la arquitectura.
