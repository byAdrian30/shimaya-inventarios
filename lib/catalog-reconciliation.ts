import {catalogSource,catalogVersion} from './catalog-source.ts';
import {areaSource,areasVersion} from './areas-source.ts';
import {reviewedAreaLinks} from './area-links.ts';
import {canonicalUnit,unitContainer,unitFactor} from './units.ts';
import type {State,Ingredient} from './inventory.ts';
import type {AreaItem} from './requests.ts';

const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const category=(group:string)=>({Verduras:'Vegetales',Proteinas:'Proteínas',Salsas:'Caldos y salsas',Barra:'Bebidas',Salón:'Empaques'} as Record<string,string>)[group]||group;

export function reconcileCatalog(s:State):State{
 if(s.catalogVersion===catalogVersion&&s.areasVersion===areasVersion)return s;
 const updateCatalog=s.catalogVersion!==catalogVersion;
 const targets=new Map<string,Ingredient>();
 for(const entry of catalogSource){
  let i=s.ingredients.find(i=>i.catalogId===entry.id)||s.ingredients.find(i=>i.id===entry.id)||s.ingredients.find(i=>fold(i.name)===fold(entry.name));
  const created=!i;
  if(!i){i={id:entry.id,name:entry.name,category:'Sin clasificar',unit:'',stock:0,minimum:0,configured:false,aliases:'',noOrder:false};s.ingredients.push(i)}
  targets.set(entry.id,i);
  // La corrección de áreas no recalcula ni sustituye saldos ya registrados.
  if(!updateCatalog&&!created)continue;
  const oldName=i.name,oldUnit=i.unit,target=canonicalUnit(entry.unit);
  if(i.configured!==false&&oldUnit&&canonicalUnit(oldUnit)!==target){
   let factor:number|undefined;
   try{factor=unitFactor(oldUnit,target)}catch{
    const container=unitContainer(oldUnit);
    if(target==='und'&&container&&fold(entry.name.replace(/^\(NO PEDIR\)\s*/,'')).startsWith(fold(container)))factor=1;
   }
   if(factor!==undefined){i.stock=Math.round(i.stock*factor*1e6)/1e6;i.minimum=Math.round(i.minimum*factor*1e6)/1e6;i.legacyUnits=[...(i.legacyUnits||[]).map(u=>({...u,factor:u.factor*factor})),{unit:oldUnit,factor}];i.unit=target;i.unitIssue=''}
   else i.unitIssue='Stock registrado en '+oldUnit+'. Recuenta en '+entry.unit+' para cambiar la unidad.';
  }else{i.unit=target;i.unitIssue=''}
  i.name=entry.name;i.sourceUnit=entry.unit;i.catalogId=entry.id;i.noOrder=entry.name.startsWith('(NO PEDIR)');
  if(oldName!==i.name)i.aliases=[...new Set([...(i.aliases||'').split(',').filter(Boolean),oldName])].join(',').slice(0,1000);
 }

 const previous=s.areaItems||[],result:AreaItem[]=[];
 for(const source of areaSource){
  const prior=previous.find(a=>a.id===source.id);
  const candidates=(reviewedAreaLinks[source.id]||[]).map(id=>{
   const ingredient=targets.get(id);if(!ingredient)throw Error('Correspondencia de catálogo inexistente.');return ingredient;
  });
  const priorIngredient=s.ingredients.find(i=>i.id===prior?.ingredientId);
  const reviewed=!!priorIngredient&&(prior?.linkReviewed===true||prior?.active!==false&&!!prior?.ingredientId&&candidates.length>0&&!candidates.some(i=>i.id===prior.ingredientId));
  let ingredient=reviewed?priorIngredient:candidates.length===1?candidates[0]:undefined;
  const ingredientOptions=!reviewed&&candidates.length>1?candidates.map(i=>i.id):undefined;
  if(!ingredient&&!ingredientOptions){
   // Un producto del formato de áreas sigue disponible aunque falte en el otro catálogo.
   ingredient=priorIngredient||s.ingredients.find(i=>fold(i.name)===fold(source.name));
   if(!ingredient){
    const unit=canonicalUnit(source.referenceUnit)||'und';
    ingredient={id:'area-stock-'+fold(source.name),name:source.name,category:category(source.group),unit,stock:0,minimum:0,configured:false,areasSource:source.source};
    if(!source.referenceUnit)ingredient.unitNote='El Excel de áreas no indica unidad. Control por unidad.';
    s.ingredients.push(ingredient);
   }
   if(!ingredient.unit)ingredient.unit=canonicalUnit(source.referenceUnit)||'und';
  }
  const commonUnits=[...new Set(candidates.map(i=>i.sourceUnit||i.unit))];
  const referenceUnit=ingredient?.sourceUnit||ingredient?.unit||(commonUnits.length===1?commonUnits[0]:source.referenceUnit);
  // Una fila original siempre es una opción de pedido, incluso repetida en la misma área.
  result.push({...prior,...source,name:source.name,sourceName:source.name,referenceUnit,ingredientId:ingredient?.id||'',ingredientOptions,suggestedIngredientId:'',linkReviewed:reviewed,active:true,reason:''});
  for(const i of ingredient?[ingredient]:candidates)if(i.category==='Sin clasificar')i.category=category(source.group);
 }
 const currentIds=new Set(result.map(a=>a.id));
 for(const item of previous)if(!currentIds.has(item.id)){
  const manual=['INGRESO DE MERCADERÍA','STOCK DE ALMACÉN','AGREGADO POR ADMINISTRACIÓN'].includes(item.source),ingredient=s.ingredients.find(i=>i.id===item.ingredientId);
  result.push(manual&&ingredient?{...item,referenceUnit:ingredient.sourceUnit||ingredient.unit}:{...item,active:false,reason:'Fila de un formato anterior; conservada para el historial.'});
 }
 s.areaItems=result;s.requests??=[];s.catalogVersion=catalogVersion;s.areasVersion=areasVersion;
 return s;
}
