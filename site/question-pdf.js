/* Local test PDF generation. Question data never leaves the browser. */
(function () {
  'use strict';
  let library;
  function loadLibrary() {
    const load=(src,ready)=>ready()?Promise.resolve():new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=src;script.onload=resolve;
      script.onerror=()=>reject(new Error('PDF kitaplığı yüklenemedi'));document.head.appendChild(script);
    });
    if (!library) library=Promise.all([
      load('./assets/pdf-lib/pdf-lib.min.js',()=>!!window.PDFLib),
      load('./assets/pdf-lib/fontkit.umd.min.js',()=>!!window.fontkit)
    ]).catch(error=>{library=null;throw error;});
    return library;
  }
  async function loadFonts() {
    if (!window.FontFace || !document.fonts) return;
    const fonts = [
      ['TestLatin', './assets/pdfjs/standard_fonts/LiberationSans-Regular.ttf'],
      ['TestLatinBold', './assets/pdfjs/standard_fonts/LiberationSans-Bold.ttf'],
      ['TestArabic', './assets/NotoNaskhArabic-Regular.ttf']
    ];
    return Promise.all(fonts.map(async ([name, url]) => {
      const response=await fetch(url);if(!response.ok)throw new Error('Yazı tipi yüklenemedi');
      const bytes=await response.arrayBuffer();
      const font = new FontFace(name, bytes.slice(0));
      document.fonts.add(await font.load());
      return bytes;
    }));
  }
  async function download(questions, title) {
    if (!questions.length || questions.some(q => !q || !Array.isArray(q.options) || !Number.isInteger(q.correct) || !q.options[q.correct])) throw new Error('Sorular bulunamadı');
    const [,fontBytes]=await Promise.all([loadLibrary(), loadFonts()]);
    const pdf = await PDFLib.PDFDocument.create();
    pdf.setTitle(title); pdf.setAuthor(''); pdf.setCreator('Ders ve Soru Arşivi');
    pdf.registerFontkit(window.fontkit);
    const [latin,bold,arabic]=await Promise.all(fontBytes.map(bytes=>pdf.embedFont(bytes)));
    const arabicFont=window.fontkit.create(new Uint8Array(fontBytes[2]));
    // Text is drawn over the image invisibly. Encoding unshaped codepoints avoids
    // losing the original Unicode when Arabic glyphs are joined for display.
    arabic.encodeText=text=>PDFLib.PDFHexString.of(Array.from(text,ch=>
      arabicFont.glyphForCodePoint(ch.codePointAt(0)).id.toString(16).padStart(4,'0')).join(''));
    const width=1190, height=1684, margin=90, bottom=height-95;
    const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
    const ctx=canvas.getContext('2d'); let y=0, page=0, textLines=[];
    function blank() { ctx.fillStyle='#fff'; ctx.fillRect(0,0,width,height); y=margin; page++; textLines=[]; }
    async function flush() {
      ctx.fillStyle='#536173'; ctx.font='21px TestLatin, TestArabic, sans-serif'; ctx.fillText(String(page),width-margin-25,height-40);
      const data=canvas.toDataURL('image/jpeg',0.92);
      const picture=await pdf.embedJpg(data);
      const pdfPage=pdf.addPage([595.28,841.89]);
      pdfPage.drawImage(picture,{x:0,y:0,width:595.28,height:841.89});
      for(const line of textLines){
        ctx.font=`${line.bold?28:26}px ${line.bold?'TestLatinBold':'TestLatin'}, TestArabic, sans-serif`;
        const pieces=line.text.split(/([\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufeff]+(?:\s+[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufeff]+)*)/u);
        let prefix='';
        for(const piece of pieces){
          if(!piece)continue;
          const rtl=/^[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufeff]/u.test(piece);
          const x=(margin+line.indent+ctx.measureText(prefix).width)/2, y=(height-line.y)/2, size=(line.bold?28:26)/2;
          if(rtl){
            // The source characters are kept in the text layer separately from
            // the joined glyphs in the visible image.
            pdfPage.drawText(Array.from(piece).reverse().join(''),{x,y,size,font:arabic,opacity:0});
          }else pdfPage.drawText(piece,{x,y,size,font:line.bold?bold:latin,opacity:0});
          prefix+=piece;
        }
      }
    }
    async function space(n) { if (y+n>bottom) { await flush(); blank(); } }
    function lines(text, max) {
      const parts=String(text).replace(/\s+/g,' ').trim().split(' '), result=[]; let line='';
      for (const part of parts) {
        const trial=line ? line+' '+part : part;
        if(ctx.measureText(trial).width<=max) { line=trial; continue; }
        if(line) result.push(line);
        line='';
        for(const char of part) {
          if(line && ctx.measureText(line+char).width>max) { result.push(line); line=''; }
          line+=char;
        }
      }
      if(line) result.push(line);
      return result;
    }
    async function write(text, bold=false, indent=0) {
      ctx.font=`${bold?28:26}px ${bold?'TestLatinBold':'TestLatin'}, TestArabic, sans-serif`;
      const wrapped=lines(text,width-2*margin-indent);
      for(const line of wrapped) { await space(42); ctx.fillStyle='#1d293a'; ctx.textAlign='left'; ctx.direction='ltr'; ctx.fillText(line,margin+indent,y); textLines.push({text:line,y,bold,indent}); y+=42; }
    }
    blank(); await write(title,true); y+=14; await write(`${questions.length} soru`); y+=32;
    for(let i=0;i<questions.length;i++) {
      const q=questions[i];
      ctx.font='28px TestLatinBold, TestArabic, sans-serif';
      let heightNeeded=lines(`${i+1}. ${q.stem}`,width-2*margin).length*42+24;
      ctx.font='26px TestLatin, TestArabic, sans-serif';
      heightNeeded+=q.options.reduce((n,option,j)=>n+lines(`${'ABCDE'[j]}) ${option.text}`,width-2*margin-22).length*42,0);
      await space(Math.min(heightNeeded,bottom-margin));
      await write(`${i+1}. ${q.stem}`,true);
      for(let j=0;j<q.options.length;j++) await write(`${'ABCDE'[j]}) ${q.options[j].text}`,false,22);
      y+=24;
    }
    await flush(); blank(); await write('Cevap anahtarı',true); y+=20;
    for(let i=0;i<questions.length;i+=8) await write(questions.slice(i,i+8).map((q,j)=>`${i+j+1}. ${'ABCDE'[q.correct]}`).join('  ·  '));
    await flush();
    const bytes=await pdf.save();
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
    return {url,filename:title.replace(/[\\/:*?"<>|]/g,'-')+'.pdf'};
  }
  window.QuestionPDF={download};
})();
