import {env} from 'cloudflare:workers';
import {sharedOwner,sharedInventory,sharedCosts,sharedHeaders,sharedFailure,rejectSharedMutation} from '../../../lib/shared-access';
import {inventoryValuation} from '../../../lib/valuation';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const ownerId=await sharedOwner(request);
  const [inventory,book,team]=await Promise.all([
   sharedInventory(ownerId),sharedCosts(ownerId),
   env.DB!.prepare('SELECT email,name,area,role,status,created_at AS createdAt,updated_at AS updatedAt FROM team_members ORDER BY created_at DESC').all(),
  ]);
  return Response.json({role:'viewer',readOnly:true,...inventory,valuation:inventoryValuation(inventory.state,book.overrides,book.revision,inventory.revision),members:team.results},{headers:sharedHeaders});
 }catch(error){return sharedFailure(error)}
}
export const POST=rejectSharedMutation;
export const PUT=rejectSharedMutation;
export const PATCH=rejectSharedMutation;
export const DELETE=rejectSharedMutation;
