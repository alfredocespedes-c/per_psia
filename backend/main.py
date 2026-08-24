from datetime import datetime, timezone
import os
import tempfile

import av
import librosa
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

app = FastAPI(title="PsiA API", version="0.7.1")

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
MODEL_NAME = os.getenv("WHISPER_MODEL", "base")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
ANALYSIS_SAMPLE_RATE = 16000
_whisper_model = None


def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        _whisper_model = WhisperModel(MODEL_NAME, device="cpu", compute_type=COMPUTE_TYPE)
    return _whisper_model


@app.get("/")
def root():
    return {"ok": True, "service": "psia-api", "version": "0.7.1"}


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "psia-api",
        "version": "0.7.1",
        "transcription_enabled": True,
        "whisper_model": MODEL_NAME,
        "audio_normalization": "pyav_pcm_mono_16khz",
    }


def decode_audio_pcm(path: str):
    """Decode any browser/media format to normalized mono float PCM at 16 kHz."""
    try:
        container = av.open(path)
        audio_streams = [s for s in container.streams if s.type == "audio"]
        if not audio_streams:
            container.close()
            raise ValueError("El archivo no contiene una pista de audio")

        resampler = av.audio.resampler.AudioResampler(
            format="fltp",
            layout="mono",
            rate=ANALYSIS_SAMPLE_RATE,
        )
        chunks = []

        for frame in container.decode(audio=0):
            converted = resampler.resample(frame)
            if converted is None:
                continue
            frames = converted if isinstance(converted, list) else [converted]
            for out_frame in frames:
                arr = out_frame.to_ndarray()
                if arr.size:
                    chunks.append(np.asarray(arr, dtype=np.float32).reshape(-1))

        flushed = resampler.resample(None)
        if flushed is not None:
            frames = flushed if isinstance(flushed, list) else [flushed]
            for out_frame in frames:
                arr = out_frame.to_ndarray()
                if arr.size:
                    chunks.append(np.asarray(arr, dtype=np.float32).reshape(-1))

        container.close()
        if not chunks:
            raise ValueError("No fue posible obtener muestras de audio")

        y = np.concatenate(chunks).astype(np.float32, copy=False)
        y = np.nan_to_num(y, nan=0.0, posinf=0.0, neginf=0.0)
        return y, ANALYSIS_SAMPLE_RATE
    except Exception as exc:
        raise HTTPException(
            status_code=415,
            detail="No fue posible decodificar el audio. Prueba WAV, MP3, M4A, MP4, WebM u OGG.",
        ) from exc


def transcribe_audio(path: str):
    model = get_whisper_model()
    raw_segments, info = model.transcribe(
        path,
        language="es",
        vad_filter=True,
        beam_size=1,
    )
    segments = []
    for seg in raw_segments:
        text = seg.text.strip()
        if text:
            segments.append(
                {
                    "start": round(float(seg.start), 2),
                    "end": round(float(seg.end), 2),
                    "text": text,
                }
            )
    full_text = " ".join(s["text"] for s in segments).strip()
    return {
        "status": "completed",
        "text": full_text,
        "engine": "faster_whisper",
        "model": MODEL_NAME,
        "language": info.language,
        "language_probability": round(float(info.language_probability), 4),
        "segments": segments,
    }


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

        y, sr = decode_audio_pcm(path)

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

        try:
            transcription = transcribe_audio(path)
        except Exception as exc:
            transcription = {
                "status": "error",
                "text": None,
                "engine": "faster_whisper",
                "model": MODEL_NAME,
                "error": str(exc),
            }

        return {
            "schema": "psia.audio.v1",
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
            "source": {
                "filename": audio.filename,
                "content_type": audio.content_type,
                "sample_rate_hz": int(sr),
                "duration_sec": round(duration, 3),
                "size_bytes": len(raw),
                "normalized": True,
                "normalized_format": "pcm_f32_mono_16khz",
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
                "engine": "python_librosa_pyav",
                "python_used": True,
                "fallback": False,
                "deployment": "remote_api",
                "decoder": "pyav",
                "analysis_sample_rate_hz": ANALYSIS_SAMPLE_RATE,
            },
            "interpretation": {
                "status": "measurement_only",
                "clinical_inference": False,
                "note": "Estas métricas describen la señal acústica; no constituyen diagnóstico ni estado psicológico.",
            },
            "transcription": transcription,
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
