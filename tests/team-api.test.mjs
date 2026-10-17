import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
globalThis.__shimayaTestEnv={};globalThis.__shimayaTestHeaders=new Headers();
const mockEnv='data:text/javascript,export const env=globalThis.__shimayaTestEnv;';
const mockHeaders='data:text/javascript,export const headers=async()=>globalThis.__shimayaTestHeaders;';
const mockNavigation='data:text/javascript,export const redirect=(url)=>{throw Error(url)};';
registerHooks({resolve(specifier,context,nextResolve){
 if(specifier==='cloudflare:workers')return {url:mockEnv,shortCircuit:true};
 if(specifier==='next/headers')return {url:mockHeaders,shortCircuit:true};
 if(specifier==='next/navigation')return {url:mockNavigation,shortCircuit:true};
 if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const url=new URL(specifier,context.parentURL);if(!path.extname(url.pathname)&&fs.existsSync(fileURLToPath(url)+'.ts'))return {url:pathToFileURL(fileURLToPath(url)+'.ts').href,shortCircuit:true}}
 return nextResolve(specifier,context);
}});
const inventory=await import('../app/api/inventory/route.ts');
const team=await import('../app/api/team/route.ts');
const photos=await import('../app/api/photos/route.ts');
const photo=await import('../app/api/photos/[id]/route.ts');
const {visibleInventory}=await import('../lib/inventory-store.ts');
const {applyAction}=await import('../lib/inventory.ts');
const {areaSource,areasVersion}=await import('../lib/areas-source.ts');
const launch=await import('../app/api/admin/launch-reset/route.ts');
const {launchResetVersion}=await import('../lib/launch-reset.ts');
const opening=await import('../app/api/admin/opening-stock/route.ts');
const documents=await import('../app/api/receipts/documents/route.ts');
const documentDownload=await import('../app/api/receipts/documents/[hash]/route.ts');
const dailyPdf=await import('../app/api/reports/daily/route.ts');
const valuation=await import('../app/api/admin/valuation/route.ts');
const shared=await import('../app/api/consulta/route.ts');
const sharedPdf=await import('../app/api/consulta/daily/route.ts');
const sharedFile=await import('../app/api/consulta/file/[kind]/[hash]/route.ts');
const shareLink=await import('../app/api/admin/share-link/route.ts');
const stock=await import('../app/api/stock/route.ts');
const archive=await import('../app/api/admin/archive/route.ts');
function fixture(){
 delete globalThis.__shimayaTestEnv.CLEAN_LAUNCH_RESET_TOKEN;
 delete globalThis.__shimayaTestEnv.OPENING_STOCK_TOKEN;
 delete globalThis.__shimayaTestEnv.READ_ONLY_SHARE_TOKEN;
 delete globalThis.__shimayaTestEnv.FULL_SITE_EXPORT_TOKEN;
 const sqlite=new DatabaseSync(':memory:');
 for(const name of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 const prepare=sql=>{const statement=sqlite.prepare(sql);let args=[];return {bind(...values){args=values;return this},async run(){return statement.run(...args)},async first(){return statement.get(...args)||null},async all(){return {results:statement.all(...args)}}}};
 globalThis.__shimayaTestEnv.DB={prepare,async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}};const files=new Map();globalThis.__shimayaTestEnv.BUCKET={async put(key,body,options){files.set(key,{body,httpMetadata:options?.httpMetadata})},async head(key){return files.get(key)||null},async get(key){return files.get(key)||null}};globalThis.__shimayaTestHeaders=new Headers();return sqlite;
}
const owner={id:'actual-owner',email:'adrianbarranzuela0108@gmail.com',name:'Adrian'};
const staff={id:'staff-1',email:'cocina@example.com',name:'Cocina'};
const dispatcher={id:'dispatch-1',email:'despacho@example.com',name:'Responsable de despacho'};
function as(user){globalThis.__shimayaTestHeaders=user?new Headers({'oai-authenticated-user-id':user.id,'oai-authenticated-user-email':user.email,'oai-authenticated-user-full-name':encodeURIComponent(user.name),'oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8'}):new Headers()}
const post=(route,body)=>route.POST(new Request('https://shimaya.example/api',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://shimaya.example'},body:JSON.stringify(body)}));
test('Un visitante público no puede inicializarse como administrador ni leer el inventario',async()=>{const db=fixture();as(null);assert.equal((await inventory.GET()).status,401);as(staff);assert.equal((await inventory.GET()).status,500);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inventory_state').get().n,0);as(owner);const r=await inventory.GET();assert.equal(r.status,200);assert.equal((await r.json()).role,'admin');as(staff);const denied=await inventory.GET();assert.equal(denied.status,403);assert.equal((await denied.json()).state,undefined);db.close()});
test('Solicitud, aprobación, pedido y despacho comparten stock y hacen cumplir los permisos',async()=>{
 const db=fixture();as(owner);let data=await (await inventory.GET()).json();const ingredient=data.state.ingredients.find(i=>i.name==='AJONJOLI BLANCO');
 let r=await post(inventory,{type:'ingredient',id:ingredient.id,name:ingredient.name,unit:'kg',stock:10,minimum:0,date:'2026-10-09',revision:data.revision});assert.equal(r.status,200);
 as(staff);r=await post(team,{type:'request-access',area:'Makis',email:owner.email});assert.equal(r.status,200);assert.equal(db.prepare('SELECT email,status FROM team_members').get().email,staff.email);assert.equal((await inventory.GET()).status,403);assert.equal((await post(team,{type:'approve',email:staff.email,area:'Makis',role:'staff'})).status,403);
 as(owner);assert.equal((await post(team,{type:'approve',email:staff.email,area:'Makis',role:'staff'})).status,200);
 as(staff);data=await (await inventory.GET()).json();assert.equal(data.role,'staff');assert.ok(data.state.areaItems.every(i=>i.area==='Makis'));assert.ok(data.state.ingredients.every(i=>i.stock===0));assert.equal(data.state.movements.length,0);
 const item=data.state.areaItems.find(i=>i.ingredientId===ingredient.id),action={type:'solicitar',area:'Makis',requester:'Impersonación',date:'2026-10-09',revision:data.revision,lines:[{itemId:item.id,quantity:3,unit:'kg'}]};
 assert.equal((await post(inventory,{...action,area:'Barra'})).status,403);r=await post(inventory,action);assert.equal(r.status,200);data=await r.json();assert.equal(data.state.requests[0].requester,staff.name);assert.equal(data.state.requests[0].actorId,staff.id);const requestId=data.state.requests[0].id;
 assert.equal((await post(inventory,{type:'despachar',requestId,dispatcher:'Staff',date:'2026-10-09',revision:data.revision,lines:[{itemId:item.id,quantity:1}]})).status,403);
 as(owner);data=await (await inventory.GET()).json();assert.equal(data.state.ingredients.find(i=>i.id===ingredient.id).stock,10);
 const dispatch={type:'despachar',requestId,dispatcher:'Adrian',date:'2026-10-09',revision:data.revision,lines:[{itemId:item.id,quantity:1}]};r=await post(inventory,dispatch);assert.equal(r.status,200);data=await r.json();assert.equal(data.state.ingredients.find(i=>i.id===ingredient.id).stock,9);assert.equal(data.state.requests[0].closed,false);
 assert.equal((await post(inventory,dispatch)).status,409);r=await post(inventory,{...dispatch,revision:data.revision,lines:[{itemId:item.id,quantity:2}]});assert.equal(r.status,200);data=await r.json();assert.equal(data.state.ingredients.find(i=>i.id===ingredient.id).stock,7);assert.equal(data.state.requests[0].closed,true);
 assert.equal((await post(team,{type:'suspend',email:staff.email,area:'Makis'})).status,200);as(staff);r=await inventory.GET();assert.equal(r.status,403);assert.equal((await r.json()).access,'suspended');assert.equal((await post(inventory,action)).status,403);db.close();
});
test('El inicio limpio requiere el secreto del servidor, guarda una copia íntegra y nunca borra operaciones posteriores',async()=>{
 const db=fixture();as(owner);let data=await (await inventory.GET()).json();
 const i=data.state.ingredients.find(i=>i.id==='catalog-012'),item=data.state.areaItems.find(a=>a.area==='Makis'&&a.ingredientId===i.id);
 assert.equal((await post(team,{type:'invite',email:staff.email,area:'Barra',role:'operator'})).status,200);
 let state=applyAction(data.state,{type:'ingredient',date:'2026-10-10',id:i.id,name:i.name,unit:'kg',stock:7,minimum:2,aliases:'Alias conservado'});
 state=applyAction(state,{type:'solicitar',date:'2026-10-10',area:'Makis',requester:'Prueba',lines:[{itemId:item.id,quantity:2,unit:'kg'}]});
 state=applyAction(state,{type:'despachar',date:'2026-10-10',requestId:state.requests[0].id,dispatcher:'Prueba',lines:[{itemId:item.id,quantity:1}]});
 delete state.areasVersion;const original=JSON.stringify(state);db.prepare('UPDATE inventory_state SET data=? WHERE id=?').run(original,owner.id);
 const token='local-test-only-reset-secret-32-characters',call=secret=>launch.POST(new Request('https://shimaya.example/api/admin/launch-reset',{method:'POST',headers:secret?{Authorization:'Bearer '+secret}:{}}));
 as(null);assert.equal((await call(token)).status,403);globalThis.__shimayaTestEnv.CLEAN_LAUNCH_RESET_TOKEN=token;
 assert.equal((await call()).status,403);assert.equal((await call(token+'x')).status,403);assert.equal((await call(token.replace('local','wrong'))).status,403);
 assert.equal(db.prepare('SELECT data FROM inventory_state WHERE id=?').get(owner.id).data,original);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inventory_reset_backups').get().n,0);
 const response=await call(token);assert.equal(response.status,200);const result=await response.json();assert.equal(result.alreadyApplied,false);assert.equal(result.nonzeroStock,0);assert.equal(result.requests,0);assert.equal(result.movements,0);assert.equal(result.areaItems,240);assert.equal(result.ingredients,330);
 const backup=db.prepare('SELECT * FROM inventory_reset_backups').get();assert.equal(backup.data,original);assert.equal(backup.owner_id,owner.id);assert.equal(backup.reset_version,launchResetVersion);assert.equal(backup.revision,data.revision);
 const row=db.prepare('SELECT * FROM inventory_state WHERE id=?').get(owner.id),clean=JSON.parse(row.data);
 assert.ok(clean.ingredients.every(i=>i.stock===0));assert.deepEqual(clean.requests,[]);assert.deepEqual(clean.movements,[]);assert.equal(clean.launchResetVersion,launchResetVersion);
 const preserved=clean.ingredients.find(ingredient=>ingredient.id===i.id);assert.equal(preserved.unit,'kg');assert.equal(preserved.minimum,2);assert.equal(preserved.aliases,'Alias conservado');
 assert.equal(db.prepare('SELECT status,role,area FROM team_members WHERE email=?').get(staff.email).status,'active');assert.equal(db.prepare('SELECT role FROM team_members WHERE email=?').get(staff.email).role,'operator');
 as(owner);data=await (await inventory.GET()).json();assert.equal(data.revision,row.revision);
 state=applyAction(data.state,{type:'solicitar',date:'2026-10-11',area:'Makis',requester:'Primer pedido real',operationId:'real-order',lines:[{itemId:item.id,quantity:1,unit:'kg'}]});
 state=applyAction(state,{type:'despachar',date:'2026-10-11',requestId:state.requests[0].id,dispatcher:'Operación',operationId:'real-delivery',lines:[{itemId:item.id,quantity:1}]});
 db.prepare('UPDATE inventory_state SET data=?,revision=revision+1 WHERE id=?').run(JSON.stringify(state),owner.id);
 const realRow=db.prepare('SELECT * FROM inventory_state WHERE id=?').get(owner.id);const retry=await (await call(token)).json();assert.equal(retry.alreadyApplied,true);assert.equal(retry.requests,1);assert.equal(retry.nonzeroStock,1);assert.equal(retry.movements,2);
 assert.deepEqual(db.prepare('SELECT * FROM inventory_state WHERE id=?').get(owner.id),realRow);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inventory_reset_backups').get().n,1);assert.equal((await (await inventory.GET()).json()).state.requests[0].id,'real-order');
 as(staff);const staffView=await (await inventory.GET()).json();assert.equal(staffView.state.backup,undefined);assert.equal(staffView.state.movements.length,0);assert.equal((await call()).status,403);db.close();
});
test('La actualización persistente conserva stock previo y solo se ejecuta una vez',async()=>{const db=fixture();db.prepare('INSERT INTO inventory_state VALUES(?,?,?)').run('shimaya-workspace-owner-v1',0,JSON.stringify({ownerId:owner.id}));db.prepare('INSERT INTO inventory_state VALUES(?,?,?)').run(owner.id,7,JSON.stringify({ingredients:[{id:'catalog-001',name:'(NO PEDIR) CAJA DE FIDEO RAMEN M (100UND X 120GR)',unit:'caja',stock:16,minimum:0,configured:true,category:'Fideos y arroz'}],movements:[]}));as(owner);let d=await (await inventory.GET()).json();assert.equal(d.revision,8);assert.equal(d.state.ingredients[0].stock,16);assert.equal(d.state.ingredients[0].unit,'und');d=await (await inventory.GET()).json();assert.equal(d.revision,8);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inventory_state').get().n,2);db.close()});
test('Si falla la escritura del inicio limpio, la copia y el reinicio se revierten juntos',async()=>{
 const db=fixture();as(owner);await inventory.GET();const before=db.prepare('SELECT * FROM inventory_state WHERE id=?').get(owner.id);
 globalThis.__shimayaTestEnv.CLEAN_LAUNCH_RESET_TOKEN='local-atomic-test-secret-with-32-characters';
 const originalPrepare=globalThis.__shimayaTestEnv.DB.prepare;
 globalThis.__shimayaTestEnv.DB.prepare=sql=>{const statement=originalPrepare(sql);if(sql.startsWith('UPDATE inventory_state SET data=?,revision=revision+1')&&sql.includes('inventory_reset_backups'))statement.run=async()=>{throw Error('Error de escritura simulado')};return statement};
 const request=()=>new Request('https://shimaya.example/api/admin/launch-reset',{method:'POST',headers:{Authorization:'Bearer '+globalThis.__shimayaTestEnv.CLEAN_LAUNCH_RESET_TOKEN}});
 assert.equal((await launch.POST(request())).status,409);assert.deepEqual(db.prepare('SELECT * FROM inventory_state WHERE id=?').get(owner.id),before);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inventory_reset_backups').get().n,0);
 globalThis.__shimayaTestEnv.DB.prepare=originalPrepare;assert.equal((await launch.POST(request())).status,200);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inventory_reset_backups').get().n,1);db.close();
});
test('Autorizar un correo vincula la cuenta al primer ingreso y no permite otra identidad',async()=>{const db=fixture();as(owner);await inventory.GET();assert.equal((await post(team,{type:'invite',email:staff.email,area:'Ramen'})).status,200);assert.equal(db.prepare('SELECT user_id FROM team_members').get().user_id,null);as(staff);assert.equal((await inventory.GET()).status,200);assert.equal(db.prepare('SELECT user_id FROM team_members').get().user_id,staff.id);as({...staff,id:'otra-identidad'});assert.equal((await inventory.GET()).status,403);db.close()});
test('Solo despacho ve pedidos de otros colaboradores y confirma entregas con identidad verificada',async()=>{
 const db=fixture();as(owner);let data=await (await inventory.GET()).json();const ingredient=data.state.ingredients.find(i=>i.name==='SALSA TERIYAKI');
 data=await (await post(inventory,{type:'ingredient',id:ingredient.id,name:ingredient.name,unit:'Bolsa 500ml',stock:10,minimum:4,date:'2026-10-09',revision:data.revision})).json();
 const makis=data.state.areaItems.find(i=>i.area==='Makis'&&i.active!==false&&i.ingredientId===ingredient.id),other=data.state.areaItems.find(i=>i.area!=='Makis'&&i.active!==false&&i.ingredientId===ingredient.id);
 assert.ok(makis&&other);assert.equal((await post(team,{type:'invite',email:staff.email,area:'Makis',role:'staff'})).status,200);
 as(staff);data=await (await inventory.GET()).json();data=await (await post(inventory,{type:'solicitar',area:'Makis',date:'2026-10-09',revision:data.revision,lines:[{itemId:makis.id,quantity:3,unit:'Bolsa 500ml'}]})).json();const requestId=data.state.requests[0].id;
 as(owner);data=await (await inventory.GET()).json();data=await (await post(inventory,{type:'solicitar',area:other.area,requester:'Otra área',date:'2026-10-09',revision:data.revision,lines:[{itemId:other.id,quantity:2,unit:'Bolsa 500ml'}]})).json();
 assert.equal((await post(team,{type:'invite',email:dispatcher.email,area:'',role:'dispatch'})).status,200);
 as(dispatcher);data=await (await inventory.GET()).json();assert.equal(data.role,'dispatch');assert.equal(data.state.requests.length,2);assert.ok(data.state.requests.some(r=>r.actorId===staff.id));assert.equal(data.state.ingredients.length,1);assert.equal(data.state.ingredients[0].stock,10);assert.equal(data.state.ingredients[0].minimum,0);assert.equal(data.state.movements.length,0);assert.equal(data.state.areaItems.length,2);assert.equal(db.prepare('SELECT user_id FROM team_members WHERE email=?').get(dispatcher.email).user_id,dispatcher.id);
 assert.equal((await (await team.GET()).json()).members,undefined);
 for(const type of ['solicitar','ingredient','conteo','entrada','merma','importar','vincular-area','vincular-areas','revertir','pedido'])assert.equal((await post(inventory,{type,role:'admin',revision:data.revision})).status,403,type);
 assert.equal((await post(team,{type:'invite',email:'otro@example.com',role:'dispatch',area:''})).status,403);assert.equal((await post(team,{type:'approve',email:dispatcher.email,role:'staff',area:''})).status,403);
 assert.equal((await post(photos,{})).status,403);assert.equal((await photo.GET(new Request('https://shimaya.example/api/photos/any'),{params:Promise.resolve({id:'a'.repeat(64)})})).status,403);
 let r=await post(inventory,{type:'despachar',requestId,dispatcher:'Nombre falso',actorId:owner.id,date:'2026-10-09',revision:data.revision,lines:[{itemId:makis.id,quantity:1}]});assert.equal(r.status,200);data=await r.json();let request=data.state.requests.find(r=>r.id===requestId);assert.equal(request.dispatches[0].dispatcher,dispatcher.name);assert.equal(request.closed,false);assert.equal(data.state.ingredients[0].stock,9);assert.equal(data.state.movements.length,0);
 r=await post(inventory,{type:'despachar',requestId,date:'2026-10-09',revision:data.revision,lines:[{itemId:makis.id,quantity:2}]});assert.equal(r.status,200);data=await r.json();assert.equal(data.state.requests.find(r=>r.id===requestId).closed,true);assert.equal(data.state.ingredients[0].stock,7);
 as(owner);const full=await (await inventory.GET()).json();assert.equal(full.state.ingredients.find(i=>i.id===ingredient.id).stock,7);assert.equal(full.state.movements.filter(m=>m.kind==='despacho').length,2);
 assert.equal((await post(team,{type:'suspend',email:dispatcher.email,area:''})).status,200);assert.equal(db.prepare('SELECT role FROM team_members WHERE email=?').get(dispatcher.email).role,'dispatch');as(dispatcher);assert.equal((await inventory.GET()).status,403);assert.equal((await post(inventory,{type:'despachar',revision:data.revision})).status,403);
 as(owner);assert.equal((await post(team,{type:'approve',email:dispatcher.email,area:''})).status,200);as(dispatcher);assert.equal((await (await inventory.GET()).json()).role,'dispatch');as({...dispatcher,id:'otra-identidad'});assert.equal((await inventory.GET()).status,403);db.close();
});
test('Despacho respeta áreas, cambios de perfil y evita que una solicitud se otorgue permisos',async()=>{
 const db=fixture();as(owner);let data=await (await inventory.GET()).json();const ingredient=data.state.ingredients.find(i=>i.name==='SALSA TERIYAKI');data=await (await post(inventory,{type:'ingredient',id:ingredient.id,name:ingredient.name,unit:'Bolsa 500ml',stock:10,minimum:0,date:'2026-10-09',revision:data.revision})).json();
 const makis=data.state.areaItems.find(i=>i.area==='Makis'&&i.active!==false&&i.ingredientId===ingredient.id),other=data.state.areaItems.find(i=>i.area!=='Makis'&&i.active!==false&&i.ingredientId===ingredient.id);
 for(const item of [makis,other])data=await (await post(inventory,{type:'solicitar',area:item.area,requester:'Equipo',date:'2026-10-09',revision:data.revision,lines:[{itemId:item.id,quantity:1,unit:'Bolsa 500ml'}]})).json();
 const outside=data.state.requests.find(r=>r.area!== 'Makis');as(dispatcher);assert.equal((await post(team,{type:'request-access',area:'Makis',role:'dispatch'})).status,200);assert.equal(db.prepare('SELECT role FROM team_members WHERE email=?').get(dispatcher.email).role,'operator');assert.equal((await inventory.GET()).status,403);
 as(owner);assert.equal((await post(team,{type:'approve',email:dispatcher.email,area:'Makis',role:'admin'})).status,400);assert.equal((await post(team,{type:'approve',email:dispatcher.email,area:'Makis',role:'dispatch'})).status,200);
 as(dispatcher);data=await (await inventory.GET()).json();assert.equal(data.role,'dispatch');assert.equal(data.state.requests.length,1);assert.equal(data.state.requests[0].area,'Makis');assert.equal((await post(inventory,{type:'despachar',requestId:outside.id,date:'2026-10-09',revision:data.revision,lines:[{itemId:other.id,quantity:1}]})).status,403);
 as(owner);assert.equal((await post(team,{type:'approve',email:dispatcher.email,area:'Makis',role:'staff'})).status,200);as(dispatcher);data=await (await inventory.GET()).json();assert.equal(data.role,'staff');assert.equal(data.state.requests.length,0);assert.ok(data.state.ingredients.every(i=>i.stock===0));assert.equal((await post(inventory,{type:'despachar',revision:data.revision})).status,403);db.close();
});
test('La vista de despacho conserva vínculos históricos y el insumo fijado en entregas parciales',()=>{
 const state={ingredients:[{id:'old',name:'Anterior',stock:5,minimum:3},{id:'new',name:'Actual',stock:20,minimum:2},{id:'hidden',name:'Privado',stock:99}],movements:[{id:'secret'}],areaItems:[{id:'historical',area:'Makis',ingredientId:'new',active:false},{id:'other-item',area:'Barra',ingredientId:'hidden'}],requests:[{id:'partial',area:'Makis',actorId:'someone',lines:[{itemId:'historical',ingredientId:'old',delivered:1,quantity:3}]}]};
 const view=visibleInventory(state,'dispatch',dispatcher.id,'Makis');assert.equal(view.areaItems.length,1);assert.equal(view.areaItems[0].active,false);assert.deepEqual(view.ingredients.map(i=>i.id),['old']);assert.equal(view.ingredients[0].stock,5);assert.equal(view.ingredients[0].minimum,0);assert.deepEqual(view.movements,[]);assert.equal(state.ingredients[0].minimum,3);
 state.requests[0].lines[0].delivered=0;assert.deepEqual(visibleInventory(state,'dispatch',dispatcher.id).ingredients.map(i=>i.id),['new']);
});
test('Los colaboradores nuevos pueden pedir y despachar sin permisos para ajustar stock o administrar',async()=>{
 const db=fixture();as(owner);let data=await (await inventory.GET()).json();const ingredient=data.state.ingredients.find(i=>i.name==='SALSA TERIYAKI');
 data=await (await post(inventory,{type:'ingredient',id:ingredient.id,name:ingredient.name,unit:ingredient.unit,stock:10,minimum:3,date:'2026-10-09',revision:data.revision})).json();
 const item=data.state.areaItems.find(i=>i.area==='Makis'&&i.active!==false&&i.ingredientId===ingredient.id),outside=data.state.areaItems.find(i=>i.area!=='Makis'&&i.active!==false&&i.ingredientId===ingredient.id);
 assert.equal((await post(team,{type:'invite',email:dispatcher.email,area:'Makis'})).status,200);as(staff);assert.equal((await post(team,{type:'request-access',area:'Makis',role:'admin'})).status,200);assert.equal((await inventory.GET()).status,403);
 as(owner);assert.equal((await post(team,{type:'approve',email:staff.email,area:'Makis'})).status,200);
 as(staff);data=await (await inventory.GET()).json();assert.equal(data.role,'operator');assert.equal(data.userId,staff.id);assert.ok(data.state.areaItems.every(i=>i.area==='Makis'));assert.equal(data.state.requests.length,0);assert.ok(data.state.ingredients.every(i=>i.stock===0));
 const order={type:'solicitar',area:'Makis',requester:'Falso',date:'2026-10-09',revision:data.revision,lines:[{itemId:item.id,quantity:3,unit:ingredient.unit}]};assert.equal((await post(inventory,{...order,area:outside.area})).status,403);let response=await post(inventory,order);assert.equal(response.status,200);data=await response.json();const request=data.state.requests[0];assert.equal(request.requester,staff.name);assert.equal(data.state.ingredients.find(i=>i.id===ingredient.id).stock,10);
 as(dispatcher);data=await (await inventory.GET()).json();assert.equal(data.role,'operator');assert.equal(data.userId,dispatcher.id);assert.equal(data.state.requests[0].id,request.id);assert.equal(data.state.requests[0].actorId,staff.id);
 for(const type of ['ingredient','conteo','entrada','merma','importar','vincular-area','vincular-areas','revertir'])assert.equal((await post(inventory,{type,revision:data.revision})).status,403,type);
 assert.equal((await post(team,{type:'approve',email:dispatcher.email,area:'',role:'admin'})).status,403);assert.equal((await post(photos,{})).status,403);
 const dispatch={type:'despachar',requestId:request.id,dispatcher:'Falso',date:'2026-10-09',revision:data.revision,lines:[{itemId:item.id,quantity:1}]};response=await post(inventory,dispatch);assert.equal(response.status,200);data=await response.json();assert.equal(data.state.ingredients.find(i=>i.id===ingredient.id).stock,9);assert.equal(data.state.requests[0].closed,false);assert.equal(data.state.requests[0].dispatches[0].dispatcher,dispatcher.name);assert.equal(data.state.movements.length,0);assert.equal((await post(inventory,dispatch)).status,409);
 response=await post(inventory,{...dispatch,revision:data.revision,lines:[{itemId:item.id,quantity:2}]});assert.equal(response.status,200);data=await response.json();assert.equal(data.state.ingredients.find(i=>i.id===ingredient.id).stock,7);assert.equal(data.state.requests[0].closed,true);
 response=await post(inventory,{type:'solicitar',area:'Makis',date:'2026-10-09',revision:data.revision,lines:[{itemId:item.id,quantity:1,unit:ingredient.unit}]});assert.equal(response.status,200);data=await response.json();assert.ok(data.state.requests.some(r=>r.actorId===dispatcher.id));assert.equal(data.state.ingredients.find(i=>i.id===ingredient.id).stock,7);
 as(owner);data=await (await inventory.GET()).json();data=await (await post(inventory,{type:'solicitar',area:outside.area,requester:'Otra área',date:'2026-10-09',revision:data.revision,lines:[{itemId:outside.id,quantity:1,unit:ingredient.unit}]})).json();const outsideRequest=data.state.requests.find(r=>r.area===outside.area);
 as(dispatcher);data=await (await inventory.GET()).json();assert.ok(data.state.requests.every(r=>r.area==='Makis'));assert.equal((await post(inventory,{...dispatch,requestId:outsideRequest.id,revision:data.revision,lines:[{itemId:outside.id,quantity:1}]})).status,403);
 as(owner);assert.equal((await post(team,{type:'suspend',email:dispatcher.email,area:'Makis'})).status,200);as(dispatcher);assert.equal((await inventory.GET()).status,403);assert.equal((await post(inventory,{...order,revision:data.revision})).status,403);assert.equal((await post(inventory,{...dispatch,revision:data.revision})).status,403);db.close();
});
test('Los permisos anteriores pasan a ambas tareas una sola vez y conservan cuentas y suspensiones',async()=>{
 const db=fixture(),now='2026-10-09T12:00:00Z';db.prepare('INSERT INTO inventory_state VALUES(?,?,?)').run('shimaya-workspace-owner-v1',0,JSON.stringify({ownerId:owner.id,keep:'conservar'}));
 const add=db.prepare('INSERT INTO team_members(email,user_id,name,area,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');add.run(staff.email,staff.id,staff.name,'Makis','staff','active',now,now);add.run(dispatcher.email,dispatcher.id,dispatcher.name,'Ramen','dispatch','active',now,now);add.run('suspendido@example.com','suspended-id','Suspendido','Barra','dispatch','suspended',now,now);add.run('pendiente@example.com','pending-id','Pendiente','Makis','staff','pending',now,now);
 as(staff);let data=await (await inventory.GET()).json();assert.equal(data.role,'operator');assert.equal(data.area,'Makis');as(dispatcher);assert.equal((await (await inventory.GET()).json()).role,'operator');
 const members=db.prepare('SELECT * FROM team_members').all();assert.ok(members.every(m=>m.role==='operator'));assert.equal(members.find(m=>m.email===staff.email).user_id,staff.id);assert.equal(members.find(m=>m.email==='suspendido@example.com').status,'suspended');assert.equal(members.find(m=>m.email==='pendiente@example.com').status,'pending');assert.ok(members.every(m=>m.created_at===now&&m.updated_at===now));const settings=JSON.parse(db.prepare('SELECT data FROM inventory_state WHERE id=?').get('shimaya-workspace-owner-v1').data);assert.equal(settings.ownerId,owner.id);assert.equal(settings.keep,'conservar');assert.equal(settings.teamAccessVersion,'pedido-despacho-v1');
 as({id:'suspended-id',email:'suspendido@example.com',name:'Suspendido'});assert.equal((await inventory.GET()).status,403);as({id:'pending-id',email:'pendiente@example.com',name:'Pendiente'});assert.equal((await inventory.GET()).status,403);
 as(owner);assert.equal((await (await inventory.GET()).json()).role,'admin');assert.equal((await post(team,{type:'approve',email:staff.email,area:'Makis',role:'staff'})).status,200);as(staff);assert.equal((await (await inventory.GET()).json()).role,'staff');assert.equal((await (await inventory.GET()).json()).role,'staff');db.close();
});
test('Pedidos sin stock y eliminación administrativa verifican identidad, permisos, concurrencia y vistas del equipo',async()=>{
 const db=fixture();as(owner);let data=await (await inventory.GET()).json();
 const ingredient=data.state.ingredients.find(i=>i.name==='AJONJOLI BLANCO'),item=data.state.areaItems.find(i=>i.area==='Makis'&&i.ingredientId===ingredient.id);
 for(const [user,role] of [[staff,'staff'],[dispatcher,'dispatch'],[{id:'operator-1',email:'operador@example.com',name:'Operador'},'operator']])assert.equal((await post(team,{type:'invite',email:user.email,area:'Makis',role})).status,200);
 as(staff);data=await (await inventory.GET()).json();let response=await post(inventory,{type:'solicitar',area:'Makis',date:'2026-10-10',revision:data.revision,lines:[{itemId:item.id,quantity:3,unit:ingredient.unit}]});assert.equal(response.status,200);data=await response.json();const requestId=data.state.requests[0].id;
 as(owner);data=await (await inventory.GET()).json();assert.equal(data.state.ingredients.find(i=>i.id===ingredient.id).stock,0);
 data=await (await post(inventory,{type:'ingredient',id:ingredient.id,name:ingredient.name,stock:5,minimum:0,unit:ingredient.unit,date:'2026-10-10',revision:data.revision})).json();const oldRevision=data.revision;
 response=await post(inventory,{type:'despachar',requestId,dispatcher:'Almacén',date:'2026-10-10',revision:data.revision,lines:[{itemId:item.id,quantity:1}]});assert.equal(response.status,200);data=await response.json();assert.equal(data.state.ingredients.find(i=>i.id===ingredient.id).stock,4);
 const deletion={type:'eliminar-orden',requestId,deletedBy:'Otro administrador',actorId:'otra-cuenta',role:'admin',note:'Duplicada',date:'2026-10-10',revision:data.revision,operationId:'delete-api'};
 for(const user of [staff,dispatcher,{id:'operator-1',email:'operador@example.com',name:'Operador'}]){as(user);assert.equal((await post(inventory,deletion)).status,403)}
 as(owner);assert.equal((await post(inventory,{...deletion,revision:oldRevision})).status,409);assert.equal((await (await inventory.GET()).json()).state.requests[0].deleted,undefined);
 response=await post(inventory,deletion);assert.equal(response.status,200);data=await response.json();assert.equal(data.state.ingredients.find(i=>i.id===ingredient.id).stock,5);assert.equal(data.state.requests[0].deleted.by,owner.name);assert.equal(data.state.requests[0].deleted.actorId,owner.id);assert.equal(data.state.requests[0].deleted.note,'Duplicada');assert.equal(data.state.movements[0].kind,'eliminar-orden');assert.equal(data.state.movements[0].lines[0].delta,1);
 const movementCount=data.state.movements.length;response=await post(inventory,{...deletion,revision:data.revision});assert.equal(response.status,200);data=await response.json();assert.equal(data.state.movements.length,movementCount);assert.equal(data.state.ingredients.find(i=>i.id===ingredient.id).stock,5);
 assert.equal((await post(inventory,{...deletion,revision:data.revision,operationId:'delete-again'})).status,400);
 for(const user of [staff,dispatcher,{id:'operator-1',email:'operador@example.com',name:'Operador'}]){as(user);const view=await (await inventory.GET()).json();assert.equal(view.state.requests.length,0);assert.equal(view.state.movements.length,0);if(user.id!==staff.id)assert.equal((await post(inventory,{type:'despachar',requestId,date:'2026-10-10',revision:view.revision,lines:[{itemId:item.id,quantity:1}]})).status,400)}
 as(owner);const full=await (await inventory.GET()).json();assert.equal(full.state.requests.length,1);assert.ok(full.state.requests[0].deleted);assert.equal(full.state.ingredients.find(i=>i.id===ingredient.id).stock,5);db.close();
});
test('Un error al devolver stock no guarda cambios parciales ni una orden eliminada',async()=>{
 const db=fixture();as(owner);let data=await (await inventory.GET()).json(),s=data.state;
 for(const name of ['AJONJOLI BLANCO','AJONJOLI NEGRO']){const i=s.ingredients.find(i=>i.name===name);s=applyAction(s,{type:'ingredient',id:i.id,name:i.name,stock:10,minimum:0,unit:i.unit,date:'2026-10-10'})}
 const items=s.areaItems.filter(i=>i.area==='Makis'&&['catalog-012','catalog-013'].includes(i.ingredientId));s=applyAction(s,{type:'solicitar',area:'Makis',requester:'Equipo',date:'2026-10-10',lines:items.map(i=>({itemId:i.id,quantity:1,unit:'kg'}))});s=applyAction(s,{type:'despachar',requestId:s.requests[0].id,dispatcher:'Almacén',date:'2026-10-10',lines:items.map(i=>({itemId:i.id,quantity:1}))});s.ingredients=s.ingredients.filter(i=>i.name!=='AJONJOLI NEGRO');
 const stored=JSON.stringify(s);db.prepare('UPDATE inventory_state SET data=? WHERE id=?').run(stored,owner.id);
 const r=await post(inventory,{type:'eliminar-orden',requestId:s.requests[0].id,date:'2026-10-10',revision:data.revision});assert.equal(r.status,400);const row=db.prepare('SELECT data,revision FROM inventory_state WHERE id=?').get(owner.id);assert.equal(row.data,stored);assert.equal(row.revision,data.revision);db.close();
});
test('El equipo puede despachar con stock inicial sin registrar y saldo negativo; el inventario lo guarda para administración',async()=>{
 const db=fixture();as(owner);let data=await (await inventory.GET()).json();const ingredient=data.state.ingredients.find(i=>i.name==='AJONJOLI BLANCO'),item=data.state.areaItems.find(i=>i.area==='Makis'&&i.ingredientId===ingredient.id);
 for(const [user,role] of [[staff,'operator'],[dispatcher,'dispatch']])assert.equal((await post(team,{type:'invite',email:user.email,area:'Makis',role})).status,200);
 as(staff);data=await (await inventory.GET()).json();let response=await post(inventory,{type:'solicitar',area:'Makis',date:'2026-10-10',revision:data.revision,lines:[{itemId:item.id,quantity:3,unit:'kg'}]});assert.equal(response.status,200);data=await response.json();const requestId=data.state.requests[0].id;
 response=await post(inventory,{type:'despachar',requestId,date:'2026-10-10',revision:data.revision,operationId:'team-negative-partial',lines:[{itemId:item.id,quantity:1}]});assert.equal(response.status,200);data=await response.json();assert.equal(data.state.ingredients.find(i=>i.id===ingredient.id).stock,-1);assert.equal(data.state.requests[0].dispatches[0].dispatcher,staff.name);assert.equal(data.state.requests[0].closed,false);
 as(dispatcher);data=await (await inventory.GET()).json();assert.equal(data.state.ingredients[0].stock,-1);
 response=await post(inventory,{type:'despachar',requestId,dispatcher:'Nombre falso',date:'2026-10-10',revision:data.revision,operationId:'team-negative-complete',lines:[{itemId:item.id,quantity:2}]});assert.equal(response.status,200);data=await response.json();assert.equal(data.state.ingredients[0].stock,-3);assert.equal(data.state.requests[0].closed,true);assert.equal(data.state.requests[0].dispatches[1].dispatcher,dispatcher.name);
 for(const type of ['conteo','entrada','eliminar-orden'])assert.equal((await post(inventory,{type,revision:data.revision,date:'2026-10-10'})).status,403);
 as(owner);data=await (await inventory.GET()).json();assert.equal(data.state.ingredients.find(i=>i.id===ingredient.id).stock,-3);assert.equal(data.state.ingredients.find(i=>i.id===ingredient.id).configured,true);assert.equal(data.state.movements.filter(m=>m.kind==='despacho').length,2);
 response=await post(inventory,{type:'entrada',date:'2026-10-10',revision:data.revision,lines:[{ingredientId:ingredient.id,amount:1}]});assert.equal(response.status,200);data=await response.json();assert.equal(data.state.ingredients.find(i=>i.id===ingredient.id).stock,-2);
 response=await post(inventory,{type:'eliminar-orden',requestId,date:'2026-10-10',revision:data.revision});assert.equal(response.status,200);data=await response.json();assert.equal(data.state.ingredients.find(i=>i.id===ingredient.id).stock,1);assert.ok(data.state.requests[0].deleted);
 db.close();
});
test('La carga conserva las 46 filas originales de Barra y el nuevo tamarindo al migrar áreas',async()=>{
 const db=fixture();as(owner);let data=await (await inventory.GET()).json();
 let s=data.state;const i=s.ingredients.find(i=>i.id==='catalog-012'),item=s.areaItems.find(a=>a.ingredientId===i.id);
 s=applyAction(s,{type:'solicitar',date:'2026-10-11',area:item.area,requester:'Anterior',lines:[{itemId:item.id,quantity:3,unit:'kg'}]});
 s=applyAction(s,{type:'despachar',date:'2026-10-11',requestId:s.requests[0].id,dispatcher:'Anterior',lines:[{itemId:item.id,quantity:1}]});
 delete s.areasVersion;s.ingredients=s.ingredients.filter(i=>!i.areasSource);s.areaItems=s.areaItems.filter(i=>i.id!=='area-barra-24'&&!!i.ingredientId);
 for(const a of s.areaItems)a.name=s.ingredients.find(i=>i.id===a.ingredientId)?.name||a.name;
 const oldIngredients=structuredClone(s.ingredients),oldRequests=structuredClone(s.requests),oldMovements=structuredClone(s.movements),revision=data.revision;
 db.prepare('UPDATE inventory_state SET data=? WHERE id=?').run(JSON.stringify(s),owner.id);
 data=await (await inventory.GET()).json();assert.equal(data.revision,revision+1);assert.equal(data.state.areasVersion,areasVersion);assert.equal(data.state.areaItems.filter(a=>a.active!==false).length,240);
 assert.deepEqual(data.state.ingredients.filter(i=>i.catalogId),oldIngredients.filter(i=>i.catalogId));assert.deepEqual(data.state.requests,oldRequests);assert.deepEqual(data.state.movements,oldMovements);assert.ok(data.state.ingredients.filter(i=>i.areasSource).every(i=>i.stock===0&&i.configured===false));
 assert.equal((await (await inventory.GET()).json()).revision,data.revision);
 assert.equal((await post(team,{type:'invite',email:staff.email,area:'Barra',role:'operator'})).status,200);
 as(staff);data=await (await inventory.GET()).json();const rows=data.state.areaItems.filter(i=>i.active!==false);assert.equal(rows.length,47);assert.deepEqual(rows.filter(i=>i.source!=='AGREGADO POR ADMINISTRACIÓN').map(i=>i.name),areaSource.filter(i=>i.area==='Barra').map(i=>i.name));assert.ok(rows.some(i=>i.ingredientId==='catalog-217'));assert.ok(data.state.ingredients.some(i=>i.name==='COULIS DE FRAMBUESA'));assert.equal(data.state.movements.length,0);db.close();
});
test('El operador ve las presentaciones de SOJU, rechaza otras y despacha la elegida con stock cero',async()=>{
 const db=fixture();as(owner);await inventory.GET();assert.equal((await post(team,{type:'invite',email:staff.email,area:'Barra',role:'operator'})).status,200);
 as(staff);let data=await (await inventory.GET()).json();const item=data.state.areaItems.find(i=>i.name==='SOJU'),ingredientId=item.ingredientOptions[3];
 assert.equal(item.ingredientOptions.length,6);assert.ok(item.ingredientOptions.every(id=>data.state.ingredients.some(i=>i.id===id)));
 const action={type:'solicitar',date:'2026-10-11',revision:data.revision,area:'Barra',lines:[{itemId:item.id,quantity:2,unit:'caja'}]};
 assert.equal((await post(inventory,action)).status,400);assert.equal((await post(inventory,{...action,lines:[{...action.lines[0],ingredientId:'catalog-012'}]})).status,400);
 let response=await post(inventory,{...action,lines:[{...action.lines[0],ingredientId}]});assert.equal(response.status,200);data=await response.json();assert.equal(data.state.requests[0].lines[0].name,'SOJU');assert.equal(data.state.requests[0].lines[0].ingredientId,ingredientId);
 response=await post(inventory,{type:'despachar',date:'2026-10-11',revision:data.revision,requestId:data.state.requests[0].id,lines:[{itemId:item.id,quantity:2}]});assert.equal(response.status,200);data=await response.json();assert.equal(data.state.ingredients.find(i=>i.id===ingredientId).stock,-2);assert.equal(data.state.requests[0].closed,true);
 as(owner);data=await (await inventory.GET()).json();assert.ok(data.state.ingredients.filter(i=>i.id!==ingredientId).every(i=>i.stock===0));assert.equal(data.state.movements[0].lines[0].ingredientId,ingredientId);db.close();
});

test('La carga real de stock requiere autorización, guarda el inventario anterior y no borra una entrada posterior',async()=>{
 const db=fixture();as(owner);await inventory.GET();const before=db.prepare('SELECT * FROM inventory_state WHERE id=?').get(owner.id);
 const token='opening-stock-local-test-32-characters',call=()=>opening.POST(new Request('https://shimaya.example/api/admin/opening-stock',{method:'POST',headers:{Authorization:'Bearer '+token}}));
 assert.equal((await call()).status,403);globalThis.__shimayaTestEnv.OPENING_STOCK_TOKEN=token;as(null);assert.equal((await opening.GET()).status,401);
 const result=await (await call()).json();assert.equal(result.alreadyApplied,false);assert.equal(result.sourceRows,150);assert.equal(result.ingredients,333);assert.equal(result.zeroStock,184);assert.equal(result.unconfigured,0);assert.equal(result.rows.find(r=>r.input==='Ebi furai').stock,60);assert.equal(result.rows.find(r=>r.input==='Chasu').stock,124);
 const backup=db.prepare('SELECT data,revision FROM inventory_reset_backups').get();assert.equal(backup.data,before.data);assert.equal(backup.revision,before.revision);
 as(owner);let data=await (await inventory.GET()).json();const response=await post(inventory,{type:'recepcion',date:'2026-10-12',reference:'POST-CARGA',revision:data.revision,lines:[{ingredientId:'catalog-092',quantity:1,unit:'paquete'}]});assert.equal(response.status,200);data=await response.json();assert.equal(data.state.ingredients.find(i=>i.id==='catalog-092').stock,90);
 const revision=data.revision;const retry=await (await call()).json();assert.equal(retry.alreadyApplied,true);assert.equal(retry.revision,revision);assert.equal(retry.rows.find(r=>r.input==='Ebi furai').stock,90);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inventory_reset_backups').get().n,1);
 assert.equal((await opening.GET()).status,200);assert.equal((await post(team,{type:'invite',email:staff.email,area:'Makis'})).status,200);as(staff);assert.equal((await opening.GET()).status,403);assert.equal((await post(inventory,{type:'recepcion',date:'2026-10-12',reference:'STAFF',revision,lines:[{ingredientId:'catalog-092',quantity:1,unit:'und'}]})).status,403);db.close();
});
test('Los documentos PDF son privados y solo se adjuntan a entradas si fueron subidos al almacén correcto',async()=>{
 const db=fixture();as(owner);await inventory.GET();globalThis.__shimayaTestEnv.OPENING_STOCK_TOKEN='opening-stock-pdf-test-32-characters';
 await opening.POST(new Request('https://shimaya.example/api/admin/opening-stock',{method:'POST',headers:{Authorization:'Bearer '+globalThis.__shimayaTestEnv.OPENING_STOCK_TOKEN}}));
 const upload=bytes=>{const form=new FormData();form.append('file',new File([bytes],'guia.pdf',{type:'application/pdf'}));return documents.POST(new Request('https://shimaya.example/api/receipts/documents',{method:'POST',body:form,headers:{origin:'https://shimaya.example'}}))};
 assert.equal((await upload('not a PDF')).status,400);const uploaded=await upload('%PDF-1.4\nlocal fixture');assert.equal(uploaded.status,200);const attachment=await uploaded.json();assert.match(attachment.hash,/^[a-f0-9]{64}$/);
 const params={params:Promise.resolve({hash:attachment.hash})};let response=await documentDownload.GET(new Request('https://shimaya.example/api/receipts/documents/'+attachment.hash),params);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'application/pdf');
 let data=await (await inventory.GET()).json();const action={type:'recepcion',date:'2026-10-12',reference:'PDF-001',document:attachment,revision:data.revision,lines:[{ingredientId:'catalog-092',quantity:1,unit:'paquete'}]};
 assert.equal((await post(inventory,{...action,document:{hash:'f'.repeat(64),name:'otro.pdf'}})).status,400);response=await post(inventory,action);assert.equal(response.status,200);data=await response.json();assert.equal(data.state.ingredients.find(i=>i.id==='catalog-092').stock,90);assert.equal(data.state.movements[0].document.hash,attachment.hash);
 assert.equal((await post(team,{type:'invite',email:staff.email,area:'Makis'})).status,200);as(staff);assert.equal((await upload('%PDF-1.4\nlocal fixture')).status,403);assert.equal((await documentDownload.GET(new Request('https://shimaya.example/'),params)).status,403);as(null);assert.equal((await upload('%PDF-1.4')).status,401);assert.equal((await documentDownload.GET(new Request('https://shimaya.example/'),params)).status,401);db.close();
});
test('Solo administración descarga un PDF diario y las fechas inválidas no generan un reporte',async()=>{
 const db=fixture();as(owner);await inventory.GET();const get=date=>dailyPdf.GET(new Request('https://shimaya.example/api/reports/daily?date='+date));
 const response=await get('2026-10-11');assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'application/pdf');assert.match(response.headers.get('Content-Disposition'),/shimaya-reporte-2026-10-11.pdf/);const bytes=new Uint8Array(await response.arrayBuffer());assert.equal(new TextDecoder().decode(bytes.slice(0,5)),'%PDF-');
 assert.equal((await get('2026-02-30')).status,400);assert.equal((await get('2026-10-11%0Aother')).status,400);assert.equal((await post(team,{type:'invite',email:staff.email,area:'Makis'})).status,200);as(staff);assert.equal((await get('2026-10-11')).status,403);as(null);assert.equal((await get('2026-10-11')).status,401);db.close();
});

test('Solo el maestro puede leer o escribir costos; inventario y despacho del personal no contienen precios',async()=>{
 const db=fixture();as(owner);await inventory.GET();
 const before=db.prepare('SELECT revision,data FROM inventory_state WHERE id=?').get(owner.id);
 let response=await valuation.GET();assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/private.*no-store/);let costs=await response.json();assert.equal(costs.summary.priced,168);
 assert.deepEqual(db.prepare('SELECT revision,data FROM inventory_state WHERE id=?').get(owner.id),before);
 const ebi=costs.rows.find(r=>r.name==='EBI FURAI PAQUETE DE 30 UNIDADES'),action={ingredientId:ebi.ingredientId,basis:ebi.basis,gross:1.1,note:'Actualización real',revision:costs.revision};
 response=await post(valuation,action);assert.equal(response.status,200);costs=await response.json();assert.equal(costs.rows.find(r=>r.ingredientId===ebi.ingredientId).unitGross,1.1);
 assert.equal((await post(valuation,action)).status,409);assert.deepEqual(db.prepare('SELECT revision,data FROM inventory_state WHERE id=?').get(owner.id),before);
 assert.ok(!JSON.stringify(await (await inventory.GET()).json()).includes('unitGross'));
 for(const role of ['operator','staff','dispatch']){
  const email=role+'@example.com',person={id:role,email,name:role};as(owner);assert.equal((await post(team,{type:'invite',email,name:role,role,area:''})).status,200);
  as(person);assert.equal((await valuation.GET()).status,403);assert.equal((await post(valuation,{...action,revision:costs.revision,ownerId:owner.id})).status,403);
  const visible=await (await inventory.GET()).json();assert.ok(!JSON.stringify(visible).includes('unitGross'));assert.ok(!JSON.stringify(visible).includes('F003-4761'));
 }
 as(null);assert.equal((await valuation.GET()).status,401);assert.equal((await post(valuation,action)).status,401);
 as({id:'other-owner',email:owner.email,name:'Maestro falso'});assert.equal((await valuation.GET()).status,403);db.close();
});
test('Un costo manual persiste y las solicitudes de otro origen y valores inválidos se rechazan',async()=>{
 const db=fixture();as(owner);await inventory.GET();let costs=await (await valuation.GET()).json(),row=costs.rows.find(r=>r.unitGross===null);const a={ingredientId:row.ingredientId,basis:row.basis,gross:20.5,note:'Compra local',revision:costs.revision};
 let response=await post(valuation,a);assert.equal(response.status,200);let updated=await response.json();assert.equal(updated.revision,costs.revision+1);
 costs=await (await valuation.GET()).json();assert.equal(costs.rows.find(r=>r.ingredientId===row.ingredientId).unitGross,20.5);assert.equal(costs.rows.find(r=>r.ingredientId===row.ingredientId).manual,true);
 assert.equal((await valuation.POST(new Request('https://shimaya.example/api/admin/valuation',{method:'POST',headers:{origin:'https://otro.example','Content-Type':'application/json'},body:JSON.stringify({...a,revision:costs.revision})}))).status,403);
 assert.equal((await post(valuation,{...a,revision:costs.revision,gross:-1})).status,400);
 assert.equal((await post(valuation,{...a,revision:costs.revision,basis:'Unidad incompatible'})).status,400);
 assert.equal((await post(valuation,{...a,revision:costs.revision,gross:null})).status,200);assert.equal((await (await valuation.GET()).json()).rows.find(r=>r.ingredientId===row.ingredientId).unitGross,null);db.close();
});

test('El personal autorizado puede entregar más que lo pedido; la API descuenta una vez y administración devuelve todo al eliminar',async()=>{
 const db=fixture();as(owner);await inventory.GET();assert.equal((await post(team,{type:'invite',email:staff.email,area:'Makis',role:'operator'})).status,200);
 as(staff);let data=await (await inventory.GET()).json();const item=data.state.areaItems.find(i=>i.ingredientId==='catalog-012');
 let response=await post(inventory,{type:'solicitar',date:'2026-10-11',area:'Makis',revision:data.revision,lines:[{itemId:item.id,quantity:3,unit:'kg'}]});assert.equal(response.status,200);data=await response.json();const requestId=data.state.requests[0].id;
 const action={type:'despachar',date:'2026-10-11',requestId,revision:data.revision,operationId:'api-extra-once',lines:[{itemId:item.id,quantity:5}]};response=await post(inventory,action);assert.equal(response.status,200);data=await response.json();assert.equal(data.state.requests[0].lines[0].quantity,3);assert.equal(data.state.requests[0].lines[0].delivered,5);assert.equal(data.state.requests[0].dispatches[0].dispatcher,staff.name);assert.equal(data.state.ingredients.find(i=>i.id===item.ingredientId).stock,-5);assert.equal(data.state.requests[0].closed,true);
 assert.equal((await post(inventory,action)).status,409);response=await post(inventory,{...action,revision:data.revision});assert.equal(response.status,200);data=await response.json();assert.equal(data.state.ingredients.find(i=>i.id===item.ingredientId).stock,-5);
 as(owner);data=await (await inventory.GET()).json();assert.equal(data.state.movements.filter(m=>m.id==='api-extra-once').length,1);response=await post(inventory,{type:'eliminar-orden',date:'2026-10-11',requestId,revision:data.revision});assert.equal(response.status,200);data=await response.json();assert.equal(data.state.ingredients.find(i=>i.id===item.ingredientId).stock,0);db.close();
});

test('Arroz de personal se incorpora una vez en Makis, conserva el stock anterior y se pide y despacha desde cero',async()=>{
 const db=fixture();as(owner);let data=await (await inventory.GET()).json();
 // Inventario anterior al nuevo insumo, con saldos y pedidos ya registrados.
 let legacy=structuredClone(data.state);delete legacy.addedItemsVersion;legacy.areaItems=legacy.areaItems.filter(i=>i.name!=='Arroz de personal');legacy.ingredients=legacy.ingredients.filter(i=>i.name!=='Arroz de personal');const japanese=legacy.ingredients.find(i=>i.id==='catalog-017');japanese.stock=18;japanese.minimum=7;japanese.configured=true;
 const oldItem=legacy.areaItems.find(i=>i.area==='Makis'&&i.ingredientId==='catalog-012');legacy=applyAction(legacy,{type:'solicitar',date:'2026-10-12',area:'Makis',requester:'Equipo anterior',lines:[{itemId:oldItem.id,quantity:2,unit:'kg'}]});const requests=structuredClone(legacy.requests),movements=structuredClone(legacy.movements);
 const beforeRevision=data.revision;db.prepare('UPDATE inventory_state SET data=? WHERE id=?').run(JSON.stringify(legacy),owner.id);
 data=await (await inventory.GET()).json();assert.equal(data.revision,beforeRevision+1);assert.deepEqual(data.state.requests,requests);assert.deepEqual(data.state.movements,movements);assert.equal(data.state.ingredients.find(i=>i.id===japanese.id).stock,18);assert.equal(data.state.ingredients.find(i=>i.id===japanese.id).minimum,7);
 const item=data.state.areaItems.find(i=>i.name==='Arroz de personal');assert.equal(item.area,'Makis');assert.equal(item.active,true);const rice=data.state.ingredients.find(i=>i.id===item.ingredientId);assert.equal(rice.unit,'kg');assert.equal(rice.stock,0);assert.equal(rice.configured,true);assert.notEqual(rice.id,japanese.id);const revision=data.revision;
 data=await (await inventory.GET()).json();assert.equal(data.revision,revision);assert.equal(data.state.areaItems.filter(i=>i.name==='Arroz de personal'&&i.area==='Makis').length,1);
 assert.equal((await post(team,{type:'invite',email:staff.email,area:'Makis',role:'operator'})).status,200);as(staff);data=await (await inventory.GET()).json();assert.ok(data.state.areaItems.some(i=>i.id===item.id));
 let response=await post(inventory,{type:'solicitar',date:'2026-10-12',area:'Makis',revision:data.revision,lines:[{itemId:item.id,quantity:1.5,unit:'kg'}]});assert.equal(response.status,200);data=await response.json();const requestId=data.state.requests[0].id;
 response=await post(inventory,{type:'despachar',date:'2026-10-12',requestId,revision:data.revision,lines:[{itemId:item.id,quantity:2}]});assert.equal(response.status,200);data=await response.json();assert.equal(data.state.ingredients.find(i=>i.id===rice.id).stock,-2);
 as(owner);data=await (await inventory.GET()).json();delete data.state.areasVersion;db.prepare('UPDATE inventory_state SET data=? WHERE id=?').run(JSON.stringify(data.state),owner.id);data=await (await inventory.GET()).json();assert.equal(data.state.areaItems.find(i=>i.id===item.id).active,true);assert.equal(data.state.ingredients.find(i=>i.id===rice.id).stock,-2);assert.equal(data.state.ingredients.find(i=>i.id===japanese.id).stock,18);db.close();
});

test('El enlace anónimo consulta todo el espacio y sus costos sin escribir inventario, permisos ni costos',async()=>{
 const db=fixture();as(owner);let original=await (await inventory.GET()).json();
 const i=original.state.ingredients.find(i=>i.id==='catalog-012'),item=original.state.areaItems.find(a=>a.area==='Makis'&&a.ingredientId===i.id);
 let state=applyAction(original.state,{type:'ingredient',date:'2026-10-12',id:i.id,name:i.name,unit:'kg',stock:7,minimum:2});
 state=applyAction(state,{type:'solicitar',date:'2026-10-12',area:'Makis',requester:'Cocina',lines:[{itemId:item.id,quantity:2,unit:'kg'}]});
 state=applyAction(state,{type:'despachar',date:'2026-10-12',requestId:state.requests[0].id,dispatcher:'Almacén',lines:[{itemId:item.id,quantity:3}]});
 delete state.areasVersion;delete state.addedItemsVersion;
 db.prepare('UPDATE inventory_state SET data=? WHERE id=?').run(JSON.stringify(state),owner.id);
 assert.equal((await post(team,{type:'invite',email:staff.email,area:'Barra',role:'operator'})).status,200);
 await valuation.GET(); // Inicialización autorizada del libro de costos, antes de la consulta.
 const dump=()=>({inventory:db.prepare('SELECT * FROM inventory_state ORDER BY id').all(),costs:db.prepare('SELECT * FROM inventory_costs ORDER BY owner_id').all(),members:db.prepare('SELECT * FROM team_members ORDER BY email').all()});
 // Fuerza también la actualización del catálogo en memoria, sin persistirla en una visita.
 const outdated=JSON.parse(db.prepare('SELECT data FROM inventory_state WHERE id=?').get(owner.id).data);delete outdated.areasVersion;delete outdated.addedItemsVersion;db.prepare('UPDATE inventory_state SET data=? WHERE id=?').run(JSON.stringify(outdated),owner.id);
 const before=dump(),secret='anonymous-read-only-test-token-01234567890123456789';globalThis.__shimayaTestEnv.READ_ONLY_SHARE_TOKEN=secret;
 as(null);
 const call=token=>shared.GET(new Request('https://shimaya.example/api/consulta?ownerId=another-owner&role=admin',{headers:token?{Authorization:'Bearer '+token}:{}}));
 assert.equal((await call()).status,403);assert.equal((await call(secret+'x')).status,403);assert.equal((await call(secret.replace('anonymous','untrusted'))).status,403);
 const response=await call(secret);assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.equal(response.headers.get('Vary'),'Authorization');
 const result=await response.json();assert.equal(result.role,'viewer');assert.equal(result.readOnly,true);assert.equal(result.revision,before.inventory.find(r=>r.id===owner.id).revision);
 assert.equal(result.state.ingredients.find(row=>row.id===i.id).stock,4);assert.equal(result.state.requests[0].lines[0].delivered,3);assert.equal(result.state.requests[0].lines[0].quantity,2);assert.equal(result.state.movements.length,state.movements.length);
 assert.ok(result.state.areaItems.some(row=>row.area==='Makis'&&row.name==='Arroz de personal'));assert.equal(result.state.areaItems.filter(row=>row.area==='Barra').length,47);
 assert.equal(result.members[0].email,staff.email);assert.equal(result.members[0].role,'operator');assert.equal(result.members[0].userId,undefined);assert.equal(result.members[0].user_id,undefined);
 assert.ok(result.valuation.rows.some(row=>row.unitGross>0));assert.equal(result.valuation.rows.length,result.state.ingredients.length);assert.ok(result.valuation.summary.gross>0);assert.ok(!JSON.stringify(result).includes(secret));
 assert.deepEqual(dump(),before);
 globalThis.__shimayaTestEnv.READ_ONLY_SHARE_TOKEN='disabled';assert.equal((await call(secret)).status,403);assert.deepEqual(dump(),before);db.close();
});

test('El enlace no obtiene permisos de escritura ni de administración de usuarios, incluso con el maestro conectado',async()=>{
 const db=fixture();as(owner);const data=await (await inventory.GET()).json(),secret='anonymous-read-only-test-token-01234567890123456789';globalThis.__shimayaTestEnv.READ_ONLY_SHARE_TOKEN=secret;
 const before=db.prepare('SELECT * FROM inventory_state ORDER BY id').all(),request=()=>new Request('https://shimaya.example/api/consulta',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json',origin:'https://shimaya.example'},body:JSON.stringify({type:'ingredient',role:'admin',stock:999,revision:data.revision})});
 for(const identity of [null,owner]){as(identity);for(const route of [shared,sharedPdf,sharedFile])for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(route[method](request()).status,405);for(const route of [inventory,valuation,team,photos,documents,opening,launch])assert.equal((await route.POST(request())).status,403);}
 as(null);for(const route of [inventory,valuation,team,photos,documents,opening,launch])assert.ok([401,403].includes((await route.POST(request())).status));
 assert.deepEqual(db.prepare('SELECT * FROM inventory_state ORDER BY id').all(),before);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inventory_costs').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM team_members').get().n,0);
 assert.equal((await inventory.GET()).status,401);assert.equal((await shareLink.GET(new Request('https://shimaya.example/api/admin/share-link'))).status,401);
 as(owner);assert.equal((await shared.GET(new Request('https://shimaya.example/api/consulta'))).status,403);
 const link=await (await shareLink.GET(new Request('https://shimaya.example/api/admin/share-link'))).json();assert.equal(link.url,'https://shimaya.example/consulta#token='+secret);assert.equal(link.readOnly,true);
 assert.equal((await post(team,{type:'invite',email:staff.email,area:'Makis',role:'operator'})).status,200);as(staff);assert.equal((await shareLink.GET(new Request('https://shimaya.example/api/admin/share-link'))).status,403);db.close();
});

test('La consulta descarga PDF diario y solo comprobantes del espacio referenciados, sin cambiar ningún saldo',async()=>{
 const db=fixture();as(owner);const data=await (await inventory.GET()).json(),secret='anonymous-read-only-test-token-01234567890123456789';globalThis.__shimayaTestEnv.READ_ONLY_SHARE_TOKEN=secret;
 const pdfHash='a'.repeat(64),photoHash='b'.repeat(64),unreferenced='c'.repeat(64),state=data.state;
 state.movements.unshift({id:'test-receipt',date:'2026-10-12',at:'2026-10-12T17:00:00Z',kind:'recepcion',reference:'Factura de prueba',note:'Ingreso confirmado',photos:[photoHash],document:{hash:pdfHash,name:'factura.pdf'},lines:[]});
 db.prepare('UPDATE inventory_state SET data=? WHERE id=?').run(JSON.stringify(state),owner.id);const before=db.prepare('SELECT * FROM inventory_state ORDER BY id').all();
 await globalThis.__shimayaTestEnv.BUCKET.put(owner.id+'/receipts/'+pdfHash+'.pdf',new TextEncoder().encode('%PDF-1.4 prueba'),{httpMetadata:{contentType:'application/pdf'}});
 await globalThis.__shimayaTestEnv.BUCKET.put(owner.id+'/'+photoHash,new Uint8Array([1,2,3]),{httpMetadata:{contentType:'image/png'}});
 await globalThis.__shimayaTestEnv.BUCKET.put(owner.id+'/receipts/'+unreferenced+'.pdf',new TextEncoder().encode('privado'));
 as(null);const request=path=>new Request('https://shimaya.example'+path,{headers:{Authorization:'Bearer '+secret}});
 const report=await sharedPdf.GET(request('/api/consulta/daily?date=2026-10-12'));assert.equal(report.status,200);assert.equal(report.headers.get('Content-Type'),'application/pdf');assert.match(new TextDecoder().decode(await report.arrayBuffer()),/^%PDF/);
 for(const date of ['2026-02-30','invalid','2026-13-01',''])assert.equal((await sharedPdf.GET(request('/api/consulta/daily?date='+date))).status,400);
 const call=(kind,hash)=>sharedFile.GET(request('/api/consulta/file/'+kind+'/'+hash),{params:Promise.resolve({kind,hash})});
 const pdf=await call('pdf',pdfHash);assert.equal(pdf.status,200);assert.equal(pdf.headers.get('Content-Type'),'application/pdf');assert.match(pdf.headers.get('Cache-Control'),/no-store/);
 const photo=await call('photo',photoHash);assert.equal(photo.status,200);assert.equal(photo.headers.get('Content-Type'),'image/png');assert.deepEqual(new Uint8Array(await photo.arrayBuffer()),new Uint8Array([1,2,3]));
 for(const [kind,hash] of [['pdf',unreferenced],['photo',pdfHash],['pdf','../secret'],['other',pdfHash]])assert.equal((await call(kind,hash)).status,404);
 assert.equal((await sharedFile.GET(new Request('https://shimaya.example/api/consulta/file/pdf/'+pdfHash),{params:Promise.resolve({kind:'pdf',hash:pdfHash})})).status,403);
 assert.deepEqual(db.prepare('SELECT * FROM inventory_state ORDER BY id').all(),before);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inventory_costs').get().n,0);db.close();
});

test('Pedido y despacho consulta todos los saldos reales sin pedidos previos, sin precios y sin modificar registros',async()=>{
 const db=fixture();as(owner);let data=await (await inventory.GET()).json(),ingredient=data.state.ingredients.find(i=>i.id==='catalog-012');
 let response=await post(inventory,{type:'ingredient',id:ingredient.id,name:ingredient.name,unit:'kg',stock:7.25,minimum:2,date:'2026-10-13',revision:data.revision});assert.equal(response.status,200);data=await response.json();
 const book=await (await valuation.GET()).json(),cost=book.rows.find(row=>row.ingredientId===ingredient.id);assert.equal((await post(valuation,{ingredientId:ingredient.id,basis:cost.basis,gross:99,note:'Costo privado',revision:book.revision})).status,200);
 assert.equal((await post(team,{type:'invite',email:staff.email,area:'Barra',role:'operator'})).status,200);as(staff);await inventory.GET();
 const persisted=JSON.parse(db.prepare('SELECT data FROM inventory_state WHERE id=?').get(owner.id).data);delete persisted.areasVersion;delete persisted.addedItemsVersion;persisted.ingredients.find(i=>i.id===ingredient.id).privateCost=99;db.prepare('UPDATE inventory_state SET data=? WHERE id=?').run(JSON.stringify(persisted),owner.id);
 const before=db.prepare('SELECT * FROM inventory_state ORDER BY id').all(),costsBefore=db.prepare('SELECT * FROM inventory_costs').all(),membersBefore=db.prepare('SELECT * FROM team_members').all();
 response=await stock.GET(new Request('https://shimaya.example/api/stock?ownerId=another-space&role=admin'));assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/no-store/);let snapshot=await response.json();
 assert.equal(snapshot.readOnly,true);assert.equal(snapshot.items.find(i=>i.id===ingredient.id).stock,7.25);assert.equal(snapshot.items.find(i=>i.id===ingredient.id).unit,'kg');assert.equal(snapshot.items.length,persisted.ingredients.length);assert.ok(snapshot.items.some(i=>i.stock===0));assert.equal(snapshot.state,undefined);assert.equal(snapshot.valuation,undefined);assert.equal(snapshot.movements,undefined);assert.equal(snapshot.requests,undefined);
 for(const row of snapshot.items)assert.deepEqual(Object.keys(row).sort(),['category','configured','id','name','noOrder','stock','unit','unitNote'].sort());assert.ok(!JSON.stringify(snapshot).includes('privateCost'));assert.ok(!JSON.stringify(snapshot).includes('Costo privado'));
 assert.deepEqual(db.prepare('SELECT * FROM inventory_state ORDER BY id').all(),before);assert.deepEqual(db.prepare('SELECT * FROM inventory_costs').all(),costsBefore);assert.deepEqual(db.prepare('SELECT * FROM team_members').all(),membersBefore);
 for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(stock[method](new Request('https://shimaya.example/api/stock',{method,body:JSON.stringify({stock:1000})})).status,405);
 for(const type of ['ingredient','conteo','entrada','merma','importar','revertir'])assert.equal((await post(inventory,{type,revision:snapshot.revision,date:'2026-10-13'})).status,403);assert.equal((await post(valuation,{})).status,403);assert.equal((await post(team,{type:'invite',email:'intruso@example.com'})).status,403);
 assert.deepEqual(db.prepare('SELECT * FROM inventory_state ORDER BY id').all(),before);
 // Pedir y despachar mantienen sus permisos y la siguiente consulta refleja la entrega real.
 as(owner);assert.equal((await post(team,{type:'approve',email:staff.email,area:'Makis',role:'operator'})).status,200);data=await (await inventory.GET()).json();const item=data.state.areaItems.find(i=>i.area==='Makis'&&i.ingredientId===ingredient.id);assert.ok(item);as(staff);data=await (await inventory.GET()).json();response=await post(inventory,{type:'solicitar',date:'2026-10-13',area:'Makis',requester:'Cocina',revision:data.revision,lines:[{itemId:item.id,quantity:2,unit:'kg'}]});assert.equal(response.status,200);data=await response.json();response=await post(inventory,{type:'despachar',date:'2026-10-13',requestId:data.state.requests[0].id,revision:data.revision,dispatcher:'Almacén',lines:[{itemId:item.id,quantity:2}]});assert.equal(response.status,200);
 snapshot=await (await stock.GET()).json();assert.equal(snapshot.items.find(i=>i.id===ingredient.id).stock,5.25);db.close();
});

test('La consulta de stock exige el perfil autorizado y rechaza visitantes, solicitudes pendientes y accesos suspendidos',async()=>{
 const db=fixture();as(null);assert.equal((await stock.GET()).status,401);as(owner);await inventory.GET();assert.equal((await stock.GET()).status,200);
 as(staff);assert.equal((await stock.GET()).status,403);assert.equal((await post(team,{type:'request-access',area:'Makis'})).status,200);assert.equal((await stock.GET()).status,403);
 as(owner);assert.equal((await post(team,{type:'approve',email:staff.email,area:'Makis',role:'operator'})).status,200);as(staff);assert.equal((await stock.GET()).status,200);
 as(owner);assert.equal((await post(team,{type:'suspend',email:staff.email,area:'Makis',role:'operator'})).status,200);as(staff);assert.equal((await stock.GET()).status,403);
 for(const role of ['staff','dispatch']){as(owner);assert.equal((await post(team,{type:'approve',email:staff.email,area:'Makis',role})).status,200);as(staff);assert.equal((await stock.GET()).status,403)}
 const impostor={...staff,id:'other-user'};as(impostor);assert.equal((await stock.GET()).status,403);db.close();
});

test('Barra pide tamarindo y Ramen pide paquete de poro; ambos despachan contra el mismo stock del catálogo',async()=>{
 const db=fixture();as(owner);let data=await (await inventory.GET()).json();
 const initialCount=data.state.ingredients.length,originalPoro=data.state.areaItems.find(i=>i.id==='area-salsas-76');assert.equal(originalPoro.name,'PORO');
 for(const [user,area,name,ingredientId,unit] of [[staff,'Barra','PULPA DE TAMARINDO','catalog-217','und'],[dispatcher,'Ramen','PAQUETE DE PORO','catalog-180','paquete']]){
  as(owner);assert.equal((await post(team,{type:'invite',email:user.email,area,role:'operator'})).status,200);as(user);data=await (await inventory.GET()).json();const item=data.state.areaItems.find(i=>i.name===name);assert.ok(item);assert.equal(item.area,area);assert.equal(item.ingredientId,ingredientId);assert.equal(item.linkReviewed,true);
  let response=await post(inventory,{type:'solicitar',date:'2026-10-17',area,revision:data.revision,lines:[{itemId:item.id,quantity:2,unit}]});assert.equal(response.status,200);data=await response.json();const requestId=data.state.requests[0].id;
  response=await post(inventory,{type:'despachar',date:'2026-10-17',requestId,revision:data.revision,lines:[{itemId:item.id,quantity:2}]});assert.equal(response.status,200);data=await response.json();assert.equal(data.state.ingredients.find(i=>i.id===ingredientId).stock,-2);assert.equal(data.state.requests[0].lines[0].ingredientId,ingredientId);
 }
 as(owner);data=await (await inventory.GET()).json();assert.equal(data.state.ingredients.length,initialCount);for(const id of ['catalog-217','catalog-180'])assert.equal(data.state.ingredients.filter(i=>i.id===id||i.catalogId===id).length,1);assert.equal(data.state.areaItems.find(i=>i.id===originalPoro.id).name,'PORO');db.close();
});

test('La copia completa requiere una clave exclusiva, incluye los respaldos íntegros y nunca modifica el espacio',async()=>{
 const db=fixture();as(owner);const current=await (await inventory.GET()).json(),secret='full-archive-private-test-012345678901234567890';
 const request=(token,path='')=>new Request('https://shimaya.example/api/admin/archive'+path,{headers:token?{Authorization:'Bearer '+token}:{}});
 assert.equal((await archive.GET(request(secret))).status,403);globalThis.__shimayaTestEnv.FULL_SITE_EXPORT_TOKEN=secret;
 assert.equal((await archive.GET(request())).status,403);assert.equal((await archive.GET(request(secret+'x'))).status,403);globalThis.__shimayaTestEnv.READ_ONLY_SHARE_TOKEN='readonly-key-012345678901234567890123456789012345';assert.equal((await archive.GET(request(globalThis.__shimayaTestEnv.READ_ONLY_SHARE_TOKEN))).status,403);
 const payload=JSON.stringify({notes:'Una copia interna conserva todos los caracteres. '.repeat(200),state:current.state});db.prepare('INSERT INTO inventory_reset_backups(id,owner_id,reset_version,revision,data,created_at) VALUES(?,?,?,?,?,?)').run('backup',owner.id,'test',current.revision,payload,'2026-10-17T18:00:00Z');
 db.prepare('INSERT INTO inventory_reset_backups(id,owner_id,reset_version,revision,data,created_at) VALUES(?,?,?,?,?,?)').run('other-backup','other-owner','test',0,'privado de otro espacio','2026-10-17T18:00:00Z');
 const before=db.prepare('SELECT * FROM inventory_state ORDER BY id').all(),backupBefore=db.prepare('SELECT * FROM inventory_reset_backups ORDER BY id').all();
 const environment=globalThis.__shimayaTestEnv;environment.DB.batch=async statements=>{db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.all());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}};
 environment.BUCKET.list=async options=>{assert.equal(options.prefix,owner.id+'/');return {objects:[{key:owner.id+'/receipts/test.pdf',size:4,etag:'etag',uploaded:new Date('2026-10-17T18:00:00Z')}],truncated:false}};await environment.BUCKET.put(owner.id+'/receipts/test.pdf',new TextEncoder().encode('test'),{httpMetadata:{contentType:'application/pdf'}});
 as(null);const response=await archive.GET(request(secret));assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/no-store/);const data=await response.json();assert.equal(data.format,'shimaya-full-backup-v1');assert.equal(data.ownerId,owner.id);assert.equal(data.tables.inventory_reset_backups.length,1);assert.equal(data.tables.inventory_reset_backups[0].data,payload);assert.ok(data.tables.inventory_reset_backups[0].data.length>1748);assert.equal(data.tables.inventory_state.length,2);assert.ok(!JSON.stringify(data).includes(secret));
 const file=await archive.GET(request(secret,'?file='+encodeURIComponent(owner.id+'/receipts/test.pdf')));assert.equal(file.status,200);assert.equal(await file.text(),'test');assert.equal((await archive.GET(request(secret,'?file=other-owner/private.pdf'))).status,404);assert.equal((await archive.GET(request(secret,'?file='+encodeURIComponent(owner.id+'/../private')))).status,404);
 for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(archive[method](request(secret)).status,405);
 assert.deepEqual(db.prepare('SELECT * FROM inventory_state ORDER BY id').all(),before);assert.deepEqual(db.prepare('SELECT * FROM inventory_reset_backups ORDER BY id').all(),backupBefore);globalThis.__shimayaTestEnv.FULL_SITE_EXPORT_TOKEN='disabled';assert.equal((await archive.GET(request(secret))).status,403);db.close();
});
