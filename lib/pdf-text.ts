export type TextItem={str:string;transform:number[];width:number;hasEOL?:boolean};
export function pdfTextLines(items:TextItem[]){
 const lines:{y:number;items:TextItem[]}[]=[];
 for(const item of items){if(!item.str.trim())continue;const y=item.transform[5];let line=lines.find(line=>Math.abs(line.y-y)<Math.max(2,Math.abs(item.transform[3])*0.22));if(!line){line={y,items:[]};lines.push(line)}line.items.push(item)}
 return lines.sort((a,b)=>b.y-a.y).map(line=>{const ordered=line.items.sort((a,b)=>a.transform[4]-b.transform[4]);let previous:TextItem|undefined;return ordered.map(item=>{const gap=previous?item.transform[4]-(previous.transform[4]+previous.width):0,prefix=previous?(gap>14?'\t':' '):'';previous=item;return prefix+item.str}).join('')}).join('\n');
}
