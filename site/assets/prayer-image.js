(() => {
  'use strict';
  // Text is drawn directly from the current prayer; no prayer content is generated or rewritten.
  function linesFor(ctx, text, maxWidth) {
    const lines=[];
    for (const paragraph of String(text).split('\n')) {
      let line='';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next=line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line=word; }
        else line=next;
      }
      if(line)lines.push(line);
    }
    return lines;
  }
  async function render(prayer) {
    if (document.fonts?.load) await document.fonts.load('64px "Noto Naskh Arabic"');
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    canvas.width=1080;
    const width=canvas.width, middle=width/2, usable=860;
    ctx.font='64px "Noto Naskh Arabic", serif';
    const arabic=linesFor(ctx,prayer.arabic,usable);
    ctx.font='42px Georgia, serif';
    const meaning=linesFor(ctx,`“${prayer.meaning}”`,usable);
    ctx.font='italic 28px Georgia, serif';
    const source=linesFor(ctx,prayer.source,usable);
    const needed=270+arabic.length*110+110+meaning.length*62+115+source.length*45+175;
    canvas.height=Math.max(1400,needed);
    const height=canvas.height;
    ctx.fillStyle='#fcf6eb';ctx.fillRect(0,0,width,height);
    const gradient=ctx.createLinearGradient(0,0,width,height);gradient.addColorStop(0,'rgba(255,255,255,.46)');gradient.addColorStop(1,'rgba(203,171,119,.10)');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
    ctx.strokeStyle='#bb8d43';ctx.lineWidth=2;ctx.strokeRect(35,35,width-70,height-70);ctx.lineWidth=1;ctx.strokeRect(46,46,width-92,height-92);
    // Restrained gold leaf-like corners echo the approved cream-and-gold sample.
    for(const [x,y,flipX,flipY] of [[57,57,1,1],[width-57,57,-1,1],[57,height-57,1,-1],[width-57,height-57,-1,-1]]){
      ctx.save();ctx.translate(x,y);ctx.scale(flipX,flipY);ctx.strokeStyle='#ad7e34';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(0,48);ctx.bezierCurveTo(0,14,14,0,48,0);ctx.stroke();
      ctx.beginPath();ctx.moveTo(7,24);ctx.quadraticCurveTo(13,9,20,8);ctx.quadraticCurveTo(20,20,7,24);ctx.moveTo(24,7);ctx.quadraticCurveTo(9,13,8,20);ctx.quadraticCurveTo(20,20,24,7);ctx.stroke();ctx.restore();
    }
    const ornamentY=145;
    ctx.strokeStyle='#b68a45';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(middle-145,ornamentY);ctx.lineTo(middle-22,ornamentY);ctx.moveTo(middle+22,ornamentY);ctx.lineTo(middle+145,ornamentY);ctx.stroke();
    ctx.save();ctx.translate(middle,ornamentY);ctx.rotate(Math.PI/4);ctx.strokeRect(-10,-10,20,20);ctx.restore();
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#172746';ctx.direction='rtl';ctx.font='64px "Noto Naskh Arabic", serif';
    let y=245;
    for(const line of arabic){ctx.fillText(line,middle,y);y+=110;}
    y+=28;ctx.strokeStyle='#c49b5b';ctx.beginPath();ctx.moveTo(middle-85,y);ctx.lineTo(middle+85,y);ctx.stroke();y+=85;
    ctx.direction='ltr';ctx.fillStyle='#172746';ctx.font='42px Georgia, serif';
    for(const line of meaning){ctx.fillText(line,middle,y);y+=62;}
    y+=65;ctx.strokeStyle='#c49b5b';ctx.beginPath();ctx.moveTo(middle-52,y);ctx.lineTo(middle+52,y);ctx.stroke();y+=62;
    ctx.font='italic 28px Georgia, serif';ctx.fillStyle='#44516a';
    for(const line of source){ctx.fillText(line,middle,y);y+=45;}
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image export failed')),'image/png'));
  }
  window.PrayerCardImage={render};
})();
