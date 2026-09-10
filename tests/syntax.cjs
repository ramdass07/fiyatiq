const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
let checked=0;
for(const m of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(m[1].trim()){new vm.Script(m[1]);checked++;}}
for(const folder of ['js','api','lib'])for(const name of fs.readdirSync(path.join(root,folder))){if(name.endsWith('.js')){new vm.Script(fs.readFileSync(path.join(root,folder,name),'utf8'));checked++;}}
console.log(checked+' JavaScript sources parsed.');
