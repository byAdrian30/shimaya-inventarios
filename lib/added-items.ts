import {normalize,type State} from './inventory.ts';
export const addedItemsVersion='manual-items-2026-10-17-v1';
const requestedItems=[
 {catalogId:'catalog-217',name:'PULPA DE TAMARINDO',catalogName:'PULPA DE TAMARINDO X 1KG',area:'Barra',group:'Pulpas',unit:'und',sourceUnit:'Unidad',areaId:'manual-area-barra-pulpa-tamarindo'},
 {catalogId:'catalog-180',name:'PAQUETE DE PORO',catalogName:'PAQUETE DE PORO',area:'Ramen',group:'Verduras',unit:'paquete',sourceUnit:'Paquete',areaId:'manual-area-ramen-paquete-poro'},
];
export function withAddedItems(current:State):State{
 if(current.addedItemsVersion===addedItemsVersion)return current;
 const s=structuredClone(current),names=new Set(['arroz de personal','arroz personal']);
 const areaId='manual-area-makis-arroz-personal',stockId='manual-stock-arroz-personal';
 const existing=s.areaItems?.find(a=>a.id===areaId||a.area==='Makis'&&names.has(normalize(a.name)));
 let ingredient=s.ingredients.find(i=>i.id===existing?.ingredientId)||s.ingredients.find(i=>i.id===stockId||names.has(normalize(i.name)));
 if(!ingredient){ingredient={id:stockId,name:'Arroz de personal',category:'Abarrotes',unit:'kg',stock:0,minimum:0,configured:true,noOrder:false};s.ingredients.push(ingredient)}
 if(!ingredient.unit)ingredient.unit='kg';
 if(!ingredient.unitIssue)ingredient.configured=true;
 s.areaItems??=[];
 if(existing){existing.name='Arroz de personal';existing.sourceName=existing.name;existing.active=true;existing.ingredientId=ingredient.id;existing.referenceUnit=ingredient.sourceUnit||ingredient.unit;existing.linkReviewed=true;}
 else s.areaItems.push({id:areaId,area:'Makis',group:'Abarrotes',name:'Arroz de personal',sourceName:'Arroz de personal',referenceUnit:ingredient.sourceUnit||ingredient.unit,source:'AGREGADO POR ADMINISTRACIÓN',ingredientId:ingredient.id,active:true,linkReviewed:true});
 for(const item of requestedItems){
  const names=new Set([normalize(item.name),normalize(item.catalogName)]);
  let stock=s.ingredients.find(i=>i.catalogId===item.catalogId||i.id===item.catalogId)||s.ingredients.find(i=>names.has(normalize(i.name)));
  if(!stock){stock={id:item.catalogId,catalogId:item.catalogId,name:item.catalogName,category:item.area==='Barra'?'Bebidas':'Vegetales',unit:item.unit,sourceUnit:item.sourceUnit,stock:0,minimum:0,configured:true,noOrder:false};s.ingredients.push(stock)}
  if(!stock.unit)stock.unit=item.unit;
  if(!stock.unitIssue)stock.configured=true;
  const areaItem=s.areaItems.find(a=>a.id===item.areaId||a.area===item.area&&names.has(normalize(a.name)));
  const fields={name:item.name,sourceName:item.name,ingredientId:stock.id,referenceUnit:stock.sourceUnit||stock.unit,ingredientOptions:undefined,suggestedIngredientId:'',active:true,linkReviewed:true,reason:''};
  if(areaItem)Object.assign(areaItem,fields);
  else s.areaItems.push({id:item.areaId,area:item.area,group:item.group,source:'AGREGADO POR ADMINISTRACIÓN',...fields});
 }
 s.addedItemsVersion=addedItemsVersion;return s;
}
