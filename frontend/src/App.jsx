import React,{useEffect,useRef,useState} from 'react';
import {BrainCircuit,Upload,Download,Trash2,Play,Activity,ShieldAlert,Mic,Square,ChevronDown} from 'lucide-react';

const API=(import.meta.env.VITE_API_URL||'https://per-psia-api.onrender.com').replace(/\/$/,'');
const CHUNK_MS=8000;
const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
const mean=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;
const fmt=n=>n==null?'—':typeof n==='number'?n.toLocaleString('es-CL',{maximumFractionDigits:2}):n;

function buildVoiceMoodIndicator(current,history=[]){
 const previous=history.filter(r=>r?.acoustic).slice(0,5);
 if(previous.length<2){
  return {
   schema:'psia.voice_change.v1',
   status:'building_baseline',
   level:'baseline',
   score:null,
   label:'Construyendo línea base',
   summary:`Se necesitan al menos 2 registros previos comparables. Hay ${previous.length}.`,
   baseline_count:previous.length,
   clinical_inference:false
  };
 }
 const metric=(key)=>mean(previous.map(r=>r.acoustic?.[key]).filter(v=>typeof v==='number'&&Number.isFinite(v)));
 const energyBase=metric('rms_energy_mean');
 const variabilityBase=metric('pitch_hz_std');
 const silenceBase=metric('estimated_silence_ratio');
 const energyNow=current.acoustic?.rms_energy_mean;
 const variabilityNow=current.acoustic?.pitch_hz_std;
 const silenceNow=current.acoustic?.estimated_silence_ratio;
 const relative=(base,now,mode)=>{
  if(!(typeof base==='number'&&base>0&&typeof now==='number'))return 0;
  return mode==='rise'?(now-base)/base:(base-now)/base;
 };
 const energyDrop=Math.max(0,relative(energyBase,energyNow,'drop'));
 const variabilityDrop=Math.max(0,relative(variabilityBase,variabilityNow,'drop'));
 const silenceRise=Math.max(0,relative(silenceBase,silenceNow,'rise'));
 const score=Math.round(100*(
  .40*clamp(energyDrop/.30)+
  .35*clamp(variabilityDrop/.35)+
  .25*clamp(silenceRise/.50)
 ));
 let level='green',label='Sin cambio relevante';
 if(score>=75){level='red';label='Cambio vocal marcado'}
 else if(score>=50){level='orange';label='Cambio vocal moderado'}
 else if(score>=25){level='yellow';label='Cambio vocal leve'}
 const signals=[];
 if(energyDrop>=.12)signals.push(`energía vocal ${Math.round(energyDrop*100)}% menor`);
 if(variabilityDrop>=.12)signals.push(`variación tonal ${Math.round(variabilityDrop*100)}% menor`);
 if(silenceRise>=.18)signals.push(`silencios ${Math.round(silenceRise*100)}% mayores`);
 return {
  schema:'psia.voice_change.v1',status:'available',level,score,label,
  summary:signals.length?`Respecto a su propia línea base: ${signals.join(', ')}.`:'Las métricas principales se mantienen cerca de la línea base reciente.',
  baseline_count:previous.length,
  metrics:{
   energy:{baseline:energyBase,current:energyNow,change_pct:Math.round((energyNow-energyBase)/energyBase*100)},
   pitch_variability:{baseline:variabilityBase,current:variabilityNow,change_pct:Math.round((variabilityNow-variabilityBase)/variabilityBase*100)},
   silence_ratio:{baseline:silenceBase,current:silenceNow,change_pct:Math.round((silenceNow-silenceBase)/silenceBase*100)}
  },
  clinical_inference:false,
  note:'Indicador experimental de cambio vocal. No mide tristeza, depresión ni constituye diagnóstico.'
 };
}

function Indicator({indicator}){
 const i=indicator||buildVoiceMoodIndicator({},[]);
 return <section className="moodCard">
  <div className="moodCopy">
   <p className="eyebrow">CAMBIO VOCAL RESPECTO A LÍNEA BASE</p>
   <h2>{i.label}</h2>
   <p>{i.summary}</p>
   <div className="trafficLight" aria-label="Semáforo de cambio vocal">
    {['green','yellow','orange','red'].map(level=><span key={level} className={`${level} ${i.level===level?'active':''}`}/>) }
   </div>
   <small>Enfocado en cambios de voz que pueden acompañar variaciones del ánimo. No es una medición directa del estado emocional.</small>
  </div>
  <div className={`scoreBubble ${i.level}`}>
   <strong>{i.score==null?'—':i.score}</strong>
   <span>{i.score==null?'línea base':'cambio / 100'}</span>
  </div>
 </section>
}

export default function App(){
 const [records,setRecords]=useState(()=>{try{return JSON.parse(localStorage.getItem('psia_audio_records')||'[]')}catch{return[]}});
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[apiStatus,setApiStatus]=useState('warming');
 const [live,setLive]=useState(false),[liveSeconds,setLiveSeconds]=useState(0),[liveTranscript,setLiveTranscript]=useState(''),[liveChunks,setLiveChunks]=useState(0);
 const input=useRef(),liveRef=useRef(false),streamRef=useRef(null),recorderRef=useRef(null),chunkTimerRef=useRef(null),sessionTimerRef=useRef(null),sessionStartedRef=useRef(null),queueRef=useRef(Promise.resolve()),liveResultsRef=useRef([]),chunkIndexRef=useRef(0);

 useEffect(()=>localStorage.setItem('psia_audio_records',JSON.stringify(records)),[records]);
 useEffect(()=>{let cancelled=false;(async()=>{try{const r=await fetch(`${API}/health`,{cache:'no-store'});if(!r.ok)throw new Error();if(!cancelled){setApiStatus('ready');setMsg('Motor de análisis listo.')}}catch{if(!cancelled){setApiStatus('slow');setMsg('El motor puede estar iniciándose.')}}})();return()=>{cancelled=true;cleanupLive()}},[]);

 function cleanupLive(){liveRef.current=false;if(chunkTimerRef.current)clearTimeout(chunkTimerRef.current);if(sessionTimerRef.current)clearInterval(sessionTimerRef.current);try{if(recorderRef.current?.state==='recording')recorderRef.current.stop()}catch{}streamRef.current?.getTracks()?.forEach(t=>t.stop());streamRef.current=null}
 async function ensureApiReady(){try{const r=await fetch(`${API}/health`,{cache:'no-store'});if(!r.ok)throw new Error();setApiStatus('ready');return true}catch{setApiStatus('slow');return false}}
 async function sendAudio(file,timeoutMs=300000){const fd=new FormData();fd.append('audio',file);const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),timeoutMs);try{const r=await fetch(`${API}/api/audio/analyze`,{method:'POST',body:fd,signal:controller.signal});if(!r.ok){const x=await r.json().catch(()=>({}));throw new Error(x.detail||x.error||`HTTP ${r.status}`)}return await r.json()}finally{clearTimeout(timeout)}}

 async function analyzeFile(file){if(!file)return;setBusy(true);try{await ensureApiReady();setMsg('Analizando voz y transcripción…');const j=await sendAudio(file);const indicator=buildVoiceMoodIndicator(j,records);const rec={id:crypto.randomUUID(),saved_at:new Date().toISOString(),...j,voice_mood_indicator:indicator};setRecords(x=>[rec,...x]);setMsg('Análisis completado y comparado con la línea base disponible.')}catch(e){setMsg(`Error de procesamiento: ${e?.message||e}`)}finally{setBusy(false);if(input.current)input.current.value=''}}

 function supportedMime(){const types=['audio/mp4','audio/webm;codecs=opus','audio/webm'];return types.find(t=>window.MediaRecorder?.isTypeSupported?.(t))||''}
 function extForMime(mime){return mime.includes('mp4')?'m4a':mime.includes('webm')?'webm':'audio'}
 function startSegment(){if(!liveRef.current||!streamRef.current)return;const mime=supportedMime(),chunks=[];let recorder;try{recorder=new MediaRecorder(streamRef.current,mime?{mimeType:mime}:undefined)}catch(e){setMsg(`No fue posible iniciar el micrófono: ${e.message}`);stopLive();return}recorderRef.current=recorder;recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};recorder.onstop=()=>{if(chunkTimerRef.current)clearTimeout(chunkTimerRef.current);const blob=new Blob(chunks,{type:recorder.mimeType||mime||'audio/webm'});const idx=++chunkIndexRef.current;if(blob.size>0)queueRef.current=queueRef.current.then(()=>processLiveChunk(blob,idx)).catch(e=>setMsg(`Error: ${e.message}`));if(liveRef.current)startSegment();else queueRef.current.then(()=>finalizeLiveSession())};recorder.start();chunkTimerRef.current=setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},CHUNK_MS)}
 async function processLiveChunk(blob,index){setMsg(`Sesión en vivo · procesando segmento ${index}…`);const mime=blob.type||'audio/webm';const j=await sendAudio(new File([blob],`sesion_chunk_${index}.${extForMime(mime)}`,{type:mime}),180000);liveResultsRef.current.push(j);setLiveChunks(liveResultsRef.current.length);const text=j.transcription?.text?.trim();if(text)setLiveTranscript(prev=>(prev?`${prev} ${text}`:text))}
 function aggregateSession(parts){const valid=parts.filter(Boolean);if(!valid.length)return null;const total=valid.reduce((s,p)=>s+(Number(p.source?.duration_sec)||0),0);const weighted=key=>{let n=0,d=0;for(const p of valid){const v=p.acoustic?.[key],w=Number(p.source?.duration_sec)||0;if(typeof v==='number'&&w>0){n+=v*w;d+=w}}return d?n/d:null};const silence=valid.reduce((s,p)=>s+(Number(p.acoustic?.estimated_silence_sec)||0),0);const text=valid.map(p=>p.transcription?.text?.trim()).filter(Boolean).join(' ');return {schema:'psia.audio.session.v1',analyzed_at:new Date().toISOString(),source:{filename:`sesion_en_vivo_${new Date().toISOString()}`,content_type:'audio/live',duration_sec:Number(total.toFixed(3)),chunk_count:valid.length},acoustic:{rms_energy_mean:weighted('rms_energy_mean'),rms_energy_std:weighted('rms_energy_std'),pitch_hz_mean:weighted('pitch_hz_mean'),pitch_hz_std:weighted('pitch_hz_std'),zero_crossing_rate_mean:weighted('zero_crossing_rate_mean'),spectral_centroid_hz_mean:weighted('spectral_centroid_hz_mean'),estimated_silence_sec:Number(silence.toFixed(3)),estimated_silence_ratio:total?silence/total:0},processing:{engine:'python_librosa_chunked',python_used:true,fallback:false,mode:'live_session'},interpretation:{status:'measurement_only',clinical_inference:false},transcription:{status:text?'completed':'empty',text:text||null,engine:'faster_whisper_chunked'}}}
 async function startLive(){if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){setMsg('Este navegador no permite grabación en vivo.');return}setBusy(true);await ensureApiReady();try{streamRef.current=await navigator.mediaDevices.getUserMedia({audio:true});liveResultsRef.current=[];chunkIndexRef.current=0;queueRef.current=Promise.resolve();sessionStartedRef.current=Date.now();setLiveSeconds(0);setLiveChunks(0);setLiveTranscript('');liveRef.current=true;setLive(true);setBusy(false);setMsg('Sesión en vivo iniciada.');sessionTimerRef.current=setInterval(()=>setLiveSeconds(Math.floor((Date.now()-sessionStartedRef.current)/1000)),1000);startSegment()}catch(e){setBusy(false);setMsg(`No fue posible acceder al micrófono: ${e.message}`)}}
 function stopLive(){if(!liveRef.current)return;liveRef.current=false;setLive(false);setBusy(true);setMsg('Finalizando sesión…');if(sessionTimerRef.current)clearInterval(sessionTimerRef.current);if(chunkTimerRef.current)clearTimeout(chunkTimerRef.current);try{if(recorderRef.current?.state==='recording')recorderRef.current.stop();else queueRef.current.then(()=>finalizeLiveSession())}catch{queueRef.current.then(()=>finalizeLiveSession())}}
 function finalizeLiveSession(){streamRef.current?.getTracks()?.forEach(t=>t.stop());streamRef.current=null;const j=aggregateSession(liveResultsRef.current);if(j){const indicator=buildVoiceMoodIndicator(j,records);const rec={id:crypto.randomUUID(),saved_at:new Date().toISOString(),...j,voice_mood_indicator:indicator};setRecords(x=>[rec,...x]);setMsg('Sesión finalizada y comparada con la línea base.')}else setMsg('No fue posible procesar la sesión.');setBusy(false)}
 async function sample(){setBusy(true);try{const r=await fetch(`${import.meta.env.BASE_URL}audio/audio_base.wav`);const b=await r.blob();setBusy(false);await analyzeFile(new File([b],'audio_base.wav',{type:'audio/wav'}))}catch(e){setMsg(`Error: ${e.message}`);setBusy(false)}}
 function exportJson(){const payload={schema:'psia.export.v1',exported_at:new Date().toISOString(),record_count:records.length,records};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`psia_export_${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url)}
 function clear(){if(confirm('¿Eliminar los análisis guardados en este navegador?'))setRecords([])}

 const last=records[0],indicator=last?.voice_mood_indicator||buildVoiceMoodIndicator(last||{},records.slice(1));
 const statusLabel=apiStatus==='ready'?'Motor listo':apiStatus==='warming'?'Preparando motor':'Motor iniciándose';
 const mm=String(Math.floor(liveSeconds/60)).padStart(2,'0'),ss=String(liveSeconds%60).padStart(2,'0');
 return <div className="appShell"><aside className="sidebar"><div className="brand"><div className="brandMark"><BrainCircuit size={24}/></div><div><b>PsiA</b><small>2026.08.26.1 · Render</small></div></div><nav><button className="active"><Activity size={18}/> Estado vocal</button></nav><div className="privacy"><ShieldAlert size={18}/><div><b>Apoyo, no diagnóstico</b><span>El semáforo representa cambio vocal respecto de una línea base personal; no diagnostica ánimo ni trastornos.</span></div></div></aside><main><header><div><p className="eyebrow">PSIA · PERFIL LONGITUDINAL</p><h1>Estado vocal</h1><p className="sub">Una lectura simple del cambio de la voz respecto de su patrón habitual.</p></div><button className="profile" onClick={exportJson} disabled={!records.length}><Download size={17}/> Exportar JSON</button></header>
 <Indicator indicator={indicator}/>
 <section className="heroCard"><div><span className="statusPill">{live?'Sesión en vivo':statusLabel}</span><h2>{live?`Escuchando · ${mm}:${ss}`:'Genera una nueva medición'}</h2><p>{live?'La sesión se analiza en segmentos cortos mientras hablas.':'Puedes analizar un audio existente o iniciar una sesión en vivo. PsiA conserva las métricas técnicas por detrás y muestra arriba una lectura resumida.'}</p><div className="heroActions"><button onClick={sample} disabled={busy||live}><Play size={17}/> Audio base</button><button className="secondary" onClick={()=>input.current.click()} disabled={busy||live}><Upload size={17}/> Subir audio</button>{live?<button onClick={stopLive}><Square size={17}/> Finalizar</button>:<button onClick={startLive} disabled={busy}><Mic size={17}/> Sesión en vivo</button>}<input ref={input} hidden type="file" accept="audio/*,.wav,.mp3,.m4a,.mp4,.ogg,.flac" onChange={e=>analyzeFile(e.target.files?.[0])}/></div>{live&&<div className="liveTranscript"><b>Transcripción en vivo</b><p>{liveTranscript||'Esperando el primer segmento…'}</p><small>Segmentos procesados: {liveChunks}</small></div>}{msg&&<p className="runMessage">{msg}</p>}</div></section>
 {last&&<div className="grid2"><section className="panel"><div className="panelTitle"><div><p className="eyebrow">ÚLTIMO REGISTRO</p><h3>Qué observó PsiA</h3></div></div><div className="simpleObservations"><div><span>Energía vocal</span><b>{fmt(last.acoustic?.rms_energy_mean)}</b></div><div><span>Variación tonal</span><b>{fmt(last.acoustic?.pitch_hz_std)} Hz</b></div><div><span>Silencios</span><b>{last.acoustic?.estimated_silence_ratio!=null?`${Math.round(last.acoustic.estimated_silence_ratio*100)}%`:'—'}</b></div></div><p className="observationNote">Estas variables alimentan el semáforo; el valor individual no se interpreta por sí solo.</p></section><section className="panel"><div className="panelTitle"><div><p className="eyebrow">TRANSCRIPCIÓN</p><h3>Qué fue dicho</h3></div></div><div className="transcriptBox">{last.transcription?.text||'No se generó transcripción.'}</div></section></div>}
 <details className="panel advancedPanel"><summary><span><p className="eyebrow">AUDITORÍA</p><b>Ver detalle técnico</b></span><ChevronDown size={18}/></summary>{last?<><div className="metricGrid">{[['Duración',last.source?.duration_sec,'s'],['Pitch medio',last.acoustic?.pitch_hz_mean,'Hz'],['Variabilidad pitch',last.acoustic?.pitch_hz_std,'Hz'],['Energía RMS',last.acoustic?.rms_energy_mean,''],['Silencio',last.acoustic?.estimated_silence_ratio,''],['Centroide espectral',last.acoustic?.spectral_centroid_hz_mean,'Hz']].map(([a,b,c])=><div className="metric" key={a}><small>{a}</small><b>{fmt(b)} {c}</b></div>)}</div><pre className="jsonPreview">{JSON.stringify(last,null,2)}</pre></>:<div className="empty">Aún no hay análisis.</div>}</details>
 <section className="panel historyPanel"><div className="panelTitle"><div><p className="eyebrow">HISTORIAL</p><h3>Evolución reciente</h3></div><button className="iconText" onClick={clear} disabled={!records.length||live}><Trash2 size={16}/> Limpiar</button></div>{records.length?records.map(r=>{const i=r.voice_mood_indicator||buildVoiceMoodIndicator(r,[]);return <div className="audioRow" key={r.id}><div><span className={`miniLight ${i.level}`}/><div><b>{r.source?.filename}</b><span>{new Date(r.saved_at).toLocaleString('es-CL')}</span></div></div><div><strong>{i.label}</strong><span>{i.score==null?'línea base':`${i.score}/100`}</span></div></div>}):<div className="empty">Sin registros. Los primeros audios construirán la línea base.</div>}</section>
 </main></div>;
}
