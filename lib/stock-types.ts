export type StockItem={id:string;name:string;category:string;unit:string;stock:number;configured:boolean;unitNote:string;noOrder:boolean};
export type StockSnapshot={items:StockItem[];revision:number;readOnly:true};
