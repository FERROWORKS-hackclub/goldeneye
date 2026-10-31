'use client';
import { useEffect, useRef, useState } from 'react';

export default function PDFPage({source,children,onClick,className='',pageNumber=1,onPageCount}:{source:File|string;children?:React.ReactNode;onClick?:(event:React.MouseEvent<HTMLDivElement>)=>void;className?:string;pageNumber?:number;onPageCount?:(count:number)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null);const [ratio,setRatio]=useState('0.72');const [error,setError]=useState('');
 useEffect(()=>{let task:any,render:any,objectUrl:string|undefined;let active=true;
  void (async()=>{try{const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/legacy/build/pdf.worker.mjs',import.meta.url).toString();const url=typeof source==='string'?source:(objectUrl=URL.createObjectURL(source));task=pdfjs.getDocument(url);const pdf=await task.promise;if(!active)return;onPageCount?.(pdf.numPages);const page=await pdf.getPage(pageNumber);const base=page.getViewport({scale:1});const width=Math.min(900,window.innerWidth-32);const viewport=page.getViewport({scale:width/base.width});setRatio(`${viewport.width}/${viewport.height}`);const element=canvas.current;if(!element||!active)return;const ctx=element.getContext('2d');if(!ctx)return;const dpr=window.devicePixelRatio||1;element.width=Math.floor(viewport.width*dpr);element.height=Math.floor(viewport.height*dpr);render=page.render({canvasContext:ctx,viewport,transform:dpr===1?undefined:[dpr,0,0,dpr,0,0]});await render.promise}catch(e){if(active)setError(e instanceof Error?e.message:'Unable to render PDF')}})();
  return()=>{active=false;render?.cancel?.();task?.destroy?.();if(objectUrl)URL.revokeObjectURL(objectUrl)};
 },[source,pageNumber,onPageCount]);
 return <div className={`fs-page ${className}`} style={{aspectRatio:ratio}} onClick={onClick}><canvas ref={canvas}/>{children}{error&&<div className="fs-pdf-error">{error}</div>}</div>
}
