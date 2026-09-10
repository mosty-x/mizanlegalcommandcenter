// Deterministic neural transport double. Loaded ONLY by tests with explicit opt-in.
export function installMockAi(){
  const original=globalThis.fetch,requests=[];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    if(url.hostname!=='api.openai.com')return original(input,init);
    const body=JSON.parse(init?.body??'{}');requests.push({url:url.href,body});
    if(body.model==='fixture-failure')return Response.json({error:'fixture'},{status:503});
    if(url.pathname.endsWith('/embeddings'))return Response.json({data:body.input.map((text,index)=>({index,embedding:[1,text.length%7+1,2,3,1,1,2,1]}))});
    if(url.pathname.endsWith('/rerank'))return Response.json({results:body.documents.slice(0,body.top_n).map((_,index)=>({index,relevance_score:0.95-index*0.01}))});
    const system=body.messages?.[0]?.content??'',user=body.messages?.[1]?.content??'';let output;
    if(system.includes('أنت مراجع أدلة مستقل')){const data=JSON.parse(user);output={verdicts:data.claims.map(c=>({claimId:c.id,verdict:'supported'}))};}
    else if(system.includes('استخرج الوقائع فقط'))output={facts:[]};
    else {
      const legal=JSON.parse(user.split('القانون المعتمد:\n')[1].split('\nالمستندات:\n')[0]);
      const matter=JSON.parse(user.split('\nالمستندات:\n')[1].split('\nالوقائع المستخرجة')[0]);
      const kind=system.split('الأنواع المسموحة: ')[1].split(',')[0].trim();
      output={claims:[{id:'C1',title:'نتيجة اختبار تقنية فقط',kind,basis:'legal',statement:'ناتج اصطناعي لا يثبت أي رأي قانوني.',proposal:'',severity:'معلومة',factCitations:[{sourceId:matter[0].id,quote:matter[0].text}],lawCitations:[{sourceId:legal[0].id,quote:legal[0].text}],date:null,owner:null,status:'observed',dependsOn:[]}]};
    }
    return Response.json({id:'fixture-request',choices:[{message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:100,completion_tokens:30,prompt_tokens_details:{cached_tokens:0}}});
  };
  return {requests,restore(){globalThis.fetch=original;}};
}
if(process.env.MIZAN_TEST_AI==='1')installMockAi();
