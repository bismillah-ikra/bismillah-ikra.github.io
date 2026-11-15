import { packWord } from '../word-archive.mjs';

const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRelations = 'http://schemas.openxmlformats.org/package/2006/relationships';
const arabic = /([\p{Script_Extensions=Arabic}\u200C\u200D]+(?:[ \t]+[\p{Script_Extensions=Arabic}\u200C\u200D]+)*)/gu;
export const answerLetters = 'ABCDE';
export function answerExplanation(question) {
  return question.explanation?.trim()
    ? question.explanation
    : question.options[question.correct].explanation?.trim() || 'Bu soru için açıklama henüz eklenmedi.';
}

const escape = text => text.replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]);
const runs = text => text.split(arabic).map((part, index) => {
  if (!part) return '';
  const rtl = index % 2 ? '<w:rPr><w:rtl/><w:lang w:bidi="ar"/></w:rPr>' : '';
  return '<w:r>' + rtl + '<w:t xml:space="preserve">' + escape(part) + '</w:t></w:r>';
}).join('');

function paragraph(text, style, { keepNext = false, pageBreak = false } = {}) {
  return '<w:p><w:pPr><w:pStyle w:val="' + style + '"/>' +
    (keepNext ? '<w:keepNext/>' : '') + (pageBreak ? '<w:pageBreakBefore/>' : '') +
    '</w:pPr>' + runs(text) + '</w:p>';
}

const fontSize = size => '<w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/>';
const bold = '<w:b/><w:bCs/>';
function style(id, name, { size, weight = '', before = 0, after, indent = 0, heading = '' }) {
  return '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name +
    '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr>' +
    '<w:keepLines/><w:spacing w:before="' + before + '" w:after="' + after +
    '"/><w:ind w:left="' + indent + '"/>' + heading + '</w:pPr><w:rPr>' +
    weight + fontSize(size) + '</w:rPr></w:style>';
}

const styles = '<w:styles xmlns:w="' + word + '">' +
  '<w:docDefaults><w:rPrDefault><w:rPr>' +
  '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>' + fontSize(22) +
  '<w:lang w:val="tr-TR" w:bidi="ar"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:line="288" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
  style('Title', 'Title', { size: 44, weight: bold, after: 100 }) +
  style('Subtitle', 'Subtitle', { size: 24, after: 180 }) +
  style('Heading1', 'heading 1', { size: 32, weight: bold, before: 240, after: 120, heading: '<w:outlineLvl w:val="0"/>' }) +
  style('Heading2', 'heading 2', { size: 26, weight: bold, before: 200, after: 100, heading: '<w:outlineLvl w:val="1"/>' }) +
  style('Heading3', 'heading 3', { size: 24, weight: bold, before: 200, after: 80, heading: '<w:outlineLvl w:val="2"/>' }) +
  style('Question', 'Soru', { size: 22, weight: bold, before: 140, after: 60 }) +
  style('Option', 'Seçenek', { size: 22, after: 35, indent: 300 }) +
  style('AnswerKey', 'Cevap dizisi', { size: 22, after: 100 }) +
  style('AnswerLabel', 'Açıklama numarası', { size: 22, weight: bold, before: 100, after: 40 }) +
  style('AnswerExplanation', 'Açıklama metni', { size: 22, after: 110 }) +
  '</w:styles>';

export function buildQuestionDocx(name, sets) {
  const body = [
    paragraph(name, 'Title', { keepNext: true }),
    paragraph('Tüm çalışma soruları ve açıklamalı cevaplar', 'Subtitle', { keepNext: true })
  ];
  for (const set of sets) {
    body.push(paragraph(set.name, 'Heading1', { keepNext: true }));
    for (const topic of set.topics) {
      body.push(paragraph(topic.name, 'Heading2', { keepNext: true }));
      for (const [index, question] of topic.questions.entries()) {
        body.push(paragraph((index + 1) + '. ' + question.stem, 'Question', { keepNext: true }));
        for (const [choice, option] of question.options.entries()) {
          body.push(paragraph(answerLetters[choice] + ') ' + option.text, 'Option', { keepNext: choice < question.options.length - 1 }));
        }
      }
    }
  }
  body.push(paragraph('Cevap Anahtarı', 'Heading1', { keepNext: true, pageBreak: true }));
  for (const set of sets) {
    body.push(paragraph(set.name, 'Heading2', { keepNext: true }));
    for (const topic of set.topics) {
      const answers = topic.questions.map((question, index) => (index + 1) + '.\u00a0' + answerLetters[question.correct]);
      body.push(paragraph([topic.name, ...answers].join('\u00a0·  '), 'AnswerKey'));
    }
  }
  body.push(paragraph('Cevap Açıklamaları', 'Heading1', { keepNext: true }));
  const hasExtraSets = sets.length > 1;
  const topicHeading = hasExtraSets ? 'Heading3' : 'Heading2';
  for (const set of sets) {
    if (hasExtraSets) body.push(paragraph(set.name, 'Heading2', { keepNext: true }));
    for (const topic of set.topics) {
      body.push(paragraph(topic.name, topicHeading, { keepNext: true }));
      for (const [index, question] of topic.questions.entries()) {
        body.push(paragraph((index + 1) + '. soru · ' + answerLetters[question.correct] + ' şıkkı', 'AnswerLabel', { keepNext: true }));
        body.push(paragraph(answerExplanation(question), 'AnswerExplanation'));
      }
    }
  }
  const document = '<w:document xmlns:w="' + word + '"><w:body>' + body.join('') +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="960" w:right="1080" w:bottom="960" w:left="1080" w:header="480" w:footer="480" w:gutter="0"/>' +
    '</w:sectPr></w:body></w:document>';

  const contentTypes = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>';
  const relationship = (type, target) => '<Relationships xmlns="' + packageRelations + '">' +
    '<Relationship Id="rId1" Type="' + office + '/' + type + '" Target="' + target + '"/></Relationships>';

  return packWord([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', relationship('officeDocument', 'word/document.xml')],
    ['word/document.xml', document],
    ['word/_rels/document.xml.rels', relationship('styles', 'styles.xml')],
    ['word/styles.xml', styles]
  ].map(([part, content]) => [part, Buffer.from(xml + content, 'utf8')]));
}
