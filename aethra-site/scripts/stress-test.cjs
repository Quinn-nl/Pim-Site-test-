'use strict';
/**
 * Stress test for layout (break-ui): loads every public page in every language at 320, 390 and 1280 px with
 * the worst-case and empty data sets and reports overflow, clipped text and oddly tall buttons.
 * Needs Playwright (npx playwright install chromium) and a running dev server:
 *   DEV_TOGGLE=1 PORT=3180 npm start      then      BASE=http://127.0.0.1:3180 node scripts/stress-test.cjs
 */
const BASE = process.env.BASE || 'http://127.0.0.1:3180';
const { chromium } = require('playwright');
const pages=['/','/problem','/how-it-works','/applications','/for/municipalities','/for/fleets','/for/manufacturers','/for/platforms','/for/investors','/contact','/privacy'];
(async()=>{const b=await chromium.launch({...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})});
const found=new Map();let n=0;
for(const w of [320,390,1280]){
 const ctx=await b.newContext({viewport:{width:w,height:800}});
 for(const mode of ['worst','empty']){
  await ctx.addCookies([{name:'aethra_dev_data',value:mode,url:BASE}]);
  const p=await ctx.newPage();
  for(const l of ['en','nl','de','fr'])for(const pg of pages){
   await p.goto(`${BASE}/${l}${pg==='/'?'/':pg}`);await p.waitForTimeout(60);
   const res=await p.evaluate(()=>{
    const out=[];const W=document.documentElement.clientWidth;
    if(document.documentElement.scrollWidth>W+1)out.push('PAGE scrolls horizontally: '+document.documentElement.scrollWidth+' > '+W);
    for(const el of document.querySelectorAll('body *')){
     if(el.closest('.dev-toggle,.hp,.sr,.skip-link')||el.classList.contains('hero-sky'))continue;
     const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')continue;
     const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;
     const name=el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\s+/)[0]:'');
     if(r.right>W+1&&cs.position!=='fixed')out.push(name+' extends past the viewport by '+Math.round(r.right-W)+'px');
     if(el.scrollWidth>el.clientWidth+1&&cs.overflowX==='visible'&&el.clientWidth>0&&!['svg','path','html','body'].includes(el.tagName.toLowerCase())&&cs.display!=='inline')out.push(name+' content wider than its box ('+el.scrollWidth+'>'+el.clientWidth+')');
     if(['button','a'].includes(el.tagName.toLowerCase())||el.classList.contains('btn')){const t=el.textContent.trim();if(r.height>90&&t.length<60)out.push(name+' unusually tall ('+Math.round(r.height)+'px) for "'+t.slice(0,30)+'"');}
    }
    return [...new Set(out)];});
   n++;
   for(const r of res){const key=r;if(!found.has(key))found.set(key,[]);found.get(key).push(`${mode}/${w}/${l}${pg}`);}
  }
  await p.close();
 }
}
console.log('checked',n,'page states');
for(const [k,v] of found)console.log('-',k,'\n    e.g.',v.slice(0,3).join(', '),'('+v.length+'x)');
if(!found.size)console.log('no overflow found');
await b.close();})();
