from datetime import datetime, timezone
import os
import tempfile

import librosa
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="PsiA API", version="0.6.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://alfredocespedes-c.github.io",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

MAX_FILE_BYTES = 30 * 1024 * 1024


@app.get("/")
def root():
    return {"ok": True, "service": "psia-api", "version": "0.6.0"}


@app.get("/health")
def health():
    return {"ok": True, "service": "psia-api", "version": "0.6.0"}


async def _analyze(audio: UploadFile):
    raw = await audio.read()
    if not raw:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="El archivo supera el máximo de 30 MB")

    ext = os.path.splitext(audio.filename or "audio.wav")[1] or ".wav"
    path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(raw)
            path = tmp.name

        try:
            y, sr = librosa.load(path, sr=None, mono=True)
        except Exception as exc:
            raise HTTPException(
                status_code=415,
                detail="No fue posible decodificar el audio. Prueba WAV, MP3, M4A u OGG.",
            ) from exc

        if y.size < max(1, sr // 4):
            raise HTTPException(status_code=400, detail="Audio demasiado corto")

        duration = float(librosa.get_duration(y=y, sr=sr))
        rms = librosa.feature.rms(y=y)[0]
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        f0 = librosa.yin(y, fmin=65, fmax=400, sr=sr)
        voiced = f0[np.isfinite(f0) & (f0 >= 65) & (f0 <= 400)]

        db = librosa.amplitude_to_db(np.maximum(rms, 1e-8), ref=np.max)
        silent = db < -35
        frame_seconds = 512 / sr
        silence_seconds = float(np.sum(silent) * frame_seconds)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)

        return {
            "schema": "psia.audio.v1",
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
            "source": {
                "filename": audio.filename,
                "content_type": audio.content_type,
                "sample_rate_hz": int(sr),
                "duration_sec": round(duration, 3),
                "size_bytes": len(raw),
            },
            "acoustic": {
                "rms_energy_mean": round(float(np.mean(rms)), 6),
                "rms_energy_std": round(float(np.std(rms)), 6),
                "pitch_hz_mean": round(float(np.mean(voiced)), 2) if voiced.size else None,
                "pitch_hz_std": round(float(np.std(voiced)), 2) if voiced.size else None,
                "zero_crossing_rate_mean": round(float(np.mean(zcr)), 6),
                "spectral_centroid_hz_mean": round(float(np.mean(centroid)), 2),
                "estimated_silence_sec": round(silence_seconds, 3),
                "estimated_silence_ratio": round(silence_seconds / duration, 4) if duration else 0,
                "mfcc_mean": [round(float(v), 4) for v in np.mean(mfcc, axis=1)],
            },
            "processing": {
                "engine": "python_librosa",
                "python_used": True,
                "fallback": False,
                "deployment": "remote_api",
            },
            "interpretation": {
                "status": "measurement_only",
                "clinical_inference": False,
                "note": "Estas métricas describen la señal acústica; no constituyen diagnóstico ni estado psicológico.",
            },
            "transcription": {"status": "not_enabled", "text": None, "engine": None},
        }
    finally:
        if path:
            try:
                os.remove(path)
            except OSError:
                pass


@app.post("/analyze")
async def analyze(audio: UploadFile = File(...)):
    return await _analyze(audio)


@app.post("/api/audio/analyze")
async def analyze_compat(audio: UploadFile = File(...)):
    return await _analyze(audio)
