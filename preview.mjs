// Optional interface-only developer preview. Use the Python launcher for camera analysis.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i>=0?process.argv[i+1]:fallback};
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mp4':'video/mp4','.png':'image/png'};
http.createServer(async(req,res)=>{
 if(req.method==='POST'){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'This is the interface-only preview. Start START_BURKESHOT_V12.bat for camera analysis.'}));return}
 try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))throw new Error('Invalid path');const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404);res.end('Not found')}
}).listen(Number(arg('--port','4173')),arg('--host','127.0.0.1'));
