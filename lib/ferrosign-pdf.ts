import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { get, put } from '@vercel/blob';

export async function renderSignedPdf(sourcePath:string,fields:any[],answers:Record<string,string>){
 const source=await get(sourcePath,{access:'private'});if(!source||source.statusCode!==200)throw new Error('Source PDF unavailable');
 return renderPdfBytes(new Uint8Array(await new Response(source.stream).arrayBuffer()),fields,answers);
}
export async function renderPdfBytes(source:Uint8Array,fields:any[],answers:Record<string,string>){
 const pdf=await PDFDocument.load(source,{updateMetadata:false});
 const font=await pdf.embedFont(StandardFonts.Helvetica);
 for(const field of fields){const value=field.autoValue??answers[field.id];if(!value)continue;const page=pdf.getPage(field.page);if(!page)throw new Error('Field references a missing PDF page');
  const {width,height}=page.getSize(),x=field.x*width,y=(1-field.y-field.height)*height,w=field.width*width,h=field.height*height;
  if(field.type==='signature'){const data=value.slice('data:image/png;base64,'.length);const image=await pdf.embedPng(Buffer.from(data,'base64'));const scale=Math.min(w/image.width,h/image.height);page.drawImage(image,{x,y,width:image.width*scale,height:image.height*scale});}
  else {const text=value.slice(0,500);let size=Math.min(12,Math.max(6,h*.55)),lines:string[]=[];
   for(;;){lines=[];let line='';for(const word of text.split(/\s+/)){if(font.widthOfTextAtSize(word,size)>w-4)throw Error(`Text does not fit ${field.label}. Shorten the answer or enlarge the field.`);if(line&&font.widthOfTextAtSize(`${line} ${word}`,size)>w-4){lines.push(line);line=word}else line=line?`${line} ${word}`:word;}if(line)lines.push(line);if(lines.length*size*1.15<=h-2||size<=6)break;size-=.5;}if(lines.length*size*1.15>h)throw Error(`Text does not fit ${field.label}. Shorten the answer or enlarge the field.`);lines.forEach((line,i)=>page.drawText(line,{x:x+2,y:y+h-size-1-i*size*1.15,size,font,color:rgb(.12,.2,.15)}));}

 }
 return Buffer.from(await pdf.save());
}
export async function signedPdf(sourcePath:string,fields:any[],answers:Record<string,string>,documentId:string){
 const bytes=await renderSignedPdf(sourcePath,fields,answers);const result=await put(`ferrosign/${documentId}/completed.pdf`,Buffer.from(bytes),{access:'private',contentType:'application/pdf',addRandomSuffix:false,allowOverwrite:true});return result.pathname;
}
