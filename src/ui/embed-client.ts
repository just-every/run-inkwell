export function embedPath(path:string){
 if(typeof window==='undefined'||(!path.startsWith('/api/')||path.startsWith('/api/embed/')))return path
 const entry=/^\/embed\/([a-f0-9]{64})$/.exec(window.location.pathname)
 return entry?'/api/embed/'+entry[1]+path:path
}
export const embedFetch=(path:string,options?:RequestInit)=>fetch(embedPath(path),options)
export function embedEvent(origin:string,event:'signed'|'declined'|'closed'|'sent',id?:string){
 if(window.parent!==window)window.parent.postMessage({type:'inkwell.'+event,...(id?{envelopeId:id}:{})},origin)
}
