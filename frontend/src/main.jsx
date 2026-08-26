import React,{useEffect,useState} from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './mood.css';

const API=(import.meta.env.VITE_API_URL||'https://per-psia-api.onrender.com').replace(/\/$/,'');
const WARMUP_SECONDS=60;

function WarmupGate(){
  const [remaining,setRemaining]=useState(WARMUP_SECONDS);
  const [health,setHealth]=useState('waking');

  useEffect(()=>{
    let cancelled=false;

    async function wakeEngine(){
      try{
        const controller=new AbortController();
        const timeout=setTimeout(()=>controller.abort(),15000);
        const r=await fetch(`${API}/health`,{cache:'no-store',signal:controller.signal});
        clearTimeout(timeout);
        if(!cancelled)setHealth(r.ok?'responding':'waking');
      }catch{
        if(!cancelled)setHealth('waking');
      }
    }

    wakeEngine();
    const healthTimer=setInterval(wakeEngine,10000);
    const countdown=setInterval(()=>setRemaining(v=>Math.max(0,v-1)),1000);

    return()=>{
      cancelled=true;
      clearInterval(healthTimer);
      clearInterval(countdown);
    };
  },[]);

  if(remaining===0)return <App/>;

  const progress=Math.round(((WARMUP_SECONDS-remaining)/WARMUP_SECONDS)*100);
  return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#f5f7f8',fontFamily:'Inter,Arial,sans-serif',padding:24}}>
    <div style={{width:'min(560px,100%)',background:'white',border:'1px solid #e3e8e9',borderRadius:24,padding:'38px 34px',boxShadow:'0 16px 50px rgba(20,45,47,.10)',textAlign:'center'}}>
      <div style={{width:68,height:68,borderRadius:20,background:'#17383a',color:'white',display:'grid',placeItems:'center',margin:'0 auto 20px',fontSize:28,fontWeight:800}}>Ψ</div>
      <div style={{fontSize:11,letterSpacing:'.14em',fontWeight:800,color:'#6b7c80',marginBottom:10}}>PSIA · MOTOR DE ANÁLISIS</div>
      <h1 style={{margin:'0 0 12px',fontSize:30,color:'#172126'}}>Preparando motor…</h1>
      <p style={{margin:'0 auto 24px',maxWidth:430,color:'#6b7c80',lineHeight:1.6}}>Estamos activando el servicio de análisis de voz para que esté listo antes de recibir audios. Los controles se habilitarán automáticamente.</p>
      <div style={{height:10,background:'#edf1f1',borderRadius:999,overflow:'hidden',marginBottom:14}}><div style={{height:'100%',width:`${progress}%`,background:'#2d625c',transition:'width 1s linear'}}/></div>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,fontSize:13,color:'#637275'}}>
        <span>{health==='responding'?'Servicio respondiendo · estabilizando':'Despertando servicio Render'}</span>
        <b style={{color:'#17383a'}}>{remaining}s</b>
      </div>
      <small style={{display:'block',marginTop:20,color:'#93a0a3'}}>No cierres esta página. PsiA estará disponible en aproximadamente un minuto.</small>
    </div>
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><WarmupGate/></React.StrictMode>);
