declare module 'onnxruntime-web/wasm' {
 export const env:{wasm:{numThreads:number;proxy:boolean;wasmPaths:string}};
 export class Tensor {constructor(type:string,data:Float32Array,dimensions:number[])}
 export const InferenceSession:{create(path:string,options:{executionProviders:string[]}):Promise<{inputNames:string[];outputNames:string[];run(input:Record<string,Tensor>):Promise<Record<string,{data:Float32Array}>>;release():Promise<void>}>};
}
