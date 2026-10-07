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
function app({accept=true,promptValue=null}={}){
  const source=fs.readFileSync('financeflow-android/app/src/main/assets/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1].split('\nload();')[0];
  const elements=new Map(),alerts=[];
  const el=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',style:{},textContent:'',insertAdjacentHTML(){},remove(){}});return elements.get(id);};
  const storage=new Map();
  const localStorage={get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
  const ctx=vm.createContext({crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,prompt:()=>promptValue,localStorage,FinanceCore:core,StatementImport:S,window:{},document:{addEventListener(){},getElementById:el},console,Date,Math,Set,Intl,JSON,alert:m=>alerts.push(m),confirm:()=>accept,setTimeout:()=>0,clearTimeout(){}});
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
test('description suggestions recognise expenses and income without changing direction',()=>{
  const run=app();
  for(const [description,type,category,subcategory] of [
    ['IKEJA ELECTRIC payment','expense','Housing','Electricity'],
    ['MTN DATA BUNDLE','expense','Communication','Data'],
    ['SMS CHARGE','expense','Finance','Bank Charges'],
    ['ICAN exam fee','expense','Education','Exams'],
    ['Salary October','income','Salary','Primary Job'],
    ['Dividend payment','income','Investment','Dividends']]){
    const t=run(`suggestStatementCategory(${JSON.stringify({description,type,amount:100})})`);
    assert.equal(t.category,category);assert.equal(t.subcategory,subcategory);assert.equal(t.type,type);
  }
  assert.equal(run(`suggestStatementCategory({description:'Salary reversal',type:'expense'}).category`),'Other');
  assert.equal(run(`suggestStatementCategory({description:'POS transfer to somebody',type:'expense'}).category`),'Other');
  assert.equal(run(`suggestStatementCategory({description:'Shoprite fuel',type:'expense'}).category`),'Other');
  assert.equal(run(`suggestStatementCategory({description:'BOLTEX chargeback',type:'expense'}).category`),'Other');
});
test('previous description classifications support custom categories and flag conflicts',()=>{
  const run=app();run(`userEC={'Professional Costs':['Membership']};txns=[{description:'ABC Membership REF: 1234',type:'expense',category:'Professional Costs',subcategory:'Membership'}];`);
  assert.equal(run(`suggestStatementCategory({description:'ABC Membership ref: 5678',type:'expense'}).category`),'Professional Costs');
  run(`txns.push({description:'ABC Membership',type:'expense',category:'Education',subcategory:'Training'});`);
  assert.equal(run(`suggestStatementCategory({description:'ABC Membership',type:'expense'}).category`),'Other');
  run(`hiddenDefaultCats.expense=['Transportation'];txns=[];`);
  assert.equal(run(`suggestStatementCategory({description:'Uber ride',type:'expense'}).category`),'Other');
});
test('review category overrides survive recalculation and persist only on imported rows',()=>{
  const run=app();run(`accounts=[{id:'a',currency:'NGN'}];window._uploadAcc='a';
    const rows=StatementImport.parse('Date,Description,Debit,Credit\\n2026-01-01,Unknown supplier,100,');
    statementReview={rows,header:0,mapping:StatementImport.mapping(rows[0]),name:'bank.csv',dateOrder:'dmy',polarity:'explicit',review:[]};reviewStatement();
    setStatementCategory(0,'Education');setStatementSubcategory(0,'Training');reviewStatement();`);
  assert.equal(run('statementReview.review[0].tx.subcategory'),'Training');
  run(`setStatementCategory(0,'Made up');setStatementSubcategory(0,'Made up');addPend();`);
  assert.equal(run('txns[0].category'),'Education');assert.equal(run('txns[0].subcategory'),'Training');
  assert.equal(run('Object.hasOwn(txns[0],"categoryReason")'),false);
  assert.equal(run(`suggestStatementCategory({description:'Unknown supplier',type:'expense'}).category`),'Education');
});

test('backup validator rejects corrupt financial data before changing live records',()=>{
  const run=app();run(`accounts=[{id:'a',name:'Bank',currency:'NGN'}];txns=[{id:'t',accountId:'a',amount:100,date:'2026-01-01',type:'expense',category:'Other'}];`);
  assert.equal(run('validateBackupData(backupData()).txns.length'),1);
  for(const mutation of ["d.txns={}","d.txns[0].amount=-1","d.txns[0].date='2026-02-31'","d.txns[0].accountId='missing'","d.accounts.push({...d.accounts[0]})","d.version=99","d.userEC={Custom:'broken'}"]){
    assert.throws(()=>run(`{const d=JSON.parse(JSON.stringify(backupData()));${mutation};validateBackupData(d);}`));
    assert.equal(run('txns[0].amount'),100);
  }
  assert.throws(()=>run(`validateBackupData(JSON.parse('{"txns":[],"accounts":[{"id":"a","name":"Bank"}],"__proto__":{}}'))`));
});
test('backup restore cancellation and invalid files leave existing records intact',async()=>{
  const run=app({accept:false});run(`txns=[{id:'old',amount:50}];`);
  await run(`importData({size:100,text:async()=>JSON.stringify({version:3,txns:[],accounts:[{id:'a',name:'Bank'}]})})`);
  assert.equal(run('txns[0].id'),'old');assert.equal(run('backupRestoreBusy'),false);
  await run(`importData({size:100,text:async()=>'{bad json'})`);
  assert.equal(run('txns[0].id'),'old');
});
test('failed restore rolls back memory and storage, preserving device lock settings',async()=>{
  const run=app();run(`accounts=[{id:'a',name:'Bank',currency:'NGN'}];txns=[{id:'old',amount:50,accountId:'a',type:'expense',date:'2026-01-01',category:'Other'}];pinHash='device-pin';biometricEnabled=true;
    localStorage.setItem('ffd_tx','original-storage');localStorage.setItem('ffd_pin','device-pin');
    applyTheme=()=>{};processRecurring=()=>{};save=()=>{localStorage.setItem('ffd_tx','partial');localStorage.setItem('ffd_new','partial');throw Error('Storage full');};`);
  await run(`importData({size:100,text:async()=>JSON.stringify({version:3,txns:[],accounts:[{id:'b',name:'Restored Bank'}]})})`);
  assert.equal(run('txns[0].id'),'old');assert.equal(run('accounts[0].id'),'a');
  assert.equal(run("localStorage.getItem('ffd_tx')"),'original-storage');assert.equal(run("localStorage.getItem('ffd_new')"),null);
  assert.equal(run('pinHash'),'device-pin');assert.equal(run('biometricEnabled'),true);
});
test('valid older backup restores without transferring PIN or biometrics',async()=>{
  const run=app();run(`pinHash='device-pin';biometricEnabled=true;applyTheme=()=>{};processRecurring=()=>{};`);
  await run(`importData({size:100,text:async()=>JSON.stringify({version:2,txns:[{id:'new',amount:75,date:'2026-01-01',type:'income',accountId:'b',category:'Other'}],accounts:[{id:'b',name:'Bank'}],pinHash:'foreign-pin',biometricEnabled:false})})`);
  assert.equal(run('txns[0].id'),'new');assert.equal(run('getAccountBalance("b")'),75);assert.equal(run('pinHash'),'device-pin');assert.equal(run('biometricEnabled'),true);
});

test('backup roundtrip retains pending, paid and skipped recurring occurrence history',()=>{
  const run=app();run(`accounts=[{id:'a',name:'Bank',currency:'NGN'}];scheduledPayments=['pending','paid','skipped'].map((status,i)=>({id:'p'+i,accountId:'a',type:'expense',amount:100,date:'2026-01-01',status}));`);
  assert.equal(run('validateBackupData(backupData()).scheduledPayments.length'),3);
});
test('account deletion protects transactions, transfer endpoints and all payment/import history',()=>{
  for(const setup of [
    "txns=[{type:'expense',accountId:'a'}]",
    "txns=[{type:'transfer',fromAccountId:'a',toAccountId:'b'}]",
    "txns=[{type:'transfer',fromAccountId:'b',toAccountId:'a'}]",
    "recurring=[{accountId:'a',active:false}]",
    "scheduledPayments=[{accountId:'a',status:'paid'}]",
    "scheduledPayments=[{accountId:'a',status:'skipped'}]",
    "importHistory=[{accountId:'a'}]"
  ]){const run=app();run(`accounts=[{id:'a',name:'A'},{id:'b',name:'B'}];${setup};deleteAccount('a');`);assert.equal(run('accounts.length'),2);}
});
test('empty account deletion confirms, keeps a final account and supports undo',()=>{
  const cancel=app({accept:false});cancel(`accounts=[{id:'a',name:'A'},{id:'b',name:'B'}];deleteAccount('a');`);assert.equal(cancel('accounts.length'),2);
  const run=app();run(`accounts=[{id:'a',name:'A'},{id:'b',name:'B'}];deleteAccount('a');`);assert.equal(run('accounts.length'),1);
  run(`deleteAccount('b');`);assert.equal(run('accounts.length'),1);
  run('window.testUndo();');assert.equal(run('accounts.length'),2);assert.equal(run('accounts[0].id'),'a');
});
test('navigation identifies current page and recommended layout keeps financial cards first',()=>{
  const run=app();run(`V='transactions';renderNav();`);
  assert.ok(run(`$('bnav').innerHTML`).includes('aria-label="Transactions" aria-current="page"'));
  run(`homeLayout=['recent','balance'];hiddenHomeSections=['budget'];restoreDefaultHome();`);
  assert.equal(run('homeLayout.slice(0,5).join(",")'),'balance,accounts,stats,budget,recent');
  assert.equal(run('showNetworthChartHome'),false);assert.equal(run('hiddenHomeSections.join(",")'),'trend');
});

test('legacy PIN upgrades after correct entry and salted hashes differ for the same PIN',async()=>{
  const run=app();await run(`(async()=>{pinHash=await sha256Hex('1234');$('pinInput').value='1234';pinLockActive=true;await verifyPin();})()`);
  assert.ok(run('pinHash').startsWith('v2$'));assert.equal(run('pinLockActive'),false);
  assert.equal(await run(`matchesPin('1234')`),true);assert.equal(await run(`matchesPin('9999')`),false);
  const first=await run(`encodedPin('1234')`),second=await run(`encodedPin('1234')`);assert.notEqual(first,second);
});
test('PIN failures persist and enforce cooldown while successful entry clears attempts',async()=>{
  const run=app();await run(`(async()=>{pinHash=await encodedPin('1234');pinLockActive=true;for(let i=0;i<5;i++){$('pinInput').value='0000';await verifyPin();}})()`);
  assert.ok(run('pinWaitMessage()'));assert.equal(run('pinLockActive'),true);
  await run(`(async()=>{$('pinInput').value='1234';await verifyPin();})()`);assert.equal(run('pinLockActive'),true);
  run(`localStorage.setItem('ffd_pin_attempts',JSON.stringify({failures:5,until:0}));`);
  await run('verifyPin()');assert.equal(run('pinLockActive'),false);assert.equal(run('pinAttemptState().failures'),0);
});
test('changing or removing an existing PIN requires the current PIN',async()=>{
  const wrong=app({promptValue:'9999'});await wrong(`(async()=>{pinHash=await encodedPin('1234');$('newPinInput').value='5678';$('newPinConfirm').value='5678';await setPin();await removePin();})()`);
  assert.equal(await wrong(`matchesPin('1234')`),true);
  const correct=app({promptValue:'1234'});await correct(`(async()=>{pinHash=await encodedPin('1234');$('newPinInput').value='5678';$('newPinConfirm').value='5678';await setPin();})()`);
  assert.equal(await correct(`matchesPin('5678')`),true);
});
test('missing native authentication cannot dismiss the app lock',()=>{
  const run=app();run('pinLockActive=true;triggerAuth();');assert.equal(run('pinLockActive'),true);
});
test('encrypted backups roundtrip, randomise ciphertext and reject wrong passwords or tampering',async()=>{
  const run=app();const payload={version:3,accounts:[{id:'a',name:'Bank'}],txns:[]};
  const a=await run(`encryptBackup(${JSON.stringify(payload)},'private-password')`),b=await run(`encryptBackup(${JSON.stringify(payload)},'private-password')`);
  assert.notEqual(a.data,b.data);assert.ok(!JSON.stringify(a).includes('Bank'));
  assert.deepEqual(JSON.parse(JSON.stringify(await run(`decryptBackup(${JSON.stringify(a)},'private-password')`))),payload);
  await assert.rejects(run(`decryptBackup(${JSON.stringify(a)},'wrong-password')`));
  a.data=(a.data[0]==='0'?'1':'0')+a.data.slice(1);await assert.rejects(run(`decryptBackup(${JSON.stringify(a)},'private-password')`));
  await assert.rejects(run(`encryptBackup({},'short')`));
});
test('secure storage migration verifies copies and survives a partial write failure',()=>{
  const run=app();run(`window.vault=new Map();window.writes=0;window.fail=true;
    window.Android={supportsSecureStorage:()=>true,getSecureItem:k=>JSON.stringify({ok:true,found:window.vault.has(k),value:window.vault.get(k)}),setSecureItem:(k,v)=>{if(window.fail&&++window.writes===2)return false;window.vault.set(k,v);return true;},secureKeys:()=>JSON.stringify([...window.vault.keys()]),removeSecureItem:k=>window.vault.delete(k)};
    localStorage.setItem('ffd_tx','records');localStorage.setItem('ffd_pin','hash');`);
  assert.equal(run('prepareSecureStorage()'),false);assert.equal(run('localStorage.length'),2);assert.equal(run('secureStorageReady'),false);
  run('window.fail=false;');assert.equal(run('prepareSecureStorage()'),true);assert.equal(run('localStorage.length'),0);
  assert.equal(run("appStorage.getItem('ffd_tx')"),'records');assert.equal(run("appStorage.getItem('ffd_pin')"),'hash');
  run(`secureStorageReady=false;`);assert.equal(run('prepareSecureStorage()'),true);assert.equal(run("appStorage.getItem('ffd_tx')"),'records');
});
test('unreadable encrypted records stop startup without retiring legacy data',()=>{
  const run=app();run(`localStorage.setItem('ffd_tx','original');window.Android={supportsSecureStorage:()=>true,getSecureItem:()=>JSON.stringify({ok:false,error:'Key unavailable'}),secureKeys:()=>JSON.stringify(['ffd_tx'])};`);
  assert.equal(run('prepareSecureStorage()'),false);assert.equal(run("localStorage.getItem('ffd_tx')"),'original');assert.equal(run('secureStorageReady'),false);
});
test('encrypted restore with an incorrect password leaves records unchanged',async()=>{
  const run=app({promptValue:'wrong-password'});await run(`(async()=>{window.encrypted=await encryptBackup({version:3,txns:[],accounts:[{id:'b',name:'Bank'}]},'private-password');txns=[{id:'original'}];await importData({size:100,text:async()=>JSON.stringify(window.encrypted)});})()`);
  assert.equal(run('txns[0].id'),'original');
});
