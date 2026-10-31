import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { get, put } from '@vercel/blob';

export async function renderSignedPdf(sourcePath:string,fields:any[],answers:Record<string,string>){
 const source=await get(sourcePath,{access:'private'});if(!source||source.statusCode!==200)throw new Error('Source PDF unavailable');
 const pdf=await PDFDocument.load(await new Response(source.stream).arrayBuffer(),{updateMetadata:false});
 const font=await pdf.embedFont(StandardFonts.Helvetica);
 for(const field of fields){const value=field.autoValue??answers[field.id];if(!value)continue;const page=pdf.getPage(field.page);if(!page)throw new Error('Field references a missing PDF page');
  const {width,height}=page.getSize(),x=field.x*width,y=(1-field.y-field.height)*height,w=field.width*width,h=field.height*height;
  if(field.type==='signature'){const data=value.slice('data:image/png;base64,'.length);const image=await pdf.embedPng(Buffer.from(data,'base64'));page.drawImage(image,{x,y,width:w,height:h});}
  else page.drawText(value.slice(0,500),{x:x+2,y:y+Math.max(1,(h-10)/2),size:Math.min(12,Math.max(6,h*.55)),font,color:rgb(.12,.2,.15),maxWidth:Math.max(1,w-4)});
 }
 return Buffer.from(await pdf.save());
}
export async function signedPdf(sourcePath:string,fields:any[],answers:Record<string,string>,documentId:string){
 const bytes=await renderSignedPdf(sourcePath,fields,answers);const result=await put(`ferrosign/${documentId}/completed.pdf`,Buffer.from(bytes),{access:'private',contentType:'application/pdf',addRandomSuffix:false,allowOverwrite:true});return result.pathname;
}
