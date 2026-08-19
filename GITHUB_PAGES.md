# Despliegue de PsiA en GitHub Pages

## Arquitectura de publicación

- `frontend/`: React + Vite; se compila y publica en GitHub Pages.
- `backend/`: Node/Express; no se ejecuta en GitHub Pages.
- `.github/workflows/deploy-pages.yml`: build y despliegue automático con GitHub Actions.

## Primera publicación

1. Crea un repositorio en GitHub.
2. Sube el contenido de esta carpeta a la raíz del repositorio.
3. Asegúrate de usar `main` como rama principal.
4. En GitHub abre **Settings → Pages**.
5. En **Build and deployment → Source** selecciona **GitHub Actions**.
6. Haz push a `main` o ejecuta manualmente el workflow desde **Actions**.

La URL normalmente será:

```text
https://USUARIO.github.io/NOMBRE-REPOSITORIO/
```

## Configuración automática de Vite

`frontend/vite.config.js` obtiene el nombre del repositorio desde `GITHUB_REPOSITORY` durante GitHub Actions y usa automáticamente `/<repo>/` como `base`. En desarrollo local utiliza `/`.

## Backend

GitHub Pages aloja únicamente el frontend estático. El backend Node/Express se conserva como parte de la arquitectura de PsiA para APIs, análisis y persistencia futura, pero deberá ejecutarse en un servicio separado cuando se conecten funciones reales.
