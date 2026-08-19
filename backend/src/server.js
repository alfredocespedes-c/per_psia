import express from 'express';import cors from 'cors';import multer from 'multer';import axios from 'axios';import FormData from 'form-data';import fs from 'fs';
fs.mkdirSync('tmp',{recursive:true});
const app=express();const upload=multer({dest:'tmp/',limits:{fileSize:25*1024*1024}});const PY=process.env.PSIA_AUDIO_URL||'http://127.0.0.1:8000';
app.use(cors());app.use(express.json());app.get('/api/health',(_,r)=>r.json({ok:true,service:'psia-node',python:PY}));
app.post('/api/audio/analyze',upload.single('audio'),async(req,res)=>{if(!req.file)return res.status(400).json({error:'audio requerido'});try{const f=new FormData();f.append('audio',fs.createReadStream(req.file.path),{filename:req.file.originalname,contentType:req.file.mimetype});const out=await axios.post(`${PY}/analyze`,f,{headers:f.getHeaders(),maxBodyLength:Infinity});res.json(out.data)}catch(e){res.status(502).json({error:'No fue posible analizar el audio',detail:e?.response?.data||e.message})}finally{fs.unlink(req.file.path,()=>{})}});
app.listen(process.env.PORT||3001,()=>console.log('PsiA Node http://localhost:3001'));
