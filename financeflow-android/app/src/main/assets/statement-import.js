(function(root){
  'use strict';
  const norm=v=>String(v??'').trim().replace(/\s+/g,' ').toLowerCase();
  const aliases={date:/^(date|transaction date|trans date|posting date|value date)$/,description:/^(description|narration|details|particulars|remarks|transaction description)$/,debit:/^(debit|debit amount|withdrawal|withdrawals|dr|outflow)$/,credit:/^(credit|credit amount|deposit|deposits|cr|inflow)$/,amount:/^(amount|transaction amount|value)$/,type:/^(type|transaction type|direction|dr\/cr|debit\/credit)$/,reference:/^(reference|ref|transaction reference|transaction id|session id)$/,currency:/^(currency|currency code)$/};
  function parse(text){
    text=String(text).replace(/^\uFEFF/,'');
    const lines=text.split(/\r?\n/).slice(0,30);
    let first=lines.find(l=>/date/i.test(l)&&/amount|debit|credit/i.test(l))||lines.reduce((a,b)=>b.length>a.length?b:a,'');
    const count=sep=>{let quoted=false,n=0;for(let i=0;i<first.length;i++){if(first[i]==='"'){if(quoted&&first[i+1]==='"')i++;else quoted=!quoted;}else if(!quoted&&first[i]===sep)n++;}return n;};
    const sep=['\t',';',','].sort((a,b)=>count(b)-count(a))[0];
    const rows=[];let row=[],cell='',quoted=false,closed=false;
    const push=()=>{row.push(cell.trim());cell='';closed=false;};
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;}
      else if(ch==='"'&&!cell.trim()&&!closed){quoted=true;cell='';}
      else if(ch===sep){push();}
      else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;push();if(row.some(v=>v))rows.push(row);row=[];}
      else if(closed&&!/\s/.test(ch))throw new Error('Unexpected text after a quoted CSV field.');
      else cell+=ch;
    }
    if(quoted)throw new Error('Unclosed quoted field in statement.');
    push();if(row.some(v=>v))rows.push(row);
    if(rows.length<2)throw new Error('Statement needs a header and transaction rows.');
    return rows;
  }
  function mapping(header){const m={};Object.entries(aliases).forEach(([k,re])=>m[k]=header.findIndex(v=>re.test(norm(v).replace(/[_-]/g,' '))));return m;}
  function headerRow(rows){const i=rows.findIndex(r=>{const m=mapping(r);return m.date>=0&&(m.amount>=0||m.debit>=0||m.credit>=0);});return i<0?0:i;}
  function money(value){
    let v=String(value??'').trim();if(!v||v==='-')return 0;
    v=v.replace(/^(NGN|USD|EUR|GBP|₦|\$|€|£)\s*/i,'').trim();
    let sign=1;if(/^\(.*\)$/.test(v)){sign=-1;v=v.slice(1,-1);}
    if(!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(v))throw new Error('Invalid amount: '+value);
    const n=Number(v.replace(/,/g,''))*sign;if(!Number.isFinite(n))throw new Error('Invalid amount');return n;
  }
  function direction(v){v=norm(v);if(/^(income|credit|cr|c|deposit|inflow)$/.test(v))return 'income';if(/^(expense|debit|dr|d|withdrawal|outflow)$/.test(v))return 'expense';return null;}
  function signature(t){return [t.accountId,t.date,t.type,Number(t.amount).toFixed(2),t.externalReference?'ref:'+norm(t.externalReference):'desc:'+norm(t.description)].join('|');}
  function possible(t,existing){
    if(existing.some(x=>{
      if(x.date!==t.date)return false;
      if(x.type==='transfer')return t.type==='expense'?x.fromAccountId===t.accountId&&Number(x.amount)===Number(t.amount):x.toAccountId===t.accountId&&Number(x.receivedAmount??x.amount)===Number(t.amount);
      return x.type===t.type&&x.accountId===t.accountId&&Number(x.amount)===Number(t.amount);
    }))return true;
    const splits=new Map();existing.filter(x=>x.splitGroupId&&x.date===t.date&&x.type===t.type&&x.accountId===t.accountId).forEach(x=>splits.set(x.splitGroupId,(splits.get(x.splitGroupId)||0)+Number(x.amount)));
    return [...splits.values()].some(n=>Math.round(n*100)===Math.round(Number(t.amount)*100));
  }
  function review(rows,m,opt,existing){
    if(m.date<0||m.description<0||(!(m.debit>=0||m.credit>=0)&&m.amount<0))throw new Error('Map Date, Description, and Debit/Credit or Amount.');
    const used=Object.values(m).filter(i=>i>=0);if(new Set(used).size!==used.length)throw new Error('A column cannot be mapped to more than one field.');
    const counts=new Map();existing.forEach(t=>{const keys=new Set([signature(t),...(t.statementMatches||[]).map(m=>m.key)]);keys.forEach(key=>counts.set(key,(counts.get(key)||0)+1));});
    const inFile=new Map(),result=[];
    const val=(row,k)=>m[k]>=0?row[m[k]]||'':'';
    rows.slice(opt.header+1).forEach((row,i)=>{
      const item={row:i+opt.header+2,selected:false};
      try{
        if(row.length!==rows[opt.header].length)throw new Error('Column count does not match the header.');
        const description=val(row,'description').trim();if(!description)throw new Error('Missing description.');
        if(/^(opening balance|closing balance|balance brought forward|balance carried forward|total|totals)$/i.test(description))throw new Error('Summary/balance row — not a transaction.');
        const date=opt.parseDate(val(row,'date'));if(!date)throw new Error('Invalid or missing date.');
        const cur=val(row,'currency').toUpperCase();if(cur&&cur!==opt.currency)throw new Error('Currency differs from selected account.');
        let amount,type;
        if(m.debit>=0||m.credit>=0){const dr=money(val(row,'debit')),cr=money(val(row,'credit'));if(dr<0||cr<0)throw new Error('Debit/Credit values must be positive.');if(dr>0&&cr>0)throw new Error('Both Debit and Credit have amounts.');if(!dr&&!cr)throw new Error('No transaction amount.');amount=dr||cr;type=cr?'income':'expense';}
        else{
          const n=money(val(row,'amount'));if(!n)throw new Error('No transaction amount.');
          type=direction(val(row,'type'));
          if(!type){if(opt.polarity==='positive-income')type=n>0?'income':'expense';else if(opt.polarity==='positive-expense')type=n>0?'expense':'income';else throw new Error('Choose direction/sign convention or map a Type column.');}
          amount=Math.abs(n);
        }
        const t={date,description,amount,type,accountId:opt.accountId,externalReference:val(row,'reference').trim(),source:'Upload'};
        const key=signature(t),ordinal=(inFile.get(key)||0)+1;inFile.set(key,ordinal);
        item.tx=t;item.key=key;item.ordinal=ordinal;
        item.duplicate=ordinal<=(counts.get(key)||0);
        item.possibleDuplicate=!item.duplicate&&possible(t,existing);
        item.selected=!item.duplicate&&!item.possibleDuplicate;
      }catch(e){item.error=e.message;}
      result.push(item);
    });
    return result;
  }
  const api={parse,mapping,headerRow,money,direction,signature,possible,review};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;root.StatementImport=api;
})(typeof globalThis!=='undefined'?globalThis:this);
