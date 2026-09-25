const fs = require('fs');
const cards = require('./cards.json');
const manual = fs.readFileSync('./card-scripts.js', 'utf8');
const auto = fs.readFileSync('./card-scripts-auto.js', 'utf8');

const allScripts = manual + '\n' + auto;

let matchCount = 0;
cards.forEach(c => {
  if (!c.print) return;
  const escapedPrint = c.print.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const scriptRegex = new RegExp("['\"]" + escapedPrint + "['\"]\\s*:\\s*\\{([\\s\\S]*?)\\}", 'm');
  const sMatch = allScripts.match(scriptRegex);
  if (sMatch) matchCount++;
});
console.log('Total scripts matched:', matchCount);
