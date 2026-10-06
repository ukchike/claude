const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../financeflow-android/app/src/main/assets/finance-core.js');
function app(rendering=false){
  const html=fs.readFileSync('financeflow-android/app/src/main/assets/index.html','utf8');
  const source=html.match(/<script>([\s\S]*?)<\/script>/)[1].split('\nload();')[0];
  const storage=new Map(),elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:"",style:{},value:"",remove(){},focus(){},setSelectionRange(){},insertAdjacentHTML(position,html){this.innerHTML=html+this.innerHTML;}});return elements.get(id);};
  const context=vm.createContext({FinanceCore:core,console,Date,Intl,Set,Math,JSON,
    window:{},document:{addEventListener(){},getElementById:element},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    alert(){},confirm:()=>true,prompt:(message,value)=>value,setTimeout:()=>0,clearTimeout(){}});
  vm.runInContext(source,context);
  vm.runInContext('save=()=>{};showToast=()=>{};checkBudgetAlerts=()=>{};applyTheme=()=>{};',context);
  if(!rendering)vm.runInContext('render=()=>{};',context);
  return code=>vm.runInContext(code,context);
}
test('strict dates, leap years and anchored month-end/yearly recurrence',()=>{
  assert.equal(core.date('2026-02-31'),null);
  assert.equal(core.date('2025-02-29'),null);
  assert.ok(core.date('2024-02-29'));
  assert.equal(core.nextDue('2026-01-31','monthly'),'2026-02-28');
  assert.equal(core.nextDue('2026-02-28','monthly','2026-01-31'),'2026-03-31');
  assert.equal(core.nextDue('2024-02-29','yearly'),'2025-02-28');
  assert.equal(core.nextDue('2027-02-28','yearly','2024-02-29'),'2028-02-29');
  assert.equal(core.nextDue('2026-12-31','daily'),'2027-01-01');
  assert.equal(core.nextDue('2026-01-01','invalid'),null);
});
test('mixed currencies convert, missing/stale rates are excluded, transfer guard',()=>{
  const accounts=[{id:'n',currency:'NGN'},{id:'u',currency:'USD',fxRate:1500,fxBase:'NGN'},{id:'x',currency:'EUR'}];
  assert.equal(core.amount({accountId:'n',amount:50000},accounts,'NGN')+core.amount({accountId:'u',amount:100},accounts,'NGN'),200000);
  assert.equal(core.amount({accountId:'x',amount:100},accounts,'NGN'),null);
  assert.equal(core.amount({accountId:'u',amount:100},accounts,'GBP'),null);
  assert.equal(core.sameCurrency('n','u',accounts,'NGN'),false);
  assert.equal(core.sameCurrency('n','missing',accounts,'NGN'),false);
});
test('actual application reports, budgets, balances and category charts share conversion',()=>{
  const run=app();
  run(`accounts=[{id:'n',currency:'NGN'},{id:'u',currency:'USD',fxRate:1500}];
    txns=[{id:'1',accountId:'n',date:'2026-01-10',type:'expense',category:'Food',amount:50000},
          {id:'2',accountId:'u',date:'2026-01-11',type:'expense',category:'Food',amount:100}];`);
  assert.equal(run(`getSpent('month',new Date(2026,0,1),'Food')`),200000);
  assert.equal(run(`getCatMap('month',new Date(2026,0,1),'expense').cat.Food`),200000);
  assert.equal(run(`getAccountBalance('u')`),-100);
  assert.equal(run(`acctPrimaryEquiv(accounts[1])`),-150000);
  assert.equal(run(`fmtTxn(txns[1]).startsWith('$')`),true);
  assert.equal(run(`parseFlexibleDate('31/02/2026')`),null);
  assert.equal(run(`toLocalISODate(parseFlexibleDate('04/07/2026'))`),'2026-07-04');
});
test('same-currency transfers conserve money and cent rounding avoids drift',()=>{
  const run=app();
  run(`accounts=[{id:'a',currency:'NGN'},{id:'b',currency:'NGN'}];txns=[
    {accountId:'a',type:'income',amount:0.1},{accountId:'a',type:'income',amount:0.2},
    {type:'transfer',fromAccountId:'a',toAccountId:'b',amount:0.2}];`);
  assert.equal(run(`getAccountBalance('a')`),0.1);
  assert.equal(run(`getAccountBalance('b')`),0.2);
  assert.equal(run(`FinanceCore.round(getAccountBalance('a')+getAccountBalance('b'))`),0.3);
});
test('pending recurring entries do not post, repeated processing is idempotent, pay/skip settle once',()=>{
  const run=app();
  const today=new Date();
  run(`accounts=[{id:'a',currency:'NGN'}];recurring=[{id:'r',accountId:'a',amount:100,type:'expense',category:'Food',frequency:'monthly',nextDue:'${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01',active:true}];processRecurring();`);
  assert.equal(run('txns.length'),0);
  assert.equal(run('getAccountBalance("a")'),0);
  assert.equal(run('scheduledPayments.length'),1);
  run('processRecurring();');assert.equal(run('scheduledPayments.length'),1);
  run('settleScheduled(scheduledPayments[0].id,false);');
  assert.equal(run('txns.length'),1);assert.equal(run('getAccountBalance("a")'),-100);
  run('settleScheduled(scheduledPayments[0].id,false);processRecurring();');assert.equal(run('txns.length'),1);
  run(`scheduledPayments=[];txns=[];recurring[0].nextDue='2026-01-01';processRecurring();settleScheduled(scheduledPayments[0].id,true);`);
  assert.equal(run('txns.length'),0);
  assert.equal(run('scheduledPayments[0].status'),'skipped');
});
test('invalid schedule cannot loop and missing accounts do not generate postings',()=>{
  assert.equal(core.occurrences({active:true,id:'x',nextDue:'bad',amount:10},'2026-10-01',[]).length,0);
  const run=app();run(`recurring=[{active:true,id:'x',accountId:'missing',nextDue:'2026-01-01',amount:10,frequency:'monthly'}];processRecurring();`);
  assert.equal(run('scheduledPayments.length'),0);
});
test('cumulative budget carry includes overspend and zero remaining limit',()=>{
  const run=app();run(`accounts=[{id:'a',currency:'NGN'}];txns=[{accountId:'a',date:'2026-01-10',type:'expense',category:'Food',amount:60},{accountId:'a',date:'2026-02-10',type:'expense',category:'Food',amount:80}];
    budgets=[{cat:'Food',limit:100,rollover:true,rolloverStart:'2026-01-01',rolloverPeriod:'month'}];`);
  assert.equal(run(`budgetEffLimit(budgets[0],'month',new Date(2026,2,1))`),160);
  run(`txns[0].amount=350;`);
  assert.equal(run(`budgetEffLimit(budgets[0],'month',new Date(2026,1,1))`),0);
  assert.equal(run(`budgetEffLimit(budgets[0],'month',new Date(2026,2,1))`),0);
});
test('pending occurrences survive save/load without modifying legacy recorded payments',()=>{
  const run=app();run(`scheduledPayments=[{id:'p',status:'pending',date:'2026-01-01'}];txns=[{id:'legacy',source:'Recurring',amount:100}];
    localStorage.setItem('ffd_scheduled',JSON.stringify(scheduledPayments));localStorage.setItem('ffd_tx',JSON.stringify(txns));scheduledPayments=[];txns=[];load();`);
  assert.equal(run('scheduledPayments[0].id'),'p');assert.equal(run('txns[0].id'),'legacy');
});

test('financial views render without NaN and recurring actions are exposed',()=>{
  const run=app(true);run(`onboardComplete=true;profile={name:'Test'};accounts=[{id:'n',currency:'NGN',name:'Naira',color:'#22c55e'}];
    txns=[{id:'t',accountId:'n',date:toLocalISODate(new Date()),type:'expense',category:'Food',amount:150}];
    budgets=[{id:'b',cat:'Food',limit:100,subs:[],rollover:true,rolloverStart:'2026-01-01',rolloverPeriod:'month'}];`);
  for(const view of ['dashboard','stats','budgets','transactions']){
    run(`V='${view}';render();`);
    assert.equal(run(`$("main").innerHTML.includes('NaN')`),false);
  }
  run(`recurring=[{id:'r',accountId:'n',amount:10,type:'income',category:'Salary',frequency:'monthly',nextDue:toLocalISODate(new Date()),active:true}];settingsOpen=true;settingsTab='recurring';render();`);
  assert.equal(run(`$("settingsPanel").innerHTML.includes('Mark received')`),true);
});
