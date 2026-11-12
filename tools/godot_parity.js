const fs=require('fs');
global.window=global; global.G={}; global.document={addEventListener(){} , hidden:false}; global.performance={now:()=>0}; global.requestAnimationFrame=()=>{};
global.localStorage={getItem(){return null},setItem(){}}; global.location={search:''}; global.navigator={};
for (const f of ['data','map','maps','entities','game']) (0,eval)(fs.readFileSync('js/'+f+'.js','utf8'));
// G.rand from net.js
let seed=1; G.rand=()=>{seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;}; G.seedRand=v=>{seed=(v|0)||1;};
G.camera={focus(){} }; G.makeAI=()=>({init(){},update(){}});
G.newGame({seed:12345,players:[{civ:'britons'},{civ:'franks',ai:'normal'}]}); G.ais=[];
const c={}; for(const e of G.ents) c[e.type]=(c[e.type]||0)+1; console.log('ents',G.ents.length,JSON.stringify(c));
const tc=G.ents.find(e=>e.type==='towncenter'&&e.owner===1); console.log('tc',tc.tx,tc.ty,tc.hp);
const vils=G.unitsOf(1); const near=(t)=>G.nearest(tc,e=>e.type===t);
const tree=near('tree'), berry=near('berry');
console.log(G.cmdSmart([vils[0],vils[1]],tree.x,tree.y,tree),G.cmdSmart([vils[2]],berry.x,berry.y,berry));
console.log('train',G.train(tc,'villager'),G.train(tc,'villager'));
for(let i=0;i<30*90;i++)G.step(1/30);
console.log('res',JSON.stringify(G.players[1].res),'pop',JSON.stringify(G.popOf(1)),'units',G.unitsOf(1).length);
const house=G.placeBuilding(1,'house',tc.tx+6,tc.ty,[G.unitsOf(1)[3]]);
for(let i=0;i<30*60;i++)G.step(1/30);
console.log('house built',house.built,house.hp,house.maxHp,'res',JSON.stringify(G.players[1].res),JSON.stringify(G.popOf(1)));
const a=[],b=[]; for(let i=0;i<8;i++){a.push(G.addUnit('militia',1,30+i*0.6,36)); b.push(G.addUnit('archer',2,30+i*0.6,42));}
G.cmdAttack(b,a[0]); for(let i=0;i<30*40;i++)G.step(1/30);
console.log('fight: militia left',a.filter(u=>!u.dead).length,'archers left',b.filter(u=>!u.dead).length);
