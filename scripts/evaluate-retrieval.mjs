import { readFile } from 'node:fs/promises';
const file=process.argv[2];if(!file)throw new Error('Pass a reviewed evaluation JSON file');
const data=JSON.parse(await readFile(file,'utf8'));
if(!Array.isArray(data.cases)||!data.cases.length)throw new Error('No reviewed evaluation cases; no accuracy claim can be computed');
const k=data.k??8;if(!Number.isInteger(k)||k<1||k>100)throw new Error('Invalid k');
const scores=data.cases.map(c=>{
 if(!Array.isArray(c.relevantSourceIds)||!c.relevantSourceIds.length||!Array.isArray(c.retrievedSourceIds)||c.relevantSourceIds.some(v=>typeof v!=='string')||c.retrievedSourceIds.some(v=>typeof v!=='string'))throw new Error('Each case requires reviewed nonempty relevance IDs and retrieval IDs');
 const gold=new Set(c.relevantSourceIds),ranked=[...new Set(c.retrievedSourceIds)].slice(0,k);
 const hits=ranked.filter(id=>gold.has(id)).length;
 const dcg=ranked.reduce((s,id,i)=>s+(gold.has(id)?1/Math.log2(i+2):0),0);
 const ideal=Array.from({length:Math.min(k,gold.size)},(_,i)=>1/Math.log2(i+2)).reduce((s,v)=>s+v,0);
 return {id:c.id,recallAtK:hits/gold.size,precisionAtK:hits/k,ndcgAtK:dcg/ideal};
});
const mean=key=>scores.reduce((s,c)=>s+c[key],0)/scores.length;
process.stdout.write(JSON.stringify({cases:scores.length,k,recallAtK:mean('recallAtK'),precisionAtK:mean('precisionAtK'),ndcgAtK:mean('ndcgAtK'),note:'Retrieval metrics only; not legal correctness',perCase:scores},null,2)+'\n');
