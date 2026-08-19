import React, {useMemo, useState} from 'react';
import {BrainCircuit, Mic2, FileText, Activity, ShieldAlert, UserRound, ChevronRight, Play, Upload, Search, Sparkles, Clock3, TrendingDown, TrendingUp, Minus, HeartHandshake} from 'lucide-react';

const signals = [
  {label:'Ánimo', value:'Bajo', trend:'down', score:36, confidence:'Media'},
  {label:'Ansiedad / tensión', value:'Moderada', trend:'up', score:63, confidence:'Media'},
  {label:'Energía', value:'Baja', trend:'down', score:31, confidence:'Alta'},
  {label:'Sueño', value:'Irregular', trend:'down', score:42, confidence:'Media'},
  {label:'Interacción social', value:'Estable', trend:'flat', score:57, confidence:'Baja'},
  {label:'Orientación al futuro', value:'Disminuyendo', trend:'down', score:38, confidence:'Media'},
];

const evidence = [
  ['Audio · hoy 08:16','Aumento de pausas largas y menor variabilidad de energía respecto de la línea base.','Voz'],
  ['Nota · ayer 22:40','Menciona dificultades para dormir por tercera vez esta semana.','Lenguaje'],
  ['Audio · lunes','Mayor frecuencia de expresiones asociadas a preocupación laboral.','Contenido'],
  ['Seguimiento · 14 días','Descenso sostenido de energía estimada; requiere corroboración con autorreporte.','Tendencia'],
];

function Trend({kind}){ if(kind==='up') return <TrendingUp size={16}/>; if(kind==='down') return <TrendingDown size={16}/>; return <Minus size={16}/>; }

function App(){
  const [view,setView]=useState('resumen');
  const [selected,setSelected]=useState(0);
  const selectedSignal=signals[selected];
  const nav=[['resumen','Resumen',Activity],['registro','Nuevo registro',Mic2],['historial','Historial',Clock3],['profesional','Vista profesional',UserRound]];
  return <div className="appShell">
    <aside className="sidebar">
      <div className="brand"><div className="brandMark"><BrainCircuit size={24}/></div><div><b>PsiA</b><small>Acompañamiento longitudinal</small></div></div>
      <nav>{nav.map(([id,label,Icon])=><button key={id} className={view===id?'active':''} onClick={()=>setView(id)}><Icon size={18}/>{label}</button>)}</nav>
      <div className="privacy"><ShieldAlert size={18}/><div><b>Apoyo, no diagnóstico</b><span>Las señales son hipótesis que requieren contexto y, cuando corresponda, evaluación profesional.</span></div></div>
    </aside>
    <main>
      <header><div><p className="eyebrow">PERFIL LONGITUDINAL</p><h1>{view==='resumen'?'Estado actual':view==='registro'?'Registrar cómo estás':view==='historial'?'Evolución':'Resumen para profesional'}</h1><p className="sub">Persona demo · Línea base: 43 días · Última actualización: hoy 08:24</p></div><button className="profile"><span>AC</span>Perfil</button></header>
      {view==='resumen' && <>
        <section className="heroCard"><div><span className="statusPill">Seguimiento recomendado</span><h2>Se observa un cambio sostenido en energía y sueño.</h2><p>La evidencia actual sugiere explorar bienestar general y calidad del sueño. No constituye un diagnóstico.</p><div className="heroActions"><button onClick={()=>setView('registro')}><Mic2 size={17}/> Registrar audio</button><button className="secondary" onClick={()=>setView('profesional')}><HeartHandshake size={17}/> Ver resumen profesional</button></div></div><div className="heroGauge"><div className="ring"><span>4</span><small>señales<br/>activas</small></div><p>Confianza global: <b>media</b></p></div></section>
        <div className="grid2">
          <section className="panel"><div className="panelTitle"><div><p className="eyebrow">DIMENSIONES</p><h3>Estado psicológico observado</h3></div><span className="chip">vs. línea base</span></div><div className="signalList">{signals.map((s,i)=><button className={`signal ${selected===i?'selected':''}`} key={s.label} onClick={()=>setSelected(i)}><div className="signalHead"><span>{s.label}</span><b>{s.value}</b></div><div className="bar"><i style={{width:`${s.score}%`}}/></div><div className="signalMeta"><span><Trend kind={s.trend}/> Tendencia</span><small>Confianza {s.confidence}</small></div></button>)}</div></section>
          <section className="panel detail"><div className="panelTitle"><div><p className="eyebrow">EXPLICABILIDAD</p><h3>{selectedSignal.label}</h3></div><Sparkles size={21}/></div><div className="detailScore"><span>{selectedSignal.score}</span><div><b>{selectedSignal.value}</b><small>Índice interno de seguimiento</small></div></div><h4>¿Por qué aparece esta señal?</h4>{evidence.slice(0,3).map((e,idx)=><div className="evidence" key={idx}><div className="dot"/><div><b>{e[0]}</b><p>{e[1]}</p><span>{e[2]}</span></div></div>)}<button className="textBtn">Ver toda la evidencia <ChevronRight size={16}/></button></section>
        </div>
      </>}
      {view==='registro' && <section className="captureWrap"><div className="captureCard"><div className="micCircle"><Mic2 size={34}/></div><h2>Cuéntame cómo has estado</h2><p>Habla libremente. PsiA separará el contenido de las características acústicas y comparará ambas con tu propia línea base.</p><button className="record"><span/>Comenzar grabación</button><div className="divider"><i/>o<i/></div><button className="upload"><Upload size={18}/> Subir archivo de audio</button></div><div className="noteCard"><FileText size={22}/><h3>También puedes escribir una nota</h3><textarea placeholder="¿Qué pasó hoy? ¿Cómo te sentiste? ¿Hay algo que te preocupe especialmente?"/><button>Guardar nota</button></div></section>}
      {view==='historial' && <section className="panel"><div className="panelTitle"><div><p className="eyebrow">ÚLTIMOS 14 DÍAS</p><h3>Evidencia y cambios detectados</h3></div><button className="iconBtn"><Search size={18}/></button></div><div className="timeline">{evidence.concat([['Nota · hace 6 días','Describe una jornada positiva y mayor contacto social.','Protector'],['Audio · hace 9 días','Patrón vocal dentro de la línea base individual.','Voz']]).map((e,idx)=><div className="timelineItem" key={idx}><div className="timeDot"/><div><span>{e[0]}</span><h4>{e[1]}</h4><small>{e[2]}</small></div></div>)}</div></section>}
      {view==='profesional' && <div className="professionalGrid"><section className="panel"><p className="eyebrow">RESUMEN AUTOMÁTICO · 14 DÍAS</p><h2>Aspectos sugeridos para explorar</h2><div className="priority">1 <div><b>Sueño y recuperación</b><p>Tres menciones recientes de dificultad para dormir junto a descenso de energía.</p></div></div><div className="priority">2 <div><b>Estrés laboral</b><p>Aumento de referencias a preocupación y carga laboral.</p></div></div><div className="priority">3 <div><b>Orientación al futuro</b><p>Disminución de lenguaje prospectivo positivo respecto de la línea base.</p></div></div><div className="notice">Este resumen organiza evidencia observada; no reemplaza entrevista clínica, anamnesis ni juicio profesional.</div></section><section className="panel"><p className="eyebrow">TRAZABILIDAD</p><h3>Señales con mayor peso</h3>{signals.slice(0,4).map((s,i)=><div className="compactSignal" key={i}><div><b>{s.label}</b><span>{s.value}</span></div><strong>{s.score}</strong></div>)}<button className="export">Generar resumen de sesión</button></section></div>}
    </main>
  </div>
}
export default App;
