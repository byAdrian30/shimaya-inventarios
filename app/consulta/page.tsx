import type {Metadata} from 'next';
import SharedAdmin from '../../components/shared-admin';
export const metadata:Metadata={title:'Shimaya Ramen | Administración · Solo lectura',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function SharedPage(){return <SharedAdmin/>}
