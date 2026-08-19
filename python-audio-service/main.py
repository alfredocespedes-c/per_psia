from fastapi import FastAPI, UploadFile, File, HTTPException
import tempfile, os, librosa, numpy as np
from datetime import datetime, timezone
app=FastAPI(title='PsiA Audio Engine',version='0.3.0')
@app.get('/health')
def health(): return {'ok':True,'service':'psia-python-audio'}
@app.post('/analyze')
async def analyze(audio: UploadFile=File(...)):
    ext=os.path.splitext(audio.filename or '.wav')[1] or '.wav'
    with tempfile.NamedTemporaryFile(suffix=ext,delete=False) as tmp: tmp.write(await audio.read()); path=tmp.name
    try:
        y,sr=librosa.load(path,sr=None,mono=True)
        if y.size<sr//4: raise HTTPException(400,'Audio demasiado corto')
        dur=float(librosa.get_duration(y=y,sr=sr)); rms=librosa.feature.rms(y=y)[0]
        zcr=librosa.feature.zero_crossing_rate(y)[0]; centroid=librosa.feature.spectral_centroid(y=y,sr=sr)[0]
        f0=librosa.yin(y,fmin=65,fmax=400,sr=sr); f0=f0[np.isfinite(f0)]
        db=librosa.amplitude_to_db(np.maximum(rms,1e-8),ref=np.max); silent=db<-35
        frame_sec=512/sr; silence_sec=float(np.sum(silent)*frame_sec)
        voiced=f0[(f0>=65)&(f0<=400)]
        mfcc=librosa.feature.mfcc(y=y,sr=sr,n_mfcc=13)
        return {'schema':'psia.audio.v1','analyzed_at':datetime.now(timezone.utc).isoformat(),'source':{'filename':audio.filename,'content_type':audio.content_type,'sample_rate_hz':sr,'duration_sec':round(dur,3)},'acoustic':{'rms_energy_mean':round(float(np.mean(rms)),6),'rms_energy_std':round(float(np.std(rms)),6),'pitch_hz_mean':round(float(np.mean(voiced)),2) if voiced.size else None,'pitch_hz_std':round(float(np.std(voiced)),2) if voiced.size else None,'zero_crossing_rate_mean':round(float(np.mean(zcr)),6),'spectral_centroid_hz_mean':round(float(np.mean(centroid)),2),'estimated_silence_sec':round(silence_sec,3),'estimated_silence_ratio':round(silence_sec/dur,4),'mfcc_mean':[round(float(v),4) for v in np.mean(mfcc,axis=1)]},'interpretation':{'status':'measurement_only','clinical_inference':False,'note':'Estas métricas describen la señal acústica; no constituyen diagnóstico ni estado psicológico.'},'transcription':{'status':'not_enabled','text':None,'engine':None}}
    finally:
        try: os.remove(path)
        except OSError: pass
