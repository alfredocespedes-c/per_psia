import React,{useEffect,useRef,useState} from 'react';
import {BrainCircuit,Upload,Download,Trash2,Play,Activity,ShieldAlert,Mic,Square} from 'lucide-react';

const API=(import.meta.env.VITE_API_URL||'https://per-psia-api.onrender.com').replace(/\/$/,'');
const fmt=n=>n==null?'—':typeof n==='number'?n.toLocaleString('es-CL'):n;
const CHUNK_MS=8000;

export default function App(){
 const [records,setRecords]=useState(()=>{try{return JSON.parse(localStorage.getItem('psia_audio_records')||'[]')}catch{return[]}});
 const [busy,setBusy]=useState(false);
 const [msg,setMsg]=useState('');
 const [apiStatus,setApiStatus]=useState('warming');
 const [live,setLive]=useState(false);
 const [liveSeconds,setLiveSeconds]=useState(0);
 const [liveTranscript,setLiveTranscript]=useState('');
 const [liveChunks,setLiveChunks]=useState(0);
 const input=useRef();
 const liveRef=useRef(false);
 const streamRef=useRef(null);
 const recorderRef=useRef(null);
 const chunkTimerRef=useRef(null);
 const sessionTimerRef=useRef(null);
 const sessionStartedRef=useRef(null);
 const queueRef=useRef(Promise.resolve());
 const liveResultsRef=useRef([]);
 const chunkIndexRef=useRef(0);

 useEffect(()=>localStorage.setItem('psia_audio_records',JSON.stringify(records)),[records]);

 useEffect(()=>{
  let cancelled=false;
  async function warmUp(){
   setApiStatus('warming');
   setMsg('Preparando motor de análisis…');
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),60000);
   try{
    const r=await fetch(`${API}/health`,{signal:controller.signal,cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    if(!cancelled){setApiStatus('ready');setMsg('Motor de análisis listo.');}
   }catch(e){
    if(!cancelled){setApiStatus('slow');setMsg('El motor puede estar iniciándose. Puedes intentar procesar el audio; la primera ejecución puede tardar más.');}
   }finally{clearTimeout(timeout)}
  }
  warmUp();
  return()=>{cancelled=true;cleanupLive()};
 },[]);

 function cleanupLive(){
  liveRef.current=false;
  if(chunkTimerRef.current)clearTimeout(chunkTimerRef.current);
  if(sessionTimerRef.current)clearInterval(sessionTimerRef.current);
  try{if(recorderRef.current?.state==='recording')recorderRef.current.stop()}catch{}
  streamRef.current?.getTracks()?.forEach(t=>t.stop());
  streamRef.current=null;
 }

 async function ensureApiReady(){
  setMsg('Comprobando motor de análisis…');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),90000);
  try{
   const r=await fetch(`${API}/health`,{signal:controller.signal,cache:'no-store'});
   if(!r.ok)throw new Error(`HTTP ${r.status}`);
   setApiStatus('ready');
   return true;
  }catch(e){setApiStatus('slow');return false}
  finally{clearTimeout(timeout)}
 }

 async function sendAudio(file,timeoutMs=300000){
  const fd=new FormData();fd.append('audio',file);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const r=await fetch(`${API}/api/audio/analyze`,{method:'POST',body:fd,signal:controller.signal});
   if(!r.ok){const x=await r.json().catch(()=>({}));throw new Error(x.detail||x.error||`HTTP ${r.status}`)}
   const j=await r.json();
   if(!j.processing?.python_used||j.processing?.fallback)throw new Error('La respuesta no provino del motor remoto de PsiA.');
   return j;
  }finally{clearTimeout(timeout)}
 }

 async function analyzeFile(file){
  if(!file)return;
  setBusy(true);
  try{
   const ready=await ensureApiReady();
   setMsg(ready?'Procesando audio y generando transcripción…':'El motor está respondiendo lento. Intentando procesar de todas formas…');
   const j=await sendAudio(file);
   const rec={id:crypto.randomUUID(),saved_at:new Date().toISOString(),...j};
   setRecords(x=>[rec,...x]);setApiStatus('ready');
   setMsg(j.transcription?.status==='completed'&&j.transcription?.text?'Análisis y transcripción completados.':'Análisis completado. La transcripción no pudo generarse.');
  }catch(e){showProcessingError(e)}
  finally{setBusy(false);if(input.current)input.current.value=''}
 }

 function showProcessingError(e){
  let message;
  if(e?.name==='AbortError')message='El procesamiento superó el tiempo disponible.';
  else if((e?.message||'').toLowerCase().includes('load failed')||(e?.message||'').toLowerCase().includes('failed to fetch'))message='No fue posible mantener la conexión con el motor de análisis.';
  else message=e?.message||String(e);
  setMsg(`Error de procesamiento: ${message}`);
 }

 function supportedMime(){
  const types=['audio/mp4','audio/webm;codecs=opus','audio/webm'];
  return types.find(t=>window.MediaRecorder?.isTypeSupported?.(t))||'';
 }

 function extForMime(mime){return mime.includes('mp4')?'m4a':mime.includes('webm')?'webm':'audio'}

 function startSegment(){
  if(!liveRef.current||!streamRef.current)return;
  const mime=supportedMime();
  const options=mime?{mimeType:mime}:undefined;
  const chunks=[];
  let recorder;
  try{recorder=new MediaRecorder(streamRef.current,options)}catch(e){setMsg(`No fue posible iniciar el micrófono: ${e.message}`);stopLive();return}
  recorderRef.current=recorder;
  recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
  recorder.onstop=()=>{
   if(chunkTimerRef.current)clearTimeout(chunkTimerRef.current);
   const blob=new Blob(chunks,{type:recorder.mimeType||mime||'audio/webm'});
   const idx=++chunkIndexRef.current;
   if(blob.size>0){
    queueRef.current=queueRef.current.then(()=>processLiveChunk(blob,idx)).catch(e=>{showProcessingError(e)});
   }
   if(liveRef.current)startSegment();
   else queueRef.current.then(()=>finalizeLiveSession());
  };
  recorder.start();
  chunkTimerRef.current=setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},CHUNK_MS);
 }

 async function processLiveChunk(blob,index){
  setMsg(`Sesión en vivo · procesando segmento ${index}…`);
  const mime=blob.type||'audio/webm';
  const file=new File([blob],`sesion_chunk_${String(index).padStart(3,'0')}.${extForMime(mime)}`,{type:mime});
  const j=await sendAudio(file,180000);
  liveResultsRef.current.push(j);
  setLiveChunks(liveResultsRef.current.length);
  const text=j.transcription?.text?.trim();
  if(text)setLiveTranscript(prev=>(prev?`${prev} ${text}`:text));
  setMsg(`Sesión en vivo · ${liveResultsRef.current.length} segmento(s) procesados`);
 }

 function aggregateSession(parts){
  const valid=parts.filter(Boolean);
  if(!valid.length)return null;
  const total=valid.reduce((s,p)=>s+(Number(p.source?.duration_sec)||0),0);
  const weighted=key=>{
   let n=0,d=0;for(const p of valid){const v=p.acoustic?.[key],w=Number(p.source?.duration_sec)||0;if(typeof v==='number'&&w>0){n+=v*w;d+=w}}return d?Number((n/d).toFixed(6)):null;
  };
  const silence=valid.reduce((s,p)=>s+(Number(p.acoustic?.estimated_silence_sec)||0),0);
  const text=valid.map(p=>p.transcription?.text?.trim()).filter(Boolean).join(' ');
  return {
   schema:'psia.audio.session.v1',analyzed_at:new Date().toISOString(),
   source:{filename:`sesion_en_vivo_${new Date().toISOString()}`,content_type:'audio/live',sample_rate_hz:valid[0]?.source?.sample_rate_hz||null,duration_sec:Number(total.toFixed(3)),size_bytes:null,chunk_count:valid.length},
   acoustic:{rms_energy_mean:weighted('rms_energy_mean'),rms_energy_std:weighted('rms_energy_std'),pitch_hz_mean:Number((weighted('pitch_hz_mean')??0).toFixed(2))||null,pitch_hz_std:Number((weighted('pitch_hz_std')??0).toFixed(2))||null,zero_crossing_rate_mean:weighted('zero_crossing_rate_mean'),spectral_centroid_hz_mean:Number((weighted('spectral_centroid_hz_mean')??0).toFixed(2))||null,estimated_silence_sec:Number(silence.toFixed(3)),estimated_silence_ratio:total?Number((silence/total).toFixed(4)):0,mfcc_mean:null},
   processing:{engine:'python_librosa_chunked',python_used:true,fallback:false,deployment:'remote_api',mode:'live_session',chunk_ms:CHUNK_MS,chunk_count:valid.length},
   interpretation:{status:'measurement_only',clinical_inference:false,note:'Estas métricas describen la señal acústica; no constituyen diagnóstico ni estado psicológico.'},
   transcription:{status:text?'completed':'empty',text:text||null,engine:'faster_whisper_chunked',model:valid[0]?.transcription?.model||null,segments:[]}
  };
 }

 async function startLive(){
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){setMsg('Este navegador no permite grabación de audio en vivo.');return}
  setBusy(true);
  const ready=await ensureApiReady();
  if(!ready)setMsg('El motor está iniciándose; comenzaremos la sesión y procesaremos los segmentos cuando responda.');
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});
   streamRef.current=stream;liveResultsRef.current=[];chunkIndexRef.current=0;queueRef.current=Promise.resolve();
   sessionStartedRef.current=Date.now();setLiveSeconds(0);setLiveChunks(0);setLiveTranscript('');
   liveRef.current=true;setLive(true);setBusy(false);setMsg('Sesión en vivo iniciada. Habla normalmente.');
   sessionTimerRef.current=setInterval(()=>setLiveSeconds(Math.floor((Date.now()-sessionStartedRef.current)/1000)),1000);
   startSegment();
  }catch(e){setBusy(false);setMsg(`No fue posible acceder al micrófono: ${e.message}`)}
 }

 function stopLive(){
  if(!liveRef.current)return;
  liveRef.current=false;setLive(false);setBusy(true);setMsg('Finalizando sesión y esperando los últimos segmentos…');
  if(sessionTimerRef.current)clearInterval(sessionTimerRef.current);
  if(chunkTimerRef.current)clearTimeout(chunkTimerRef.current);
  try{if(recorderRef.current?.state==='recording')recorderRef.current.stop();else queueRef.current.then(()=>finalizeLiveSession())}catch{queueRef.current.then(()=>finalizeLiveSession())}
 }

 function finalizeLiveSession(){
  streamRef.current?.getTracks()?.forEach(t=>t.stop());streamRef.current=null;
  const rec=aggregateSession(liveResultsRef.current);
  if(rec){setRecords(x=>[{id:crypto.randomUUID(),saved_at:new Date().toISOString(),...rec},...x]);setMsg(`Sesión finalizada · ${rec.source.chunk_count} segmentos · ${Math.round(rec.source.duration_sec)} s analizados.`)}
  else setMsg('La sesión terminó, pero no fue posible procesar ningún segmento.');
  setBusy(false);
 }

 async function sample(){
  setBusy(true);setMsg('Cargando audio base…');
  try{const r=await fetch(`${import.meta.env.BASE_URL}audio/audio_base.wav`);if(!r.ok)throw new Error('No se encontró el audio base');const b=await r.blob();setBusy(false);await analyzeFile(new File([b],'audio_base.wav',{type:'audio/wav'}))}
  catch(e){setMsg(`Error: ${e.message}`);setBusy(false)}
 }

 function exportJson(){const payload={schema:'psia.export.v1',exported_at:new Date().toISOString(),record_count:records.length,records};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`psia_export_${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url)}
 function clear(){if(confirm('¿Eliminar los análisis guardados en este navegador?'))setRecords([])}
 const last=records[0];
 const statusLabel=apiStatus==='ready'?'Motor listo':apiStatus==='warming'?'Preparando motor':'Motor iniciándose';
 const mm=String(Math.floor(liveSeconds/60)).padStart(2,'0'),ss=String(liveSeconds%60).padStart(2,'0');

 return <div className="appShell"><aside className="sidebar"><div className="brand"><div className="brandMark"><BrainCircuit size={24}/></div><div><b>PsiA</b><small>Audio Engine v0.7.0</small></div></div><nav><button className="active"><Activity size={18}/> Laboratorio de audio</button></nav><div className="privacy"><ShieldAlert size={18}/><div><b>Medición, no diagnóstico</b><span>La versión actual mide señal acústica y no infiere un estado clínico.</span></div></div></aside><main><header><div><p className="eyebrow">PROTOTIPO FUNCIONAL</p><h1>Análisis acústico y transcripción</h1><p className="sub">Sesiones en vivo · métricas acústicas · transcripción · JSON</p></div><button className="profile" onClick={exportJson} disabled={!records.length}><Download size={17}/> Exportar JSON</button></header>
 <section className="heroCard"><div><span className="statusPill">{live?'Sesión en vivo':statusLabel}</span><h2>{live?`Grabando sesión · ${mm}:${ss}`:'Analiza un archivo o inicia una sesión en vivo.'}</h2><p>{live?`PsiA divide la grabación en segmentos de ${CHUNK_MS/1000} segundos y los procesa uno por uno para reducir la carga sobre el servidor.`:'El modo en vivo procesa fragmentos cortos mientras hablas. El modo de archivo permanece disponible para audios ya grabados.'}</p><div className="heroActions"><button onClick={sample} disabled={busy||live}><Play size={17}/> Probar audio base</button><button className="secondary" onClick={()=>input.current.click()} disabled={busy||live}><Upload size={17}/> Subir mi audio</button>{live?<button onClick={stopLive}><Square size={17}/> Finalizar sesión</button>:<button onClick={startLive} disabled={busy}><Mic size={17}/> Sesión en vivo</button>}<input ref={input} hidden type="file" accept="audio/*,.wav,.mp3,.m4a,.mp4,.ogg,.flac" onChange={e=>analyzeFile(e.target.files?.[0])}/></div>{live&&<div className="empty" style={{marginTop:14,textAlign:'left'}}><b>Transcripción en vivo</b><div style={{marginTop:8,whiteSpace:'pre-wrap'}}>{liveTranscript||'Esperando el primer segmento…'}</div><small style={{display:'block',marginTop:8}}>Segmentos procesados: {liveChunks}</small></div>}{msg&&<p className="runMessage">{msg}</p>}</div><div className="heroGauge"><div className="ring"><span>{live?liveChunks:records.length}</span><small>{live?'segmentos':'análisis'}<br/>guardados</small></div><p>Persistencia: <b>localStorage</b></p></div></section>
 <div className="grid2"><section className="panel"><div className="panelTitle"><div><p className="eyebrow">ÚLTIMO RESULTADO</p><h3>Métricas acústicas</h3></div></div>{last?<div className="metricGrid">{[['Duración',last.source?.duration_sec,'s'],['Muestreo',last.source?.sample_rate_hz,'Hz'],['Pitch medio',last.acoustic?.pitch_hz_mean,'Hz'],['Variabilidad pitch',last.acoustic?.pitch_hz_std,'Hz'],['Energía RMS',last.acoustic?.rms_energy_mean,''],['Silencio estimado',last.acoustic?.estimated_silence_sec,'s'],['Ratio silencio',last.acoustic?.estimated_silence_ratio,''],['Centroide espectral',last.acoustic?.spectral_centroid_hz_mean,'Hz']].map(([a,b,c])=><div className="metric" key={a}><small>{a}</small><b>{fmt(b)} {c}</b></div>)}</div>:<div className="empty">Aún no hay análisis. Prueba el audio base o inicia una sesión.</div>}</section>
 <section className="panel"><div className="panelTitle"><div><p className="eyebrow">TRANSCRIPCIÓN</p><h3>Texto detectado</h3></div></div>{last?<div className="empty" style={{textAlign:'left',whiteSpace:'pre-wrap'}}>{last.transcription?.text||'No se generó transcripción para este audio.'}</div>:<div className="empty">Sin transcripción todavía.</div>}</section></div>
 <section className="panel"><div className="panelTitle"><div><p className="eyebrow">DATOS GUARDADOS</p><h3>Registro JSON</h3></div></div><pre className="jsonPreview">{last?JSON.stringify(last,null,2):'{}'}</pre></section>
 <section className="panel historyPanel"><div className="panelTitle"><div><p className="eyebrow">HISTORIAL LOCAL</p><h3>Análisis realizados</h3></div><button className="iconText" onClick={clear} disabled={!records.length||live}><Trash2 size={16}/> Limpiar</button></div>{records.length?records.map(r=><div className="audioRow" key={r.id}><div><b>{r.source?.filename}</b><span>{new Date(r.saved_at).toLocaleString('es-CL')}</span></div><div><span>{r.source?.duration_sec}s</span><span>pitch {fmt(r.acoustic?.pitch_hz_mean)} Hz</span><span>silencio {fmt(r.acoustic?.estimated_silence_ratio)}</span></div></div>):<div className="empty">Sin registros.</div>}</section>
 </main></div>}
