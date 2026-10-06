const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const S=require('../financeflow-android/app/src/main/assets/statement-import.js');
const core=require('../financeflow-android/app/src/main/assets/finance-core.js');
const opts={header:0,accountId:'a',currency:'NGN',polarity:'explicit',parseDate:v=>core.date(v)?v:null};
function review(text,existing=[],extra={}){const rows=S.parse(text);return S.review(rows,S.mapping(rows[0]),{...opts,...extra},existing);}
test('CSV supports BOM, escaped quotes, multiline fields, semicolons and tab files',()=>{
  assert.deepEqual(S.parse('\uFEFFDate,Description,Debit\r\n2026-01-01,"Shop ""A""\nsecond line","15,000.00"'),[['Date','Description','Debit'],['2026-01-01','Shop "A"\nsecond line','15,000.00']]);
  assert.equal(S.parse('Date;Description;Amount\n2026-01-01;Shop;100')[0].length,3);
  assert.equal(S.parse('Date\tDescription\tAmount\n2026-01-01\tShop\t100')[0].length,3);
  assert.throws(()=>S.parse('Date,Description\n2026-01-01,"unclosed'));
});
test('preamble header detection and exact header aliases avoid Description as DR',()=>{
  const rows=S.parse('Statement for account\nPeriod 2026\nDate,Description,Debit,Credit\n2026-01-01,Shop,100,');
  assert.equal(S.headerRow(rows),2);
  const m=S.mapping(['Date','Description','Amount']);assert.equal(m.debit,-1);assert.equal(m.description,1);
});
test('debit/credit direction is authoritative; signed amounts need an explicit convention',()=>{
  const debit=review('Date,Description,Debit,Credit\n2026-01-01,Salary reversal,100,')[0];
  assert.equal(debit.tx.type,'expense');
  assert.equal(review('Date,Description,Amount\n2026-01-01,Shop,100')[0].tx,undefined);
  assert.equal(review('Date,Description,Amount\n2026-01-01,Shop,100',[],{polarity:'positive-expense'})[0].tx.type,'expense');
  assert.equal(review('Date,Description,Amount,Type\n2026-01-01,Shop,100,DR')[0].tx.type,'expense');
  assert.equal(review('Date,Description,Amount,Type\n2026-01-01,Salary,100,CR')[0].tx.type,'income');
});
test('invalid dates, amounts, currencies, summaries and conflicting directions remain unselected',()=>{
  const rows=review('Date,Description,Debit,Credit,Currency\n2026-02-31,Shop,100,,NGN\n2026-01-01,Shop,"15,00",,NGN\n2026-01-01,Shop,100,100,NGN\n2026-01-01,Shop,100,,USD\n2026-01-01,Opening balance,100,,NGN');
  assert.equal(rows.filter(r=>r.selected).length,0);assert.equal(rows.filter(r=>r.error).length,5);
  assert.equal(S.money('(1,000.50)'),-1000.5);
  assert.equal(S.money('NGN15000.00'),15000);
  assert.throws(()=>S.money('100abc'));assert.throws(()=>S.money('Infinity'));
});
test('reimports skip existing rows but preserve multiple identical genuine rows',()=>{
  const text='Date,Description,Debit,Credit\n2026-01-01,Shop,100,\n2026-01-01,Shop,100,';
  const first=review(text);assert.equal(first.filter(r=>r.selected).length,2);
  const second=review(text,first.map(r=>r.tx));assert.equal(second.filter(r=>r.selected).length,0);assert.equal(second.filter(r=>r.duplicate).length,2);
  const partial=review(text,[first[0].tx]);assert.equal(partial[0].duplicate,true);assert.equal(partial[1].duplicate,false);assert.equal(partial[1].possibleDuplicate,true);
});
test('reference matches tolerate description changes; another account does not collide',()=>{
  const existing={accountId:'a',date:'2026-01-01',amount:100,type:'expense',externalReference:'ref1',description:'Manual'};
  const text='Date,Description,Debit,Credit,Reference\n2026-01-01,New description,100,,REF1';
  assert.equal(review(text,[existing])[0].duplicate,true);
  assert.equal(review(text,[existing],{accountId:'b'})[0].selected,true);
});
test('possible matches include bank-alert/manual records, internal transfers and split totals',()=>{
  const t={accountId:'a',date:'2026-01-01',amount:100,type:'expense',description:'Statement merchant'};
  assert.ok(S.possible(t,[{...t,description:'Manual merchant'}]));
  assert.ok(S.possible(t,[{date:t.date,type:'transfer',fromAccountId:'a',toAccountId:'b',amount:100}]));
  assert.ok(S.possible(t,[{...t,amount:40,splitGroupId:'s'},{...t,amount:60,splitGroupId:'s'}]));
});
function app(){
  const source=fs.readFileSync('financeflow-android/app/src/main/assets/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1].split('\nload();')[0];
  const elements=new Map(),alerts=[];
  const el=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',style:{},textContent:'',insertAdjacentHTML(){},remove(){}});return elements.get(id);};
  const ctx=vm.createContext({FinanceCore:core,StatementImport:S,window:{},document:{addEventListener(){},getElementById:el},console,Date,Math,Set,Intl,JSON,alert:m=>alerts.push(m),confirm:()=>true,setTimeout:()=>0,clearTimeout(){}});
  vm.runInContext(source,ctx);vm.runInContext('save=()=>{};render=()=>{};showToast=()=>{};showUndoToast=(label,undo)=>{window.testUndo=undo;};',ctx);
  return code=>vm.runInContext(code,ctx);
}
test('application import confirmation, undo and repeat upload do not double balances',()=>{
  const run=app();run(`accounts=[{id:'a',name:'Bank',currency:'NGN'}];window._uploadAcc='a';
    const rows=StatementImport.parse('Date,Description,Debit,Credit\\n2026-01-01,Shop,100,');
    statementReview={rows,header:0,mapping:StatementImport.mapping(rows[0]),name:'bank.csv',dateOrder:'dmy',polarity:'explicit',review:[]};reviewStatement();addPend();`);
  assert.equal(run('txns.length'),1);assert.equal(run('getAccountBalance("a")'),-100);assert.equal(run('importHistory.length'),1);
  run(`statementReview={rows,header:0,mapping:StatementImport.mapping(rows[0]),name:'bank.csv',dateOrder:'dmy',polarity:'explicit',review:[]};reviewStatement();`);
  assert.equal(run('statementReview.review[0].selected'),false);
  run('window.testUndo();');assert.equal(run('txns.length'),0);assert.equal(run('importHistory.length'),0);
});
test('application date mapping and bank-alert account/type/currency guards',()=>{
  const run=app();run(`statementReview={dateOrder:'mdy'};accounts=[{id:'a',currency:'NGN',name:'Bank'},{id:'u',currency:'USD'}];`);
  assert.equal(run(`statementDate('07/04/2026')`),'2026-07-04');
  assert.equal(run(`statementDate('02/31/2026')`),null);
  run(`window._bankAlertId='alert';window._bankAlertMeta={};window._bankAccountConfirmed=false;window._bankTypeConfirmed=true;`);
  assert.equal(run(`validateBankAlertEntry({accountId:'a',amount:100,date:'2026-01-01',type:'expense'})`),false);
  run('window._bankAccountConfirmed=true;window._bankTypeConfirmed=false;');
  assert.equal(run(`validateBankAlertEntry({accountId:'a',amount:100,date:'2026-01-01',type:'expense'})`),false);
  run('window._bankTypeConfirmed=true;');
  assert.equal(run(`validateBankAlertEntry({accountId:'u',amount:100,date:'2026-01-01',type:'expense'})`),false);
  assert.equal(run(`validateBankAlertEntry({accountId:'a',amount:100,date:'2026-01-01',type:'expense'})`),true);
});
