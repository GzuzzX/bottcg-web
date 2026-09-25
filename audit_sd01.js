const fs = require('fs');
const cards = require('./cards.json');
const manual = fs.readFileSync('./card-scripts.js', 'utf8');
const auto = fs.readFileSync('./card-scripts-auto.js', 'utf8');
const allScripts = manual + '\n' + auto;

const sd01 = cards.filter(c => c.print && c.print.startsWith('SD01-'));
sd01.forEach(c => {
  const escapedPrint = c.print.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const scriptRegex = new RegExp("['\"]" + escapedPrint + "['\"]\\s*:\\s*\\{([\\s\\S]*?)\\}", 'm');
  const sMatch = allScripts.match(scriptRegex);
  let sCode = sMatch ? sMatch[1] : 'NO SCRIPT';
  if (sMatch) {
    const nextCard = sCode.indexOf('}, \n  "SD');
    if (nextCard > 0) sCode = sCode.substring(0, nextCard).trim();
  }
  console.log('PRINT:', c.print);
  console.log('TEXT :', c.mainEffect);
  console.log('CODE :', sCode);
  console.log('--------------------------');
});
