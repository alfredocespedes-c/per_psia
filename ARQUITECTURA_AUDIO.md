# Arquitectura Audio PsiA v0.3.0

1. React captura o selecciona audio.
2. Node/Express recibe multipart y crea un archivo temporal.
3. Node lo reenvía al servicio Python.
4. Python/librosa normaliza a mono y extrae métricas.
5. Python elimina su temporal y devuelve JSON.
6. Node elimina su temporal y devuelve el JSON al frontend.
7. React añade ID/fecha de guardado y persiste el análisis en localStorage.
8. Exportar JSON genera un único archivo con todos los análisis del navegador.

### Próximos módulos previstos
- Transcripción local (faster-whisper).
- openSMILE/eGeMAPS.
- Línea base individual y comparación longitudinal.
- PostgreSQL cuando validemos el modelo de datos.
