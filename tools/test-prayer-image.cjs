const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={},calls=[];
let canvas;
const context={measureText:s=>({width:s.length*13}),fillText(t,x,y){calls.push({t,y,dir:this.direction,height:canvas.height});},fillRect(){},strokeRect(){},createLinearGradient(){return {addColorStop(){}}},save(){},restore(){},translate(){},scale(){},rotate(){},beginPath(){},moveTo(){},lineTo(){},bezierCurveTo(){},quadraticCurveTo(){},stroke(){}};
const document={fonts:{load:async()=>{}},createElement(tag){assert.equal(tag,'canvas');canvas={width:0,height:0,getContext:()=>context,toBlob:callback=>callback({size:1})};return canvas;}};
const sandbox=vm.createContext({window,document});
vm.runInContext(fs.readFileSync('dist/prayers.js','utf8'),sandbox);
vm.runInContext(fs.readFileSync('dist/assets/prayer-image.js','utf8'),sandbox);
(async()=>{for(const [i,prayer] of window.PAYLASIM_PRAYERS.entries()){
  calls.length=0;await window.PrayerCardImage.render(prayer);
  const arabic=calls.filter(x=>x.dir==='rtl'),other=calls.filter(x=>x.dir==='ltr');
  assert.ok(arabic.length&&other.length,`missing text at ${i}`);
  assert.equal(arabic.map(x=>x.t).join(' '),prayer.arabic.replace(/\s+/g,' ').trim());
  const remaining=other.map(x=>x.t).join(' ');assert.ok(remaining.includes(prayer.meaning));assert.ok(remaining.includes(prayer.source));
  const top=arabic[0].y-100,bottom=canvas.height-other.at(-1).y;
  assert.ok(Math.abs(top-bottom)<1,`unbalanced card ${i}: ${top} vs ${bottom}`);
}console.log(`✓ ${window.PAYLASIM_PRAYERS.length} dua kartında metin ve dikey denge doğrulandı`);})().catch(e=>{console.error(e);process.exitCode=1});
