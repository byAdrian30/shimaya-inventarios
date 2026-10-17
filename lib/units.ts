import {catalogSource} from './catalog-source.ts';
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const aliases:Record<string,string>={kg:'kg',kgs:'kg',kilo:'kg',kilos:'kg',kilogramo:'kg',kilogramos:'kg',g:'g',gr:'g',grs:'g',gramo:'g',gramos:'g',l:'L',lt:'L',lts:'L',litro:'L',litros:'L',ml:'ml',mililitro:'ml',mililitros:'ml',und:'und',u:'und',unid:'und',unds:'und',unidad:'und',unidades:'und',unids:'und',uds:'und',caja:'caja',cajas:'caja',paquete:'paquete',paquetes:'paquete',paqt:'paquete',pqte:'paquete',pqtes:'paquete',pack:'pack',packs:'pack',bolsa:'bolsa',bolsas:'bolsa',bol:'bolsa',botella:'botella',botellas:'botella',galon:'galón',galones:'galón',balde:'balde',baldes:'balde',plancha:'plancha',planchas:'plancha',rollo:'rollo',rollos:'rollo',pote:'pote',potes:'pote',saco:'saco',sacos:'saco',porcion:'porción',porciones:'porción',lamina:'lámina',laminas:'lámina',jaba:'jaba',jabas:'jaba',par:'par',pares:'par',m:'m',metro:'m',metros:'m',barra:'barra',barras:'barra',mano:'mano',manos:'mano',lata:'lata',latas:'lata'};
for(const {unit} of catalogSource)if(!aliases[normalize(unit)])aliases[normalize(unit)]=unit;
export const canonicalUnit=(s:string)=>aliases[normalize(String(s||''))]||'';
export const units=[...new Set(['kg','g','L','ml','und','caja','paquete','pack','bolsa','botella','galón','balde','plancha','rollo','pote','saco','porción','lámina','jaba','par','m','barra','mano','lata',...catalogSource.map(e=>canonicalUnit(e.unit))])];
export const unitLabel=(unit:string)=>({kg:'Kg',und:'Unidad',paquete:'Paquete',bolsa:'Bolsa',caja:'Caja',pack:'Pack',barra:'Barra',rollo:'Rollo','galón':'Galón'} as Record<string,string>)[unit]||unit;
export function unitContainer(unit:string){return canonicalUnit(unit.split(' ')[0])}
function capacity(unit:string){
 const mass:Record<string,number>={kg:1000,g:1},volume:Record<string,number>={L:1000,ml:1};
 if(mass[unit])return {kind:'mass',amount:mass[unit]};if(volume[unit])return {kind:'volume',amount:volume[unit]};
 const match=unit.match(/(\d+(?:[.,]\d+)?)\s*(kg|gr|g|ml|l)\b/i);if(!match)return null;
 const u=canonicalUnit(match[2]);return {kind:mass[u]?'mass':'volume',amount:Number(match[1].replace(',','.'))*(mass[u]||volume[u])};
}
export function unitFactor(from:string,to:string){
 const f=canonicalUnit(from),t=canonicalUnit(to);if(!f||!t)throw Error('Selecciona una unidad válida.');if(f===t)return 1;
 const a=capacity(f),b=capacity(t);if(a&&b&&a.kind===b.kind)return a.amount/b.amount;
 // Una unidad genérica de envase equivale a una presentación del mismo envase.
 if(unitContainer(f)===unitContainer(t)&&(f===unitContainer(f)||t===unitContainer(t)))return 1;
 throw Error('Unidad incompatible: '+from+' → '+to+'. Usa la unidad del catálogo.');
}
