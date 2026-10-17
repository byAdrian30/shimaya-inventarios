import {pdfTextLines,type TextItem} from './pdf-text.ts';
export async function readGoodsPdf(file:File,progress:(message:string)=>void){
 if(!file.name.toLowerCase().endsWith('.pdf')||file.size>10e6||!file.size)throw Error('Usa un PDF de hasta 10 MB.');
 const pdfjs=await import('pdfjs-dist');
 pdfjs.GlobalWorkerOptions.workerSrc=`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
 const bytes=new Uint8Array(await file.arrayBuffer());if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('El archivo no es un PDF válido.');
 const task=pdfjs.getDocument({data:bytes,useSystemFonts:true});const pdf=await task.promise;
 let worker:Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>|undefined;
 try{
  if(pdf.numPages>30)throw Error('Usa un documento de hasta 30 páginas.');
  const pages:string[]=[];let usedOCR=false;
  for(let index=1;index<=pdf.numPages;index++){
   progress('Leyendo página '+index+' de '+pdf.numPages+'…');const page=await pdf.getPage(index),content=await page.getTextContent();
   let text=pdfTextLines(content.items.filter((item):item is typeof item&TextItem=>'str' in item));
   if(text.replace(/\s/g,'').length<30){
    progress('Reconociendo la página escaneada '+index+'…');usedOCR=true;
    if(!worker){const {createWorker}=await import('tesseract.js');worker=await createWorker('spa',1,{workerPath:'/ocr/worker.min.js',corePath:'/ocr/core',langPath:'/ocr/lang'});}
    const viewport=page.getViewport({scale:Math.min(2,1800/page.getViewport({scale:1}).width)}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    const context=canvas.getContext('2d');if(!context)throw Error('No se pudo leer la página escaneada.');
    await page.render({canvas,canvasContext:context,viewport}).promise;text=(await worker.recognize(canvas)).data.text;canvas.width=1;canvas.height=1;
   }
   pages.push(text);page.cleanup();
  }
  const text=pages.join('\n');if(!text.trim())throw Error('No se encontró texto legible. Puedes escribir los productos en el formulario.');return {text,pages:pdf.numPages,usedOCR};
 }finally{if(worker)await worker.terminate();await task.destroy();}
}
