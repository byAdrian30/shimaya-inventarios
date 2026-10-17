import {canonicalUnit,configured,normalize,type Ingredient,type ReviewLine} from './inventory.ts';
export const weekdays=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
export type FormRow={product:string;catalogId:string|null;unit:string;quantity:number|null;mark:'number'|'dash'|'blank'|'unclear';confidence:'high'|'medium'|'low';note:string;box:{x:number;y:number;width:number;height:number}};
export type FormResult={title:string;columnLabel:string;columnVerified:boolean;warnings:string[];rows:FormRow[]};
const formAliases:Record<string,string>={
'CHANCHO TONKATSU 150 GR 5 UNID':'CHANCHO TONKATSU 150GR X 5 UNIDAES',
'FILETE CHICKEN KATSU 150 GR 5 UNID':'FILETE CHICKEN KATSU 150GR X 5 UNIDADES',
'POLLO KARAGUE ADEREZADO 5 UNID':'POLLO KARAGUE ADEREZADO CRUDO PACK X5',
'EBI FILADELPHIA PAQT 6 UNID':'EBI FILADELFIA PAQUETE DE 6 UNIDADES',
'EBI FURAI PAQT 30UNID':'EBI FURAI PAQUETE DE 30 UNIDADES',
'ALITAS PACK 5':'PAQUETES DE ALITAS PACK X5',
'HUEVOS 6 PLANCHAS':'MEDIA JABA DE HUEVOS ( 6 PLANCHAS )',
'CHUNO':'BOLSA CHUÑO 1KG',
'BALDE DE ACEITE COCINERO 20 LT':'BALDE DE ACEITE',
'ARROZ MYK':'ARROZ JAPONES',
'AJONJOLI BLANCO':'AJONJOLI BLANCO','AJONJOLI NEGRO':'AJONJOLI NEGRO',
'BROTES DE ALFALFA':'PAQUETE DE BROTES DE ALFALFA','BROTES DE BETERRAGA':'PAQUETE DE BROTES DE BETARRAGA',
'FLORES COMESTIBLES':'PAQUETE DE FLORES COMESTIBLES',
'MANGA PASTELERA':'MANGAS PASTELERAS X5UND','POLIGRASA ROLLO CHICO':'POLIGRASA CHICO ROLLO',
'SALDASHI':'SAL DASHI X 100GR','YEMA AHUMADAS 40 GR':'YEMAS AHUMADAS X 40GR',
'MAYONESA':'BOLSA MAYONESA 2KG','MURAZAKI':'SALSA MURAZAKI','PACHIKAI':'SALSA PACHIKAY',
'PASERI':'SALSA PASERI','YAMA':'SALSA YAMA','ZU 1 LT':'ZU X 1L',
'AMAKARAI 500 ML':'SALSA AMAKARAI','ANTICUCHERA 500 ML':'SALSA ANTICUCHERA',
'BBQ 500 ML':'SALSA BBQ','KATSUDON 500 ML':'SALSA KATSUDON','SPICY 500 ML':'SALSA SPICY',
'TERIYAKI 500 ML':'SALSA TERIYAKI','KATSU 500 ML':'SALSA KATSU'};
export function formCatalog(ingredients:Ingredient[]){return ingredients.map(i=>({id:i.id,name:i.name,unit:i.unit,aliases:[...(i.aliases||'').split(',').filter(Boolean),...Object.entries(formAliases).filter(([,name])=>normalize(name)===normalize(i.name)).map(([alias])=>alias)]}))}
function matchRow(row:FormRow,ingredients:Ingredient[]){if(row.catalogId){const i=ingredients.find(i=>i.id===row.catalogId);if(i)return i}const name=normalize(row.product),alias=Object.entries(formAliases).find(([a])=>normalize(a)===name)?.[1];return ingredients.find(i=>normalize(i.name)===name||alias&&normalize(i.name)===normalize(alias)||(i.aliases||'').split(',').some(a=>a.trim()&&normalize(a)===name))}
export function validateFormResult(value:any):FormResult{if(!value||typeof value.title!=='string'||typeof value.columnLabel!=='string'||typeof value.columnVerified!=='boolean'||!Array.isArray(value.rows)||value.rows.length>500||!Array.isArray(value.warnings))throw Error('La lectura no devolvió una tabla válida.');for(const r of value.rows){if(typeof r.product!=='string'||!['number','dash','blank','unclear'].includes(r.mark)||!['high','medium','low'].includes(r.confidence)||typeof r.note!=='string'||typeof r.unit!=='string'||(r.catalogId!==null&&typeof r.catalogId!=='string')||(r.quantity!==null&&(typeof r.quantity!=='number'||!Number.isFinite(r.quantity)||r.quantity<0||r.quantity>1e8)))throw Error('La lectura contiene una fila inválida.');if(!r.box||['x','y','width','height'].some(k=>typeof r.box[k]!=='number'||r.box[k]<0||r.box[k]>1)||r.box.x+r.box.width>1.01||r.box.y+r.box.height>1.01)throw Error('La ubicación de una fila no es válida.');}return value}
export function formReview(result:FormResult,ingredients:Ingredient[],photoHash:string):ReviewLine[]{return result.rows.filter(r=>!['blank','dash'].includes(r.mark)).map(row=>{const i=matchRow(row,ingredients),printed=row.unit.replace(/[.]/g,'').trim();const aliases:Record<string,string>={PAQT:'paquete',PAQ:'paquete',BOL:'bolsa',UNID:'und'};const unit=canonicalUnit(aliases[printed.toUpperCase()]||printed);const notes=[!result.columnVerified?'Confirma la columna seleccionada frente a la foto.':'',row.mark!=='number'||row.quantity===null?'Cantidad ilegible: ingrésala mirando la foto.':'',row.confidence!=='high'?'Lectura manuscrita dudosa: revisa la cifra.':'',!i?'Selecciona el insumo del catálogo.':'',!unit?'Unidad del formato sin confirmar.':'',i&&!configured(i)?'Configura el stock inicial del insumo.':'',row.note].filter(Boolean);return {raw:row.product+' · '+result.columnLabel,ingredientId:i?.id||'',quantity:row.mark==='number'&&row.quantity!==null?row.quantity:0,unit,checked:false,warning:notes.join(' '),sourcePhoto:photoHash,sourceColumn:result.columnLabel,sourceBox:row.box,needsReview:true}})}
