const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
global.window = global;
require(path.join(root, 'site/data.js'));
require(path.join(root, 'site/course-data.js'));
require(path.join(root, 'site/dersler/courses.js'));
const sets = global.PAYLASIM_COURSE_DATA;
const data = global.PaylasimCatalog.courses.map(([id, name]) => {
  const main = id === 'din-bilim-iliskisi'
    ? { topics: MUSKAM_DATA.topics, questions: [...MUSKAM_DATA.questions, ...sets[id].questions].sort((a,b) => Number(a.topic.split('-')[1])-Number(b.topic.split('-')[1]) || a.number-b.number) }
    : sets[id];
  if (!main) throw Error(`${name} için soru verisi bulunamadı.`);
  const extraSets = Object.values(sets).filter(set => set.parentCourse === id);
  return { id, name, sets: [
    { name: extraSets.length ? 'Ana sorular' : 'Haftalık sorular', topics: main.topics, questions: main.questions },
    ...extraSets.map(set => ({ name: 'Ek sorular', topics: set.topics, questions: set.questions }))
  ] };
});
fs.writeFileSync(path.join(process.argv[2], 'question-data.json'), JSON.stringify(data));
