from datetime import datetime, timezone
import gc
import os
import resource
import tempfile
import time

import av
import librosa
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

app = FastAPI(title="PsiA Render Capacity Lab", version="2026.08.26.1-test")

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
MODEL_NAME = os.getenv("WHISPER_MODEL", "tiny")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
ANALYSIS_SAMPLE_RATE = 16000
_whisper_model = None


def rss_mb():
    """Approximate peak RSS on Linux/Render."""
    try:
        return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 2)
    except Exception:
        return None


def runtime_snapshot():
    return {
        "rss_peak_mb": rss_mb(),
        "whisper_loaded": _whisper_model is not None,
        "whisper_model": MODEL_NAME,
        "whisper_compute_type": COMPUTE_TYPE,
        "sample_rate_hz": ANALYSIS_SAMPLE_RATE,
    }


def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        _whisper_model = WhisperModel(MODEL_NAME, device="cpu", compute_type=COMPUTE_TYPE)
    return _whisper_model


@app.get("/")
def root():
    return {
        "ok": True,
        "service": "psia-render-capacity-lab",
        "version": "2026.08.26.1-test",
        "tests": [
            "/health",
            "/diagnostics",
            "/test/acoustic-minimal",
            "/test/acoustic-full",
            "/test/whisper-load",
            "/test/transcribe",
        ],
    }


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "psia-render-capacity-lab",
        "version": "2026.08.26.1-test",
        "note": "Health intentionally does not load Whisper.",
    }


@app.get("/diagnostics")
def diagnostics():
    return {
        "ok": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "runtime": runtime_snapshot(),
    }


def decode_audio_pcm(path: str):
    try:
        container = av.open(path)
        audio_streams = [s for s in container.streams if s.type == "audio"]
        if not audio_streams:
            container.close()
            raise ValueError("El archivo no contiene una pista de audio")

        resampler = av.audio.resampler.AudioResampler(
            format="fltp", layout="mono", rate=ANALYSIS_SAMPLE_RATE
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
        return np.nan_to_num(y, nan=0.0, posinf=0.0, neginf=0.0), ANALYSIS_SAMPLE_RATE
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=415, detail=f"No fue posible decodificar el audio: {exc}") from exc


async def save_upload(audio: UploadFile):
    raw = await audio.read()
    if not raw:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="El archivo supera el máximo de 30 MB")
    ext = os.path.splitext(audio.filename or "audio.wav")[1] or ".wav"
    tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    try:
        tmp.write(raw)
        tmp.close()
        return raw, tmp.name
    except Exception:
        tmp.close()
        try:
            os.remove(tmp.name)
        except OSError:
            pass
        raise


def minimal_acoustics(y, sr):
    duration = float(librosa.get_duration(y=y, sr=sr))
    rms = librosa.feature.rms(y=y)[0]
    db = librosa.amplitude_to_db(np.maximum(rms, 1e-8), ref=np.max)
    silent = db < -35
    silence_seconds = float(np.sum(silent) * (512 / sr))
    return {
        "duration_sec": round(duration, 3),
        "rms_energy_mean": round(float(np.mean(rms)), 6),
        "estimated_silence_sec": round(silence_seconds, 3),
        "estimated_silence_ratio": round(silence_seconds / duration, 4) if duration else 0,
    }


def full_acoustics(y, sr):
    base = minimal_acoustics(y, sr)
    rms = librosa.feature.rms(y=y)[0]
    zcr = librosa.feature.zero_crossing_rate(y)[0]
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    f0 = librosa.yin(y, fmin=65, fmax=400, sr=sr)
    voiced = f0[np.isfinite(f0) & (f0 >= 65) & (f0 <= 400)]
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    base.update({
        "rms_energy_std": round(float(np.std(rms)), 6),
        "pitch_hz_mean": round(float(np.mean(voiced)), 2) if voiced.size else None,
        "pitch_hz_std": round(float(np.std(voiced)), 2) if voiced.size else None,
        "zero_crossing_rate_mean": round(float(np.mean(zcr)), 6),
        "spectral_centroid_hz_mean": round(float(np.mean(centroid)), 2),
        "mfcc_mean": [round(float(v), 4) for v in np.mean(mfcc, axis=1)],
    })
    return base


def transcribe_audio(path: str):
    model = get_whisper_model()
    raw_segments, info = model.transcribe(path, language="es", vad_filter=True, beam_size=1)
    segments = []
    for seg in raw_segments:
        text = seg.text.strip()
        if text:
            segments.append({"start": round(float(seg.start), 2), "end": round(float(seg.end), 2), "text": text})
    return {
        "status": "completed",
        "text": " ".join(s["text"] for s in segments).strip(),
        "engine": "faster_whisper",
        "model": MODEL_NAME,
        "language": info.language,
        "segments": segments,
    }


@app.post("/test/acoustic-minimal")
async def test_acoustic_minimal(audio: UploadFile = File(...)):
    raw, path = await save_upload(audio)
    before = rss_mb()
    started = time.perf_counter()
    try:
        y, sr = decode_audio_pcm(path)
        metrics = minimal_acoustics(y, sr)
        return {
            "ok": True,
            "test": "acoustic-minimal",
            "file_bytes": len(raw),
            "processing_sec": round(time.perf_counter() - started, 3),
            "memory_before_mb": before,
            "memory_after_mb": rss_mb(),
            "metrics": metrics,
        }
    finally:
        try: os.remove(path)
        except OSError: pass
        gc.collect()


@app.post("/test/acoustic-full")
async def test_acoustic_full(audio: UploadFile = File(...)):
    raw, path = await save_upload(audio)
    before = rss_mb()
    started = time.perf_counter()
    try:
        y, sr = decode_audio_pcm(path)
        metrics = full_acoustics(y, sr)
        return {
            "ok": True,
            "test": "acoustic-full",
            "file_bytes": len(raw),
            "processing_sec": round(time.perf_counter() - started, 3),
            "memory_before_mb": before,
            "memory_after_mb": rss_mb(),
            "metrics": metrics,
        }
    finally:
        try: os.remove(path)
        except OSError: pass
        gc.collect()


@app.post("/test/whisper-load")
def test_whisper_load():
    before = rss_mb()
    started = time.perf_counter()
    try:
        get_whisper_model()
        return {
            "ok": True,
            "test": "whisper-load",
            "processing_sec": round(time.perf_counter() - started, 3),
            "memory_before_mb": before,
            "memory_after_mb": rss_mb(),
            "runtime": runtime_snapshot(),
        }
    except Exception as exc:
        return {
            "ok": False,
            "test": "whisper-load",
            "error": f"{type(exc).__name__}: {exc}",
            "processing_sec": round(time.perf_counter() - started, 3),
            "memory_before_mb": before,
            "memory_after_mb": rss_mb(),
        }


@app.post("/test/transcribe")
async def test_transcribe(audio: UploadFile = File(...)):
    raw, path = await save_upload(audio)
    before = rss_mb()
    started = time.perf_counter()
    try:
        transcription = transcribe_audio(path)
        return {
            "ok": True,
            "test": "transcribe",
            "file_bytes": len(raw),
            "processing_sec": round(time.perf_counter() - started, 3),
            "memory_before_mb": before,
            "memory_after_mb": rss_mb(),
            "transcription": transcription,
        }
    except Exception as exc:
        return {
            "ok": False,
            "test": "transcribe",
            "file_bytes": len(raw),
            "error": f"{type(exc).__name__}: {exc}",
            "processing_sec": round(time.perf_counter() - started, 3),
            "memory_before_mb": before,
            "memory_after_mb": rss_mb(),
        }
    finally:
        try: os.remove(path)
        except OSError: pass
        gc.collect()


async def _analyze(audio: UploadFile):
    raw, path = await save_upload(audio)
    try:
        y, sr = decode_audio_pcm(path)
        metrics = full_acoustics(y, sr)
        try:
            transcription = transcribe_audio(path)
        except Exception as exc:
            transcription = {"status": "error", "text": None, "engine": "faster_whisper", "model": MODEL_NAME, "error": str(exc)}
        return {
            "schema": "psia.audio.v1",
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
            "source": {
                "filename": audio.filename,
                "content_type": audio.content_type,
                "sample_rate_hz": int(sr),
                "duration_sec": metrics["duration_sec"],
                "size_bytes": len(raw),
            },
            "acoustic": metrics,
            "processing": {"engine": "python_librosa_pyav", "python_used": True, "fallback": False, "deployment": "render-capacity-test"},
            "interpretation": {"status": "measurement_only", "clinical_inference": False},
            "transcription": transcription,
        }
    finally:
        try: os.remove(path)
        except OSError: pass


@app.post("/analyze")
async def analyze(audio: UploadFile = File(...)):
    return await _analyze(audio)


@app.post("/api/audio/analyze")
async def analyze_compat(audio: UploadFile = File(...)):
    return await _analyze(audio)
